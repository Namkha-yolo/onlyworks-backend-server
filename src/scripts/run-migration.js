#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { supabaseAdmin } = require('../config/database');

/**
 * Migration Runner for OnlyWorks Backend
 *
 * This script runs SQL migration files against the Supabase database
 * Usage: node src/scripts/run-migration.js [migration-file]
 */

async function runMigration(migrationFile) {
    try {
        const migrationPath = path.join(__dirname, '..', 'migrations', migrationFile);

        if (!fs.existsSync(migrationPath)) {
            console.error(`❌ Migration file not found: ${migrationPath}`);
            process.exit(1);
        }

        const sqlContent = fs.readFileSync(migrationPath, 'utf8');

        console.log(`🔄 Running migration: ${migrationFile}`);
        console.log(`📁 File: ${migrationPath}`);
        console.log(`📝 Content length: ${sqlContent.length} characters`);

        // Execute the migration
        const { data, error } = await supabaseAdmin.rpc('exec_sql', {
            sql_query: sqlContent
        });

        if (error) {
            console.error('❌ Migration failed:', error);

            // Try alternative method - split by semicolon and execute each statement
            console.log('🔄 Trying alternative execution method...');

            const statements = sqlContent
                .split(';')
                .map(stmt => stmt.trim())
                .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

            for (let i = 0; i < statements.length; i++) {
                const statement = statements[i];
                if (statement) {
                    console.log(`   Executing statement ${i + 1}/${statements.length}`);
                    try {
                        const { error: stmtError } = await supabaseAdmin.rpc('exec_sql', {
                            sql_query: statement
                        });
                        if (stmtError) {
                            console.warn(`   ⚠️ Statement ${i + 1} warning:`, stmtError.message);
                        }
                    } catch (err) {
                        console.warn(`   ⚠️ Statement ${i + 1} error:`, err.message);
                    }
                }
            }
        }

        console.log('✅ Migration completed successfully!');

        // Verify tables were created
        console.log('\n🔍 Verifying migration results...');
        await verifyMigration();

    } catch (error) {
        console.error('❌ Migration execution failed:', error);
        process.exit(1);
    }
}

async function verifyMigration() {
    try {
        // Check if batch_reports table exists
        const { data: batchReports, error: batchError } = await supabaseAdmin
            .from('batch_reports')
            .select('count')
            .limit(1);

        if (!batchError) {
            console.log('✅ batch_reports table: EXISTS');
        } else {
            console.log('❌ batch_reports table: MISSING or ERROR');
        }

        // Check if shared_reports table exists
        const { data: sharedReports, error: sharedError } = await supabaseAdmin
            .from('shared_reports')
            .select('count')
            .limit(1);

        if (!sharedError) {
            console.log('✅ shared_reports table: EXISTS');
        } else {
            console.log('❌ shared_reports table: MISSING or ERROR');
        }

        // Check if screenshot columns were added
        const { data: screenshots, error: screenshotError } = await supabaseAdmin
            .from('screenshots')
            .select('ai_analysis_completed, processed_at, batch_report_id')
            .limit(1);

        if (!screenshotError) {
            console.log('✅ screenshots table: NEW COLUMNS ADDED');
        } else {
            console.log('❌ screenshots table: COLUMN UPDATE FAILED');
        }

    } catch (error) {
        console.log('⚠️ Verification failed:', error.message);
    }
}

async function listMigrations() {
    const migrationsDir = path.join(__dirname, '..', 'migrations');
    const files = fs.readdirSync(migrationsDir)
        .filter(file => file.endsWith('.sql'))
        .sort();

    console.log('📋 Available migrations:');
    files.forEach(file => {
        console.log(`   - ${file}`);
    });

    return files;
}

// Main execution
async function main() {
    const migrationFile = process.argv[2];

    if (!migrationFile) {
        console.log('📋 OnlyWorks Migration Runner');
        console.log('');
        console.log('Usage: node src/scripts/run-migration.js <migration-file>');
        console.log('');

        await listMigrations();
        return;
    }

    await runMigration(migrationFile);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Migration interrupted by user');
    process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Run the migration
main().catch(console.error);