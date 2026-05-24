import sharp from 'sharp';
import path from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unlink } from 'node:fs/promises';
import { v4 as uuidv4 } from 'uuid';

const __dirname = dirname(fileURLToPath(import.meta.url));
const uploadsBase = path.join(__dirname, '../../src/public/uploads');

const PROFILES = {
  games:    { width: 800, height: 800, fit: 'cover' },
  avatars:  { width: 256, height: 256, fit: 'cover' },
  sessions: { width: 1200, height: 900, fit: 'inside' },
  misc:     { width: 800, height: 800, fit: 'inside' },
};

export async function processUploadedImage(inputPath, folder = 'misc') {
  const profile = PROFILES[folder] ?? PROFILES.misc;
  const filename = `${uuidv4()}.webp`;
  const outputPath = path.join(uploadsBase, folder, filename);

  await sharp(inputPath)
    .resize(profile.width, profile.height, { fit: profile.fit, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(outputPath);

  await unlink(inputPath).catch(() => {});

  return `/uploads/${folder}/${filename}`;
}
