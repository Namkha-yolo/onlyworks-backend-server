const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    tenant_id,
    platform,
    action,
    version,
    previous_version,
    metadata
  } = req.body;

  if (!tenant_id || !platform || !action) {
    return res.status(400).json({
      error: 'Missing required parameters: tenant_id, platform, action'
    });
  }

  const validActions = [
    'approve_version',
    'toggle_auto_update',
    'install_update',
    'rollback',
    'schedule_update',
    'cancel_update',
    'update_downloaded',
    'update_installing',
    'update_installing_manual'
  ];

  if (!validActions.includes(action)) {
    return res.status(400).json({
      error: `Invalid action. Must be one of: ${validActions.join(', ')}`
    });
  }

  try {
    const client = await pool.connect();

    const insertQuery = `
      INSERT INTO update_audit_logs (
        tenant_id,
        platform,
        actor,
        action,
        version,
        previous_version,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, created_at
    `;

    const result = await client.query(insertQuery, [
      tenant_id,
      platform,
      'system', // Default actor for desktop client logs
      action,
      version,
      previous_version,
      metadata || {}
    ]);

    // Also log to update_statistics for tracking success/failure
    if (['install_update', 'update_installing'].includes(action)) {
      const statsQuery = `
        INSERT INTO update_statistics (
          version,
          platform,
          tenant_id,
          status,
          client_os,
          client_version
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `;

      await client.query(statsQuery, [
        version,
        platform,
        tenant_id,
        action === 'install_update' ? 'success' : 'in_progress',
        metadata?.os || 'unknown',
        previous_version
      ]);
    }

    client.release();

    res.status(200).json({
      success: true,
      log_id: result.rows[0].id,
      logged_at: result.rows[0].created_at
    });

  } catch (error) {
    console.error('Update log error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
};