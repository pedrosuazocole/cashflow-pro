// src/services/whatsapp.js
// Servicio de notificaciones WhatsApp via TextMeBot API
'use strict';

const axios = require('axios');
const db    = require('../database');

// ── Enviar un mensaje via TextMeBot ──────────────────────────────────────────
async function enviarMensaje(apiKey, telefono, mensaje) {
  // TextMeBot requiere número en formato internacional sin + (ej: 50494502710)
  const numero = telefono.replace(/[^0-9]/g, '');

  try {
    const url = `https://api.textmebot.com/send.php`;
    const resp = await axios.get(url, {
      params: {
        recipient: numero,
        apikey:    apiKey,
        text:      mensaje
      },
      timeout: 15000
    });

    // TextMeBot devuelve texto plano: "success" o mensaje de error
    const ok = String(resp.data).toLowerCase().includes('success') ||
               String(resp.data).includes('200');
    return { ok, respuesta: String(resp.data).trim() };
  } catch (err) {
    return { ok: false, respuesta: err.message };
  }
}

// ── Registrar en log ─────────────────────────────────────────────────────────
function registrarLog(empresaId, contactoId, tipo, mensaje, estado, respuesta) {
  try {
    db.prepare(`INSERT INTO notif_log (empresa_id,contacto_id,tipo,mensaje,estado,respuesta)
                VALUES (?,?,?,?,?,?)`
    ).run(empresaId, contactoId || null, tipo, mensaje, estado, respuesta);
  } catch (e) {
    console.error('[WhatsApp Log]', e.message);
  }
}

// ── Enviar a todos los contactos activos de una empresa ──────────────────────
async function enviarAEmpresa(empresaId, tipo, mensaje) {
  const cfg = db.prepare('SELECT * FROM notif_config WHERE empresa_id=?').get(empresaId);
  if (!cfg || !cfg.textmebot_key || !cfg.activo) return;

  const contactos = db.prepare(
    'SELECT * FROM notif_contactos WHERE empresa_id=? AND activo=1'
  ).all(empresaId);

  if (!contactos.length) return;

  for (const c of contactos) {
    const { ok, respuesta } = await enviarMensaje(cfg.textmebot_key, c.telefono, mensaje);
    registrarLog(empresaId, c.id, tipo, mensaje, ok ? 'enviado' : 'error', respuesta);
    console.log(`[WhatsApp] ${ok ? '✅' : '❌'} ${c.nombre} (${c.telefono}): ${respuesta}`);
    // Pausa pequeña entre envíos para no saturar la API
    await new Promise(r => setTimeout(r, 1500));
  }
}

// ── Generadores de mensajes ──────────────────────────────────────────────────
const fmt = n => `L ${(parseFloat(n)||0).toLocaleString('es-HN',{minimumFractionDigits:2})}`;
const dmy = s => { if (!s) return '-'; const [y,m,d] = s.split('-'); return `${d}/${m}/${y}`; };

function mensajeCuadre(empresa, cuadre) {
  const estado = cuadre.sobrante > 0 ? `✅ SOBRANTE: ${fmt(cuadre.sobrante)}`
               : cuadre.faltante > 0 ? `❌ FALTANTE: ${fmt(cuadre.faltante)}`
               : `✅ CUADRADO`;
  return `🏪 *CashFlow Pro — Cuadre Diario*
🏢 ${empresa.nombre}
📅 Fecha: ${dmy(cuadre.fecha)}

💰 *INGRESOS*
⛽ Pista:   ${fmt(cuadre.ingresos_pista)}
🛒 Tienda:  ${fmt(cuadre.ingresos_tienda)}
🏠 Alquiler: ${fmt(cuadre.total_alquileres)}
📊 *Total:  ${fmt(cuadre.total_ingresos)}*

🚫 No Efectivo: ${fmt(cuadre.total_no_efectivo)}
💵 Efectivo Disp.: ${fmt(cuadre.efectivo_disponible)}
🏦 Depositado: ${fmt(cuadre.total_depositos)}

${estado}

_Enviado automáticamente por CashFlow Pro_`;
}

function mensajeLibroVentas(empresa, datos, mes) {
  const [anio, m] = mes.split('-');
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                 'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const nomMes = meses[parseInt(m)-1] + ' ' + anio;
  return `📋 *CashFlow Pro — Libro de Ventas*
🏢 ${empresa.nombre}
📅 ${nomMes}

📦 Registros: ${datos.total_dias} día(s)
🚫 Exenta:    ${fmt(datos.total_exenta)}
💳 Grav. 15%: ${fmt(datos.total_grav15)}
💳 Grav. 18%: ${fmt(datos.total_grav18)}
🧾 ISV Total: ${fmt(datos.total_isv)}
⛽ Pista:     ${fmt(datos.total_pista)}
📊 *Total Ingresos: ${fmt(datos.total_ingresos)}*

_Enviado automáticamente por CashFlow Pro_`;
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

_Enviado automáticamente por CashFlow Pro_`;
}

function mensajeComparativos(empresa, anio, pista, tienda) {
  return `📊 *CashFlow Pro — Comparativos Semanales*
🏢 ${empresa.nombre}
📅 Año ${anio} | ${new Date().toLocaleDateString('es-HN',{weekday:'long',day:'numeric',month:'long'})}

⛽ *VENTAS PISTA*
Super:   ${fmt(pista.super)}
Regular: ${fmt(pista.regular)}
Diesel:  ${fmt(pista.diesel)}
*Total Pista: ${fmt(pista.total)}*

🛒 *VENTAS TIENDA*
Exenta:  ${fmt(tienda.exenta)}
Grav 15%: ${fmt(tienda.grav15)}
Grav 18%: ${fmt(tienda.grav18)}
ISV:     ${fmt(tienda.isv)}
*Total Tienda: ${fmt(tienda.total)}*

_Enviado automáticamente por CashFlow Pro_`;
}

module.exports = {
  enviarMensaje,
  enviarAEmpresa,
  registrarLog,
  mensajeCuadre,
  mensajeLibroVentas,
  mensajeAsientos,
  mensajeComparativos
};
