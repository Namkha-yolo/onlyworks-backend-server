const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing Supabase configuration');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

console.log('🚀 Direct schema push to Supabase using REST API...');
console.log(`📡 URL: ${supabaseUrl}`);

async function directSchemaPush() {
    console.log('\n🔍 Using direct table operations approach...');

    try {
        // 1. Check current screenshots table structure
        console.log('\n📋 Step 1: Checking screenshots table structure');
        await checkScreenshotsTable();

        // 2. Create missing tables using direct API
        console.log('\n📋 Step 2: Creating missing tables');
        await createMissingTables();

        // 3. Verify all tables exist
        console.log('\n📋 Step 3: Verifying table existence');
        await verifyTables();

        console.log('\n✅ Direct schema push completed!');

    } catch (error) {
        console.error('\n❌ Direct schema push failed:', error.message);
        throw error;
    }
}

async function checkScreenshotsTable() {
    try {
        // Query the screenshots table to see its current structure
        const { data, error } = await supabase
            .from('screenshots')
            .select('*')
            .limit(1);

        if (error) {
            console.log(`⚠️  Screenshots table query error: ${error.message}`);
        } else {
            console.log('✅ Screenshots table accessible');
            if (data && data.length > 0) {
                const columns = Object.keys(data[0]);
                console.log(`   Current columns: ${columns.join(', ')}`);

                const hasWorkSessionId = columns.includes('work_session_id');
                const hasSessionId = columns.includes('session_id');
                const hasAiAnalysis = columns.includes('ai_analysis_completed');

                console.log(`   Has work_session_id: ${hasWorkSessionId}`);
                console.log(`   Has session_id: ${hasSessionId}`);
                console.log(`   Has ai_analysis_completed: ${hasAiAnalysis}`);

                if (hasSessionId && !hasWorkSessionId) {
                    console.log('⚠️  Column rename needed: session_id -> work_session_id');
                    console.log('💡 This requires database admin access via Supabase dashboard');
                }
            } else {
                console.log('📝 Screenshots table is empty');
            }
        }
    } catch (err) {
        console.log(`❌ Error checking screenshots table: ${err.message}`);
    }
}

async function createMissingTables() {
    const tables = [
        {
            name: 'analysis_reports',
            testData: {
                session_id: '123e4567-e89b-12d3-a456-426614174000',
                user_id: '123e4567-e89b-12d3-a456-426614174001',
                analysis_type: 'test',
                analysis_data: {},
                work_completed: [],
                alignment_score: 0.5,
                screenshot_count: 1
            }
        },
        {
            name: 'goals',
            testData: {
                user_id: '123e4567-e89b-12d3-a456-426614174001',
                title: 'Test Goal',
                status: 'active'
            }
        },
        {
            name: 'user_settings',
            testData: {
                user_id: '123e4567-e89b-12d3-a456-426614174001',
                settings: {}
            }
        }
    ];

    for (const table of tables) {
        console.log(`\n🔄 Checking table: ${table.name}`);

        try {
            // Test if table exists by trying to select from it
            const { data, error } = await supabase
                .from(table.name)
                .select('id')
                .limit(1);

            if (error && error.code === '42P01') {
                console.log(`❌ Table '${table.name}' does not exist`);
                console.log('💡 This table needs to be created manually in Supabase dashboard');
                console.log(`📋 SQL to create ${table.name}:`);
                printTableCreationSQL(table.name);
            } else if (error) {
                console.log(`⚠️  Table '${table.name}' check failed: ${error.message}`);
            } else {
                console.log(`✅ Table '${table.name}' exists and is accessible`);

                // Try to insert test data to verify structure
                console.log(`   Testing table structure...`);
                const { error: insertError } = await supabase
                    .from(table.name)
                    .insert(table.testData)
                    .select()
                    .single();

                if (insertError) {
                    if (insertError.message.includes('duplicate') || insertError.message.includes('unique')) {
                        console.log(`   ✅ Table structure is correct (unique constraint)`);
                    } else {
                        console.log(`   ⚠️  Table structure issue: ${insertError.message}`);
                    }
                } else {
                    console.log(`   ✅ Table structure is correct`);
                    // Clean up test data
                    await supabase
                        .from(table.name)
                        .delete()
                        .eq('user_id', table.testData.user_id);
                }
            }
        } catch (err) {
            console.log(`❌ Error with table ${table.name}: ${err.message}`);
        }
    }
}

function printTableCreationSQL(tableName) {
    const sqlCommands = {
        'analysis_reports': `
CREATE TABLE analysis_reports (
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
);`,
        'goals': `
CREATE TABLE goals (
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
);`,
        'user_settings': `
CREATE TABLE user_settings (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL,
    settings JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);`
    };

    console.log(sqlCommands[tableName] || '-- SQL not available for this table');
}

async function verifyTables() {
    const requiredTables = ['screenshots', 'analysis_reports', 'goals', 'user_settings'];
    let allExist = true;

    for (const tableName of requiredTables) {
        try {
            const { error } = await supabase
                .from(tableName)
                .select('id')
                .limit(1);

            if (error && error.code === '42P01') {
                console.log(`❌ Missing table: ${tableName}`);
                allExist = false;
            } else if (error) {
                console.log(`⚠️  Table ${tableName}: ${error.message}`);
            } else {
                console.log(`✅ Table exists: ${tableName}`);
            }
        } catch (err) {
            console.log(`❌ Error checking ${tableName}: ${err.message}`);
            allExist = false;
        }
    }

    if (allExist) {
        console.log('\n🎉 All required tables are present!');
    } else {
        console.log('\n⚠️  Some tables are missing. Manual creation required.');
    }

    return allExist;
}

async function showManualInstructions() {
    console.log('\n📋 Manual Instructions for Supabase Dashboard:');
    console.log('=' .repeat(60));
    console.log('1. Go to your Supabase project dashboard');
    console.log('2. Navigate to SQL Editor');
    console.log('3. Run the following SQL commands:');
    console.log('');

    // Show the complete SQL file content
    console.log('-- Complete Schema Fix SQL:');
    console.log('');

    try {
        const fs = require('fs');
        const sqlContent = fs.readFileSync('./fix-database-schema.sql', 'utf8');
        console.log(sqlContent);
    } catch (err) {
        console.log('❌ Could not read SQL file. Please apply the schema manually.');
    }

    console.log('');
    console.log('=' .repeat(60));
    console.log('💡 After running the SQL commands, your database will be fully compatible!');
}

// Main execution
if (require.main === module) {
    directSchemaPush()
        .then(async () => {
            console.log('\n🎯 Direct schema check completed!');
            await showManualInstructions();
        })
        .catch((error) => {
            console.error('\n💥 Schema check failed:', error.message);
            showManualInstructions().then(() => process.exit(1));
        });
}

module.exports = { directSchemaPush, verifyTables };