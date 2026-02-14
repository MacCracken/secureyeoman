/**
 * stdio Transport — StdioServerTransport for local CLI usage.
 *
 * Activated via `--transport stdio`. Auth via self-minted service JWT.
 * This module is used by cli.ts directly, not by the HTTP server.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

export { StdioServerTransport };

export function createStdioTransport(): StdioServerTransport {
  return new StdioServerTransport();
}
