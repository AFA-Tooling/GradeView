import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') }); // Relative to api/lib/ is ../../

let pool = null;

/**
 * Gets or creates a PostgreSQL connection pool.
 * @returns {Pool} PostgreSQL pool instance
 */
function getPool() {
    if (!pool) {
        const {
            POSTGRES_HOST,
            POSTGRES_PORT,
            POSTGRES_DB,
            POSTGRES_USER,
            POSTGRES_PASSWORD,
            GRADESYNC_DATABASE_URL,
            DATABASE_URL
        } = process.env;

        let poolConfig;

        if (POSTGRES_HOST && POSTGRES_USER && POSTGRES_DB) {
            poolConfig = {
                host: POSTGRES_HOST,
                port: parseInt(POSTGRES_PORT || '5432', 10),
                database: POSTGRES_DB,
                user: POSTGRES_USER,
                password: POSTGRES_PASSWORD,
            };
        } else {
            const databaseUrl = GRADESYNC_DATABASE_URL || DATABASE_URL;
            if (!databaseUrl) {
                throw new Error('Database configuration not found. Please set POSTGRES_HOST/USER/PASSWORD/DB or GRADESYNC_DATABASE_URL environment variables.');
            }
            poolConfig = {
                connectionString: databaseUrl,
            };
        }
        
        pool = new Pool(poolConfig);
        
        pool.on('error', (err) => {
            console.error('PostgreSQL pool error:', err);
        });
    }
    
    return pool;
}

/**
 * Gets student submissions sorted by submission time
 * @param {string} email - The student's email
 * @param {string} courseId - Optional course ID filter
 * @returns {Promise<Array>} Array of submissions with assignment details
 */
export async function getStudentSubmissionsByTime(email, courseId = null) {
    const pool = getPool();
    
    let query = `
        SELECT 
            a.title as assignment_name,
            a.category,
            s.total_score as score,
            a.max_points,
            s.submission_time,
            s.lateness,
            c.name as course_name,
            c.semester,
            c.year
        FROM submissions s
        JOIN assignments a ON s.assignment_id = a.id
        JOIN students st ON s.student_id = st.id
        JOIN courses c ON a.course_id = c.id
        WHERE st.email = $1
    `;
    
    const params = [email];
    
    if (courseId) {
        query += ` AND c.gradescope_course_id = $2`;
        params.push(courseId);
    }
    
    query += `
        ORDER BY s.submission_time DESC
    `;
    
    try {
        const result = await pool.query(query, params);
        
        return result.rows.map(row => ({
            category: row.category || 'Uncategorized',
            name: row.assignment_name,
            score: parseFloat(row.score) || 0,
            maxPoints: parseFloat(row.max_points) || 0,
            percentage: row.max_points > 0 ? (parseFloat(row.score) / parseFloat(row.max_points)) * 100 : 0,
            submissionTime: row.submission_time,
            lateness: row.lateness,
            courseName: row.course_name,
            semester: row.semester,
            year: row.year,
        }));
    } catch (err) {
        console.error('Error fetching student submissions by time:', err);
        throw err;
    }
}

/**
 * Gets all submissions for a student with both Redis structure and time data
 * @param {string} email - The student's email
 * @param {string} courseId - Optional course ID filter
 * @returns {Promise<Object>} Object with Redis-like structure plus submission times
 */
export async function getStudentSubmissionsGrouped(email, courseId = null) {
    const pool = getPool();
    
    let query = `
        SELECT 
            a.title as assignment_name,
            a.category,
            s.total_score as score,
            a.max_points,
            s.submission_time,
            s.lateness
        FROM submissions s
        JOIN assignments a ON s.assignment_id = a.id
        JOIN students st ON s.student_id = st.id
        JOIN courses c ON a.course_id = c.id
        WHERE st.email = $1
    `;
    
    const params = [email];
    
    if (courseId) {
        query += ` AND c.gradescope_course_id = $2`;
        params.push(courseId);
    }
    
    try {
        const result = await pool.query(query, params);
        
        // Group by category like Redis structure
        const grouped = {};
        
        result.rows.forEach(row => {
            const category = row.category || 'Uncategorized';
            const assignmentName = row.assignment_name;
            
            if (!grouped[category]) {
                grouped[category] = {};
            }
            
            grouped[category][assignmentName] = {
                student: parseFloat(row.score) || 0,
                max: parseFloat(row.max_points) || 0,
                submissionTime: row.submission_time,
                lateness: row.lateness,
            };
        });
        
        return grouped;
    } catch (err) {
        console.error('Error fetching grouped student submissions:', err);
        throw err;
    }
}

/**
 * Checks if a student exists in the database
 * @param {string} email - The student's email
 * @returns {Promise<boolean>} True if student exists
 */
export async function studentExistsInDb(email) {
    const pool = getPool();
    
    try {
        const result = await pool.query(
            'SELECT id FROM students WHERE email = $1 LIMIT 1',
            [email]
        );
        return result.rows.length > 0;
    } catch (err) {
        console.error('Error checking student existence:', err);
        return false;
    }
}

/**
 * Gets score distribution for a specific assignment across all students
 * Optimized with JOIN to fetch all data in one query
 * @param {string} assignmentName - The assignment title
 * @param {string} category - The assignment category
 * @returns {Promise<Array>} Array of {studentName, studentEmail, score, maxPoints}
 */
