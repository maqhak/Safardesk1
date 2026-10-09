/**
 * Firestore rejects `undefined` field values in setDoc/addDoc payloads
 * ("Unsupported field value: undefined"). The voucher builder sets many
 * optional fields to `undefined` when they are empty, which was silently
 * breaking every Firestore voucher write while the localStorage copy
 * (where JSON.stringify drops undefined) looked fine.
 *
 * This recursively removes keys whose value is `undefined` from objects,
 * leaving arrays, nulls and primitives untouched, so the stored document
 * matches exactly what the app built — minus the forbidden values.
 */
export function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => stripUndefinedDeep(v)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[k] = stripUndefinedDeep(v);
    }
    return out as T;
  }
  return value;
}
