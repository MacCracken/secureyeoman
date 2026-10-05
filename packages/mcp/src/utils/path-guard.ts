/**
 * Path containment checks shared by the filesystem and git tools.
 *
 * A plain `startsWith` prefix test would also admit siblings that share a
 * string prefix (`/data-secrets` for an allowed `/data`), so containment is
 * decided on path segments instead.
 */

import * as path from 'node:path';

/** Whether `candidate` is `root` itself or lies below it. */
export function isWithin(root: string, candidate: string): boolean {
  const rel = path.relative(path.resolve(root), path.resolve(candidate));
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

/** Whether `candidate` lies within any of `roots` (none configured: no). */
export function isAllowedPath(candidate: string, roots: readonly string[]): boolean {
  return roots.some((root) => isWithin(root, candidate));
}
