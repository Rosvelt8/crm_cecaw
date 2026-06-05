import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env';
import { errorHandler, notFound } from './middleware/errorHandler';
import router from './routes';
import { openApiSpec } from './docs/openapi';

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: env.isDev ? '*' : env.CORS_ORIGINS,
  credentials: true,
}));
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (env.isDev) app.use(morgan('dev'));

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, {
  customSiteTitle: 'CECAW CRM API',
  swaggerOptions: { persistAuthorization: true },
}));

app.use('/api/v1', router);

app.use(notFound);
app.use(errorHandler);

export default app;
