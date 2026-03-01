# API Gateway Mode Guide (Phase 80)

API Gateway mode lets external applications use SecureYeoman's chat pipeline via authenticated REST calls, without direct LLM credentials or admin privileges.

## Creating a Gateway Key

### Via Dashboard
1. Open **Developers → Gateway Analytics**
2. Click **Create Gateway Key**
3. Fill in:
   - **Name**: descriptive label (e.g. "Mobile App Production")
   - **Personality** (optional): bind to a specific personality
   - **RPM Limit** (optional): max requests per minute
   - **TPD Limit** (optional): max tokens per day
4. Copy the raw key — it will only be shown once

### Via API
```bash
curl -X POST https://your-instance.example.com/api/v1/auth/api-keys \
  -H "Authorization: Bearer <admin-jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Mobile App Production",
    "role": "operator",
    "personalityId": "personality-uuid",
    "rateLimitRpm": 60,
    "rateLimitTpd": 100000,
    "isGatewayKey": true
  }'
```

## Using the Gateway Endpoint

```bash
curl -X POST https://your-instance.example.com/api/v1/gateway \
  -H "x-api-key: sck_..." \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What is our deployment process?",
    "conversationId": "optional-conv-id"
  }'
```

The response is identical to `/api/v1/chat`. If the key has a bound personality, it overrides any `personalityId` in the request body.

## Rate Limiting

| Limit | Behavior |
|-------|----------|
| RPM exceeded | `429 Too Many Requests` + `Retry-After: 60` header |
| TPD exceeded | `429 Too Many Requests` — "Daily token quota exhausted" |
| No limit set | Unlimited (inherits system defaults) |

## Viewing Usage

### Dashboard
**Developers → Gateway Analytics** shows:
- 24h KPIs: total requests, tokens, errors, average p95 latency
- Per-key table with expandable usage rows
- CSV export

### API
```bash
# Per-key usage rows (with optional time range)
curl -H "Authorization: Bearer <jwt>" \
  "https://your-instance.example.com/api/v1/auth/api-keys/<keyId>/usage?from=1706745600000"

# Aggregate summary for all keys
curl -H "Authorization: Bearer <jwt>" \
  "https://your-instance.example.com/api/v1/auth/api-keys/usage/summary"

# CSV export
curl -H "Authorization: Bearer <jwt>" \
  "https://your-instance.example.com/api/v1/auth/api-keys/usage/summary?format=csv" \
  -o usage.csv
```

## Best Practices

- Set RPM limits to prevent runaway automation
- Use TPD limits when exposing the gateway to end-users to cap AI costs
- Bind gateway keys to specific personalities to ensure consistent behaviour
- Rotate keys regularly using the revoke + create flow
- Monitor the Gateway Analytics tab for anomalous usage patterns
