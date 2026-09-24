import express from 'express';
import upload from '../middleware/uploadMiddleware.js';
import { handleUpload } from '../middleware/uploadErrorHandler.js';
import { verifyRole, verifyToken } from '../middleware/authMiddleware.js';
import { importSales, exportSales, createSale, updateSale, archiveSale, restoreSale } from '../controllers/salesController.js';
import { getSalesTable } from '../controllers/salesController.js';
import { getCategories, getItems } from '../controllers/salesController.js';

const router = express.Router();

router.post('/', verifyToken, verifyRole('Admin'), createSale);
router.put('/:id', verifyToken, verifyRole('Admin'), updateSale);
router.patch('/:id/archive', verifyToken, verifyRole('Admin'), archiveSale);
router.patch('/:id/restore', verifyToken, verifyRole('Admin'), restoreSale);
router.post('/import', verifyToken, verifyRole('Admin'), handleUpload(upload.single('file')), importSales);
router.get('/export', verifyToken, exportSales);
router.get('/table', verifyToken, getSalesTable);
router.get('/categories', verifyToken, getCategories);
router.get('/items', verifyToken, getItems);

export default router;