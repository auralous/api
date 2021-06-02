export function isDefined<T>(x?: T | null): x is T {
  return x !== undefined && x !== null;
}
