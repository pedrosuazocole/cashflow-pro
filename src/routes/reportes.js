// src/routes/reportes.js - Módulo de Reportes completo
'use strict';

const express = require('express');
const router = express.Router();
const db = require('../database');
const layout = require('./layout');
const XLSX = require('xlsx');
const { requireAuth, requireEmpresa } = require('../middleware/auth');

router.use(requireAuth, requireEmpresa);

const fmt = (n) => new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2 }).format(n || 0);

// ─── MENÚ REPORTES ───
router.get('/', (req, res) => {
  const content = `
  <div class="page-header">
    <h1>📊 Reportes</h1>
    <p class="page-subtitle">Seleccioná el reporte que necesitás</p>
  </div>
  <div class="reportes-grid">
    <a href="/reportes/libro-ventas" class="reporte-card">
      <div class="rc-icon">📖</div>
      <h3>Libro de Ventas</h3>
      <p>Detalle diario de ventas pista y tienda con ISV</p>
    </a>
    <a href="/reportes/asientos" class="reporte-card">
      <div class="rc-icon">📚</div>
      <h3>Asientos Contables</h3>
      <p>Reporte de partidas contables del período</p>
    </a>
    <a href="/reportes/comparativo-pista" class="reporte-card">
      <div class="rc-icon">⛽</div>
      <h3>Comparativo Pista</h3>
      <p>Análisis comparativo de ventas de combustible</p>
    </a>
    <a href="/reportes/comparativo-tienda" class="reporte-card">
      <div class="rc-icon">🛒</div>
      <h3>Comparativo Tienda</h3>
      <p>Análisis comparativo de ventas de tienda</p>
    </a>
    <a href="/reportes/cuadres" class="reporte-card">
      <div class="rc-icon">📋</div>
      <h3>Resumen de Cuadres</h3>
      <p>Resumen general de cuadres por período</p>
    </a>
  </div>
  `;
  res.send(layout(content, { title: 'Reportes', user: req.session.user, empresa: req.session.empresa, empresas: (res.locals.empresas||[]), activePage: 'reportes' }));
});

