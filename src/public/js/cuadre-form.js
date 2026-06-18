/* ============================================================
   CashFlow Pro - cuadre-form.js
   Fórmulas de cálculo para el Cuadre Diario
   ============================================================ */

/* ── Helpers globales (usados también desde el inline script) ── */
function pfG(id) {
  const el = document.getElementById(id) || document.querySelector('[name="'+id+'"]');
  const n  = parseFloat(el?.value);
  return isNaN(n) ? 0 : n;
}
function setG(id, val) {
  const el = document.getElementById(id) || document.querySelector('[name="'+id+'"]');
  if (el) el.value = typeof val === 'number' ? val.toFixed(2) : val;
}

/* ────────────────────────────────────────────────
 * PISTA
 * Cada combustible tiene:
 *  - input editable: id="ventaSuper" / name="venta_super"  (lo que ingresa el usuario)
 *  - total readonly: id="totalSuper"                        (igual al ingresado, por fila)
 *  - total general:  id="ingresosPista"
 * ──────────────────────────────────────────────── */
function calcPista() {
  const super_v   = pfG('ventaSuper');
  const regular_v = pfG('ventaRegular');
  const diesel_v  = pfG('ventaDiesel');

  // Total por fila (igual a la entrada — una sola columna de venta)
  setG('totalSuper',   super_v);
  setG('totalRegular', regular_v);
  setG('totalDiesel',  diesel_v);

  // Total ingresos pista
  const total_pista = super_v + regular_v + diesel_v;
  setG('ingresosPista', total_pista);

  calcTotalesGenerales();
}

/* ────────────────────────────────────────────────
 * TIENDA
 * ──────────────────────────────────────────────── */
function calcTienda() {
  const exenta    = pfG('venta_exenta');
  const grav15    = pfG('venta_gravada_15');
  const grav18    = pfG('venta_gravada_18');
  const isv15     = grav15 * 0.15;
  const isv18     = grav18 * 0.18;
  const subtotal  = exenta + grav15 + grav18;
  const totalTda  = subtotal + isv15 + isv18;

  // Actualizar campos hidden ISV
  setG('isv15', isv15);
  setG('isv18', isv18);

  // Actualizar displays de la tabla
  const d = id => document.getElementById(id);
  if (d('isv15Display'))          d('isv15Display').textContent          = isv15.toFixed(2);
  if (d('isv18Display'))          d('isv18Display').textContent          = isv18.toFixed(2);
  if (d('totalExentaRow'))        d('totalExentaRow').textContent        = exenta.toFixed(2);
  if (d('totalGrav15Row'))        d('totalGrav15Row').textContent        = (grav15 + isv15).toFixed(2);
  if (d('totalGrav18Row'))        d('totalGrav18Row').textContent        = (grav18 + isv18).toFixed(2);
  if (d('subtotalTiendaDisplay')) d('subtotalTiendaDisplay').textContent = subtotal.toFixed(2);
  if (d('totalIsvDisplay'))       d('totalIsvDisplay').textContent       = (isv15 + isv18).toFixed(2);
  if (d('totalTiendaDisplay'))    d('totalTiendaDisplay').textContent    = totalTda.toFixed(2);

  // Guardar total tienda en campo hidden para el submit
  setG('ingresosTienda', totalTda);

  calcTotalesGenerales();
}

/* ────────────────────────────────────────────────
 * ALQUILERES
 * ──────────────────────────────────────────────── */
function calcAlquilerTotal() {
  let subtotal = 0;
  for (let i = 1; i <= 10; i++) {
    const sub = pfG('alquiler'+i+'_subtotal');
    const isv = sub * 0.15;
    setG('alquilerIsv'+i, isv);
    const tot = sub + isv;
    const tdEl = document.getElementById('alqTotal'+i);
    if (tdEl) tdEl.textContent = 'L. ' + tot.toFixed(2);
    subtotal += sub;
  }
  const isvAlq   = subtotal * 0.15;
  const totalAlq = subtotal + isvAlq;
  setG('subtotalAlquiler', subtotal);
  setG('isvAlquiler',      isvAlq);
  setG('totalAlquileres',  totalAlq);

  calcTotalesGenerales();
}

