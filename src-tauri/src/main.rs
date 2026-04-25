// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use std::fs;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use tauri::Manager;
#[cfg(windows)]
use raw_printer::write_to_device;

#[cfg(windows)]
use windows_sys::Win32::Foundation::{GetLastError, ERROR_INSUFFICIENT_BUFFER};
#[cfg(windows)]
use windows_sys::Win32::Graphics::Printing::{EnumPrintersW, GetDefaultPrinterW, PRINTER_INFO_4W};
#[cfg(windows)]
use windows_sys::Win32::System::Power::{
    SetThreadExecutionState, ES_CONTINUOUS, ES_DISPLAY_REQUIRED, ES_SYSTEM_REQUIRED,
};

struct BackendState {
    child: Mutex<Option<Child>>,
}

fn internal_flush_key() -> String {
    std::env::var("INTERNAL_FLUSH_KEY").unwrap_or_else(|_| {
        if cfg!(debug_assertions) {
            "dev-internal-flush-key".to_string()
        } else {
            String::new()
        }
    })
}

fn post_notification_flush() {
    let key = internal_flush_key();
    if key.is_empty() {
        return;
    }
    let body = r#"{"limit":50}"#;
    let req = format!(
        "POST /api/integrations/notification-queue/flush/ HTTP/1.1\r\n\
         Host: 127.0.0.1:8000\r\n\
         X-Internal-Key: {key}\r\n\
         Content-Type: application/json\r\n\
         Content-Length: {}\r\n\
         Connection: close\r\n\r\n\
         {body}",
        body.len()
    );
    if let Ok(mut stream) = TcpStream::connect("127.0.0.1:8000") {
        let _ = stream.set_write_timeout(Some(Duration::from_secs(5)));
        let _ = stream.set_read_timeout(Some(Duration::from_secs(15)));
        let _ = stream.write_all(req.as_bytes());
        let mut buf = [0u8; 512];
        let _ = stream.read(&mut buf);
    }
}

fn spawn_notification_flush_loop() {
    thread::spawn(|| loop {
        thread::sleep(Duration::from_secs(300));
        post_notification_flush();
    });
}

#[cfg(windows)]
fn enable_windows_autostart() -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|e| format!("current_exe failed: {e}"))?;
    let exe_str = exe
        .to_str()
        .ok_or_else(|| "Executable path is not valid UTF-8".to_string())?;
    let status = Command::new("reg")
        .args([
            "add",
            r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
            "/v",
            "GeeksPOS",
            "/t",
            "REG_SZ",
            "/d",
            exe_str,
            "/f",
        ])
        .status()
        .map_err(|e| format!("reg add failed: {e}"))?;
    if status.success() {
        Ok(())
    } else {
        Err("reg add returned non-zero exit code".to_string())
    }
}

#[cfg(not(windows))]
fn enable_windows_autostart() -> Result<(), String> {
    Ok(())
}

#[cfg(windows)]
fn enable_prevent_sleep() {
    unsafe {
        let _ = SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED);
    }
}

#[cfg(not(windows))]
fn enable_prevent_sleep() {}

#[cfg(windows)]
fn disable_prevent_sleep() {
    unsafe {
        let _ = SetThreadExecutionState(ES_CONTINUOUS);
    }
}

#[cfg(not(windows))]
fn disable_prevent_sleep() {}

#[cfg(windows)]
fn machine_id_windows() -> Result<String, String> {
    let out = Command::new("cmd")
        .args([
            "/C",
            "reg",
            "query",
            "HKLM\\SOFTWARE\\Microsoft\\Cryptography",
            "/v",
            "MachineGuid",
        ])
        .output()
        .map_err(|e| format!("reg query failed: {e}"))?;
    if !out.status.success() {
        return Err("reg query MachineGuid failed".to_string());
    }
    let s = String::from_utf8_lossy(&out.stdout);
    for line in s.lines() {
        let lower = line.to_lowercase();
        if lower.contains("machineguid") {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if let Some(guid) = parts.last() {
                if guid.len() >= 32 {
                    return Ok(guid.to_string());
                }
            }
        }
    }
    Err("MachineGuid not found in reg output".to_string())
}

#[tauri::command]
fn machine_id() -> Result<String, String> {
    #[cfg(windows)]
    {
        machine_id_windows()
    }
    #[cfg(not(windows))]
    {
        Err("machine_id is only implemented on Windows".to_string())
    }
}

