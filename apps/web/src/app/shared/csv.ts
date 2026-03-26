export function downloadCsvFile(
  fileName: string,
  rows: Array<Array<string | number | null | undefined>>
) {
  const csv = rows
    .map((row) =>
      row
        .map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`)
        .join(',')
    )
    .join('\r\n');

  // Excel on Windows reliably detects UTF-8 CSV when the file starts with a BOM.
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}
