/** Maps over items with at most `concurrency` calls running at once, keeping the order. */
export async function mapLimit<T, R>(items: readonly T[], concurrency: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index] as T, index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, worker));
  return results;
}

/** Runs each key's lookup once, even when it is asked for several times in one request. */
export function memoize<R>(fn: (key: string) => Promise<R>): (key: string) => Promise<R> {
  const cache = new Map<string, Promise<R>>();
  return (key) => {
    let result = cache.get(key);
    if (!result) {
      result = fn(key);
      cache.set(key, result);
    }
    return result;
  };
}
