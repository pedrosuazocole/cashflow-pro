// src/routes/cuadre.js - Cuadre Diario completo
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
  const { mes, estado } = req.query;
  let where = 'WHERE empresa_id = ?';
  const params = [empId];
  if (mes) { where += ' AND fecha LIKE ?'; params.push(`${mes}%`); }
  if (estado) { where += ' AND estado = ?'; params.push(estado); }

  const cuadres = db.prepare(`SELECT id, fecha, prefijo_premium,
    (venta_super + venta_regular + venta_diesel) as ingresos_pista,
    (venta_exenta + venta_gravada_15 + isv_15 + venta_gravada_18 + isv_18) as ingresos_tienda,
    (venta_super + venta_regular + venta_diesel +
     venta_exenta + venta_gravada_15 + isv_15 + venta_gravada_18 + isv_18 +
     cobros_tienda + anticipos_clientes + nc_descuentos_cred + total_alquileres) as total_ingresos,
    total_depositos, sobrante, faltante, estado, created_at
    FROM cuadres_diarios ${where} ORDER BY fecha DESC`).all(...params);
  const fmt = (n) => new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2 }).format(n || 0);

  const content = `
  <div class="page-header">
    <div>
      <h1>📋 Ingresos de Cuadre Diario</h1>
      <p class="page-subtitle">Gestión de cuadres de caja</p>
    </div>
    <a href="/cuadre/nuevo" class="btn btn-primary">+ Nuevo Cuadre</a>
  </div>

  <div class="card mb20">
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
            <option value="borrador" ${estado==='borrador'?'selected':''}>Borrador</option>
            <option value="finalizado" ${estado==='finalizado'?'selected':''}>Finalizado</option>
          </select>
        </div>
        <button type="submit" class="btn btn-secondary">Filtrar</button>
        <a href="/cuadre" class="btn btn-outline">Limpiar</a>
      </form>
    </div>
  </div>

  <div class="card">
    <div class="card-body p0">
      <table class="table table-hover">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Prefijo</th>
            <th>Ventas Pista</th>
            <th>Ventas Tienda</th>
            <th>Total Ingresos</th>
            <th>Total Depositado</th>
            <th>Sobrante</th>
            <th>Faltante</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${cuadres.length ? cuadres.map(c => `
            <tr>
              <td>${c.fecha}</td>
              <td>${c.prefijo_premium || '-'}</td>
              <td class="text-right">L. ${fmt(c.ingresos_pista)}</td>
              <td class="text-right">L. ${fmt(c.ingresos_tienda)}</td>
              <td class="text-right font-bold">L. ${fmt(c.total_ingresos)}</td>
              <td class="text-right">L. ${fmt(c.total_depositos)}</td>
              <td class="text-right text-green">${c.sobrante > 0 ? 'L. '+fmt(c.sobrante) : '-'}</td>
              <td class="text-right text-red">${c.faltante > 0 ? 'L. '+fmt(c.faltante) : '-'}</td>
              <td><span class="badge badge-${c.estado === 'finalizado' ? 'green' : 'yellow'}">${c.estado}</span></td>
              <td>
                <div class="action-btns">
                  <a href="/cuadre/${c.id}" class="btn btn-xs btn-primary" title="Ver">👁️</a>
                  <a href="/cuadre/${c.id}/editar" class="btn btn-xs btn-secondary" title="Editar">✏️</a>
                  <button onclick="printCuadre(${c.id})" class="btn btn-xs btn-outline" title="Imprimir">🖨️</button>
                  <button onclick="deleteCuadre(${c.id})" class="btn btn-xs btn-danger" title="Eliminar">🗑️</button>
                </div>
              </td>
            </tr>`).join('') : '<tr><td colspan="10" class="text-center text-muted py20">No hay cuadres registrados</td></tr>'}
        </tbody>
      </table>
    </div>
  </div>

  <script>
    function deleteCuadre(id) {
      if (!confirm('¿Eliminar este cuadre? Esta acción no se puede deshacer.')) return;
      fetch('/cuadre/'+id, {method:'DELETE'}).then(r=>r.json()).then(d=>{
        if(d.ok) location.reload();
        else alert('Error: '+d.error);
      });
    }
    function printCuadre(id) {
      fetch('/cuadre/'+id+'/print-data?t='+Date.now(),{cache:'no-store'}).then(r=>r.json()).then(data => {
        document.getElementById('printPreviewContent').innerHTML = data.html;
        document.getElementById('printModal').classList.add('open');
        window._printId = id;
      });
    }
  </script>
  `;
  res.send(layout(content, { title: 'Cuadre Diario', user: req.session.user, empresa: req.session.empresa, empresas: (res.locals.empresas||[]), activePage: 'cuadre' }));
});

// ─── NUEVO / EDITAR (formulario compartido) ───
router.get('/nuevo', (req, res) => renderForm(req, res, null));
router.get('/:id/editar', (req, res) => {
  const c = db.prepare('SELECT * FROM cuadres_diarios WHERE id = ? AND empresa_id = ?').get(req.params.id, req.session.empresa.id);
  if (!c) return res.redirect('/cuadre');
  renderForm(req, res, c);
});