// ─── LIBRO DE VENTAS ───
router.get('/libro-ventas', (req, res) => {
  const empId = req.session.empresa.id;
  const mes = req.query.mes || new Date().toISOString().substring(0, 7);
  
  const cuadres = db.prepare(`
    SELECT fecha, prefijo_premium, prefijo_ruby, fac_premium, fac_ruby,
      venta_super, venta_regular, venta_diesel, ingresos_pista,
      venta_exenta, venta_gravada_15, isv_15, venta_gravada_18, isv_18,
      (venta_exenta + venta_gravada_15 + isv_15 + venta_gravada_18 + isv_18) as ingresos_tienda,
      total_alquileres, total_ingresos
    FROM cuadres_diarios WHERE empresa_id = ? AND fecha LIKE ? ORDER BY fecha ASC
  `).all(empId, `${mes}%`);

  const totales = cuadres.reduce((acc, c) => {
    acc.pista += c.ingresos_pista || 0;
    acc.exenta += c.venta_exenta || 0;
    acc.grav15 += c.venta_gravada_15 || 0;
    acc.isv15 += c.isv_15 || 0;
    acc.grav18 += c.venta_gravada_18 || 0;
    acc.isv18 += c.isv_18 || 0;
    acc.tienda += c.ingresos_tienda || 0;
    acc.alquileres += c.total_alquileres || 0;
    acc.total += c.total_ingresos || 0;
    return acc;
  }, { pista:0, exenta:0, grav15:0, isv15:0, grav18:0, isv18:0, tienda:0, alquileres:0, total:0 });

  const content = `
  <div class="page-header">
    <div>
      <h1>📖 Libro de Ventas</h1>
      <p class="page-subtitle">${req.session.empresa.nombre}</p>
    </div>
    <div class="btn-group">
      <button onclick="printLibro()" class="btn btn-outline">🖨️ Imprimir</button>
      <button onclick="exportLibroXLS('${mes}')" class="btn btn-secondary">📥 Exportar Excel</button>
    </div>
  </div>

  <div class="card mb16">
    <div class="card-body">
      <form method="GET" class="filter-form">
        <div class="filter-group">
          <label>Período (Mes):</label>
          <input type="month" name="mes" value="${mes}" class="form-control">
        </div>
        <button type="submit" class="btn btn-primary">Consultar</button>
      </form>
    </div>
  </div>

  <div id="libroContent">
    <div class="card">
      <div class="card-header">
        <div style="text-align:center">
          <h3>${req.session.empresa.nombre}</h3>
          <p>LIBRO DE VENTAS — ${mesLabel(mes)}</p>
        </div>
      </div>
      <div class="card-body p0">
        <div class="table-scroll-x">
          <table class="table table-sm libro-table">
            <thead>
              <tr style="background:#1e3a5f;color:#fff">
                <th rowspan="2">DÍA</th>
                <th rowspan="2">FACTURAS</th>
                <th colspan="2" class="text-center">VENTAS PISTA</th>
                <th colspan="5" class="text-center">VENTAS TIENDA</th>
                <th rowspan="2">ALQUILER</th>
                <th rowspan="2">TOTAL DÍA</th>
              </tr>
              <tr style="background:#374151;color:#fff">
                <th>Pista Total</th>
                <th>Facturas</th>
                <th>Exenta</th>
                <th>Grav. 15%</th>
                <th>ISV 15%</th>
                <th>Grav. 18%</th>
                <th>ISV 18%</th>
              </tr>
            </thead>
            <tbody>
              ${cuadres.map(c => `
                <tr>
                  <td>${c.fecha}</td>
                  <td>${c.prefijo_premium || ''}</td>
                  <td class="text-right">${fmt(c.ingresos_pista)}</td>
                  <td>${c.fac_premium || ''}</td>
                  <td class="text-right">${fmt(c.venta_exenta)}</td>
                  <td class="text-right">${fmt(c.venta_gravada_15)}</td>
                  <td class="text-right">${fmt(c.isv_15)}</td>
                  <td class="text-right">${fmt(c.venta_gravada_18)}</td>
                  <td class="text-right">${fmt(c.isv_18)}</td>
                  <td class="text-right">${fmt(c.total_alquileres)}</td>
                  <td class="text-right font-bold">${fmt(c.total_ingresos)}</td>
                </tr>`).join('')}
            </tbody>
            <tfoot>
              <tr style="background:#1e3a5f;color:#fff;font-weight:bold">
                <td colspan="2">TOTALES</td>
                <td class="text-right">${fmt(totales.pista)}</td>
                <td></td>
                <td class="text-right">${fmt(totales.exenta)}</td>
                <td class="text-right">${fmt(totales.grav15)}</td>
                <td class="text-right">${fmt(totales.isv15)}</td>
                <td class="text-right">${fmt(totales.grav18)}</td>
                <td class="text-right">${fmt(totales.isv18)}</td>
                <td class="text-right">${fmt(totales.alquileres)}</td>
                <td class="text-right">${fmt(totales.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  </div>
  <script>
    function printLibro() {
      const content = document.getElementById('libroContent').innerHTML;
      document.getElementById('printPreviewContent').innerHTML = content;
      document.getElementById('printModal').classList.add('open');
    }
    function exportLibroXLS(mes) {
      window.location = '/reportes/libro-ventas/export?mes='+mes;
    }
  </script>
  `;
  res.send(layout(content, { title: 'Libro de Ventas', user: req.session.user, empresa: req.session.empresa, empresas: (res.locals.empresas||[]), activePage: 'libro-ventas' }));
});

