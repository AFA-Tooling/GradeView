#!/usr/bin/env node
/**
 * Migration script: JSON config to Database
 * Migrates existing config.json files to PostgreSQL database
 * 
 * Usage: node migrate_config_to_db.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from 'pg';
const { Pool } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pool = new Pool({
    connectionString: process.env.GRADESYNC_DATABASE_URL || process.env.DATABASE_URL
});

async function migrateGradeSyncConfig() {
    console.log('🔄 Migrating GradeSync config.json to database...');
    
    const configPath = path.join(__dirname, '../../../GradeSync/config.json');
    
    if (!fs.existsSync(configPath)) {
        console.log('⚠️  GradeSync config.json not found, skipping...');
        return;
    }
    
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Migrate global settings
        console.log('  📝 Migrating global settings...');
        const globalSettings = config.global_settings || {};
        
        for (const [key, value] of Object.entries(globalSettings)) {
            let valueType = 'string';
            let stringValue = String(value);
            
            if (typeof value === 'number') {
                valueType = 'integer';
            } else if (typeof value === 'boolean') {
                valueType = 'boolean';
            } else if (Array.isArray(value) || typeof value === 'object') {
                valueType = 'json';
                stringValue = JSON.stringify(value);
            }
            
            await client.query(`
                INSERT INTO system_config (key, value, value_type)
                VALUES ($1, $2, $3)
                ON CONFLICT (key) DO UPDATE SET value = $2, value_type = $3
            `, [key, stringValue, valueType]);
        }
        
        // Migrate courses
        console.log('  📚 Migrating courses...');
        const courses = config.courses || [];
        
        for (const courseData of courses) {
            // Insert or update course
            const courseResult = await client.query(`
                INSERT INTO courses (
                    gradescope_course_id, name, department, course_number,
                    semester, year, instructor, spreadsheet_id, is_active
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
                ON CONFLICT (gradescope_course_id) DO UPDATE SET
                    name = EXCLUDED.name,
                    department = EXCLUDED.department,
                    course_number = EXCLUDED.course_number,
                    semester = EXCLUDED.semester,
                    year = EXCLUDED.year,
                    instructor = EXCLUDED.instructor,
                    spreadsheet_id = EXCLUDED.spreadsheet_id,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING id
            `, [
                courseData.gradescope?.course_id || courseData.id,
                courseData.name,
                courseData.department,
                courseData.course_number,
                courseData.semester,
                courseData.year,
                courseData.instructor,
                courseData.spreadsheet?.id
            ]);
            
            const courseId = courseResult.rows[0].id;
            console.log(`    ✅ Course: ${courseData.name} (ID: ${courseId})`);
            
            // Insert course config
            await client.query(`
                INSERT INTO course_configs (
                    course_id, 
                    gradescope_enabled, gradescope_course_id, gradescope_sync_interval_hours,
                    prairielearn_enabled, prairielearn_course_id,
                    iclicker_enabled, iclicker_course_names,
                    database_enabled, use_as_primary,
                    spreadsheet_id, spreadsheet_scopes
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                ON CONFLICT (course_id) DO UPDATE SET
                    gradescope_enabled = EXCLUDED.gradescope_enabled,
                    gradescope_course_id = EXCLUDED.gradescope_course_id,
                    gradescope_sync_interval_hours = EXCLUDED.gradescope_sync_interval_hours,
                    prairielearn_enabled = EXCLUDED.prairielearn_enabled,
                    prairielearn_course_id = EXCLUDED.prairielearn_course_id,
                    iclicker_enabled = EXCLUDED.iclicker_enabled,
                    iclicker_course_names = EXCLUDED.iclicker_course_names,
                    database_enabled = EXCLUDED.database_enabled,
                    use_as_primary = EXCLUDED.use_as_primary,
                    spreadsheet_id = EXCLUDED.spreadsheet_id,
                    spreadsheet_scopes = EXCLUDED.spreadsheet_scopes,
                    updated_at = CURRENT_TIMESTAMP
            `, [
                courseId,
                courseData.gradescope?.enabled || false,
                courseData.gradescope?.course_id,
                courseData.gradescope?.sync_interval_hours || 24,
                courseData.prairielearn?.enabled || false,
                courseData.prairielearn?.course_id,
                courseData.iclicker?.enabled || false,
                courseData.iclicker?.course_names || [],
                courseData.database?.enabled ?? true,
                courseData.database?.use_as_primary ?? true,
                courseData.spreadsheet?.id,
                courseData.spreadsheet?.scopes || ['https://www.googleapis.com/auth/spreadsheets']
            ]);
            
            // Insert assignment categories
            if (courseData.assignment_categories) {
                await client.query('DELETE FROM assignment_categories WHERE course_id = $1', [courseId]);
                
                for (let i = 0; i < courseData.assignment_categories.length; i++) {
                    const category = courseData.assignment_categories[i];
                    await client.query(`
                        INSERT INTO assignment_categories (course_id, name, patterns, display_order)
                        VALUES ($1, $2, $3, $4)
                    `, [courseId, category.name, category.patterns || [], i]);
                }
                
                console.log(`      📋 Added ${courseData.assignment_categories.length} categories`);
            }
        }
        
        await client.query('COMMIT');
        console.log('✅ GradeSync configuration migrated successfully!');
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error migrating GradeSync config:', error);
        throw error;
    } finally {
        client.release();
    }
}

async function migrateGradeViewConfig() {
    console.log('\n🔄 Migrating GradeView config to database...');
    
    const configPath = path.join(__dirname, '../config/default.json');
    
    if (!fs.existsSync(configPath)) {
        console.log('⚠️  GradeView config not found, skipping...');
        return;
    }
    
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Migrate GradeView configs
        const configs = [
            ['redis_host', config.redis?.host, 'string'],
            ['redis_port', config.redis?.port, 'integer'],
            ['redis_username', config.redis?.username, 'string'],
            ['spreadsheet_id', config.spreadsheet?.id, 'string'],
            ['google_oauth_client_id', config.googleconfig?.oauth?.clientid, 'string'],
            ['grade_page_name', config.spreadsheet?.pages?.gradepage?.pagename, 'string'],
            ['grade_page_meta_row', config.spreadsheet?.pages?.gradepage?.assignmentMetaRow, 'integer'],
            ['grade_page_start_row', config.spreadsheet?.pages?.gradepage?.startrow, 'integer'],
            ['grade_page_start_col', config.spreadsheet?.pages?.gradepage?.startcol, 'string'],
            ['bin_page_name', config.spreadsheet?.pages?.binpage?.pagename, 'string'],
            ['bin_page_start_cell', config.spreadsheet?.pages?.binpage?.startcell, 'string'],
            ['bin_page_end_cell', config.spreadsheet?.pages?.binpage?.endcell, 'string']
        ];
        
        for (const [key, value, valueType] of configs) {
            if (value !== undefined && value !== null) {
                await client.query(`
                    UPDATE gradeview_config 
                    SET value = $1, value_type = $2, updated_at = CURRENT_TIMESTAMP
                    WHERE key = $3
                `, [String(value), valueType, key]);
            }
        }
        
        // Migrate admins
        if (config.admins && Array.isArray(config.admins)) {
            console.log('  👥 Migrating admin users...');
            
            for (const email of config.admins) {
                await client.query(`
                    INSERT INTO users (email, role, is_active)
                    VALUES ($1, 'admin', true)
                    ON CONFLICT (email) DO UPDATE SET 
                        role = 'admin', 
                        is_active = true,
                        updated_at = CURRENT_TIMESTAMP
                `, [email]);
            }
            
            console.log(`    ✅ Migrated ${config.admins.length} admin users`);
        }
        
        await client.query('COMMIT');
        console.log('✅ GradeView configuration migrated successfully!');
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error migrating GradeView config:', error);
        throw error;
    } finally {
        client.release();
    }
}

async function main() {
    console.log('🚀 Starting configuration migration to database...\n');
    
    try {
        await migrateGradeSyncConfig();
        await migrateGradeViewConfig();
        
        console.log('\n✨ Migration completed successfully!');
        console.log('\n📝 Next steps:');
        console.log('  1. Verify the migrated data in the database');
        console.log('  2. Update your authentication middleware to set req.user.id');
        console.log('  3. Test the new API endpoints');
        console.log('  4. Backup and archive the old config.json files');
        console.log('  5. Deploy the updated application');
        
    } catch (error) {
        console.error('\n❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();