function renderForm(req, res, cuadre) {
  const conf = db.prepare('SELECT * FROM configuracion WHERE empresa_id = ?').get(req.session.empresa.id) || {};
  const isEdit = !!cuadre;
  const c = cuadre || {};
  const hoy = new Date().toISOString().split('T')[0];
  const banco1 = conf.banco1_nombre || 'BAC';
  const banco2 = conf.banco2_nombre || 'FICOHSA';
  const v = (field, def = 0) => c[field] !== undefined ? c[field] : def;
  const vs = (field, def = '') => c[field] !== undefined ? c[field] : def;

  const content = `
  <div class="page-header">
    <div>
      <h1>${isEdit ? '✏️ Editar' : '➕ Nuevo'} Cuadre Diario</h1>
      <p class="page-subtitle">${isEdit ? `Cuadre del ${c.fecha}` : 'Registrar nuevo cuadre de caja'}</p>
    </div>
    <a href="/cuadre" class="btn btn-outline">← Volver</a>
  </div>

  <form id="cuadreForm" method="POST" action="${isEdit ? '/cuadre/'+c.id+'?_method=PUT' : '/cuadre'}">
    <input type="hidden" name="_method" value="${isEdit ? 'PUT' : 'POST'}">

    <!-- SECCIÓN: DATOS GENERALES -->
    <div class="card mb16">
      <div class="card-header"><h3>📋 Datos Generales</h3></div>
      <div class="card-body">
        <div class="form-grid-3">
          <div class="form-group">
            <label class="required">Fecha de Cuadre</label>
            <input type="date" name="fecha" value="${vs('fecha', hoy)}" class="form-control" required ${isEdit?'readonly':''}>
          </div>
          <div class="form-group">
            <label>Prefijo Premium</label>
            <input type="text" name="prefijo_premium" value="${vs('prefijo_premium')}" class="form-control" placeholder="Ej: 01172231-01172877">
          </div>
          <div class="form-group">
            <label>Factura Premium</label>
            <input type="text" name="fac_premium" value="${vs('fac_premium')}" class="form-control" placeholder="Ej: 01172877">
          </div>
          <div class="form-group">
            <label>Prefijo Ruby</label>
            <input type="text" name="prefijo_ruby" value="${vs('prefijo_ruby')}" class="form-control">
          </div>
          <div class="form-group">
            <label>Factura Ruby</label>
            <input type="text" name="fac_ruby" value="${vs('fac_ruby')}" class="form-control" placeholder="Ej: 00001234">
          </div>
          <div class="form-group">
            <label>Prefijo Talonario</label>
            <input type="text" name="prefijo_talonario" value="${vs('prefijo_talonario')}" class="form-control">
          </div>
          <div class="form-group">
            <label>Factura Talonario</label>
            <input type="text" name="fac_talonario" value="${vs('fac_talonario')}" class="form-control" placeholder="Ej: 00005678">
          </div>
        </div>
      </div>
    </div>

    <!-- SECCIÓN: INGRESOS PISTA -->
    <div class="card mb16">
      <div class="card-header"><h3>⛽ Ingresos Pista</h3></div>
      <div class="card-body">
        <div class="cuadre-table-wrapper">
          <table class="cuadre-table">
            <thead><tr><th>Combustible</th><th>Ventas Pista</th><th>Total</th></tr></thead>
            <tbody>
              <tr>
                <td><strong>❶ Super</strong></td>
                <td><input type="number" step="0.01" name="venta_super" id="ventaSuper" value="${v('venta_super')}" class="form-control num-input" oninput="calcPista()"></td>
                <td><input type="number" step="0.01" id="totalSuper" value="${v('venta_super')}" class="form-control bg-gray" readonly></td>
              </tr>
              <tr>
                <td><strong>❷ Regular</strong></td>
                <td><input type="number" step="0.01" name="venta_regular" id="ventaRegular" value="${v('venta_regular')}" class="form-control num-input" oninput="calcPista()"></td>
                <td><input type="number" step="0.01" id="totalRegular" value="${v('venta_regular')}" class="form-control bg-gray" readonly></td>
              </tr>
              <tr>
                <td><strong>❸ Diesel</strong></td>
                <td><input type="number" step="0.01" name="venta_diesel" id="ventaDiesel" value="${v('venta_diesel')}" class="form-control num-input" oninput="calcPista()"></td>
                <td><input type="number" step="0.01" id="totalDiesel" value="${v('venta_diesel')}" class="form-control bg-gray" readonly></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="form-grid-2 mt12">
          <div class="form-group">
            <label class="bold">TOTAL INGRESOS PISTA</label>
            <input type="number" step="0.01" name="ingresos_pista" id="ingresosPista" value="${v('ingresos_pista')}" class="form-control bg-blue text-white font-bold" readonly>
          </div>
        </div>
      </div>
    </div>

    <!-- SECCIÓN: INGRESOS TIENDA -->
    <div class="card mb16">
      <div class="card-header"><h3>🛒 Ingresos Tienda (${conf.nombre_tienda || 'Starmart'})</h3></div>
      <div class="card-body">
        <div class="cuadre-table-wrapper">
          <table class="cuadre-table">
            <thead><tr><th>Concepto</th><th>Sub-Total</th><th>ISV</th><th>Total</th></tr></thead>
            <tbody>
              <tr>
                <td>Venta Exenta</td>
                <td><input type="number" step="0.01" name="venta_exenta" value="${v('venta_exenta')}" class="form-control num-input" oninput="calcTienda()"></td>
                <td><input type="number" value="0" class="form-control bg-gray" readonly></td>
                <td id="totalExentaRow" class="text-right">0.00</td>
              </tr>
              <tr>
                <td>Venta Gravada 15%</td>
                <td><input type="number" step="0.01" name="venta_gravada_15" value="${v('venta_gravada_15')}" class="form-control num-input" oninput="calcTienda()"></td>
                <td id="isv15Display" class="text-right">0.00</td>
                <td id="totalGrav15Row" class="text-right">0.00</td>
              </tr>
              <tr>
                <td>Venta Gravada 18%</td>
                <td><input type="number" step="0.01" name="venta_gravada_18" value="${v('venta_gravada_18')}" class="form-control num-input" oninput="calcTienda()"></td>
                <td id="isv18Display" class="text-right">0.00</td>
                <td id="totalGrav18Row" class="text-right">0.00</td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="bg-total">
                <td><strong>TOTAL VENTAS</strong></td>
                <td id="subtotalTiendaDisplay" class="text-right font-bold">0.00</td>
                <td id="totalIsvDisplay" class="text-right font-bold">0.00</td>
                <td id="totalTiendaDisplay" class="text-right font-bold">0.00</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <input type="hidden" name="isv_15" id="isv15" value="${v('isv_15')}">
        <input type="hidden" name="isv_18" id="isv18" value="${v('isv_18')}">
        <div class="form-grid-3 mt12">
          <div class="form-group">
            <label>Cobros Recibidos en Pista</label>
            <input type="number" step="0.01" name="cobros_tienda" value="${v('cobros_tienda')}" class="form-control num-input" oninput="calcTotales()">
          </div>
          <div class="form-group">
            <label>Anticipos de Clientes</label>
            <input type="number" step="0.01" name="anticipos_clientes" value="${v('anticipos_clientes')}" class="form-control num-input" oninput="calcTotales()">
          </div>
          <div class="form-group">
            <label>N-C por Descuentos/Dev. Clientes Crédito</label>
            <input type="number" step="0.01" name="nc_descuentos_cred" value="${v('nc_descuentos_cred')}" class="form-control num-input" oninput="calcTotales()">
          </div>
        </div>
        <div class="form-group">
          <label><strong>TOTAL INGRESOS PISTA Y TIENDA</strong></label>
          <input type="number" step="0.01" name="ingresos_tienda" id="ingresosTienda" value="${v('ingresos_tienda')}" class="form-control bg-gray" readonly>
        </div>
        <div class="form-group">
          <label class="bold text-blue">TOTAL INGRESOS GENERALES</label>
          <input type="number" step="0.01" name="total_ingresos" id="totalIngresos" value="${v('total_ingresos')}" class="form-control bg-blue text-white font-bold" readonly>
        </div>
      </div>
    </div>

    <!-- SECCIÓN: ALQUILERES -->
    <div class="card mb16">
      <div class="card-header"><h3>🏢 Ingresos por Alquiler</h3></div>
      <div class="card-body">
        <div class="cuadre-table-wrapper">
          <table class="cuadre-table">
            <thead><tr><th>#</th><th>Nombre/Descripción</th><th>Sub-Total</th><th>ISV</th><th>Total</th></tr></thead>
            <tbody>
              ${[1,2,3,4,5,6,7,8,9,10].map(i => `
              <tr>
                <td>➊${i > 1 ? ['','➋','➌','➍','➎','➏','➐','➑','➒','➓'][i-1] : ''}</td>
                <td><input type="text" name="alquiler${i}_nombre" value="${vs('alquiler'+i+'_nombre')}" class="form-control" placeholder="Nombre inquilino ${i}"></td>
                <td><input type="number" step="0.01" name="alquiler${i}_subtotal" value="${v('alquiler'+i+'_subtotal')}" class="form-control num-input alq-sub" data-idx="${i}" oninput="calcAlquiler(${i})"></td>
                <td><input type="number" step="0.01" name="alquiler${i}_isv" id="alqIsv${i}" value="${v('alquiler'+i+'_isv')}" class="form-control num-input" oninput="calcAlquilerTotal()"></td>
                <td id="alqTotal${i}" class="text-right">L. 0.00</td>
              </tr>`).join('')}
            </tbody>
            <tfoot>
              <tr class="bg-total">
                <td colspan="2"><strong>TOTAL ALQUILERES</strong></td>
                <td id="alqSubtotalTotal" class="text-right font-bold">0.00</td>
                <td id="alqIsvTotal" class="text-right font-bold">0.00</td>
                <td id="alqGrandTotal" class="text-right font-bold">0.00</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <input type="hidden" name="total_alquileres" id="totalAlquileres" value="${v('total_alquileres')}">
      </div>
    </div>

    <!-- SECCIÓN: OPERACIONES NO EFECTIVO -->
    <div class="card mb16">
      <div class="card-header"><h3>💳 Detalle de Operaciones que No Son Efectivo</h3></div>
      <div class="card-body">
        <div class="form-grid-2">
          <div class="form-group">
            <label>☑ NC por Anulación de Documentos</label>
            <input type="number" step="0.01" name="nc_anulacion" value="${v('nc_anulacion')}" class="form-control num-input" oninput="calcNoEfectivo()">
          </div>
          <div class="form-group">
            <label>☑ N-C por Descuentos a Clientes Crédito</label>
            <input type="number" step="0.01" name="nc_descuentos_cc" value="${v('nc_descuentos_cc')}" class="form-control num-input" oninput="calcNoEfectivo()">
          </div>
          <div class="form-group">
            <label>☑ Descuento Auto Servicio</label>
            <input type="number" step="0.01" name="descuento_auto_servicio" value="${v('descuento_auto_servicio')}" class="form-control num-input" oninput="calcNoEfectivo()">
          </div>
        </div>
        <div class="section-divider">Comisión de Tarjeta de Crédito</div>
        <div class="form-grid-2">
          <div class="form-group">
            <label>❶ Comisión Bancos ${banco1}</label>
            <input type="number" step="0.01" name="comision_bac" value="${v('comision_bac')}" class="form-control num-input" oninput="calcNoEfectivo()">
          </div>
          <div class="form-group">
            <label>❷ Comisión Bancos ${banco2}</label>
            <input type="number" step="0.01" name="comision_ficohsa" value="${v('comision_ficohsa')}" class="form-control num-input" oninput="calcNoEfectivo()">
          </div>
        </div>
        <div class="section-divider">Ventas al Crédito y POS</div>
        <div class="form-grid-2">
          <div class="form-group">
            <label>☑ Ventas al Crédito Pista</label>
            <input type="number" step="0.01" name="ventas_credito_pista" value="${v('ventas_credito_pista')}" class="form-control num-input" oninput="calcNoEfectivo()">
          </div>
          <div class="form-group">
            <label>☑ Ventas al Crédito Tienda</label>
            <input type="number" step="0.01" name="ventas_credito_tienda" value="${v('ventas_credito_tienda')}" class="form-control num-input" oninput="calcNoEfectivo()">
          </div>
          <div class="form-group">
            <label>❶ POS Tarjetas Crédito ${banco1}</label>
            <input type="number" step="0.01" name="pos_bac" value="${v('pos_bac')}" class="form-control num-input" oninput="calcNoEfectivo()">
          </div>
          <div class="form-group">
            <label>❷ POS Tarjetas Crédito ${banco2}</label>
            <input type="number" step="0.01" name="pos_ficohsa" value="${v('pos_ficohsa')}" class="form-control num-input" oninput="calcNoEfectivo()">
          </div>
        </div>
        <div class="form-group">
          <label class="bold">TOTAL OPERACIONES NO EFECTIVO</label>
          <input type="number" step="0.01" name="total_no_efectivo" id="totalNoEfectivo" value="${v('total_no_efectivo')}" class="form-control bg-gray font-bold" readonly>
        </div>
        <div class="form-group">
          <label class="bold text-blue">EFECTIVO DISPONIBLE PARA DEPÓSITO</label>
          <input type="number" step="0.01" name="efectivo_disponible" id="efectivoDisponible" value="${v('efectivo_disponible')}" class="form-control bg-blue text-white font-bold" readonly>
        </div>
      </div>
    </div>

    <!-- SECCIÓN: DEPÓSITOS -->
    <div class="card mb16">
      <div class="card-header"><h3>🏦 Detalle de Depósitos Realizados</h3></div>
      <div class="card-body">
        <div class="form-grid-2">
          ${[1,2,3,4,5,6,7,8,9,10].map(i => `
          <div class="form-group">
            <label>☑ Depósito ${i}</label>
            <input type="number" step="0.01" name="dep${i}" value="${v('dep'+i)}" class="form-control num-input" oninput="calcDepositos()">
          </div>`).join('')}
        </div>
        <div class="form-group">
          <label class="bold">TOTAL DE DEPÓSITOS</label>
          <input type="number" step="0.01" name="total_depositos" id="totalDepositos" value="${v('total_depositos')}" class="form-control bg-gray font-bold" readonly>
        </div>
        <div class="section-divider">Depósito Realizado por DUMBAR</div>
        <div class="form-grid-2">
          <div class="form-group">
            <label>☑ Sobrante</label>
            <input type="number" step="0.01" name="sobrante_dumbar" value="${v('sobrante_dumbar')}" class="form-control num-input" oninput="calcDepositos()">
          </div>
          <div class="form-group">
            <label>☑ Faltante</label>
            <input type="number" step="0.01" name="faltante_dumbar" value="${v('faltante_dumbar')}" class="form-control num-input" oninput="calcDepositos()">
          </div>
        </div>
        <div class="form-group">
          <label class="bold">TOTAL DEPOSITADO REAL DUMBAR</label>
          <input type="number" step="0.01" name="total_depositado_dumbar" id="totalDepDumbar" value="${v('total_depositado_dumbar')}" class="form-control bg-gray font-bold" readonly>
        </div>
        <div class="form-grid-2">
          <div class="form-group">
            <label>☑ Cheques Post-Fechados</label>
            <input type="number" step="0.01" name="cheques_post_fechados" value="${v('cheques_post_fechados')}" class="form-control num-input" oninput="calcDepositos()">
          </div>
          <div class="form-group">
            <label>TOTAL DEPOSITADO</label>
            <input type="number" step="0.01" name="total_depositado" id="totalDepTotal" value="${v('total_depositado')}" class="form-control bg-gray font-bold" readonly>
          </div>
          <div class="form-group">
            <label class="text-green">☑ Sobrante</label>
            <input type="number" step="0.01" name="sobrante" id="sobranteField" value="${v('sobrante')}" class="form-control bg-green" readonly>
          </div>
          <div class="form-group">
            <label class="text-red">☑ Faltante</label>
            <input type="number" step="0.01" name="faltante" id="faltanteField" value="${v('faltante')}" class="form-control bg-red" readonly>
          </div>
        </div>
      </div>
    </div>

    <!-- SECCIÓN: INVENTARIO COMBUSTIBLE -->
    <div class="card mb16">
      <div class="card-header">
        <h3>🛢️ Inventario de Combustible</h3>
        <button type="button" class="btn btn-sm btn-outline" onclick="toggleSection('invCombustible')">Expandir/Colapsar</button>
      </div>
      <div id="invCombustible" class="card-body">
        <div class="cuadre-table-wrapper">
          <table class="cuadre-table">
            <thead><tr><th>Descripción</th><th>Super</th><th>Regular</th><th>Diesel</th></tr></thead>
            <tbody>
              <tr><td>Inv. Inicial</td>
                <td><input type="number" step="0.01" name="inv_inicial_super" value="${v('inv_inicial_super')}" class="form-control num-input" oninput="calcInventario()"></td>
                <td><input type="number" step="0.01" name="inv_inicial_regular" value="${v('inv_inicial_regular')}" class="form-control num-input" oninput="calcInventario()"></td>
                <td><input type="number" step="0.01" name="inv_inicial_diesel" value="${v('inv_inicial_diesel')}" class="form-control num-input" oninput="calcInventario()"></td>
              </tr>
              <tr><td>Entregas</td>
                <td><input type="number" step="0.01" name="entregas_super" value="${v('entregas_super')}" class="form-control num-input" oninput="calcInventario()"></td>
                <td><input type="number" step="0.01" name="entregas_regular" value="${v('entregas_regular')}" class="form-control num-input" oninput="calcInventario()"></td>
                <td><input type="number" step="0.01" name="entregas_diesel" value="${v('entregas_diesel')}" class="form-control num-input" oninput="calcInventario()"></td>
              </tr>
              <tr><td>Ventas (Litros)</td>
                <td><input type="number" step="0.01" name="ventas_super_lit" value="${v('ventas_super_lit')}" class="form-control num-input" oninput="calcInventario()"></td>
                <td><input type="number" step="0.01" name="ventas_regular_lit" value="${v('ventas_regular_lit')}" class="form-control num-input" oninput="calcInventario()"></td>
                <td><input type="number" step="0.01" name="ventas_diesel_lit" value="${v('ventas_diesel_lit')}" class="form-control num-input" oninput="calcInventario()"></td>
              </tr>
              <tr><td>Ajustes</td>
                <td><input type="number" step="0.01" name="ajustes_super" value="${v('ajustes_super')}" class="form-control num-input" oninput="calcInventario()"></td>
                <td><input type="number" step="0.01" name="ajustes_regular" value="${v('ajustes_regular')}" class="form-control num-input" oninput="calcInventario()"></td>
                <td><input type="number" step="0.01" name="ajustes_diesel" value="${v('ajustes_diesel')}" class="form-control num-input" oninput="calcInventario()"></td>
              </tr>
              <tr class="bg-total"><td><strong>Inv. Cierre</strong></td>
                <td><input type="number" step="0.01" name="inv_cierre_super" id="invCierreS" value="${v('inv_cierre_super')}" class="form-control bg-gray" readonly></td>
                <td><input type="number" step="0.01" name="inv_cierre_regular" id="invCierreR" value="${v('inv_cierre_regular')}" class="form-control bg-gray" readonly></td>
                <td><input type="number" step="0.01" name="inv_cierre_diesel" id="invCierreD" value="${v('inv_cierre_diesel')}" class="form-control bg-gray" readonly></td>
              </tr>
              <tr><td>Lect. x Vara</td>
                <td><input type="number" step="0.01" name="lect_vara_super" value="${v('lect_vara_super')}" class="form-control num-input" oninput="calcInventario()"></td>
                <td><input type="number" step="0.01" name="lect_vara_regular" value="${v('lect_vara_regular')}" class="form-control num-input" oninput="calcInventario()"></td>
                <td><input type="number" step="0.01" name="lect_vara_diesel" value="${v('lect_vara_diesel')}" class="form-control num-input" oninput="calcInventario()"></td>
              </tr>
              <tr><td>Vara Litros</td>
                <td><input type="number" step="0.01" name="vara_litros_super" value="${v('vara_litros_super')}" class="form-control num-input" oninput="calcInventario()"></td>
                <td><input type="number" step="0.01" name="vara_litros_regular" value="${v('vara_litros_regular')}" class="form-control num-input" oninput="calcInventario()"></td>
                <td><input type="number" step="0.01" name="vara_litros_diesel" value="${v('vara_litros_diesel')}" class="form-control num-input" oninput="calcInventario()"></td>
              </tr>
              <tr class="bg-total"><td>Variación Acum. Litros</td>
                <td id="varAcumS" class="text-right">${v('variacion_acum_super')}</td>
                <td id="varAcumR" class="text-right">${v('variacion_acum_regular')}</td>
                <td id="varAcumD" class="text-right">${v('variacion_acum_diesel')}</td>
              </tr>
              <tr><td>Variación Diaria Litros</td>
                <td id="varDiariaS" class="text-right">${v('variacion_diaria_super')}</td>
                <td id="varDiariaR" class="text-right">${v('variacion_diaria_regular')}</td>
                <td id="varDiariaD" class="text-right">${v('variacion_diaria_diesel')}</td>
              </tr>
              <tr><td>Costo Unitario/Litro</td>
                <td><input type="number" step="0.01" name="costo_super" value="${v('costo_super')}" class="form-control num-input" oninput="calcInventario()"></td>
                <td><input type="number" step="0.01" name="costo_regular" value="${v('costo_regular')}" class="form-control num-input" oninput="calcInventario()"></td>
                <td><input type="number" step="0.01" name="costo_diesel" value="${v('costo_diesel')}" class="form-control num-input" oninput="calcInventario()"></td>
              </tr>
              <tr class="bg-total"><td><strong>Inv. Final en Lempiras</strong></td>
                <td><input type="number" step="0.01" name="inv_final_lps_super" id="invFinalS" value="${v('inv_final_lps_super')}" class="form-control bg-gray" readonly></td>
                <td><input type="number" step="0.01" name="inv_final_lps_regular" id="invFinalR" value="${v('inv_final_lps_regular')}" class="form-control bg-gray" readonly></td>
                <td><input type="number" step="0.01" name="inv_final_lps_diesel" id="invFinalD" value="${v('inv_final_lps_diesel')}" class="form-control bg-gray" readonly></td>
              </tr>
            </tbody>
          </table>
        </div>
        <!-- Hidden fields for calculated inventory values -->
        <input type="hidden" name="variacion_acum_super" id="hVarAcumS" value="${v('variacion_acum_super')}">
        <input type="hidden" name="variacion_acum_regular" id="hVarAcumR" value="${v('variacion_acum_regular')}">
        <input type="hidden" name="variacion_acum_diesel" id="hVarAcumD" value="${v('variacion_acum_diesel')}">
        <input type="hidden" name="variacion_diaria_super" id="hVarDiariaS" value="${v('variacion_diaria_super')}">
        <input type="hidden" name="variacion_diaria_regular" id="hVarDiariaR" value="${v('variacion_diaria_regular')}">
        <input type="hidden" name="variacion_diaria_diesel" id="hVarDiariaD" value="${v('variacion_diaria_diesel')}">
      </div>
    </div>

    <!-- SECCIÓN: OTROS -->
    <div class="card mb16">
      <div class="card-header"><h3>📝 Notas y Estado</h3></div>
      <div class="card-body">
        <div class="form-grid-2">
          <div class="form-group">
            <label>Firma de Elaboración</label>
            <input type="text" name="firma_elaboracion" value="${vs('firma_elaboracion')}" class="form-control" placeholder="Nombre del responsable">
          </div>
          <div class="form-group">
            <label>Estado del Cuadre</label>
            <select name="estado" class="form-control">
              <option value="borrador" ${c.estado!=='finalizado'?'selected':''}>Borrador</option>
              <option value="finalizado" ${c.estado==='finalizado'?'selected':''}>Finalizado</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>Notas</label>
          <textarea name="notas" rows="3" class="form-control" placeholder="Observaciones adicionales...">${vs('notas')}</textarea>
        </div>
      </div>
    </div>

    <div class="form-actions">
      <a href="/cuadre" class="btn btn-outline">Cancelar</a>
      <button type="button" onclick="saveCuadre('borrador')" class="btn btn-secondary">💾 Guardar Borrador</button>
      <button type="button" onclick="saveCuadre('finalizado')" class="btn btn-primary">✅ Guardar y Finalizar</button>
    </div>
  </form>

  <script>
function pfG(x){var e=document.getElementById(x)||document.querySelector('[name="'+x+'"]');var n=parseFloat(e?e.value:'');return isNaN(n)?0:n;}
function setG(x,v){var e=document.getElementById(x)||document.querySelector('[name="'+x+'"]');if(e)e.value=typeof v==='number'?v.toFixed(2):v;}
function txt(id,v){var e=document.getElementById(id);if(e)e.textContent=v;}

function calcPista(){
  var s=pfG('ventaSuper'),r=pfG('ventaRegular'),d=pfG('ventaDiesel');
  setG('totalSuper',s);setG('totalRegular',r);setG('totalDiesel',d);
  setG('ingresosPista',s+r+d);
  calcTotales();
}
function calcTienda(){
  var ex=pfG('venta_exenta'),g15=pfG('venta_gravada_15'),g18=pfG('venta_gravada_18');
  var i15=g15*0.15,i18=g18*0.18,sub=ex+g15+g18,tot=sub+i15+i18;
  setG('isv15',i15);setG('isv18',i18);
  txt('isv15Display',i15.toFixed(2));txt('isv18Display',i18.toFixed(2));
  txt('totalExentaRow',ex.toFixed(2));txt('totalGrav15Row',(g15+i15).toFixed(2));txt('totalGrav18Row',(g18+i18).toFixed(2));
  txt('subtotalTiendaDisplay',sub.toFixed(2));txt('totalIsvDisplay',(i15+i18).toFixed(2));txt('totalTiendaDisplay',tot.toFixed(2));
  setG('ingresosTienda',tot);
  calcTotales();
}
var _cpi=1;
function calcCobrosPista(){
  var total=0;
  document.querySelectorAll('.cobro-pista-input').forEach(function(inp){var n=parseFloat(inp.value);total+=isNaN(n)?0:n;});
  var h=document.getElementById('cobros_tienda_hidden');if(h)h.value=total.toFixed(2);
  var d=document.getElementById('totalCobrosPistaDisplay');
  if(d)d.textContent='L '+total.toLocaleString('es-HN',{minimumFractionDigits:2,maximumFractionDigits:2});
  calcTotales();
}
function agregarCobroPista(){
  _cpi++;
  var c=document.getElementById('cobros-pista-container');if(!c)return;
  var row=document.createElement('div');
  row.className='cobro-pista-row';row.style.cssText='display:flex;gap:8px;align-items:center;margin-bottom:6px';
  row.innerHTML='<input type="number" step="0.01" class="form-control num-input cobro-pista-input" placeholder="0.00" value="0" oninput="calcCobrosPista()" style="flex:1">'
    +'<button type="button" onclick="eliminarCobroPista(this)" class="btn btn-danger btn-sm" title="Eliminar">&#x2715;</button>';
  c.appendChild(row);row.querySelector('input').focus();
}
function eliminarCobroPista(btn){var r=btn.closest('.cobro-pista-row');if(r){r.remove();calcCobrosPista();}}
function calcAlquilerTotal(){
  var sub=0;
  for(var i=1;i<=10;i++){var s=pfG('alquiler'+i+'_subtotal'),isv=s*0.15;setG('alqIsv'+i,isv);txt('alqTotal'+i,'L. '+(s+isv).toFixed(2));sub+=s;}
  var ia=sub*0.15,tot=sub+ia;
  txt('alqSubtotalTotal',sub.toFixed(2));txt('alqIsvTotal',ia.toFixed(2));txt('alqGrandTotal',tot.toFixed(2));
  setG('totalAlquileres',tot);calcTotales();
}
function calcAlquiler(i){calcAlquilerTotal();}
function calcNoEfectivo(){
  var tot=pfG('nc_anulacion')+pfG('nc_descuentos_cc')+pfG('descuento_auto_servicio')
    +pfG('comision_bac')+pfG('comision_ficohsa')
    +pfG('ventas_credito_pista')+pfG('ventas_credito_tienda')
    +pfG('pos_bac')+pfG('pos_ficohsa');
  setG('totalNoEfectivo',tot);calcTotales();
}
function calcDepositos(){
  var td=0;for(var i=1;i<=10;i++)td+=pfG('dep'+i);
  setG('totalDepositos',td);
  var sd=pfG('sobrante_dumbar'),fd=pfG('faltante_dumbar'),nd=sd-fd;
  setG('totalDepDumbar',nd);
  var ch=pfG('cheques_post_fechados'),tf=td+nd+ch;
  setG('totalDepTotal',tf);calcSobrante();
}
function calcTotales(){
  /* Calcular tienda SIEMPRE desde componentes — nunca desde el campo readonly */
  var ex =pfG('venta_exenta');
  var g15=pfG('venta_gravada_15');
  var g18=pfG('venta_gravada_18');
  var i15=g15*0.15, i18=g18*0.18;
  var tienda=ex+g15+i15+g18+i18;
  var pista=pfG('ingresosPista');
  var hEl=document.getElementById('cobros_tienda_hidden');
  var cob=hEl?parseFloat(hEl.value)||0:pfG('cobros_tienda');
  var ant=pfG('anticipos_clientes');
  var nc =pfG('nc_descuentos_cred');
  var alq=pfG('totalAlquileres');
  var nef=pfG('totalNoEfectivo');
  var tot=pista+tienda+cob+ant+nc+alq;
  setG('ingresosTienda',tot);
  setG('totalIngresos', tot);
  setG('efectivoDisponible',tot-nef);
  calcSobrante();
}
var calcTotalesGenerales=calcTotales;
function calcSobrante(){
  var dep=pfG('totalDepTotal'),ef=pfG('efectivoDisponible'),diff=dep-ef;
  if(diff>=0){setG('sobranteField',diff);setG('faltanteField',0);var s=document.getElementById('sobranteField');if(s){s.style.background='#f0fdf4';s.style.color='#15803d';}}
  else{setG('sobranteField',0);setG('faltanteField',Math.abs(diff));var f=document.getElementById('faltanteField');if(f){f.style.background='#fef2f2';f.style.color='#dc2626';}}
}
function calcInventario(){
  ['super','regular','diesel'].forEach(function(t){
    var id1=t.charAt(0).toUpperCase();
    var ini=pfG('inv_inicial_'+t),ent=pfG('entregas_'+t),vta=pfG('ventas_'+t+'_lit'),aj=pfG('ajustes_'+t),vara=pfG('lect_vara_'+t),cos=pfG('costo_'+t);
    var cie=ini+ent-vta+aj,vd=cie-vara,inv=cie*cos;
    setG('invCierre'+id1,cie);setG('invFinal'+id1,inv);txt('varDiaria'+id1,vd.toFixed(2));txt('varAcum'+id1,vd.toFixed(2));
  });
}
function saveCuadre(estado){
  var estadoEl=document.querySelector('[name="estado"]');if(estadoEl)estadoEl.value=estado;
  ['ingresosPista','ingresosTienda','totalIngresos','totalNoEfectivo',
   'efectivoDisponible','totalDepositos','sobranteField','faltanteField',
   'totalDepDumbar','totalDepTotal'].forEach(function(id){var el=document.getElementById(id);if(el)el.removeAttribute('readonly');});
  ['ingresos_pista','ingresos_tienda','total_ingresos','total_no_efectivo',
   'efectivo_disponible','total_depositos','sobrante','faltante',
   'total_alquileres','total_depositado_dumbar','total_depositado'].forEach(function(nm){var el=document.querySelector('[name="'+nm+'"]');if(el)el.removeAttribute('readonly');});
  document.getElementById('cuadreForm').submit();
}
function toggleSection(id){var el=document.getElementById(id);if(el)el.style.display=el.style.display==='none'?'block':'none';}
document.addEventListener('DOMContentLoaded',function(){
  ['ventaSuper','ventaRegular','ventaDiesel'].forEach(function(id){var e=document.getElementById(id);if(e)e.addEventListener('input',calcPista);});
  ['venta_exenta','venta_gravada_15','venta_gravada_18'].forEach(function(nm){var e=document.querySelector('[name="'+nm+'"]');if(e)e.addEventListener('input',calcTienda);});
  ['anticipos_clientes','nc_descuentos_cred'].forEach(function(nm){var e=document.querySelector('[name="'+nm+'"]');if(e)e.addEventListener('input',calcTotales);});
  ['nc_anulacion','nc_descuentos_cc','descuento_auto_servicio','comision_bac','comision_ficohsa','ventas_credito_pista','ventas_credito_tienda','pos_bac','pos_ficohsa'].forEach(function(nm){var e=document.querySelector('[name="'+nm+'"]');if(e)e.addEventListener('input',calcNoEfectivo);});
  for(var i=1;i<=10;i++){var e=document.querySelector('[name="dep'+i+'"]');if(e)e.addEventListener('input',calcDepositos);}
  ['sobrante_dumbar','faltante_dumbar','cheques_post_fechados'].forEach(function(nm){var e=document.querySelector('[name="'+nm+'"]');if(e)e.addEventListener('input',calcDepositos);});
  for(var j=1;j<=10;j++){var ea=document.querySelector('[name="alquiler'+j+'_subtotal"]');if(ea)ea.addEventListener('input',calcAlquilerTotal);}
  ['super','regular','diesel'].forEach(function(t){
    ['inv_inicial_','entregas_','ajustes_','lect_vara_','costo_'].forEach(function(p){var e=document.querySelector('[name="'+p+t+'"]');if(e)e.addEventListener('input',calcInventario);});
    var vl=document.querySelector('[name="ventas_'+t+'_lit"]');if(vl)vl.addEventListener('input',calcInventario);
  });
  calcPista();calcTienda();calcCobrosPista();calcNoEfectivo();calcDepositos();calcAlquilerTotal();calcInventario();calcTotales();
});
  </script>
  `;

  res.send(layout(content, { title: isEdit ? 'Editar Cuadre' : 'Nuevo Cuadre', user: req.session.user, empresa: req.session.empresa, empresas: (res.locals.empresas||[]), activePage: 'cuadre' }));
}

