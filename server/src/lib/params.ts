/** Express tipa `req.params.*` como `string | string[]`. */
export function paramId(raw: string | string[] | undefined): string {
  if (raw == null) return '';
  return Array.isArray(raw) ? (raw[0] ?? '') : raw;
}
