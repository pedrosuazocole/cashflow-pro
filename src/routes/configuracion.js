// src/routes/configuracion.js
'use strict';
const express = require('express');
const router = express.Router();
const db = require('../database');
const layout = require('./layout');
const { requireAuth, requireAdmin, requireEmpresa } = require('../middleware/auth');

router.use(requireAuth, requireAdmin, requireEmpresa);

router.get('/', (req, res) => {
  const empId = req.session.empresa.id;
  const conf = db.prepare('SELECT * FROM configuracion WHERE empresa_id = ?').get(empId) || {};
  const emp = db.prepare('SELECT * FROM empresas WHERE id = ?').get(empId) || {};
  let catalogo = [];
  try { catalogo = JSON.parse(conf.catalogo_cuentas || '[]'); } catch(e) {}

  const content = `
  <div class="page-header">
    <h1>⚙️ Configuración</h1>
    <p class="page-subtitle">${req.session.empresa.nombre}</p>
  </div>

  <div class="tabs" id="configTabs">
    <button class="tab-btn active" onclick="showTab('general')">🏢 General</button>
    <button class="tab-btn" onclick="showTab('sistema')">🔧 Sistema</button>
    <button class="tab-btn" onclick="showTab('contabilidad')">📚 Contabilidad</button>
    <button class="tab-btn" onclick="showTab('impresion')">🖨️ Impresión</button>
  </div>

  <!-- TAB GENERAL -->
  <div id="tab-general" class="tab-content active">
    <div class="card">
      <div class="card-header"><h3>Datos de la Empresa</h3></div>
      <div class="card-body">
        <form method="POST" action="/configuracion/empresa">
          <div class="form-grid-2">
            <div class="form-group">
              <label>Nombre de la Empresa</label>
              <input type="text" name="nombre" value="${emp.nombre || ''}" class="form-control">
            </div>
            <div class="form-group">
              <label>RTN</label>
              <input type="text" name="rtn" value="${emp.rtn || ''}" class="form-control" placeholder="0501-1990-00001">
            </div>
            <div class="form-group">
              <label>Dirección</label>
              <input type="text" name="direccion" value="${emp.direccion || ''}" class="form-control">
            </div>
            <div class="form-group">
              <label>Teléfono</label>
              <input type="text" name="telefono" value="${emp.telefono || ''}" class="form-control">
            </div>
            <div class="form-group">
              <label>Email</label>
              <input type="email" name="email" value="${emp.email || ''}" class="form-control">
            </div>
          </div>
          <button type="submit" class="btn btn-primary mt8">💾 Guardar Datos Empresa</button>
        </form>
      </div>
    </div>
  </div>

  <!-- TAB SISTEMA -->
  <div id="tab-sistema" class="tab-content">
    <div class="card">
      <div class="card-header"><h3>Configuración del Sistema</h3></div>
      <div class="card-body">
        <form method="POST" action="/configuracion/sistema">
          <div class="form-grid-2">
            <div class="form-group">
              <label>Nombre de la Pista</label>
              <input type="text" name="nombre_pista" value="${conf.nombre_pista || 'Pista'}" class="form-control">
            </div>
            <div class="form-group">
              <label>Nombre de la Tienda</label>
              <input type="text" name="nombre_tienda" value="${conf.nombre_tienda || 'Starmart'}" class="form-control">
            </div>
            <div class="form-group">
              <label>Nombre Banco 1</label>
              <input type="text" name="banco1_nombre" value="${conf.banco1_nombre || 'BAC'}" class="form-control">
            </div>
            <div class="form-group">
              <label>Nombre Banco 2</label>
              <input type="text" name="banco2_nombre" value="${conf.banco2_nombre || 'FICOHSA'}" class="form-control">
            </div>
            <div class="form-group">
              <label>Tasa ISV 1 (%)</label>
              <input type="number" step="0.01" name="tasa_isv1" value="${conf.tasa_isv1 || 15}" class="form-control">
            </div>
            <div class="form-group">
              <label>Tasa ISV 2 (%)</label>
              <input type="number" step="0.01" name="tasa_isv2" value="${conf.tasa_isv2 || 18}" class="form-control">
            </div>
            <div class="form-group">
              <label>Moneda</label>
              <select name="moneda" class="form-control">
                <option value="HNL" ${conf.moneda==='HNL'||!conf.moneda?'selected':''}>HNL - Lempira Hondureño</option>
                <option value="USD" ${conf.moneda==='USD'?'selected':''}>USD - Dólar Americano</option>
              </select>
            </div>
            <div class="form-group">
              <label>Símbolo de Moneda</label>
              <input type="text" name="simbolo_moneda" value="${conf.simbolo_moneda || 'L.'}" class="form-control">
            </div>
          </div>
          <button type="submit" class="btn btn-primary mt8">💾 Guardar Configuración Sistema</button>
        </form>
      </div>
    </div>
  </div>

  <!-- TAB CONTABILIDAD -->
  <div id="tab-contabilidad" class="tab-content">
    <div class="card">
      <div class="card-header">
        <h3>Catálogo de Cuentas Contables</h3>
        <button onclick="addCuenta()" class="btn btn-sm btn-primary">+ Agregar Cuenta</button>
      </div>
      <div class="card-body">
        <p class="text-muted mb12">Las cuentas del catálogo se usan para autocompletar los asientos contables.</p>
        <table class="table" id="catalogoTable">
          <thead><tr><th>Código</th><th>Descripción</th><th>Tipo</th><th>Acción</th></tr></thead>
          <tbody id="catalogoBody">
            ${catalogo.map((c, i) => `
              <tr id="cta_${i}">
                <td><input type="text" value="${c.codigo}" class="form-control" id="ctaCodigo_${i}"></td>
                <td><input type="text" value="${c.descripcion}" class="form-control" id="ctaDesc_${i}"></td>
                <td>
                  <select class="form-control" id="ctaTipo_${i}">
                    <option value="activo" ${c.tipo==='activo'?'selected':''}>Activo</option>
                    <option value="pasivo" ${c.tipo==='pasivo'?'selected':''}>Pasivo</option>
                    <option value="ingreso" ${c.tipo==='ingreso'?'selected':''}>Ingreso</option>
                    <option value="gasto" ${c.tipo==='gasto'?'selected':''}>Gasto</option>
                  </select>
                </td>
                <td><button onclick="removeCuenta(${i})" class="btn btn-xs btn-danger">✕</button></td>
              </tr>`).join('')}
          </tbody>
        </table>
        <button onclick="saveCatalogo()" class="btn btn-primary mt8">💾 Guardar Catálogo</button>
      </div>
    </div>
  </div>

  <!-- TAB IMPRESIÓN -->
  <div id="tab-impresion" class="tab-content">
    <div class="card">
      <div class="card-header"><h3>Configuración de Impresión</h3></div>
      <div class="card-body">
        <form method="POST" action="/configuracion/impresion">
          <div class="form-grid-2">
            <div class="form-group">
              <label>Formato Predeterminado</label>
              <select name="formato_factura" class="form-control">
                <option value="carta" ${conf.formato_factura==='carta'||!conf.formato_factura?'selected':''}>Carta (8.5x11")</option>
                <option value="ticket" ${conf.formato_factura==='ticket'?'selected':''}>Ticket 80mm</option>
              </select>
            </div>
            <div class="form-group">
              <label>Número de Depósitos (1-10)</label>
              <input type="number" name="num_depositos" value="${conf.num_depositos || 10}" min="1" max="10" class="form-control">
            </div>
          </div>
          <button type="submit" class="btn btn-primary mt8">💾 Guardar Impresión</button>
        </form>
      </div>
    </div>
  </div>

  <script>
    function showTab(name) {
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
      document.getElementById('tab-'+name).classList.add('active');
      event.target.classList.add('active');
    }
    let cuentaIdx = ${catalogo.length};
    function addCuenta() {
      const tr = \`<tr id="cta_\${cuentaIdx}">
        <td><input type="text" class="form-control" id="ctaCodigo_\${cuentaIdx}" placeholder="1101-03-01"></td>
        <td><input type="text" class="form-control" id="ctaDesc_\${cuentaIdx}" placeholder="Nombre de la cuenta"></td>
        <td><select class="form-control" id="ctaTipo_\${cuentaIdx}">
          <option value="activo">Activo</option><option value="pasivo">Pasivo</option>
          <option value="ingreso">Ingreso</option><option value="gasto">Gasto</option>
        </select></td>
        <td><button onclick="removeCuenta(\${cuentaIdx})" class="btn btn-xs btn-danger">✕</button></td>
      </tr>\`;
      document.getElementById('catalogoBody').insertAdjacentHTML('beforeend', tr);
      cuentaIdx++;
    }
    function removeCuenta(i) { const el = document.getElementById('cta_'+i); if(el) el.remove(); }
    async function saveCatalogo() {
      const cuentas = [];
      document.querySelectorAll('[id^=ctaCodigo_]').forEach(el => {
        const i = el.id.split('_')[1];
        if (el.value) cuentas.push({ codigo: el.value, descripcion: document.getElementById('ctaDesc_'+i).value, tipo: document.getElementById('ctaTipo_'+i).value });
      });
      const r = await fetch('/configuracion/catalogo', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ cuentas })});
      const d = await r.json();
      if (d.ok) alert('✅ Catálogo guardado');
      else alert('Error: '+d.error);
    }
  </script>
  `;
  res.send(layout(content, { title: 'Configuración', user: req.session.user, empresa: req.session.empresa, empresas: (res.locals.empresas||[]), activePage: 'configuracion' }));
});

