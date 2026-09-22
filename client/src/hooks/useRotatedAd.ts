import { useEffect, useMemo, useRef, useState } from 'react';
import { pickNextRotatedAd } from '@/lib/adRotation';

/** Picks one ad from the pool using round-robin (once per mount / pool change). */
export function useRotatedAd<T extends { id: string }>(ads: T[]): T | null {
  const [selected, setSelected] = useState<T | null>(null);
  const poolKey = useMemo(() => ads.map((a) => a.id).sort().join('|'), [ads]);
  const pickedForPool = useRef<string | null>(null);

  useEffect(() => {
    if (!poolKey) {
      setSelected(null);
      pickedForPool.current = null;
      return;
    }
    if (pickedForPool.current === poolKey) return;
    pickedForPool.current = poolKey;
    setSelected(pickNextRotatedAd(ads));
  }, [poolKey, ads]);

  return selected;
}
