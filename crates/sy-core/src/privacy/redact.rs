//! Credential redaction for API responses — the TS `sanitizeForLogging`.
//!
//! Values stored under a credential-like key (`password`, `secret`, `token`,
//! `key`, `auth`, …) are replaced with `"[REDACTED]"`, and strings elsewhere
//! have well-known secret shapes (API keys, bearer tokens, JWTs, PEM private
//! keys, credentials in database URLs) masked in place.

use std::sync::LazyLock;

use regex::Regex;
use serde::Serializer;
use serde_json::Value;

/// What a redacted value is replaced with.
pub const REDACTED: &str = "[REDACTED]";

/// A key naming a credential contains one of these (compared lowercase).
const SENSITIVE_KEY_PARTS: &[&str] = &["password", "secret", "token", "key", "auth"];

/// Whether an object key names a credential.
pub fn is_sensitive_key(key: &str) -> bool {
    let lower = key.to_ascii_lowercase();
    SENSITIVE_KEY_PARTS.iter().any(|part| lower.contains(part))
}

/// Secret shapes masked inside free-text strings, in the TS order.
static STRING_PATTERNS: LazyLock<Vec<(Regex, &'static str)>> = LazyLock::new(|| {
    [
        (r"sk-[a-zA-Z0-9_-]{20,}", "[REDACTED_API_KEY]"),
        (
            r#"(?i)api[_-]?key["\s:=]+["']?[a-zA-Z0-9_-]{16,}["']?"#,
            "[REDACTED_API_KEY]",
        ),
        (r"(?i)bearer\s+[a-zA-Z0-9._-]+", "Bearer [REDACTED_TOKEN]"),
        (
            r#"(?i)token["\s:=]+["']?[a-zA-Z0-9._-]{20,}["']?"#,
            "[REDACTED_TOKEN]",
        ),
        (
            r#"(?i)password["\s:=]+["']?[^"'\s]+["']?"#,
            "[REDACTED_PASSWORD]",
        ),
        (
            r"-----BEGIN[^-]+PRIVATE KEY-----[\s\S]*?-----END[^-]+PRIVATE KEY-----",
            "[REDACTED_PRIVATE_KEY]",
        ),
        (
            r"eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}",
            "[REDACTED_JWT]",
        ),
        (
            r"(?i)((?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?)://)[^:/@\s]+:[^@\s]+@",
            "${1}[REDACTED]@",
        ),
    ]
    .into_iter()
    .map(|(pattern, replacement)| {
        (
            Regex::new(pattern).expect("static redaction pattern"),
            replacement,
        )
    })
    .collect()
});

/// Mask secret shapes inside a free-text string.
pub fn redact_string(s: &str) -> String {
    let mut out = s.to_string();
    for (re, replacement) in STRING_PATTERNS.iter() {
        if re.is_match(&out) {
            out = re.replace_all(&out, *replacement).into_owned();
        }
    }
    out
}

/// Redact `value` in place. Under a credential-like key every value is
/// replaced, except `null`, `""` and booleans, which carry no secret and tell
/// the client whether one is set.
pub fn redact_secrets(value: &mut Value) {
    match value {
        Value::Object(map) => {
            for (key, v) in map.iter_mut() {
                if is_sensitive_key(key) {
                    let empty = matches!(v, Value::Null | Value::Bool(_))
                        || v.as_str().is_some_and(str::is_empty);
                    if !empty {
                        *v = Value::String(REDACTED.to_string());
                    }
                } else {
                    redact_secrets(v);
                }
            }
        }
        Value::Array(items) => items.iter_mut().for_each(redact_secrets),
        Value::String(s) => {
            let masked = redact_string(s);
            if masked != *s {
                *s = masked;
            }
        }
        _ => {}
    }
}

/// A redacted copy of `value`.
pub fn redacted(value: &Value) -> Value {
    let mut copy = value.clone();
    redact_secrets(&mut copy);
    copy
}

