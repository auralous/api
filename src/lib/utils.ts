export function isDefined<T>(x?: T | null): x is T {
  return x !== undefined && x !== null;
}

export function reorder(list: any[], startIndex: number, endIndex: number) {
  const result = Array.from(list);
  const [removed] = result.splice(startIndex, 1);
  result.splice(endIndex, 0, removed);
  return result;
}