export async function getAssignmentDistribution(assignmentName, category) {
    const pool = getPool();
    
    // NOTE: We ignore the 'category' parameter because frontend section names
    // don't match database category values. Only match by assignment title.
    const query = `
        SELECT 
            st.legal_name as student_name,
            st.email as student_email,
            s.total_score as score,
            a.max_points
        FROM submissions s
        JOIN assignments a ON s.assignment_id = a.id
        JOIN students st ON s.student_id = st.id
        WHERE a.title = $1
          AND s.total_score IS NOT NULL
        ORDER BY st.legal_name
    `;
    
    try {
        const result = await pool.query(query, [assignmentName]);
        
        return result.rows.map(row => ({
            studentName: row.student_name,
            studentEmail: row.student_email,
            score: parseFloat(row.score) || 0,
            maxPoints: parseFloat(row.max_points) || 0,
        }));
    } catch (err) {
        console.error('Error fetching assignment distribution:', err);
        throw err;
    }
}

/**
 * Gets score distribution for category summary (sum of all assignments in category)
 * @param {string} category - The assignment category (may not match DB, legacy parameter)
 * @returns {Promise<Array>} Array of {studentName, studentEmail, score}
 */
export async function getCategorySummaryDistribution(category) {
    const pool = getPool();
    
    const query = `
        SELECT 
            st.legal_name as student_name,
            st.email as student_email,
            SUM(s.total_score) as total_score
        FROM submissions s
        JOIN assignments a ON s.assignment_id = a.id
        JOIN students st ON s.student_id = st.id
        WHERE a.category = $1
          AND s.total_score IS NOT NULL
        GROUP BY st.id, st.legal_name, st.email
        HAVING SUM(s.total_score) > 0
        ORDER BY st.legal_name
    `;
    
    try {
        const result = await pool.query(query, [category]);
        
        return result.rows.map(row => ({
            studentName: row.student_name,
            studentEmail: row.student_email,
            score: parseFloat(row.total_score) || 0,
        }));
    } catch (err) {
        console.error('Error fetching category summary distribution:', err);
        throw err;
    }
}

/**
 * Gets score distribution for assignments by their titles (for section summaries)
 * @param {string[]} assignmentTitles - Array of assignment titles to sum
 * @returns {Promise<Array>} Array of {studentName, studentEmail, score}
 */
export async function getAssignmentsSummaryDistribution(assignmentTitles) {
    const pool = getPool();
    
    if (!assignmentTitles || assignmentTitles.length === 0) {
        return [];
    }
    
    // Create placeholders for parameterized query: $1, $2, $3, ...
    const placeholders = assignmentTitles.map((_, i) => `$${i + 1}`).join(', ');
    
    const query = `
        SELECT 
            st.legal_name as student_name,
            st.email as student_email,
            SUM(s.total_score) as total_score
        FROM submissions s
        JOIN assignments a ON s.assignment_id = a.id
        JOIN students st ON s.student_id = st.id
        WHERE a.title IN (${placeholders})
          AND s.total_score IS NOT NULL
        GROUP BY st.id, st.legal_name, st.email
        ORDER BY st.legal_name
    `;
    
    try {
        const result = await pool.query(query, assignmentTitles);
        
        return result.rows.map(row => ({
            studentName: row.student_name,
            studentEmail: row.student_email,
            score: parseFloat(row.total_score) || 0,
        }));
    } catch (err) {
        console.error('Error fetching assignments summary distribution:', err);
        throw err;
    }
}

/**
 * Gets all student scores in one query (replaces N+1 Redis calls)
 * Returns data in the format expected by admin UI
 * @returns {Promise<Array>} Array of {name, email, scores: {category: {assignmentName: score}}}
 */
export async function getAllStudentScores() {
    const pool = getPool();
    
    const query = `
        SELECT 
            st.legal_name as student_name,
            st.email as student_email,
            a.category,
            a.title as assignment_name,
            s.total_score
        FROM students st
        LEFT JOIN submissions s ON st.id = s.student_id
        LEFT JOIN assignments a ON s.assignment_id = a.id
        ORDER BY st.email, a.category, a.title
    `;
    
    try {
        const result = await pool.query(query);
        
        // Group by student, then by category, then by assignment
        const studentMap = new Map();
        
        result.rows.forEach(row => {
            const email = row.student_email;
            
            if (!studentMap.has(email)) {
                studentMap.set(email, {
                    name: row.student_name || 'Unknown',
                    email: email,
                    scores: {}
                });
            }
            
            const student = studentMap.get(email);
            
            // Only add scores if assignment exists
            if (row.category && row.assignment_name) {
                if (!student.scores[row.category]) {
                    student.scores[row.category] = {};
                }
                student.scores[row.category][row.assignment_name] = row.total_score;
            }
        });
        
        return Array.from(studentMap.values());
    } catch (err) {
        console.error('Error fetching all student scores:', err);
        throw err;
    }
}

/**
 * Gets class average percentage for each category
 * @returns {Promise<Object>} Object with category names as keys and average percentages as values
 */
export async function getCategoryAverages() {
    const pool = getPool();
    
    try {
        const query = `
            SELECT 
                a.category,
                AVG((s.total_score / NULLIF(a.max_points, 0)) * 100) as avg_percentage
            FROM submissions s
            JOIN assignments a ON s.assignment_id = a.id
            WHERE a.category IS NOT NULL 
              AND a.category != 'Uncategorized'
              AND a.category != 'uncategorized'
              AND s.total_score IS NOT NULL
              AND a.max_points > 0
            GROUP BY a.category
        `;
        
        const result = await pool.query(query);
        
        const categoryAverages = {};
        result.rows.forEach(row => {
            const avgPercentage = parseFloat(row.avg_percentage);
            categoryAverages[row.category] = isNaN(avgPercentage) ? 0 : parseFloat(avgPercentage.toFixed(2));
        });
        
        return categoryAverages;
    } catch (err) {
        console.error('Error fetching category averages:', err);
        throw err;
    }
}

/**
 * Closes the database connection pool
 */
export async function closePool() {
    if (pool) {
        await pool.end();
        pool = null;
    }
}
