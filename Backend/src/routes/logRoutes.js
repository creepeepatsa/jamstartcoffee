import express from 'express';

import { getActivityLogs } from '../controllers/logController.js';
import { verifyRole, verifyToken } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', verifyToken, verifyRole('Admin'), getActivityLogs);

export default router;