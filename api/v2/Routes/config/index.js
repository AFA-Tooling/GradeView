import { Router } from 'express';
import configService from './service.js';

const router = Router();

/**
 * Middleware to extract user ID from token/session
 * TODO: Integrate with your actual authentication system
 */
const getUserId = (req) => {
    // This should extract the user ID from your JWT token or session
    // For now, placeholder implementation
    return req.user?.id || req.headers['x-user-id'];
};

// GET /v2/config - Get GradeView configuration
router.get('/', async (req, res, next) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        const config = await configService.getGradeViewConfig(userId);
        res.status(200).json(config);
    } catch (error) {
        console.error('Error getting GradeView config:', error);
        if (error.message === 'Admin access required') {
            return res.status(403).json({ error: error.message });
        }
        next(error);
    }
});

// PUT /v2/config - Update GradeView configuration
router.put('/', async (req, res, next) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        const result = await configService.updateGradeViewConfig(userId, req.body);
        res.status(200).json(result);
    } catch (error) {
        console.error('Error updating GradeView config:', error);
        if (error.message === 'Admin access required') {
            return res.status(403).json({ error: error.message });
        }
        next(error);
    }
});

// GET /v2/config/courses - Get all courses user has access to
router.get('/courses', async (req, res, next) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        const courses = await configService.getUserCourses(userId);
        res.status(200).json({ courses });
    } catch (error) {
        console.error('Error getting user courses:', error);
        next(error);
    }
});

// GET /v2/config/courses/:courseId - Get specific course configuration
router.get('/courses/:courseId', async (req, res, next) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        const courseId = parseInt(req.params.courseId);
        const config = await configService.getCourseConfig(userId, courseId);
        res.status(200).json(config);
    } catch (error) {
        console.error('Error getting course config:', error);
        if (error.message.includes('Access denied') || error.message.includes('permission')) {
            return res.status(403).json({ error: error.message });
        }
        if (error.message === 'Course not found') {
            return res.status(404).json({ error: error.message });
        }
        next(error);
    }
});

// PUT /v2/config/courses/:courseId - Update course configuration
router.put('/courses/:courseId', async (req, res, next) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        const courseId = parseInt(req.params.courseId);
        const result = await configService.updateCourseConfig(userId, courseId, req.body);
        res.status(200).json(result);
    } catch (error) {
        console.error('Error updating course config:', error);
        if (error.message.includes('permission required')) {
            return res.status(403).json({ error: error.message });
        }
        next(error);
    }
});

// GET /v2/config/system - Get system global settings
router.get('/system', async (req, res, next) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        const config = await configService.getSystemConfig(userId);
        res.status(200).json(config);
    } catch (error) {
        console.error('Error getting system config:', error);
        if (error.message === 'Admin access required') {
            return res.status(403).json({ error: error.message });
        }
        next(error);
    }
});

export default router;
