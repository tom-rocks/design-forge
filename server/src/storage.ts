import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

// Railway volume mount path (configured in railway.json)
const STORAGE_PATH = process.env.STORAGE_PATH || './storage';
const IMAGES_DIR = path.join(STORAGE_PATH, 'images');
const THUMBS_DIR = path.join(STORAGE_PATH, 'thumbnails');

// Ensure storage directories exist
export async function initStorage() {
  try {
    await fs.mkdir(IMAGES_DIR, { recursive: true });
    await fs.mkdir(THUMBS_DIR, { recursive: true });
    console.log(`[Storage] Initialized at ${STORAGE_PATH}`);
  } catch (err) {
    console.error('[Storage] Failed to initialize:', err);
    throw err;
  }
}

// Generate a unique filename
function generateFilename(generationId: string, index: number): string {
  return `${generationId}-${index}.png`;
}

// Save a base64 image to storage
export async function saveImage(base64DataUrl: string, generationId: string, index: number): Promise<string> {
  const filename = generateFilename(generationId, index);
  const filepath = path.join(IMAGES_DIR, filename);
  
  // Parse base64 data URL
  const matches = base64DataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) {
    throw new Error('Invalid base64 data URL');
  }
  
  const buffer = Buffer.from(matches[2], 'base64');
  await fs.writeFile(filepath, buffer);
  
  console.log(`[Storage] Saved image: ${filename} (${buffer.byteLength} bytes)`);
  return filename;
}

// Create a thumbnail for an image
export async function createThumbnail(imagePath: string, generationId: string): Promise<string> {
  const thumbFilename = `${generationId}-thumb.jpg`;
  const thumbPath = path.join(THUMBS_DIR, thumbFilename);
  const sourcePath = path.join(IMAGES_DIR, imagePath);
  
  await sharp(sourcePath)
    .resize(200, 200, { fit: 'cover' })
    .jpeg({ quality: 80 })
    .toFile(thumbPath);
  
  console.log(`[Storage] Created thumbnail: ${thumbFilename}`);
  return thumbFilename;
}

// Get image file path
export function getImagePath(filename: string): string {
  return path.join(IMAGES_DIR, filename);
}

// Get thumbnail file path
export function getThumbnailPath(filename: string): string {
  return path.join(THUMBS_DIR, filename);
}

// Check if file exists
export async function fileExists(filepath: string): Promise<boolean> {
  try {
    await fs.access(filepath);
    return true;
  } catch {
    return false;
  }
}

// Delete image files for a generation
export async function deleteImages(imagePaths: string[], thumbnailPath?: string | null): Promise<void> {
  for (const imagePath of imagePaths) {
    try {
      await fs.unlink(path.join(IMAGES_DIR, imagePath));
    } catch (err) {
      console.warn(`[Storage] Failed to delete image ${imagePath}:`, err);
    }
  }
  
  if (thumbnailPath) {
    try {
      await fs.unlink(path.join(THUMBS_DIR, thumbnailPath));
    } catch (err) {
      console.warn(`[Storage] Failed to delete thumbnail ${thumbnailPath}:`, err);
    }
  }
}

// Read image as base64 data URL
export async function readImageAsBase64(filename: string): Promise<string> {
  const filepath = path.join(IMAGES_DIR, filename);
  const buffer = await fs.readFile(filepath);
  const base64 = buffer.toString('base64');
  
  // Detect mime type from extension
  const ext = path.extname(filename).toLowerCase();
  const mimeType = ext === '.png' ? 'image/png' : 
                   ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 
                   'image/png';
  
  return `data:${mimeType};base64,${base64}`;
}
