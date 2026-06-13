# CashFlow Pro 💰
Sistema de Cuadre de Caja Multiempresa para Gasolineras y Negocios

## Módulos
- 📋 Cuadre Diario (Ingresos, Depósitos, Inventario Combustible)
- 📒 Asientos Contables (auto-generados, estados contabilizado/no contabilizado)
- 📋 Libro de Ventas (mensual, por empresa)
- ⛽ Comparativo Ventas Pista (Super/Regular/Diesel)
- 🛒 Comparativo Ventas Tienda (Exenta/Gravada 15%/18%)
- 📊 Reportes (imprimir y exportar Excel)
- 👥 Usuarios con roles (admin / supervisor / operador)
- 🏢 Empresas (multiempresa)
- ⚙️ Configuración del sistema

## Stack
- **Backend:** Node.js + Express
- **Base de datos:** SQLite (better-sqlite3)
- **Frontend:** Vanilla JS + CSS personalizado
- **PWA:** Instalable en móvil/tablet

## Credenciales iniciales
- **Email:** admin@cashflowpro.hn
- **Contraseña:** Admin123!

## Deploy en Railway

### 1. Crear proyecto en Railway
```bash
railway init
```

### 2. Agregar Volume (para persistencia de datos)
- En el dashboard de Railway > tu servicio > Volumes
- Mount path: `/data`

### 3. Variables de entorno
```
SESSION_SECRET=tu_clave_secreta_aqui
PORT=3000
```

### 4. Deploy
```bash
railway up
```

> **Nota:** `better-sqlite3` compila nativamente en Railway (imagen Debian).
> El directorio `/data` debe estar en un Railway Volume para persistencia.

## Desarrollo local
```bash
npm install
npm run dev
```

Abre http://localhost:3000
