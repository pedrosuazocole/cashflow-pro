// src/services/scheduler.js
// Tareas programadas de notificaciones WhatsApp
'use strict';

const cron = require('node-cron');
const db   = require('../database');
const wa   = require('./whatsapp');

// ── Helpers ──────────────────────────────────────────────────────────────────
const hoy = () => new Date().toISOString().split('T')[0];
const mesActual = () => new Date().toISOString().substring(0, 7);
const anioActual = () => new Date().getFullYear();

// ── Obtener empresas con notificaciones activas ───────────────────────────────
function empresasActivas() {
  return db.prepare(`
    SELECT e.*, nc.textmebot_key, nc.envio_cuadre, nc.hora_cuadre,
           nc.envio_libro, nc.hora_libro, nc.envio_asientos, nc.hora_asientos,
           nc.envio_comparativo, nc.hora_comparativo
    FROM empresas e
    JOIN notif_config nc ON nc.empresa_id = e.id
    WHERE nc.activo = 1 AND nc.textmebot_key IS NOT NULL AND nc.textmebot_key != ''
  `).all();
}

// ── TAREA: Cuadre Diario (cada minuto verifica si es la hora configurada) ────
cron.schedule('* * * * *', async () => {
  const ahora = new Date();
  const horaAhora = `${String(ahora.getHours()).padStart(2,'0')}:${String(ahora.getMinutes()).padStart(2,'0')}`;

  const empresas = empresasActivas();
  for (const emp of empresas) {
    if (!emp.envio_cuadre || emp.hora_cuadre !== horaAhora) continue;

    try {
      // Buscar el cuadre de hoy
      const cuadre = db.prepare(
        wa.SQL_CUADRE + " WHERE empresa_id=? AND fecha=? ORDER BY id DESC LIMIT 1"
      ).get(emp.id, hoy());

      if (!cuadre) {
        await wa.enviarAEmpresa(emp.id, 'cuadre_diario',
          `⚠️ *CashFlow Pro — Aviso*\n🏢 ${emp.nombre}\n📅 ${hoy()}\n\nNo se encontró cuadre diario para hoy.`
        );
        continue;
      }

      const msg     = wa.mensajeCuadre(emp, cuadre);
      const imgUrls = wa.getImagenesUrls ? wa.getImagenesUrls(cuadre) : [];
      await wa.enviarAEmpresa(emp.id, 'cuadre_diario', msg, imgUrls);
      console.log(`[Scheduler] Cuadre enviado → ${emp.nombre} (${imgUrls.length} adjuntos)`);
    } catch (e) {
      console.error(`[Scheduler] Error cuadre ${emp.nombre}:`, e.message);
    }
  }
});

// ── TAREA: Libro de Ventas (diario a las 14:00 por defecto) ──────────────────
cron.schedule('* * * * *', async () => {
  const ahora = new Date();
  const horaAhora = `${String(ahora.getHours()).padStart(2,'0')}:${String(ahora.getMinutes()).padStart(2,'0')}`;

  const empresas = empresasActivas();
  for (const emp of empresas) {
    if (!emp.envio_libro || emp.hora_libro !== horaAhora) continue;

    try {
      const mes = mesActual();
      const datos = db.prepare(`
        SELECT
          COUNT(*)                               as total_dias,
          SUM(venta_exenta)                      as total_exenta,
          SUM(venta_gravada_15)                  as total_grav15,
          SUM(venta_gravada_18)                  as total_grav18,
          SUM(isv_15 + isv_18)                   as total_isv,
          SUM(ingresos_pista)                    as total_pista,
          SUM(total_ingresos)                    as total_ingresos
        FROM cuadres_diarios
        WHERE empresa_id=? AND fecha LIKE ?
      `).get(emp.id, `${mes}%`);

      const msg = wa.mensajeLibroVentas(emp, datos, mes);
      await wa.enviarAEmpresa(emp.id, 'libro_ventas', msg);
      console.log(`[Scheduler] Libro Ventas enviado → ${emp.nombre}`);
    } catch (e) {
      console.error(`[Scheduler] Error libro ${emp.nombre}:`, e.message);
    }
  }
});

// ── TAREA: Asientos Contables (diario a las 15:00 por defecto) ───────────────
cron.schedule('* * * * *', async () => {
  const ahora = new Date();
  const horaAhora = `${String(ahora.getHours()).padStart(2,'0')}:${String(ahora.getMinutes()).padStart(2,'0')}`;

  const empresas = empresasActivas();
  for (const emp of empresas) {
    if (!emp.envio_asientos || emp.hora_asientos !== horaAhora) continue;

    try {
      const mes = mesActual();
      const resumen = db.prepare(`
        SELECT
          COUNT(*)                                              as total,
          SUM(CASE WHEN estado='contabilizado' THEN 1 ELSE 0 END) as contabilizados,
          SUM(CASE WHEN estado!='contabilizado' THEN 1 ELSE 0 END) as pendientes,
          SUM(total_debe)                                       as total_debe,
          SUM(total_haber)                                      as total_haber
        FROM asientos_contables
        WHERE empresa_id=? AND fecha LIKE ?
      `).get(emp.id, `${mes}%`);

      const msg = wa.mensajeAsientos(emp, resumen, mes);
      await wa.enviarAEmpresa(emp.id, 'asientos_contables', msg);
      console.log(`[Scheduler] Asientos enviados → ${emp.nombre}`);
    } catch (e) {
      console.error(`[Scheduler] Error asientos ${emp.nombre}:`, e.message);
    }
  }
});

// ── TAREA: Comparativos (viernes a la hora configurada, 13:00 por defecto) ───
cron.schedule('* * * * *', async () => {
  const ahora = new Date();
  const diaSemana = ahora.getDay(); // 5 = viernes
  if (diaSemana !== 5) return;

  const horaAhora = `${String(ahora.getHours()).padStart(2,'0')}:${String(ahora.getMinutes()).padStart(2,'0')}`;

  const empresas = empresasActivas();
  for (const emp of empresas) {
    if (!emp.envio_comparativo || emp.hora_comparativo !== horaAhora) continue;

    try {
      const anio = anioActual();
      // Sumar todos los meses del año para el comparativo anual
      const pista = db.prepare(`
        SELECT SUM(venta_super) as super, SUM(venta_regular) as regular,
               SUM(venta_diesel) as diesel,
               SUM(venta_super+venta_regular+venta_diesel) as total
        FROM cuadres_diarios WHERE empresa_id=? AND fecha LIKE ?
      `).get(emp.id, `${anio}%`);

      const tienda = db.prepare(`
        SELECT SUM(venta_exenta) as exenta, SUM(venta_gravada_15) as grav15,
               SUM(venta_gravada_18) as grav18, SUM(isv_15+isv_18) as isv,
               SUM(venta_exenta+venta_gravada_15+isv_15+venta_gravada_18+isv_18) as total
        FROM cuadres_diarios WHERE empresa_id=? AND fecha LIKE ?
      `).get(emp.id, `${anio}%`);

      const msg = wa.mensajeComparativos(emp, anio, pista, tienda);
      await wa.enviarAEmpresa(emp.id, 'comparativos', msg);
      console.log(`[Scheduler] Comparativos enviados → ${emp.nombre}`);
    } catch (e) {
      console.error(`[Scheduler] Error comparativos ${emp.nombre}:`, e.message);
    }
  }
});

console.log('✅ Scheduler de notificaciones iniciado');
module.exports = {};
