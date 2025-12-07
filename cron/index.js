// ============================================
// cron/index.js - Tareas Programadas
// ============================================
const cron = require('node-cron');
const { runFullScrape } = require('../scraper');
const { sendAllAlerts } = require('../email');

// Scraping cada 6 horas
cron.schedule('0 */6 * * *', async () => {
  console.log('[CRON] Starting scheduled scrape...');
  try {
    await runFullScrape();
    console.log('[CRON] Scrape completed');
  } catch (err) {
    console.error('[CRON] Scrape failed:', err);
  }
}, {
  scheduled: true,
  timezone: 'Europe/Zurich'
});

// Alertas diarias a las 8:00 AM
cron.schedule('0 8 * * *', async () => {
  console.log('[CRON] Sending daily alerts...');
  try {
    await sendAllAlerts('daily');
    console.log('[CRON] Daily alerts completed');
  } catch (err) {
    console.error('[CRON] Daily alerts failed:', err);
  }
}, {
  scheduled: true,
  timezone: 'Europe/Zurich'
});

// Alertas semanales cada lunes a las 6:00 PM
cron.schedule('0 18 * * 1', async () => {
  console.log('[CRON] Sending weekly alerts...');
  try {
    await sendAllAlerts('weekly');
    console.log('[CRON] Weekly alerts completed');
  } catch (err) {
    console.error('[CRON] Weekly alerts failed:', err);
  }
}, {
  scheduled: true,
  timezone: 'Europe/Zurich'
});

console.log('[CRON] All scheduled tasks initialized');
console.log('  - Scraping: Every 6 hours');
console.log('  - Daily alerts: 8:00 AM CET');
console.log('  - Weekly alerts: Monday 9:00 AM CET');

process.on('SIGTERM', () => {
  console.log('[CRON] Shutting down...');
  process.exit(0);
});
```

**Guarda el archivo** (`Cmd + S`)

---

## Ahora algunos archivos de configuración:

### 4. Crear **.gitignore**

1. Haz clic derecho en **HOUSING-SEARCH-BACKEND** (raíz)
2. **"New File"**
3. Escribe: `.gitignore`

**Pega esto:**
```
node_modules/
.env
.env.local
*.log
npm-debug.log*
.DS_Store
```

**Guarda** (`Cmd + S`)

---

### 5. Crear **Procfile**

1. Haz clic derecho en **HOUSING-SEARCH-BACKEND** (raíz)
2. **"New File"**
3. Escribe: `Procfile` (sin extensión)

**Pega esto:**
```
web: node server.js
```

**Guarda** (`Cmd + S`)

---

## ✅ ¡Ya tienes todos los archivos!

Tu estructura debería verse así:
```
HOUSING-SEARCH-BACKEND
├── node_modules/
├── scraper/
│   └── index.js ✅
├── email/
│   └── index.js ✅
├── cron/
│   └── index.js ✅
├── database/
├── scripts/
├── server.js ✅
├── .env ✅
├── .gitignore ✅
├── Procfile ✅
├── package.json
└── package-lock.json