fn health_ok() -> bool {
    if let Ok(mut stream) = TcpStream::connect("127.0.0.1:8000") {
        let _ = stream.set_read_timeout(Some(Duration::from_millis(800)));
        let _ = stream.set_write_timeout(Some(Duration::from_millis(800)));
        let _ = stream.write_all(b"GET /api/health/ HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n");
        let mut buf = String::new();
        if stream.read_to_string(&mut buf).is_ok() {
            return buf.contains("200") && buf.contains("\"status\": \"ok\"");
        }
    }
    false
}

fn backend_script_path() -> PathBuf {
    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let candidates = vec![
        cwd.join("../backend/run_waitress.py"),
        cwd.join("backend/run_waitress.py"),
        PathBuf::from("../backend/run_waitress.py"),
        PathBuf::from("backend/run_waitress.py"),
    ];
    for p in candidates {
        if p.exists() {
            return p;
        }
    }
    PathBuf::from("../backend/run_waitress.py")
}

fn backend_command(script: &PathBuf) -> Command {
    #[cfg(windows)]
    {
        let mut cmd = Command::new("py");
        cmd.arg("-3")
            .arg(script)
            .arg("--host")
            .arg("127.0.0.1")
            .arg("--port")
            .arg("8000");
        return cmd;
    }

    #[cfg(not(windows))]
    {
        let mut cmd = Command::new("python3");
        cmd.arg(script)
            .arg("--host")
            .arg("127.0.0.1")
            .arg("--port")
            .arg("8000");
        return cmd;
    }
}

fn ensure_backend_started(state: &BackendState) -> Result<(), String> {
    if health_ok() {
        return Ok(());
    }

    {
        let mut lock = state
            .child
            .lock()
            .map_err(|_| "Backend mutex poisoned".to_string())?;
        if let Some(child) = lock.as_mut() {
            match child.try_wait() {
                Ok(None) => return Ok(()),
                Ok(Some(_)) => {
                    *lock = None;
                }
                Err(e) => {
                    eprintln!("Backend state check warning: {e}");
                    *lock = None;
                }
            }
        }
    }

    let script = backend_script_path();
    let mut cmd = backend_command(&script);
    cmd
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());

    let child = cmd.spawn().map_err(|e| format!("Failed to spawn backend: {e}"))?;

    {
        let mut lock = state
            .child
            .lock()
            .map_err(|_| "Backend mutex poisoned".to_string())?;
        *lock = Some(child);
    }

    for _ in 0..20 {
        if health_ok() {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(300));
    }
    stop_backend(state);
    Err("Backend healthcheck failed after start".to_string())
}

fn stop_backend(state: &BackendState) {
    if let Ok(mut lock) = state.child.lock() {
        if let Some(child) = lock.as_mut() {
            if let Ok(None) = child.try_wait() {
                let _ = child.kill();
            }
        }
        *lock = None;
    }
}

#[cfg(windows)]
fn default_printer_name() -> Result<String, String> {
    let mut needed: u32 = 0;
    unsafe {
        let _ = GetDefaultPrinterW(std::ptr::null_mut(), &mut needed as *mut u32);
    }
    if needed == 0 {
        return Err("Default printer not found".to_string());
    }

    let mut buf: Vec<u16> = vec![0; needed as usize + 1];
    let ok = unsafe { GetDefaultPrinterW(buf.as_mut_ptr(), &mut needed as *mut u32) };
    if ok == 0 {
        return Err("GetDefaultPrinterW failed".to_string());
    }
    let end = buf.iter().position(|x| *x == 0).unwrap_or(buf.len());
    String::from_utf16(&buf[..end]).map_err(|e| e.to_string())
}

#[cfg(windows)]
fn raw_print_to(printer_name: Option<&str>, bytes: &[u8], doc_name: &str) -> Result<(), String> {
    let name = match printer_name.map(str::trim).filter(|s| !s.is_empty()) {
        Some(s) => s.to_string(),
        None => default_printer_name()?,
    };
    let written = write_to_device(&name, bytes, Some(doc_name)).map_err(|e| format!("raw_printer error: {e}"))?;
    if written == 0 {
        return Err("raw_printer wrote zero bytes".to_string());
    }
    Ok(())
}

#[cfg(windows)]
unsafe fn wide_ptr_to_string(ptr: *const u16) -> Option<String> {
    if ptr.is_null() {
        return None;
    }
    let mut len = 0usize;
    while *ptr.add(len) != 0 {
        len += 1;
        if len > 4096 {
            return None;
        }
    }
    let slice = std::slice::from_raw_parts(ptr, len);
    String::from_utf16(slice).ok()
}

