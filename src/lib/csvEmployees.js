// CSV uvoz zaposlenih (Teamora, zahtev 13) — čista logika: polja i mapiranje, provera reda, duplikati, šifre
// radnika, izveštaj o greškama. Parsiranje i zajednički alati su u `csvImport.js` (deli se sa uvozom vendora).
import { jmbgValid } from "@/lib/jmbg";
import { normalizeHeader, parseDate, toCsv, buildTemplate } from "@/lib/csvImport";

// Red čija prva ćelija počinje sa `#` je komentar (primer u šablonu) i ne uvozi se.
export const COMMENT_PREFIX = "#";

const enumField = (values) => ({ type: "enum", values });

// Redosled = redosled kolona u šablonu. `private: true` → employee_private (samo admin, D3).
// Aliasi: srpski (sa i bez dijakritika se poklapa preko normalizeHeader) i česti nazivi iz Excel tabela.
export const EMPLOYEE_FIELDS = [
  { key: "employee_id", label: "Employee ID", aliases: ["ID", "Emp ID", "Šifra radnika", "Šifra", "ID zaposlenog", "ID radnika", "Broj radnika"] },
  { key: "first_name", label: "First Name", required: true, aliases: ["Ime", "Firstname", "Given name"] },
  { key: "last_name", label: "Last Name", required: true, aliases: ["Prezime", "Lastname", "Surname", "Family name"] },
  { key: "email", label: "Email", type: "email", aliases: ["E-mail", "Email adresa", "E-mail adresa", "Mejl", "Mail"] },
  { key: "phone", label: "Phone", aliases: ["Telefon", "Mobilni", "Mobilni telefon", "Broj telefona", "Mobile", "Phone number", "Tel"] },
  { key: "date_of_birth", label: "Date of Birth", type: "date", aliases: ["Datum rođenja", "Rođen", "DOB", "Birth date", "Birthdate"] },
  { key: "gender", label: "Gender", ...enumField({
    male: ["male", "m", "muski", "musko", "man"],
    female: ["female", "f", "z", "zenski", "zensko", "woman"],
    other: ["other", "drugo", "ostalo"],
  }), aliases: ["Pol"] },
  { key: "nationality", label: "Nationality", aliases: ["Nacionalnost", "Državljanstvo"] },
  { key: "address", label: "Address", aliases: ["Adresa", "Ulica", "Street"] },
  { key: "city", label: "City", aliases: ["Grad", "Mesto"] },
  { key: "postal_code", label: "Postal Code", aliases: ["ZIP", "ZIP code", "Postcode", "Poštanski broj", "PTT"] },
  { key: "country", label: "Country", aliases: ["Država", "Zemlja"] },
  { key: "department", label: "Department", type: "department", aliases: ["Odeljenje", "Sektor"] },
  { key: "position", label: "Position", type: "position", aliases: ["Pozicija", "Radno mesto", "Job title", "Zanimanje"] },
  { key: "employment_type", label: "Employment Type", ...enumField({
    full_time: ["full_time", "full time", "fulltime", "puno radno vreme", "puno"],
    part_time: ["part_time", "part time", "parttime", "nepuno radno vreme", "skraceno radno vreme", "nepuno"],
    temporary: ["temporary", "privremeno", "privremeni", "na odredjeno"],
    contractor: ["contractor", "ugovarac", "podizvodjac", "spoljni saradnik"],
  }), aliases: ["Vrsta zaposlenja", "Tip zaposlenja", "Vrsta angažovanja"] },
  { key: "start_date", label: "Start Date", type: "date", aliases: ["Datum početka", "Početak rada", "Datum zaposlenja", "Datum prijema", "Hire date"] },
  { key: "end_date", label: "End Date", type: "date", aliases: ["Datum završetka", "Kraj rada", "Datum odlaska"] },
  { key: "status", label: "Status", ...enumField({
    active: ["active", "aktivan", "aktivna", "aktivno"],
    suspended: ["suspended", "suspendovan", "suspendovana"],
    on_leave: ["on_leave", "on leave", "odsutan", "na odsustvu", "odsustvo", "bolovanje"],
    terminated: ["terminated", "otpusten", "otpustena", "neaktivan", "neaktivna", "raskinut"],
  }) },
  { key: "emergency_contact_name", label: "Emergency Contact Name", aliases: ["Hitni kontakt", "Kontakt u hitnim slučajevima", "Ime hitnog kontakta"] },
  { key: "emergency_contact_relationship", label: "Emergency Contact Relationship", aliases: ["Srodstvo", "Odnos hitnog kontakta"] },
  { key: "emergency_contact_phone", label: "Emergency Contact Phone", aliases: ["Telefon hitnog kontakta"] },
  { key: "jmbg", label: "JMBG", type: "jmbg", private: true, aliases: ["Matični broj", "JMBG broj", "Personal ID number"] },
  { key: "foreign_personal_number", label: "Foreign Personal Number", private: true, aliases: ["Strani lični broj", "OIB", "Rodné číslo", "Rodne cislo", "Foreign ID number"] },
  { key: "id_card_number", label: "ID Card Number", private: true, aliases: ["Broj lične karte", "Lična karta", "ID card"] },
  { key: "id_card_expiry", label: "ID Card Expiry", type: "date", private: true, aliases: ["Važenje lične karte", "Lična karta važi do", "ID card expiry date"] },
  { key: "passport_number", label: "Passport Number", private: true, aliases: ["Broj pasoša", "Pasoš", "Passport"] },
  { key: "passport_expiry", label: "Passport Expiry", type: "date", private: true, aliases: ["Važenje pasoša", "Pasoš važi do", "Passport expiry date"] },
  { key: "bank_name", label: "Bank Name", private: true, aliases: ["Banka", "Naziv banke", "Bank"] },
  { key: "iban", label: "IBAN", private: true, aliases: ["Broj računa", "Tekući račun", "Račun", "Account number"] },
  { key: "swift_bic", label: "SWIFT/BIC", private: true, aliases: ["SWIFT", "BIC"] },
  { key: "tax_number", label: "Tax Number", private: true, aliases: ["Poreski broj", "Tax ID"] },
];