// ─── GUARDAR NUEVO ───
router.post('/', (req, res) => {
  const empId = req.session.empresa.id;
  const data = req.body;
  
  // Verificar duplicado
  const existe = db.prepare('SELECT id FROM cuadres_diarios WHERE empresa_id = ? AND fecha = ?').get(empId, data.fecha);
  if (existe) return res.send('<script>alert("Ya existe un cuadre para esta fecha");history.back();</script>');

  // Validar que el asiento contable cuadre antes de guardar
  const _num = v => parseFloat(v) || 0;
  const _debe = _num(data.efectivo_disponible) + _num(data.sobrante_dumbar)
              + _num(data.ventas_credito_pista) + _num(data.ventas_credito_tienda)
              + _num(data.pos_bac) + _num(data.pos_ficohsa)
              + _num(data.comision_bac) + _num(data.comision_ficohsa)
              + _num(data.nc_descuentos_cc) + _num(data.descuento_auto_servicio)
              + _num(data.cheques_post_fechados);
  const _haber = _num(data.ingresos_pista)
               + _num(data.venta_gravada_15) + _num(data.venta_gravada_18) + _num(data.venta_exenta)
               + _num(data.isv_15) + _num(data.isv_18)
               + _num(data.anticipos_clientes) + _num(data.cobros_tienda)
               + _num(data.total_alquileres);
  if (Math.abs(_debe - _haber) > 0.10) {
    return res.send('<script>alert("El asiento contable no está cuadrado. DEBE: L '+_debe.toFixed(2)+' / HABER: L '+_haber.toFixed(2)+'. Corregí los valores antes de guardar.");history.back();</script>');
  }

  const campos = buildCampos(data);
  const cols = Object.keys(campos).join(', ');
  const placeholders = Object.keys(campos).map(() => '?').join(', ');
  
  const stmt = db.prepare(`INSERT INTO cuadres_diarios (empresa_id, created_by, ${cols}) VALUES (?, ?, ${placeholders})`);
  const result = stmt.run(empId, req.session.user.id, ...Object.values(campos));
  
  // Generar asiento contable automáticamente
  generarAsiento(result.lastInsertRowid, empId, data, req.session.user.id);
  
  res.redirect('/cuadre');
});

