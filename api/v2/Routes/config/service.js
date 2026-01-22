/**
 * Database-backed configuration service with multi-tenant support
 * Replaces JSON file-based configuration with PostgreSQL storage
 */
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
    connectionString: process.env.GRADESYNC_DATABASE_URL || process.env.DATABASE_URL
});

/**
 * Permission levels:
 * - superadmin: Full system access
 * - admin: Multi-course management
 * - instructor: Own courses only
 * - owner: Full course control
 * - editor: Modify course settings
 * - viewer: Read-only access
 */

class ConfigService {
    /**
     * Check if user has permission to access course
     */
    async checkCoursePermission(userId, courseId, requiredLevel = 'viewer') {
        const query = `
            SELECT u.role, cp.permission_level
            FROM users u
            LEFT JOIN course_permissions cp ON cp.user_id = u.id AND cp.course_id = $1
            WHERE u.id = $2 AND u.is_active = true
        `;
        
        const result = await pool.query(query, [courseId, userId]);
        
        if (result.rows.length === 0) {
            return { hasAccess: false, reason: 'User not found or inactive' };
        }
        
        const { role, permission_level } = result.rows[0];
        
        // Superadmin has access to everything
        if (role === 'superadmin') {
            return { hasAccess: true, role, permission_level: 'owner' };
        }
        
        // Check course-level permissions
        if (!permission_level) {
            return { hasAccess: false, reason: 'No permission for this course' };
        }
        
        const levels = { viewer: 0, editor: 1, owner: 2 };
        const hasAccess = levels[permission_level] >= levels[requiredLevel];
        
        return { hasAccess, role, permission_level };
    }
    
    /**
     * Get all courses user has access to
     */
    async getUserCourses(userId) {
        const query = `
            SELECT 
                c.id, c.name, c.department, c.course_number, 
                c.semester, c.year, c.instructor,
                cp.permission_level,
                u.role as user_role
            FROM courses c
            JOIN course_permissions cp ON cp.course_id = c.id
            JOIN users u ON u.id = cp.user_id
            WHERE cp.user_id = $1 AND c.is_active = true
            ORDER BY c.year DESC, c.semester, c.department, c.course_number
        `;
        
        const result = await pool.query(query, [userId]);
        return result.rows;
    }
    
    /**
     * Get course configuration with permissions check
     */
    async getCourseConfig(userId, courseId) {
        // Check permissions
        const permission = await this.checkCoursePermission(userId, courseId, 'viewer');
        if (!permission.hasAccess) {
            throw new Error(permission.reason || 'Access denied');
        }
        
        const query = `
            SELECT 
                c.*,
                cc.*,
                json_agg(
                    json_build_object(
                        'id', ac.id,
                        'name', ac.name,
                        'patterns', ac.patterns,
                        'display_order', ac.display_order
                    ) ORDER BY ac.display_order, ac.name
                ) FILTER (WHERE ac.id IS NOT NULL) as categories
            FROM courses c
            LEFT JOIN course_configs cc ON cc.course_id = c.id
            LEFT JOIN assignment_categories ac ON ac.course_id = c.id
            WHERE c.id = $1
            GROUP BY c.id, cc.id
        `;
        
        const result = await pool.query(query, [courseId]);
        
        if (result.rows.length === 0) {
            throw new Error('Course not found');
        }
        
        return {
            ...result.rows[0],
            permission_level: permission.permission_level
        };
    }
    
