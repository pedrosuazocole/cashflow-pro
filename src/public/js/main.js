/* ============================================================
   CashFlow Pro - main.js
   Lógica global de UI: sidebar, toasts, modals, tabs, chart
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {

  /* ── Sidebar toggle (mobile) ── */
  const sidebar  = document.getElementById('sidebar');
  const overlay  = document.getElementById('sidebar-overlay');
  const toggleBtn= document.getElementById('sidebar-toggle');

  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      overlay && overlay.classList.toggle('open');
    });
  }
  if (overlay) {
    overlay.addEventListener('click', () => {
      sidebar && sidebar.classList.remove('open');
      overlay.classList.remove('open');
    });
  }

  /* ── Active nav item ── */
  const navItems = document.querySelectorAll('.nav-item');
  const current  = window.location.pathname.split('/')[1] || 'dashboard';
  navItems.forEach(item => {
    const href = (item.getAttribute('href') || '').replace('/','');
    if (href === current || (current === '' && href === 'dashboard')) {
      item.classList.add('active');
    }
  });

  /* ── Empresa selector (sidebar) ── */
  const empresaSelect = document.getElementById('empresa-select');
  if (empresaSelect) {
    empresaSelect.addEventListener('change', async () => {
      try {
        const res = await fetch('/empresas/select', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ empresaId: empresaSelect.value })
        });
        if (res.ok) {
          showToast('Empresa cambiada exitosamente', 'success');
          // Forzar recarga sin usar caché del navegador (evita ver datos de la empresa anterior)
          setTimeout(() => {
            location.href = location.pathname + '?_t=' + Date.now();
          }, 800);
        }
      } catch (e) {
        showToast('Error al cambiar empresa', 'error');
      }
    });
  }

  /* ── Tabs ── */
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      const container = btn.closest('.tabs-container') || document;
      container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      container.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const pane = container.querySelector('#' + target);
      if (pane) pane.classList.add('active');
    });
  });

  /* ── Modal close on overlay click ── */
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });

  /* ── Auto-dismiss alerts ── */
  document.querySelectorAll('.alert-auto').forEach(alert => {
    setTimeout(() => {
      alert.style.opacity = '0';
      alert.style.transition = 'opacity .5s';
      setTimeout(() => alert.remove(), 500);
    }, 4000);
  });

  /* ── Current date in topbar ── */
  const dateEl = document.getElementById('topbar-date');
  if (dateEl) {
    const now = new Date();
    dateEl.textContent = now.toLocaleDateString('es-HN', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
  }

  /* ── Confirm delete buttons ── */
  document.querySelectorAll('[data-confirm]').forEach(el => {
    el.addEventListener('click', (e) => {
      const msg = el.dataset.confirm || '¿Está seguro de eliminar este registro?';
      if (!confirm(msg)) e.preventDefault();
    });
  });

  /* ── Format number inputs on blur ── */
  document.querySelectorAll('input[data-format="currency"]').forEach(input => {
    input.addEventListener('blur', () => {
      const val = parseFloat(input.value);
      if (!isNaN(val)) input.value = val.toFixed(2);
    });
  });

  /* ── Keyboard shortcuts ── */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.open').forEach(m => {
        m.classList.remove('open');
      });
    }
  });
});

/* ── Toast notification system ── */
function showToast(message, type = 'success', duration = 3500) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || '✅'}</span>
    <span class="toast-msg">${message}</span>
    <span class="toast-close" onclick="this.parentElement.remove()">✕</span>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all .3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/* ── Modal helpers ── */
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

/* ── Format number as Lempiras ── */
function formatHNL(n) {
  const num = parseFloat(n) || 0;
  return 'L ' + num.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ── Parse safe float ── */
function pf(v) {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

/* ── Set readonly field value ── */
function setField(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = typeof val === 'number' ? val.toFixed(2) : val;
}

/* ── Print section ── */
function printSection(sectionId, title) {
  const content = document.getElementById(sectionId);
  if (!content) return;
  const printWin = window.open('', '_blank');
  printWin.document.write(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>${title}</title>
      <link rel="stylesheet" href="/css/main.css">
      <style>
        body { padding: 20px; background: white; }
        @media print { @page { margin: 1cm; size: A4 landscape; } }
      </style>
    </head>
    <body onload="window.print()">
      <h2 style="text-align:center;margin-bottom:16px">${title}</h2>
      ${content.innerHTML}
    </body>
    </html>
  `);
  printWin.document.close();
}

/* ── Simple Chart (Canvas bars) ── */
function drawBarChart(canvasId, labels, datasets) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width  = canvas.offsetWidth;
  const H = canvas.height = 280;

  ctx.clearRect(0, 0, W, H);

  const pad = { top: 30, right: 20, bottom: 60, left: 70 };
  const chartW = W - pad.left - pad.right;
  const chartH = H - pad.top  - pad.bottom;

  // Find max value
  let maxVal = 0;
  datasets.forEach(ds => ds.data.forEach(v => { if (v > maxVal) maxVal = v; }));
  if (maxVal === 0) maxVal = 1;

  const barW   = chartW / labels.length;
  const dsCount= datasets.length;
  const eachW  = (barW * .8) / dsCount;

  // Grid lines
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth   = 1;
  for (let i = 0; i <= 5; i++) {
    const y = pad.top + chartH - (chartH * i / 5);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + chartW, y);
    ctx.stroke();
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(formatK(maxVal * i / 5), pad.left - 6, y + 4);
  }

  // Bars
  datasets.forEach((ds, di) => {
    ctx.fillStyle = ds.color || '#1a9e5c';
    ds.data.forEach((val, i) => {
      const bH = (val / maxVal) * chartH;
      const x  = pad.left + i * barW + barW * .1 + di * eachW;
      const y  = pad.top  + chartH - bH;
      ctx.beginPath();
      ctx.roundRect(x, y, eachW - 2, bH, [3, 3, 0, 0]);
      ctx.fill();
    });
  });

  // X labels
  ctx.fillStyle = '#64748b';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  labels.forEach((lbl, i) => {
    const x = pad.left + i * barW + barW / 2;
    ctx.fillText(lbl, x, H - pad.bottom + 18);
  });

  // Axes
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top);
  ctx.lineTo(pad.left, pad.top + chartH);
  ctx.lineTo(pad.left + chartW, pad.top + chartH);
  ctx.stroke();
}

function formatK(n) {
  if (n >= 1000000) return (n/1000000).toFixed(1) + 'M';
  if (n >= 1000)    return (n/1000).toFixed(0) + 'K';
  return n.toFixed(0);
}

/* ── Service Worker (PWA) ── */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
