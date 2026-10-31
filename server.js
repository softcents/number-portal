const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');
require('dotenv').config();

const { pool, initDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 5000;

// Security & Middlewares
app.use(helmet({
  contentSecurityPolicy: false // Allow inline scripts and CDN styles for dashboard UI
}));
app.use(cors());
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));

// Serve Static Frontend Assets
app.use(express.static(path.join(__dirname, 'public')));

// -------------------------------------------------------------
// Health Check Endpoint (System & aaPanel Monitoring)
// -------------------------------------------------------------
app.get('/health', async (req, res) => {
  let dbStatus = 'disconnected';
  let dbLatencyMs = null;
  const start = Date.now();

  try {
    const dbTest = await pool.query('SELECT 1 AS ok');
    if (dbTest.rows && dbTest.rows[0].ok === 1) {
      dbStatus = 'connected';
      dbLatencyMs = Date.now() - start;
    }
  } catch (err) {
    dbStatus = `error: ${err.message}`;
  }

  const memory = process.memoryUsage();
  res.json({
    status: dbStatus === 'connected' ? 'healthy' : 'degraded',
    service: 'Softcents Number Portal',
    domain: 'number-portal.softcents.com',
    port: PORT,
    database: {
      type: 'PostgreSQL',
      name: process.env.DB_NAME || 'noportal_sc',
      status: dbStatus,
      latency_ms: dbLatencyMs,
    },
    uptime_seconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    node_version: process.version,
    memory_usage_mb: {
      rss: Math.round((memory.rss / 1024 / 1024) * 100) / 100,
      heapUsed: Math.round((memory.heapUsed / 1024 / 1024) * 100) / 100,
    }
  });
});

// -------------------------------------------------------------
// Dashboard Statistics Overview
// -------------------------------------------------------------
app.get('/api/overview', async (req, res) => {
  try {
    const totalNums = await pool.query('SELECT count(*) FROM numbers');
    const activeNums = await pool.query("SELECT count(*) FROM numbers WHERE status = 'active'");
    const availableNums = await pool.query("SELECT count(*) FROM numbers WHERE status = 'available'");
    const totalPools = await pool.query('SELECT count(*) FROM number_pools');
    const totalCalls = await pool.query('SELECT count(*) FROM call_logs');

    res.json({
      success: true,
      stats: {
        total_numbers: parseInt(totalNums.rows[0].count, 10),
        active_numbers: parseInt(activeNums.rows[0].count, 10),
        available_numbers: parseInt(availableNums.rows[0].count, 10),
        total_pools: parseInt(totalPools.rows[0].count, 10),
        total_calls: parseInt(totalCalls.rows[0].count, 10)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// Numbers Inventory APIs
// -------------------------------------------------------------
app.get('/api/numbers', async (req, res) => {
  try {
    const { search, status, pool_id } = req.query;
    let query = `
      SELECT n.*, p.pool_name 
      FROM numbers n
      LEFT JOIN number_pools p ON n.pool_id = p.id
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (n.phone_number ILIKE $${params.length} OR n.country_name ILIKE $${params.length} OR n.assigned_customer ILIKE $${params.length})`;
    }
    if (status) {
      params.push(status);
      query += ` AND n.status = $${params.length}`;
    }
    if (pool_id) {
      params.push(parseInt(pool_id, 10));
      query += ` AND n.pool_id = $${params.length}`;
    }

    query += ' ORDER BY n.id ASC';

    const result = await pool.query(query, params);
    res.json({ success: true, count: result.rowCount, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/numbers', async (req, res) => {
  try {
    const { phone_number, country_code, country_name, number_type, status, pool_id, routing_type, routing_destination, monthly_fee, assigned_customer } = req.body;

    if (!phone_number) {
      return res.status(400).json({ success: false, error: 'phone_number is required' });
    }

    const query = `
      INSERT INTO numbers (
        phone_number, country_code, country_name, number_type, status, 
        pool_id, routing_type, routing_destination, monthly_fee, 
        assigned_customer, assigned_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;

    const assignedAt = assigned_customer ? new Date() : null;
    const values = [
      phone_number,
      country_code || '+1',
      country_name || 'United States',
      number_type || 'DID',
      status || 'available',
      pool_id || null,
      routing_type || 'SIP_URI',
      routing_destination || 'sip:trunk@pbx.softcents.com:5060',
      monthly_fee || 1.50,
      assigned_customer || null,
      assignedAt
    ];

    const result = await pool.query(query, values);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/numbers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, routing_type, routing_destination, monthly_fee, assigned_customer } = req.body;

    const assignedAt = assigned_customer ? new Date() : null;

    const query = `
      UPDATE numbers SET 
        status = COALESCE($1, status),
        routing_type = COALESCE($2, routing_type),
        routing_destination = COALESCE($3, routing_destination),
        monthly_fee = COALESCE($4, monthly_fee),
        assigned_customer = $5,
        assigned_at = $6,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $7
      RETURNING *
    `;

    const result = await pool.query(query, [status, routing_type, routing_destination, monthly_fee, assigned_customer || null, assignedAt, id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Number not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/numbers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM numbers WHERE id = $1 RETURNING *', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Number not found' });
    }
    res.json({ success: true, message: 'Number deleted successfully', data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// Number Pools APIs
// -------------------------------------------------------------
app.get('/api/pools', async (req, res) => {
  try {
    const query = `
      SELECT p.*, count(n.id) as number_count
      FROM number_pools p
      LEFT JOIN numbers n ON n.pool_id = p.id
      GROUP BY p.id
      ORDER BY p.id ASC
    `;
    const result = await pool.query(query);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/pools', async (req, res) => {
  try {
    const { pool_name, description, carrier } = req.body;
    if (!pool_name) {
      return res.status(400).json({ success: false, error: 'pool_name is required' });
    }
    const query = `
      INSERT INTO number_pools (pool_name, description, carrier)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const result = await pool.query(query, [pool_name, description || '', carrier || 'Standard']);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// Call Logs APIs
// -------------------------------------------------------------
app.get('/api/call-logs', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM call_logs ORDER BY call_time DESC LIMIT 50');
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Catch-all route to serve SPA frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server & Initialize Database
async function startServer() {
  try {
    await initDatabase();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`=======================================================`);
      console.log(`🚀 Softcents Number Portal running on port ${PORT}`);
      console.log(`🌐 Public URL: http://number-portal.softcents.com`);
      console.log(`📡 Local Binding: http://127.0.0.1:${PORT}`);
      console.log(`🗄️  Database: PostgreSQL noportal_sc (Port 5432)`);
      console.log(`=======================================================`);
    });
  } catch (err) {
    console.error('Fatal: Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
