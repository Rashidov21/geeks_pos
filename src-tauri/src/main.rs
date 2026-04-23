// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use std::fs;
use std::path::PathBuf;
use std::process::Command;

#[cfg(windows)]
use windows_sys::Win32::Foundation::HANDLE;
#[cfg(windows)]
use windows_sys::Win32::Graphics::Printing::{
    ClosePrinter, EndDocPrinter, EndPagePrinter, GetDefaultPrinterW, OpenPrinterW,
    StartDocPrinterW, StartPagePrinter, WritePrinter, DOC_INFO_1W,
};

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
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![print_plain, print_escpos])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
