//! Persistent key-value memory store with TTL and namespace support.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::sync::RwLock;
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_ENTRIES: usize = 10_000;
const MAX_VALUE_BYTES: usize = 1_048_576; // 1 MB

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Entry {
    value: serde_json::Value,
    expires_at: Option<u64>,
}

pub struct MemoryStore {
    data: RwLock<HashMap<String, HashMap<String, Entry>>>,
    store_path: String,
}

impl MemoryStore {
    pub fn new() -> Self {
        let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".into());
        let dir = format!("{home}/.secureyeoman-edge");
        let _ = fs::create_dir_all(&dir);
        let store_path = format!("{dir}/memory.json");

        let data = Self::load_from_disk(&store_path);

        Self {
            data: RwLock::new(data),
            store_path,
        }
    }

    fn load_from_disk(path: &str) -> HashMap<String, HashMap<String, Entry>> {
        fs::read_to_string(path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }

    fn persist(&self) {
        let data = self.data.read().unwrap();
        if let Ok(json) = serde_json::to_string(&*data) {
            let _ = fs::write(&self.store_path, json);
        }
    }

    fn now_epoch() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
    }

    pub fn get(&self, namespace: &str, key: &str) -> Option<serde_json::Value> {
        let data = self.data.read().unwrap();
        let entry = data.get(namespace)?.get(key)?;

        if let Some(exp) = entry.expires_at {
            if Self::now_epoch() > exp {
                return None;
            }
        }

        Some(entry.value.clone())
    }

    pub fn put(
        &self,
        namespace: &str,
        key: &str,
        value: serde_json::Value,
        ttl_seconds: Option<u64>,
    ) -> Result<(), String> {
        // Check value size
        let val_str = serde_json::to_string(&value).unwrap_or_default();
        if val_str.len() > MAX_VALUE_BYTES {
            return Err(format!(
                "Value too large ({} bytes, max {MAX_VALUE_BYTES})",
                val_str.len()
            ));
        }

        let mut data = self.data.write().unwrap();

        // Check total entry count
        let total: usize = data.values().map(|ns| ns.len()).sum();
        if total >= MAX_ENTRIES {
            return Err(format!("Entry limit reached ({MAX_ENTRIES})"));
        }

        let expires_at = ttl_seconds.map(|ttl| Self::now_epoch() + ttl);

        data.entry(namespace.to_string())
            .or_default()
            .insert(key.to_string(), Entry { value, expires_at });

        drop(data);
        self.persist();
        Ok(())
    }

    pub fn delete(&self, namespace: &str, key: &str) {
        let mut data = self.data.write().unwrap();
        if let Some(ns) = data.get_mut(namespace) {
            ns.remove(key);
            if ns.is_empty() {
                data.remove(namespace);
            }
        }
        drop(data);
        self.persist();
    }

    pub fn list(&self, namespace: &str) -> Vec<String> {
        let data = self.data.read().unwrap();
        let now = Self::now_epoch();

        data.get(namespace)
            .map(|ns| {
                ns.iter()
                    .filter(|(_, e)| e.expires_at.map_or(true, |exp| now <= exp))
                    .map(|(k, _)| k.clone())
                    .collect()
            })
            .unwrap_or_default()
    }

    pub fn list_namespaces(&self) -> Vec<String> {
        let data = self.data.read().unwrap();
        data.keys().cloned().collect()
    }
}