/// Local + connected printers (fast level 4).
#[cfg(windows)]
fn list_installed_printers() -> Result<Vec<String>, String> {
    const PRINTER_ENUM_LOCAL: u32 = 2;
    const PRINTER_ENUM_CONNECTIONS: u32 = 4;
    let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;

    let mut needed: u32 = 0;
    let mut returned: u32 = 0;

    let ok = unsafe {
        EnumPrintersW(
            flags,
            std::ptr::null::<u16>(),
            4,
            std::ptr::null_mut(),
            0,
            &mut needed,
            &mut returned,
        )
    };
    if ok == 0 {
        let err = unsafe { GetLastError() };
        if err != ERROR_INSUFFICIENT_BUFFER {
            return Err(format!("EnumPrintersW probe failed: Win32 error {err}"));
        }
    }
    if needed == 0 {
        return Ok(vec![]);
    }

    let mut buf = vec![0u8; needed as usize];
    let ok2 = unsafe {
        EnumPrintersW(
            flags,
            std::ptr::null::<u16>(),
            4,
            buf.as_mut_ptr(),
            buf.len() as u32,
            &mut needed,
            &mut returned,
        )
    };
    if ok2 == 0 {
        return Err(format!(
            "EnumPrintersW failed: Win32 error {}",
            unsafe { GetLastError() }
        ));
    }

    let mut names = Vec::new();
    if returned == 0 {
        return Ok(names);
    }
    unsafe {
        let base = buf.as_ptr() as *const PRINTER_INFO_4W;
        for i in 0..returned as usize {
            let info = &*base.add(i);
            if let Some(s) = wide_ptr_to_string(info.pPrinterName as *const u16) {
                if !s.is_empty() {
                    names.push(s);
                }
            }
        }
    }
    Ok(names)
}

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

#[tauri::command]
fn print_raw(payload: String, printer_name: Option<String>) -> Result<String, String> {
    let bytes = B64.decode(payload.trim()).map_err(|e| e.to_string())?;

    #[cfg(windows)]
    {
        let target = printer_name.as_deref().map(str::trim).filter(|s| !s.is_empty());
        raw_print_to(target, &bytes, "Geeks POS RAW")?;
        let label = target.unwrap_or("(default Windows printer)");
        return Ok(format!("Printed to {label}"));
    }

    #[allow(unreachable_code)]
    Err("Raw printing is only supported on Windows".to_string())
}

#[tauri::command]
fn print_escpos(payload: String, printer_name: Option<String>) -> Result<String, String> {
    print_raw(payload, printer_name)
}

#[tauri::command]
fn list_printers() -> Result<Vec<String>, String> {
    #[cfg(windows)]
    {
        list_installed_printers()
    }
    #[cfg(not(windows))]
    {
        Ok(vec![])
    }
}

fn main() {
    let state = BackendState {
        child: Mutex::new(None),
    };

    let app = tauri::Builder::default()
        .manage(state)
        .setup(|app| {
            let state = app.state::<BackendState>();
            if let Err(e) = ensure_backend_started(&state) {
                eprintln!("Backend start warning: {e}");
            }
            if let Err(e) = enable_windows_autostart() {
                eprintln!("Autostart setup warning: {e}");
            }
            enable_prevent_sleep();
            spawn_notification_flush_loop();
            if let Some(window) = app.get_window("main") {
                let _ = window.set_always_on_top(true);
                let _ = window.set_fullscreen(true);
                let _ = window.set_decorations(false);
                let _ = window.set_resizable(false);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            print_plain,
            print_raw,
            print_escpos,
            list_printers,
            machine_id
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri app");

    app.run(|app_handle, event| {
        match event {
            tauri::RunEvent::WindowEvent { label, event, .. } => {
                if label == "main" {
                    match event {
                        tauri::WindowEvent::Focused(false) => {
                            if let Some(window) = app_handle.get_window("main") {
                                let _ = window.set_focus();
                            }
                        }
                        tauri::WindowEvent::Destroyed => {
                            disable_prevent_sleep();
                        }
                        _ => {}
                    }
                }
            }
            tauri::RunEvent::ExitRequested { .. } => {
                let state = app_handle.state::<BackendState>();
                stop_backend(&state);
                disable_prevent_sleep();
            }
            _ => {}
        }
    });
}
