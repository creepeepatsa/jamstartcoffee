import express from 'express';
import {
  getUsers,
  getUserById,
  updateUser,
  archiveUser,
  restoreUser,
  getPasswordChangeRequests,
  resolvePasswordChangeRequest,
  declinePasswordChangeRequest,
} from '../controllers/userController.js';
import { verifyRole, verifyToken } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(verifyToken, verifyRole('Admin'));

router.get('/', getUsers);
router.get('/password-change-requests', getPasswordChangeRequests);
router.put('/password-change-requests/:requestId/resolve', resolvePasswordChangeRequest);
router.put('/password-change-requests/:requestId/decline', declinePasswordChangeRequest);
router.get('/:id', getUserById);
router.put('/:id', updateUser);
router.put('/:id/archive', archiveUser);
router.put('/:id/restore', restoreUser);

export default router;