const ROTATION_INDEX_KEY = 'ad_banner_rotation_index';

function readRotationIndex(): number {
  try {
    const raw = sessionStorage.getItem(ROTATION_INDEX_KEY);
    if (raw != null) {
      const parsed = Number.parseInt(raw, 10);
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
  } catch {
    /* private mode / blocked storage */
  }
  return 0;
}

function writeRotationIndex(index: number) {
  try {
    sessionStorage.setItem(ROTATION_INDEX_KEY, String(index));
  } catch {
    /* ignore */
  }
}

/** Next slot in round-robin (0 … length-1); advances persisted index. */
export function advanceRotationIndex(length: number): number {
  if (length <= 0) return 0;
  const index = readRotationIndex() % length;
  writeRotationIndex((index + 1) % length);
  return index;
}

/** Starting slide for carousels; uses the same round-robin counter as sidebar ads. */
export function getCarouselStartIndex(length: number): number {
  return advanceRotationIndex(length);
}

/** Round-robin pick among eligible ads; persists index in sessionStorage per tab. */
export function pickNextRotatedAd<T extends { id: string }>(ads: T[]): T | null {
  if (ads.length === 0) return null;
  const index = advanceRotationIndex(ads.length);
  return ads[index];
}
