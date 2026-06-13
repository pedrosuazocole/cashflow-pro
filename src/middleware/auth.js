// src/middleware/auth.js
'use strict';

const db = require('../database');

function requireAuth(req, res, next) {
  if (!req.session.user) {
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(401).json({ error: 'No autenticado' });
    }
    return res.redirect('/login');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.rol !== 'admin') {
    return res.status(403).json({ error: 'Sin permisos' });
  }
  next();
}

function requireEmpresa(req, res, next) {
  if (!req.session.empresa) {
    return res.redirect('/empresas/seleccionar');
  }
  next();
}

module.exports = { requireAuth, requireAdmin, requireEmpresa };
