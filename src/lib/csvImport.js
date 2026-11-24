// Deljena biblioteka za CSV uvoz (zaposleni, dobavljači): parsiranje, mapiranje kolona, datumi, šablon, izveštaj.
// Čista logika bez React-a, da bude testirana (csvImport.test.js).

const BOM = "﻿";

/** Odabir separatora po prvom redu van navodnika: ';' ili tab ako ih ima više od ',' . */
export function detectDelimiter(text) {
  const firstLine = text.replace(/^﻿/, "").split(/\r\n|\n|\r/, 1)[0] || "";
  let inQuotes = false;
  const counts = { ",": 0, ";": 0, "\t": 0 };
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch in counts) counts[ch] += 1;
  }
  if (counts[";"] > counts[","] && counts[";"] >= counts["\t"]) return ";";
  if (counts["\t"] > counts[","]) return "\t";
  return ",";
}

/**
 * Parsira CSV tekst: BOM, separator `,` / `;` / tab (automatski), navodnici (sa "" za navodnik u polju, novi red u polju),
 * CRLF/LF. Prazni redovi se preskaču. Vraća { headers, rows, delimiter }; rows su nizovi stringova (bez zaglavlja).
 */
export function parseCsv(input, delimiter) {
  const text = String(input ?? "").replace(/^﻿/, "");
  const sep = delimiter || detectDelimiter(text);
  const records = [];
  let field = "";
  let record = [];
  let inQuotes = false;
  let i = 0;
  const endField = () => { record.push(field); field = ""; };
  const endRecord = () => { endField(); records.push(record); record = []; };

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"' && field === "") { inQuotes = true; i += 1; continue; }
    if (ch === sep) { endField(); i += 1; continue; }
    if (ch === "\r") { endRecord(); i += text[i + 1] === "\n" ? 2 : 1; continue; }
    if (ch === "\n") { endRecord(); i += 1; continue; }
    field += ch;
    i += 1;
  }
  if (field !== "" || record.length > 0) endRecord();

  const nonEmpty = records.filter((r) => r.some((c) => c.trim() !== ""));
  const [headers = [], ...rows] = nonEmpty;
  return { headers: headers.map((h) => h.trim()), rows: rows.map((r) => r.map((c) => c.trim())), delimiter: sep };
}

/** Naziv kolone za poređenje: mala slova, bez dijakritika, samo slova i cifre ("Registration No." → "registrationno"). */
export function normalizeHeader(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "dj")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Automatsko mapiranje kolona. fields: [{ key, label, aliases: [...] }] — poredi se sa label-om i aliasima (EN/SR).
 * Vraća { [key]: indeksKolone } samo za pronađene; svaka kolona fajla se koristi najviše jednom.
 */
export function mapColumns(headers, fields) {
  const normalized = headers.map(normalizeHeader);
  const used = new Set();
  const mapping = {};
  for (const f of fields) {
    const names = [f.label, f.key, ...(f.aliases || [])].map(normalizeHeader).filter(Boolean);
    const idx = normalized.findIndex((h, i) => !used.has(i) && h !== "" && names.includes(h));
    if (idx >= 0) { mapping[f.key] = idx; used.add(idx); }
  }
  return mapping;
}

/** Red (niz) → objekat po mapiranju; nepostojeće kolone su "". */
export function rowToObject(row, mapping) {
  const out = {};
  for (const [key, idx] of Object.entries(mapping)) out[key] = (row[idx] ?? "").trim();
  return out;
}

/** Datum u ISO obliku (yyyy-mm-dd) iz yyyy-mm-dd, dd.mm.yyyy, dd/mm/yyyy ili dd-mm-yyyy; nevažeći → null. */
export function parseDate(value) {
  const s = String(value ?? "").trim().replace(/\.$/, "");
  if (!s) return null;
  let y; let m; let d;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (match) [, y, m, d] = match;
  else if ((match = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(s.replace(/\s+/g, "")))) [, d, m, y] = match;
  else return null;
  const dt = new Date(Date.UTC(+y, +m - 1, +d));
  if (dt.getUTCFullYear() !== +y || dt.getUTCMonth() !== +m - 1 || dt.getUTCDate() !== +d) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Jedno polje za upis u CSV (navodnici kad ima separator, navodnik ili novi red; zaštita od formula u Excelu). */
export function csvCell(value) {
  let s = value == null ? "" : String(value);
  if (/^[=+@]/.test(s) || /^-[^\d.,\s]/.test(s)) s = `'${s}`;
  return /[",;\n\r\t]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV tekst sa BOM-om (Excel ga tada ispravno čita sa dijakriticima). */
export function toCsv(rows, delimiter = ",") {
  return BOM + rows.map((r) => r.map(csvCell).join(delimiter)).join("\r\n") + "\r\n";
}

/** Šablon: zaglavlja (label iz definicije polja) + opcioni primer redova. */
export function buildTemplate(fields, exampleRows = []) {
  return toCsv([fields.map((f) => f.label), ...exampleRows]);
}

/** Preuzimanje teksta kao fajla u pregledaču. */
export function downloadCsv(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Čitanje izabranog fajla kao teksta (UTF-8; ako ima znakova zamene, pokušaj windows-1250 za stare Excel izvoze). */
export async function readCsvFile(file) {
  const buffer = await file.arrayBuffer();
  const utf8 = new TextDecoder("utf-8").decode(buffer);
  if (!utf8.includes("�")) return utf8;
  try { return new TextDecoder("windows-1250").decode(buffer); } catch { return utf8; }
}
