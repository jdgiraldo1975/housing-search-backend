// ============================================
// scraper/index.js - Scraping Responsable
// ============================================
const puppeteer = require('puppeteer');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Delay entre requests (10 segundos = responsable)
const DELAY_MS = 10000;
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ============================================
// SCRAPER PARA HOMEGATE.CH (Responsable)
// ============================================
async function scrapeHomegate(location = 'Nyon', radiusKm = 10, maxPrice = 3500, minRooms = 4) {
  console.log(`🔍 Scraping Homegate for: ${location}, ${radiusKm}km, CHF ${maxPrice}, ${minRooms}+ rooms`);
  
  const browser = await puppeteer.launch({ 
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage'
    ]
  });
  
  try {
    const page = await browser.newPage();
    
    // User agent realista
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Construir URL de búsqueda
    const searchUrl = `https://www.homegate.ch/rent/real-estate/matching-list?ep=${maxPrice}&nrf=${minRooms}&loc=${location}`;
    
    console.log(`📍 URL: ${searchUrl}`);
    
    await page.goto(searchUrl, { 
      waitUntil: 'networkidle2', 
      timeout: 60000 
    });
    
    // Esperar a que carguen los resultados
    await page.waitForSelector('div[data-test="result-list"]', { timeout: 10000 }).catch(() => {
      console.log('⚠️  No se encontró la lista de resultados');
      return [];
    });
    
    // Extraer datos
    const listings = await page.evaluate(() => {
      const items = document.querySelectorAll('a[data-test="result-list-item"]');
      const results = [];
      
      items.forEach((item, index) => {
        try {
          // Título
          const titleEl = item.querySelector('span[data-test="listing-title"]');
          const title = titleEl?.textContent?.trim() || '';
          
          // Precio
          const priceEl = item.querySelector('span[data-test="listing-price"]');
          const priceText = priceEl?.textContent?.trim() || '';
          const priceMatch = priceText.match(/[\d']+/);
          const price = priceMatch ? parseInt(priceMatch[0].replace(/'/g, '')) : 0;
          
          // Dirección
          const addressEl = item.querySelector('address');
          const address = addressEl?.textContent?.trim() || '';
          
          // Detalles (habitaciones, área)
          const detailsEls = item.querySelectorAll('span[class*="Characteristic"]');
          let rooms = 0;
          let area = 0;
          
          detailsEls.forEach(el => {
            const text = el.textContent?.trim() || '';
            // Buscar habitaciones (ej: "4.5 rooms")
            if (text.includes('room')) {
              const roomMatch = text.match(/[\d.]+/);
              if (roomMatch) rooms = parseFloat(roomMatch[0]);
            }
            // Buscar área (ej: "110 m²")
            if (text.includes('m²')) {
              const areaMatch = text.match(/\d+/);
              if (areaMatch) area = parseInt(areaMatch[0]);
            }
          });
          
          // URL del anuncio
          const url = item.getAttribute('href') || '';
          const fullUrl = url.startsWith('http') ? url : `https://www.homegate.ch${url}`;
          
          // ID único del anuncio
          const idMatch = url.match(/\/(\d+)$/);
          const externalId = idMatch ? `homegate_${idMatch[1]}` : `homegate_${Date.now()}_${index}`;
          
          if (title && price > 0) {
            results.push({
              externalId,
              source: 'homegate',
              title,
              price,
              rooms,
              area,
              address,
              listingUrl: fullUrl
            });
          }
        } catch (err) {
          console.error('Error parsing listing:', err.message);
        }
      });
      
      return results;
    });
    
    console.log(`✅ Found ${listings.length} listings from Homegate`);
    return listings;
    
  } catch (error) {
    console.error('❌ Homegate scraping error:', error.message);
    return [];
  } finally {
    await browser.close();
  }
}

// ============================================
// GUARDAR EN BASE DE DATOS
// ============================================
async function saveListings(listings) {
  let saved = 0;
  let updated = 0;
  
  for (const listing of listings) {
    try {
      // Extraer código postal y ciudad de la dirección
      const addressParts = listing.address.split(',');
      let postalCode = '';
      let city = '';
      
      if (addressParts.length >= 2) {
        const lastPart = addressParts[addressParts.length - 1].trim();
        const match = lastPart.match(/(\d{4})\s+(.+)/);
        if (match) {
          postalCode = match[1];
          city = match[2];
        }
      }
      
      const result = await pool.query(`
        INSERT INTO listings (
          external_id, source, title, price, rooms, area, address, 
          postal_code, city, listing_url, is_active
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true)
        ON CONFLICT (external_id) 
        DO UPDATE SET
          price = EXCLUDED.price,
          title = EXCLUDED.title,
          rooms = EXCLUDED.rooms,
          area = EXCLUDED.area,
          last_seen_at = NOW(),
          is_active = true
        RETURNING (xmax = 0) AS inserted
      `, [
        listing.externalId,
        listing.source,
        listing.title,
        listing.price,
        listing.rooms || null,
        listing.area || null,
        listing.address,
        postalCode || null,
        city || null,
        listing.listingUrl
      ]);
      
      if (result.rows[0].inserted) {
        saved++;
      } else {
        updated++;
      }
      
    } catch (err) {
      console.error(`Error saving ${listing.externalId}:`, err.message);
    }
  }
  
  console.log(`💾 Saved: ${saved} new, ${updated} updated`);
  return { saved, updated };
}

// ============================================
// EJECUTAR SCRAPING COMPLETO
// ============================================
async function runFullScrape() {
  console.log('🚀 Starting scraping job...');
  const startTime = Date.now();
  
  try {
    // Marcar anuncios viejos como inactivos (no vistos en 7 días)
    const inactiveResult = await pool.query(`
      UPDATE listings 
      SET is_active = false 
      WHERE last_seen_at < NOW() - INTERVAL '7 days' 
      AND is_active = true
    `);
    console.log(`📊 Marked ${inactiveResult.rowCount} old listings as inactive`);
    
    // Buscar en diferentes ubicaciones
    const locations = [
  { name: '1260', radius: 10, maxPrice: 3500, minRooms: 4 }, // Nyon
  { name: '1271', radius: 10, maxPrice: 3000, minRooms: 4 }  // Givrins
];
    
    let totalListings = [];
    
    for (const loc of locations) {
      console.log(`\n🔎 Searching in ${loc.name}...`);
      const listings = await scrapeHomegate(loc.name, loc.radius, loc.maxPrice, loc.minRooms);
      totalListings = totalListings.concat(listings);
      
      // Delay entre búsquedas (ser responsable)
      if (locations.indexOf(loc) < locations.length - 1) {
        console.log(`⏳ Waiting ${DELAY_MS/1000}s before next search...`);
        await delay(DELAY_MS);
      }
    }
    
    // Eliminar duplicados
    const uniqueListings = Array.from(
      new Map(totalListings.map(l => [l.externalId, l])).values()
    );
    
    console.log(`\n📦 Total unique listings found: ${uniqueListings.length}`);
    
    // Guardar en BD
    if (uniqueListings.length > 0) {
      await saveListings(uniqueListings);
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n✅ Scraping completed in ${duration}s`);
    
  } catch (err) {
    console.error('❌ Scraping job failed:', err);
    throw err;
  }
}

// ============================================
// EXPORTAR Y EJECUTAR
// ============================================
module.exports = { runFullScrape, scrapeHomegate, saveListings };

// Ejecutar si se llama directamente
if (require.main === module) {
  runFullScrape()
    .then(() => {
      console.log('👋 Scraping job finished');
      process.exit(0);
    })
    .catch(err => {
      console.error('💥 Fatal error:', err);
      process.exit(1);
    });
}