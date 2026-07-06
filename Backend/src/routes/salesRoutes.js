import express from 'express';
import upload from '../middleware/uploadMiddleware.js';
import { handleUpload } from '../middleware/uploadErrorHandler.js';
import { verifyToken } from '../middleware/authMiddleware.js';
import { importSales, exportSales } from '../controllers/salesController.js';
import { getSalesTable } from '../controllers/salesController.js';
import { getCategories } from '../controllers/salesController.js';

const router = express.Router();

router.post('/import', verifyToken, handleUpload(upload.single('file')), importSales);
router.get('/export', verifyToken, exportSales);
router.get('/table', verifyToken, getSalesTable);
router.get('/categories', verifyToken, getCategories);

export default router;