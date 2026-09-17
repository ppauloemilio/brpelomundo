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
 * Duas formas de autenticar no Blob, resolvidas pelo próprio SDK:
 * OIDC (BLOB_STORE_ID + VERCEL_OIDC_TOKEN, padrão na Vercel desde 2026) ou um
 * BLOB_READ_WRITE_TOKEN estático, usado fora da Vercel. Basta um dos dois.
 */
export const blobEnabled = !!(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);

/** Na Vercel o filesystem é somente leitura, então o fallback de disco não existe. */
const isServerless = !!process.env.VERCEL;

/** Erro de configuração, não de servidor: rende 503 com instrução em vez de 500 mudo. */
export class UploadNotConfiguredError extends Error {
  constructor() {
    super(
      'Armazenamento de imagens indisponível: nenhum Blob Store conectado a este deploy. ' +
        'Conecte um store na Vercel (Storage) e faça um novo deploy, porque as variáveis ' +
        'de ambiente só entram em deploys criados depois da conexão.'
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

  if (blobEnabled) {
    // Sem repassar credenciais: o SDK lê o OIDC (rotacionado pela Vercel) ou o
    // token estático do ambiente. A documentação alerta para não manuseá-los.
    const { url } = await put(`uploads/${filename}`, file.buffer, {
      access: 'public',
      contentType: file.mimetype,
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
