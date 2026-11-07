import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { CONFIG } from '../config.js';

// Ensure upload directory exists
if (!fs.existsSync(CONFIG.PATHS.UPLOADS_DIR)) {
  fs.mkdirSync(CONFIG.PATHS.UPLOADS_DIR, { recursive: true });
}

// Multer storage configuration for log files
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, CONFIG.PATHS.UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const cleanName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${Date.now()}_${cleanName}${ext}`);
  }
});

// File filter: accept only .log and .txt files
export const uploadMiddleware = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB max
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.log' || ext === '.txt') {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only .log and .txt files are accepted.'));
    }
  }
});
