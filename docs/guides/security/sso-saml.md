# SSO & SAML 2.0 Configuration

SecureYeoman supports Single Sign-On via OIDC and SAML 2.0 (Phase 61). This allows users to log in using your organization's identity provider (Okta, Auth0, Azure AD, Google Workspace, SimpleSAMLphp, etc.) and maps IdP group membership to SecureYeoman roles.

---

## Supported Protocols

| Protocol | Use case |
|----------|----------|
| OIDC / OAuth 2.0 | Google, GitHub, Auth0, Okta (OIDC endpoint), Azure AD |
| SAML 2.0 | Okta (SAML app), Azure AD SAML, ADFS, SimpleSAMLphp, Keycloak |

---

## OIDC / OAuth 2.0

OIDC providers are configured in **Connections → OAuth** and follow the standard OAuth 2.0 authorization code flow. See the [Integrations guide](integrations.md) for provider-specific setup.

---

## SAML 2.0

### Prerequisites

- `node-saml` is an optional peer dependency — it is lazy-loaded at runtime. If you get `Cannot find module 'node-saml'`, install it: `npm install node-saml` in the core container.
- Your IdP must support SAML 2.0 Service Provider metadata

### Step 1 — Register the SAML Identity Provider

```bash
curl -X POST https://your-instance/api/v1/auth/sso/providers \
  -H "Authorization: Bearer <admin-jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Okta SAML",
    "type": "saml",
    "entryPoint": "https://your-org.okta.com/app/secureyeoman/sso/saml",
    "issuer": "https://your-instance.example.com",
    "callbackUrl": "https://your-instance.example.com/api/v1/auth/sso/saml/<id>/acs",
    "cert": "MIIDpDCCA...base64-encoded-IdP-certificate...",
    "nameIdFormat": "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
    "groupAttribute": "groups",
    "groupRoleMap": {
      "SecureYeoman-Admins": "admin",
      "SecureYeoman-Operators": "operator",
      "SecureYeoman-Viewers": "viewer"
    }
  }'
```

The response includes the provider `id`. Use it in the URLs below.

### Step 2 — Retrieve SP Metadata

Give your IdP the Service Provider metadata:

```bash
curl https://your-instance/api/v1/auth/sso/saml/<id>/metadata
```

Returns an `<md:EntityDescriptor>` XML document. In Okta, paste this XML into "Identity Provider metadata" when setting up the SAML app. In Azure AD, upload it in the "Basic SAML Configuration" section.

### Step 3 — Configure the IdP

Use the following values in your IdP SAML app configuration:

| Field | Value |
|-------|-------|
| **SP Entity ID / Audience URI** | `https://your-instance.example.com` |
| **ACS URL / Single Sign-On URL** | `https://your-instance.example.com/api/v1/auth/sso/saml/<id>/acs` |
| **Name ID Format** | Email address (recommended) |
| **Attribute Statements** | Map group membership to a `groups` attribute (or whatever `groupAttribute` you configured) |

### Step 4 — Test the Login Flow

1. Open `https://your-instance/api/v1/auth/sso/authorize/<id>` in a browser
2. You should be redirected to your IdP login page
3. After authenticating, you'll be redirected back to SecureYeoman with a JWT in the URL fragment
4. SecureYeoman creates or updates the user account and assigns the role from `groupRoleMap`

---

## Provider Configuration Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | ✅ | Display name shown in the login UI |
| `type` | ✅ | `saml` or `oidc` |
| `entryPoint` | ✅ (SAML) | IdP SSO URL (the redirect target for the AuthnRequest) |
| `issuer` | ✅ (SAML) | SP entity ID — must match what you configure in the IdP |
| `callbackUrl` | ✅ (SAML) | ACS URL — where the IdP posts the SAML response |
| `cert` | ✅ (SAML) | IdP signing certificate (PEM-encoded, without `-----BEGIN CERTIFICATE-----` header) |
| `nameIdFormat` | | Defaults to `emailAddress`. Use `persistent` for stateless IdPs |
| `groupAttribute` | | SAML attribute name that carries group membership (default: `groups`) |
| `groupRoleMap` | | Maps IdP group names to SecureYeoman roles (`admin`, `operator`, `viewer`) |

