# ADR 053: Platform-Specific Integration Enhancements

**Status**: Accepted
**Date**: 2026-02-18
**Phase**: 16 — Integration Expansion II

---

## Context

The four primary messaging adapters (Telegram, Discord, Slack, GitHub) handled basic inbound/outbound messaging but lacked the richer, platform-native interaction patterns that users and bots are expected to support:

- **Telegram** — Inline keyboards (button taps via `callback_query`) and file/document attachments were not normalised into `UnifiedMessage`.
- **Discord** — The adapter used the discord.js v13 API (`Intents.FLAGS`, `MessageEmbed`, `addField`). No slash command registration, thread awareness, or modal dialogs.
- **Slack** — Block Kit button interactions, modal dialogs, and Workflow Builder steps were missing.
- **GitHub** — PR review events (`pull_request_review`, `pull_request_review_comment`) were not handled. No auto-labeling, code-search triggering, or PR review creation via `sendMessage`.

The test mocks for Discord already imported v14 symbols (`REST`, `Routes`, `GatewayIntentBits`, `EmbedBuilder`) — confirming that the codebase expected a v14-style adapter.

---

## Decision

Add platform-native interaction patterns to all four adapters using **only the SDKs already installed** (`grammy`, `discord.js ^14`, `@slack/bolt`, `@octokit/rest`). No new npm dependencies are required.

All new inbound interactions are normalised to `UnifiedMessage` using the existing `metadata` pass-through field for platform-specific context. All new outbound capabilities are activated by passing recognised keys in `sendMessage(chatId, text, metadata)`.

---

## Changes

### Telegram (`grammy`)

| Feature | Mechanism |
|---|---|
| Inline keyboard button taps | `bot.on('callback_query:data', ...)` → normalised to `UnifiedMessage`; `metadata.callbackData`, `metadata.callbackQueryId` |
| File/document attachments | `bot.on('message:document', ...)` → attachment with `type: 'file'`, `metadata.fileId` |
| Send with reply markup | `sendMessage(chatId, text, { replyMarkup: InlineKeyboard })` → `reply_markup` forwarded to grammy |

### Discord (`discord.js v14`)

| Feature | Mechanism |
|---|---|
| v14 API upgrade | `Intents.FLAGS` → `GatewayIntentBits`; `MessageEmbed` → `EmbedBuilder`; `.addField()` → `.addFields()` |
| `MessageContent` intent | Required by discord.js v14 to read message content in guilds |
| Slash command registration | `client.once('ready', ...)` → `REST.put(applicationGuildCommands | applicationCommands)` |
| `/feedback` command | Opens a `ModalBuilder` with a `TextInputBuilder` paragraph field |
| Modal submission | `interaction.isModalSubmit()` branch → normalised to `UnifiedMessage` with `metadata.isModalSubmit` |
| Thread awareness | `ChannelType.PublicThread / PrivateThread` detection → `metadata.isThread`, `metadata.threadId` |
| Thread send | `sendMessage(chatId, text, { threadId })` → fetches thread channel by ID |
| Start thread | `sendMessage(chatId, text, { startThread: 'name' })` → calls `sent.startThread(...)` |

**Rationale for REST registration on `ready`**: guild-scoped commands propagate instantly; global commands take ~1 hour. The `ready` event fires once after `client.login()` succeeds, making it the correct place to register without blocking `init()`.

### Slack (`@slack/bolt`)

| Feature | Mechanism |
|---|---|
| Block Kit button actions | `app.action({ type: 'button' }, ...)` → normalised with `metadata.isBlockAction`, `actionId`, `blockId`, `value` |
| Blocks in sendMessage | `sendMessage(chatId, text, { blocks: [...] })` → passed to `chat.postMessage` |
| `/friday-modal` command | Opens a modal via `client.views.open` with a `plain_text_input` for task entry |
| Modal submission | `app.view('friday_modal', ...)` → normalised with `metadata.isModalSubmit`, `metadata.modalCallbackId` |
| Workflow Builder step | `WorkflowStep('friday_process', { edit, save, execute })` → `execute` normalises `step.inputs.task` as `UnifiedMessage` with `metadata.isWorkflowStep` |

### GitHub (`@octokit/rest`)

| Feature | Mechanism |
|---|---|
| PR review events | `webhooks.on('pull_request_review', ...)` → `metadata.event`, `reviewState`, `reviewId`, `prNumber` |
| PR review comment events | `webhooks.on('pull_request_review_comment', ...)` → `metadata.path`, `line`, `prNumber` |
| Issue auto-labeling | On `issues.opened`, reads `config.config.autoLabelKeywords: Record<string, string[]>` and calls `octokit.issues.addLabels` for keyword matches |
| Code search trigger | In `issue_comment`, if body matches `/^@friday\s+search:/i` → `metadata.isCodeSearchTrigger = true`, `metadata.searchQuery` |
| PR review creation | `sendMessage(chatId, text, { reviewEvent: 'APPROVE' | 'COMMENT' | 'REQUEST_CHANGES' })` on a `pulls/N` chatId → calls `octokit.pulls.createReview` instead of `issues.createComment` |

---

## Extension Mechanism

The `metadata` field in `UnifiedMessage` is the approved pass-through for all platform-specific context. This keeps the core `UnifiedMessage` schema stable while allowing adapters to surface arbitrarily rich platform data. Downstream consumers (skills, agents, routers) opt-in to platform-specific metadata by checking for known keys.

The `sendMessage(chatId, text, metadata?)` signature is the approved extension mechanism for outbound platform-specific capabilities. Adapters inspect known metadata keys and activate the corresponding platform API.

---

## Alternatives Considered

**Extend `UnifiedMessage` schema with new typed fields** — Rejected. Adding `callbackData`, `blockAction`, `reviewState` etc. to the shared type would bloat the interface and couple all adapters to each other's domain model.

**New platform-specific send methods** — Rejected. A single `sendMessage` with metadata keeps the `Integration` interface minimal and avoids interface proliferation.

**New npm packages** — Not required. All capabilities (grammy `callback_query`, discord.js v14 modals, @slack/bolt `WorkflowStep`, @octokit/rest `pulls.createReview`) are already available in the installed SDK versions.

---

## Consequences

- All four adapters now expose a significantly richer interaction surface with zero new runtime dependencies.
- The `metadata` pattern is established as the canonical extension point for future platform-specific features.
- Discord is now fully on the v14 API; any future discord.js upgrades start from a clean baseline.
- Slack's Workflow Builder integration allows the agent to participate in enterprise automation pipelines without additional infrastructure.
- GitHub's auto-labeling and code search triggers enable issue triage and repository intelligence workflows with minimal configuration.
