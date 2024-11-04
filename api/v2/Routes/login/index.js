import { Router } from 'express';
import RateLimit from 'express-rate-limit';
import { validateAdminOrStudentMiddleware } from '../../../lib/authlib.mjs';
import { getEmailFromAuth } from '../../../lib/googleAuthHelper.mjs';
import { isAdmin } from '../../../lib/userlib.mjs';

const router = Router({ mergeParams: true });

router.use(
    RateLimit({
        windowMs: 5 * 60 * 1000, // 5 minutes
        max: 100, // 100 requests
    }),
);

router.get(
    '/',
    validateAdminOrStudentMiddleware,
    async (req, res) => {
        const requestorEmail = await getEmailFromAuth(
            req.headers['authorization'],
        );
        const isRequestorAdmin = isAdmin(requestorEmail);
        res.send({ status: true, isAdmin: isRequestorAdmin });
    },
    (error, req, res, next) => {
        // If an error occurs in the middleware, send False
        console.error(error);
        res.send({ status: false, isAdmin: false });
    },
);

export default router;
