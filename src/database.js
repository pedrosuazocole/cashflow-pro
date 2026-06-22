// src/database.js - Inicialización y esquema de la base de datos SQLite
'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');
const fs = require('fs');

const DB_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DB_DIR, 'cashflowpro.db');

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);

// Habilitar WAL mode para mejor rendimiento
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─────────────────────────────────────────────
// ESQUEMA DE TABLAS
// ─────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS empresas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    rtn TEXT,
    direccion TEXT,
    telefono TEXT,
    email TEXT,
    logo TEXT,
    moneda TEXT DEFAULT 'HNL',
    activa INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id INTEGER,
    nombre TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    rol TEXT DEFAULT 'operador',
    activo INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (empresa_id) REFERENCES empresas(id)
  );

  CREATE TABLE IF NOT EXISTS cuadres_diarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id INTEGER NOT NULL,
    fecha TEXT NOT NULL,
    prefijo_premium TEXT,
    prefijo_ruby TEXT,
    prefijo_talonario TEXT,
    fac_premium TEXT,
    fac_ruby TEXT,
    fac_talonario TEXT,
    -- INGRESOS PISTA
    ingresos_pista REAL DEFAULT 0,
    venta_super REAL DEFAULT 0,
    venta_regular REAL DEFAULT 0,
    venta_diesel REAL DEFAULT 0,
    -- Litros por prefijo (precio unitario)
    precio_super REAL DEFAULT 0,
    precio_regular REAL DEFAULT 0,
    precio_diesel REAL DEFAULT 0,
    -- INGRESOS TIENDA
    ingresos_tienda REAL DEFAULT 0,
    venta_exenta REAL DEFAULT 0,
    venta_gravada_15 REAL DEFAULT 0,
    venta_gravada_18 REAL DEFAULT 0,
    isv_15 REAL DEFAULT 0,
    isv_18 REAL DEFAULT 0,
    -- COBROS
    cobros_tienda REAL DEFAULT 0,
    anticipos_clientes REAL DEFAULT 0,
    nc_descuentos_cred REAL DEFAULT 0,
    -- TOTAL INGRESOS
    total_ingresos REAL DEFAULT 0,
    -- NO EFECTIVO
    nc_anulacion REAL DEFAULT 0,
    nc_descuentos_cc REAL DEFAULT 0,
    descuento_auto_servicio REAL DEFAULT 0,
    comision_tarjeta_total REAL DEFAULT 0,
    comision_bac REAL DEFAULT 0,
    comision_ficohsa REAL DEFAULT 0,
    ventas_credito_pista REAL DEFAULT 0,
    ventas_credito_tienda REAL DEFAULT 0,
    pos_total REAL DEFAULT 0,
    pos_bac REAL DEFAULT 0,
    pos_ficohsa REAL DEFAULT 0,
    total_no_efectivo REAL DEFAULT 0,
    -- EFECTIVO
    efectivo_disponible REAL DEFAULT 0,
    -- DEPOSITOS (10 slots)
    dep1 REAL DEFAULT 0,
    dep2 REAL DEFAULT 0,
    dep3 REAL DEFAULT 0,
    dep4 REAL DEFAULT 0,
    dep5 REAL DEFAULT 0,
    dep6 REAL DEFAULT 0,
    dep7 REAL DEFAULT 0,
    dep8 REAL DEFAULT 0,
    dep9 REAL DEFAULT 0,
    dep10 REAL DEFAULT 0,
    total_depositos REAL DEFAULT 0,
    -- DUMBAR
    sobrante_dumbar REAL DEFAULT 0,
    faltante_dumbar REAL DEFAULT 0,
    total_depositado_dumbar REAL DEFAULT 0,
    -- OTROS
    cheques_post_fechados REAL DEFAULT 0,
    sobrante REAL DEFAULT 0,
    faltante REAL DEFAULT 0,
    total_depositado REAL DEFAULT 0,
    -- ALQUILERES (10 slots)
    alquiler1_nombre TEXT,
    alquiler1_subtotal REAL DEFAULT 0,
    alquiler1_isv REAL DEFAULT 0,
    alquiler2_nombre TEXT,
    alquiler2_subtotal REAL DEFAULT 0,
    alquiler2_isv REAL DEFAULT 0,
    alquiler3_nombre TEXT,
    alquiler3_subtotal REAL DEFAULT 0,
    alquiler3_isv REAL DEFAULT 0,
    alquiler4_nombre TEXT,
    alquiler4_subtotal REAL DEFAULT 0,
    alquiler4_isv REAL DEFAULT 0,
    alquiler5_nombre TEXT,
    alquiler5_subtotal REAL DEFAULT 0,
    alquiler5_isv REAL DEFAULT 0,
    alquiler6_nombre TEXT,
    alquiler6_subtotal REAL DEFAULT 0,
    alquiler6_isv REAL DEFAULT 0,
    alquiler7_nombre TEXT,
    alquiler7_subtotal REAL DEFAULT 0,
    alquiler7_isv REAL DEFAULT 0,
    alquiler8_nombre TEXT,
    alquiler8_subtotal REAL DEFAULT 0,
    alquiler8_isv REAL DEFAULT 0,
    alquiler9_nombre TEXT,
    alquiler9_subtotal REAL DEFAULT 0,
    alquiler9_isv REAL DEFAULT 0,
    alquiler10_nombre TEXT,
    alquiler10_subtotal REAL DEFAULT 0,
    alquiler10_isv REAL DEFAULT 0,
    total_alquileres REAL DEFAULT 0,
    -- INVENTARIO COMBUSTIBLE
    inv_inicial_super REAL DEFAULT 0,
    inv_inicial_regular REAL DEFAULT 0,
    inv_inicial_diesel REAL DEFAULT 0,
    entregas_super REAL DEFAULT 0,
    entregas_regular REAL DEFAULT 0,
    entregas_diesel REAL DEFAULT 0,
    ventas_super_lit REAL DEFAULT 0,
    ventas_regular_lit REAL DEFAULT 0,
    ventas_diesel_lit REAL DEFAULT 0,
    ajustes_super REAL DEFAULT 0,
    ajustes_regular REAL DEFAULT 0,
    ajustes_diesel REAL DEFAULT 0,
    inv_cierre_super REAL DEFAULT 0,
    inv_cierre_regular REAL DEFAULT 0,
    inv_cierre_diesel REAL DEFAULT 0,
    lect_vara_super REAL DEFAULT 0,
    lect_vara_regular REAL DEFAULT 0,
    lect_vara_diesel REAL DEFAULT 0,
    vara_litros_super REAL DEFAULT 0,
    vara_litros_regular REAL DEFAULT 0,
    vara_litros_diesel REAL DEFAULT 0,
    variacion_acum_super REAL DEFAULT 0,
    variacion_acum_regular REAL DEFAULT 0,
    variacion_acum_diesel REAL DEFAULT 0,
    variacion_diaria_super REAL DEFAULT 0,
    variacion_diaria_regular REAL DEFAULT 0,
    variacion_diaria_diesel REAL DEFAULT 0,
    costo_super REAL DEFAULT 0,
    costo_regular REAL DEFAULT 0,
    costo_diesel REAL DEFAULT 0,
    inv_final_lps_super REAL DEFAULT 0,
    inv_final_lps_regular REAL DEFAULT 0,
    inv_final_lps_diesel REAL DEFAULT 0,
    -- FIRMA
    firma_elaboracion TEXT,
    notas TEXT,
    estado TEXT DEFAULT 'borrador',
    created_by INTEGER,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime')),
    UNIQUE(empresa_id, fecha),
    FOREIGN KEY (empresa_id) REFERENCES empresas(id),
    FOREIGN KEY (created_by) REFERENCES usuarios(id)
  );

  CREATE TABLE IF NOT EXISTS asientos_contables (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id INTEGER NOT NULL,
    cuadre_id INTEGER,
    numero_partida TEXT NOT NULL,
    fecha TEXT NOT NULL,
    descripcion TEXT,
    estado TEXT DEFAULT 'no_contabilizado',
    created_by INTEGER,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (empresa_id) REFERENCES empresas(id),
    FOREIGN KEY (cuadre_id) REFERENCES cuadres_diarios(id),
    FOREIGN KEY (created_by) REFERENCES usuarios(id)
  );

  CREATE TABLE IF NOT EXISTS asientos_lineas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asiento_id INTEGER NOT NULL,
    cuenta TEXT NOT NULL,
    descripcion TEXT,
    debe REAL DEFAULT 0,
    haber REAL DEFAULT 0,
    orden INTEGER DEFAULT 0,
    FOREIGN KEY (asiento_id) REFERENCES asientos_contables(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS configuracion (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id INTEGER NOT NULL UNIQUE,
    nombre_tienda TEXT DEFAULT 'Tienda',
    nombre_pista TEXT DEFAULT 'Pista',
    tasa_isv1 REAL DEFAULT 15,
    tasa_isv2 REAL DEFAULT 18,
    banco1_nombre TEXT DEFAULT 'BAC',
    banco2_nombre TEXT DEFAULT 'FICOHSA',
    moneda TEXT DEFAULT 'HNL',
    simbolo_moneda TEXT DEFAULT 'L.',
    formato_factura TEXT DEFAULT 'carta',
    num_depositos INTEGER DEFAULT 10,
    catalogo_cuentas TEXT DEFAULT '[]',
    datos_empresa_adicionales TEXT DEFAULT '{}',
    FOREIGN KEY (empresa_id) REFERENCES empresas(id)
  );

  CREATE TABLE IF NOT EXISTS sesiones (
    sid TEXT PRIMARY KEY,
    sess TEXT NOT NULL,
    expired TEXT NOT NULL
  );
`);

// ─────────────────────────────────────────────
// DATOS INICIALES
// ─────────────────────────────────────────────
function seed() {
  const empresaExiste = db.prepare('SELECT id FROM empresas WHERE id = 1').get();
  if (!empresaExiste) {
    db.prepare(`INSERT INTO empresas (id, nombre, rtn, direccion, telefono, email)
      VALUES (1, 'Empresa Demo', '0501-1990-00001', 'Tegucigalpa, Honduras', '2220-0000', 'demo@empresa.hn')`).run();
    
    db.prepare(`INSERT INTO configuracion (empresa_id, nombre_tienda, nombre_pista) VALUES (1, 'Starmart', 'Pista')`).run();
  }

  const adminExiste = db.prepare("SELECT id FROM usuarios WHERE email = 'admin@cashflowpro.hn'").get();
  if (!adminExiste) {
    const hash = bcrypt.hashSync('Admin123!', 10);
    db.prepare(`INSERT INTO usuarios (empresa_id, nombre, email, password, rol)
      VALUES (1, 'Administrador', 'admin@cashflowpro.hn', ?, 'admin')`).run(hash);
  }
}

seed();

module.exports = db;

// ── Migración: columna imagenes_deposito ──
try { db.exec("ALTER TABLE cuadres_diarios ADD COLUMN imagenes_deposito TEXT"); } catch(e) {}
try { db.exec("ALTER TABLE cuadres_diarios ADD COLUMN cai_manual TEXT"); } catch(e) {}
try { db.exec("ALTER TABLE cuadres_diarios ADD COLUMN cai_platino TEXT"); } catch(e) {}

// ── Recalcular cuadres existentes con valores correctos ──
try {
  db.exec(`UPDATE cuadres_diarios SET
    efectivo_disponible = (
      (venta_super + venta_regular + venta_diesel) +
      (venta_exenta + venta_gravada_15 + isv_15 + venta_gravada_18 + isv_18) +
      cobros_tienda + anticipos_clientes + nc_descuentos_cred + total_alquileres
    ) - total_no_efectivo,
    sobrante = CASE WHEN (
      (dep1+dep2+dep3+dep4+dep5+dep6+dep7+dep8+dep9+dep10)
      + sobrante_dumbar - faltante_dumbar + cheques_post_fechados
      - ((venta_super+venta_regular+venta_diesel)
        +(venta_exenta+venta_gravada_15+isv_15+venta_gravada_18+isv_18)
        +cobros_tienda+anticipos_clientes+nc_descuentos_cred+total_alquileres
        -total_no_efectivo)
    ) > 0 THEN (
      (dep1+dep2+dep3+dep4+dep5+dep6+dep7+dep8+dep9+dep10)
      + sobrante_dumbar - faltante_dumbar + cheques_post_fechados
      - ((venta_super+venta_regular+venta_diesel)
        +(venta_exenta+venta_gravada_15+isv_15+venta_gravada_18+isv_18)
        +cobros_tienda+anticipos_clientes+nc_descuentos_cred+total_alquileres
        -total_no_efectivo)
    ) ELSE 0 END,
    faltante = CASE WHEN (
      (dep1+dep2+dep3+dep4+dep5+dep6+dep7+dep8+dep9+dep10)
      + sobrante_dumbar - faltante_dumbar + cheques_post_fechados
      - ((venta_super+venta_regular+venta_diesel)
        +(venta_exenta+venta_gravada_15+isv_15+venta_gravada_18+isv_18)
        +cobros_tienda+anticipos_clientes+nc_descuentos_cred+total_alquileres
        -total_no_efectivo)
    ) < 0 THEN ABS(
      (dep1+dep2+dep3+dep4+dep5+dep6+dep7+dep8+dep9+dep10)
      + sobrante_dumbar - faltante_dumbar + cheques_post_fechados
      - ((venta_super+venta_regular+venta_diesel)
        +(venta_exenta+venta_gravada_15+isv_15+venta_gravada_18+isv_18)
        +cobros_tienda+anticipos_clientes+nc_descuentos_cred+total_alquileres
        -total_no_efectivo)
    ) ELSE 0 END
    WHERE id > 0`);
  console.log('[DB] Cuadres existentes recalculados correctamente');
} catch(e) { console.error('[DB] Error recalculando cuadres:', e.message); }

// ── Migración: crear notif_config para empresas que no la tengan ──
try {
  const empresasSinConfig = db.prepare(`
    SELECT e.id FROM empresas e
    LEFT JOIN notif_config nc ON nc.empresa_id = e.id
    WHERE nc.empresa_id IS NULL
  `).all();
  empresasSinConfig.forEach(e => {
    db.prepare('INSERT OR IGNORE INTO notif_config (empresa_id) VALUES (?)').run(e.id);
  });
  if (empresasSinConfig.length > 0) {
    console.log(`[DB] Creadas ${empresasSinConfig.length} fila(s) de notif_config faltantes`);
  }
} catch(e) { console.error('[DB] Error creando notif_config faltantes:', e.message); }

// ── Tablas de Notificaciones (agregadas) ──
db.exec(`
  CREATE TABLE IF NOT EXISTS notif_contactos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id  INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nombre      TEXT    NOT NULL,
    telefono    TEXT    NOT NULL,
    activo      INTEGER DEFAULT 1,
    created_at  TEXT    DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS notif_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id  INTEGER NOT NULL,
    contacto_id INTEGER,
    tipo        TEXT    NOT NULL,
    mensaje     TEXT,
    estado      TEXT    DEFAULT 'pendiente',
    respuesta   TEXT,
    created_at  TEXT    DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS notif_config (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id      INTEGER NOT NULL UNIQUE REFERENCES empresas(id) ON DELETE CASCADE,
    textmebot_key   TEXT,
    envio_cuadre    INTEGER DEFAULT 1,
    hora_cuadre     TEXT    DEFAULT '20:00',
    envio_libro     INTEGER DEFAULT 1,
    hora_libro      TEXT    DEFAULT '14:00',
    envio_asientos  INTEGER DEFAULT 1,
    hora_asientos   TEXT    DEFAULT '15:00',
    envio_comparativo INTEGER DEFAULT 1,
    hora_comparativo  TEXT  DEFAULT '13:00',
    activo          INTEGER DEFAULT 1
  );
`);