// ─── ACTUALIZAR ───
router.post('/:id', (req, res) => {
  const { _method } = req.body;
  if (_method === 'PUT') {
    const empId = req.session.empresa.id;
    const id = req.params.id;
    const data = req.body;
    // Validar que el asiento contable cuadre antes de actualizar
    const _num2 = v => parseFloat(v) || 0;
    const _debe2 = _num2(data.efectivo_disponible) + _num2(data.sobrante_dumbar)
                 + _num2(data.ventas_credito_pista) + _num2(data.ventas_credito_tienda)
                 + _num2(data.pos_bac) + _num2(data.pos_ficohsa)
                 + _num2(data.comision_bac) + _num2(data.comision_ficohsa)
                 + _num2(data.nc_descuentos_cc) + _num2(data.descuento_auto_servicio)
                 + _num2(data.cheques_post_fechados);
    const _haber2 = _num2(data.ingresos_pista)
                  + _num2(data.venta_gravada_15) + _num2(data.venta_gravada_18) + _num2(data.venta_exenta)
                  + _num2(data.isv_15) + _num2(data.isv_18)
                  + _num2(data.anticipos_clientes) + _num2(data.cobros_tienda)
                  + _num2(data.total_alquileres);
    if (Math.abs(_debe2 - _haber2) > 0.10) {
      return res.send('<script>alert("El asiento contable no está cuadrado. DEBE: L '+_debe2.toFixed(2)+' / HABER: L '+_haber2.toFixed(2)+'. Corregí los valores antes de guardar.");history.back();</script>');
    }

    const campos = buildCampos(data);
    
    const sets = Object.keys(campos).map(k => `${k} = ?`).join(', ');
    db.prepare(`UPDATE cuadres_diarios SET ${sets}, updated_at = datetime('now','localtime') WHERE id = ? AND empresa_id = ?`).run(...Object.values(campos), id, empId);
    
    // Actualizar asiento
    actualizarAsiento(id, empId, data);
    
    return res.redirect('/cuadre');
  }
  res.redirect('/cuadre');
});

