import dotenv from 'dotenv';
dotenv.config();

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: parseInt(process.env.PORT ?? '4000', 10),
  DATABASE_URL: process.env.DATABASE_URL ?? '',
  REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
  JWT_SECRET: process.env.JWT_SECRET ?? 'dev_secret',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? 'dev_refresh_secret',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? '15m',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  DEFAULT_PASSWORD: process.env.DEFAULT_PASSWORD ?? 'Cecaw2025!',
  UPLOAD_DIR: process.env.UPLOAD_DIR ?? './uploads',
  MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE ?? '10485760', 10),
  FRONTEND_URL: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  // SMTP (optionnel — les mails sont silencieux si SMTP_HOST est vide)
  SMTP_HOST: process.env.SMTP_HOST ?? '',
  SMTP_PORT: parseInt(process.env.SMTP_PORT ?? '587', 10),
  SMTP_USER: process.env.SMTP_USER ?? '',
  SMTP_PASS: process.env.SMTP_PASS ?? '',
  SMTP_FROM: process.env.SMTP_FROM ?? 'CECAW CRM <noreply@cecaw.cm>',
  isDev: (process.env.NODE_ENV ?? 'development') === 'development',
};
