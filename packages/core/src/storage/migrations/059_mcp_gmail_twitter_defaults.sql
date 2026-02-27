-- Migration 059: Seed exposeGmail and exposeTwitter defaults in mcp.config
-- ON CONFLICT DO NOTHING: preserves any value the user has explicitly set;
-- only inserts the row if it does not exist yet (fresh install or upgrade).

INSERT INTO mcp.config (key, value) VALUES ('exposeGmail', 'false')  ON CONFLICT DO NOTHING;
INSERT INTO mcp.config (key, value) VALUES ('exposeTwitter', 'false') ON CONFLICT DO NOTHING;
