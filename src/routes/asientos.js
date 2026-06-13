// src/routes/asientos.js - Asientos Contables
'use strict';

const express = require('express');
const router = express.Router();
const db = require('../database');
const layout = require('./layout');
const { requireAuth, requireEmpresa } = require('../middleware/auth');

router.use(requireAuth, requireEmpresa);

// ─── LISTADO ───
router.get('/', (req, res) => {
  const empId = req.session.empresa.id;
  const { estado, mes } = req.query;
  let where = 'WHERE a.empresa_id = ?';
  const params = [empId];
  if (estado) { where += ' AND a.estado = ?'; params.push(estado); }
  if (mes) { where += ' AND a.fecha LIKE ?'; params.push(`${mes}%`); }

  const asientos = db.prepare(`
    SELECT a.*, 
      (SELECT SUM(debe) FROM asientos_lineas WHERE asiento_id = a.id) as total_debe,
      (SELECT SUM(haber) FROM asientos_lineas WHERE asiento_id = a.id) as total_haber
    FROM asientos_contables a ${where} ORDER BY a.fecha DESC, a.id DESC
  `).all(...params);
  
  const fmt = (n) => new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2 }).format(n || 0);

  const content = `
  <div class="page-header">
    <div>
      <h1>📚 Asientos Contables</h1>
      <p class="page-subtitle">Partidas generadas desde cuadres diarios</p>
    </div>
    <a href="/asientos/nuevo" class="btn btn-primary">+ Nuevo Asiento</a>
  </div>

  <div class="card mb16">
    <div class="card-body">
      <form method="GET" class="filter-form">
        <div class="filter-group">
          <label>Mes:</label>
          <input type="month" name="mes" value="${mes || ''}" class="form-control">
        </div>
        <div class="filter-group">
          <label>Estado:</label>
          <select name="estado" class="form-control">
            <option value="">Todos</option>
            <option value="no_contabilizado" ${estado==='no_contabilizado'?'selected':''}>No Contabilizados</option>
            <option value="contabilizado" ${estado==='contabilizado'?'selected':''}>Contabilizados</option>
          </select>
        </div>
        <button type="submit" class="btn btn-secondary">Filtrar</button>
        <a href="/asientos" class="btn btn-outline">Limpiar</a>
      </form>
    </div>
  </div>

  <div class="tabs-row mb16">
    <a href="?estado=" class="tab ${!estado?'active':''}">Todos</a>
    <a href="?estado=no_contabilizado" class="tab ${estado==='no_contabilizado'?'active':''}">
      ⏳ No Contabilizados
      <span class="badge badge-red">${db.prepare("SELECT COUNT(*) as n FROM asientos_contables WHERE empresa_id = ? AND estado = 'no_contabilizado'").get(empId)?.n || 0}</span>
    </a>
    <a href="?estado=contabilizado" class="tab ${estado==='contabilizado'?'active':''}">✅ Contabilizados</a>
  </div>

  <div class="card">
    <div class="card-body p0">
      <table class="table table-hover">
        <thead>
          <tr>
            <th>N° Partida</th>
            <th>Fecha</th>
            <th>Descripción</th>
            <th>Total Debe</th>
            <th>Total Haber</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${asientos.length ? asientos.map(a => `
            <tr>
              <td><code>${a.numero_partida}</code></td>
              <td>${a.fecha}</td>
              <td>${a.descripcion || ''}</td>
              <td class="text-right">L. ${fmt(a.total_debe)}</td>
              <td class="text-right">L. ${fmt(a.total_haber)}</td>
              <td>
                <span class="badge badge-${a.estado === 'contabilizado' ? 'green' : 'yellow'}">
                  ${a.estado === 'contabilizado' ? '✅ Contabilizado' : '⏳ No Contabilizado'}
                </span>
              </td>
              <td>
                <div class="action-btns">
                  <a href="/asientos/${a.id}" class="btn btn-xs btn-primary">👁️</a>
                  <a href="/asientos/${a.id}/editar" class="btn btn-xs btn-secondary">✏️</a>
                  <button onclick="toggleAsiento(${a.id}, '${a.estado}')" class="btn btn-xs btn-outline" title="${a.estado==='contabilizado'?'Descontabilizar':'Contabilizar'}">
                    ${a.estado === 'contabilizado' ? '↩️' : '✅'}
                  </button>
                  <button onclick="printAsiento(${a.id})" class="btn btn-xs btn-outline">🖨️</button>
                  <button onclick="deleteAsiento(${a.id})" class="btn btn-xs btn-danger">🗑️</button>
                </div>
              </td>
            </tr>`).join('') : '<tr><td colspan="7" class="text-center text-muted py20">No hay asientos registrados</td></tr>'}
        </tbody>
      </table>
    </div>
  </div>

  <script>
    function toggleAsiento(id, estadoActual) {
      const nuevo = estadoActual === 'contabilizado' ? 'no_contabilizado' : 'contabilizado';
      fetch('/asientos/'+id+'/estado', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({estado: nuevo})})
        .then(r=>r.json()).then(d=>{ if(d.ok) location.reload(); });
    }
    function deleteAsiento(id) {
      if(!confirm('¿Eliminar este asiento contable?')) return;
      fetch('/asientos/'+id, {method:'DELETE'}).then(r=>r.json()).then(d=>{ if(d.ok) location.reload(); });
    }
    function printAsiento(id) {
      fetch('/asientos/'+id+'/print-data').then(r=>r.json()).then(data => {
        document.getElementById('printPreviewContent').innerHTML = data.html;
        document.getElementById('printModal').classList.add('open');
      });
    }
  </script>
  `;
  res.send(layout(content, { title: 'Asientos Contables', user: req.session.user, empresa: req.session.empresa, empresas: (res.locals.empresas||[]), activePage: 'asientos' }));
});

