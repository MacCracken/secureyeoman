// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .run(tauri::generate_context!())
        .expect("error while running SecureYeoman desktop");
}

#[cfg(test)]
mod tests {
    #[test]
    fn scaffold_compiles() {
        // Compile-check: if this test runs, the Tauri scaffold built successfully.
        assert!(true);
    }
}
