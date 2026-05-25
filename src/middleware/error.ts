import type { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';

interface HttpError {
  status?: number;
  statusCode?: number;
  message?: string;
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const httpErr = err as HttpError;
  const status = httpErr.status ?? httpErr.statusCode ?? 500;
  const message = httpErr.message ?? 'Internal Server Error';

  if (config.isDev) console.error(err);

  if (req.accepts('html')) {
    res.status(status).send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Error ${status}</title>
  <link rel="stylesheet" href="/css/tokens.css">
  <link rel="stylesheet" href="/css/reset.css">
  <link rel="stylesheet" href="/css/base.css">
</head>
<body>
  <main id="main-content" style="padding:var(--space-8);text-align:center">
    <h1>${status}</h1>
    <p>${status === 404 ? 'That page was not found in the Keep.' : message}</p>
    <a href="/" class="btn btn--primary">Return to the Keep</a>
  </main>
</body>
</html>`);
  } else {
    res.status(status).json({ error: message });
  }
}

export function notFound(req: Request, _res: Response, next: NextFunction): void {
  const err = Object.assign(new Error(`Not Found: ${req.path}`), { status: 404 });
  next(err);
}