// ─── VER DETALLE ───
router.get('/:id', (req, res) => {
  const empId = req.session.empresa.id;
  const asiento = db.prepare('SELECT * FROM asientos_contables WHERE id = ? AND empresa_id = ?').get(req.params.id, empId);
  if (!asiento) return res.redirect('/asientos');
  const lineas = db.prepare('SELECT * FROM asientos_lineas WHERE asiento_id = ? ORDER BY orden').all(asiento.id);
  const fmt = (n) => new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2 }).format(n || 0);
  const totalDebe = lineas.reduce((s, l) => s + (l.debe || 0), 0);
  const totalHaber = lineas.reduce((s, l) => s + (l.haber || 0), 0);

  const content = `
  <div class="page-header">
    <div>
      <h1>📚 Asiento: ${asiento.numero_partida}</h1>
      <span class="badge badge-${asiento.estado === 'contabilizado' ? 'green' : 'yellow'}">
        ${asiento.estado === 'contabilizado' ? '✅ Contabilizado' : '⏳ No Contabilizado'}
      </span>
    </div>
    <div class="btn-group">
      <a href="/asientos/${asiento.id}/editar" class="btn btn-secondary">✏️ Editar</a>
      <button onclick="printAsiento(${asiento.id})" class="btn btn-outline">🖨️ Imprimir</button>
      <a href="/asientos" class="btn btn-outline">← Volver</a>
    </div>
  </div>
  <div class="card">
    <div class="card-header">
      <div class="detail-meta">
        <span>📅 Fecha: <strong>${asiento.fecha}</strong></span>
        <span>📝 ${asiento.descripcion || ''}</span>
      </div>
    </div>
    <div class="card-body p0">
      <table class="table">
        <thead>
          <tr><th>Cuenta</th><th>Descripción</th><th class="text-right">Debe</th><th class="text-right">Haber</th></tr>
        </thead>
        <tbody>
          ${lineas.map(l => `
            <tr>
              <td><code>${l.cuenta}</code></td>
              <td>${l.descripcion || ''}</td>
              <td class="text-right">${l.debe > 0 ? 'L. '+fmt(l.debe) : ''}</td>
              <td class="text-right">${l.haber > 0 ? 'L. '+fmt(l.haber) : ''}</td>
            </tr>`).join('')}
        </tbody>
        <tfoot>
          <tr class="bg-total">
            <td colspan="2"><strong>TOTALES</strong></td>
            <td class="text-right"><strong>L. ${fmt(totalDebe)}</strong></td>
            <td class="text-right"><strong>L. ${fmt(totalHaber)}</strong></td>
          </tr>
          <tr>
            <td colspan="2">Diferencia</td>
            <td colspan="2" class="text-right ${Math.abs(totalDebe - totalHaber) < 0.01 ? 'text-green' : 'text-red'}">
              L. ${fmt(Math.abs(totalDebe - totalHaber))} ${Math.abs(totalDebe - totalHaber) < 0.01 ? '✅ Cuadrado' : '⚠️ Descuadrado'}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>
  <script>
    function printAsiento(id) {
      fetch('/asientos/'+id+'/print-data').then(r=>r.json()).then(data => {
        document.getElementById('printPreviewContent').innerHTML = data.html;
        document.getElementById('printModal').classList.add('open');
      });
    }
  </script>
  `;
  res.send(layout(content, { title: 'Ver Asiento', user: req.session.user, empresa: req.session.empresa, empresas: (res.locals.empresas||[]), activePage: 'asientos' }));
});

