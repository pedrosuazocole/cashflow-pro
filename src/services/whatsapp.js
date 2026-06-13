// src/services/whatsapp.js
'use strict';

const axios = require('axios');
const db    = require('../database');

// SQL para consultar un cuadre calculando siempre desde componentes
const SQL_CUADRE = `
  SELECT *,
    (venta_super + venta_regular + venta_diesel) as ingresos_pista_calc,
    (venta_exenta + venta_gravada_15 + isv_15 + venta_gravada_18 + isv_18) as ingresos_tienda_calc,
    (venta_super + venta_regular + venta_diesel +
     venta_exenta + venta_gravada_15 + isv_15 + venta_gravada_18 + isv_18 +
     cobros_tienda + anticipos_clientes + nc_descuentos_cred + total_alquileres) as total_ingresos_calc
  FROM cuadres_diarios
`;

// Obtener cuadre de hoy calculando valores correctos
function getCuadreHoy(empresaId, fecha) {
  return db.prepare(SQL_CUADRE + ' WHERE empresa_id=? AND fecha=? ORDER BY id DESC LIMIT 1')
    .get(empresaId, fecha);
}

// Helpers
const fmt = n => `L ${(parseFloat(n)||0).toLocaleString('es-HN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const dmy = s => { if (!s) return '-'; const [y,m,d] = s.split('-'); return `${d}/${m}/${y}`; };
const n   = v => parseFloat(v) || 0;

async function enviarMensaje(apiKey, telefono, mensaje, fileUrl) {
  const numero = telefono.replace(/[^0-9]/g, '');
  try {
    const params = { recipient: numero, apikey: apiKey, text: mensaje };
    if (fileUrl) params.file = fileUrl;
    const resp = await axios.get('https://api.textmebot.com/send.php', { params, timeout: 15000 });
    const ok = String(resp.data).toLowerCase().includes('success') || String(resp.data).includes('200');
    return { ok, respuesta: String(resp.data).trim() };
  } catch (err) {
    return { ok: false, respuesta: err.message };
  }
}

function registrarLog(empresaId, contactoId, tipo, mensaje, estado, respuesta) {
  try {
    db.prepare('INSERT INTO notif_log (empresa_id,contacto_id,tipo,mensaje,estado,respuesta) VALUES (?,?,?,?,?,?)')
      .run(empresaId, contactoId || null, tipo, mensaje, estado, respuesta);
  } catch (e) { console.error('[WhatsApp Log]', e.message); }
}

async function enviarAEmpresa(empresaId, tipo, mensaje, fileUrls) {
  const cfg = db.prepare('SELECT * FROM notif_config WHERE empresa_id=?').get(empresaId);
  if (!cfg || !cfg.textmebot_key || !cfg.activo) return;
  const contactos = db.prepare('SELECT * FROM notif_contactos WHERE empresa_id=? AND activo=1').all(empresaId);
  if (!contactos.length) return;
  for (const c of contactos) {
    const { ok, respuesta } = await enviarMensaje(cfg.textmebot_key, c.telefono, mensaje);
    registrarLog(empresaId, c.id, tipo, mensaje, ok ? 'enviado' : 'error', respuesta);
    console.log(`[WhatsApp] ${ok?'✅':'❌'} ${c.nombre}: ${respuesta}`);
    await new Promise(r => setTimeout(r, 3000));
    if (fileUrls && fileUrls.length > 0) {
      for (const url of fileUrls) {
        await new Promise(r => setTimeout(r, 3000));
        const r2 = await enviarMensaje(cfg.textmebot_key, c.telefono, 'Comprobante depósito', url);
        registrarLog(empresaId, c.id, tipo+'_img', url, r2.ok?'enviado':'error', r2.respuesta);
      }
    }
  }
}

function mensajeCuadre(empresa, cuadre) {
  // Usar siempre los valores calculados desde componentes
  const pista   = n(cuadre.ingresos_pista_calc)  || (n(cuadre.venta_super) + n(cuadre.venta_regular) + n(cuadre.venta_diesel));
  const isv15   = n(cuadre.isv_15) || n(cuadre.venta_gravada_15) * 0.15;
  const isv18   = n(cuadre.isv_18) || n(cuadre.venta_gravada_18) * 0.18;
  const tienda  = n(cuadre.ingresos_tienda_calc) || (n(cuadre.venta_exenta) + n(cuadre.venta_gravada_15) + isv15 + n(cuadre.venta_gravada_18) + isv18);
  const cobros  = n(cuadre.cobros_tienda);
  const anticipos = n(cuadre.anticipos_clientes);
  const nc      = n(cuadre.nc_descuentos_cred);
  const alq     = n(cuadre.total_alquileres);
  const total   = n(cuadre.total_ingresos_calc)  || (pista + tienda + cobros + anticipos + nc + alq);
  const noEf    = n(cuadre.total_no_efectivo);
  const efDisp  = n(cuadre.efectivo_disponible) || (total - noEf);
  const deposit = n(cuadre.total_depositos);
  const sobrante= n(cuadre.sobrante);
  const faltante= n(cuadre.faltante);

  const estado = sobrante > 0 ? `✅ SOBRANTE: ${fmt(sobrante)}`
               : faltante > 0 ? `❌ FALTANTE: ${fmt(faltante)}`
               : `✅ CUADRADO`;

  // Link de imágenes si existen
  let linkImg = '';
  if (cuadre.imagenes_deposito) {
    const base = process.env.RAILWAY_PUBLIC_DOMAIN
      ? 'https://' + process.env.RAILWAY_PUBLIC_DOMAIN
      : (process.env.APP_URL || '');
    if (base) {
      linkImg = '\n\n📎 Comprobantes:\n'
        + cuadre.imagenes_deposito.split(',').map(f => base + '/uploads/' + f.trim()).join('\n');
    }
  }

  return `🏪 *CashFlow Pro — Cuadre Diario*
