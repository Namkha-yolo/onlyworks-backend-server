const { createClient } = require('@supabase/supabase-js');

// Database configuration
const dbConfig = {
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_ANON_KEY,

  // Connection pool settings
  poolConfig: {
    min: 2,
    max: 20,
    acquireTimeoutMillis: 30000,
    createTimeoutMillis: 30000,
    idleTimeoutMillis: 30000,
  }
};

// Initialize Supabase client
let supabaseClient = null;

function getSupabaseClient() {
  if (!supabaseClient) {
    if (!dbConfig.supabaseUrl || !dbConfig.supabaseKey) {
      throw new Error('Supabase configuration is missing. Please check SUPABASE_URL and SUPABASE_ANON_KEY environment variables.');
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

module.exports = {
  getSupabaseClient,
  checkDatabaseConnection,
  withTransaction,
  dbConfig
};