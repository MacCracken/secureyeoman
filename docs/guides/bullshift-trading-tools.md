# BullShift Trading Tools — MCP Integration Guide

SecureYeoman's MCP service exposes 5 tools that connect to a
[BullShift](https://github.com/MacCracken/bullshift) REST API server, letting
any MCP client (Claude Desktop, SecureYeoman agents, your own scripts) query
positions and submit trades through natural language or tool calls.

> **WARNING:** Setting `ALPACA_SANDBOX=false` executes real money trades. Always test in sandbox mode first.

---

## Prerequisites

- BullShift repo cloned and Rust toolchain installed (`rustup`, stable channel)
- An Alpaca Markets account ([paper](https://app.alpaca.markets/paper/dashboard/overview)
  is fine for testing)
- SecureYeoman MCP service running

---

## Step 1 — Build and start the BullShift API server

```bash
cd /path/to/bullshift/rust

# Build the standalone API server binary
cargo build --bin api_server --release

# Start with Alpaca paper-trading credentials (sandbox = true by default)
ALPACA_API_KEY=your_key \
ALPACA_API_SECRET=your_secret \
ALPACA_SANDBOX=true \
BULLSHIFT_PORT=8787 \
./target/release/api_server
```

The server will log:
```
INFO  bullshift_core::api_server > BullShift API server listening on 0.0.0.0:8787
```

### Environment variables

| Variable            | Default   | Description                                     |
|---------------------|-----------|-------------------------------------------------|
| `ALPACA_API_KEY`    | required  | Alpaca API key ID                               |
| `ALPACA_API_SECRET` | required  | Alpaca API secret key                           |
| `ALPACA_SANDBOX`    | `true`    | Set to `false` to trade against live markets    |
| `BULLSHIFT_PORT`    | `8787`    | TCP port                                        |

---

## Step 2 — Configure SecureYeoman MCP

Set `BULLSHIFT_API_URL` in your MCP environment (`.env` or shell):

```env
BULLSHIFT_API_URL=http://localhost:8787
```

If omitted, the tools default to `http://localhost:8787`.

Restart the SecureYeoman MCP service after setting the variable.

---

## Step 3 — Available tools

| Tool                       | What it does                                     |
|----------------------------|--------------------------------------------------|
| `bullshift_health`         | Verify the API server is reachable               |
| `bullshift_get_account`    | Total balance, available funds, margin used      |
| `bullshift_get_positions`  | All open positions with entry price and P&L      |
| `bullshift_submit_order`   | Place a market, limit, stop, or stop-limit order |
| `bullshift_cancel_order`   | Cancel an open order by ID                       |

### Example prompts (Claude Desktop / SecureYeoman chat)

```
What's my current account balance?
→ calls bullshift_get_account

Show me all my open positions.
→ calls bullshift_get_positions

Buy 10 shares of AAPL at market price.
→ calls bullshift_submit_order { symbol: "AAPL", side: "buy", quantity: 10, order_type: "market" }

Place a limit order to sell 5 shares of TSLA at $250.
→ calls bullshift_submit_order { symbol: "TSLA", side: "sell", quantity: 5, order_type: "limit", price: 250 }

Cancel order abc-123.
→ calls bullshift_cancel_order { order_id: "abc-123" }
```

---

## Security notes

- `bullshift_submit_order` executes real trades when `ALPACA_SANDBOX=false`. The tool
  description includes a confirmation note, but there is no additional confirmation
  prompt — agents that have this tool will act on user intent directly.
- The API server has no authentication layer — run it on localhost only, or behind a
  firewall/VPN if exposing remotely.
- Credentials (`ALPACA_API_KEY`, `ALPACA_API_SECRET`) are never passed through the MCP
  tool layer; they live only in the `api_server` process environment.
- SecureYeoman's secret redactor is applied to all tool outputs.

---

## Troubleshooting

**`Tool "bullshift_health" failed: fetch failed`**
The API server is not running or `BULLSHIFT_API_URL` points to the wrong address.

**`BullShift API error: HTTP 400`**
Order validation failed (e.g. missing `price` for a limit order, invalid symbol).

**`BullShift API error: Order submission failed: 403`**
Alpaca credentials are invalid or the account is restricted.

---

## Roadmap

The following integration paths are planned but not yet implemented:

- **SecureYeoman as AI provider in BullShift** (2026.5.x) — BearlyManaged will call
  SecureYeoman's `/api/v1/chat` for strategy generation.
- **Full BullShift integration adapter** (2026.6.x) — event subscriptions, bi-directional
  routing, trade audit via SecureYeoman's cryptographic audit chain.

See [ADR 008 — MCP Server & Tools](../adr/008-mcp-server-and-tools.md) for the full decision record.
