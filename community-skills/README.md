# Community Skills (Bundled)

This directory contains the bundled community skills shipped with SecureYeoman.
It is the default path used by the community sync feature in Docker deployments.

## Using This Directory

Sync these skills into your marketplace:

```bash
POST /api/v1/marketplace/community/sync
```

Or from the Dashboard → Skills → Community tab, click **Sync**.

## Adding More Skills

To use a larger community skill collection:

1. Clone the community repository:
   ```bash
   git clone https://github.com/MacCracken/secureyeoman-community-skills.git
   ```

2. Set `COMMUNITY_REPO_PATH` in your `.env` to point to the clone.

3. To contribute skills back to the community, open a pull request at
   [secureyeoman-community-skills](https://github.com/MacCracken/secureyeoman-community-skills).

## Skill Format

See the [community repo README](https://github.com/MacCracken/secureyeoman-community-skills#skill-format) for the full skill JSON format and schema.
