const { createClient } = require('@supabase/supabase-js');

// Database configuration
const dbConfig = {
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_ANON_KEY,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,

  // Connection pool settings
  poolConfig: {
    min: 2,
    max: 20,
    acquireTimeoutMillis: 30000,
    createTimeoutMillis: 30000,
    idleTimeoutMillis: 30000,
  }
};

// Initialize Supabase clients
let supabaseClient = null;
let supabaseAdminClient = null;

function getSupabaseClient() {
  if (!supabaseClient) {
    if (!dbConfig.supabaseUrl || !dbConfig.supabaseKey) {
      console.warn('Supabase configuration missing - running in mock mode');
      return null; // Return null instead of throwing error
    }

    supabaseClient = createClient(dbConfig.supabaseUrl, dbConfig.supabaseKey, {
      auth: {
        persistSession: false, // Server-side, no need to persist
      },
      db: {
        schema: 'public',
      },
      global: {
        headers: {
          'x-application-name': 'onlyworks-backend',
        },
      },
    });
  }

  return supabaseClient;
}

// Get Supabase Admin client (with service role key for admin operations)
function getSupabaseAdminClient() {
  if (!supabaseAdminClient) {
    if (!dbConfig.supabaseUrl || !dbConfig.supabaseServiceRoleKey) {
      console.warn('Supabase admin configuration missing - some admin features may not work');
      return null; // Return null instead of throwing error
    }

    supabaseAdminClient = createClient(dbConfig.supabaseUrl, dbConfig.supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      },
      db: {
        schema: 'public',
      },
      global: {
        headers: {
          'x-application-name': 'onlyworks-backend-admin',
        },
      },
    });
  }

  return supabaseAdminClient;
}

// Health check function
async function checkDatabaseConnection() {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('users')
      .select('count')
      .limit(1);

    if (error) {
      throw error;
    }

    return { healthy: true, timestamp: new Date().toISOString() };
  } catch (error) {
    return {
      healthy: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

// Transaction wrapper
async function withTransaction(callback) {
  const supabase = getSupabaseClient();

  try {
    // Supabase doesn't have explicit transactions in the client library
    // Each operation is atomic, for complex transactions we'd use stored procedures
    const result = await callback(supabase);
    return result;
  } catch (error) {
    throw error;
  }
}

// Create alias for admin client
const supabaseAdmin = getSupabaseAdminClient();

module.exports = {
  getSupabaseClient,
  getSupabaseAdminClient,
  supabaseAdmin,
  checkDatabaseConnection,
  withTransaction,
  dbConfig
};