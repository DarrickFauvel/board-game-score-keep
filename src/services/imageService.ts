import { v2 as cloudinary } from 'cloudinary';

const APP_FOLDER = 'board-game-score-keep';

// Avatars are stored as uploaded (no incoming transformation) so the person
// can re-crop them later; the crop and the 256px square happen on delivery.
const PROFILES: Record<string, { width: number; height: number; crop: string } | null> = {
  games:    { width: 800,  height: 800, crop: 'limit' },
  avatars:  null,
  sessions: { width: 1200, height: 900, crop: 'limit' },
  misc:     { width: 800,  height: 800, crop: 'limit' },
};

function uploadOptions(folder: string) {
  const profile = folder in PROFILES ? PROFILES[folder] : PROFILES.misc;
  return {
    folder: `${APP_FOLDER}/${folder}`,
    type: 'private' as const,
    ...(profile && {
      transformation: [{ width: profile.width, height: profile.height, crop: profile.crop, fetch_format: 'auto', quality: 'auto' }],
    }),
  };
}

/** Upload and return the Cloudinary public_id (not a URL). */
export async function processUploadedImage(input: Buffer | string, folder = 'misc'): Promise<string> {
  const opts = uploadOptions(folder);

  return new Promise((resolve, reject) => {
    if (typeof input === 'string') {
      cloudinary.uploader.upload(input, opts, (err, result) => {
        if (err || !result) return reject(err ?? new Error('Upload failed'));
        resolve(result.public_id);
      });
    } else {
      const stream = cloudinary.uploader.upload_stream(opts, (err, result) => {
        if (err || !result) return reject(err ?? new Error('Upload failed'));
        resolve(result.public_id);
      });
      stream.end(input);
    }
  });
}

/* ─── Avatar crops ──────────────────────────────────
   A stored avatar is "<public_id>#crop=x,y,w,h": the untouched original plus
   the square the person framed, as fractions (0–1) of the original's width
   and height. Fractions survive any original size, and the original is never
   rewritten, so the person can re-frame it as often as they like. */

export interface Crop { x: number; y: number; w: number; h: number }

const CROP_MARK = '#crop=';
const AVATAR_PREFIX = `${APP_FOLDER}/avatars/`;

/** Parse "x,y,w,h" fractions; null if missing or not a sensible rectangle. */
export function parseCrop(raw: unknown): Crop | null {
  if (typeof raw !== 'string') return null;
  const n = raw.split(',').map(Number);
  if (n.length !== 4 || n.some((v) => !Number.isFinite(v))) return null;
  const [x, y, w, h] = n;
  const ok = x >= 0 && y >= 0 && w >= 0.01 && h >= 0.01 && x + w <= 1.0001 && y + h <= 1.0001;
  return ok ? { x, y, w: Math.min(w, 1 - x), h: Math.min(h, 1 - y) } : null;
}

/** Split a stored image value into its image reference and avatar crop. */
export function splitImageRef(src: string): { ref: string; crop: Crop | null } {
  const i = src.indexOf(CROP_MARK);
  if (i === -1) return { ref: src, crop: null };
  return { ref: src.slice(0, i), crop: parseCrop(src.slice(i + CROP_MARK.length)) };
}

/** Store an image reference with a crop; no crop means "fill the square from the centre". */
export function withCrop(ref: string, crop: Crop | null): string {
  if (!crop) return ref;
  const f = (v: number) => v.toFixed(4); // always a decimal: Cloudinary reads w_1 as 1px, w_1.0000 as 100%
  return `${ref}${CROP_MARK}${f(crop.x)},${f(crop.y)},${f(crop.w)},${f(crop.h)}`;
}

function signedUrl(publicId: string, transformation: object[] = []): string {
  return cloudinary.url(publicId, {
    type: 'private',
    sign_url: true,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    secure: true,
    transformation,
  });
}

/**
 * Resolve a stored image value to a usable URL.
 * - Cloudinary public_id → signed private URL (1-hour expiry); avatars get
 *   their saved crop and a 256px square
 * - Existing full URL or local path → returned as-is
 */
export function resolveImageUrl(src: string | null | undefined): string {
  if (!src) return '';
  const { ref, crop } = splitImageRef(src);
  if (ref.startsWith('http://') || ref.startsWith('https://') || ref.startsWith('/')) return ref;
  if (!ref.startsWith(AVATAR_PREFIX)) return signedUrl(ref);
  const f = (v: number) => v.toFixed(4);
  return signedUrl(ref, [
    ...(crop ? [{ crop: 'crop', x: f(crop.x), y: f(crop.y), width: f(crop.w), height: f(crop.h) }] : []),
    { width: 256, height: 256, crop: 'fill', fetch_format: 'auto', quality: 'auto' },
  ]);
}

/** The whole original avatar (capped for the browser), for the crop editor. */
export function resolveOriginalUrl(src: string | null | undefined): string {
  if (!src) return '';
  const { ref } = splitImageRef(src);
  if (ref.startsWith('http://') || ref.startsWith('https://') || ref.startsWith('/')) return ref;
  return signedUrl(ref, [{ width: 1200, height: 1200, crop: 'limit', fetch_format: 'auto', quality: 'auto' }]);
}

/** The crop saved with an avatar, as "x,y,w,h", for the crop editor. */
export function cropOf(src: string | null | undefined): string {
  const crop = src ? splitImageRef(src).crop : null;
  return crop ? withCrop('', crop).slice(CROP_MARK.length) : '';
}
