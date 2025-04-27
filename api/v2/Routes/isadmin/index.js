import { Router } from 'express';
import { isAdmin } from '../../../lib/userlib.mjs';
import { getEmailFromAuth } from '../../../lib/googleAuthHelper.mjs';
import AuthorizationError from '../../../lib/errors/http/AuthorizationError.js';
const router = Router({ mergeParams: true });

// Responds with whether or not the current user is an admin
router.get('/', async (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        if (!authHeader) {
            throw new AuthorizationError('Authorization Header is empty.');
        }
        const authEmail = await getEmailFromAuth(authHeader);
        const adminStatus = await isAdmin(authEmail);
        return res.status(200).json({ isAdmin: adminStatus });
    } catch (err) {
        switch (err.name) {
            case 'AuthorizationError':
                console.error('AuthorizationError:', err);
                return res.status(401).json({ message: err.message });
            default:
                console.error('Internal Server Error:', err);
                return res
                    .status(500)
                    .json({ message: 'Internal Server Error' });
        }
    }
});

export default router;
