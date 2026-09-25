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
// Derrière un reverse proxy (nginx, Docker), indiquer le nombre de sauts pour que l'IP réelle serve à la limitation de débit.
// "false" (ou absent) : proxy non approuvé, valeur par défaut d'Express. "true" : approuver le premier saut.
// Un nombre ou une liste d'IP/sous-réseaux sont aussi acceptés, transmis tels quels à Express.
const trustProxy = process.env.TRUST_PROXY;
if (trustProxy && trustProxy !== 'false') {
  app.set('trust proxy', trustProxy === 'true' ? true : Number(trustProxy) || trustProxy);
}

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
