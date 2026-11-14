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
import { resolveImageUrl, resolveOriginalUrl, cropOf } from './services/imageService.js';
import { gameUnits } from './services/units.js';
import { winRule } from './services/winRule.js';
import { avatar } from './viewHelpers.js';
import { playerService } from './services/playerService.js';

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
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.renderEta = (template: string, data: Record<string, unknown> = {}) => {
      void (async () => {
        try {
          // Full pages show the signed-in person's own picture in the header;
          // partials (live scoreboard refreshes) don't need the lookup
          const user = data.user as { sub?: string } | undefined;
          const me = user?.sub && !template.startsWith('partials/')
            ? await playerService.findByUserId(user.sub)
            : null;
          // currentPath lets the layout mark the nav link for the section you're in
          const html = eta.render(template, {
            ...data, me, config, imgUrl: resolveImageUrl, imgOriginal: resolveOriginalUrl, imgCrop: cropOf,
            avatar, units: gameUnits, winRule, currentPath: req.originalUrl.split('?')[0],
          });
          res.send(html);
        } catch (err) { next(err); }
      })();
    };
    next();
  });

  app.use(router);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
