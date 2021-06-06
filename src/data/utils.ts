import { ValueOrPromise } from "@benzene/core";

/**
 * This function is used to overcome limitation
 * of number of entries one API call can fetch
 * eg: If the limit = 50, and we need 120, we will
 * do three calls 50, 50, 20
 * @param externalIds
 * @param limit
 * @param fn
 * @returns
 */
export async function getFromIdsPerEveryNum<T>(
  externalIds: string[],
  limit: number,
  fn: (ids: string[]) => ValueOrPromise<T[]>
) {
  const results: T[] = [];
  while (externalIds.length > 0) {
    const ids = externalIds.splice(0, limit);
    if (ids.length > 0) {
      results.push(...(await fn(ids)));
    }
  }
  return results;
}