// ─── ELIMINAR ───
router.delete('/:id', (req, res) => {
  const empId = req.session.empresa.id;
  // Eliminar asientos relacionados primero
  const asientos = db.prepare('SELECT id FROM asientos_contables WHERE cuadre_id = ?').all(req.params.id);
  asientos.forEach(a => {
    db.prepare('DELETE FROM asientos_lineas WHERE asiento_id = ?').run(a.id);
  });
  db.prepare('DELETE FROM asientos_contables WHERE cuadre_id = ?').run(req.params.id);
  db.prepare('DELETE FROM cuadres_diarios WHERE id = ? AND empresa_id = ?').run(req.params.id, empId);
  res.json({ ok: true });
});

// ─── VER DETALLE ───
router.get('/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM cuadres_diarios WHERE id = ? AND empresa_id = ?').get(req.params.id, req.session.empresa.id);
  if (!c) return res.redirect('/cuadre');
  const fmt = (n) => new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2 }).format(n || 0);

  const content = `
  <div class="page-header">
    <div>
      <h1>📋 Cuadre Diario — ${c.fecha}</h1>
      <span class="badge badge-${c.estado === 'finalizado' ? 'green' : 'yellow'}">${c.estado.toUpperCase()}</span>
    </div>
    <div class="btn-group">
      <a href="/cuadre/${c.id}/editar" class="btn btn-secondary">✏️ Editar</a>
      <button onclick="printCuadre(${c.id})" class="btn btn-outline">🖨️ Imprimir</button>
      <a href="/cuadre" class="btn btn-outline">← Volver</a>
    </div>
  </div>
  <div class="grid-2col">
    <div class="card">
      <div class="card-header"><h3>⛽ Ingresos Pista</h3></div>
      <div class="card-body">
        <table class="detail-table">
          <tr><td>Super</td><td class="text-right">L. ${fmt(c.venta_super)}</td></tr>
          <tr><td>Regular</td><td class="text-right">L. ${fmt(c.venta_regular)}</td></tr>
          <tr><td>Diesel</td><td class="text-right">L. ${fmt(c.venta_diesel)}</td></tr>
          <tr class="total-row"><td><strong>Total Pista</strong></td><td class="text-right"><strong>L. ${fmt(c.ingresos_pista)}</strong></td></tr>
        </table>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><h3>🛒 Ingresos Tienda</h3></div>
      <div class="card-body">
        <table class="detail-table">
          <tr><td>Venta Exenta</td><td class="text-right">L. ${fmt(c.venta_exenta)}</td></tr>
          <tr><td>Venta Gravada 15%</td><td class="text-right">L. ${fmt(c.venta_gravada_15)}</td></tr>
          <tr><td>ISV 15%</td><td class="text-right">L. ${fmt(c.isv_15)}</td></tr>
          <tr><td>Venta Gravada 18%</td><td class="text-right">L. ${fmt(c.venta_gravada_18)}</td></tr>
          <tr><td>ISV 18%</td><td class="text-right">L. ${fmt(c.isv_18)}</td></tr>
          <tr class="total-row"><td><strong>Total Tienda</strong></td><td class="text-right"><strong>L. ${fmt(c.ingresos_tienda)}</strong></td></tr>
        </table>
      </div>
    </div>
  </div>
  <div class="card mt16">
    <div class="card-header"><h3>💰 Resumen de Depósitos</h3></div>
    <div class="card-body">
      <div class="stats-mini">
        <div><span>Total Ingresos</span><strong>L. ${fmt(c.total_ingresos)}</strong></div>
        <div><span>No Efectivo</span><strong>L. ${fmt(c.total_no_efectivo)}</strong></div>
        <div><span>Efectivo Disponible</span><strong>L. ${fmt(c.efectivo_disponible)}</strong></div>
        <div><span>Total Depositado</span><strong>L. ${fmt(c.total_depositos)}</strong></div>
        <div><span class="text-green">Sobrante</span><strong class="text-green">L. ${fmt(c.sobrante)}</strong></div>
        <div><span class="text-red">Faltante</span><strong class="text-red">L. ${fmt(c.faltante)}</strong></div>
      </div>
    </div>
  </div>
  <script>
    function printCuadre(id) {
      fetch('/cuadre/'+id+'/print-data?t='+Date.now(),{cache:'no-store'}).then(r=>r.json()).then(data => {
        document.getElementById('printPreviewContent').innerHTML = data.html;
        document.getElementById('printModal').classList.add('open');
        window._printId = id;
      });
    }
  </script>
  `;
  res.send(layout(content, { title: 'Ver Cuadre', user: req.session.user, empresa: req.session.empresa, empresas: (res.locals.empresas||[]), activePage: 'cuadre' }));
});