// ─── NUEVO ASIENTO ───
router.get('/nuevo', (req, res) => renderAsientoForm(req, res, null));
router.get('/:id/editar', (req, res) => {
  const a = db.prepare('SELECT * FROM asientos_contables WHERE id = ? AND empresa_id = ?').get(req.params.id, req.session.empresa.id);
  if (!a) return res.redirect('/asientos');
  const lineas = db.prepare('SELECT * FROM asientos_lineas WHERE asiento_id = ? ORDER BY orden').all(a.id);
  a.lineas = lineas;
  renderAsientoForm(req, res, a);
});

function renderAsientoForm(req, res, asiento) {
  const isEdit = !!asiento;
  const a = asiento || {};
  const lineas = a.lineas || [{ cuenta: '', descripcion: '', debe: 0, haber: 0 }];
  const hoy = new Date().toISOString().split('T')[0];

  const content = `
  <div class="page-header">
    <h1>${isEdit ? '✏️ Editar' : '➕ Nuevo'} Asiento Contable</h1>
    <a href="/asientos" class="btn btn-outline">← Volver</a>
  </div>
  <div class="card">
    <div class="card-body">
      <form id="asientoForm" method="POST" action="${isEdit ? '/asientos/'+a.id+'?_method=PUT' : '/asientos'}">
        <input type="hidden" name="_method" value="${isEdit ? 'PUT' : 'POST'}">
        <div class="form-grid-3 mb16">
          <div class="form-group">
            <label class="required">N° Partida</label>
            <input type="text" name="numero_partida" value="${a.numero_partida || ''}" class="form-control" required placeholder="P--2024-01-15">
          </div>
          <div class="form-group">
            <label class="required">Fecha</label>
            <input type="date" name="fecha" value="${a.fecha || hoy}" class="form-control" required>
          </div>
          <div class="form-group">
            <label>Estado</label>
            <select name="estado" class="form-control">
              <option value="no_contabilizado" ${a.estado!=='contabilizado'?'selected':''}>No Contabilizado</option>
              <option value="contabilizado" ${a.estado==='contabilizado'?'selected':''}>Contabilizado</option>
            </select>
          </div>
        </div>
        <div class="form-group mb16">
          <label>Descripción</label>
          <input type="text" name="descripcion" value="${a.descripcion || ''}" class="form-control" placeholder="Descripción del asiento">
        </div>

        <h4 class="mb12">Líneas del Asiento</h4>
        <div class="table-responsive">
          <table class="table" id="lineasTable">
            <thead>
              <tr><th style="width:20%">Cuenta</th><th>Descripción</th><th style="width:15%">Debe</th><th style="width:15%">Haber</th><th style="width:80px">Acción</th></tr>
            </thead>
            <tbody id="lineasBody">
              ${lineas.map((l, i) => renderLinea(l, i)).join('')}
            </tbody>
            <tfoot>
              <tr class="bg-total">
                <td colspan="2"><strong>TOTALES</strong></td>
                <td><input type="number" id="sumDebe" class="form-control bg-gray" readonly value="0"></td>
                <td><input type="number" id="sumHaber" class="form-control bg-gray" readonly value="0"></td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <button type="button" onclick="addLinea()" class="btn btn-outline mt8">+ Agregar Línea</button>
        <p id="balanceStatus" class="mt8"></p>

        <div class="form-actions mt16">
          <a href="/asientos" class="btn btn-outline">Cancelar</a>
          <button type="submit" class="btn btn-primary">💾 Guardar Asiento</button>
        </div>
      </form>
    </div>
  </div>

  <script>
    let lineaIdx = ${lineas.length};
    function renderLinea(idx) {
      return \`<tr id="linea_\${idx}">
        <td><input type="text" name="linea_cuenta_\${idx}" class="form-control" placeholder="1101-03-01"></td>
        <td><input type="text" name="linea_desc_\${idx}" class="form-control" placeholder="Descripción"></td>
        <td><input type="number" step="0.01" name="linea_debe_\${idx}" class="form-control num-input" value="0" oninput="calcTotalesAsiento()"></td>
        <td><input type="number" step="0.01" name="linea_haber_\${idx}" class="form-control num-input" value="0" oninput="calcTotalesAsiento()"></td>
        <td><button type="button" onclick="removeLinea(\${idx})" class="btn btn-xs btn-danger">✕</button></td>
      </tr>\`;
    }
    function addLinea() {
      document.getElementById('lineasBody').insertAdjacentHTML('beforeend', renderLinea(lineaIdx));
      lineaIdx++;
      calcTotalesAsiento();
    }
    function removeLinea(idx) {
      const row = document.getElementById('linea_'+idx);
      if (row) row.remove();
      calcTotalesAsiento();
    }
    function calcTotalesAsiento() {
      let debe = 0, haber = 0;
      document.querySelectorAll('[name^=linea_debe_]').forEach(el => debe += parseFloat(el.value)||0);
      document.querySelectorAll('[name^=linea_haber_]').forEach(el => haber += parseFloat(el.value)||0);
      document.getElementById('sumDebe').value = debe.toFixed(2);
      document.getElementById('sumHaber').value = haber.toFixed(2);
      const diff = Math.abs(debe - haber);
      const status = document.getElementById('balanceStatus');
      if (diff < 0.01) {
        status.innerHTML = '<span class="text-green">✅ Partida cuadrada</span>';
      } else {
        status.innerHTML = '<span class="text-red">⚠️ Diferencia: L. '+diff.toFixed(2)+'</span>';
      }
    }
    document.addEventListener('DOMContentLoaded', calcTotalesAsiento);
  </script>
  `;
  res.send(layout(content, { title: isEdit ? 'Editar Asiento' : 'Nuevo Asiento', user: req.session.user, empresa: req.session.empresa, empresas: (res.locals.empresas||[]), activePage: 'asientos' }));
}

