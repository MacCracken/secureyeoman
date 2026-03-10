/**
 * QuickBooks Online (QBO) Tools — accounting and business operations via the Intuit QBO REST API v3.
 *
 * Covers the full CRUD lifecycle for 11 core entities:
 * Account, Bill, BillPayment, Customer, Employee, Estimate, Invoice,
 * Item, JournalEntry, Purchase, Vendor.
 *
 * ## Enable
 *   MCP_EXPOSE_QUICKBOOKS_TOOLS=true
 *
 * ## Required credentials
 *   QUICKBOOKS_CLIENT_ID       – Intuit app Client ID
 *   QUICKBOOKS_CLIENT_SECRET   – Intuit app Client Secret
 *   QUICKBOOKS_REALM_ID        – Company/Realm ID (shown in QBO URL after "company/")
 *   QUICKBOOKS_REFRESH_TOKEN   – OAuth 2.0 refresh token
 *                                 (obtain via https://developer.intuit.com/app/developer/playground)
 *   QUICKBOOKS_ENVIRONMENT     – "sandbox" (default) or "production"
 *
 * Access tokens are refreshed automatically and cached in memory for their 3600 s lifetime.
 * Refresh tokens are valid for 100 days — rotate before expiry.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import type { ToolMiddleware } from './index.js';
import { wrapToolHandler, jsonResponse, errorResponse } from './tool-utils.js';

// ─── Auth ─────────────────────────────────────────────────────────────────────

const QBO_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

const QBO_BASE_URL: Record<string, string> = {
  sandbox: 'https://sandbox-quickbooks.api.intuit.com',
  production: 'https://quickbooks.api.intuit.com',
};

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

let _tokenCache: TokenCache | null = null;

async function getAccessToken(config: McpServiceConfig): Promise<string> {
  if (_tokenCache && _tokenCache.expiresAt > Date.now() + 60_000) {
    return _tokenCache.accessToken;
  }
  if (
    !config.quickBooksClientId ||
    !config.quickBooksClientSecret ||
    !config.quickBooksRefreshToken
  ) {
    throw new Error(
      'QuickBooks not configured. Set QUICKBOOKS_CLIENT_ID, QUICKBOOKS_CLIENT_SECRET, ' +
        'and QUICKBOOKS_REFRESH_TOKEN. Obtain a refresh token at ' +
        'https://developer.intuit.com/app/developer/playground'
    );
  }
  const credentials = Buffer.from(
    `${config.quickBooksClientId}:${config.quickBooksClientSecret}`
  ).toString('base64');
  const res = await fetch(QBO_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: config.quickBooksRefreshToken,
    }).toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`QuickBooks token refresh failed (HTTP ${res.status}): ${text}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  _tokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return _tokenCache.accessToken;
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

async function qboFetch(
  config: McpServiceConfig,
  path: string,
  options: RequestInit = {}
): Promise<unknown> {
  const accessToken = await getAccessToken(config);
  const env = config.quickBooksEnvironment ?? 'sandbox';
  const base = QBO_BASE_URL[env] ?? QBO_BASE_URL.sandbox;
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> | undefined),
    },
  });
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Error(`QuickBooks API returned non-JSON (HTTP ${res.status})`);
  }
  if (!res.ok) {
    const fault = (body as { Fault?: { Error?: { Message?: string; Detail?: string }[] } })?.Fault
      ?.Error?.[0];
    const msg = fault ? `${fault.Message ?? ''}: ${fault.Detail ?? ''}` : `HTTP ${res.status}`;
    throw new Error(`QuickBooks API error: ${msg}`);
  }
  return body;
}

function companyPath(realmId: string, endpoint: string, qs = ''): string {
  const base = `/v3/company/${realmId}/${endpoint}?minorversion=73`;
  return qs ? `${base}&${qs}` : base;
}

// txt is an alias for jsonResponse — kept to minimize churn in entity tool registrations
const txt = jsonResponse;

// ─── Shared schemas ───────────────────────────────────────────────────────────

const idSchema = z.string().min(1).describe('Entity ID');
const syncTokenSchema = z
  .string()
  .min(1)
  .describe(
    'SyncToken from a previous get/search response — required to prevent lost-update conflicts'
  );
const bodySchema = z
  .string()
  .min(1)
  .describe(
    'JSON string of the entity fields to set. See the Intuit QBO REST API reference for available fields.'
  );
const querySchema = z
  .string()
  .max(1000)
  .optional()
  .describe(
    'SQL-like WHERE clause, e.g. "Active = true AND Balance > \'0.00\'". ' +
      'Leave empty to return all records.'
  );
const limitSchema = z
  .number()
  .int()
  .min(1)
  .max(1000)
  .default(100)
  .describe('Maximum records to return (1–1000, default 100)');
const offsetSchema = z
  .number()
  .int()
  .min(1)
  .default(1)
  .describe('1-based start position for pagination (default 1)');

// ─── Per-entity tool registration ─────────────────────────────────────────────

interface EntityConfig {
  /** QBO entity name (PascalCase, e.g. "Invoice") */
  entity: string;
  /** Human-readable plural (e.g. "invoices") */
  plural: string;
  /** Whether QBO supports hard-delete (POST ?operation=delete) for this entity */
  deletable: boolean;
  /** Brief one-line description for tool descriptions */
  blurb: string;
}