export const fieldsFor = (isAdmin) => EMPLOYEE_FIELDS.filter((f) => isAdmin || !f.private);

// Primer reda za šablon — prva ćelija počinje sa `#`, pa se red ne uvozi ni ako ostane u fajlu.
// JMBG je ispravan (kontrolna cifra), ali izmišljen; podaci su očigledno primer.
export const EXAMPLE_ROW = {
  employee_id: `${COMMENT_PREFIX} EXAMPLE – EMP-001`, first_name: "Marko", last_name: "Petrović",
  email: "marko.petrovic@example.com", phone: "064 123 4567", date_of_birth: "01.01.1990", gender: "male",
  nationality: "Serbian", address: "Bulevar oslobođenja 12", city: "Novi Sad", postal_code: "21000", country: "Serbia",
  department: "", position: "", employment_type: "full_time", start_date: "01.03.2026", end_date: "", status: "active",
  emergency_contact_name: "Jelena Petrović", emergency_contact_relationship: "Supruga", emergency_contact_phone: "064 765 4321",
  jmbg: "0101990710008", foreign_personal_number: "", id_card_number: "", id_card_expiry: "", passport_number: "", passport_expiry: "",
  bank_name: "", iban: "", swift_bic: "", tax_number: "",
};

export function employeeTemplate(isAdmin, { withExample = false } = {}) {
  const fields = fieldsFor(isAdmin);
  return buildTemplate(fields, withExample ? [fields.map((f) => EXAMPLE_ROW[f.key] ?? "")] : []);
}

export const isCommentRow = (cells) => String(cells?.[0] ?? "").trim().startsWith(COMMENT_PREFIX);

