import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, async (req: Request, res: Response) => {
  const raw = req.query.url;
  if (typeof raw !== 'string' || !raw) {
    res.status(400).send('Missing url parameter');
    return;
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    res.status(400).send('Invalid URL');
    return;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    res.status(400).send('Only http/https URLs are allowed');
    return;
  }

  try {
    const upstream = await fetch(url.toString(), {
      headers: { 'User-Agent': 'BoardGameScoreKeep/1.0' },
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
    });

    if (!upstream.ok) {
      res.status(502).send('Upstream error');
      return;
    }

    const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream';
    if (!contentType.startsWith('image/')) {
      res.status(400).send('URL did not return an image');
      return;
    }

    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=86400');
    res.set('Access-Control-Allow-Origin', '*');

    const buf = await upstream.arrayBuffer();
    res.send(Buffer.from(buf));
  } catch {
    res.status(502).send('Failed to fetch image');
  }
});

export default router;
