// ============================================
// server.js - Punto de entrada principal
// ============================================
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();

// Middleware
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL }));
app.use(express.json());

// Conexión a PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// ============================================
// RUTAS DE BÚSQUEDAS
// ============================================

// Obtener todas las búsquedas de un usuario
app.get('/api/searches', async (req, res) => {
  const { userId } = req.query;
  try {
    const result = await pool.query(
      'SELECT * FROM saved_searches WHERE user_id = $1 AND is_active = true ORDER BY created_at DESC',
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Crear nueva búsqueda
app.post('/api/searches', async (req, res) => {
  const { userId, name, location, locationLat, locationLng, radiusKm, maxPrice, 
          chargesIncluded, minRooms, minArea, nearBus, nearTrain, condition, priorityHlm } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO saved_searches 
       (user_id, name, location, location_lat, location_lng, radius_km, max_price, 
        charges_included, min_rooms, min_area, near_bus, near_train, condition, priority_hlm)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [userId, name, location, locationLat, locationLng, radiusKm, maxPrice,
       chargesIncluded, minRooms, minArea, nearBus, nearTrain, condition, priorityHlm]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Actualizar búsqueda
app.put('/api/searches/:id', async (req, res) => {
  const { id } = req.params;
  const { name, location, locationLat, locationLng, radiusKm, maxPrice,
          chargesIncluded, minRooms, minArea, nearBus, nearTrain, condition, priorityHlm } = req.body;
  try {
    const result = await pool.query(
      `UPDATE saved_searches SET
       name = $1, location = $2, location_lat = $3, location_lng = $4, radius_km = $5,
       max_price = $6, charges_included = $7, min_rooms = $8, min_area = $9,
       near_bus = $10, near_train = $11, condition = $12, priority_hlm = $13, updated_at = NOW()
       WHERE id = $14 RETURNING *`,
      [name, location, locationLat, locationLng, radiusKm, maxPrice, chargesIncluded,
       minRooms, minArea, nearBus, nearTrain, condition, priorityHlm, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Eliminar búsqueda
app.delete('/api/searches/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('UPDATE saved_searches SET is_active = false WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// RUTAS DE RESULTADOS
// ============================================

// Ejecutar búsqueda y obtener resultados
app.get('/api/searches/:id/results', async (req, res) => {
  const { id } = req.params;
  try {
    const searchResult = await pool.query('SELECT * FROM saved_searches WHERE id = $1', [id]);
    const search = searchResult.rows[0];
    if (!search) return res.status(404).json({ error: 'Search not found' });

    const listings = await pool.query(`
      SELECT l.*, 
             calculate_distance($1, $2, l.latitude, l.longitude) AS distance_km
      FROM listings l
      WHERE l.is_active = true
        AND l.price <= $3
        AND l.rooms >= $4
        AND l.area >= $5
        AND calculate_distance($1, $2, l.latitude, l.longitude) <= $6
        AND ($7 = 'any' 
            OR ($7 = 'new' AND l.is_new = true)
            OR ($7 = 'renovated' AND l.is_renovated = true)
            OR ($7 = 'newOrRenovated' AND (l.is_new = true OR l.is_renovated = true)))
        AND ($8 = false OR l.near_bus = true)
        AND ($9 = false OR l.near_train = true)
      ORDER BY 
        CASE WHEN $10 = true THEN l.is_hlm END DESC NULLS LAST,
        l.price ASC,
        distance_km ASC
    `, [search.location_lat, search.location_lng, search.max_price, search.min_rooms,
        search.min_area, search.radius_km, search.condition, search.near_bus,
        search.near_train, search.priority_hlm]);

    res.json({ search, listings: listings.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// RUTAS DE ALERTAS
// ============================================

// Obtener configuración de alertas
app.get('/api/alerts', async (req, res) => {
  const { userId } = req.query;
  try {
    const result = await pool.query(
      'SELECT * FROM alert_settings WHERE user_id = $1',
      [userId]
    );
    res.json(result.rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Guardar configuración de alertas
app.post('/api/alerts', async (req, res) => {
  const { userId, email, frequency } = req.body;
  try {
    const result = await pool.query(`
      INSERT INTO alert_settings (user_id, email, frequency)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id) DO UPDATE SET email = $2, frequency = $3
      RETURNING *
    `, [userId, email, frequency]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// INICIAR SERVIDOR
// ============================================
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`API running on port ${PORT}`));

module.exports = { app, pool };