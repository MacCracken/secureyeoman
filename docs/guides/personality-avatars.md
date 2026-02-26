# Personality Avatars

Each personality can have a custom avatar image displayed in the dashboard — in personality cards, the chat header, the personality picker, and the agents page.

## Uploading an Avatar

1. Go to **Settings → Personalities**.
2. Click **Edit** on any personality.
3. In the **Soul — Essence** section at the top, click **Upload Photo**.
4. Select a JPEG, PNG, GIF, WebP, or SVG file (max **2 MB**).

The avatar is saved immediately — you do not need to click Save.

## Replacing an Avatar

Upload a new image using the same **Upload Photo** button. The previous file is automatically removed.

## Removing an Avatar

Click the **Remove** button that appears below **Upload Photo** when an avatar exists. The personality reverts to the generic user icon.

## Supported Formats

| Format | MIME Type | Notes |
|--------|-----------|-------|
| JPEG | `image/jpeg` | `.jpg` / `.jpeg` |
| PNG | `image/png` | Supports transparency |
| GIF | `image/gif` | Animated GIFs work |
| WebP | `image/webp` | Best compression |
| SVG | `image/svg+xml` | Great for AI-generated icons |

## Docker / Volume Note

Avatars are stored at `{dataDir}/avatars/` on the host (typically `~/.secureyeoman/avatars/` or wherever `SECUREYEOMAN_DATA_DIR` points). Make sure the `data` volume is persisted between container restarts:

```yaml
# docker-compose.yml (already configured by default)
volumes:
  - secureyeoman_data:/data
```

## Cache Busting

Avatar URLs include a `?v={updatedAt}` query parameter so browsers pick up changes after a re-upload without needing a hard refresh.

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/soul/personalities/:id/avatar` | Upload avatar (multipart/form-data, field `avatar`) |
| `DELETE` | `/api/v1/soul/personalities/:id/avatar` | Remove avatar |
| `GET` | `/api/v1/soul/personalities/:id/avatar` | Serve avatar file |

See [ADR 136](../adr/136-personality-avatar-upload.md) for design decisions.
