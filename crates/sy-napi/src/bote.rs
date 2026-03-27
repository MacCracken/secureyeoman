//! Bote MCP service — NAPI bindings for Node.js.
//!
//! Exposes tool registry, schema validation, JSON-RPC protocol types,
//! and tool dispatch to the TypeScript layer.

use std::sync::OnceLock;

use napi_derive::napi;

use bote::registry::{ToolDef, ToolRegistry};

// ── Global Tool Registry ──────────────────────────────────────────────────

fn registry() -> &'static std::sync::Mutex<ToolRegistry> {
    static REG: OnceLock<std::sync::Mutex<ToolRegistry>> = OnceLock::new();
    REG.get_or_init(|| std::sync::Mutex::new(ToolRegistry::new()))
}

// ── Tool Registration ─────────────────────────────────────────────────────

/// Register a tool definition.
/// Input: JSON `{ name, description, inputSchema: { type, properties, required } }`
#[napi]
pub fn bote_register_tool(tool_json: String) -> napi::Result<()> {
    let tool: ToolDef = serde_json::from_str(&tool_json)
        .map_err(|e| napi::Error::from_reason(format!("Invalid tool JSON: {e}")))?;

    let mut reg = registry().lock().unwrap_or_else(|e| e.into_inner());
    reg.register(tool);
    Ok(())
}

/// List all registered tools. Returns JSON array of ToolDef.
#[napi]
pub fn bote_list_tools() -> String {
    let reg = registry().lock().unwrap_or_else(|e| e.into_inner());
    let tools: Vec<&ToolDef> = reg.list();
    serde_json::to_string(&tools).unwrap_or_else(|_| "[]".to_string())
}

/// Get a tool by name. Returns JSON ToolDef or null.
#[napi]
pub fn bote_get_tool(name: String) -> Option<String> {
    let reg = registry().lock().unwrap_or_else(|e| e.into_inner());
    reg.get(&name)
        .map(|t| serde_json::to_string(t).unwrap_or_default())
}

/// Validate parameters against a tool's input schema.
/// Returns JSON: `{ valid: true }` or `{ valid: false, errors: [...] }`.
#[napi]
pub fn bote_validate_params(tool_name: String, params_json: String) -> String {
    let params: serde_json::Value = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => {
            return serde_json::json!({
                "valid": false,
                "errors": [format!("Invalid params JSON: {e}")]
            })
            .to_string();
        }
    };

    let reg = registry().lock().unwrap_or_else(|e| e.into_inner());

    match reg.validate_params(&tool_name, &params) {
        Ok(()) => serde_json::json!({ "valid": true }).to_string(),
        Err(e) => serde_json::json!({
            "valid": false,
            "errors": [e.to_string()]
        })
        .to_string(),
    }
}

/// Remove a tool from the registry.
#[napi]
pub fn bote_remove_tool(name: String) -> bool {
    let mut reg = registry().lock().unwrap_or_else(|e| e.into_inner());
    reg.deregister(&name).is_some()
}

/// Number of registered tools.
#[napi]
pub fn bote_tool_count() -> u32 {
    let reg = registry().lock().unwrap_or_else(|e| e.into_inner());
    reg.len() as u32
}

// ── JSON-RPC Protocol ─────────────────────────────────────────────────────

/// Parse a JSON-RPC 2.0 request. Returns structured JSON or error.
#[napi]
pub fn bote_parse_jsonrpc(request_json: String) -> String {
    match serde_json::from_str::<bote::JsonRpcRequest>(&request_json) {
        Ok(req) => serde_json::json!({
            "valid": true,
            "method": req.method,
            "id": req.id,
        })
        .to_string(),
        Err(e) => serde_json::json!({
            "valid": false,
            "error": format!("Invalid JSON-RPC request: {e}")
        })
        .to_string(),
    }
}

/// Create a JSON-RPC 2.0 success response.
#[napi]
pub fn bote_jsonrpc_success(id: String, result_json: String) -> String {
    let result: serde_json::Value =
        serde_json::from_str(&result_json).unwrap_or(serde_json::Value::Null);
    serde_json::json!({
        "jsonrpc": "2.0",
        "id": id,
        "result": result,
    })
    .to_string()
}

/// Create a JSON-RPC 2.0 error response.
#[napi]
pub fn bote_jsonrpc_error(id: String, code: i32, message: String) -> String {
    serde_json::json!({
        "jsonrpc": "2.0",
        "id": id,
        "error": {
            "code": code,
            "message": message,
        },
    })
    .to_string()
}
