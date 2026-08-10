// src/server.js - Servidor principal CashFlow Pro
'use strict';

const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

// Inicializar DB antes de importar rutas
const db = require('./database');

// Rutas
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const cuadreRoutes = require('./routes/cuadre');
const asientosRoutes = require('./routes/asientos');
const reportesRoutes = require('./routes/reportes');
const usuariosRoutes = require('./routes/usuarios');
const empresasRoutes = require('./routes/empresas');
const configuracionRoutes = require('./routes/configuracion');
const notificacionesRoutes = require('./routes/notificaciones');

const app = express();
const PORT = process.env.PORT || 3000;

// Railway proxy
app.set('trust proxy', 1);

// ─────────────────────────────────────────────
// MIDDLEWARES
// ─────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Manifest PWA desde raíz del proyecto
app.get('/manifest.json', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'manifest.json'));
});
// Servir adjuntos de depósitos
const uploadsPath = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? require('path').join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'uploads')
  : require('path').join(__dirname, '..', 'data', 'uploads');
app.use('/uploads', require('express').static(uploadsPath));

// Service Worker
app.get('/sw.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'sw.js'));
});

// Sesiones con SQLite
const SQLiteStore = require('connect-sqlite3')(session);
const SESSION_DB_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, '..', 'data');
app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: SESSION_DB_DIR }),
  secret: process.env.SESSION_SECRET || 'cashflowpro_secret_2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 } // 8 horas
}));

// Evitar que el navegador cachee páginas que dependen de la empresa activa en sesión
// (sin esto, al cambiar de empresa el navegador puede mostrar una copia vieja
//  cacheada con los datos de la empresa anterior — ej. API Key de notificaciones)
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  next();
});

// Variables globales para vistas + lista de empresas
app.use((req, res, next) => {
  res.locals.user    = req.session.user    || null;
  res.locals.empresa = req.session.empresa || null;
  if (req.session.user) {
    try {
      res.locals.empresas = db.prepare('SELECT id, nombre FROM empresas WHERE activa = 1 ORDER BY nombre').all();
    } catch (e) { res.locals.empresas = []; }
  } else { res.locals.empresas = []; }
  next();
});

// ─────────────────────────────────────────────
// RUTAS
// ─────────────────────────────────────────────
app.use('/', authRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/cuadre', cuadreRoutes);
app.use('/asientos', asientosRoutes);
app.use('/reportes', reportesRoutes);
app.use('/usuarios', usuariosRoutes);
app.use('/empresas', empresasRoutes);
app.use('/configuracion', configuracionRoutes);
app.use('/notificaciones', notificacionesRoutes);

// API de empresa para el frontend
app.get('/api/empresa-actual', requireAuth, (req, res) => {
  res.json(req.session.empresa || {});
});

// Middleware de autenticación exportado
function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

// 404
app.use((req, res) => {
  res.status(404).send(`
    <div style="font-family:sans-serif;text-align:center;padding:50px">
      <h1>404 - Página no encontrada</h1>
      <a href="/dashboard">← Volver al inicio</a>
    </div>
  `);
});

// Arrancar scheduler de notificaciones
require('./services/scheduler');

app.listen(PORT, () => {
  console.log(`✅ CashFlow Pro corriendo en puerto ${PORT}`);
});

module.exports = app;
