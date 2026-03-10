-- 010_encrypt_idp_secrets.sql
-- Encrypt OIDC client secrets at rest.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = 'identity_providers' AND column_name = 'client_secret_enc'
  ) THEN
    ALTER TABLE auth.identity_providers
      ADD COLUMN client_secret_enc  bytea,
      ADD COLUMN secret_enc_key_id  text;
  END IF;
END $$;