// ─── PRINT DATA ───
router.get('/:id/print-data', (req, res) => {
  const c = db.prepare('SELECT * FROM cuadres_diarios WHERE id = ? AND empresa_id = ?').get(req.params.id, req.session.empresa.id);
  if (!c) return res.json({ html: '<p>No encontrado</p>' });
  res.set('Cache-Control','no-store');
  const emp = req.session.empresa;
  const fmt = (n) => new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2 }).format(n || 0);
  
  // Calcular tienda directamente para el reporte
  const tiendaReal = (c.venta_exenta||0) + (c.venta_gravada_15||0) + (c.isv_15||0) + (c.venta_gravada_18||0) + (c.isv_18||0);
  const pistaReal  = (c.venta_super||0) + (c.venta_regular||0) + (c.venta_diesel||0);
  const totalReal  = pistaReal + tiendaReal + (c.cobros_tienda||0) + (c.anticipos_clientes||0) + (c.nc_descuentos_cred||0) + (c.total_alquileres||0);
  const fmtL = (n) => 'L. ' + new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2 }).format(n || 0);

  const html = `
  <div style="font-family:Arial,sans-serif;font-size:11px;padding:20px;max-width:720px;margin:0 auto;color:#000">
    <!-- ENCABEZADO -->
    <div style="text-align:center;margin-bottom:16px;border-bottom:2px solid #1e3a5f;padding-bottom:10px">
      <h2 style="font-size:15px;margin:0;font-weight:900">${emp.nombre}</h2>
      ${emp.direccion ? `<p style="margin:2px 0;font-size:10px">${emp.direccion}</p>` : ''}
      <p style="margin:2px 0;font-size:10px">RTN: ${emp.rtn || 'N/A'}</p>
      <h3 style="font-size:13px;margin:8px 0 2px;text-transform:uppercase;letter-spacing:1px">CUADRE DIARIO DE CAJA</h3>
      <p style="margin:2px 0;font-size:10px">
        Fecha: <strong>${c.fecha}</strong> &nbsp;|&nbsp;
        Prefijo Premium: <strong>${c.prefijo_premium || '-'}</strong> &nbsp;|&nbsp;
        Ruby: <strong>${c.prefijo_ruby || '-'}</strong>
        ${c.prefijo_talonario ? ' &nbsp;|&nbsp; Talonario: <strong>'+c.prefijo_talonario+'</strong>' : ''}
        ${c.fac_premium ? '<br>Fac. Premium: <strong>'+c.fac_premium+'</strong>' : ''}
        ${c.fac_ruby ? ' &nbsp;|&nbsp; Fac. Ruby: <strong>'+c.fac_ruby+'</strong>' : ''}
        ${c.fac_talonario ? ' &nbsp;|&nbsp; Fac. Talonario: <strong>'+c.fac_talonario+'</strong>' : ''}
      </p>
    </div>

    <!-- INGRESOS POR VENTAS -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:10px;font-size:11px">
      <thead>
        <tr style="background:#1e3a5f;color:#fff">
          <th colspan="2" style="padding:5px 8px;text-align:left">INGRESOS POR VENTAS</th>
          <th style="padding:5px 8px;text-align:right">FAC PREMIUM</th>
          <th style="padding:5px 8px;text-align:right">TOTAL</th>
        </tr>
      </thead>
      <tbody>
        <tr style="background:#dbeafe"><td colspan="4" style="padding:4px 8px;font-weight:700">✓ INGRESOS PISTA</td></tr>
        <tr style="border-bottom:1px solid #e5e7eb">
          <td style="padding:3px 8px;width:20px"></td>
          <td style="padding:3px 8px">❶ Super</td>
          <td style="text-align:right;padding:3px 8px">${fmtL(c.venta_super)}</td>
          <td style="text-align:right;padding:3px 8px">${fmtL(c.venta_super)}</td>
        </tr>
        <tr style="border-bottom:1px solid #e5e7eb">
          <td style="padding:3px 8px"></td>
          <td style="padding:3px 8px">❷ Regular</td>
          <td style="text-align:right;padding:3px 8px">${fmtL(c.venta_regular)}</td>
          <td style="text-align:right;padding:3px 8px">${fmtL(c.venta_regular)}</td>
        </tr>
        <tr style="border-bottom:1px solid #e5e7eb">
          <td style="padding:3px 8px"></td>
          <td style="padding:3px 8px">❸ Diesel</td>
          <td style="text-align:right;padding:3px 8px">${fmtL(c.venta_diesel)}</td>
          <td style="text-align:right;padding:3px 8px">${fmtL(c.venta_diesel)}</td>
        </tr>
        <tr style="background:#dbeafe;border-bottom:1px solid #93c5fd">
          <td colspan="2" style="padding:4px 8px;font-weight:700">✓ INGRESOS TIENDA (Starmart)</td>
          <td></td>
          <td style="text-align:right;padding:4px 8px;font-weight:700">${fmtL(tiendaReal)}</td>
        </tr>
        <tr style="border-bottom:1px solid #e5e7eb"><td style="padding:2px 8px 2px 24px" colspan="2">Venta Exenta</td><td></td><td style="text-align:right;padding:2px 8px">${fmtL(c.venta_exenta)}</td></tr>
        <tr style="border-bottom:1px solid #e5e7eb"><td colspan="2" style="padding:2px 8px 2px 24px">Venta Gravada 15%</td><td></td><td style="text-align:right;padding:2px 8px">${fmtL(c.venta_gravada_15)}</td></tr>
        <tr style="border-bottom:1px solid #e5e7eb"><td colspan="2" style="padding:2px 8px 2px 24px">ISV 15% (${fmtL(c.venta_gravada_15)} × 15%)</td><td></td><td style="text-align:right;padding:2px 8px">${fmtL(c.isv_15)}</td></tr>
        <tr style="border-bottom:1px solid #e5e7eb"><td colspan="2" style="padding:2px 8px 2px 24px">Venta Gravada 18%</td><td></td><td style="text-align:right;padding:2px 8px">${fmtL(c.venta_gravada_18)}</td></tr>
        <tr style="border-bottom:1px solid #e5e7eb"><td colspan="2" style="padding:2px 8px 2px 24px">ISV 18% (${fmtL(c.venta_gravada_18)} × 18%)</td><td></td><td style="text-align:right;padding:2px 8px">${fmtL(c.isv_18)}</td></tr>
        ${c.cobros_tienda > 0 ? `<tr style="border-bottom:1px solid #e5e7eb"><td colspan="2" style="padding:2px 8px">Cobros en Pista</td><td></td><td style="text-align:right;padding:2px 8px">${fmtL(c.cobros_tienda)}</td></tr>` : ''}
        ${c.anticipos_clientes > 0 ? `<tr style="border-bottom:1px solid #e5e7eb"><td colspan="2" style="padding:2px 8px">Anticipos de Clientes</td><td></td><td style="text-align:right;padding:2px 8px">${fmtL(c.anticipos_clientes)}</td></tr>` : ''}
        ${c.nc_descuentos_cred > 0 ? `<tr style="border-bottom:1px solid #e5e7eb"><td colspan="2" style="padding:2px 8px">N-C Descuentos / Devoluciones</td><td></td><td style="text-align:right;padding:2px 8px">${fmtL(c.nc_descuentos_cred)}</td></tr>` : ''}
        ${c.total_alquileres > 0 ? `<tr style="border-bottom:1px solid #e5e7eb"><td colspan="2" style="padding:2px 8px">Ingresos por Alquiler</td><td></td><td style="text-align:right;padding:2px 8px">${fmtL(c.total_alquileres)}</td></tr>` : ''}
        <tr style="background:#1e3a5f;color:#fff">
          <td colspan="2" style="padding:5px 8px;font-weight:700">TOTAL INGRESOS PISTA Y TIENDA</td>
          <td></td>
          <td style="text-align:right;padding:5px 8px;font-weight:700">${fmtL(totalReal)}</td>
        </tr>
      </tbody>
    </table>

    <!-- NO EFECTIVO -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:10px;font-size:11px">
      <thead>
        <tr style="background:#1e3a5f;color:#fff">
          <th style="padding:5px 8px;text-align:left">DETALLE OPERACIONES NO EFECTIVO</th>
          <th style="padding:5px 8px;text-align:right">MONTO</th>
        </tr>
      </thead>
      <tbody>
        <tr style="border-bottom:1px solid #e5e7eb"><td style="padding:3px 8px">NC por Anulación</td><td style="text-align:right;padding:3px 8px">${fmtL(c.nc_anulacion)}</td></tr>
        <tr style="border-bottom:1px solid #e5e7eb"><td style="padding:3px 8px">NC Descuentos Crédito</td><td style="text-align:right;padding:3px 8px">${fmtL(c.nc_descuentos_cc)}</td></tr>
        <tr style="border-bottom:1px solid #e5e7eb"><td style="padding:3px 8px">Descuento Auto Servicio</td><td style="text-align:right;padding:3px 8px">${fmtL(c.descuento_auto_servicio)}</td></tr>
        <tr style="border-bottom:1px solid #e5e7eb"><td style="padding:3px 8px">Comisión Tarjeta BAC</td><td style="text-align:right;padding:3px 8px">${fmtL(c.comision_bac)}</td></tr>
        <tr style="border-bottom:1px solid #e5e7eb"><td style="padding:3px 8px">Comisión Tarjeta FICOHSA</td><td style="text-align:right;padding:3px 8px">${fmtL(c.comision_ficohsa)}</td></tr>
        <tr style="border-bottom:1px solid #e5e7eb"><td style="padding:3px 8px">Ventas Crédito Pista</td><td style="text-align:right;padding:3px 8px">${fmtL(c.ventas_credito_pista)}</td></tr>
        <tr style="border-bottom:1px solid #e5e7eb"><td style="padding:3px 8px">Ventas Crédito Tienda</td><td style="text-align:right;padding:3px 8px">${fmtL(c.ventas_credito_tienda)}</td></tr>
        <tr style="border-bottom:1px solid #e5e7eb"><td style="padding:3px 8px">POS BAC</td><td style="text-align:right;padding:3px 8px">${fmtL(c.pos_bac)}</td></tr>
        <tr style="border-bottom:1px solid #e5e7eb"><td style="padding:3px 8px">POS FICOHSA</td><td style="text-align:right;padding:3px 8px">${fmtL(c.pos_ficohsa)}</td></tr>
        <tr style="background:#f3f4f6;font-weight:700"><td style="padding:4px 8px">TOTAL NO EFECTIVO</td><td style="text-align:right;padding:4px 8px">${fmtL(c.total_no_efectivo)}</td></tr>
        <tr style="background:#1e3a5f;color:#fff;font-weight:700"><td style="padding:5px 8px">EFECTIVO DISPONIBLE PARA DEPÓSITO</td><td style="text-align:right;padding:5px 8px">${fmtL(c.efectivo_disponible)}</td></tr>
      </tbody>
    </table>

    <!-- DEPÓSITOS -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:10px;font-size:11px">
      <thead>
        <tr style="background:#1e3a5f;color:#fff">
          <th style="padding:5px 8px;text-align:left">DEPÓSITOS REALIZADOS</th>
          <th style="padding:5px 8px;text-align:right">MONTO</th>
        </tr>
      </thead>
      <tbody>
        ${[1,2,3,4,5,6,7,8,9,10].filter(i => c['dep'+i] > 0).map(i => `<tr style="border-bottom:1px solid #e5e7eb"><td style="padding:3px 8px">Depósito ${i}</td><td style="text-align:right;padding:3px 8px">${fmtL(c['dep'+i])}</td></tr>`).join('')}
        <tr style="background:#f3f4f6;font-weight:700"><td style="padding:4px 8px">TOTAL DEPÓSITOS</td><td style="text-align:right;padding:4px 8px">${fmtL(c.total_depositos)}</td></tr>
        ${c.sobrante_dumbar > 0 ? `<tr><td style="padding:3px 8px">Sobrante DUMBAR</td><td style="text-align:right;padding:3px 8px">${fmtL(c.sobrante_dumbar)}</td></tr>` : ''}
        ${c.faltante_dumbar > 0 ? `<tr><td style="padding:3px 8px">Faltante DUMBAR</td><td style="text-align:right;padding:3px 8px;color:red">(${fmtL(c.faltante_dumbar)})</td></tr>` : ''}
        ${c.cheques_post_fechados > 0 ? `<tr><td style="padding:3px 8px">Cheques Post-Fechados</td><td style="text-align:right;padding:3px 8px">${fmtL(c.cheques_post_fechados)}</td></tr>` : ''}
        ${c.sobrante > 0 ? `<tr><td style="padding:3px 8px;color:green;font-weight:700">✅ SOBRANTE</td><td style="text-align:right;padding:3px 8px;color:green;font-weight:700">${fmtL(c.sobrante)}</td></tr>` : ''}
        ${c.faltante > 0 ? `<tr><td style="padding:3px 8px;color:red;font-weight:700">❌ FALTANTE</td><td style="text-align:right;padding:3px 8px;color:red;font-weight:700">(${fmtL(c.faltante)})</td></tr>` : ''}
        <tr style="background:#1e3a5f;color:#fff;font-weight:700"><td style="padding:5px 8px">TOTAL DEPOSITADO</td><td style="text-align:right;padding:5px 8px">${fmtL(c.total_depositado)}</td></tr>
      </tbody>
    </table>

    <!-- FIRMA -->
    <div style="margin-top:30px;display:flex;justify-content:space-between;gap:20px">
      <div style="text-align:center;flex:1">
        <div style="border-top:1px solid #333;margin-top:40px;padding-top:6px">
          <strong>${c.firma_elaboracion || ''}</strong>
          <p style="margin:2px 0;font-size:10px;color:#666">Firma de Elaboración</p>
        </div>
      </div>
      <div style="text-align:center;flex:1">
        <div style="border-top:1px solid #333;margin-top:40px;padding-top:6px">
          <p style="margin:2px 0;font-size:10px;color:#666">Firma de Revisión</p>
        </div>
      </div>
      <div style="text-align:center;flex:1">
        <div style="border-top:1px solid #333;margin-top:40px;padding-top:6px">
          <p style="margin:2px 0;font-size:10px;color:#666">Firma de Autorización</p>
        </div>
      </div>
    </div>
  </div>`;
  
  res.json({ html });
});

