// src/routes/empresas.js — CRUD corregido
'use strict';
const express = require('express');
const router  = express.Router();
const db      = require('../database');
const layout  = require('./layout');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.use(requireAuth);

/* ── Pantalla de selección de empresa ── */
router.get('/seleccionar', (req, res) => {
  const lista = db.prepare('SELECT * FROM empresas WHERE activa=1').all();
  const content = `
  <div style="max-width:600px;margin:60px auto">
    <h1 style="text-align:center;margin-bottom:32px">🏢 Seleccioná una Empresa</h1>
    <div style="display:flex;flex-direction:column;gap:12px">
      ${lista.map(e => `
        <a href="/empresas/seleccionar/${e.id}" style="
          display:flex;align-items:center;gap:16px;padding:16px 20px;
          background:#fff;border:1.5px solid #e2e8f0;border-radius:12px;
          text-decoration:none;color:#1e293b;font-weight:600">
          <div style="width:44px;height:44px;background:#1a9e5c;border-radius:10px;
            display:flex;align-items:center;justify-content:center;
            color:white;font-size:1.3rem;font-weight:800;flex-shrink:0">
            ${e.nombre.charAt(0)}
          </div>
          <div>
            <div style="font-size:1rem;font-weight:700">${e.nombre}</div>
            <div style="font-size:.8rem;color:#64748b">RTN: ${e.rtn || 'N/A'}</div>
          </div>
          <span style="margin-left:auto;color:#94a3b8">→</span>
        </a>`).join('')}
    </div>
  </div>`;
  res.send(layout(content, { title: 'Seleccionar Empresa', user: req.session.user, empresa: null }));
});

router.get('/seleccionar/:id', (req, res) => {
  const emp = db.prepare('SELECT * FROM empresas WHERE id=? AND activa=1').get(req.params.id);
  if (!emp) return res.redirect('/empresas/seleccionar');
  req.session.empresa = emp;
  res.redirect('/dashboard');
});

/* ── Cambio de empresa desde sidebar ── */
router.post('/select', (req, res) => {
  const emp = db.prepare('SELECT * FROM empresas WHERE id=? AND activa=1').get(req.body.empresaId);
  if (!emp) return res.json({ ok: false, error: 'Empresa no encontrada' });
  req.session.empresa = emp;
  res.json({ ok: true });
});

