import { Router } from 'express';
import pkg from 'pg';
const { Pool } = pkg;

const router = Router({ mergeParams: true });

const pool = new Pool({
    connectionString: process.env.GRADESYNC_DATABASE_URL || process.env.DATABASE_URL
});

/**
 * Database Schema Information
 * Database structure information provided to AI
 */
const DATABASE_SCHEMA = {
    tables: {
        students: {
            description: "Student information table",
            columns: {
                id: "Integer, primary key",
                sid: "String, student ID",
                email: "String, email address",
                legal_name: "String, full name"
            }
        },
        assignments: {
            description: "Assignment/Exam table",
            columns: {
                id: "Integer, primary key",
                assignment_id: "String, assignment ID",
                course_id: "Integer, course ID (foreign key)",
                title: "String, assignment title",
                category: "String, category (e.g., Projects, Labs, Exams)",
                max_points: "Numeric, maximum score"
            }
        },
        submissions: {
            description: "Submission records table",
            columns: {
                id: "Integer, primary key",
                assignment_id: "Integer, assignment ID (foreign key)",
                student_id: "Integer, student ID (foreign key)",
                total_score: "Numeric, score earned",
                max_points: "Numeric, maximum score",
                status: "String, submission status",
                submission_time: "Timestamp, submission time"
            }
        },
        courses: {
            description: "Course information table",
            columns: {
                id: "Integer, primary key",
                name: "String, course name",
                semester: "String, semester",
                year: "String, year"
            }
        }
    },
    relationships: {
        "submissions.student_id -> students.id": "Submission record linked to student",
        "submissions.assignment_id -> assignments.id": "Submission record linked to assignment",
        "assignments.course_id -> courses.id": "Assignment linked to course"
    },
    common_patterns: [
        "Calculate average score: AVG(total_score / NULLIF(max_points, 0) * 100)",
        "Calculate standard deviation: STDDEV(total_score / NULLIF(max_points, 0) * 100)",
        "Calculate error rate: 100 - AVG(total_score / NULLIF(max_points, 0) * 100)",
        "Group statistics: GROUP BY student_id or assignment_id",
        "Time analysis: DATE_TRUNC('day', submission_time) or DATE_TRUNC('week', submission_time)"
    ]
};

/**
 * AI Query Endpoint - Dynamic SQL Generation
 * POST /admin/ai-query
 */
router.post('/', async (req, res) => {
    try {
        const { query, useAI = true } = req.body;
        
        if (!query) {
            return res.status(400).json({ 
                error: 'Missing required field: query' 
            });
        }

        console.log(`[AI Agent] Query: "${query}"`);

        let result;
        
        if (useAI && process.env.OPENAI_API_KEY) {
            // 使用AI生成SQL并执行
            result = await processWithAI(query);
        } else {
            // Fall back to rule-based queries
            result = await processWithRules(query);
        }

        res.json(result);

    } catch (error) {
        console.error('[AI Agent Error]', error);
        res.status(500).json({ 
            error: 'Internal server error',
            message: error.message 
        });
    }
});

/**
 * Generate SQL with AI and execute
 */
async function processWithAI(userQuery) {
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
        throw new Error('OpenAI API key not configured');
    }

    // 1. Generate SQL using AI
    const sqlQuery = await generateSQLWithAI(userQuery, apiKey);
    
    console.log(`[AI Agent] Generated SQL:`, sqlQuery);

    // 2. Validate SQL security
    validateSQL(sqlQuery);

    // 3. Execute SQL
    const queryResult = await pool.query(sqlQuery);

    // 4. Explain results using AI
    const explanation = await explainResultsWithAI(userQuery, queryResult.rows, apiKey);

    return {
        type: 'ai_generated',
        answer: explanation,
        data: queryResult.rows,
        sqlQuery: sqlQuery,
        suggestions: generateSuggestions(userQuery, queryResult.rows),
        visualizationType: inferVisualizationType(queryResult.rows)
    };
}

/**
 * Generate SQL query using OpenAI
 */