router.post('/empresa', (req, res) => {
  const empId = req.session.empresa.id;
  const { nombre, rtn, direccion, telefono, email } = req.body;
  db.prepare("UPDATE empresas SET nombre=?,rtn=?,direccion=?,telefono=?,email=?,updated_at=datetime('now','localtime') WHERE id=?").run(nombre,rtn,direccion,telefono,email,empId);
  req.session.empresa = db.prepare('SELECT * FROM empresas WHERE id=?').get(empId);
  res.redirect('/configuracion');
});

router.post('/sistema', (req, res) => {
  const empId = req.session.empresa.id;
  const { nombre_pista, nombre_tienda, banco1_nombre, banco2_nombre, tasa_isv1, tasa_isv2, moneda, simbolo_moneda } = req.body;
  db.prepare(`INSERT INTO configuracion (empresa_id,nombre_pista,nombre_tienda,banco1_nombre,banco2_nombre,tasa_isv1,tasa_isv2,moneda,simbolo_moneda) VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(empresa_id) DO UPDATE SET nombre_pista=excluded.nombre_pista,nombre_tienda=excluded.nombre_tienda,banco1_nombre=excluded.banco1_nombre,banco2_nombre=excluded.banco2_nombre,tasa_isv1=excluded.tasa_isv1,tasa_isv2=excluded.tasa_isv2,moneda=excluded.moneda,simbolo_moneda=excluded.simbolo_moneda`)
    .run(empId,nombre_pista,nombre_tienda,banco1_nombre,banco2_nombre,parseFloat(tasa_isv1)||15,parseFloat(tasa_isv2)||18,moneda,simbolo_moneda);
  res.redirect('/configuracion#sistema');
});

router.post('/impresion', (req, res) => {
  const empId = req.session.empresa.id;
  const { formato_factura, num_depositos } = req.body;
  db.prepare(`INSERT INTO configuracion (empresa_id,formato_factura,num_depositos) VALUES (?,?,?)
    ON CONFLICT(empresa_id) DO UPDATE SET formato_factura=excluded.formato_factura,num_depositos=excluded.num_depositos`)
    .run(empId, formato_factura, parseInt(num_depositos)||10);
  res.redirect('/configuracion#impresion');
});

router.post('/catalogo', (req, res) => {
  const empId = req.session.empresa.id;
  const { cuentas } = req.body;
  db.prepare(`INSERT INTO configuracion (empresa_id,catalogo_cuentas) VALUES (?,?)
    ON CONFLICT(empresa_id) DO UPDATE SET catalogo_cuentas=excluded.catalogo_cuentas`)
    .run(empId, JSON.stringify(cuentas));
  res.json({ ok: true });
});

module.exports = router;
