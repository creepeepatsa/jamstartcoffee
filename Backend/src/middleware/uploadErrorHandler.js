import multer from 'multer';

// Wraps multer's upload.single() so file-related errors (wrong type, too large)
// return a clean JSON response instead of crashing or returning an ugly stack trace.
// Usage in routes: router.post('/import', verifyToken, handleUpload(upload.single('file')), importSales);
export const handleUpload = (multerMiddleware) => (req, res, next) => {
  multerMiddleware(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File exceeds the 25MB size limit' });
      }
      return res.status(400).json({ error: `Upload error: ${err.message}` });
    }
    if (err) {
      // Thrown manually from fileFilter (e.g. wrong file extension)
      return res.status(400).json({ error: err.message });
    }
    next();
  });
};