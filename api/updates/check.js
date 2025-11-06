const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { tenant_id, platform, current_version } = req.query;

  if (!tenant_id || !platform || !current_version) {
    return res.status(400).json({
      error: 'Missing required parameters: tenant_id, platform, current_version'
    });
  }

  try {
    const client = await pool.connect();

    // Get tenant update policy
    const policyQuery = `
      SELECT
        auto_update_enabled,
        approved_desktop_version,
        approved_web_version,
        maintenance_window_start,
        maintenance_window_end,
        timezone,
        update_delay_hours,
        canary_enabled
      FROM tenant_update_policies
      WHERE tenant_id = $1
    `;
    const policyResult = await client.query(policyQuery, [tenant_id]);

    // Get latest version for platform
    const versionQuery = `
      SELECT version, created_at, desktop_download_url, web_deploy_url, release_notes
      FROM app_versions
      WHERE platform IN ($1, 'all')
        AND channel = 'stable'
        AND is_deprecated = false
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const versionResult = await client.query(versionQuery, [platform]);

    client.release();

    const policy = policyResult.rows[0] || {
      auto_update_enabled: false,
      approved_desktop_version: current_version,
      approved_web_version: current_version,
      maintenance_window_start: null,
      maintenance_window_end: null,
      timezone: 'UTC',
      update_delay_hours: 0,
      canary_enabled: false
    };

    const latestVersion = versionResult.rows[0];
    const approvedVersion = platform === 'desktop'
      ? policy.approved_desktop_version
      : policy.approved_web_version;

    const updateAvailable = latestVersion &&
      latestVersion.version !== current_version &&
      latestVersion.version === approvedVersion;

    const response = {
      auto_update_enabled: policy.auto_update_enabled,
      approved_version: approvedVersion,
      latest_version: latestVersion?.version || current_version,
      update_available: updateAvailable,
      current_version,
      maintenance_window: {
        start: policy.maintenance_window_start,
        end: policy.maintenance_window_end,
        timezone: policy.timezone
      },
      download_url: platform === 'desktop'
        ? latestVersion?.desktop_download_url
        : latestVersion?.web_deploy_url,
      release_notes: latestVersion?.release_notes,
      canary_enabled: policy.canary_enabled
    };

    res.status(200).json(response);

  } catch (error) {
    console.error('Update check error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
};