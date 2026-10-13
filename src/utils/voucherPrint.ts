/**
 * Download Voucher as PDF.
 * Opens a clean window containing ONLY the voucher print document (no
 * modal, sidebar, or page content — that's what used to push the voucher
 * onto a second page) and triggers the browser print dialog, where the
 * user picks "Save as PDF". The voucher's own @page A4 + 1-page fit CSS
 * travels with the cloned node, so the PDF is exactly one page.
 */
export function downloadVoucherPDF(voucherNo: string): void {
  const node =
    document.querySelector('.fsv-root:not(.fsv-preview)') ||
    document.querySelector('.fsv-root');
  if (!node) {
    window.print();
    return;
  }
  const win = window.open('', '_blank');
  if (!win) {
    // Pop-up blocked — fall back to the in-page print.
    window.print();
    return;
  }
  win.document.write(
    `<!DOCTYPE html><html><head><title>Voucher ${voucherNo}</title>` +
      `<base href="${window.location.origin}/">` +
      `<style>body{margin:0;background:#fff}.fsv-root{position:static!important;left:auto!important;margin:0 auto;}</style>` +
      `</head><body>${(node as HTMLElement).outerHTML}</body></html>`
  );
  win.document.close();
  win.focus();
  setTimeout(() => {
    try {
      win.print();
    } catch { /* user closed the window */ }
  }, 400);
}
