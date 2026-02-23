/**
 * MCP QuickBooks Command — Manage the QuickBooks Online MCP toolset.
 *
 * Subcommands:
 *   status   Show whether QBO tools are enabled and check credential completeness
 *   enable   Print the environment variable needed to enable QBO tools
 *   disable  Print the environment variable needed to disable QBO tools
 */

import type { Command, CommandContext } from '../router.js';

const QBO_CREDENTIALS = [
  'QUICKBOOKS_CLIENT_ID',
  'QUICKBOOKS_CLIENT_SECRET',
  'QUICKBOOKS_REALM_ID',
  'QUICKBOOKS_REFRESH_TOKEN',
] as const;

function checkCredentials(): { key: string; present: boolean }[] {
  return QBO_CREDENTIALS.map((key) => ({
    key,
    present: Boolean(process.env[key]),
  }));
}

export const mcpQuickbooksCommand: Command = {
  name: 'mcp-quickbooks',
  aliases: ['mcp-qbo'],
  description: 'Manage the QuickBooks Online MCP toolset (status, enable, disable)',
  usage: 'secureyeoman mcp-quickbooks <status|enable|disable>',

  async run(ctx: CommandContext): Promise<number> {
    const argv = ctx.argv;
    const subcommand = argv[0];

    if (!subcommand || subcommand === '--help' || subcommand === '-h') {
      ctx.stdout.write(`
Usage: ${this.usage}

Subcommands:
  status   Show whether the QuickBooks MCP toolset is enabled and credentials are configured
  enable   Print the environment variable to add to your .env file to enable QBO tools
  disable  Print the environment variable to add to your .env file to disable QBO tools

Required environment variables for QBO tools to function:
  MCP_EXPOSE_QUICKBOOKS_TOOLS=true
  QUICKBOOKS_CLIENT_ID=<your OAuth client ID>
  QUICKBOOKS_CLIENT_SECRET=<your OAuth client secret>
  QUICKBOOKS_REALM_ID=<your QuickBooks company ID>
  QUICKBOOKS_REFRESH_TOKEN=<your OAuth refresh token>
  QUICKBOOKS_ENVIRONMENT=sandbox|production  (default: sandbox)

Tools available when enabled (prefix: qbo_):
  qbo_health, qbo_get_company_info
  qbo_report_profit_loss, qbo_report_balance_sheet
  qbo_{create,get,search,update,delete}_{account,bill,bill_payment,customer,employee,
    estimate,invoice,item,journal_entry,purchase,vendor}
`);
      return 0;
    }

    if (subcommand === 'status') {
      const enabled = process.env.MCP_EXPOSE_QUICKBOOKS_TOOLS === 'true';
      const environment = process.env.QUICKBOOKS_ENVIRONMENT ?? 'sandbox';
      const creds = checkCredentials();
      const missingCreds = creds.filter((c) => !c.present);

      ctx.stdout.write('\nQuickBooks MCP Toolset Status\n');
      ctx.stdout.write('─'.repeat(32) + '\n');
      ctx.stdout.write(`  MCP_EXPOSE_QUICKBOOKS_TOOLS=${enabled ? 'true' : '(not set)'}\n`);
      ctx.stdout.write(`  QUICKBOOKS_ENVIRONMENT=${environment}\n\n`);

      ctx.stdout.write('Credentials:\n');
      for (const { key, present } of creds) {
        ctx.stdout.write(`  ${present ? '✓' : '✗'} ${key}${present ? '=[set]' : '=(not set)'}\n`);
      }

      if (missingCreds.length > 0) {
        ctx.stdout.write('\nMissing credentials — QBO tools will return auth errors:\n');
        for (const { key } of missingCreds) {
          ctx.stdout.write(`  ${key}\n`);
        }
      } else if (enabled) {
        ctx.stdout.write('\nAll credentials present. QBO tools are ready.\n');
      } else {
        ctx.stdout.write('\nCredentials are configured but tools are disabled.\n');
        ctx.stdout.write("Run 'secureyeoman mcp-quickbooks enable' for instructions.\n");
      }

      ctx.stdout.write('\n');
      return missingCreds.length > 0 && enabled ? 1 : 0;
    }

    if (subcommand === 'enable') {
      ctx.stdout.write('\nTo enable QuickBooks MCP tools, add this to your .env file:\n\n');
      ctx.stdout.write('  MCP_EXPOSE_QUICKBOOKS_TOOLS=true\n\n');
      ctx.stdout.write('Also ensure the following credentials are set:\n\n');
      for (const key of QBO_CREDENTIALS) {
        ctx.stdout.write(`  ${key}=<your value>\n`);
      }
      ctx.stdout.write('  QUICKBOOKS_ENVIRONMENT=sandbox   # or: production\n\n');
      ctx.stdout.write(
        'Restart the SecureYeoman server and MCP service after updating .env.\n'
      );
      ctx.stdout.write(
        "Run 'secureyeoman mcp-quickbooks status' to verify once restarted.\n\n"
      );
      return 0;
    }

    if (subcommand === 'disable') {
      ctx.stdout.write('\nTo disable QuickBooks MCP tools, set this in your .env file:\n\n');
      ctx.stdout.write('  MCP_EXPOSE_QUICKBOOKS_TOOLS=false\n\n');
      ctx.stdout.write('Or remove the MCP_EXPOSE_QUICKBOOKS_TOOLS line entirely.\n\n');
      ctx.stdout.write(
        'Restart the SecureYeoman server and MCP service after updating .env.\n\n'
      );
      return 0;
    }

    ctx.stderr.write(`Unknown subcommand: ${subcommand}\n`);
    ctx.stderr.write(`Run 'secureyeoman mcp-quickbooks --help' for usage.\n`);
    return 1;
  },
};