    /**
     * Update course configuration (requires editor permission)
     */
    async updateCourseConfig(userId, courseId, configData) {
        // Check permissions
        const permission = await this.checkCoursePermission(userId, courseId, 'editor');
        if (!permission.hasAccess) {
            throw new Error('Editor permission required');
        }
        
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            // Update course basic info
            if (configData.course) {
                await client.query(`
                    UPDATE courses SET
                        name = COALESCE($1, name),
                        department = COALESCE($2, department),
                        course_number = COALESCE($3, course_number),
                        semester = COALESCE($4, semester),
                        year = COALESCE($5, year),
                        instructor = COALESCE($6, instructor),
                        spreadsheet_id = COALESCE($7, spreadsheet_id),
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $8
                `, [
                    configData.course.name,
                    configData.course.department,
                    configData.course.course_number,
                    configData.course.semester,
                    configData.course.year,
                    configData.course.instructor,
                    configData.course.spreadsheet_id,
                    courseId
                ]);
            }
            
            // Upsert course config
            if (configData.config) {
                const cfg = configData.config;
                await client.query(`
                    INSERT INTO course_configs (
                        course_id, gradescope_enabled, gradescope_course_id, 
                        gradescope_sync_interval_hours, prairielearn_enabled, 
                        prairielearn_course_id, iclicker_enabled, iclicker_course_names,
                        database_enabled, use_as_primary, spreadsheet_id, spreadsheet_scopes
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
                    cfg.gradescope_enabled || false,
                    cfg.gradescope_course_id,
                    cfg.gradescope_sync_interval_hours || 24,
                    cfg.prairielearn_enabled || false,
                    cfg.prairielearn_course_id,
                    cfg.iclicker_enabled || false,
                    cfg.iclicker_course_names || [],
                    cfg.database_enabled ?? true,
                    cfg.use_as_primary ?? true,
                    cfg.spreadsheet_id,
                    cfg.spreadsheet_scopes || ['https://www.googleapis.com/auth/spreadsheets']
                ]);
            }
            
            // Update categories
            if (configData.categories) {
                // Delete existing categories
                await client.query('DELETE FROM assignment_categories WHERE course_id = $1', [courseId]);
                
                // Insert new categories
                for (let i = 0; i < configData.categories.length; i++) {
                    const cat = configData.categories[i];
                    await client.query(`
                        INSERT INTO assignment_categories (course_id, name, patterns, display_order)
                        VALUES ($1, $2, $3, $4)
                    `, [courseId, cat.name, cat.patterns || [], i]);
                }
            }
            
            // Log the change
            await client.query(`
                INSERT INTO config_audit_log (user_id, table_name, record_id, action, new_values)
                VALUES ($1, 'course_configs', $2, 'UPDATE', $3)
            `, [userId, courseId, JSON.stringify(configData)]);
            
            await client.query('COMMIT');
            
            return { success: true, message: 'Configuration updated successfully' };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
    
    /**
     * Get GradeView configuration
     */
    async getGradeViewConfig(userId) {
        // Check if user is admin or superadmin
        const userResult = await pool.query(
            'SELECT role FROM users WHERE id = $1',
            [userId]
        );
        
        if (userResult.rows.length === 0 || 
            !['admin', 'superadmin'].includes(userResult.rows[0].role)) {
            throw new Error('Admin access required');
        }
        
        const result = await pool.query('SELECT key, value, value_type FROM gradeview_config');
        
        const config = {
            redis: {},
            spreadsheet: { pages: { gradepage: {}, binpage: {} } },
            googleconfig: { oauth: {} },
            admins: []
        };
        
        result.rows.forEach(row => {
            const value = this.parseConfigValue(row.value, row.value_type);
            
            if (row.key.startsWith('redis_')) {
                config.redis[row.key.replace('redis_', '')] = value;
            } else if (row.key.startsWith('grade_page_')) {
                config.spreadsheet.pages.gradepage[row.key.replace('grade_page_', '')] = value;
            } else if (row.key.startsWith('bin_page_')) {
                config.spreadsheet.pages.binpage[row.key.replace('bin_page_', '')] = value;
            } else if (row.key === 'spreadsheet_id') {
                config.spreadsheet.id = value;
            } else if (row.key === 'google_oauth_client_id') {
                config.googleconfig.oauth.clientid = value;
            }
        });
        
        // Get admin list
        const admins = await pool.query(
            "SELECT email FROM users WHERE role IN ('admin', 'superadmin') AND is_active = true"
        );
        config.admins = admins.rows.map(r => r.email);
        
        return config;
    }
    
    /**
     * Update GradeView configuration
     */
    async updateGradeViewConfig(userId, config) {
        // Check admin permission
        const userResult = await pool.query(
            'SELECT role FROM users WHERE id = $1',
            [userId]
        );
        
        if (userResult.rows.length === 0 || 
            !['admin', 'superadmin'].includes(userResult.rows[0].role)) {
            throw new Error('Admin access required');
        }
        
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            // Update configurations
            const updates = [
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
            
            for (const [key, value, valueType] of updates) {
                if (value !== undefined && value !== null) {
                    await client.query(`
                        UPDATE gradeview_config 
                        SET value = $1, value_type = $2, updated_at = CURRENT_TIMESTAMP
                        WHERE key = $3
                    `, [String(value), valueType, key]);
                }
            }
            
            // Update admin users
            if (config.admins && Array.isArray(config.admins)) {
                // Set existing admins to instructor role
                await client.query(`
                    UPDATE users SET role = 'instructor' 
                    WHERE role IN ('admin', 'superadmin') 
                    AND email NOT IN (SELECT unnest($1::text[]))
                `, [config.admins]);
                
                // Set new admins
                for (const email of config.admins) {
                    await client.query(`
                        INSERT INTO users (email, role) 
                        VALUES ($1, 'admin')
                        ON CONFLICT (email) DO UPDATE SET role = 'admin', is_active = true
                    `, [email]);
                }
            }
            
            // Log the change
            await client.query(`
                INSERT INTO config_audit_log (user_id, table_name, action, new_values)
                VALUES ($1, 'gradeview_config', 'UPDATE', $2)
            `, [userId, JSON.stringify(config)]);
            
            await client.query('COMMIT');
            
            return { success: true, message: 'Configuration updated successfully' };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
    
    /**
     * Get system configuration (GradeSync global settings)
     */
    async getSystemConfig(userId) {
        const userResult = await pool.query(
            'SELECT role FROM users WHERE id = $1',
            [userId]
        );
        
        if (userResult.rows.length === 0 || 
            !['admin', 'superadmin'].includes(userResult.rows[0].role)) {
            throw new Error('Admin access required');
        }
        
        const result = await pool.query('SELECT key, value, value_type FROM system_config');
        
        const config = { global_settings: {} };
        result.rows.forEach(row => {
            config.global_settings[row.key] = this.parseConfigValue(row.value, row.value_type);
        });
        
        return config;
    }
    
    /**
     * Parse config value based on type
     */
    parseConfigValue(value, type) {
        switch (type) {
            case 'integer':
                return parseInt(value);
            case 'boolean':
                return value === 'true' || value === '1';
            case 'json':
                return JSON.parse(value);
            default:
                return value;
        }
    }
}

export default new ConfigService();
