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

// Alertas semanales cada viernes a las 18:00
cron.schedule('0 18 * * 5', async () => {
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
console.log('  - Weekly alerts: Friday 18:00 CET');

process.on('SIGTERM', () => {
  console.log('[CRON] Shutting down...');
  process.exit(0);
});