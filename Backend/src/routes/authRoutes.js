import express from 'express';
import { register, requestPasswordChange, login, logout, getMe } from '../controllers/authController.js';
import { verifyToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public routes
router.post('/register', register);
router.post('/login', login);
router.post('/password-change-requests', requestPasswordChange);

// Protected routes — require a valid token
router.post('/logout', verifyToken, logout);
router.get('/me', verifyToken, getMe);

export default router;