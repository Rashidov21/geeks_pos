// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use std::fs;
use std::path::PathBuf;
use std::process::Command;

#[tauri::command]
fn print_plain(text: String) -> Result<String, String> {
    let mut path = std::env::temp_dir();
    path.push(format!("geeks_pos_{}.txt", uuid::Uuid::new_v4()));
    fs::write(&path, &text).map_err(|e| e.to_string())?;
    #[cfg(windows)]
    {
        let p = path.to_string_lossy().to_string();
        Command::new("notepad.exe")
            .args(["/p", &p])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(path.to_string_lossy().into_owned())
}

/// Mode A: raw ESC/POS bytes (base64). Saves to temp `.bin` for manual raw queue / tools.
#[tauri::command]
fn print_escpos(payload: String) -> Result<String, String> {
    let bytes = B64.decode(payload.trim()).map_err(|e| e.to_string())?;
    let mut path: PathBuf = std::env::temp_dir();
    path.push(format!("geeks_pos_{}.bin", uuid::Uuid::new_v4()));
    fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    Ok(format!(
        "Raw receipt bytes written to: {}",
        path.display()
    ))
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![print_plain, print_escpos])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