// ─── HELPERS ───
function buildCampos(data) {
  const num = (v) => parseFloat(v) || 0;
  const str = (v) => v || null;
  return {
    fecha: data.fecha,
    prefijo_premium: str(data.prefijo_premium),
    prefijo_ruby: str(data.prefijo_ruby),
    prefijo_talonario: str(data.prefijo_talonario),
    fac_premium: str(data.fac_premium),
    fac_ruby: str(data.fac_ruby),
    fac_talonario: str(data.fac_talonario),
    venta_super: num(data.venta_super),
    venta_regular: num(data.venta_regular),
    venta_diesel: num(data.venta_diesel),
    get ingresos_pista() {
      return num(data.venta_super)+num(data.venta_regular)+num(data.venta_diesel);
    },
    venta_exenta: num(data.venta_exenta),
    venta_gravada_15: num(data.venta_gravada_15),
    venta_gravada_18: num(data.venta_gravada_18),
    isv_15: num(data.isv_15) || num(data.venta_gravada_15)*0.15,
    isv_18: num(data.isv_18) || num(data.venta_gravada_18)*0.18,
    get ingresos_tienda() {
      const ex=num(data.venta_exenta), g15=num(data.venta_gravada_15), g18=num(data.venta_gravada_18);
      const i15=num(data.isv_15)||g15*0.15, i18=num(data.isv_18)||g18*0.18;
      return ex+g15+i15+g18+i18;
    },
    cobros_tienda: num(data.cobros_tienda),
    anticipos_clientes: num(data.anticipos_clientes),
    nc_descuentos_cred: num(data.nc_descuentos_cred),
    get total_ingresos() {
      const ex=num(data.venta_exenta), g15=num(data.venta_gravada_15), g18=num(data.venta_gravada_18);
      const i15=num(data.isv_15)||g15*0.15, i18=num(data.isv_18)||g18*0.18;
      const tienda=ex+g15+i15+g18+i18;
      const pista=num(data.venta_super)+num(data.venta_regular)+num(data.venta_diesel);
      return pista+tienda+num(data.cobros_tienda)+num(data.anticipos_clientes)+num(data.nc_descuentos_cred)+num(data.total_alquileres);
    },
    nc_anulacion: num(data.nc_anulacion),
    nc_descuentos_cc: num(data.nc_descuentos_cc),
    descuento_auto_servicio: num(data.descuento_auto_servicio),
    comision_bac: num(data.comision_bac),
    comision_ficohsa: num(data.comision_ficohsa),
    comision_tarjeta_total: num(data.comision_bac) + num(data.comision_ficohsa),
    ventas_credito_pista: num(data.ventas_credito_pista),
    ventas_credito_tienda: num(data.ventas_credito_tienda),
    pos_bac: num(data.pos_bac),
    pos_ficohsa: num(data.pos_ficohsa),
    pos_total: num(data.pos_bac) + num(data.pos_ficohsa),
    total_no_efectivo: num(data.total_no_efectivo),
    efectivo_disponible: num(data.efectivo_disponible),
    dep1: num(data.dep1), dep2: num(data.dep2), dep3: num(data.dep3), dep4: num(data.dep4), dep5: num(data.dep5),
    dep6: num(data.dep6), dep7: num(data.dep7), dep8: num(data.dep8), dep9: num(data.dep9), dep10: num(data.dep10),
    total_depositos: num(data.total_depositos),
    sobrante_dumbar: num(data.sobrante_dumbar),
    faltante_dumbar: num(data.faltante_dumbar),
    total_depositado_dumbar: num(data.total_depositado_dumbar),
    cheques_post_fechados: num(data.cheques_post_fechados),
    sobrante: num(data.sobrante),
    faltante: num(data.faltante),
    total_depositado: num(data.total_depositado),
    alquiler1_nombre: str(data.alquiler1_nombre), alquiler1_subtotal: num(data.alquiler1_subtotal), alquiler1_isv: num(data.alquiler1_isv),
    alquiler2_nombre: str(data.alquiler2_nombre), alquiler2_subtotal: num(data.alquiler2_subtotal), alquiler2_isv: num(data.alquiler2_isv),
    alquiler3_nombre: str(data.alquiler3_nombre), alquiler3_subtotal: num(data.alquiler3_subtotal), alquiler3_isv: num(data.alquiler3_isv),
    alquiler4_nombre: str(data.alquiler4_nombre), alquiler4_subtotal: num(data.alquiler4_subtotal), alquiler4_isv: num(data.alquiler4_isv),
    alquiler5_nombre: str(data.alquiler5_nombre), alquiler5_subtotal: num(data.alquiler5_subtotal), alquiler5_isv: num(data.alquiler5_isv),
    alquiler6_nombre: str(data.alquiler6_nombre), alquiler6_subtotal: num(data.alquiler6_subtotal), alquiler6_isv: num(data.alquiler6_isv),
    alquiler7_nombre: str(data.alquiler7_nombre), alquiler7_subtotal: num(data.alquiler7_subtotal), alquiler7_isv: num(data.alquiler7_isv),
    alquiler8_nombre: str(data.alquiler8_nombre), alquiler8_subtotal: num(data.alquiler8_subtotal), alquiler8_isv: num(data.alquiler8_isv),
    alquiler9_nombre: str(data.alquiler9_nombre), alquiler9_subtotal: num(data.alquiler9_subtotal), alquiler9_isv: num(data.alquiler9_isv),
    alquiler10_nombre: str(data.alquiler10_nombre), alquiler10_subtotal: num(data.alquiler10_subtotal), alquiler10_isv: num(data.alquiler10_isv),
    total_alquileres: num(data.total_alquileres),
    inv_inicial_super: num(data.inv_inicial_super), inv_inicial_regular: num(data.inv_inicial_regular), inv_inicial_diesel: num(data.inv_inicial_diesel),
    entregas_super: num(data.entregas_super), entregas_regular: num(data.entregas_regular), entregas_diesel: num(data.entregas_diesel),
    ventas_super_lit: num(data.ventas_super_lit), ventas_regular_lit: num(data.ventas_regular_lit), ventas_diesel_lit: num(data.ventas_diesel_lit),
    ajustes_super: num(data.ajustes_super), ajustes_regular: num(data.ajustes_regular), ajustes_diesel: num(data.ajustes_diesel),
    inv_cierre_super: num(data.inv_cierre_super), inv_cierre_regular: num(data.inv_cierre_regular), inv_cierre_diesel: num(data.inv_cierre_diesel),
    lect_vara_super: num(data.lect_vara_super), lect_vara_regular: num(data.lect_vara_regular), lect_vara_diesel: num(data.lect_vara_diesel),
    vara_litros_super: num(data.vara_litros_super), vara_litros_regular: num(data.vara_litros_regular), vara_litros_diesel: num(data.vara_litros_diesel),
    variacion_acum_super: num(data.variacion_acum_super), variacion_acum_regular: num(data.variacion_acum_regular), variacion_acum_diesel: num(data.variacion_acum_diesel),
    variacion_diaria_super: num(data.variacion_diaria_super), variacion_diaria_regular: num(data.variacion_diaria_regular), variacion_diaria_diesel: num(data.variacion_diaria_diesel),
    costo_super: num(data.costo_super), costo_regular: num(data.costo_regular), costo_diesel: num(data.costo_diesel),
    inv_final_lps_super: num(data.inv_final_lps_super), inv_final_lps_regular: num(data.inv_final_lps_regular), inv_final_lps_diesel: num(data.inv_final_lps_diesel),
    firma_elaboracion: str(data.firma_elaboracion),
    notas: str(data.notas),
    estado: data.estado || 'borrador',
  };
}

