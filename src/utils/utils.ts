export function isDefined<T>(x?: T | null): x is T {
  return x !== undefined && x !== null;
}

/**
 * Shuffle by mutating the input arrays
 * @param arr
 * @returns
 */
export function shuffle<T>(arr: T[]): T[] {
  // https://bost.ocks.org/mike/shuffle/
  let m = arr.length;
  let t: T;
  let i: number;
  while (m) {
    i = Math.floor(Math.random() * m--);
    t = arr[m];
    arr[m] = arr[i];
    arr[i] = t;
  }
  return arr;
}
