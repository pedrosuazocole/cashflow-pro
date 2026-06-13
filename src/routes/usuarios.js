// src/routes/usuarios.js — CRUD corregido
'use strict';
const express = require('express');
const router  = express.Router();
const db      = require('../database');
const bcrypt  = require('bcryptjs');
const layout  = require('./layout');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.use(requireAuth, requireAdmin);

router.get('/', (req, res) => {
  const usuarios = db.prepare(`
    SELECT u.*, e.nombre as empresa_nombre
    FROM usuarios u
    LEFT JOIN empresas e ON u.empresa_id = e.id
    ORDER BY u.id
  `).all();
  const empresas = db.prepare('SELECT id, nombre FROM empresas WHERE activa=1 ORDER BY nombre').all();

  const filas = usuarios.map(u => {
    const safe = Buffer.from(JSON.stringify(u)).toString('base64');
    return `
    <tr>
      <td>
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:32px;height:32px;background:#1a9e5c;border-radius:50%;
            display:flex;align-items:center;justify-content:center;
            color:white;font-weight:700;font-size:.85rem;flex-shrink:0">
            ${u.nombre.charAt(0).toUpperCase()}
          </div>
          ${u.nombre}
        </div>
      </td>
      <td>${u.email}</td>
      <td><span class="badge ${u.rol==='admin'?'badge-info':u.rol==='supervisor'?'badge-warning':'badge-muted'}">${u.rol}</span></td>
      <td>${u.empresa_nombre || 'Todas'}</td>
      <td><span class="badge ${u.activo?'badge-success':'badge-danger'}">${u.activo?'Activo':'Inactivo'}</span></td>
      <td>
        <div style="display:flex;gap:6px">
          <button onclick="editarUsuario('${safe}')" class="btn btn-warning btn-sm">✏️</button>
          <button onclick="toggleUsuario(${u.id},${u.activo})" class="btn btn-secondary btn-sm">${u.activo?'🚫':'✅'}</button>
          <button onclick="eliminarUsuario(${u.id})" class="btn btn-danger btn-sm">🗑️</button>
        </div>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="6" style="text-align:center;padding:40px;color:#94a3b8">Sin usuarios</td></tr>';

  const optEmp = empresas.map(e => `<option value="${e.id}">${e.nombre}</option>`).join('');

  const content = `
  <div class="page-header">
    <div class="page-header-left">
      <h1>👥 Gestión de Usuarios</h1>
      <p>Control de acceso y roles del sistema</p>
    </div>
    <div class="page-header-actions">
      <button id="btn-nuevo-usuario" class="btn btn-primary">+ Nuevo Usuario</button>
    </div>
  </div>

  <div class="card">
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Nombre</th><th>Email</th><th>Rol</th>
            <th>Empresa</th><th>Estado</th><th>Acciones</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
    </div>
  </div>

  <!-- MODAL USUARIO -->
  <div class="modal-overlay" id="modal-usr">
    <div class="modal">
      <div class="modal-header">
        <h3 id="modal-usr-title">Nuevo Usuario</h3>
        <button class="modal-close" id="btn-cerrar-usr">✕</button>
      </div>
      <div class="modal-body">
        <input type="hidden" id="usr-id">
        <div class="form-grid form-grid-2">
          <div class="form-group span-2">
            <label>Nombre Completo *</label>
            <input type="text" id="usr-nombre" placeholder="Nombre completo">
          </div>
          <div class="form-group">
            <label>Email *</label>
            <input type="email" id="usr-email" placeholder="correo@ejemplo.hn">
          </div>
          <div class="form-group">
            <label id="usr-pass-label">Contraseña *</label>
            <input type="password" id="usr-password" placeholder="Mínimo 6 caracteres">
          </div>
          <div class="form-group">
            <label>Rol</label>
            <select id="usr-rol">
              <option value="operador">Operador</option>
              <option value="supervisor">Supervisor</option>
              <option value="admin">Administrador</option>
            </select>
          </div>
          <div class="form-group">
            <label>Empresa</label>
            <select id="usr-empresa">
              <option value="">Todas las empresas</option>
              ${optEmp}
            </select>
          </div>
        </div>
        <div id="usr-error" class="alert alert-danger" style="display:none;margin-top:12px"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="btn-cancelar-usr">Cancelar</button>
        <button class="btn btn-primary" id="btn-guardar-usr">💾 Guardar</button>
      </div>
    </div>
  </div>

  <script>
  (function() {
    const modal      = document.getElementById('modal-usr');
    const titulo     = document.getElementById('modal-usr-title');
    const idInput    = document.getElementById('usr-id');
    const errBox     = document.getElementById('usr-error');
    const btnGuardar = document.getElementById('btn-guardar-usr');
    const passLabel  = document.getElementById('usr-pass-label');

    function abrirModal() { modal.classList.add('open'); }
    function cerrarModal() { modal.classList.remove('open'); errBox.style.display='none'; }

    function limpiarForm() {
      idInput.value = '';
      ['usr-nombre','usr-email','usr-password'].forEach(id => document.getElementById(id).value='');
      document.getElementById('usr-rol').value     = 'operador';
      document.getElementById('usr-empresa').value = '';
      passLabel.textContent = 'Contraseña *';
      errBox.style.display  = 'none';
    }

    document.getElementById('btn-nuevo-usuario').addEventListener('click', function() {
      titulo.textContent = 'Nuevo Usuario';
      limpiarForm();
      abrirModal();
    });

    document.getElementById('btn-cerrar-usr').addEventListener('click', cerrarModal);
    document.getElementById('btn-cancelar-usr').addEventListener('click', cerrarModal);
    modal.addEventListener('click', function(ev) { if (ev.target === modal) cerrarModal(); });

    window.editarUsuario = function(b64) {
      const u = JSON.parse(atob(b64));
      titulo.textContent = 'Editar Usuario';
      idInput.value = u.id;
      document.getElementById('usr-nombre').value  = u.nombre  || '';
      document.getElementById('usr-email').value   = u.email   || '';
      document.getElementById('usr-password').value= '';
      document.getElementById('usr-rol').value     = u.rol     || 'operador';
      document.getElementById('usr-empresa').value = u.empresa_id || '';
      passLabel.textContent = 'Contraseña (dejar vacío para no cambiar)';
      errBox.style.display  = 'none';
      abrirModal();
    };

    btnGuardar.addEventListener('click', async function() {
      const nombre = document.getElementById('usr-nombre').value.trim();
      const email  = document.getElementById('usr-email').value.trim();
      const pass   = document.getElementById('usr-password').value;
      const id     = idInput.value.trim();

      if (!nombre) { mostrarError('El nombre es obligatorio'); return; }
      if (!email)  { mostrarError('El email es obligatorio');  return; }
      if (!id && !pass) { mostrarError('La contraseña es obligatoria para nuevos usuarios'); return; }

      btnGuardar.disabled = true;
      btnGuardar.textContent = '⏳ Guardando...';
      errBox.style.display = 'none';

      try {
        const resp = await fetch(id ? '/usuarios/'+id : '/usuarios', {
          method: id ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nombre, email, password: pass,
            rol:        document.getElementById('usr-rol').value,
            empresa_id: document.getElementById('usr-empresa').value || null
          })
        });
        const data = await resp.json();
        if (data.ok) { cerrarModal(); location.reload(); }
        else mostrarError(data.error || 'Error al guardar');
      } catch(err) {
        mostrarError('Error de conexión: ' + err.message);
      } finally {
        btnGuardar.disabled = false;
        btnGuardar.textContent = '💾 Guardar';
      }
    });

    function mostrarError(msg) {
      errBox.textContent = msg;
      errBox.style.display = 'block';
    }

    window.toggleUsuario = async function(id, activo) {
      if (!confirm(activo ? '¿Desactivar este usuario?' : '¿Activar este usuario?')) return;
      const resp = await fetch('/usuarios/'+id+'/toggle', { method:'POST' });
      const data = await resp.json();
      if (data.ok) location.reload();
      else alert('Error: ' + data.error);
    };

    window.eliminarUsuario = async function(id) {
      if (!confirm('¿Eliminar este usuario? Esta acción no se puede deshacer.')) return;
      const resp = await fetch('/usuarios/'+id, { method:'DELETE' });
      const data = await resp.json();
      if (data.ok) location.reload();
      else alert('Error: ' + (data.error || 'No se pudo eliminar'));
    };
  })();
  </script>`;

  res.send(layout(content, {
    title: 'Usuarios', user: req.session.user,
    empresa: req.session.empresa, empresas: (res.locals.empresas||[]),
    activePage: 'usuarios'
  }));
});

/* ── APIs ── */
router.post('/', (req, res) => {
  const { nombre, email, password, rol, empresa_id } = req.body;
  if (!password) return res.json({ ok: false, error: 'La contraseña es requerida' });
  try {
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('INSERT INTO usuarios (nombre,email,password,rol,empresa_id) VALUES (?,?,?,?,?)')
      .run(nombre, email, hash, rol||'operador', empresa_id||null);
    res.json({ ok: true });
  } catch(e) {
    res.json({ ok: false, error: e.message.includes('UNIQUE') ? 'El email ya existe' : e.message });
  }
});

router.put('/:id', (req, res) => {
  const { nombre, email, password, rol, empresa_id } = req.body;
  try {
    if (password) {
      const hash = bcrypt.hashSync(password, 10);
      db.prepare("UPDATE usuarios SET nombre=?,email=?,password=?,rol=?,empresa_id=?,updated_at=datetime('now','localtime') WHERE id=?")
        .run(nombre, email, hash, rol, empresa_id||null, req.params.id);
    } else {
      db.prepare("UPDATE usuarios SET nombre=?,email=?,rol=?,empresa_id=?,updated_at=datetime('now','localtime') WHERE id=?")
        .run(nombre, email, rol, empresa_id||null, req.params.id);
    }
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

router.post('/:id/toggle', (req, res) => {
  const u = db.prepare('SELECT activo FROM usuarios WHERE id=?').get(req.params.id);
  if (!u) return res.json({ ok: false, error: 'No encontrado' });
  db.prepare('UPDATE usuarios SET activo=? WHERE id=?').run(u.activo ? 0 : 1, req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  if (parseInt(req.params.id) === req.session.user.id)
    return res.json({ ok: false, error: 'No podés eliminar tu propio usuario' });
  db.prepare('DELETE FROM usuarios WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
