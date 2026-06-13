// src/routes/notificaciones.js
'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../database');
const layout  = require('./layout');
const wa      = require('../services/whatsapp');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.use(requireAuth);

// ── Página principal ──────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const empId = req.session.empresa?.id;
  if (!empId) return res.redirect('/empresas/seleccionar');

  const contactos = db.prepare(
    'SELECT * FROM notif_contactos WHERE empresa_id=? ORDER BY id'
  ).all(empId);

  // Configuración de la empresa
  let cfg = db.prepare('SELECT * FROM notif_config WHERE empresa_id=?').get(empId);
  if (!cfg) {
    db.prepare('INSERT OR IGNORE INTO notif_config (empresa_id) VALUES (?)').run(empId);
    cfg = db.prepare('SELECT * FROM notif_config WHERE empresa_id=?').get(empId);
  }

  // Últimos 30 logs
  const logs = db.prepare(`
    SELECT l.*, c.nombre as contacto_nombre, c.telefono as contacto_tel
    FROM notif_log l
    LEFT JOIN notif_contactos c ON c.id = l.contacto_id
    WHERE l.empresa_id=?
    ORDER BY l.created_at DESC LIMIT 30
  `).all(empId);

  const fmtFecha = s => s ? s.substring(0,16).replace('T',' ') : '-';

  const filasContactos = contactos.map(c => {
    const safe = Buffer.from(JSON.stringify(c)).toString('base64');
    return `
    <tr>
      <td><strong>${c.nombre}</strong></td>
      <td>📱 ${c.telefono}</td>
      <td><span class="badge ${c.activo ? 'badge-success' : 'badge-muted'}">${c.activo ? 'Activo' : 'Inactivo'}</span></td>
      <td>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button onclick="probarContacto(${c.id},'${c.nombre}')" class="btn btn-info btn-sm" title="Enviar prueba">📤 Probar</button>
          <button onclick="editarContacto('${safe}')" class="btn btn-warning btn-sm">✏️</button>
          <button onclick="eliminarContacto(${c.id})" class="btn btn-danger btn-sm">🗑️</button>
        </div>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="4" style="text-align:center;padding:30px;color:#94a3b8">Sin contactos registrados</td></tr>';

  const iconoLog = t => ({
    cuadre_diario: '💰', libro_ventas: '📋', asientos_contables: '📒',
    comparativos: '📊', manual: '✉️', prueba: '🧪'
  }[t] || '📨');

  const filasLogs = logs.map(l => `
    <tr>
      <td style="font-size:.78rem;color:#64748b">${fmtFecha(l.created_at)}</td>
      <td>${iconoLog(l.tipo)} ${l.tipo.replace(/_/g,' ')}</td>
      <td>${l.contacto_nombre || '-'}<br><small style="color:#94a3b8">${l.contacto_tel || ''}</small></td>
      <td><span class="badge ${l.estado==='enviado'?'badge-success':'badge-danger'}">${l.estado}</span></td>
      <td style="font-size:.75rem;color:#64748b;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l.respuesta||'-'}</td>
    </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;padding:20px;color:#94a3b8">Sin registros de envíos</td></tr>';

  const content = `
  <div class="page-header">
    <div class="page-header-left">
      <h1>🔔 Notificaciones WhatsApp</h1>
      <p>Configuración de envíos automáticos y manuales via TextMeBot</p>
    </div>
    <div class="page-header-actions">
      <button id="btn-nuevo-contacto" class="btn btn-primary">➕ Agregar Contacto</button>
    </div>
  </div>

  <!-- TABS -->
  <div class="tabs-container">
    <div class="tabs-header">
      <button class="tab-btn active" data-tab="tab-contactos">👥 Contactos</button>
      <button class="tab-btn" data-tab="tab-config">⚙️ Configuración</button>
      <button class="tab-btn" data-tab="tab-enviar">📤 Enviar Ahora</button>
      <button class="tab-btn" data-tab="tab-logs">📜 Historial</button>
    </div>

    <!-- TAB: CONTACTOS -->
    <div class="tab-pane active" id="tab-contactos">
      <div class="card mt-4">
        <div class="card-header">
          <span class="card-title">📱 Contactos de WhatsApp</span>
          <small style="color:#64748b">Números que recibirán las notificaciones</small>
        </div>
        <div class="table-wrapper">
          <table>
            <thead>
              <tr><th>Nombre</th><th>Teléfono</th><th>Estado</th><th>Acciones</th></tr>
            </thead>
            <tbody>${filasContactos}</tbody>
          </table>
        </div>
      </div>

      <!-- Info TextMeBot -->
      <div class="alert alert-info mt-4" style="display:flex;gap:10px;align-items:flex-start">
        <span style="font-size:1.3rem">ℹ️</span>
        <div>
          <strong>¿Cómo obtener el API Key de TextMeBot?</strong><br>
          1. Enviá un mensaje de WhatsApp al número <strong>+1 (888) 999-5769</strong> con el texto: <code>join</code><br>
          2. Recibirás tu API Key personal<br>
          3. Ingresala en la pestaña <strong>Configuración</strong><br>
          4. Los números deben incluir código de país (ej: <strong>50494502710</strong> para Honduras)
        </div>
      </div>
    </div>

    <!-- TAB: CONFIGURACIÓN -->
    <div class="tab-pane" id="tab-config">
      <div class="card mt-4">
        <div class="card-header"><span class="card-title">⚙️ Configuración de Envíos Automáticos</span></div>
        <div class="card-body">
          <div id="cfg-error" class="alert alert-danger" style="display:none;margin-bottom:16px"></div>
          <div id="cfg-ok"    class="alert alert-success" style="display:none;margin-bottom:16px"></div>

          <div class="form-grid form-grid-2">
            <div class="form-group span-2">
              <label>🔑 API Key de TextMeBot *</label>
              <input type="text" id="cfg-apikey" value="${cfg.textmebot_key||''}"
                placeholder="Tu API Key de TextMeBot">
              <span class="form-hint">Obtenela enviando "join" al +1 (888) 999-5769 por WhatsApp</span>
            </div>

            <div class="form-group span-2">
              <label style="font-size:.9rem;font-weight:700;color:#1e293b">📅 Envíos Automáticos Diarios</label>
            </div>

            <!-- Cuadre Diario -->
            <div class="form-group">
              <label>
                <input type="checkbox" id="cfg-cuadre" ${cfg.envio_cuadre?'checked':''}>
                💰 Cuadre Diario
              </label>
              <input type="time" id="cfg-hora-cuadre" value="${cfg.hora_cuadre||'20:00'}" class="mt-2">
            </div>

            <!-- Libro de Ventas -->
            <div class="form-group">
              <label>
                <input type="checkbox" id="cfg-libro" ${cfg.envio_libro?'checked':''}>
                📋 Libro de Ventas
              </label>
              <input type="time" id="cfg-hora-libro" value="${cfg.hora_libro||'14:00'}" class="mt-2">
            </div>

            <!-- Asientos Contables -->
            <div class="form-group">
              <label>
                <input type="checkbox" id="cfg-asientos" ${cfg.envio_asientos?'checked':''}>
                📒 Asientos Contables
              </label>
              <input type="time" id="cfg-hora-asientos" value="${cfg.hora_asientos||'15:00'}" class="mt-2">
            </div>

            <!-- Comparativos -->
            <div class="form-group">
              <label>
                <input type="checkbox" id="cfg-comparativo" ${cfg.envio_comparativo?'checked':''}>
                📊 Comparativos (Viernes)
              </label>
              <input type="time" id="cfg-hora-comparativo" value="${cfg.hora_comparativo||'13:00'}" class="mt-2">
            </div>

            <div class="form-group span-2">
              <label>
                <input type="checkbox" id="cfg-activo" ${cfg.activo?'checked':''}>
                ✅ Notificaciones activas
              </label>
            </div>
          </div>

          <div class="mt-4">
            <button id="btn-guardar-cfg" class="btn btn-primary">💾 Guardar Configuración</button>
          </div>
        </div>
      </div>
    </div>

    <!-- TAB: ENVIAR AHORA -->
    <div class="tab-pane" id="tab-enviar">
      <div class="card mt-4">
        <div class="card-header"><span class="card-title">📤 Enviar Notificación Manual</span></div>
        <div class="card-body">
          <div id="envio-resultado" class="alert" style="display:none;margin-bottom:16px"></div>

          <div class="form-grid form-grid-2">
            <div class="form-group">
              <label>Tipo de reporte a enviar</label>
              <select id="envio-tipo">
                <option value="cuadre_hoy">💰 Cuadre de Hoy</option>
                <option value="cuadre_fecha">💰 Cuadre de una Fecha específica</option>
                <option value="libro_ventas">📋 Libro de Ventas (mes actual)</option>
                <option value="asientos">📒 Asientos Contables (mes actual)</option>
                <option value="comparativos">📊 Comparativos (año actual)</option>
                <option value="mensaje_libre">✉️ Mensaje Personalizado</option>
              </select>
            </div>

            <div class="form-group" id="grp-fecha" style="display:none">
              <label>Fecha del Cuadre</label>
              <input type="date" id="envio-fecha" value="${new Date().toISOString().split('T')[0]}">
            </div>

            <div class="form-group span-2" id="grp-mensaje" style="display:none">
              <label>Mensaje personalizado</label>
              <textarea id="envio-mensaje" rows="5" placeholder="Escribí tu mensaje aquí..."></textarea>
            </div>

            <div class="form-group span-2">
              <label>Enviar a</label>
              <select id="envio-destino">
                <option value="todos">📱 Todos los contactos activos</option>
                ${contactos.filter(c=>c.activo).map(c =>
                  `<option value="${c.id}">📱 ${c.nombre} (${c.telefono})</option>`
                ).join('')}
              </select>
            </div>
          </div>

          <div class="mt-4">
            <button id="btn-enviar-ahora" class="btn btn-primary btn-lg">
              📤 Enviar Ahora
            </button>
            <span id="envio-spinner" class="spinner" style="display:none;margin-left:12px"></span>
          </div>
        </div>
      </div>
    </div>

    <!-- TAB: HISTORIAL -->
    <div class="tab-pane" id="tab-logs">
      <div class="card mt-4">
        <div class="card-header">
          <span class="card-title">📜 Historial de Envíos</span>
          <span style="font-size:.8rem;color:#64748b">Últimos 30 envíos</span>
        </div>
        <div class="table-wrapper">
          <table>
            <thead>
              <tr><th>Fecha/Hora</th><th>Tipo</th><th>Destinatario</th><th>Estado</th><th>Respuesta</th></tr>
            </thead>
            <tbody>${filasLogs}</tbody>
          </table>
        </div>
      </div>
    </div>
  </div>

  <!-- MODAL CONTACTO -->
  <div class="modal-overlay" id="modal-contacto">
    <div class="modal">
      <div class="modal-header">
        <h3 id="modal-contacto-title">Nuevo Contacto</h3>
        <button class="modal-close" id="btn-cerrar-contacto">✕</button>
      </div>
      <div class="modal-body">
        <input type="hidden" id="cont-id">
        <div class="form-grid">
          <div class="form-group">
            <label>Nombre *</label>
            <input type="text" id="cont-nombre" placeholder="Ej: Pedro Suazo">
          </div>
          <div class="form-group">
            <label>Número WhatsApp *</label>
            <input type="text" id="cont-telefono" placeholder="50494502710">
            <span class="form-hint">Código de país + número, sin espacios ni guiones</span>
          </div>
          <div class="form-group">
            <label><input type="checkbox" id="cont-activo" checked> Activo</label>
          </div>
        </div>
        <div id="cont-error" class="alert alert-danger" style="display:none;margin-top:12px"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="btn-cancelar-contacto">Cancelar</button>
        <button class="btn btn-primary" id="btn-guardar-contacto">💾 Guardar</button>
      </div>
    </div>
  </div>

  <script>
  (function() {
    // ── Tabs ──
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
      });
    });

    // ── Modal Contacto ──
    const modal    = document.getElementById('modal-contacto');
    const titulo   = document.getElementById('modal-contacto-title');
    const idInput  = document.getElementById('cont-id');
    const errBox   = document.getElementById('cont-error');

    function abrirModal() { modal.classList.add('open'); }
    function cerrarModal() { modal.classList.remove('open'); errBox.style.display='none'; }

    document.getElementById('btn-nuevo-contacto').addEventListener('click', () => {
      titulo.textContent = 'Nuevo Contacto';
      idInput.value = '';
      document.getElementById('cont-nombre').value = '';
      document.getElementById('cont-telefono').value = '';
      document.getElementById('cont-activo').checked = true;
      abrirModal();
    });
    document.getElementById('btn-cerrar-contacto').addEventListener('click', cerrarModal);
    document.getElementById('btn-cancelar-contacto').addEventListener('click', cerrarModal);
    modal.addEventListener('click', e => { if (e.target===modal) cerrarModal(); });

    window.editarContacto = function(b64) {
      const c = JSON.parse(atob(b64));
      titulo.textContent = 'Editar Contacto';
      idInput.value = c.id;
      document.getElementById('cont-nombre').value   = c.nombre   || '';
      document.getElementById('cont-telefono').value = c.telefono || '';
      document.getElementById('cont-activo').checked = !!c.activo;
      errBox.style.display = 'none';
      abrirModal();
    };

    document.getElementById('btn-guardar-contacto').addEventListener('click', async () => {
      const nombre   = document.getElementById('cont-nombre').value.trim();
      const telefono = document.getElementById('cont-telefono').value.trim();
      const id       = idInput.value.trim();
      if (!nombre)   { errBox.textContent='El nombre es obligatorio';   errBox.style.display='block'; return; }
      if (!telefono) { errBox.textContent='El teléfono es obligatorio'; errBox.style.display='block'; return; }
      if (!/^[0-9]{7,15}$/.test(telefono)) {
        errBox.textContent='El número debe tener solo dígitos (7-15), incluyendo código de país. Ej: 50494502710';
        errBox.style.display='block'; return;
      }
      const btn = document.getElementById('btn-guardar-contacto');
      btn.disabled = true; btn.textContent = '⏳ Guardando...';
      try {
        const resp = await fetch(id ? '/notificaciones/contactos/'+id : '/notificaciones/contactos', {
          method: id ? 'PUT' : 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ nombre, telefono, activo: document.getElementById('cont-activo').checked ? 1 : 0 })
        });
        const data = await resp.json();
        if (data.ok) { cerrarModal(); location.reload(); }
        else { errBox.textContent = data.error || 'Error al guardar'; errBox.style.display='block'; }
      } catch(e) { errBox.textContent='Error: '+e.message; errBox.style.display='block'; }
      finally { btn.disabled=false; btn.textContent='💾 Guardar'; }
    });

    window.eliminarContacto = async function(id) {
      if (!confirm('¿Eliminar este contacto?')) return;
      const resp = await fetch('/notificaciones/contactos/'+id, { method:'DELETE' });
      const data = await resp.json();
      if (data.ok) location.reload();
      else alert('Error: ' + data.error);
    };

    window.probarContacto = async function(id, nombre) {
      if (!confirm('Enviar mensaje de prueba a ' + nombre + '?')) return;
      const resp = await fetch('/notificaciones/probar/'+id, { method:'POST' });
      const data = await resp.json();
      alert(data.ok ? '✅ Mensaje enviado correctamente' : '❌ Error: ' + (data.error || data.respuesta));
    };

    // ── Guardar configuración ──
    document.getElementById('btn-guardar-cfg').addEventListener('click', async () => {
      const btn = document.getElementById('btn-guardar-cfg');
      btn.disabled=true; btn.textContent='⏳ Guardando...';
      document.getElementById('cfg-error').style.display='none';
      document.getElementById('cfg-ok').style.display='none';
      try {
        const resp = await fetch('/notificaciones/config', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({
            textmebot_key:    document.getElementById('cfg-apikey').value.trim(),
            envio_cuadre:     document.getElementById('cfg-cuadre').checked ? 1 : 0,
            hora_cuadre:      document.getElementById('cfg-hora-cuadre').value,
            envio_libro:      document.getElementById('cfg-libro').checked ? 1 : 0,
            hora_libro:       document.getElementById('cfg-hora-libro').value,
            envio_asientos:   document.getElementById('cfg-asientos').checked ? 1 : 0,
            hora_asientos:    document.getElementById('cfg-hora-asientos').value,
            envio_comparativo: document.getElementById('cfg-comparativo').checked ? 1 : 0,
            hora_comparativo:  document.getElementById('cfg-hora-comparativo').value,
            activo:           document.getElementById('cfg-activo').checked ? 1 : 0
          })
        });
        const data = await resp.json();
        if (data.ok) {
          document.getElementById('cfg-ok').textContent = '✅ Configuración guardada correctamente';
          document.getElementById('cfg-ok').style.display = 'block';
        } else {
          document.getElementById('cfg-error').textContent = data.error || 'Error al guardar';
          document.getElementById('cfg-error').style.display = 'block';
        }
      } catch(e) {
        document.getElementById('cfg-error').textContent = 'Error: '+e.message;
        document.getElementById('cfg-error').style.display='block';
      } finally { btn.disabled=false; btn.textContent='💾 Guardar Configuración'; }
    });

    // ── Enviar ahora: mostrar/ocultar campos según tipo ──
    document.getElementById('envio-tipo').addEventListener('change', function() {
      document.getElementById('grp-fecha').style.display    = this.value==='cuadre_fecha' ? 'block' : 'none';
      document.getElementById('grp-mensaje').style.display  = this.value==='mensaje_libre' ? 'block' : 'none';
    });

    // ── Enviar ahora ──
    document.getElementById('btn-enviar-ahora').addEventListener('click', async () => {
      const tipo    = document.getElementById('envio-tipo').value;
      const destino = document.getElementById('envio-destino').value;
      const fecha   = document.getElementById('envio-fecha').value;
      const mensaje = document.getElementById('envio-mensaje').value.trim();
      const resEl   = document.getElementById('envio-resultado');
      const btn     = document.getElementById('btn-enviar-ahora');
      const spin    = document.getElementById('envio-spinner');

      if (tipo==='mensaje_libre' && !mensaje) {
        resEl.className='alert alert-danger'; resEl.textContent='Escribí el mensaje primero'; resEl.style.display='block'; return;
      }

      btn.disabled=true; spin.style.display='inline-block';
      resEl.style.display='none';

      try {
        const resp = await fetch('/notificaciones/enviar', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ tipo, destino, fecha, mensaje })
        });
        const data = await resp.json();
        resEl.className = 'alert ' + (data.ok ? 'alert-success' : 'alert-danger');
        resEl.textContent = data.ok
          ? '✅ ' + (data.mensaje || 'Notificación enviada correctamente')
          : '❌ ' + (data.error || 'Error al enviar');
        resEl.style.display = 'block';
      } catch(e) {
        resEl.className='alert alert-danger';
        resEl.textContent='❌ Error de conexión: '+e.message;
        resEl.style.display='block';
      } finally { btn.disabled=false; spin.style.display='none'; }
    });
  })();
  </script>
  `;

  res.send(layout(content, {
    title: 'Notificaciones', user: req.session.user,
    empresa: req.session.empresa, empresas: (res.locals.empresas||[]),
    activePage: 'notificaciones'
  }));
});