// ── Šifra radnika (isto kao forma: EMP-001, EMP-002 …) ──
const EMP_RE = /^EMP-(\d+)$/i;
export function maxEmployeeNumber(ids) {
  let max = 0;
  for (const id of ids || []) {
    const m = String(id ?? "").trim().match(EMP_RE);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max;
}
export const formatEmployeeId = (n) => `EMP-${String(n).padStart(3, "0")}`;
export const nextEmployeeId = (ids) => formatEmployeeId(maxEmployeeNumber(ids) + 1);

// ── Odeljenje / pozicija po imenu iz Settings → Departments (ime ili prevod, bez obzira na velika slova i kvačice) ──
const posName = (p) => (typeof p === "string" ? p : p?.name);
function findByName(items, value, getName, getTranslation) {
  const n = normalizeHeader(value);
  return items.find((it) => normalizeHeader(getName(it)) === n || (getTranslation(it) && normalizeHeader(getTranslation(it)) === n));
}

function matchEnum(field, value) {
  const n = normalizeHeader(value);
  for (const [code, names] of Object.entries(field.values)) {
    if (names.some((x) => normalizeHeader(x) === n)) return code;
  }
  return null;
}

// Excel briše vodeću nulu iz JMBG-a (01.01.1990 → „101990710008"). Vraćamo je samo ako je tada kontrolna cifra ispravna.
export function normalizeJmbg(value) {
  const v = String(value ?? "").replace(/[\s-]/g, "");
  if (/^\d{12}$/.test(v) && jmbgValid(`0${v}`)) return `0${v}`;
  return v;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Provera i čišćenje jednog reda (objekat po mapiranju, vrednosti su stringovi).
 * ctx: { departments: DepartmentConfig[], isAdmin }
 * Vraća { data, errors: [{ field, key }] , warnings: [{ field, key }] } — `key` je engleski tekst za T().
 */
export function validateEmployeeRow(raw, { departments = [], isAdmin = false } = {}) {
  const data = {};
  const errors = [];
  const warnings = [];
  const byKey = Object.fromEntries(EMPLOYEE_FIELDS.map((f) => [f.key, f]));

  for (const [key, rawValue] of Object.entries(raw || {})) {
    const field = byKey[key];
    if (!field) continue;
    const value = String(rawValue ?? "").trim();
    if (field.private && !isAdmin) {
      if (value) warnings.push({ field: key, key: "Admin only — value ignored" });
      continue;
    }
    if (!value) continue;
    if (field.type === "date") {
      const iso = parseDate(value);
      if (iso) data[key] = iso;
      else errors.push({ field: key, key: "Invalid date (use dd.mm.yyyy or yyyy-mm-dd)" });
    } else if (field.type === "email") {
      if (EMAIL_RE.test(value)) data[key] = value.toLowerCase();
      else errors.push({ field: key, key: "Invalid email address" });
    } else if (field.type === "jmbg") {
      const j = normalizeJmbg(value);
      if (jmbgValid(j)) data[key] = j;
      else errors.push({ field: key, key: "JMBG must be 13 digits with a valid check digit" });
    } else if (field.type === "enum") {
      const code = matchEnum(field, value);
      if (code) data[key] = code;
      else errors.push({ field: key, key: "Unknown value" });
    } else if (key === "employee_id") {
      data[key] = EMP_RE.test(value) ? value.toUpperCase() : value;
    } else if (key === "iban") {
      data[key] = value.replace(/\s+/g, "").toUpperCase();
    } else {
      data[key] = value;
    }
  }

  for (const f of EMPLOYEE_FIELDS) {
    if (f.required && !data[f.key] && !errors.some((e) => e.field === f.key)) errors.push({ field: f.key, key: "Required field is empty" });
  }

  // Odeljenje i pozicija: ako su odeljenja podešena, moraju da postoje (kao izbor u formi). Bez podešenih — slobodan unos.
  const deptRaw = data.department;
  if (deptRaw && departments.length) {
    const dept = findByName(departments, deptRaw, (d) => d.name, (d) => d.translation);
    if (!dept) {
      errors.push({ field: "department", key: "Department not found in Settings → Departments" });
      delete data.department;
    } else {
      data.department = dept.name;
      const positions = dept.positions || [];
      if (data.position && positions.length) {
        const pos = findByName(positions, data.position, posName, (p) => (typeof p === "string" ? null : p?.translation));
        if (pos) data.position = posName(pos);
        else errors.push({ field: "position", key: "Position not found in this department" });
      }
    }
  } else if (data.position && departments.length && !deptRaw) {
    errors.push({ field: "position", key: "Position requires a department" });
  }

  if (data.start_date && data.end_date && data.end_date < data.start_date) {
    errors.push({ field: "end_date", key: "End date is before start date" });
  }
  if (!data.status) data.status = "active";
  return { data, errors, warnings };
}

/**
 * Duplikati po šifri radnika, emailu i JMBG-u — prema bazi i prema ranijim redovima istog fajla.
 * rows: [{ data }] (posle validateEmployeeRow), existing: zaposleni iz baze.
 * Vraća niz (paralelan sa rows) lista { field, source: "database" | "file", ref } — ref je ime radnika ili broj reda.
 */
export function findDuplicates(rows, existing = []) {
  const keys = {
    employee_id: (v) => String(v ?? "").trim().toUpperCase(),
    email: (v) => String(v ?? "").trim().toLowerCase(),
    jmbg: (v) => String(v ?? "").trim(),
  };
  const db = {};
  for (const [field, norm] of Object.entries(keys)) {
    db[field] = new Map();
    for (const e of existing) {
      const k = norm(e[field]);
      if (k && !db[field].has(k)) db[field].set(k, `${e.first_name || ""} ${e.last_name || ""}`.trim() || e.employee_id || "");
    }
  }
  const seen = { employee_id: new Map(), email: new Map(), jmbg: new Map() };
  return rows.map((row) => {
    const dups = [];
    for (const [field, norm] of Object.entries(keys)) {
      const k = norm(row.data?.[field]);
      if (!k) continue;
      if (db[field].has(k)) dups.push({ field, source: "database", ref: db[field].get(k) });
      else if (seen[field].has(k)) dups.push({ field, source: "file", ref: seen[field].get(k) });
      else seen[field].set(k, row.line);
    }
    return dups;
  });
}

/**
 * Plan uvoza: koji redovi idu, koji se preskaču i zašto; prazne šifre dobijaju EMP-xxx redom posle najveće
 * postojeće (u bazi i u fajlu). Šifra radnika je jedinstvena u bazi, pa je njen duplikat uvek prepreka;
 * duplikat emaila/JMBG-a se preskače samo ako je `skipDuplicates` uključen.
 * rows: [{ line, data, errors, warnings }]
 */
export function planImport(rows, existing = [], { skipDuplicates = true } = {}) {
  const dups = findDuplicates(rows, existing);
  let n = maxEmployeeNumber([...existing.map((e) => e.employee_id), ...rows.map((r) => r.data?.employee_id)]);
  return rows.map((row, i) => {
    const duplicates = dups[i];
    const idDup = duplicates.some((d) => d.field === "employee_id");
    let status = "ok";
    if (row.errors.length) status = "error";
    else if (idDup || (skipDuplicates && duplicates.length)) status = "duplicate";
    const data = { ...row.data };
    if (status === "ok" && !data.employee_id) data.employee_id = formatEmployeeId(++n);
    return { ...row, data, duplicates, status };
  });
}

/** Izveštaj (CSV) o redovima koji nisu uvezeni. T prevodi poruke; fieldLabel(key) daje naziv kolone. */
export function errorReportCsv(results, { T = (s) => s, fieldLabel = (k) => k } = {}) {
  const head = [T("Row"), T("Employee"), T("Employee ID"), T("Result"), T("Details")];
  const body = results
    .filter((r) => r.status !== "imported")
    .map((r) => {
      const details = [
        ...(r.errors || []).map((e) => `${T(fieldLabel(e.field))}: ${T(e.key)}`),
        ...(r.duplicates || []).map((d) => `${T("Duplicate")} ${T(fieldLabel(d.field))} — ${d.source === "file" ? `${T("row")} ${d.ref}` : `${T("existing employee")} ${d.ref}`}`),
        ...(r.importError ? [r.importError] : []),
      ];
      return [
        r.line,
        `${r.data?.first_name || ""} ${r.data?.last_name || ""}`.trim(),
        r.data?.employee_id || "",
        T(RESULT_LABELS[r.status] || r.status),
        details.join(" | "),
      ];
    });
  return toCsv([head, ...body], ";");
}

export const RESULT_LABELS = {
  ok: "Ready", error: "Error", duplicate: "Duplicate", imported: "Imported", failed: "Failed",
};
