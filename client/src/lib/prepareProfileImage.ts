const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp']);

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
    return cropImageToFile(file, area, { outWidth: 1600, outHeight: 600, filename: 'cover.jpg' });
  }

  const img = await loadImage(file);
  const targetRatio = 1600 / 600;
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
    { outWidth: 1600, outHeight: 600, filename: 'cover.jpg' }
  );
}