async function generateSQLWithAI(userQuery, apiKey) {
    const prompt = `You are a PostgreSQL database expert. Generate SQL queries based on user questions.

Database Structure:
${JSON.stringify(DATABASE_SCHEMA, null, 2)}

User Question: ${userQuery}

Requirements:
1. Return only the SQL query statement, no explanations
2. Use standard PostgreSQL syntax
3. Must be a SELECT query (no INSERT, UPDATE, DELETE)
4. Add appropriate LIMIT (recommended 10-50 records)
5. Use ROUND() to keep 2 decimal places for numeric values
6. Handle NULL values (use NULLIF, COALESCE, etc.)
7. For percentage calculations, ensure denominator is not zero

SQL Query:`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'gpt-4',
            messages: [
                { 
                    role: 'system', 
                    content: 'You are a PostgreSQL expert. Generate only SQL queries, no explanations.' 
                },
                { role: 'user', content: prompt }
            ],
            temperature: 0.3,
            max_tokens: 500
        })
    });

    if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    let sqlQuery = data.choices[0].message.content.trim();

    // Clean SQL (remove markdown code block markers)
    sqlQuery = sqlQuery.replace(/```sql\n?/g, '').replace(/```\n?/g, '').trim();
    
    // Remove trailing semicolon
    sqlQuery = sqlQuery.replace(/;$/, '');

    return sqlQuery;
}

/**
 * Explain query results using AI
 */
