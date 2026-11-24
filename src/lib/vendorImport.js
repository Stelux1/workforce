// Uvoz dobavljača iz CSV-a: polja, mapiranje naziva kolona (EN/SR), validacija po redu i otkrivanje duplikata.
// Vendor ID iz fajla se IGNORIŠE — dodeljuje ga baza (migracija 20261124110000_vendor_id_automatski.sql).
import { mapColumns, normalizeHeader, rowToObject } from "@/lib/csvImport";

export const CURRENCIES = ["EUR", "RSD", "GBP", "USD"];
export const CYCLES = ["weekly", "biweekly", "monthly"];
export const STATUSES = ["active", "inactive"];

// Redosled i nazivi kolona kao u formi „Add Vendor" (VendorDialog). label je i zaglavlje u šablonu.
export const VENDOR_IMPORT_FIELDS = [
  { key: "name", label: "Vendor Name*", aliases: ["Vendor Name", "Name", "Vendor", "Naziv dobavljača", "Naziv", "Dobavljač", "Firma"], required: true },
  { key: "legal_name", label: "Legal Name", aliases: ["Pravni naziv", "Puni naziv"] },
  { key: "registration_number", label: "Registration No.", aliases: ["Registration Number", "Reg No", "Matični broj", "MB", "Matični br."] },
  { key: "tax_number", label: "Tax No.", aliases: ["Tax Number", "Tax ID", "PIB", "Poreski broj"] },
  { key: "vat_number", label: "VAT No.", aliases: ["VAT Number", "VAT", "PDV broj", "PDV", "IČ DPH", "IC DPH"] },
  { key: "country", label: "Country", aliases: ["Država", "Drzava", "Krajina"] },
  { key: "city", label: "City", aliases: ["Grad", "Mesto", "Mesto/Grad"] },
  { key: "postal_code", label: "Postal Code", aliases: ["ZIP", "Zip Code", "Postcode", "Poštanski broj", "Postanski broj", "PSČ", "PSC"] },
  { key: "address", label: "Address", aliases: ["Adresa"] },
  { key: "contact_name", label: "Contact Name", aliases: ["Contact", "Contact Person", "Kontakt osoba", "Kontakt"] },
  { key: "email", label: "Email", aliases: ["E-mail", "Mail", "Email adresa"] },
  { key: "phone", label: "Phone", aliases: ["Telephone", "Tel", "Telefon", "Mobile"] },
  { key: "default_currency", label: "Default Currency", aliases: ["Currency", "Valuta", "Valuta ugovora"] },
  { key: "payment_terms", label: "Payment Terms", aliases: ["Terms", "Rok plaćanja", "Rok placanja", "Uslovi plaćanja"] },
  { key: "payroll_cycle", label: "Settlement Cycle", aliases: ["Payroll Cycle", "Cycle", "Ciklus obračuna", "Ciklus obracuna", "Ciklus"] },
  { key: "contract_reference", label: "Contract Ref.", aliases: ["Contract Reference", "Contract No", "Contract", "Broj ugovora", "Ugovor"] },
  { key: "status", label: "Status", aliases: [] },
  { key: "notes", label: "Notes", aliases: ["Note", "Napomene", "Napomena"] },
];

// Kolone koje se prepoznaju samo da bi se prijavilo da se ignorišu.
const IGNORED_HEADERS = ["vendorid", "sifradobavljaca", "id"].map(normalizeHeader);

const CYCLE_ALIASES = {
  weekly: "weekly", nedeljno: "weekly", tjedno: "weekly", tyzdenne: "weekly",
  biweekly: "biweekly", dvonedeljno: "biweekly", "bi-weekly": "biweekly", "every2weeks": "biweekly", dvojtyzdenne: "biweekly",
  monthly: "monthly", mesecno: "monthly", mesecnoo: "monthly", mesacne: "monthly",
};
const STATUS_ALIASES = {
  active: "active", aktivan: "active", aktivno: "active", aktivny: "active", yes: "active", da: "active",
  inactive: "inactive", neaktivan: "inactive", neaktivno: "inactive", neaktivny: "inactive", no: "inactive", ne: "inactive",
};

// Poruke su fiksni engleski tekstovi (ključevi u translations.js).
export const MSG = {
  nameRequired: "Vendor name is required",
  email: "Invalid email address",
  currency: "Currency must be EUR, RSD, GBP or USD",
  cycle: "Settlement cycle must be weekly, biweekly or monthly",
  status: "Status must be active or inactive",
  dupFileName: "Duplicate in file: same vendor name",
  dupFileReg: "Duplicate in file: same Registration No.",
  dupFileTax: "Duplicate in file: same Tax No.",
  dupDbName: "Already exists: same vendor name",
  dupDbReg: "Already exists: same Registration No.",
  dupDbTax: "Already exists: same Tax No.",
};

const norm = (v) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const normId = (v) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Mapiranje kolona + spisak kolona koje se ignorišu (Vendor ID). */
export function mapVendorColumns(headers) {
  const mapping = mapColumns(headers, VENDOR_IMPORT_FIELDS);
  const mapped = new Set(Object.values(mapping));
  const ignored = headers.filter((h, i) => !mapped.has(i) && IGNORED_HEADERS.includes(normalizeHeader(h)));
  const unknown = headers.filter((h, i) => h && !mapped.has(i) && !IGNORED_HEADERS.includes(normalizeHeader(h)));
  return { mapping, ignored, unknown, hasName: mapping.name !== undefined };
}

