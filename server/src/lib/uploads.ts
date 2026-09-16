import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v4 as uuid } from 'uuid';
import { put } from '@vercel/blob';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Fallback de disco para desenvolvimento local. Em serverless o filesystem é
 * somente leitura e efêmero, então lá os arquivos vão para o Vercel Blob.
 */
export const uploadsDir = path.join(__dirname, '../uploads');

export const blobEnabled = !!process.env.BLOB_READ_WRITE_TOKEN;

export type UploadedFile = {
  originalname: string;
  buffer: Buffer;
  mimetype: string;
};

/** Grava o arquivo e devolve a URL pública a ser persistida no banco. */
export async function saveUpload(file: UploadedFile): Promise<string> {
  const filename = `${uuid()}${path.extname(file.originalname)}`;

  if (blobEnabled) {
    const { url } = await put(`uploads/${filename}`, file.buffer, {
      access: 'public',
      contentType: file.mimetype,
    });
    return url;
  }

  fs.mkdirSync(uploadsDir, { recursive: true });
  fs.writeFileSync(path.join(uploadsDir, filename), file.buffer);
  return `/uploads/${filename}`;
}
