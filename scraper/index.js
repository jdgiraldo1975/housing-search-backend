// ============================================
// scraper/index.js - Servicio de Scraping
// ============================================
const puppeteer = require('puppeteer');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function scrapeHomegate(searchParams) {
  console.log('Scraping Homegate...');
  // Por ahora retornamos datos de ejemplo
  return [
    {
      externalId: 'homegate_1',
      source: 'homegate',
      title: 'Appartement 4.5 pièces à Nyon',
      price: 2800,
      rooms: 4.5,
      area: 110,
      address: 'Rue de la Gare 15, 1260 Nyon',
      listingUrl: 'https://www.homegate.ch/rent/example'
    }
  ];
}

async function saveListings(listings) {
  for (const listing of listings) {
    try {
      await pool.query(`
        INSERT INTO listings (external_id, source, title, price, rooms, area, address, listing_url)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (external_id) DO UPDATE SET
          price = EXCLUDED.price,
          last_seen_at = NOW()
      `, [
        listing.externalId,
        listing.source,
        listing.title,
        listing.price,
        listing.rooms,
        listing.area,
        listing.address,
        listing.listingUrl
      ]);
    } catch (err) {
      console.error(`Error saving listing ${listing.externalId}:`, err.message);
    }
  }
}

async function runFullScrape() {
  console.log('Starting scrape...');
  
  const searchParams = {
    radiusKm: 10,
    maxPrice: 3500,
    minRooms: 4,
    minArea: 90
  };
  
  try {
    const homegateListings = await scrapeHomegate(searchParams);
    await saveListings(homegateListings);
    console.log(`Scraped ${homegateListings.length} listings`);
  } catch (err) {
    console.error('Scrape error:', err);
  }
}

module.exports = { runFullScrape };

if (require.main === module) {
  runFullScrape().then(() => process.exit(0));
}