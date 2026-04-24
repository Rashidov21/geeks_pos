/** Raw ESC/POS to Windows printer via Tauri (empty name → OS default printer). */
export async function printEscposBase64(payload: string, printerName?: string | null): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/tauri')
  const name = printerName?.trim() || null
  await invoke('print_escpos', { payload, printer_name: name })
}