// ─── EXPORT LIBRO EXCEL ───
router.get('/libro-ventas/export', (req, res) => {
  const empId = req.session.empresa.id;
  const mes = req.query.mes || new Date().toISOString().substring(0, 7);
  const cuadres = db.prepare(`SELECT * FROM cuadres_diarios WHERE empresa_id = ? AND fecha LIKE ? ORDER BY fecha`).all(empId, `${mes}%`);
  
  const data = [
    [req.session.empresa.nombre],
    [`LIBRO DE VENTAS — ${mesLabel(mes)}`],
    [],
    ['DÍA', 'FACTURAS PISTA', 'VENTAS PISTA', 'FACTURAS TIENDA', 'VENTA EXENTA', 'GRAV. 15%', 'ISV 15%', 'GRAV. 18%', 'ISV 18%', 'ALQUILER', 'TOTAL'],
    ...cuadres.map(c => [c.fecha, c.prefijo_premium, c.ingresos_pista, c.fac_premium, c.venta_exenta, c.venta_gravada_15, c.isv_15, c.venta_gravada_18, c.isv_18, c.total_alquileres, c.total_ingresos]),
    ['TOTALES', '', cuadres.reduce((s,c)=>s+(c.ingresos_pista||0),0), '', cuadres.reduce((s,c)=>s+(c.venta_exenta||0),0), cuadres.reduce((s,c)=>s+(c.venta_gravada_15||0),0), cuadres.reduce((s,c)=>s+(c.isv_15||0),0), cuadres.reduce((s,c)=>s+(c.venta_gravada_18||0),0), cuadres.reduce((s,c)=>s+(c.isv_18||0),0), cuadres.reduce((s,c)=>s+(c.total_alquileres||0),0), cuadres.reduce((s,c)=>s+(c.total_ingresos||0),0)],
  ];
  
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 12 }, { wch: 20 }, { wch: 14 }, { wch: 20 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Libro Ventas');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', `attachment; filename="libro-ventas-${mes}.xlsx"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// ─── COMPARATIVO PISTA ───
router.get('/comparativo-pista', (req, res) => {
  const empId = req.session.empresa.id;
  const anio = req.query.anio || new Date().getFullYear();
  
  const meses = [];
  for (let m = 1; m <= 12; m++) {
    const mesStr = `${anio}-${String(m).padStart(2,'0')}`;
    const datos = db.prepare(`SELECT SUM(venta_super) as super, SUM(venta_regular) as regular, SUM(venta_diesel) as diesel, SUM(venta_super + venta_regular + venta_diesel) as total FROM cuadres_diarios WHERE empresa_id = ? AND fecha LIKE ?`).get(empId, `${mesStr}%`);
    meses.push({ mes: mesStr, label: ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][m-1], ...datos });
  }

  const content = `
  <div class="page-header">
    <div>
      <h1>⛽ Comparativo de Ventas de Pista</h1>
      <p class="page-subtitle">Análisis mensual de combustibles</p>
    </div>
    <div class="btn-group">
      <button onclick="printComp()" class="btn btn-outline">🖨️ Imprimir</button>
      <button onclick="exportCompPista('${anio}')" class="btn btn-secondary">📥 Excel</button>
    </div>
  </div>

  <div class="card mb16">
    <div class="card-body">
      <form method="GET" class="filter-form">
        <div class="filter-group">
          <label>Año:</label>
          <input type="number" name="anio" value="${anio}" min="2020" max="2030" class="form-control" style="width:100px">
        </div>
        <button type="submit" class="btn btn-primary">Consultar</button>
      </form>
    </div>
  </div>

  <div id="compContent">
    <div class="card mb16">
      <div class="card-header">
        <h3>Ventas de Pista — ${anio}</h3>
      </div>
      <div class="card-body p0">
        <table class="table">
          <thead>
            <tr style="background:#1e3a5f;color:#fff">
              <th>MES</th>
              <th class="text-right">SUPER</th>
              <th class="text-right">REGULAR</th>
              <th class="text-right">DIESEL</th>
              <th class="text-right">TOTAL PISTA</th>
              <th class="text-right">% SUPER</th>
              <th class="text-right">% REGULAR</th>
              <th class="text-right">% DIESEL</th>
            </tr>
          </thead>
          <tbody>
            ${meses.map(m => {
              const total = m.total || 0;
              return `<tr>
                <td><strong>${m.label}</strong></td>
                <td class="text-right">${fmt(m.super)}</td>
                <td class="text-right">${fmt(m.regular)}</td>
                <td class="text-right">${fmt(m.diesel)}</td>
                <td class="text-right font-bold">${fmt(total)}</td>
                <td class="text-right">${total > 0 ? ((m.super/total)*100).toFixed(1)+'%' : '-'}</td>
                <td class="text-right">${total > 0 ? ((m.regular/total)*100).toFixed(1)+'%' : '-'}</td>
                <td class="text-right">${total > 0 ? ((m.diesel/total)*100).toFixed(1)+'%' : '-'}</td>
              </tr>`;
            }).join('')}
          </tbody>
          <tfoot>
            <tr style="background:#1e3a5f;color:#fff;font-weight:bold">
              <td>TOTALES</td>
              <td class="text-right">${fmt(meses.reduce((s,m)=>s+(m.super||0),0))}</td>
              <td class="text-right">${fmt(meses.reduce((s,m)=>s+(m.regular||0),0))}</td>
              <td class="text-right">${fmt(meses.reduce((s,m)=>s+(m.diesel||0),0))}</td>
              <td class="text-right">${fmt(meses.reduce((s,m)=>s+(m.total||0),0))}</td>
              <td colspan="3"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>

    <!-- GRÁFICO VISUAL -->
    <div class="card">
      <div class="card-header"><h3>Gráfico Comparativo</h3></div>
      <div class="card-body">
        <canvas id="chartPista" width="700" height="300"></canvas>
      </div>
    </div>
  </div>

  <script>
    function printComp() {
      const c = document.getElementById('compContent').innerHTML;
      document.getElementById('printPreviewContent').innerHTML = c;
      document.getElementById('printModal').classList.add('open');
    }
    function exportCompPista(anio) { window.location = '/reportes/comparativo-pista/export?anio='+anio; }

    // Simple bar chart
    const canvas = document.getElementById('chartPista');
    const ctx = canvas.getContext('2d');
    const labels = ${JSON.stringify(meses.map(m => m.label))};
    const dataSuper = ${JSON.stringify(meses.map(m => m.super || 0))};
    const dataRegular = ${JSON.stringify(meses.map(m => m.regular || 0))};
    const dataDiesel = ${JSON.stringify(meses.map(m => m.diesel || 0))};
    const maxVal = Math.max(...dataSuper.map((s,i) => s + dataRegular[i] + dataDiesel[i])) || 1;
    const W = canvas.width, H = canvas.height, PAD = 40, BAR_W = (W - PAD*2) / labels.length;
    ctx.clearRect(0,0,W,H);
    labels.forEach((l, i) => {
      const x = PAD + i * BAR_W;
      const ds = (dataSuper[i] / maxVal) * (H - PAD * 2);
      const dr = (dataRegular[i] / maxVal) * (H - PAD * 2);
      const dd = (dataDiesel[i] / maxVal) * (H - PAD * 2);
      const bw = BAR_W * 0.7;
      const bx = x + BAR_W * 0.15;
      ctx.fillStyle = '#2563eb'; ctx.fillRect(bx, H-PAD-ds, bw/3, ds);
      ctx.fillStyle = '#22c55e'; ctx.fillRect(bx+bw/3, H-PAD-dr, bw/3, dr);
      ctx.fillStyle = '#f59e0b'; ctx.fillRect(bx+2*bw/3, H-PAD-dd, bw/3, dd);
      ctx.fillStyle = '#374151'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(l, x + BAR_W/2, H - 10);
    });
  </script>
  `;
  res.send(layout(content, { title: 'Comparativo Pista', user: req.session.user, empresa: req.session.empresa, empresas: (res.locals.empresas||[]), activePage: 'comp-pista' }));
});

// ─── COMPARATIVO TIENDA ───
router.get('/comparativo-tienda', (req, res) => {
  const empId = req.session.empresa.id;
  const anio = req.query.anio || new Date().getFullYear();
  
  const meses = [];
  for (let m = 1; m <= 12; m++) {
    const mesStr = `${anio}-${String(m).padStart(2,'0')}`;
    const datos = db.prepare(`SELECT SUM(venta_exenta) as exenta, SUM(venta_gravada_15) as grav15, SUM(isv_15) as isv15, SUM(venta_gravada_18) as grav18, SUM(isv_18) as isv18, SUM(venta_exenta + venta_gravada_15 + isv_15 + venta_gravada_18 + isv_18) as total FROM cuadres_diarios WHERE empresa_id = ? AND fecha LIKE ?`).get(empId, `${mesStr}%`);
    meses.push({ mes: mesStr, label: ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][m-1], ...datos });
  }

  const content = `
  <div class="page-header">
    <div>
      <h1>🛒 Comparativo de Ventas de Tienda</h1>
      <p class="page-subtitle">Análisis mensual de tienda</p>
    </div>
    <div class="btn-group">
      <button onclick="printCompT()" class="btn btn-outline">🖨️ Imprimir</button>
      <button onclick="exportCompTienda('${anio}')" class="btn btn-secondary">📥 Excel</button>
    </div>
  </div>

  <div class="card mb16">
    <div class="card-body">
      <form method="GET" class="filter-form">
        <div class="filter-group">
          <label>Año:</label>
          <input type="number" name="anio" value="${anio}" min="2020" max="2030" class="form-control" style="width:100px">
        </div>
        <button type="submit" class="btn btn-primary">Consultar</button>
      </form>
    </div>
  </div>

  <div id="compTContent">
    <div class="card">
      <div class="card-header"><h3>Ventas de Tienda — ${anio}</h3></div>
      <div class="card-body p0">
        <table class="table">
          <thead>
            <tr style="background:#1e3a5f;color:#fff">
              <th>MES</th>
              <th class="text-right">EXENTA</th>
              <th class="text-right">GRAV. 15%</th>
              <th class="text-right">ISV 15%</th>
              <th class="text-right">GRAV. 18%</th>
              <th class="text-right">ISV 18%</th>
              <th class="text-right">TOTAL TIENDA</th>
            </tr>
          </thead>
          <tbody>
            ${meses.map(m => `
              <tr>
                <td><strong>${m.label}</strong></td>
                <td class="text-right">${fmt(m.exenta)}</td>
                <td class="text-right">${fmt(m.grav15)}</td>
                <td class="text-right">${fmt(m.isv15)}</td>
                <td class="text-right">${fmt(m.grav18)}</td>
                <td class="text-right">${fmt(m.isv18)}</td>
                <td class="text-right font-bold">${fmt(m.total)}</td>
              </tr>`).join('')}
          </tbody>
          <tfoot>
            <tr style="background:#1e3a5f;color:#fff;font-weight:bold">
              <td>TOTALES</td>
              <td class="text-right">${fmt(meses.reduce((s,m)=>s+(m.exenta||0),0))}</td>
              <td class="text-right">${fmt(meses.reduce((s,m)=>s+(m.grav15||0),0))}</td>
              <td class="text-right">${fmt(meses.reduce((s,m)=>s+(m.isv15||0),0))}</td>
              <td class="text-right">${fmt(meses.reduce((s,m)=>s+(m.grav18||0),0))}</td>
              <td class="text-right">${fmt(meses.reduce((s,m)=>s+(m.isv18||0),0))}</td>
              <td class="text-right">${fmt(meses.reduce((s,m)=>s+(m.total||0),0))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  </div>
  <script>
    function printCompT() {
      const c = document.getElementById('compTContent').innerHTML;
      document.getElementById('printPreviewContent').innerHTML = c;
      document.getElementById('printModal').classList.add('open');
    }
    function exportCompTienda(anio) { window.location = '/reportes/comparativo-tienda/export?anio='+anio; }
  </script>
  `;
  res.send(layout(content, { title: 'Comparativo Tienda', user: req.session.user, empresa: req.session.empresa, empresas: (res.locals.empresas||[]), activePage: 'comp-tienda' }));
});

// ─── EXPORT COMPARATIVO PISTA EXCEL ───
router.get('/comparativo-pista/export', (req, res) => {
  const empId = req.session.empresa.id;
  const anio = req.query.anio || new Date().getFullYear();
  const meses = [];
  for (let m = 1; m <= 12; m++) {
    const mesStr = `${anio}-${String(m).padStart(2,'0')}`;
    const label = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][m-1];
    const datos = db.prepare(`SELECT SUM(venta_super) as super, SUM(venta_regular) as regular, SUM(venta_diesel) as diesel, SUM(venta_super + venta_regular + venta_diesel) as total FROM cuadres_diarios WHERE empresa_id = ? AND fecha LIKE ?`).get(empId, `${mesStr}%`);
    meses.push([label, datos?.super||0, datos?.regular||0, datos?.diesel||0, datos?.total||0]);
  }
  const data = [
    [req.session.empresa.nombre],
    [`COMPARATIVO VENTAS PISTA — ${anio}`],
    [],
    ['MES', 'SUPER', 'REGULAR', 'DIESEL', 'TOTAL PISTA'],
    ...meses,
    ['TOTALES', meses.reduce((s,m)=>s+m[1],0), meses.reduce((s,m)=>s+m[2],0), meses.reduce((s,m)=>s+m[3],0), meses.reduce((s,m)=>s+m[4],0)],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), 'Comparativo Pista');
  res.setHeader('Content-Disposition', `attachment; filename="comp-pista-${anio}.xlsx"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
});

// ─── REPORTE ASIENTOS ───
router.get('/asientos', (req, res) => {
  const empId = req.session.empresa.id;
  const mes = req.query.mes || new Date().toISOString().substring(0, 7);
  const { estado } = req.query;
  
  let where = 'WHERE empresa_id = ? AND fecha LIKE ?';
  const params = [empId, `${mes}%`];
  if (estado) { where += ' AND estado = ?'; params.push(estado); }
  
  const asientos = db.prepare(`SELECT a.*, (SELECT SUM(debe) FROM asientos_lineas WHERE asiento_id=a.id) as td, (SELECT SUM(haber) FROM asientos_lineas WHERE asiento_id=a.id) as th FROM asientos_contables a ${where} ORDER BY fecha`).all(...params);

  const content = `
  <div class="page-header">
    <div>
      <h1>📚 Reporte de Asientos Contables</h1>
      <p class="page-subtitle">${req.session.empresa.nombre}</p>
    </div>
    <button onclick="printRepAsientos()" class="btn btn-outline">🖨️ Imprimir</button>
  </div>
  <div class="card mb16">
    <div class="card-body">
      <form method="GET" class="filter-form">
        <div class="filter-group">
          <label>Período:</label>
          <input type="month" name="mes" value="${mes}" class="form-control">
        </div>
        <div class="filter-group">
          <label>Estado:</label>
          <select name="estado" class="form-control">
            <option value="">Todos</option>
            <option value="no_contabilizado" ${estado==='no_contabilizado'?'selected':''}>No Contabilizados</option>
            <option value="contabilizado" ${estado==='contabilizado'?'selected':''}>Contabilizados</option>
          </select>
        </div>
        <button type="submit" class="btn btn-primary">Consultar</button>
      </form>
    </div>
  </div>
  <div id="repAsientosContent">
    ${asientos.map(a => {
      const lineas = db.prepare('SELECT * FROM asientos_lineas WHERE asiento_id = ? ORDER BY orden').all(a.id);
      return `
      <div class="card mb12">
        <div class="card-header" style="background:#f1f5f9">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <strong>${a.numero_partida}</strong> — ${a.fecha}
              <span class="badge badge-${a.estado==='contabilizado'?'green':'yellow'} ml8">${a.estado==='contabilizado'?'✅ Contabilizado':'⏳ No Contabilizado'}</span>
            </div>
            <div>${a.descripcion || ''}</div>
          </div>
        </div>
        <div class="card-body p0">
          <table class="table table-sm">
            <thead><tr><th>Cuenta</th><th>Descripción</th><th class="text-right">Debe</th><th class="text-right">Haber</th></tr></thead>
            <tbody>
              ${lineas.map(l => `<tr><td><code>${l.cuenta}</code></td><td>${l.descripcion||''}</td><td class="text-right">${l.debe>0?'L. '+fmt(l.debe):''}</td><td class="text-right">${l.haber>0?'L. '+fmt(l.haber):''}</td></tr>`).join('')}
            </tbody>
            <tfoot><tr class="bg-gray"><td colspan="2"><strong>TOTAL</strong></td><td class="text-right"><strong>L. ${fmt(a.td)}</strong></td><td class="text-right"><strong>L. ${fmt(a.th)}</strong></td></tr></tfoot>
          </table>
        </div>
      </div>`;
    }).join('') || '<div class="card"><div class="card-body text-center text-muted">No hay asientos en este período</div></div>'}
  </div>
  <script>
    function printRepAsientos() {
      const c = document.getElementById('repAsientosContent').innerHTML;
      document.getElementById('printPreviewContent').innerHTML = c;
      document.getElementById('printModal').classList.add('open');
    }
  </script>
  `;
  res.send(layout(content, { title: 'Reporte Asientos', user: req.session.user, empresa: req.session.empresa, empresas: (res.locals.empresas||[]), activePage: 'reportes' }));
});

// ─── REPORTE CUADRES ───
router.get('/cuadres', (req, res) => {
  const empId = req.session.empresa.id;
  const mes = req.query.mes || new Date().toISOString().substring(0, 7);
  
  const cuadres = db.prepare(`SELECT * FROM cuadres_diarios WHERE empresa_id = ? AND fecha LIKE ? ORDER BY fecha`).all(empId, `${mes}%`);
  const fmt2 = (n) => new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2 }).format(n || 0);

  const content = `
  <div class="page-header">
    <div>
      <h1>📋 Resumen de Cuadres</h1>
    </div>
    <button onclick="printResumen()" class="btn btn-outline">🖨️ Imprimir</button>
  </div>
  <div class="card mb16">
    <div class="card-body">
      <form method="GET" class="filter-form">
        <div class="filter-group">
          <label>Período:</label>
          <input type="month" name="mes" value="${mes}" class="form-control">
        </div>
        <button type="submit" class="btn btn-primary">Consultar</button>
      </form>
    </div>
  </div>
  <div id="resumenContent">
    <div class="card">
      <div class="card-body p0">
        <table class="table table-sm">
          <thead>
            <tr style="background:#1e3a5f;color:#fff">
              <th>Fecha</th><th>Total Pista</th><th>Total Tienda</th><th>Total Ingresos</th>
              <th>No Efectivo</th><th>Efectivo Disp.</th><th>Depositado</th><th>Sobrante</th><th>Faltante</th>
            </tr>
          </thead>
          <tbody>
            ${cuadres.map(c => `
              <tr>
                <td>${c.fecha}</td>
                <td class="text-right">${fmt2(c.ingresos_pista)}</td>
                <td class="text-right">${fmt2(c.ingresos_tienda)}</td>
                <td class="text-right font-bold">${fmt2(c.total_ingresos)}</td>
                <td class="text-right">${fmt2(c.total_no_efectivo)}</td>
                <td class="text-right">${fmt2(c.efectivo_disponible)}</td>
                <td class="text-right">${fmt2(c.total_depositos)}</td>
                <td class="text-right text-green">${c.sobrante > 0 ? fmt2(c.sobrante) : '-'}</td>
                <td class="text-right text-red">${c.faltante > 0 ? fmt2(c.faltante) : '-'}</td>
              </tr>`).join('')}
          </tbody>
          <tfoot>
            <tr style="background:#1e3a5f;color:#fff;font-weight:bold">
              <td>TOTALES</td>
              ${['ingresos_pista','ingresos_tienda','total_ingresos','total_no_efectivo','efectivo_disponible','total_depositos','sobrante','faltante'].map(k => `<td class="text-right">${fmt2(cuadres.reduce((s,c)=>s+(c[k]||0),0))}</td>`).join('')}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  </div>
  <script>
    function printResumen() {
      const c = document.getElementById('resumenContent').innerHTML;
      document.getElementById('printPreviewContent').innerHTML = c;
      document.getElementById('printModal').classList.add('open');
    }
  </script>
  `;
  res.send(layout(content, { title: 'Resumen Cuadres', user: req.session.user, empresa: req.session.empresa, empresas: (res.locals.empresas||[]), activePage: 'reportes' }));
});

function mesLabel(mes) {
  const [y, m] = mes.split('-');
  const nombres = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  return `${nombres[parseInt(m)-1]} ${y}`;
}

module.exports = router;