const ENTITIES: EntityConfig[] = [
  {
    entity: 'Account',
    plural: 'accounts',
    deletable: false,
    blurb: 'chart-of-accounts entry (asset, liability, equity, income, or expense)',
  },
  {
    entity: 'Bill',
    plural: 'bills',
    deletable: true,
    blurb: 'vendor bill (accounts-payable transaction)',
  },
  {
    entity: 'BillPayment',
    plural: 'bill payments',
    deletable: true,
    blurb: 'payment applied to one or more vendor bills',
  },
  { entity: 'Customer', plural: 'customers', deletable: false, blurb: 'customer or client record' },
  {
    entity: 'Employee',
    plural: 'employees',
    deletable: false,
    blurb: 'employee record (used in payroll and time-tracking)',
  },
  {
    entity: 'Estimate',
    plural: 'estimates',
    deletable: true,
    blurb: 'sales estimate / quote that can be converted to an invoice',
  },
  {
    entity: 'Invoice',
    plural: 'invoices',
    deletable: true,
    blurb: 'accounts-receivable invoice sent to a customer',
  },
  {
    entity: 'Item',
    plural: 'items',
    deletable: false,
    blurb: 'product or service item (used on invoices, bills, and estimates)',
  },
  {
    entity: 'JournalEntry',
    plural: 'journal entries',
    deletable: true,
    blurb: 'manual double-entry accounting journal entry',
  },
  {
    entity: 'Purchase',
    plural: 'purchases',
    deletable: true,
    blurb: 'expense or purchase (cash, credit card, or check)',
  },
  { entity: 'Vendor', plural: 'vendors', deletable: false, blurb: 'vendor / supplier record' },
];