// ── API: Guardar configuración ────────────────────────────────────────────────
router.post('/config', requireAdmin, (req, res) => {
  const empId = req.session.empresa?.id;
  if (!empId) return res.json({ ok: false, error: 'Sin empresa activa' });
  try {
    db.prepare(`
      INSERT INTO notif_config (empresa_id,textmebot_key,envio_cuadre,hora_cuadre,
        envio_libro,hora_libro,envio_asientos,hora_asientos,
        envio_comparativo,hora_comparativo,activo)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(empresa_id) DO UPDATE SET
        textmebot_key=excluded.textmebot_key,
        envio_cuadre=excluded.envio_cuadre, hora_cuadre=excluded.hora_cuadre,
        envio_libro=excluded.envio_libro, hora_libro=excluded.hora_libro,
        envio_asientos=excluded.envio_asientos, hora_asientos=excluded.hora_asientos,
        envio_comparativo=excluded.envio_comparativo, hora_comparativo=excluded.hora_comparativo,
        activo=excluded.activo
    `).run(empId,
      req.body.textmebot_key||null,
      req.body.envio_cuadre??1, req.body.hora_cuadre||'20:00',
      req.body.envio_libro??1, req.body.hora_libro||'14:00',
      req.body.envio_asientos??1, req.body.hora_asientos||'15:00',
      req.body.envio_comparativo??1, req.body.hora_comparativo||'13:00',
      req.body.activo??1
    );
    res.json({ ok: true });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── API: CRUD Contactos ───────────────────────────────────────────────────────
router.post('/contactos', requireAdmin, (req, res) => {
  const empId = req.session.empresa?.id;
  const { nombre, telefono, activo } = req.body;
  if (!nombre?.trim() || !telefono?.trim())
    return res.json({ ok: false, error: 'Nombre y teléfono son obligatorios' });
  try {
    db.prepare('INSERT INTO notif_contactos (empresa_id,nombre,telefono,activo) VALUES (?,?,?,?)')
      .run(empId, nombre.trim(), telefono.trim(), activo??1);
    res.json({ ok: true });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

router.put('/contactos/:id', requireAdmin, (req, res) => {
  const { nombre, telefono, activo } = req.body;
  try {
    db.prepare('UPDATE notif_contactos SET nombre=?,telefono=?,activo=? WHERE id=?')
      .run(nombre.trim(), telefono.trim(), activo??1, req.params.id);
    res.json({ ok: true });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

router.delete('/contactos/:id', requireAdmin, (req, res) => {
  try {
    db.prepare('DELETE FROM notif_contactos WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── API: Probar contacto ──────────────────────────────────────────────────────
router.post('/probar/:id', async (req, res) => {
  const empId = req.session.empresa?.id;
  try {
    const cfg     = db.prepare('SELECT * FROM notif_config WHERE empresa_id=?').get(empId);
    const contacto= db.prepare('SELECT * FROM notif_contactos WHERE id=?').get(req.params.id);
    if (!cfg?.textmebot_key)
      return res.json({ ok: false, error: 'Configurá el API Key primero en la pestaña Configuración' });
    if (!contacto)
      return res.json({ ok: false, error: 'Contacto no encontrado' });

    const empresa = req.session.empresa;
    const msg = `🧪 *Mensaje de Prueba — CashFlow Pro*\n🏢 ${empresa.nombre}\n📅 ${new Date().toLocaleString('es-HN')}\n\n✅ La conexión con WhatsApp está funcionando correctamente.\n\n_CashFlow Pro Notificaciones_`;

    const { ok, respuesta } = await wa.enviarMensaje(cfg.textmebot_key, contacto.telefono, msg);
    wa.registrarLog(empId, contacto.id, 'prueba', msg, ok?'enviado':'error', respuesta);
    res.json({ ok, respuesta });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── API: Enviar ahora (manual) ────────────────────────────────────────────────
router.post('/enviar', async (req, res) => {
  const empId   = req.session.empresa?.id;
  const empresa = req.session.empresa;
  const { tipo, destino, fecha, mensaje } = req.body;

  try {
    const cfg = db.prepare('SELECT * FROM notif_config WHERE empresa_id=?').get(empId);
    if (!cfg?.textmebot_key)
      return res.json({ ok: false, error: 'Configurá el API Key primero' });

    // Construir mensaje según tipo
    let msgTexto = '';
    const mesActual = new Date().toISOString().substring(0,7);
    const anioActual = new Date().getFullYear();

    switch (tipo) {
      case 'cuadre_hoy':
      case 'cuadre_fecha': {
        const fechaBuscar = tipo==='cuadre_hoy' ? new Date().toISOString().split('T')[0] : fecha;
        const cuadre = db.prepare(
          wa.SQL_CUADRE + ' WHERE empresa_id=? AND fecha=? ORDER BY id DESC LIMIT 1'
        ).get(empId, fechaBuscar);
        if (!cuadre)
          return res.json({ ok: false, error: `No existe cuadre para la fecha ${fechaBuscar}` });
        msgTexto = wa.mensajeCuadre(empresa, cuadre);
        // Extraer URLs de imágenes adjuntas al cuadre
        req._imgUrls = wa.getImagenesUrls ? wa.getImagenesUrls(cuadre) : [];
        break;
      }
      case 'libro_ventas': {
        const datos = db.prepare(`
          SELECT COUNT(*) as total_dias,
            SUM(venta_exenta) as total_exenta,
            SUM(venta_gravada_15) as total_grav15,
            SUM(venta_gravada_15 * 0.15) as total_isv15,
            SUM(venta_gravada_18) as total_grav18,
            SUM(venta_gravada_18 * 0.18) as total_isv18,
            SUM(venta_super + venta_regular + venta_diesel) as total_pista,
            SUM(cobros_tienda) as total_cobros
          FROM cuadres_diarios WHERE empresa_id=? AND fecha LIKE ?
        `).get(empId, `${mesActual}%`);
        msgTexto = wa.mensajeLibroVentas(empresa, datos, mesActual);
        break;
      }
      case 'asientos': {
        const resumen = db.prepare(`
          SELECT COUNT(*) as total,
            SUM(CASE WHEN estado='contabilizado' THEN 1 ELSE 0 END) as contabilizados,
            SUM(CASE WHEN estado!='contabilizado' THEN 1 ELSE 0 END) as pendientes,
            SUM(total_debe) as total_debe, SUM(total_haber) as total_haber
          FROM asientos_contables WHERE empresa_id=? AND fecha LIKE ?
        `).get(empId, `${mesActual}%`);
        msgTexto = wa.mensajeAsientos(empresa, resumen, mesActual);
        break;
      }
      case 'comparativos': {
        const pista = db.prepare(`
          SELECT SUM(venta_super) as super, SUM(venta_regular) as regular,
                 SUM(venta_diesel) as diesel,
                 SUM(venta_super+venta_regular+venta_diesel) as total
          FROM cuadres_diarios WHERE empresa_id=? AND fecha LIKE ?
        `).get(empId, `${anioActual}%`);
        const tienda = db.prepare(`
          SELECT SUM(venta_exenta) as exenta, SUM(venta_gravada_15) as grav15,
                 SUM(venta_gravada_18) as grav18, SUM(isv_15+isv_18) as isv,
                 SUM(venta_exenta+venta_gravada_15+isv_15+venta_gravada_18+isv_18) as total
          FROM cuadres_diarios WHERE empresa_id=? AND fecha LIKE ?
        `).get(empId, `${anioActual}%`);
        msgTexto = wa.mensajeComparativos(empresa, anioActual, pista, tienda);
        break;
      }
      case 'mensaje_libre':
        msgTexto = mensaje;
        break;
      default:
        return res.json({ ok: false, error: 'Tipo de reporte no válido' });
    }

    // Enviar a uno o a todos
    let enviados = 0;
    let errores  = 0;

    if (destino === 'todos') {
      const contactos = db.prepare(
        'SELECT * FROM notif_contactos WHERE empresa_id=? AND activo=1'
      ).all(empId);
      if (!contactos.length)
        return res.json({ ok: false, error: 'No hay contactos activos registrados' });

      for (const c of contactos) {
        const { ok: okEnv, respuesta } = await wa.enviarMensaje(cfg.textmebot_key, c.telefono, msgTexto);
        wa.registrarLog(empId, c.id, 'manual', msgTexto, okEnv?'enviado':'error', respuesta);
        okEnv ? enviados++ : errores++;
        await new Promise(r => setTimeout(r, 2000));
        // Enviar adjuntos del cuadre uno por uno
        if (req._imgUrls && req._imgUrls.length > 0) {
          for (const url of req._imgUrls) {
            await new Promise(r => setTimeout(r, 3000));
            const r2 = await wa.enviarMensaje(cfg.textmebot_key, c.telefono, '📎 Comprobante de depósito', url);
            wa.registrarLog(empId, c.id, 'manual_adjunto', url, r2.ok?'enviado':'error', r2.respuesta);
          }
        }
      }
    } else {
      const c = db.prepare('SELECT * FROM notif_contactos WHERE id=?').get(destino);
      if (!c) return res.json({ ok: false, error: 'Contacto no encontrado' });
      const { ok: okEnv, respuesta } = await wa.enviarMensaje(cfg.textmebot_key, c.telefono, msgTexto);
      wa.registrarLog(empId, c.id, 'manual', msgTexto, okEnv?'enviado':'error', respuesta);
      okEnv ? enviados++ : errores++;
      // Enviar adjuntos del cuadre uno por uno
      if (req._imgUrls && req._imgUrls.length > 0) {
        for (const url of req._imgUrls) {
          await new Promise(r => setTimeout(r, 3000));
          const r2 = await wa.enviarMensaje(cfg.textmebot_key, c.telefono, '📎 Comprobante de depósito', url);
          wa.registrarLog(empId, c.id, 'manual_adjunto', url, r2.ok?'enviado':'error', r2.respuesta);
        }
      }
    }

    res.json({
      ok: enviados > 0,
      mensaje: `Enviado a ${enviados} contacto(s)${errores>0 ? `, ${errores} con error` : ''}`
    });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

module.exports = router;