/// `serialize_with` for a JSON column that may hold credentials, so every
/// response built from the row is masked.
pub fn serialize_redacted<S: Serializer>(value: &Value, serializer: S) -> Result<S::Ok, S::Error> {
    serde::Serialize::serialize(&redacted(value), serializer)
}

/// `serialize_with` for an optional secret: reports only whether one is set.
pub fn serialize_is_set<S: Serializer>(
    secret: &Option<String>,
    serializer: S,
) -> Result<S::Ok, S::Error> {
    serializer.serialize_bool(secret.as_deref().is_some_and(|s| !s.is_empty()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn credential_keys_are_masked_at_any_depth() {
        let mut v = json!({
            "botToken": "123:abc",
            "apiKey": "k",
            "nested": { "clientSecret": "s", "password": "p", "Authorization": "Bearer x" },
            "list": [{ "accessToken": "t" }],
            "baseUrl": "https://example.com",
            "count": 3,
        });
        redact_secrets(&mut v);
        assert_eq!(v["botToken"], REDACTED);
        assert_eq!(v["apiKey"], REDACTED);
        assert_eq!(v["nested"]["clientSecret"], REDACTED);
        assert_eq!(v["nested"]["password"], REDACTED);
        assert_eq!(v["nested"]["Authorization"], REDACTED);
        assert_eq!(v["list"][0]["accessToken"], REDACTED);
        assert_eq!(v["baseUrl"], "https://example.com");
        assert_eq!(v["count"], 3);
    }

    #[test]
    fn unset_credentials_stay_visible_as_unset() {
        let mut v = json!({ "token": null, "secret": "", "useAuth": true, "apiKey": 42 });
        redact_secrets(&mut v);
        assert_eq!(v["token"], Value::Null);
        assert_eq!(v["secret"], "");
        assert_eq!(v["useAuth"], true);
        assert_eq!(v["apiKey"], REDACTED);
    }

    #[test]
    fn a_credential_object_is_replaced_whole() {
        let mut v = json!({ "auth": { "user": "u", "pass": "p" } });
        redact_secrets(&mut v);
        assert_eq!(v["auth"], REDACTED);
    }

    #[test]
    fn secret_shapes_in_free_text_are_masked() {
        let jwt = format!(
            "eyJ{}.{}.{}",
            "a".repeat(24),
            "b".repeat(24),
            "c".repeat(24)
        );
        let mut v = json!({
            "note": format!("use sk-{} please", "x".repeat(24)),
            "header": "Bearer abc.def-ghi",
            "dsn": "postgres://admin:hunter2@db:5432/sy",
            "jwt": jwt,
            "pem": "-----BEGIN RSA PRIVATE KEY-----\nMIIB\n-----END RSA PRIVATE KEY-----",
            "plain": "nothing secret here",
        });
        redact_secrets(&mut v);
        assert_eq!(v["note"], "use [REDACTED_API_KEY] please");
        assert_eq!(v["header"], "Bearer [REDACTED_TOKEN]");
        assert_eq!(v["dsn"], "postgres://[REDACTED]@db:5432/sy");
        assert_eq!(v["jwt"], "[REDACTED_JWT]");
        assert_eq!(v["pem"], "[REDACTED_PRIVATE_KEY]");
        assert_eq!(v["plain"], "nothing secret here");
    }

    #[test]
    fn is_set_serializer_reports_presence_only() {
        #[derive(serde::Serialize)]
        struct Row {
            #[serde(rename = "hasSecret", serialize_with = "serialize_is_set")]
            secret: Option<String>,
        }
        let set = serde_json::to_value(Row {
            secret: Some("s3cr3t".into()),
        })
        .unwrap();
        assert_eq!(set, json!({ "hasSecret": true }));
        let unset = serde_json::to_value(Row { secret: None }).unwrap();
        assert_eq!(unset, json!({ "hasSecret": false }));
    }
}
