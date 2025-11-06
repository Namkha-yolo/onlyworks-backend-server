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
    version,
    platform,
    channel = 'stable',
    release_notes,
    desktop_download_url,
    web_deploy_url,
    sha256,
    min_os_version
  } = req.body;

  if (!version || !platform) {
    return res.status(400).json({
      error: 'Missing required parameters: version, platform'
    });
  }

  const validPlatforms = ['desktop', 'web', 'all'];
  const validChannels = ['stable', 'beta', 'canary', 'enterprise'];

  if (!validPlatforms.includes(platform)) {
    return res.status(400).json({
      error: `Invalid platform. Must be one of: ${validPlatforms.join(', ')}`
    });
  }

  if (!validChannels.includes(channel)) {
    return res.status(400).json({
      error: `Invalid channel. Must be one of: ${validChannels.join(', ')}`
    });
  }

  try {
    const client = await pool.connect();

    // Check if version already exists
    const existingQuery = `
      SELECT id FROM app_versions
      WHERE version = $1 AND platform = $2 AND channel = $3
    `;
    const existing = await client.query(existingQuery, [version, platform, channel]);

    if (existing.rows.length > 0) {
      client.release();
      return res.status(409).json({
        error: 'Version already exists',
        version,
        platform,
        channel
      });
    }

    // Insert new version
    const insertQuery = `
      INSERT INTO app_versions (
        version,
        platform,
        channel,
        release_notes,
        desktop_download_url,
        web_deploy_url,
        sha256,
        min_os_version
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, created_at
    `;

    const result = await client.query(insertQuery, [
      version,
      platform,
      channel,
      release_notes,
      desktop_download_url,
      web_deploy_url,
      sha256,
      min_os_version || {}
    ]);

    // Create deployment record for tracking rollout
    const deploymentQuery = `
      INSERT INTO update_deployments (
        version,
        platform,
        channel,
        rollout_percentage,
        status
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `;

    const deploymentResult = await client.query(deploymentQuery, [
      version,
      platform,
      channel,
      channel === 'stable' ? 100 : 0, // Stable releases start at 100%, others at 0%
      'pending'
    ]);

    client.release();

    res.status(201).json({
      success: true,
      version_id: result.rows[0].id,
      deployment_id: deploymentResult.rows[0].id,
      created_at: result.rows[0].created_at,
      message: `Version ${version} registered successfully for ${platform} platform`
    });

  } catch (error) {
    console.error('Version registration error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
};