import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { Eta } from 'eta';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { router } from './routes/index.js';
import { errorHandler, notFound } from './middleware/error.js';
import { config } from './config.js';
import { resolveImageUrl } from './services/imageService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://cdn.jsdelivr.net'],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:', '*'],
        connectSrc: ["'self'", 'https://cdn.jsdelivr.net'],
        mediaSrc: ["'self'", 'blob:'],
      },
    },
  }));

  // Never compress live event streams: gzip buffers output, so session
  // updates would sit in the buffer instead of reaching other devices.
  app.use(compression({
    filter: (req, res) =>
      !String(res.getHeader('Content-Type') ?? '').includes('text/event-stream') && compression.filter(req, res),
  }));
  app.use(morgan(config.isDev ? 'dev' : 'combined'));
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(cookieParser());
  app.use(express.static(join(__dirname, 'public')));
  app.use('/vendor/qrcode-generator', express.static(join(__dirname, '../node_modules/qrcode-generator/dist')));

  const eta = new Eta({ views: join(__dirname, 'views'), cache: !config.isDev });
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.renderEta = (template: string, data: Record<string, unknown> = {}) => {
      try {
        const html = eta.render(template, { ...data, config, imgUrl: resolveImageUrl });
        res.send(html);
      } catch (err) { next(err); }
    };
    next();
  });

  app.use(router);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
