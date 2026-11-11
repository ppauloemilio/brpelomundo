const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** Proporção da capa no perfil e no crop (igual ao banner). */
export const COVER_ASPECT = 8 / 3;
export const COVER_OUT_WIDTH = 1600;
export const COVER_OUT_HEIGHT = 600;

export type ImageValidationError = 'invalidType' | 'tooLarge';

export type CropAreaPixels = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function validateImageFile(file: File): ImageValidationError | null {
  if (!ACCEPTED.has(file.type)) return 'invalidType';
  if (file.size > MAX_BYTES) return 'tooLarge';
  return null;
}

function loadImage(file: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('load failed'));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('blob failed'))), type, quality);
  });
}

/** Recorta a área escolhida pelo usuário e gera o arquivo final. */
export async function cropImageToFile(
  file: File,
  area: CropAreaPixels,
  opts: { outWidth: number; outHeight: number; filename: string }
): Promise<File> {
  const img = await loadImage(file);
  const canvas = document.createElement('canvas');
  canvas.width = opts.outWidth;
  canvas.height = opts.outHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;

  const sx = Math.max(0, Math.min(img.width, area.x));
  const sy = Math.max(0, Math.min(img.height, area.y));
  const sw = Math.max(1, Math.min(img.width - sx, area.width));
  const sh = Math.max(1, Math.min(img.height - sy, area.height));

  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, opts.outWidth, opts.outHeight);
  const blob = await canvasToBlob(canvas, 'image/jpeg', 0.88);
  return new File([blob], opts.filename, { type: 'image/jpeg' });
}

export async function prepareAvatarImage(file: File, area?: CropAreaPixels): Promise<File> {
  if (area) {
    return cropImageToFile(file, area, { outWidth: 512, outHeight: 512, filename: 'avatar.jpg' });
  }

  const img = await loadImage(file);
  const crop = Math.min(img.width, img.height);
  const sx = (img.width - crop) / 2;
  const sy = (img.height - crop) / 2;
  return cropImageToFile(
    file,
    { x: sx, y: sy, width: crop, height: crop },
    { outWidth: 512, outHeight: 512, filename: 'avatar.jpg' }
  );
}

export async function prepareCoverImage(file: File, area?: CropAreaPixels): Promise<File> {
  if (area) {
    return cropImageToFile(file, area, {
      outWidth: COVER_OUT_WIDTH,
      outHeight: COVER_OUT_HEIGHT,
      filename: 'cover.jpg',
    });
  }

  const img = await loadImage(file);
  const targetRatio = COVER_ASPECT;
  let sw = img.width;
  let sh = img.height;
  let sx = 0;
  let sy = 0;
  if (img.width / img.height > targetRatio) {
    sw = img.height * targetRatio;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / targetRatio;
    sy = (img.height - sh) / 2;
  }
  return cropImageToFile(
    file,
    { x: sx, y: sy, width: sw, height: sh },
    { outWidth: COVER_OUT_WIDTH, outHeight: COVER_OUT_HEIGHT, filename: 'cover.jpg' }
  );
}

const UPLOAD_MAX_EDGE = 1920;
const UPLOAD_JPEG_QUALITY = 0.85;
const SKIP_OPTIMIZE_TYPES = new Set(['image/gif', 'image/svg+xml']);

/**
 * Redimensiona e comprime imagens genéricas (posts, chat, ads).
 * GIF/SVG e não-imagens passam intactos. Em falha, devolve o original.
 */
export async function prepareUploadImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || SKIP_OPTIMIZE_TYPES.has(file.type)) {
    return file;
  }

  try {
    const img = await loadImage(file);
    const edge = Math.max(img.width, img.height);
    const needsResize = edge > UPLOAD_MAX_EDGE;
    const alreadyLight =
      file.type === 'image/jpeg' && !needsResize && file.size <= 400 * 1024;
    if (alreadyLight) return file;

    let width = img.width;
    let height = img.height;
    if (needsResize) {
      const scale = UPLOAD_MAX_EDGE / edge;
      width = Math.max(1, Math.round(img.width * scale));
      height = Math.max(1, Math.round(img.height * scale));
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    ctx.drawImage(img, 0, 0, width, height);
    const blob = await canvasToBlob(canvas, 'image/jpeg', UPLOAD_JPEG_QUALITY);
    if (blob.size >= file.size && file.type === 'image/jpeg' && !needsResize) {
      return file;
    }
    const base = file.name.replace(/\.[^.]+$/, '') || 'image';
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
