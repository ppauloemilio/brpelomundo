const ROTATION_INDEX_KEY = 'ad_banner_rotation_index';

/** Round-robin pick among eligible ads; persists index in sessionStorage per tab. */
export function pickNextRotatedAd<T extends { id: string }>(ads: T[]): T | null {
  if (ads.length === 0) return null;
  if (ads.length === 1) return ads[0];

  let index = 0;
  try {
    const raw = sessionStorage.getItem(ROTATION_INDEX_KEY);
    if (raw != null) {
      const parsed = Number.parseInt(raw, 10);
      if (Number.isFinite(parsed) && parsed >= 0) index = parsed;
    }
  } catch {
    /* private mode / blocked storage */
  }

  const selected = ads[index % ads.length];

  try {
    sessionStorage.setItem(ROTATION_INDEX_KEY, String((index + 1) % ads.length));
  } catch {
    /* ignore */
  }

  return selected;
}
