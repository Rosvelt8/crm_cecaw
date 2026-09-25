import multer from 'multer';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { mkdirSync } from 'fs';
import { env } from '../config/env';

// Le dossier de dépôt est créé au besoin : multer ne le fait pas et échouerait au premier envoi.
try { mkdirSync(env.UPLOAD_DIR, { recursive: true }); } catch { /* signalé au premier envoi */ }

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, env.UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuid()}${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: env.MAX_FILE_SIZE },
});