/** Normalizuje jedan red u objekat spreman za upis; greške se vraćaju kao poruke (MSG). */
export function validateVendorRow(raw) {
  const errors = [];
  const d = { ...raw };
  const name = (d.name || "").trim();
  if (!name) errors.push(MSG.nameRequired);
  if (d.email && !EMAIL_RE.test(d.email)) errors.push(MSG.email);

  let currency = "EUR";
  if (d.default_currency) {
    currency = d.default_currency.toUpperCase();
    if (!CURRENCIES.includes(currency)) errors.push(MSG.currency);
  }
  let cycle = "monthly";
  if (d.payroll_cycle) {
    cycle = CYCLE_ALIASES[normalizeHeader(d.payroll_cycle)] || null;
    if (!cycle) errors.push(MSG.cycle);
  }
  let status = "active";
  if (d.status) {
    status = STATUS_ALIASES[normalizeHeader(d.status)] || null;
    if (!status) errors.push(MSG.status);
  }

  const text = (k) => (d[k] || "").trim() || null;
  const data = {
    name,
    legal_name: text("legal_name"), registration_number: text("registration_number"), tax_number: text("tax_number"),
    vat_number: text("vat_number"), country: text("country"), city: text("city"), postal_code: text("postal_code"),
    address: text("address"), contact_name: text("contact_name"), email: text("email"), phone: text("phone"),
    default_currency: currency, payment_terms: text("payment_terms"), payroll_cycle: cycle, contract_reference: text("contract_reference"),
    status, notes: text("notes"),
  };
  return { data, errors };
}

/**
 * Analiza celog fajla. parsed = rezultat parseCsv; existing = dobavljači iz baze.
 * Svaki red: { line (broj reda u fajlu, zaglavlje je 1), status: "valid" | "error" | "duplicate", messages, data }.
 * Duplikat = isti naziv, Registration No. ili Tax No. (poređenje bez razlike u velikim slovima/razmacima/interpunkciji) —
 * unutar fajla (prvi ostaje, ostali se preskaču) ili sa dobavljačem iz baze. Redovi sa greškom ne ulaze u poređenje.
 */
export function analyzeVendorImport(parsed, existing = []) {
  const cols = mapVendorColumns(parsed.headers);
  const seen = { name: new Set(), reg: new Set(), tax: new Set() };
  const db = { name: new Set(), reg: new Set(), tax: new Set() };
  for (const v of existing) {
    if (v.name) db.name.add(norm(v.name));
    if (normId(v.registration_number)) db.reg.add(normId(v.registration_number));
    if (normId(v.tax_number)) db.tax.add(normId(v.tax_number));
  }

  const items = [];
  if (cols.hasName) {
    parsed.rows.forEach((row, i) => {
      const { data, errors } = validateVendorRow(rowToObject(row, cols.mapping));
      const item = { line: i + 2, data, status: "valid", messages: [] };
      if (errors.length) {
        item.status = "error";
        item.messages = errors;
      } else {
        const keys = { name: norm(data.name), reg: normId(data.registration_number), tax: normId(data.tax_number) };
        const dups = [];
        if (db.name.has(keys.name)) dups.push(MSG.dupDbName);
        else if (seen.name.has(keys.name)) dups.push(MSG.dupFileName);
        if (keys.reg && db.reg.has(keys.reg)) dups.push(MSG.dupDbReg);
        else if (keys.reg && seen.reg.has(keys.reg)) dups.push(MSG.dupFileReg);
        if (keys.tax && db.tax.has(keys.tax)) dups.push(MSG.dupDbTax);
        else if (keys.tax && seen.tax.has(keys.tax)) dups.push(MSG.dupFileTax);
        if (dups.length) {
          item.status = "duplicate";
          item.messages = dups;
        } else {
          seen.name.add(keys.name);
          if (keys.reg) seen.reg.add(keys.reg);
          if (keys.tax) seen.tax.add(keys.tax);
        }
      }
      items.push(item);
    });
  }

  const count = (s) => items.filter((it) => it.status === s).length;
  return { ...cols, items, counts: { total: items.length, valid: count("valid"), duplicate: count("duplicate"), error: count("error") } };
}

/** Primer redova u šablonu (stvarno izgledaju kao pravi podaci, jedan red koji korisnik zameni svojim). */
export const VENDOR_TEMPLATE_EXAMPLE = [
  "Dunav Staffing d.o.o.", "Dunav Staffing društvo sa ograničenom odgovornošću", "21345678", "109876543", "RS109876543",
  "Serbia", "Novi Sad", "21000", "Bulevar oslobođenja 12", "Marko Petrović", "office@dunav-staffing.example", "+381 21 555 010",
  "EUR", "30 days", "monthly", "UG-2026-014", "active", "",
];

/** Izveštaj o grešaka i preskočenim redovima za preuzimanje: [[red, status, razlog, naziv], ...] sa zaglavljem. */
export function buildReportRows(items, T = (s) => s) {
  return [
    [T("Row"), T("Result"), T("Reason"), T("Vendor Name")],
    ...items
      .filter((it) => it.status !== "valid")
      .map((it) => [it.line, it.status === "error" ? T("Error") : T("Skipped (duplicate)"), it.messages.map(T).join("; "), it.data.name]),
  ];
}

/** Rezime posle uvoza: preskočeno = duplikati + greške iz pregleda; neuspelo = redovi koji su pali pri upisu. */
export function summarizeVendorImport(counts, created = 0, failedCount = 0) {
  return { imported: created, skipped: (counts?.duplicate || 0) + (counts?.error || 0), failed: failedCount };
}
