import { v2 as cloudinary } from 'cloudinary';

const APP_FOLDER = 'board-game-score-keep';

const PROFILES: Record<string, { width: number; height: number; crop: string }> = {
  games:    { width: 800,  height: 800, crop: 'limit' },
  avatars:  { width: 256,  height: 256, crop: 'fill'  },
  sessions: { width: 1200, height: 900, crop: 'limit' },
  misc:     { width: 800,  height: 800, crop: 'limit' },
};

function uploadOptions(folder: string) {
  const profile = PROFILES[folder] ?? PROFILES.misc;
  return {
    folder: `${APP_FOLDER}/${folder}`,
    type: 'private' as const,
    transformation: [{ width: profile.width, height: profile.height, crop: profile.crop, fetch_format: 'auto', quality: 'auto' }],
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

/**
 * Resolve a stored image value to a usable URL.
 * - Cloudinary public_id → signed private URL (1-hour expiry)
 * - Existing full URL or local path → returned as-is
 */
export function resolveImageUrl(src: string | null | undefined): string {
  if (!src) return '';
  if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('/')) return src;
  return cloudinary.url(src, {
    type: 'private',
    sign_url: true,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    secure: true,
  });
}
