import multer from 'multer';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { env } from '../config/env';

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