function calcAlquiler(i) { calcAlquilerTotal(); }

/* ────────────────────────────────────────────────
 * NO EFECTIVO
 * ──────────────────────────────────────────────── */
function calcNoEfectivo() {
  const ventas_cred_pista  = pfG('ventas_cred_pista');
  const ventas_cred_tienda = pfG('ventas_cred_tienda');
  const pos_bac            = pfG('pos_bac');
  const pos_ficohsa        = pfG('pos_ficohsa');
  const comision_bac       = pfG('comision_bac');
  const comision_ficohsa   = pfG('comision_ficohsa');
  const nc_anulacion       = pfG('nc_anulacion');
  const nc_descuentos      = pfG('nc_descuentos');
  const desc_autoservicio  = pfG('desc_autoservicio');

  const total_no_ef = ventas_cred_pista + ventas_cred_tienda
                    + pos_bac + pos_ficohsa
                    + comision_bac + comision_ficohsa
                    + nc_anulacion + nc_descuentos + desc_autoservicio;

  setG('totalNoEfectivo', total_no_ef);
  calcTotalesGenerales();
}

/* ────────────────────────────────────────────────
 * DEPÓSITOS
 * ──────────────────────────────────────────────── */
function calcDepositos() {
  let total = 0;
  for (let i = 1; i <= 10; i++) {
    total += pfG('deposito'+i+'Monto');
  }
  setG('totalDepositos', total);
  calcSobrante();
}

/* ────────────────────────────────────────────────
 * TOTALES GENERALES
 * ──────────────────────────────────────────────── */
function calcTotalesGenerales() {
  const pista    = pfG('ingresosPista');
  const tienda   = pfG('ingresosTienda');
  const cobros   = pfG('cobros_tienda');    // Cobros recibidos en Pista
  const anticipos= pfG('anticipos_clientes');
  const nc_desc  = pfG('nc_descuentos_cred');
  const alq      = pfG('totalAlquileres');
  const no_ef    = pfG('totalNoEfectivo');

  const total_ingresos = pista + tienda + cobros + anticipos + nc_desc + alq;
  setG('totalIngresos', total_ingresos);

  const efectivo_disp = total_ingresos - no_ef;
  setG('efectivoDisponible', efectivo_disp);

  calcSobrante();
}

/* ────────────────────────────────────────────────
 * SOBRANTE / FALTANTE
 * ──────────────────────────────────────────────── */
function calcSobrante() {
  const depositado = pfG('totalDepositos');
  const efectivo   = pfG('efectivoDisponible');
  const cheques    = pfG('cheques_post_fechados');
  const dumbar_s   = pfG('dumbar_sobrante');
  const dumbar_f   = pfG('dumbar_faltante');
  const dumbar_net = dumbar_s - dumbar_f;

  setG('dumbarMonto', dumbar_net);

  const total_caja = depositado + cheques + dumbar_net;
  const diferencia = total_caja - efectivo;

  // Mostrar sobrante o faltante
  const elS = document.getElementById('sobranteField');
  const elF = document.getElementById('faltanteField');
  const lblS= document.getElementById('lblSobrante');
  const lblF= document.getElementById('lblFaltante');

  if (diferencia >= 0) {
    setG('sobranteField', diferencia);
    setG('faltanteField', 0);
    if (elS) elS.style.background = '#f0fdf4';
    if (lblS) lblS.style.color = '#15803d';
  } else {
    setG('sobranteField', 0);
    setG('faltanteField', Math.abs(diferencia));
    if (elF) elF.style.background = '#fef2f2';
    if (lblF) lblF.style.color = '#dc2626';
  }
}

/* ────────────────────────────────────────────────
 * INVENTARIO
 * ──────────────────────────────────────────────── */
