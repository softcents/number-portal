const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'noportal_sc',
  user: process.env.DB_USER || 'noportal_sc',
  password: process.env.DB_PASS || 'noportal_sc',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

async function initDatabase() {
  const client = await pool.connect();
  try {
    console.log('[Database] Initializing tables for noportal_sc...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS number_pools (
        id SERIAL PRIMARY KEY,
        pool_name VARCHAR(100) NOT NULL UNIQUE,
        description TEXT,
        carrier VARCHAR(100) DEFAULT 'Standard',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS numbers (
        id SERIAL PRIMARY KEY,
        phone_number VARCHAR(32) NOT NULL UNIQUE,
        country_code VARCHAR(8) DEFAULT '+1',
        country_name VARCHAR(100) DEFAULT 'United States',
        number_type VARCHAR(32) DEFAULT 'DID',
        status VARCHAR(32) DEFAULT 'available',
        pool_id INTEGER REFERENCES number_pools(id) ON DELETE SET NULL,
        routing_type VARCHAR(32) DEFAULT 'SIP_URI',
        routing_destination VARCHAR(255) DEFAULT 'sip:trunk@pbx.softcents.com:5060',
        monthly_fee NUMERIC(10, 2) DEFAULT 1.50,
        assigned_customer VARCHAR(100) DEFAULT NULL,
        assigned_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS call_logs (
        id SERIAL PRIMARY KEY,
        call_id VARCHAR(64) UNIQUE,
        caller_id VARCHAR(32) NOT NULL,
        destination_number VARCHAR(32) NOT NULL,
        duration_sec INTEGER DEFAULT 0,
        disposition VARCHAR(32) DEFAULT 'ANSWERED',
        cost NUMERIC(10, 4) DEFAULT 0.0000,
        call_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS portal_settings (
        setting_key VARCHAR(64) PRIMARY KEY,
        setting_value TEXT,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Insert default pools if not exists
    const poolRes = await client.query('SELECT count(*) FROM number_pools');
    if (parseInt(poolRes.rows[0].count, 10) === 0) {
      await client.query(`
        INSERT INTO number_pools (pool_name, description, carrier) VALUES 
        ('BD Domestic Mobile', 'Bangladesh mobile numbers for local SMS and Voice', 'Grameenphone / Robi / Banglalink'),
        ('US Toll-Free / DID', 'US local and toll-free numbers', 'Bandwidth / Telnyx'),
        ('Global DID Pool', 'International DID routing pool', 'Voxbone / BICS');
      `);
      console.log('[Database] Default number pools seeded.');
    }

    // Insert initial sample numbers if table is empty
    const numRes = await client.query('SELECT count(*) FROM numbers');
    if (parseInt(numRes.rows[0].count, 10) === 0) {
      await client.query(`
        INSERT INTO numbers (phone_number, country_code, country_name, number_type, status, pool_id, routing_type, routing_destination, monthly_fee, assigned_customer, assigned_at) VALUES 
        ('+8801700000001', '+880', 'Bangladesh', 'Mobile', 'active', 1, 'HTTP_WEBHOOK', 'https://smsagri.softcents.com/api/v1/inbound', 2.00, 'Softcents Core', CURRENT_TIMESTAMP),
        ('+8801700000002', '+880', 'Bangladesh', 'Mobile', 'available', 1, 'HTTP_WEBHOOK', 'https://smsagri.softcents.com/api/v1/inbound', 2.00, NULL, NULL),
        ('+18005550199', '+1', 'United States', 'TollFree', 'active', 2, 'SIP_URI', 'sip:support@sip.softcents.com', 5.00, 'Enterprise Support', CURRENT_TIMESTAMP),
        ('+12025550143', '+1', 'United States', 'DID', 'available', 2, 'SIP_URI', 'sip:inbound@sip.softcents.com', 1.50, NULL, NULL),
        ('+442079460912', '+44', 'United Kingdom', 'Geographic', 'available', 3, 'SIP_URI', 'sip:uk@sip.softcents.com', 2.50, NULL, NULL);
      `);
      console.log('[Database] Default inventory numbers seeded.');
    }

    // Insert sample call logs if empty
    const logRes = await client.query('SELECT count(*) FROM call_logs');
    if (parseInt(logRes.rows[0].count, 10) === 0) {
      await client.query(`
        INSERT INTO call_logs (call_id, caller_id, destination_number, duration_sec, disposition, cost) VALUES
        ('c-98218-001', '+12025550111', '+18005550199', 142, 'ANSWERED', 0.0450),
        ('c-98218-002', '+8801712345678', '+8801700000001', 58, 'ANSWERED', 0.0120),
        ('c-98218-003', '+447911123456', '+18005550199', 0, 'BUSY', 0.0000);
      `);
    }

    console.log('[Database] noportal_sc initialization completed successfully.');
  } catch (err) {
    console.error('[Database] Error initializing database:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  initDatabase,
};
