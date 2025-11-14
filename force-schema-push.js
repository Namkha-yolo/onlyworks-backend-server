const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing Supabase configuration');
    console.error('   SUPABASE_URL:', !!supabaseUrl);
    console.error('   SUPABASE_SERVICE_KEY:', !!process.env.SUPABASE_SERVICE_KEY);
    console.error('   SUPABASE_ANON_KEY:', !!process.env.SUPABASE_ANON_KEY);
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

console.log('🚀 Force pushing schema changes to Supabase...');
console.log(`📡 URL: ${supabaseUrl}`);
console.log(`🔑 Using ${process.env.SUPABASE_SERVICE_KEY ? 'service' : 'anon'} key`);

async function forceSchemaUpdate() {
    console.log('\n📋 Schema changes to apply:');

    const schemaChanges = [
        {
            name: '1. Rename session_id to work_session_id in screenshots',
            sql: 'ALTER TABLE screenshots RENAME COLUMN session_id TO work_session_id;',
            optional: true
        },
        {
            name: '2. Add ai_analysis_completed column',
            sql: 'ALTER TABLE screenshots ADD COLUMN IF NOT EXISTS ai_analysis_completed BOOLEAN DEFAULT FALSE;'
        },
        {
            name: '3. Add processed_at column',
            sql: 'ALTER TABLE screenshots ADD COLUMN IF NOT EXISTS processed_at TIMESTAMP WITH TIME ZONE;'
        },
        {
            name: '4. Add batch_report_id column',
            sql: 'ALTER TABLE screenshots ADD COLUMN IF NOT EXISTS batch_report_id UUID;'
        },
        {
            name: '5. Add retention_expires_at column',
            sql: 'ALTER TABLE screenshots ADD COLUMN IF NOT EXISTS retention_expires_at TIMESTAMP WITH TIME ZONE;'
        },
        {
            name: '6. Add ocr_text column',
            sql: 'ALTER TABLE screenshots ADD COLUMN IF NOT EXISTS ocr_text TEXT;'
        },
        {
            name: '7. Add capture_trigger column',
            sql: 'ALTER TABLE screenshots ADD COLUMN IF NOT EXISTS capture_trigger TEXT DEFAULT \'timer_15s\';'
        },
        {
            name: '8. Create analysis_reports table',
            sql: `CREATE TABLE IF NOT EXISTS analysis_reports (
                id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
                session_id UUID NOT NULL,
                user_id UUID NOT NULL,
                analysis_type VARCHAR(50) DEFAULT 'standard',
                analysis_data JSONB NOT NULL DEFAULT '{}',
                work_completed JSONB DEFAULT '[]',
                alignment_score DECIMAL(3,2) DEFAULT 0,
                productivity_insights TEXT,
                focus_analysis TEXT,
                screenshot_count INTEGER DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );`
        },
        {
            name: '9. Create goals table',
            sql: `CREATE TABLE IF NOT EXISTS goals (
                id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
                user_id UUID NOT NULL,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                category VARCHAR(100),
                target_value DECIMAL(10,2),
                current_value DECIMAL(10,2) DEFAULT 0,
                unit VARCHAR(50),
                status VARCHAR(50) DEFAULT 'active',
                target_date DATE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );`
        },
        {
            name: '10. Create user_settings table',
            sql: `CREATE TABLE IF NOT EXISTS user_settings (
                id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
                user_id UUID NOT NULL,
                settings JSONB NOT NULL DEFAULT '{}',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                UNIQUE(user_id)
            );`
        },
        {
            name: '11. Create indexes',
            sql: `CREATE INDEX IF NOT EXISTS idx_screenshots_work_session ON screenshots(work_session_id, timestamp);
                  CREATE INDEX IF NOT EXISTS idx_screenshots_ai_analysis ON screenshots(ai_analysis_completed);
                  CREATE INDEX IF NOT EXISTS idx_analysis_reports_session ON analysis_reports(session_id, created_at DESC);
                  CREATE INDEX IF NOT EXISTS idx_analysis_reports_user ON analysis_reports(user_id, created_at DESC);
                  CREATE INDEX IF NOT EXISTS idx_goals_user_status ON goals(user_id, status);
                  CREATE INDEX IF NOT EXISTS idx_user_settings_user ON user_settings(user_id);`
        }
    ];

    let successCount = 0;
    let errorCount = 0;

    for (const change of schemaChanges) {
        console.log(`\n🔄 ${change.name}`);

        try {
            // Use Supabase's rpc function to execute raw SQL
            const { data, error } = await supabase.rpc('exec_sql', {
                sql_text: change.sql
            });

            if (error) {
                if (change.optional && (
                    error.message.includes('already exists') ||
                    error.message.includes('does not exist') ||
                    error.message.includes('column') ||
                    error.message.includes('relation')
                )) {
                    console.log(`⚠️  Skipped (already exists or not needed): ${error.message}`);
                    successCount++;
                } else {
                    console.error(`❌ Failed: ${error.message}`);
                    errorCount++;

                    // Try alternative approach for critical changes
                    if (change.name.includes('Rename session_id')) {
                        console.log('🔄 Trying alternative approach for column rename...');
                        await tryAlternativeColumnApproach();
                    }
                }
            } else {
                console.log(`✅ Success`);
                successCount++;
            }
        } catch (err) {
            console.error(`❌ Exception: ${err.message}`);
            errorCount++;
        }

        // Small delay between operations
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`\n📊 Schema Update Summary:`);
    console.log(`   ✅ Successful: ${successCount}`);
    console.log(`   ❌ Failed: ${errorCount}`);
    console.log(`   📈 Success Rate: ${Math.round((successCount / (successCount + errorCount)) * 100)}%`);

    if (errorCount === 0) {
        console.log('\n🎉 All schema changes applied successfully!');
    } else {
        console.log('\n⚠️  Some changes failed. Database may be partially updated.');
    }

    return { successCount, errorCount };
}