function calcInventario() {
  ['super','regular','diesel'].forEach(tipo => {
    const id1    = tipo.charAt(0).toUpperCase(); // S, R o D
    const ini    = pfG('inv_inicial_'   + tipo);
    const ent    = pfG('entregas_'      + tipo);
    const vta    = pfG('ventas_'        + tipo + '_lit');
    const ajuste = pfG('ajustes_'       + tipo);
    const vara   = pfG('vara_litros_'   + tipo); // Vara Litros (name="vara_litros_super")
    const costo  = pfG('costo_'         + tipo);

    // Fórmula del Excel:
    // INV. CIERRE  = INV_INICIAL + ENTREGAS + AJUSTES - VENTAS
    const cierre = ini + ent + ajuste - vta;

    // VARIACIÓN ACUMULADA = VARA_LITROS - INV_CIERRE  (Excel: P40 = P39 - P37)
    const varAcum = vara - cierre;

    // INVENTARIO FINAL EN LEMPIRAS = VARA_LITROS × COSTO_UNITARIO  (Excel: P43 = P39 × P42)
    const invFinal = vara * costo;

    // Actualizar campos calculados
    setG('invCierre' + id1, cierre);

    // varAcum va al <td id="varAcumS/R/D">
    const acumEl = document.getElementById('varAcum' + id1);
    if (acumEl) acumEl.textContent = varAcum.toFixed(2);

    // invFinal va al campo readonly id="invFinalS/R/D"
    setG('invFinal' + id1, invFinal);
  });
}

/* ────────────────────────────────────────────────
 * INICIALIZACIÓN
 * ──────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  // Listeners Pista
  ['ventaSuper','ventaRegular','ventaDiesel'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', calcPista);
  });

  // Listeners Tienda
  ['venta_exenta','venta_gravada_15','venta_gravada_18'].forEach(nm => {
    const el = document.querySelector('[name="'+nm+'"]');
    if (el) el.addEventListener('input', calcTienda);
  });

  // Listeners Cobros/Anticipos/NC
  ['cobros_tienda','anticipos_clientes','nc_descuentos_cred'].forEach(nm => {
    const el = document.querySelector('[name="'+nm+'"]');
    if (el) el.addEventListener('input', calcTotalesGenerales);
  });

  // Listeners No Efectivo
  ['ventas_cred_pista','ventas_cred_tienda','pos_bac','pos_ficohsa',
   'comision_bac','comision_ficohsa','nc_anulacion','nc_descuentos','desc_autoservicio'
  ].forEach(nm => {
    const el = document.querySelector('[name="'+nm+'"]');
    if (el) el.addEventListener('input', calcNoEfectivo);
  });

  // Listeners Depósitos
  for (let i = 1; i <= 10; i++) {
    const el = document.getElementById('deposito'+i+'Monto');
    if (el) el.addEventListener('input', calcDepositos);
  }

  // Listeners Dumbar y Cheques
  ['dumbar_sobrante','dumbar_faltante'].forEach(nm => {
    const el = document.querySelector('[name="'+nm+'"]');
    if (el) el.addEventListener('input', calcSobrante);
  });
  const chqEl = document.querySelector('[name="cheques_post_fechados"]');
  if (chqEl) chqEl.addEventListener('input', calcSobrante);

  // Listeners Inventario
  ['super','regular','diesel'].forEach(tipo => {
    ['inv_inicial_','entregas_','ventas_','ajustes_','lect_vara_','costo_'].forEach(pref => {
      const el = document.querySelector('[name="'+pref+tipo+(pref==='ventas_'?'_lit':'')+'"]');
      if (el) el.addEventListener('input', calcInventario);
    });
  });

  // Listeners Alquileres
  for (let i = 1; i <= 10; i++) {
    const el = document.querySelector('[name="alquiler'+i+'_subtotal"]');
    if (el) el.addEventListener('input', () => calcAlquilerTotal());
  }

  // Cálculo inicial (modo edición)
  calcPista();
  calcTienda();
  calcNoEfectivo();
  calcDepositos();
  calcAlquilerTotal();
  calcInventario();
});
