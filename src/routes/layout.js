// src/routes/layout.js - HTML layout compartido CashFlow Pro
'use strict';

function layout(content, { title = 'Dashboard', user, empresa, empresas = [], activePage = '' } = {}) {
  const empNombre  = empresa ? empresa.nombre : 'Sin empresa';
  const empId      = empresa ? empresa.id : '';
  const userNombre = user    ? user.nombre   : '';
  const userRol    = user    ? user.rol      : '';
  const isAdmin    = userRol === 'admin';
  const isSuperv   = userRol === 'supervisor' || isAdmin;
  const avatarLet  = userNombre ? userNombre.charAt(0).toUpperCase() : 'U';

  const empOptions = empresas.map(e =>
    `<option value="${e.id}" ${e.id == empId ? 'selected' : ''}>${e.nombre}</option>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
  <meta name="theme-color" content="#1a9e5c">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="CashFlow Pro">
  <title>${title} — CashFlow Pro</title>
  <link rel="manifest" href="/manifest.json">
  <link rel="icon" href="/images/logo.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/icons/icon-192.svg">
  <link rel="stylesheet" href="/css/main.css">
</head>
<body>

<div class="app-wrapper">

  <!-- ── SIDEBAR ── -->
  <nav class="sidebar" id="sidebar">
    <div class="sidebar-logo">
      <img src="/images/logo.svg" alt="CashFlow Pro" height="34">
    </div>

    ${empresas.length > 0 ? `
    <div class="sidebar-empresa">
      <label>Empresa activa</label>
      <select id="empresa-select">
        ${empOptions}
      </select>
    </div>` : `
    <div class="sidebar-empresa">
      <label>Empresa activa</label>
      <div style="color:#94a3b8;font-size:.8rem;padding:4px 0;">${empNombre}</div>
    </div>`}

    <nav class="sidebar-nav">
      <div class="nav-section">
        <div class="nav-section-title">Principal</div>
        <a href="/dashboard" class="nav-item ${activePage==='dashboard'?'active':''}">
          <span class="nav-icon">🏠</span> Dashboard
        </a>
      </div>

      <div class="nav-section">
        <div class="nav-section-title">Operaciones</div>
        <a href="/cuadre" class="nav-item ${activePage==='cuadre'?'active':''}">
          <span class="nav-icon">💰</span> Cuadre Diario
        </a>
        <a href="/asientos" class="nav-item ${activePage==='asientos'?'active':''}">
          <span class="nav-icon">📒</span> Asientos Contables
        </a>
      </div>

      <div class="nav-section">
        <div class="nav-section-title">Análisis y Reportes</div>
        <a href="/reportes/libro-ventas" class="nav-item ${activePage==='libro-ventas'?'active':''}">
          <span class="nav-icon">📋</span> Libro de Ventas
        </a>
        <a href="/reportes/comparativo-pista" class="nav-item ${activePage==='comp-pista'?'active':''}">
          <span class="nav-icon">⛽</span> Comparativo Pista
        </a>
        <a href="/reportes/comparativo-tienda" class="nav-item ${activePage==='comp-tienda'?'active':''}">
          <span class="nav-icon">🛒</span> Comparativo Tienda
        </a>
        <a href="/reportes" class="nav-item ${activePage==='reportes'?'active':''}">
          <span class="nav-icon">📊</span> Reportes
        </a>
      </div>

      ${isSuperv ? `
      <div class="nav-section">
        <div class="nav-section-title">Administración</div>
        ${isAdmin ? `
        <a href="/usuarios" class="nav-item ${activePage==='usuarios'?'active':''}">
          <span class="nav-icon">👥</span> Usuarios
        </a>
        <a href="/empresas" class="nav-item ${activePage==='empresas'?'active':''}">
          <span class="nav-icon">🏢</span> Empresas
        </a>
        <a href="/configuracion" class="nav-item ${activePage==='configuracion'?'active':''}">
          <span class="nav-icon">⚙️</span> Configuración
        </a>
        <a href="/notificaciones" class="nav-item ${activePage==='notificaciones'?'active':''}">
          <span class="nav-icon">🔔</span> Notificaciones
        </a>` : ''}
      </div>` : ''}
    </nav>

    <div class="sidebar-footer">
      <div class="sidebar-user">
        <div class="sidebar-avatar">${avatarLet}</div>
        <div class="sidebar-user-info">
          <div class="sidebar-user-name">${userNombre}</div>
          <div class="sidebar-user-role">${userRol}</div>
        </div>
        <a href="/logout" class="sidebar-logout" title="Cerrar sesión">🚪</a>
      </div>
    </div>
  </nav>

  <!-- ── OVERLAY MOBILE ── -->
  <div class="sidebar-overlay" id="sidebar-overlay"></div>

  <!-- ── MAIN CONTENT ── -->
  <div class="main-content">

    <!-- TOPBAR -->
    <header class="topbar">
      <button class="topbar-toggle" id="sidebar-toggle">☰</button>
      <div class="topbar-title">${title}</div>
      <span class="topbar-date" id="topbar-date"></span>
      <div class="topbar-empresa-badge">${empNombre}</div>
    </header>

    <!-- PAGE -->
    <main class="page-content">
      ${content}
    </main>
  </div>

</div><!-- /app-wrapper -->

<!-- Toast container -->
<div id="toast-container"></div>

<!-- Modal Impresión Global -->
<div class="modal-overlay" id="printModal">
  <div class="modal modal-lg">
    <div class="modal-header">
      <h3>🖨️ Vista Previa de Impresión</h3>
      <button class="modal-close" id="btnCerrarPrint">✕</button>
    </div>
    <div class="modal-body">
      <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin-bottom:16px">
        <label style="font-size:.85rem;font-weight:600">Copias: <input type="number" id="printCopias" value="1" min="1" max="10" style="width:60px;padding:4px 8px;border:1.5px solid #e2e8f0;border-radius:6px"></label>
        <label style="font-size:.85rem;font-weight:600">Formato: <select id="printFormato" style="padding:4px 8px;border:1.5px solid #e2e8f0;border-radius:6px"><option value="carta">Carta / A4</option><option value="ticket">Ticket 80mm</option></select></label>
      </div>
      <div id="printPreviewContent" style="border:1px solid #e2e8f0;border-radius:8px;padding:20px;max-height:60vh;overflow-y:auto;background:#fff;font-size:.85rem"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="btnCancelarPrint">Cancelar</button>
      <button class="btn btn-primary" onclick="window.print()">🖨️ Imprimir</button>
    </div>
  </div>
</div>

<script src="/js/main.js"></script>
<script>
  document.getElementById('btnCerrarPrint') && document.getElementById('btnCerrarPrint').addEventListener('click', function(){ document.getElementById('printModal').classList.remove('open'); });
  document.getElementById('btnCancelarPrint') && document.getElementById('btnCancelarPrint').addEventListener('click', function(){ document.getElementById('printModal').classList.remove('open'); });
</script>
</body>
</html>`;
}

module.exports = layout;
