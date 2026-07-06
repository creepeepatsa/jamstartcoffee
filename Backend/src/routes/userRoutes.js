import express from 'express';
import {
  getUsers,
  getUserById,
  updateUser,
  archiveUser,
  restoreUser,
} from '../controllers/userController.js';
import { verifyToken } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', verifyToken, getUsers);
router.get('/:id', verifyToken, getUserById);
router.put('/:id', verifyToken, updateUser);
router.put('/:id/archive', verifyToken, archiveUser);
router.put('/:id/restore', verifyToken, restoreUser);

export default router;