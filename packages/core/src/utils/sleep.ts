/**
 * Shared async delay utility.
 * Replaces the 6+ identical `private sleep(ms)` methods scattered across the codebase.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