function renderLinea(l, i) {
  return `<tr id="linea_${i}">
    <td><input type="text" name="linea_cuenta_${i}" class="form-control" value="${l.cuenta||''}" placeholder="1101-03-01"></td>
    <td><input type="text" name="linea_desc_${i}" class="form-control" value="${l.descripcion||''}"></td>
    <td><input type="number" step="0.01" name="linea_debe_${i}" class="form-control num-input" value="${l.debe||0}" oninput="calcTotalesAsiento()"></td>
    <td><input type="number" step="0.01" name="linea_haber_${i}" class="form-control num-input" value="${l.haber||0}" oninput="calcTotalesAsiento()"></td>
    <td><button type="button" onclick="removeLinea(${i})" class="btn btn-xs btn-danger">✕</button></td>
  </tr>`;
}

// ─── GUARDAR ───
router.post('/', (req, res) => {
  const empId = req.session.empresa.id;
  const data = req.body;
  
  const asiento = db.prepare(`INSERT INTO asientos_contables (empresa_id, numero_partida, fecha, descripcion, estado, created_by)
    VALUES (?, ?, ?, ?, ?, ?)`).run(empId, data.numero_partida, data.fecha, data.descripcion, data.estado || 'no_contabilizado', req.session.user.id);
  
  saveLineas(asiento.lastInsertRowid, data);
  res.redirect('/asientos');
});

// ─── ACTUALIZAR ───
router.post('/:id', (req, res) => {
  if (req.body._method !== 'PUT') return res.redirect('/asientos');
  const empId = req.session.empresa.id;
  const data = req.body;
  
  db.prepare(`UPDATE asientos_contables SET numero_partida=?, fecha=?, descripcion=?, estado=?, updated_at=datetime('now','localtime')
    WHERE id = ? AND empresa_id = ?`).run(data.numero_partida, data.fecha, data.descripcion, data.estado, req.params.id, empId);
  
  db.prepare('DELETE FROM asientos_lineas WHERE asiento_id = ?').run(req.params.id);
  saveLineas(req.params.id, data);
  
  res.redirect('/asientos');
});

