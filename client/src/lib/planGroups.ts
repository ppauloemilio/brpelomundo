export type PlanGroupId = 'account' | 'map' | 'boost' | 'ads' | 'other';

const GROUP_ORDER: PlanGroupId[] = ['account', 'map', 'boost', 'ads', 'other'];

export function planGroupId(productType: string): PlanGroupId {
  switch (productType) {
    case 'premium':
      return 'account';
    case 'featured_business':
    case 'local_business':
      return 'map';
    case 'promoted_post':
    case 'promoted_job':
    case 'classified_featured':
    case 'classified_extra':
    case 'sponsored_event':
      return 'boost';
    case 'ad_campaign':
      return 'ads';
    default:
      return 'other';
  }
}

export function groupPlans<T extends { product_type: string; sort_order?: number }>(plans: T[]) {
  const buckets = new Map<PlanGroupId, T[]>();
  for (const plan of plans) {
    const id = planGroupId(plan.product_type);
    const list = buckets.get(id) ?? [];
    list.push(plan);
    buckets.set(id, list);
  }

  return GROUP_ORDER.flatMap((id) => {
    const items = buckets.get(id);
    if (!items?.length) return [];
    items.sort((a, b) => {
      if (a.product_type === 'featured_business' && b.product_type === 'local_business') return -1;
      if (a.product_type === 'local_business' && b.product_type === 'featured_business') return 1;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });
    return [{ id, plans: items }];
  });
}
