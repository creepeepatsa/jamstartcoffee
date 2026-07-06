import multer from 'multer';

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.csv', '.xlsx', '.xls'];
    const ext = file.originalname.slice(file.originalname.lastIndexOf('.')).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only .csv, .xlsx, or .xls files are allowed'));
    }
  },
});

export default upload;