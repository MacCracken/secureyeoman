# ADR 143: SAML 2.0 SSO Support

**Date:** 2026-02-26
**Status:** Accepted
**Phase:** 61 — Enterprise Features

## Context

Enterprise customers use SAML 2.0 identity providers (Okta, Azure AD, ADFS, Ping Identity). The existing SSO system only supports OIDC. The database schema already has `type IN ('oidc','saml')`, `entityId`, `acsUrl`, and `metadataUrl` columns.

## Decision

Add SP-initiated SAML 2.0 via `node-saml` (lazy import; startup never fails if package is absent).

- **`SamlAdapter`:** Wraps `node-saml` SAML instance. Handles `getAuthorizeUrl`, `validateCallback` (normalizes attributes, resolves role via `groupRoleMap`), and `getSpMetadataXml`.
- **`SsoManager` changes:** `getAuthorizationUrl` branches on `provider.type`; new `handleSamlCallback` method; adapter cache keyed by provider ID.
- **New routes:**
  - `GET /api/v1/auth/sso/saml/:id/metadata` — public SP metadata XML
  - `POST /api/v1/auth/sso/saml/:id/acs` — ACS endpoint for SAMLResponse
- **SAML-specific config** goes in the existing `config JSONB` column: `entryPoint`, `idpCert`, `spPrivateKey`, `groupAttribute`, `groupRoleMap`, `nameIdFormat`.
- **Dashboard:** SSO provider form shows SAML fields when type is `saml`.

## Consequences

- Existing OIDC flow is entirely unchanged.
- Group-to-role mapping enables JIT provisioning with appropriate roles.
- `node-saml` must be installed (`pnpm add node-saml --filter @secureyeoman/core`) for SAML to function.
