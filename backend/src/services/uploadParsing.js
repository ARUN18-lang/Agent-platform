import * as XLSX from "xlsx";

/**
 * @param {Buffer} buffer
 * @param {string} filename
 * @returns {string} UTF-8 CSV text (comma-separated, first sheet only for spreadsheets)
 */
export function bufferToCsvText(buffer, filename) {
  const name = String(filename || "upload");
  const lower = name.toLowerCase();

  if (lower.endsWith(".csv")) {
    return buffer.toString("utf8");
  }

  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    const wb = XLSX.read(buffer, { type: "buffer", cellDates: true, dense: true });
    const sheetName = wb.SheetNames?.[0];
    if (!sheetName) {
      throw new Error("Spreadsheet has no sheets");
    }
    const sheet = wb.Sheets[sheetName];
    if (!sheet) {
      throw new Error("Could not read first sheet");
    }
    return XLSX.utils.sheet_to_csv(sheet, { FS: ",", RS: "\n" });
  }

  throw new Error("Only .csv, .xlsx, and .xls files are supported");
}