🏢 ${empresa.nombre}
📅 Fecha: ${dmy(cuadre.fecha)}

💰 *INGRESOS*
⛽ Pista:      ${fmt(pista)}
   Super:     ${fmt(n(cuadre.venta_super))}
   Regular:   ${fmt(n(cuadre.venta_regular))}
   Diesel:    ${fmt(n(cuadre.venta_diesel))}
🛒 Tienda:     ${fmt(tienda)}
   Exenta:    ${fmt(n(cuadre.venta_exenta))}
   Grav 15%:  ${fmt(n(cuadre.venta_gravada_15))} + ISV ${fmt(isv15)}
   Grav 18%:  ${fmt(n(cuadre.venta_gravada_18))} + ISV ${fmt(isv18)}
${cobros > 0 ? `💵 Cobros Pista: ${fmt(cobros)}\n` : ''}${alq > 0 ? `🏠 Alquiler: ${fmt(alq)}\n` : ''}📊 *TOTAL: ${fmt(total)}*

🚫 No Efectivo:    ${fmt(noEf)}
💵 Efectivo Disp:  ${fmt(efDisp)}
🏦 Depositado:     ${fmt(deposit)}

${estado}${linkImg}

_Enviado por CashFlow Pro_`;
}

function mensajeLibroVentas(empresa, datos, mes) {
  const [anio, m] = mes.split('-');
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                 'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  // Calcular tienda desde componentes
  const tienda = n(datos.total_exenta) + n(datos.total_grav15) + n(datos.total_isv15)
               + n(datos.total_grav18) + n(datos.total_isv18);
  const total  = n(datos.total_pista) + tienda + n(datos.total_cobros);
  return `📋 *CashFlow Pro — Libro de Ventas*
🏢 ${empresa.nombre}
📅 ${meses[parseInt(m)-1]} ${anio}

📦 Registros: ${datos.total_dias} día(s)
⛽ Pista:      ${fmt(datos.total_pista)}
🛒 Tienda:     ${fmt(tienda)}
   Exenta:    ${fmt(datos.total_exenta)}
   Grav 15%:  ${fmt(datos.total_grav15)}
   ISV 15%:   ${fmt(datos.total_isv15)}
   Grav 18%:  ${fmt(datos.total_grav18)}
   ISV 18%:   ${fmt(datos.total_isv18)}
📊 *Total Ingresos: ${fmt(total)}*

_Enviado por CashFlow Pro_`;
}

function mensajeAsientos(empresa, resumen, mes) {
  return `📒 *CashFlow Pro — Asientos Contables*
🏢 ${empresa.nombre}
📅 ${mes}

📌 Asientos: ${resumen.total}
✅ Contabilizados: ${resumen.contabilizados}
⏳ Pendientes: ${resumen.pendientes}
💰 Total DEBE:  ${fmt(resumen.total_debe)}
💰 Total HABER: ${fmt(resumen.total_haber)}

_Enviado por CashFlow Pro_`;
}

function mensajeComparativos(empresa, anio, pista, tienda) {
  return `📊 *CashFlow Pro — Comparativos*
🏢 ${empresa.nombre}
📅 Año ${anio}

⛽ *VENTAS PISTA*
Super:   ${fmt(pista.super)}
Regular: ${fmt(pista.regular)}
Diesel:  ${fmt(pista.diesel)}
*Total Pista: ${fmt(pista.total)}*

🛒 *VENTAS TIENDA*
Exenta:   ${fmt(tienda.exenta)}
Grav 15%: ${fmt(tienda.grav15)}
ISV 15%:  ${fmt(tienda.isv15 || n(tienda.grav15)*0.15)}
Grav 18%: ${fmt(tienda.grav18)}
ISV 18%:  ${fmt(tienda.isv18 || n(tienda.grav18)*0.18)}
*Total Tienda: ${fmt(tienda.total)}*

_Enviado por CashFlow Pro_`;
}

function getImagenesUrls(cuadre) {
  if (!cuadre || !cuadre.imagenes_deposito) return [];
  const base = process.env.RAILWAY_PUBLIC_DOMAIN
    ? 'https://' + process.env.RAILWAY_PUBLIC_DOMAIN
    : (process.env.APP_URL || '');
  if (!base) return [];
  return cuadre.imagenes_deposito.split(',').filter(Boolean).map(f => base + '/uploads/' + f.trim());
}

module.exports = {
  enviarMensaje, enviarAEmpresa, registrarLog,
  mensajeCuadre, mensajeLibroVentas, mensajeAsientos, mensajeComparativos,
  getImagenesUrls, getCuadreHoy, SQL_CUADRE
};
