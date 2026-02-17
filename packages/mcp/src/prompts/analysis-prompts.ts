/**
 * Analysis Prompts — secureyeoman:analyze-code, secureyeoman:review-security
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerAnalysisPrompts(server: McpServer): void {
  server.prompt(
    'secureyeoman:analyze-code',
    'Code analysis with security focus',
    {
      code: z.string().describe('Code to analyze'),
      language: z.string().describe('Programming language'),
    },
    async (args) => {
      const template = `# Code Analysis Request

## Language
${args.language}

## Code
\`\`\`${args.language}
${args.code}
\`\`\`

## Analysis Checklist
Please analyze the code for:
1. **Security vulnerabilities** — injection, XSS, SSRF, path traversal, etc.
2. **Logic errors** — off-by-one, race conditions, null dereferences
3. **Performance** — inefficient algorithms, unnecessary allocations
4. **Best practices** — naming, structure, error handling
5. **Recommendations** — specific improvements with code examples`;

      return {
        messages: [
          {
            role: 'user' as const,
            content: { type: 'text' as const, text: template },
          },
        ],
      };
    }
  );

  server.prompt(
    'secureyeoman:review-security',
    'Security review checklist',
    {
      target: z.string().describe('What to review (e.g., API endpoint, module, config)'),
      scope: z.string().optional().describe('Scope of the review'),
    },
    async (args) => {
      const scopeSection = args.scope ? `\n## Scope\n${args.scope}` : '';

      const template = `# Security Review: ${args.target}
${scopeSection}

## Review Checklist
1. **Authentication** — Are all endpoints properly authenticated?
2. **Authorization** — Is RBAC enforced? Are permissions correct?
3. **Input Validation** — Are all inputs validated and sanitized?
4. **Output Encoding** — Are outputs properly encoded to prevent XSS?
5. **Data Exposure** — Are secrets, tokens, or PII protected?
6. **Error Handling** — Do errors leak internal details?
7. **Rate Limiting** — Are endpoints protected against abuse?
8. **Logging** — Are security events properly logged?
9. **Dependencies** — Are there known vulnerabilities in dependencies?
10. **Configuration** — Are defaults secure? Is sensitive config protected?

## Output Format
For each finding:
- **Severity**: Critical / High / Medium / Low / Info
- **Location**: File and line reference
- **Description**: What the issue is
- **Recommendation**: How to fix it`;

      return {
        messages: [
          {
            role: 'user' as const,
            content: { type: 'text' as const, text: template },
          },
        ],
      };
    }
  );
}
