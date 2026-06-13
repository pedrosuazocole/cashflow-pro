// src/routes/auth.js
'use strict';

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../database');

router.get('/', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.redirect('/login');
});

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.send(renderLogin());
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM usuarios WHERE email = ? AND activo = 1').get(email);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.send(renderLogin('Credenciales incorrectas'));
  }
  req.session.user = { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol, empresa_id: user.empresa_id };
  
  // Auto-seleccionar empresa si ya tiene una asignada
  if (user.empresa_id) {
    const emp = db.prepare('SELECT * FROM empresas WHERE id = ?').get(user.empresa_id);
    if (emp) req.session.empresa = emp;
  }
  
  res.redirect('/dashboard');
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

function renderLogin(error = '') {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CashFlow Pro - Iniciar Sesión</title>
<link rel="manifest" href="/manifest.json">
<link rel="icon" href="/images/logo.svg">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Segoe UI',sans-serif; background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 50%,#0f4c75 100%); min-height:100vh; display:flex; align-items:center; justify-content:center; }
  .login-card { background:#fff; border-radius:20px; padding:48px 40px; width:100%; max-width:420px; box-shadow:0 25px 60px rgba(0,0,0,0.4); }
  .logo-area { text-align:center; margin-bottom:32px; }
  .logo-area svg { width:80px; height:80px; }
  .logo-area h1 { font-size:28px; color:#0f172a; font-weight:800; margin-top:12px; }
  .logo-area p { color:#64748b; font-size:13px; margin-top:4px; }
  .form-group { margin-bottom:20px; }
  label { display:block; font-size:13px; font-weight:600; color:#374151; margin-bottom:6px; }
  input { width:100%; padding:12px 16px; border:2px solid #e5e7eb; border-radius:10px; font-size:15px; transition:.2s; outline:none; }
  input:focus { border-color:#2563eb; box-shadow:0 0 0 3px rgba(37,99,235,.1); }
  .btn-login { width:100%; padding:14px; background:linear-gradient(135deg,#2563eb,#1d4ed8); color:#fff; border:none; border-radius:10px; font-size:16px; font-weight:700; cursor:pointer; transition:.2s; }
  .btn-login:hover { transform:translateY(-1px); box-shadow:0 8px 25px rgba(37,99,235,.4); }
  .error { background:#fef2f2; border:1px solid #fecaca; color:#dc2626; padding:12px 16px; border-radius:8px; font-size:14px; margin-bottom:20px; }
  .version { text-align:center; color:#9ca3af; font-size:12px; margin-top:24px; }
</style>
</head>
<body>
<div class="login-card">
  <div class="logo-area">
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="48" fill="#0f172a"/>
      <rect x="20" y="35" width="60" height="40" rx="6" fill="#2563eb"/>
      <rect x="20" y="35" width="60" height="12" rx="6" fill="#1d4ed8"/>
      <circle cx="35" cy="60" r="6" fill="#fff" opacity=".9"/>
      <rect x="48" y="56" width="24" height="4" rx="2" fill="#fff" opacity=".7"/>
      <rect x="48" y="63" width="16" height="3" rx="1.5" fill="#fff" opacity=".5"/>
      <path d="M72 22 L78 28 L65 41 L59 35 Z" fill="#22c55e"/>
      <circle cx="78" cy="22" r="5" fill="#22c55e"/>
    </svg>
    <h1>CashFlow Pro</h1>
    <p>Sistema de Cuadre de Caja Multiempresa</p>
  </div>
  ${error ? `<div class="error">⚠️ ${error}</div>` : ''}
  <form method="POST" action="/login">
    <div class="form-group">
      <label>Correo Electrónico</label>
      <input type="email" name="email" required placeholder="usuario@empresa.hn" autofocus>
    </div>
    <div class="form-group">
      <label>Contraseña</label>
      <input type="password" name="password" required placeholder="••••••••">
    </div>
    <button type="submit" class="btn-login">Iniciar Sesión</button>
  </form>
  <p class="version">CashFlow Pro v1.0 © 2024</p>
</div>
</body>
</html>`;
}

module.exports = router;
