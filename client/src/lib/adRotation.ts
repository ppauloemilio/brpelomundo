function rotationKey(slot = 'default') {
  return `ad_banner_rotation_index_${slot}`;
}

function readRotationIndex(slot = 'default'): number {
  try {
    const raw = sessionStorage.getItem(rotationKey(slot));
    if (raw != null) {
      const parsed = Number.parseInt(raw, 10);
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
  } catch {
    /* private mode / blocked storage */
  }
  return 0;
}

function writeRotationIndex(index: number, slot = 'default') {
  try {
    sessionStorage.setItem(rotationKey(slot), String(index));
  } catch {
    /* ignore */
  }
}

/** Next slot in round-robin (0 … length-1); advances persisted index. */
export function advanceRotationIndex(length: number, slot = 'default'): number {
  if (length <= 0) return 0;
  const index = readRotationIndex(slot) % length;
  writeRotationIndex((index + 1) % length, slot);
  return index;
}

/** Starting slide for carousels; round-robin counter is scoped per placement slot. */
export function getCarouselStartIndex(length: number, slot = 'default'): number {
  return advanceRotationIndex(length, slot);
}
