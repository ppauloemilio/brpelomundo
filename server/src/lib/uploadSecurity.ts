import path from 'path';

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

export function isAllowedImageMime(mimetype: string | undefined): boolean {
  if (!mimetype) return false;
  return ALLOWED_MIME.has(mimetype.toLowerCase());
}

/** Extensão segura derivada do MIME (ignora o nome original do cliente). */
export function safeImageExtension(mimetype: string): string {
  return MIME_TO_EXT[mimetype.toLowerCase()] || '.jpg';
}

export function assertAllowedUpload(file: { mimetype: string; originalname: string }) {
  if (!isAllowedImageMime(file.mimetype)) {
    throw Object.assign(
      new Error('Formato inválido. Use JPG, PNG, WebP ou GIF.'),
      { status: 400 }
    );
  }
  // Bloqueia nomes com path traversal mesmo que a extensão real venha do MIME.
  const base = path.basename(file.originalname || 'image');
  if (base.includes('\0') || base.includes('..')) {
    throw Object.assign(new Error('Nome de arquivo inválido'), { status: 400 });
  }
}
