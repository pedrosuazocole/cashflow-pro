// src/routes/dashboard.js
'use strict';

const express = require('express');
const router = express.Router();
const db = require('../database');
const layout = require('./layout');
const { requireAuth, requireEmpresa } = require('../middleware/auth');

router.get('/', requireAuth, requireEmpresa, (req, res) => {
  const empresaId = req.session.empresa.id;
  const hoy = new Date().toISOString().split('T')[0];
  const mesActual = hoy.substring(0, 7);

  // Stats del mes
  const cuadresMes = db.prepare(`
    SELECT COUNT(*) as total, 
           SUM(venta_super + venta_regular + venta_diesel) as total_pista,
           SUM(venta_exenta + venta_gravada_15 + isv_15 + venta_gravada_18 + isv_18) as total_tienda,
           SUM(total_depositos) as total_depositos
    FROM cuadres_diarios 
    WHERE empresa_id = ? AND fecha LIKE ?
  `).get(empresaId, `${mesActual}%`);

  // Últimos 7 cuadres
  const ultimos = db.prepare(`
    SELECT fecha,
    (venta_super + venta_regular + venta_diesel) as ingresos_pista,
    (venta_exenta + venta_gravada_15 + isv_15 + venta_gravada_18 + isv_18) as ingresos_tienda,
    (venta_super + venta_regular + venta_diesel +
     venta_exenta + venta_gravada_15 + isv_15 + venta_gravada_18 + isv_18 +
     cobros_tienda + anticipos_clientes + nc_descuentos_cred + total_alquileres) as total_ingresos,
    estado
    FROM cuadres_diarios 
    WHERE empresa_id = ? ORDER BY fecha DESC LIMIT 7
  `).all(empresaId);

  // Asientos pendientes
  const asientosPend = db.prepare(`
    SELECT COUNT(*) as total FROM asientos_contables 
    WHERE empresa_id = ? AND estado = 'no_contabilizado'
  `).get(empresaId);

  const fmt = (n) => new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2 }).format(n || 0);

  const content = `
  <div class="page-header">
    <h1>Dashboard</h1>
    <p class="page-subtitle">${new Date().toLocaleDateString('es-HN', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}</p>
  </div>

  <div class="stats-grid">
    <div class="stat-card stat-blue">
      <div class="stat-icon">⛽</div>
      <div class="stat-info">
        <div class="stat-label">Ventas Pista (Mes)</div>
        <div class="stat-value">L. ${fmt(cuadresMes?.total_pista)}</div>
      </div>
    </div>
    <div class="stat-card stat-green">
      <div class="stat-icon">🛒</div>
      <div class="stat-info">
        <div class="stat-label">Ventas Tienda (Mes)</div>
        <div class="stat-value">L. ${fmt(cuadresMes?.total_tienda)}</div>
      </div>
    </div>
    <div class="stat-card stat-purple">
      <div class="stat-icon">🏦</div>
      <div class="stat-info">
        <div class="stat-label">Total Depositado (Mes)</div>
        <div class="stat-value">L. ${fmt(cuadresMes?.total_depositos)}</div>
      </div>
    </div>
    <div class="stat-card stat-orange">
      <div class="stat-icon">📋</div>
      <div class="stat-info">
        <div class="stat-label">Cuadres del Mes</div>
        <div class="stat-value">${cuadresMes?.total || 0}</div>
      </div>
    </div>
  </div>

  <div class="grid-2col">
    <div class="card">
      <div class="card-header">
        <h3>Últimos Cuadres</h3>
        <a href="/cuadre/nuevo" class="btn btn-primary btn-sm">+ Nuevo</a>
      </div>
      <div class="card-body p0">
        <table class="table">
          <thead><tr><th>Fecha</th><th>Pista</th><th>Tienda</th><th>Estado</th></tr></thead>
          <tbody>
            ${ultimos.length ? ultimos.map(c => `
              <tr onclick="window.location='/cuadre/${c.rowid || ''}'" style="cursor:pointer">
                <td>${c.fecha}</td>
                <td>L. ${fmt(c.ingresos_pista)}</td>
                <td>L. ${fmt(c.ingresos_tienda)}</td>
                <td><span class="badge badge-${c.estado === 'finalizado' ? 'green' : 'yellow'}">${c.estado}</span></td>
              </tr>`).join('') : '<tr><td colspan="4" class="text-center text-muted">Sin cuadres registrados</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3>Acciones Rápidas</h3>
      </div>
      <div class="card-body">
        <div class="quick-actions">
          <a href="/cuadre/nuevo" class="quick-action-btn">
            <span class="qa-icon">📝</span>
            <span>Nuevo Cuadre</span>
          </a>
          <a href="/asientos" class="quick-action-btn">
            <span class="qa-icon">📚</span>
            <span>Asientos Cont.</span>
            ${asientosPend?.total > 0 ? `<span class="badge badge-red">${asientosPend.total}</span>` : ''}
          </a>
          <a href="/reportes" class="quick-action-btn">
            <span class="qa-icon">📊</span>
            <span>Reportes</span>
          </a>
          <a href="/reportes/libro-ventas" class="quick-action-btn">
            <span class="qa-icon">📖</span>
            <span>Libro Ventas</span>
          </a>
          <a href="/reportes/comparativo-pista" class="quick-action-btn">
            <span class="qa-icon">⛽</span>
            <span>Comp. Pista</span>
          </a>
          <a href="/reportes/comparativo-tienda" class="quick-action-btn">
            <span class="qa-icon">🛒</span>
            <span>Comp. Tienda</span>
          </a>
        </div>
      </div>
    </div>
  </div>
  `;

  res.send(layout(content, { title: 'Dashboard', user: req.session.user, empresa: req.session.empresa, empresas: (res.locals.empresas||[]), activePage: 'dashboard' }));
});

module.exports = router;
