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
use windows_sys::Win32::Foundation::HANDLE;
#[cfg(windows)]
use windows_sys::Win32::Graphics::Printing::{
    ClosePrinter, EndDocPrinter, EndPagePrinter, GetDefaultPrinterW, OpenPrinterW,
    StartDocPrinterW, StartPagePrinter, WritePrinter, DOC_INFO_1W,
};

struct BackendState {
    child: Mutex<Option<Child>>,
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

fn ensure_backend_started(state: &BackendState) -> Result<(), String> {
    if health_ok() {
        return Ok(());
    }

    let script = backend_script_path();
    let mut cmd = Command::new("python");
    cmd.arg(script)
        .arg("--host")
        .arg("127.0.0.1")
        .arg("--port")
        .arg("8000")
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
    Err("Backend healthcheck failed after start".to_string())
}

fn stop_backend(state: &BackendState) {
    if let Ok(mut lock) = state.child.lock() {
        if let Some(child) = lock.as_mut() {
            let _ = child.kill();
        }
        *lock = None;
    }
}

#[cfg(windows)]
fn to_wide_null(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
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
fn raw_print_default(bytes: &[u8]) -> Result<(), String> {
    let printer_name = default_printer_name()?;
    let printer_w = to_wide_null(&printer_name);
    let mut h_printer: HANDLE = 0;

    let opened = unsafe {
        OpenPrinterW(
            printer_w.as_ptr() as *mut u16,
            &mut h_printer as *mut HANDLE,
            std::ptr::null_mut(),
        )
    };
    if opened == 0 || h_printer == 0 {
        return Err("OpenPrinterW failed".to_string());
    }

    let doc_name = to_wide_null("Geeks POS Receipt");
    let data_type = to_wide_null("RAW");
    let mut doc_info = DOC_INFO_1W {
        pDocName: doc_name.as_ptr() as *mut u16,
        pOutputFile: std::ptr::null_mut(),
        pDatatype: data_type.as_ptr() as *mut u16,
    };

    let job_id = unsafe { StartDocPrinterW(h_printer, 1, &mut doc_info as *mut _ as *mut u8) };
    if job_id == 0 {
        unsafe { ClosePrinter(h_printer) };
        return Err("StartDocPrinterW failed".to_string());
    }

    let page_ok = unsafe { StartPagePrinter(h_printer) };
    if page_ok == 0 {
        unsafe {
            EndDocPrinter(h_printer);
            ClosePrinter(h_printer);
        }
        return Err("StartPagePrinter failed".to_string());
    }

    let mut written: u32 = 0;
    let write_ok = unsafe {
        WritePrinter(
            h_printer,
            bytes.as_ptr() as *mut _,
            bytes.len() as u32,
            &mut written as *mut u32,
        )
    };

    unsafe {
        EndPagePrinter(h_printer);
        EndDocPrinter(h_printer);
        ClosePrinter(h_printer);
    }

    if write_ok == 0 || written == 0 {
        return Err("WritePrinter failed".to_string());
    }

    Ok(())
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
fn print_escpos(payload: String) -> Result<String, String> {
    let bytes = B64.decode(payload.trim()).map_err(|e| e.to_string())?;

    #[cfg(windows)]
    {
        raw_print_default(&bytes)?;
        return Ok("Printed to default printer".to_string());
    }

    #[allow(unreachable_code)]
    Err("Raw printing is only supported on Windows".to_string())
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
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![print_plain, print_escpos])
        .build(tauri::generate_context!())
        .expect("error while building tauri app");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::ExitRequested { .. } = event {
            let state = app_handle.state::<BackendState>();
            stop_backend(&state);
        }
    });
}
