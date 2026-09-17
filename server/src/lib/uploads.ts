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

/**
 * O nome padrão é BLOB_READ_WRITE_TOKEN, mas a Vercel permite escolher um
 * prefixo ao conectar o store, e aí a variável vem como <PREFIXO>_READ_WRITE_TOKEN.
 */
function resolveBlobToken(): string | undefined {
  if (process.env.BLOB_READ_WRITE_TOKEN) return process.env.BLOB_READ_WRITE_TOKEN;
  const key = Object.keys(process.env).find((k) => k.endsWith('READ_WRITE_TOKEN'));
  return key ? process.env[key] : undefined;
}

const blobToken = resolveBlobToken();

export const blobEnabled = !!blobToken;

/** Na Vercel o filesystem é somente leitura, então o fallback de disco não existe. */
const isServerless = !!process.env.VERCEL;

/** Erro de configuração, não de servidor: rende 503 com instrução em vez de 500 mudo. */
export class UploadNotConfiguredError extends Error {
  constructor() {
    super(
      'Armazenamento de imagens indisponível: nenhum token de Blob encontrado neste deploy. ' +
        'Conecte um Blob Store ao projeto na Vercel (Storage) e faça um novo deploy, ' +
        'porque as variáveis de ambiente só entram em deploys criados depois da conexão.'
    );
    this.name = 'UploadNotConfiguredError';
  }
}

export type UploadedFile = {
  originalname: string;
  buffer: Buffer;
  mimetype: string;
};

/** Grava o arquivo e devolve a URL pública a ser persistida no banco. */
export async function saveUpload(file: UploadedFile): Promise<string> {
  const filename = `${uuid()}${path.extname(file.originalname)}`;

  if (blobToken) {
    const { url } = await put(`uploads/${filename}`, file.buffer, {
      access: 'public',
      contentType: file.mimetype,
      token: blobToken,
    });
    return url;
  }

  if (isServerless) {
    throw new UploadNotConfiguredError();
  }

  fs.mkdirSync(uploadsDir, { recursive: true });
  fs.writeFileSync(path.join(uploadsDir, filename), file.buffer);
  return `/uploads/${filename}`;
}