function registerEntityTools(
  server: McpServer,
  ec: EntityConfig,
  config: McpServiceConfig,
  middleware: ToolMiddleware
): void {
  const e = ec.entity;
  const eLower = e.toLowerCase();
  const realmId = config.quickBooksRealmId!;

  // ── Create ──────────────────────────────────────────────────────────────────
  server.registerTool(
    `qbo_create_${eLower}`,
    {
      description:
        `Create a new QuickBooks ${ec.blurb}. ` +
        `Pass the entity fields as a JSON string in the body parameter. ` +
        `Returns the created ${e} with its Id and SyncToken.`,
      inputSchema: { body: bodySchema },
    },
    wrapToolHandler(`qbo_create_${eLower}`, middleware, async (args: { body: string }) => {
      const payload = JSON.parse(args.body) as unknown;
      const result = await qboFetch(config, companyPath(realmId, eLower), {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      return txt(result);
    })
  );

  // ── Get ─────────────────────────────────────────────────────────────────────
  server.registerTool(
    `qbo_get_${eLower}`,
    {
      description:
        `Retrieve a single QuickBooks ${ec.blurb} by its Id. ` +
        `Returns the full entity including SyncToken (needed for updates).`,
      inputSchema: { id: idSchema },
    },
    wrapToolHandler(`qbo_get_${eLower}`, middleware, async (args: { id: string }) => {
      const result = await qboFetch(config, companyPath(realmId, `${eLower}/${args.id}`));
      return txt(result);
    })
  );

  // ── Search ──────────────────────────────────────────────────────────────────
  server.registerTool(
    `qbo_search_${eLower}`,
    {
      description:
        `Search QuickBooks ${ec.plural} using a SQL-like WHERE clause. ` +
        `Examples: "Active = true", "Balance > '0.00'", "DisplayName LIKE '%Acme%'". ` +
        `Returns up to limit records starting at offset.`,
      inputSchema: {
        where: querySchema,
        limit: limitSchema,
        offset: offsetSchema,
      },
    },
    wrapToolHandler(
      `qbo_search_${eLower}`,
      middleware,
      async (args: { where?: string; limit: number; offset: number }) => {
        const where = args.where ? ` WHERE ${args.where}` : '';
        const sql = `SELECT * FROM ${e}${where} STARTPOSITION ${args.offset} MAXRESULTS ${args.limit}`;
        const result = await qboFetch(
          config,
          companyPath(realmId, 'query', `query=${encodeURIComponent(sql)}`)
        );
        return txt(result);
      }
    )
  );

  // ── Update ──────────────────────────────────────────────────────────────────
  server.registerTool(
    `qbo_update_${eLower}`,
    {
      description:
        `Update an existing QuickBooks ${ec.blurb}. ` +
        `Include the entity's Id and SyncToken in the body along with changed fields. ` +
        `Use sparse update by setting "sparse": true to only send modified fields.`,
      inputSchema: {
        id: idSchema,
        sync_token: syncTokenSchema,
        body: bodySchema,
      },
    },
    wrapToolHandler(
      `qbo_update_${eLower}`,
      middleware,
      async (args: { id: string; sync_token: string; body: string }) => {
        const payload = {
          ...(JSON.parse(args.body) as Record<string, unknown>),
          Id: args.id,
          SyncToken: args.sync_token,
        };
        const result = await qboFetch(config, companyPath(realmId, eLower), {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        return txt(result);
      }
    )
  );

  // ── Delete (only for supported entities) ────────────────────────────────────
  if (ec.deletable) {
    server.registerTool(
      `qbo_delete_${eLower}`,
      {
        description:
          `Delete (void) a QuickBooks ${ec.blurb}. ` +
          `Requires the entity's current Id and SyncToken. ` +
          `This operation is irreversible — confirm before calling.`,
        inputSchema: {
          id: idSchema,
          sync_token: syncTokenSchema,
        },
      },
      wrapToolHandler(
        `qbo_delete_${eLower}`,
        middleware,
        async (args: { id: string; sync_token: string }) => {
          const result = await qboFetch(config, companyPath(realmId, eLower, 'operation=delete'), {
            method: 'POST',
            body: JSON.stringify({ Id: args.id, SyncToken: args.sync_token }),
          });
          return txt(result);
        }
      )
    );
  }
}

// ─── Public registration function ─────────────────────────────────────────────

export function registerQuickBooksTools(
  server: McpServer,
  config: McpServiceConfig,
  middleware: ToolMiddleware
): void {
  // ── Health / connectivity check ──────────────────────────────────────────────
  server.registerTool(
    'qbo_health',
    {
      description:
        'Check QuickBooks Online connectivity and credential validity. ' +
        'Returns the QBO company name and fiscal year start month. ' +
        'Call this first to verify configuration before using other qbo_* tools.',
      inputSchema: {},
    },
    wrapToolHandler('qbo_health', middleware, async () => {
      if (!config.exposeQuickBooksTools) {
        return errorResponse(
          'QuickBooks tools are disabled. Set MCP_EXPOSE_QUICKBOOKS_TOOLS=true to enable.'
        );
      }
      if (!config.quickBooksRealmId) {
        return errorResponse(
          'QUICKBOOKS_REALM_ID is not set. Find your Realm ID in the QBO URL: intuit.com/app/qbo/company/{realmId}/...'
        );
      }
      const result = await qboFetch(
        config,
        companyPath(config.quickBooksRealmId, 'companyinfo/' + config.quickBooksRealmId)
      );
      return txt(result);
    })
  );

  if (!config.exposeQuickBooksTools) {
    // Register disabled stubs for all entity tools so MCP clients can discover them
    for (const ec of ENTITIES) {
      const eLower = ec.entity.toLowerCase();
      const disabledHandler = wrapToolHandler(`qbo_${eLower}_disabled`, middleware, async () =>
        errorResponse(
          'QuickBooks tools are disabled. Set MCP_EXPOSE_QUICKBOOKS_TOOLS=true and provide credentials.'
        )
      );
      for (const op of ['create', 'get', 'search', 'update', ...(ec.deletable ? ['delete'] : [])]) {
        server.registerTool(
          `qbo_${op}_${eLower}`,
          {
            description: `[Disabled] ${op} QuickBooks ${ec.blurb}. Enable with MCP_EXPOSE_QUICKBOOKS_TOOLS=true.`,
            inputSchema: {},
          },
          disabledHandler
        );
      }
    }
    return;
  }

  // ── Register all entity tools ─────────────────────────────────────────────
  for (const ec of ENTITIES) {
    registerEntityTools(server, ec, config, middleware);
  }

  // ── Company Info ─────────────────────────────────────────────────────────────
  server.registerTool(
    'qbo_get_company_info',
    {
      description:
        'Retrieve QuickBooks company settings: name, address, phone, email, industry, ' +
        'fiscal year start, and country code.',
      inputSchema: {},
    },
    wrapToolHandler('qbo_get_company_info', middleware, async () => {
      const realmId = config.quickBooksRealmId!;
      const result = await qboFetch(config, companyPath(realmId, 'companyinfo/' + realmId));
      return txt(result);
    })
  );

  // ── Profit & Loss report ──────────────────────────────────────────────────────
  server.registerTool(
    'qbo_report_profit_loss',
    {
      description:
        'Generate a Profit & Loss report for the specified date range. ' +
        'Returns income, cost of goods, gross profit, expenses, and net income.',
      inputSchema: {
        start_date: z.string().describe('Report start date in YYYY-MM-DD format'),
        end_date: z.string().describe('Report end date in YYYY-MM-DD format'),
        accounting_method: z
          .enum(['Cash', 'Accrual'])
          .default('Accrual')
          .describe('Accounting method for the report'),
      },
    },
    wrapToolHandler(
      'qbo_report_profit_loss',
      middleware,
      async (args: { start_date: string; end_date: string; accounting_method: string }) => {
        const qs = `start_date=${args.start_date}&end_date=${args.end_date}&accounting_method=${args.accounting_method}`;
        const result = await qboFetch(
          config,
          companyPath(config.quickBooksRealmId!, 'reports/ProfitAndLoss', qs)
        );
        return txt(result);
      }
    )
  );

  // ── Balance Sheet report ──────────────────────────────────────────────────────
  server.registerTool(
    'qbo_report_balance_sheet',
    {
      description:
        'Generate a Balance Sheet report as of the specified date. ' +
        'Returns assets, liabilities, and equity.',
      inputSchema: {
        as_of_date: z.string().describe('Report as-of date in YYYY-MM-DD format'),
        accounting_method: z
          .enum(['Cash', 'Accrual'])
          .default('Accrual')
          .describe('Accounting method for the report'),
      },
    },
    wrapToolHandler(
      'qbo_report_balance_sheet',
      middleware,
      async (args: { as_of_date: string; accounting_method: string }) => {
        const qs = `start_date=${args.as_of_date}&end_date=${args.as_of_date}&accounting_method=${args.accounting_method}`;
        const result = await qboFetch(
          config,
          companyPath(config.quickBooksRealmId!, 'reports/BalanceSheet', qs)
        );
        return txt(result);
      }
    )
  );
}