---

## Group-to-Role Mapping

When a user logs in via SAML, SecureYeoman reads the `groupAttribute` from the SAML assertion and finds the first matching key in `groupRoleMap`. If no group matches, the user is assigned the `viewer` role by default.

```json
{
  "groupRoleMap": {
    "sg-secureyeoman-admins": "admin",
    "sg-secureyeoman-ops": "operator",
    "sg-secureyeoman-readonly": "viewer"
  }
}
```

Group names are case-sensitive and must match the exact value sent by the IdP in the SAML assertion attribute.

> **Note:** If a user's group does not match any key in `groupRoleMap`, they are assigned the `viewer` role by default.

---

## Listing and Managing Providers

```bash
# List all SSO providers
curl -H "Authorization: Bearer <admin-jwt>" \
  https://your-instance/api/v1/auth/sso/providers

# Get a single provider
curl -H "Authorization: Bearer <admin-jwt>" \
  https://your-instance/api/v1/auth/sso/providers/<id>

# Update a provider (e.g. rotate the IdP certificate)
curl -X PATCH https://your-instance/api/v1/auth/sso/providers/<id> \
  -H "Authorization: Bearer <admin-jwt>" \
  -H "Content-Type: application/json" \
  -d '{ "cert": "MIIDpDCCA...new-certificate..." }'

# Delete a provider
curl -X DELETE -H "Authorization: Bearer <admin-jwt>" \
  https://your-instance/api/v1/auth/sso/providers/<id>
```

---

## Provider-Specific Notes

### Okta (SAML)

1. In Okta Admin → Applications → Create App Integration → SAML 2.0
2. Set **Single sign-on URL** to your ACS URL
3. Set **Audience URI (SP Entity ID)** to your instance URL
4. Under **Attribute Statements**, add a `groups` attribute with filter `Matches regex .*`
5. Download the **IdP metadata XML** and extract the signing certificate

### Azure Active Directory

1. Azure Portal → Enterprise Applications → New application → Non-gallery app
2. Set up **Single Sign-On → SAML**
3. Set **Identifier (Entity ID)** = your instance URL, **Reply URL** = ACS URL
4. Add a **Group claim** under Attributes & Claims
5. Download **Certificate (Base64)** from the SAML Signing Certificate section

### Keycloak

1. Clients → Create → Client Protocol: `saml`
2. Set **Root URL** to your instance URL, **Valid Redirect URIs** to `/api/v1/auth/sso/saml/<id>/acs`
3. In **Mappers**, add a Group Membership mapper with attribute name `groups`
4. Under **Keys**, export the realm certificate

---

## Troubleshooting

### "Cannot find module 'node-saml'"

`node-saml` is not installed in the core container. Add it to `packages/core/package.json` dependencies and rebuild the image, or run `npm install node-saml` inside the running container.

### Redirect to IdP but ACS returns 400

The SAML response failed validation. Common causes:
- **Wrong certificate** — the `cert` field must match the IdP's current signing certificate exactly
- **Clock skew** — SAML assertions have short validity windows (typically 5 minutes). Ensure NTP is configured on both the SecureYeoman host and the IdP
- **Audience mismatch** — the `issuer` in the provider config must exactly match the **SP Entity ID** configured in the IdP

### User logs in but gets `viewer` role unexpectedly

- Check that the `groupAttribute` name matches exactly what the IdP sends (use a SAML tracer browser extension to inspect the assertion)
- Verify the group name in `groupRoleMap` matches the exact string in the SAML attribute (case-sensitive)
- Check that the IdP is configured to include group membership in the SAML response

### SP metadata endpoint returns 404

The provider ID in the URL must match the `id` returned when you created the provider. Verify with `GET /api/v1/auth/sso/providers`.
