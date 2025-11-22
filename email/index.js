// ============================================
// email/index.js - Servicio de Emails
// ============================================
const { Resend } = require('resend');
const { Pool } = require('pg');
require('dotenv').config();

const resend = new Resend(process.env.RESEND_API_KEY);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function generateEmailTemplate(searchName, listings, lang = 'fr') {
  const translations = {
    fr: {
      subject: `🏠 ${listings.length} nouveaux logements - ${searchName}`,
      greeting: 'Bonjour',
      intro: `Voici les nouveaux logements pour votre recherche "${searchName}":`,
      rooms: 'pièces',
      viewListing: "Voir l'annonce"
    }
  };
  
  const t = translations[lang];
  
  const listingsHtml = listings.map(l => `
    <div style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
      <h3 style="margin: 0 0 8px 0; color: #1e293b;">${l.title}</h3>
      <p style="margin: 0; color: #64748b;">📍 ${l.address}</p>
      <p style="margin: 8px 0; color: #2563eb; font-size: 20px; font-weight: bold;">CHF ${l.price}</p>
      <p style="margin: 0; color: #64748b;">${l.rooms} ${t.rooms} • ${l.area} m²</p>
      <a href="${l.listing_url}" style="display: inline-block; margin-top: 12px; color: #2563eb; text-decoration: none;">
        ${t.viewListing} →
      </a>
    </div>
  `).join('');
  
  return {
    subject: t.subject,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #1e293b;">🏠 Housing Search</h1>
        <p>${t.greeting},</p>
        <p>${t.intro}</p>
        ${listingsHtml}
      </div>
    `
  };
}

async function sendAlertToUser(userId) {
  try {
    const alertResult = await pool.query(
      'SELECT * FROM alert_settings WHERE user_id = $1 AND is_active = true',
      [userId]
    );
    const alertSettings = alertResult.rows[0];
    if (!alertSettings) return;
    
    const searchesResult = await pool.query(
      'SELECT * FROM saved_searches WHERE user_id = $1 AND is_active = true',
      [userId]
    );
    
    for (const search of searchesResult.rows) {
      const listingsResult = await pool.query(`
        SELECT * FROM listings 
        WHERE is_active = true AND price <= $1 
        LIMIT 5
      `, [search.max_price]);
      
      const newListings = listingsResult.rows;
      if (newListings.length === 0) continue;
      
      const { subject, html } = generateEmailTemplate(search.name, newListings);
      
      await resend.emails.send({
        from: 'Housing Search <onboarding@resend.dev>',
        to: alertSettings.email,
        subject,
        html
      });
      
      console.log(`Sent alert for "${search.name}" to ${alertSettings.email}`);
    }
    
    await pool.query('UPDATE alert_settings SET last_sent_at = NOW() WHERE user_id = $1', [userId]);
    
  } catch (err) {
    console.error(`Error sending alerts to user ${userId}:`, err);
  }
}

async function sendAllAlerts(frequency = 'weekly') {
  console.log(`Starting ${frequency} alerts...`);
  
  try {
    const usersResult = await pool.query(
      'SELECT DISTINCT user_id FROM alert_settings WHERE frequency = $1 AND is_active = true',
      [frequency]
    );
    
    for (const { user_id } of usersResult.rows) {
      await sendAlertToUser(user_id);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log(`Completed ${frequency} alerts`);
  } catch (err) {
    console.error('Error in batch alerts:', err);
  }
}

module.exports = { sendAlertToUser, sendAllAlerts };

if (require.main === module) {
  const frequency = process.argv[2] || 'weekly';
  sendAllAlerts(frequency).then(() => process.exit(0));
}