/* ── Listado principal ── */
router.get('/', requireAdmin, (req, res) => {
  const lista = db.prepare('SELECT * FROM empresas ORDER BY id').all();

  const filas = lista.map(e => {
    // Serializar de forma segura para pasar al onclick
    const safe = Buffer.from(JSON.stringify(e)).toString('base64');
    return `
    <tr>
      <td><strong>${e.nombre}</strong></td>
      <td>${e.rtn || '-'}</td>
      <td>${e.telefono || '-'}</td>
      <td>${e.email || '-'}</td>
      <td><span class="badge ${e.activa ? 'badge-success' : 'badge-muted'}">${e.activa ? 'Activa' : 'Inactiva'}</span></td>
      <td>
        <div style="display:flex;gap:6px">
          <button onclick="usarEmpresa(${e.id})" class="btn btn-success btn-sm" title="Usar esta empresa">🏠</button>
          <button onclick="editarEmpresa('${safe}')" class="btn btn-warning btn-sm" title="Editar">✏️</button>
          <button onclick="eliminarEmpresa(${e.id})" class="btn btn-danger btn-sm" title="Eliminar">🗑️</button>
        </div>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="6" style="text-align:center;padding:40px;color:#94a3b8">Sin empresas registradas</td></tr>';

  const content = `
  <div class="page-header">
    <div class="page-header-left">
      <h1>🏢 Gestión de Empresas</h1>
      <p>Administración de empresas del sistema</p>
    </div>
    <div class="page-header-actions">
      <button id="btn-nueva-empresa" class="btn btn-primary">+ Nueva Empresa</button>
    </div>
  </div>

  <div class="card">
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Nombre</th><th>RTN</th><th>Teléfono</th>
            <th>Email</th><th>Estado</th><th>Acciones</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
    </div>
  </div>

  <!-- MODAL EMPRESA -->
  <div class="modal-overlay" id="modal-emp">
    <div class="modal">
      <div class="modal-header">
        <h3 id="modal-emp-title">Nueva Empresa</h3>
        <button class="modal-close" id="btn-cerrar-modal">✕</button>
      </div>
      <div class="modal-body">
        <input type="hidden" id="emp-id">
        <div class="form-grid form-grid-2">
          <div class="form-group span-2">
            <label>Nombre de la Empresa *</label>
            <input type="text" id="emp-nombre" placeholder="Ej: Inversiones Buenos Aires S.A.">
          </div>
          <div class="form-group">
            <label>RTN</label>
            <input type="text" id="emp-rtn" placeholder="0501-1990-00001">
          </div>
          <div class="form-group">
            <label>Teléfono</label>
            <input type="text" id="emp-telefono" placeholder="2220-0000">
          </div>
          <div class="form-group span-2">
            <label>Dirección</label>
            <input type="text" id="emp-direccion" placeholder="Dirección completa">
          </div>
          <div class="form-group">
            <label>Email</label>
            <input type="email" id="emp-email" placeholder="empresa@ejemplo.hn">
          </div>
          <div class="form-group">
            <label>Estado</label>
            <select id="emp-activa">
              <option value="1">Activa</option>
              <option value="0">Inactiva</option>
            </select>
          </div>
        </div>
        <div id="emp-error" class="alert alert-danger" style="display:none;margin-top:12px"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="btn-cancelar-modal">Cancelar</button>
        <button class="btn btn-primary" id="btn-guardar-emp">💾 Guardar</button>
      </div>
    </div>
  </div>

  <script>
  (function() {
    const modal     = document.getElementById('modal-emp');
    const titulo    = document.getElementById('modal-emp-title');
    const idInput   = document.getElementById('emp-id');
    const errBox    = document.getElementById('emp-error');
    const btnGuardar= document.getElementById('btn-guardar-emp');

    function abrirModal() { modal.classList.add('open'); }
    function cerrarModal() {
      modal.classList.remove('open');
      errBox.style.display = 'none';
    }

    function limpiarForm() {
      idInput.value = '';
      ['emp-nombre','emp-rtn','emp-telefono','emp-direccion','emp-email'].forEach(id => {
        document.getElementById(id).value = '';
      });
      document.getElementById('emp-activa').value = '1';
      errBox.style.display = 'none';
    }

    // Botón Nueva Empresa
    document.getElementById('btn-nueva-empresa').addEventListener('click', function() {
      titulo.textContent = 'Nueva Empresa';
      limpiarForm();
      abrirModal();
    });

    // Cerrar modal
    document.getElementById('btn-cerrar-modal').addEventListener('click', cerrarModal);
    document.getElementById('btn-cancelar-modal').addEventListener('click', cerrarModal);
    modal.addEventListener('click', function(ev) { if (ev.target === modal) cerrarModal(); });

    // Editar empresa — llamada desde el botón de la tabla
    window.editarEmpresa = function(b64) {
      const e = JSON.parse(atob(b64));
      titulo.textContent = 'Editar Empresa';
      idInput.value = e.id;
      document.getElementById('emp-nombre').value    = e.nombre    || '';
      document.getElementById('emp-rtn').value       = e.rtn       || '';
      document.getElementById('emp-telefono').value  = e.telefono  || '';
      document.getElementById('emp-direccion').value = e.direccion || '';
      document.getElementById('emp-email').value     = e.email     || '';
      document.getElementById('emp-activa').value    = String(e.activa != null ? e.activa : 1);
      errBox.style.display = 'none';
      abrirModal();
    };

    // Usar empresa como activa
    window.usarEmpresa = function(id) {
      window.location = '/empresas/seleccionar/' + id;
    };

    // Guardar (crear o editar)
    btnGuardar.addEventListener('click', async function() {
      const nombre = document.getElementById('emp-nombre').value.trim();
      if (!nombre) {
        errBox.textContent = 'El nombre de la empresa es obligatorio.';
        errBox.style.display = 'block';
        document.getElementById('emp-nombre').focus();
        return;
      }

      const id     = idInput.value.trim();
      const url    = id ? '/empresas/' + id : '/empresas';
      const method = id ? 'PUT' : 'POST';

      btnGuardar.disabled    = true;
      btnGuardar.textContent = '⏳ Guardando...';
      errBox.style.display   = 'none';

      try {
        const resp = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nombre,
            rtn:       document.getElementById('emp-rtn').value.trim(),
            telefono:  document.getElementById('emp-telefono').value.trim(),
            direccion: document.getElementById('emp-direccion').value.trim(),
            email:     document.getElementById('emp-email').value.trim(),
            activa:    document.getElementById('emp-activa').value
          })
        });
        const data = await resp.json();
        if (data.ok) {
          cerrarModal();
          location.reload();
        } else {
          errBox.textContent = data.error || 'Error al guardar';
          errBox.style.display = 'block';
        }
      } catch(err) {
        errBox.textContent = 'Error de conexión: ' + err.message;
        errBox.style.display = 'block';
      } finally {
        btnGuardar.disabled    = false;
        btnGuardar.textContent = '💾 Guardar';
      }
    });

    // Eliminar empresa
    window.eliminarEmpresa = async function(id) {
      if (!confirm('¿Eliminar esta empresa? No se puede deshacer.')) return;
      try {
        const resp = await fetch('/empresas/' + id, { method: 'DELETE' });
        const data = await resp.json();
        if (data.ok) location.reload();
        else alert('No se puede eliminar: ' + (data.error || 'Error'));
      } catch(err) {
        alert('Error de conexión: ' + err.message);
      }
    };
  })();
  </script>`;

  res.send(layout(content, {
    title: 'Empresas', user: req.session.user,
    empresa: req.session.empresa, empresas: (res.locals.empresas||[]),
    activePage: 'empresas'
  }));
});

/* ── APIs ── */
router.post('/', requireAdmin, (req, res) => {
  const { nombre, rtn, direccion, telefono, email, activa } = req.body;
  if (!nombre?.trim()) return res.json({ ok: false, error: 'El nombre es obligatorio' });
  try {
    const r = db.prepare('INSERT INTO empresas (nombre,rtn,direccion,telefono,email,activa) VALUES (?,?,?,?,?,?)')
      .run(nombre.trim(), rtn||null, direccion||null, telefono||null, email||null, activa??1);
    db.prepare('INSERT OR IGNORE INTO configuracion (empresa_id) VALUES (?)').run(r.lastInsertRowid);
    res.json({ ok: true, id: r.lastInsertRowid });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

router.put('/:id', requireAdmin, (req, res) => {
  const { nombre, rtn, direccion, telefono, email, activa } = req.body;
  if (!nombre?.trim()) return res.json({ ok: false, error: 'El nombre es obligatorio' });
  try {
    db.prepare("UPDATE empresas SET nombre=?,rtn=?,direccion=?,telefono=?,email=?,activa=?,updated_at=datetime('now','localtime') WHERE id=?")
      .run(nombre.trim(), rtn||null, direccion||null, telefono||null, email||null, activa??1, req.params.id);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

router.delete('/:id', requireAdmin, (req, res) => {
  try {
    const n = db.prepare('SELECT COUNT(*) as n FROM cuadres_diarios WHERE empresa_id=?').get(req.params.id)?.n || 0;
    if (n > 0) return res.json({ ok: false, error: 'Tiene ' + n + ' cuadres registrados' });
    db.prepare('DELETE FROM empresas WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

module.exports = router;