// ─── CAMBIAR ESTADO ───
router.post('/:id/estado', (req, res) => {
  const { estado } = req.body;
  db.prepare("UPDATE asientos_contables SET estado = ?, updated_at = datetime('now','localtime') WHERE id = ? AND empresa_id = ?")
    .run(estado, req.params.id, req.session.empresa.id);
  res.json({ ok: true });
});

// ─── ELIMINAR ───
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM asientos_lineas WHERE asiento_id = ?').run(req.params.id);
  db.prepare('DELETE FROM asientos_contables WHERE id = ? AND empresa_id = ?').run(req.params.id, req.session.empresa.id);
  res.json({ ok: true });
});

// ─── PRINT DATA ───
router.get('/:id/print-data', (req, res) => {
  const empId = req.session.empresa.id;
  const a = db.prepare('SELECT * FROM asientos_contables WHERE id = ? AND empresa_id = ?').get(req.params.id, empId);
  if (!a) return res.json({ html: '<p>No encontrado</p>' });
  const lineas = db.prepare('SELECT * FROM asientos_lineas WHERE asiento_id = ? ORDER BY orden').all(a.id);
  const emp = req.session.empresa;
  const fmt = (n) => new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2 }).format(n || 0);
  const totalDebe = lineas.reduce((s, l) => s + (l.debe || 0), 0);
  const totalHaber = lineas.reduce((s, l) => s + (l.haber || 0), 0);

  const html = `
  <div style="font-family:Arial,sans-serif;font-size:11px;padding:20px">
    <div style="text-align:center;margin-bottom:16px">
      <h2 style="font-size:16px;margin:0">${emp.nombre}</h2>
      <h3 style="font-size:13px;margin:8px 0">ASIENTO CONTABLE</h3>
      <table style="width:100%;font-size:11px"><tr>
        <td>N° Partida: <strong>${a.numero_partida}</strong></td>
        <td>Fecha: <strong>${a.fecha}</strong></td>
        <td>Estado: <strong>${a.estado === 'contabilizado' ? 'CONTABILIZADO' : 'NO CONTABILIZADO'}</strong></td>
      </tr></table>
      <p>${a.descripcion || ''}</p>
    </div>
    <table style="width:100%;border-collapse:collapse">
      <thead>
        <tr style="background:#1e3a5f;color:#fff">
          <th style="padding:6px 8px;text-align:left">CUENTA</th>
          <th style="padding:6px 8px;text-align:left">DESCRIPCIÓN</th>
          <th style="padding:6px 8px;text-align:right">DEBE</th>
          <th style="padding:6px 8px;text-align:right">HABER</th>
        </tr>
      </thead>
      <tbody>
        ${lineas.map((l, i) => `
          <tr style="background:${i%2===0?'#f9fafb':'#fff'}">
            <td style="padding:4px 8px">${l.cuenta}</td>
            <td style="padding:4px 8px">${l.descripcion || ''}</td>
            <td style="padding:4px 8px;text-align:right">${l.debe > 0 ? fmt(l.debe) : ''}</td>
            <td style="padding:4px 8px;text-align:right">${l.haber > 0 ? fmt(l.haber) : ''}</td>
          </tr>`).join('')}
      </tbody>
      <tfoot>
        <tr style="background:#e5e7eb;font-weight:bold">
          <td colspan="2" style="padding:6px 8px">TOTALES</td>
          <td style="padding:6px 8px;text-align:right">L. ${fmt(totalDebe)}</td>
          <td style="padding:6px 8px;text-align:right">L. ${fmt(totalHaber)}</td>
        </tr>
      </tfoot>
    </table>
    <p style="margin-top:16px">__________________________________<br>Firma Contable</p>
  </div>`;
  
  res.json({ html });
});

function saveLineas(asientoId, data) {
  let i = 0;
  while (data[`linea_cuenta_${i}`] !== undefined) {
    const cuenta = data[`linea_cuenta_${i}`];
    const desc = data[`linea_desc_${i}`];
    const debe = parseFloat(data[`linea_debe_${i}`]) || 0;
    const haber = parseFloat(data[`linea_haber_${i}`]) || 0;
    if (cuenta || debe > 0 || haber > 0) {
      db.prepare('INSERT INTO asientos_lineas (asiento_id, cuenta, descripcion, debe, haber, orden) VALUES (?, ?, ?, ?, ?, ?)').run(asientoId, cuenta, desc, debe, haber, i);
    }
    i++;
  }
}

module.exports = router;
