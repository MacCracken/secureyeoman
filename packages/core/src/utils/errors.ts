/**
 * Extracts a readable message from an unknown error value.
 * Use in route catch blocks: `reply.code(400).send({ error: toErrorMessage(err) })`
 */
export function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}
