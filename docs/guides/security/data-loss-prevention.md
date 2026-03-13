# Data Loss Prevention (DLP) & Content Classification

SecureYeoman includes a built-in DLP system that classifies content, scans outbound data flows, enforces retention policies, and watermarks AI-generated text.

## Content Classification

Content is classified into four sensitivity levels:

| Level | Rank | Description |
|-------|------|-------------|
| `public` | 0 | No restrictions. Safe for external sharing. |
| `internal` | 1 | Default level. Internal use only. |
| `confidential` | 2 | Contains PII, trade secrets, or proprietary info. |
| `restricted` | 3 | Highest sensitivity. Regulatory or classified content. |

### How Classification Works

The classification engine uses three detection layers:

1. **PII Detection** — Regex patterns for email, phone, SSN, credit card, IP addresses. PII triggers `confidential` by default (configurable via `piiAsConfidential`).

2. **Keyword Matching** — Case-insensitive keyword lists per level. Default keywords:
   - `restricted`: "top secret", "classified", "restricted", "secret clearance"
   - `confidential`: "confidential", "proprietary", "trade secret", "internal only"

3. **Custom Patterns** — User-defined regex patterns with explicit level assignments.

The highest triggered level wins.

### Configuration

```yaml
security:
  dlp:
    enabled: true
    classification:
      enabled: true
      defaultLevel: internal
      piiAsConfidential: true
      autoClassifyOnIngest: true
      keywords:
        restricted:
          - "top secret"
          - "classified"
        confidential:
          - "confidential"
          - "proprietary"
```

### REST API

```bash
# Classify text
POST /api/v1/security/dlp/classify
{ "text": "Contact alice@example.com", "contentId": "msg-1", "contentType": "message" }

# Get classification for content
GET /api/v1/security/dlp/classifications/:contentId?contentType=message

# Manual override
PUT /api/v1/security/dlp/classifications/:contentId
{ "level": "restricted", "contentType": "message" }

# List classifications
GET /api/v1/security/dlp/classifications?level=confidential&limit=50
```

## Outbound DLP Scanning

DLP scanning intercepts outbound data before it leaves the system via:
- Integration messages (Slack, Discord, Teams, etc.)
- Webhook dispatches
- Email sends

### DLP Policies

Policies define what to scan for and what action to take:

```bash
POST /api/v1/security/dlp/policies
{
  "name": "Block PII in external channels",
  "rules": [
    { "type": "pii_type", "value": "ssn" },
    { "type": "pii_type", "value": "credit_card" }
  ],
  "action": "block",
  "classificationLevels": ["confidential", "restricted"],
  "appliesTo": ["slack", "email", "webhook"]
}
```

Actions:
- `block` — Prevents the message from being sent. Returns an error.
- `warn` — Sends the message but logs a warning in the audit trail.
- `log` — Silent audit. Message is sent, event is logged.

## Classification-Aware RBAC

RBAC permissions can reference content classification levels:

```json
{
  "resource": "brain",
  "actions": ["read"],
  "conditions": [
    { "field": "classification", "operator": "lte", "value": "confidential" }
  ]
}
```

This permission allows reading brain entries classified as `public`, `internal`, or `confidential` but denies access to `restricted` content.

## Data Retention

Configure per-content-type retention periods:

```bash
POST /api/v1/security/dlp/retention
{
  "contentType": "conversation",
  "retentionDays": 90,
  "classificationLevel": "public"
}
```

Purge runs automatically at the configured interval (default 24 hours). Use the preview endpoint to see what would be purged:

```bash
POST /api/v1/security/dlp/retention/preview
```

## Egress Monitoring

The egress dashboard shows:
- Outbound data flows by destination type and volume
- Classification level breakdown per destination
- Anomaly alerts (volume spikes, new destinations, restricted content egress)

```bash
GET /api/v1/security/dlp/egress/stats?from=1709600000&to=1709686400
GET /api/v1/security/dlp/egress/anomalies
GET /api/v1/security/dlp/egress/destinations
```

## Watermarking

Invisible watermarks encode provenance metadata in AI-generated text:

```bash
# Embed watermark
POST /api/v1/security/dlp/watermark/embed
{ "text": "AI response text...", "contentId": "msg-1" }

# Extract watermark
POST /api/v1/security/dlp/watermark/extract
{ "text": "Watermarked text..." }

# Detect watermark presence
POST /api/v1/security/dlp/watermark/detect
{ "text": "Possibly watermarked text..." }
```

Algorithms:
- `unicode-steganography` (default) — Zero-width Unicode characters
- `whitespace` — Trailing space encoding
- `homoglyph` — Cyrillic/Latin lookalike substitution

## MCP Tools

When `exposeDlp` is enabled, 6 tools are available:

| Tool | Description |
|------|-------------|
| `dlp_classify` | Classify content, returns level + findings |
| `dlp_scan` | Run DLP scan against policies |
| `dlp_policies` | List/search DLP policies |
| `dlp_egress_stats` | Get egress monitoring stats |
| `dlp_watermark_embed` | Embed invisible watermark |
| `dlp_watermark_extract` | Extract watermark from text |
