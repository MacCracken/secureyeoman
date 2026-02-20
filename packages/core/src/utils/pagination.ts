export function paginate<T>(arr: T[], limit?: number, offset = 0): T[] {
  return limit !== undefined ? arr.slice(offset, offset + limit) : arr.slice(offset);
}