async function tryAlternativeColumnApproach() {
    try {
        // Check current table structure
        const { data: columns } = await supabase
            .from('information_schema.columns')
            .select('column_name')
            .eq('table_name', 'screenshots')
            .eq('table_schema', 'public');

        const columnNames = columns?.map(col => col.column_name) || [];
        console.log(`   Current columns: ${columnNames.join(', ')}`);

        const hasWorkSessionId = columnNames.includes('work_session_id');
        const hasSessionId = columnNames.includes('session_id');

        if (!hasWorkSessionId && hasSessionId) {
            console.log('   📝 Column rename needed but requires admin privileges');
            console.log('   💡 Suggestion: Apply the SQL manually in Supabase dashboard');
        } else if (hasWorkSessionId) {
            console.log('   ✅ work_session_id column already exists');
        }
    } catch (err) {
        console.log(`   🔍 Could not check table structure: ${err.message}`);
    }
}

async function verifyChanges() {
    console.log('\n🔍 Verifying applied changes...');

    try {
        // Check screenshots table
        console.log('📋 Checking screenshots table...');
        const { data: screenshotCols } = await supabase
            .from('information_schema.columns')
            .select('column_name')
            .eq('table_name', 'screenshots')
            .eq('table_schema', 'public');

        if (screenshotCols) {
            const cols = screenshotCols.map(col => col.column_name);
            console.log(`   Columns: ${cols.join(', ')}`);

            const requiredCols = ['work_session_id', 'ai_analysis_completed', 'ocr_text', 'capture_trigger'];
            const missing = requiredCols.filter(col => !cols.includes(col));

            if (missing.length === 0) {
                console.log('   ✅ All required columns present');
            } else {
                console.log(`   ⚠️  Missing columns: ${missing.join(', ')}`);
            }
        }

        // Check other tables
        const tables = ['analysis_reports', 'goals', 'user_settings'];
        for (const table of tables) {
            try {
                const { error } = await supabase
                    .from(table)
                    .select('id')
                    .limit(1);

                if (error && error.code === '42P01') {
                    console.log(`   ❌ Table '${table}' does not exist`);
                } else {
                    console.log(`   ✅ Table '${table}' exists`);
                }
            } catch (err) {
                console.log(`   ❓ Table '${table}' check failed: ${err.message}`);
            }
        }

    } catch (error) {
        console.log(`⚠️  Verification failed: ${error.message}`);
    }
}

// Main execution
if (require.main === module) {
    forceSchemaUpdate()
        .then(async (result) => {
            await verifyChanges();

            if (result.errorCount === 0) {
                console.log('\n🎯 Schema push completed successfully!');
                process.exit(0);
            } else {
                console.log('\n⚠️  Schema push completed with errors. Check logs above.');
                process.exit(1);
            }
        })
        .catch((error) => {
            console.error('\n💥 Schema push failed:', error.message);
            process.exit(1);
        });
}

module.exports = { forceSchemaUpdate, verifyChanges };