async function explainResultsWithAI(userQuery, results, apiKey) {
    if (!results || results.length === 0) {
        return 'Query completed, but no matching data was found.';
    }

    const prompt = `User Question: ${userQuery}

Query returned ${results.length} records.

Data Sample (first 3):
${JSON.stringify(results.slice(0, 3), null, 2)}

Please summarize this query result in 1-2 concise sentences, in English.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'gpt-4',
            messages: [
                { 
                    role: 'system', 
                    content: 'You are a helpful data analyst. Provide concise summaries in English.' 
                },
                { role: 'user', content: prompt }
            ],
            temperature: 0.7,
            max_tokens: 200
        })
    });

    if (!response.ok) {
        return `Query returned ${results.length} records.`;
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
}

/**
 * Validate SQL security
 */
function validateSQL(sql) {
    const lowerSQL = sql.toLowerCase().trim();

    // Must be a SELECT statement
    if (!lowerSQL.startsWith('select')) {
        throw new Error('Only SELECT queries are allowed');
    }

    // Forbidden keywords
    const forbiddenKeywords = [
        'insert', 'update', 'delete', 'drop', 'truncate', 
        'alter', 'create', 'grant', 'revoke', 'exec',
        'execute', 'script', 'javascript', 'xp_', 'sp_'
    ];

    for (const keyword of forbiddenKeywords) {
        const pattern = new RegExp(`\\b${keyword}\\b`, 'i');
        if (pattern.test(sql)) {
            throw new Error(`Forbidden SQL keyword detected: ${keyword}`);
        }
    }

    // Check for multiple statements (prevent SQL injection)
    if (sql.includes(';')) {
        throw new Error('Multiple SQL statements not allowed');
    }

    return true;
}

/**
 * Rule-based query processing (fallback mode)
 */
async function processWithRules(userQuery) {
    const queryLower = userQuery.toLowerCase();
    
    // Simple keyword matching
    if (queryLower.includes('学生') || queryLower.includes('student') || queryLower.includes('波动') || queryLower.includes('variance')) {
        return await getStudentAnalysis();
    } else if (queryLower.includes('作业') || queryLower.includes('assignment') || queryLower.includes('题目')) {
        return await getAssignmentAnalysis();
    } else if (queryLower.includes('统计') || queryLower.includes('平均') || queryLower.includes('average') || queryLower.includes('statistics')) {
        return await getStatistics();
    } else {
        return await getGeneralOverview();
    }
}

/**
 * Student analysis (fallback mode)
 */
async function getStudentAnalysis() {
    const result = await pool.query(`
        WITH student_stats AS (
            SELECT 
                s.id,
                s.legal_name as name,
                s.sid as student_id,
                COUNT(sub.id) as total_submissions,
                AVG(sub.total_score / NULLIF(sub.max_points, 0) * 100) as avg_score,
                STDDEV(sub.total_score / NULLIF(sub.max_points, 0) * 100) as score_stddev
            FROM students s
            LEFT JOIN submissions sub ON s.id = sub.student_id
            GROUP BY s.id, s.legal_name, s.sid
            HAVING COUNT(sub.id) > 0
        )
        SELECT 
            name,
            student_id,
            ROUND(avg_score::numeric, 2) as avg_score,
            ROUND(score_stddev::numeric, 2) as variance,
            total_submissions
        FROM student_stats
        WHERE score_stddev IS NOT NULL
        ORDER BY score_stddev DESC
        LIMIT 10
    `);

    return {
        type: 'rule_based',
        answer: 'Based on rule matching, here are the student performance analysis results:',
        data: result.rows,
        suggestions: ['Try more specific questions', 'View detailed student performance'],
        visualizationType: 'table'
    };
}

/**
 * Assignment analysis (fallback mode)
 */
async function getAssignmentAnalysis() {
    const result = await pool.query(`
        SELECT 
            a.title,
            a.category,
            ROUND(a.max_points::numeric, 2) as max_points,
            COUNT(sub.id) as submission_count,
            ROUND(AVG(sub.total_score / NULLIF(a.max_points, 0) * 100)::numeric, 2) as avg_score_pct
        FROM assignments a
        LEFT JOIN submissions sub ON a.id = sub.assignment_id
        WHERE a.title IS NOT NULL
        GROUP BY a.id, a.title, a.category, a.max_points
        HAVING COUNT(sub.id) > 0
        ORDER BY avg_score_pct ASC
        LIMIT 10
    `);

    return {
        type: 'rule_based',
        answer: 'Here are the assignment difficulty analysis results:',
        data: result.rows,
        suggestions: ['View specific assignment details', 'Analyze error patterns'],
        visualizationType: 'table'
    };
}

/**
 * Statistical analysis (fallback mode)
 */
async function getStatistics() {
    const result = await pool.query(`
        WITH score_stats AS (
            SELECT 
                (sub.total_score / NULLIF(sub.max_points, 0) * 100) as score_pct
            FROM submissions sub
            WHERE sub.total_score IS NOT NULL 
              AND sub.max_points IS NOT NULL
              AND sub.max_points > 0
        )
        SELECT 
            ROUND(AVG(score_pct)::numeric, 2) as mean,
            ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY score_pct)::numeric, 2) as median,
            ROUND(STDDEV(score_pct)::numeric, 2) as std_dev,
            ROUND(MIN(score_pct)::numeric, 2) as min,
            ROUND(MAX(score_pct)::numeric, 2) as max,
            COUNT(*) as total_records
        FROM score_stats
    `);

    return {
        type: 'rule_based',
        answer: 'Overall statistics are as follows:',
        data: result.rows[0],
        suggestions: ['View detailed distribution', 'Compare different categories'],
        visualizationType: 'statistics'
    };
}

/**
 * General overview (fallback mode)
 */
async function getGeneralOverview() {
    const result = await pool.query(`
        SELECT 
            COUNT(DISTINCT s.id) as total_students,
            COUNT(DISTINCT a.id) as total_assignments,
            COUNT(sub.id) as total_submissions,
            ROUND(AVG(sub.total_score / NULLIF(sub.max_points, 0) * 100)::numeric, 2) as overall_avg
        FROM students s
        CROSS JOIN assignments a
        LEFT JOIN submissions sub ON sub.student_id = s.id AND sub.assignment_id = a.id
        WHERE sub.id IS NOT NULL
    `);

    return {
        type: 'rule_based',
        answer: 'Course overview:',
        data: result.rows[0],
        suggestions: ['View student performance', 'Analyze assignment difficulty', 'View submission trends'],
        visualizationType: 'statistics'
    };
}

/**
 * Generate intelligent suggestions
 */
function generateSuggestions(query, results) {
    const suggestions = [
        'View more detailed data',
        'Export these results',
        'Compare with other data'
    ];

    if (results && results.length > 0) {
        const firstRow = results[0];
        if ('name' in firstRow || 'legal_name' in firstRow) {
            suggestions.push('查看这些学生的具体作业表现');
        }
        if ('title' in firstRow || 'assignment' in firstRow) {
            suggestions.push('分析这些作业的错误模式');
        }
    }

    return suggestions;
}

/**
 * 推断可视化类型
 */
function inferVisualizationType(results) {
    if (!results || results.length === 0) {
        return 'text';
    }

    const firstRow = results[0];
    const keys = Object.keys(firstRow);

    // 统计数据（mean, median等）
    if (keys.includes('mean') || keys.includes('median') || keys.includes('avg')) {
        return 'statistics';
    }

    // 时间序列
    if (keys.some(k => k.includes('date') || k.includes('time') || k.includes('week'))) {
        return 'line';
    }

    // 对比数据
    if (keys.includes('category') || keys.includes('group')) {
        return 'comparison';
    }

    // 默认表格
    return 'table';
}

/**
 * GET /admin/ai-query/schema
 * 返回数据库schema信息
 */
router.get('/schema', async (req, res) => {
    res.json({
        schema: DATABASE_SCHEMA,
        note: 'Use this schema to understand the database structure'
    });
});

export default router;