function generarAsiento(cuadreId, empresaId, data, userId) {
  const num = (v) => parseFloat(v) || 0;
  const fecha = data.fecha;
  const numPartida = `P--${fecha}`;
  
  const asiento = db.prepare(`INSERT INTO asientos_contables (empresa_id, cuadre_id, numero_partida, fecha, descripcion, estado, created_by)
    VALUES (?, ?, ?, ?, ?, 'no_contabilizado', ?)`).run(empresaId, cuadreId, numPartida, fecha, `Cuadre diario ${fecha}`, userId);
  
  const lineas = [
    { cuenta: '1101-03-01', desc: 'CAJA GENERAL', debe: num(data.efectivo_disponible) + num(data.sobrante_dumbar), haber: 0 },
    { cuenta: '1105-01-9999', desc: 'C X C CLIENTES', debe: num(data.ventas_credito_pista) + num(data.ventas_credito_tienda), haber: num(data.cobros_tienda) },
    { cuenta: '1105-05-03', desc: 'C X C POS TARJETA BAC', debe: num(data.pos_bac), haber: 0 },
    { cuenta: '1105-05-04', desc: 'C X C POS TARJETA FICOHSA', debe: num(data.pos_ficohsa), haber: 0 },
    { cuenta: '5302-01-05', desc: 'COMISIONES A TARJETAS', debe: num(data.comision_bac) + num(data.comision_ficohsa), haber: 0 },
    { cuenta: '4102-01-01', desc: 'DEVOLUCIONES Y DESCUENTOS', debe: num(data.nc_descuentos_cc) + num(data.descuento_auto_servicio), haber: 0 },
    { cuenta: '4101-01-01', desc: 'VENTAS DE COMBUSTIBLE', debe: 0, haber: num(data.ingresos_pista) },
    { cuenta: '4101-02-01', desc: 'VENTAS GRAVADAS DE TIENDA', debe: 0, haber: num(data.venta_gravada_15) + num(data.venta_gravada_18) },
    { cuenta: '4101-02-02', desc: 'VENTAS EXENTAS DE TIENDA', debe: 0, haber: num(data.venta_exenta) },
    { cuenta: '21-05-01-01', desc: 'ISV POR PAGAR', debe: 0, haber: num(data.isv_15) + num(data.isv_18) },
    { cuenta: '1101-03-04', desc: 'CHEQUES POST-FECHADOS', debe: num(data.cheques_post_fechados), haber: 0 },
    { cuenta: '2101-02-0008', desc: 'ANTICIPO A CLIENTES', debe: 0, haber: num(data.anticipos_clientes) },
    { cuenta: '4101-02-03', desc: 'INGRESOS POR ALQUILER', debe: 0, haber: num(data.total_alquileres) },
  ];
  
  lineas.forEach((l, i) => {
    if (l.debe > 0 || l.haber > 0) {
      db.prepare(`INSERT INTO asientos_lineas (asiento_id, cuenta, descripcion, debe, haber, orden) VALUES (?, ?, ?, ?, ?, ?)`).run(asiento.lastInsertRowid, l.cuenta, l.desc, l.debe, l.haber, i);
    }
  });
}

function actualizarAsiento(cuadreId, empresaId, data) {
  const existente = db.prepare('SELECT id FROM asientos_contables WHERE cuadre_id = ? AND empresa_id = ?').get(cuadreId, empresaId);
  if (existente) {
    db.prepare('DELETE FROM asientos_lineas WHERE asiento_id = ?').run(existente.id);
    db.prepare('DELETE FROM asientos_contables WHERE id = ?').run(existente.id);
  }
  generarAsiento(cuadreId, empresaId, data, 1);
}

module.exports = router;
