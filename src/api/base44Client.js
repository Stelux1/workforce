// Sloj podataka sa ISTIM pozivima kao Base44 SDK (`base44.entities.X.list/filter/get/create/update/delete`,
// `base44.integrations.Core.UploadFile`, `base44.auth.*`), ali nad Supabase-om (D1, D12).
// Stranice iz Base44 izvoza zato rade bez izmena; pravila (uloge, zaključavanje) sprovodi baza.

import { toast } from "sonner";
import { requireSupabase } from "@/api/supabase";
import { TABLE_COLUMNS } from "@/api/schema.generated";
import { dataError, msg, plainError } from "@/api/errors";

const ENTITY_TABLES = {
  Employee: "employees",
  EmploymentHistory: "employment_history",
  Vendor: "vendors",
  Client: "clients",
  Project: "projects",
  ProjectAssignment: "project_assignments",
  Rate: "rates",
  Timesheet: "timesheets",
  PayrollRecord: "payroll_records",
  ProjectCost: "project_costs",
  CostCategory: "cost_categories",
  DepartmentConfig: "department_configs",
  Document: "documents",
  LeaveRequest: "leave_requests",
  AttendanceRecord: "attendance_records",
  Schedule: "schedules",
  Task: "tasks",
  Notification: "notifications",
  EmailTemplate: "email_templates",
  // novo (nije postojalo u Base44)
  HourType: "hour_types",
  Holiday: "holidays",
  WorkRules: "work_rules",
  PayrollRun: "payroll_runs",
  Payslip: "payslips",
  PayslipProject: "payslip_projects",
  PayrollParams: "payroll_params",
  MonthLock: "month_locks",
  Profile: "profiles",
};

const SYSTEM_FIELDS = new Set(["id", "created_date", "updated_date", "created_by"]);
const PRIVATE_EMPLOYEE_FIELDS = new Set(
  (TABLE_COLUMNS.employee_private || []).filter((c) => c !== "employee_id" && c !== "updated_date")
);

// Polja koja čuvaju fajl. U bazi je trajna referenca `storage://files/<putanja>`, a stranica dobija potpisan link.
const FILE_FIELDS = { documents: ["file_url"], timesheets: ["attachment_url"], employees: ["profile_photo"] };
const BUCKET = "files";
const STORAGE_PREFIX = `storage://${BUCKET}/`;
export const SIGNED_URL_SECONDS = 60 * 60;
// PostgREST vraća najviše `max_rows` redova po zahtevu (supabase/config.toml: 1000) i to tiho. Zato se veći
// spiskovi čitaju u delovima — ranije su izveštaji preko 500/1000 satnica tiho gubili redove (QA 14.11.2026).
export const PAGE_SIZE = 1000;
// Kolona po kojoj je redosled stabilan između delova (primarni ključ).
const STABLE_ORDER = { hour_types: "code", holidays: "date", month_locks: "month", employee_private: "employee_id", payslip_projects: "payslip_id" };

// Tabele čiji primarni ključ nije kolona `id` (get/update/delete/create idu preko njega).
export const PRIMARY_KEY = { hour_types: "code", holidays: "date", work_rules: "id", month_locks: "month", employee_private: "employee_id" };

const isDev = import.meta.env?.DEV;
const warn = (...args) => {
  if (isDev) console.warn("[podaci]", ...args);
};

// ───────────────────────── uloga (keš po sesiji) ─────────────────────────
let adminPromise = null;
function isAdmin() {
  if (!adminPromise) {
    const sb = requireSupabase();
    adminPromise = sb.rpc("is_admin").then(({ data, error }) => !error && data === true);
    sb.auth.onAuthStateChange(() => {
      adminPromise = null;
    });
  }
  return adminPromise;
}

// ───────────────────────── pomoćne funkcije ─────────────────────────
// Poruka greške je za korisnika (src/api/errors.js); originalna poruka baze ide u konzolu.
const toError = (error, context) => dataError(error, context);

function parseSort(sort, table) {
  if (!sort || typeof sort !== "string") return null;
  const desc = sort.startsWith("-");
  const column = desc ? sort.slice(1) : sort;
  if (!(TABLE_COLUMNS[table] || []).includes(column)) {
    warn(`Sortiranje po nepostojećem polju "${column}" u ${table} je preskočeno`);
    return null;
  }
  return { column, ascending: !desc };
}

// list(sort, limit) / filter(query, sort, limit) / filter(query, { sort, limit })
function parseOptions(sortOrOptions, limit) {
  if (sortOrOptions && typeof sortOrOptions === "object") {
    return { sort: sortOrOptions.sort, limit: sortOrOptions.limit, distinct: sortOrOptions.distinct };
  }
  return { sort: sortOrOptions, limit };
}

function applyQuery(q, query, table) {
  const columns = TABLE_COLUMNS[table] || [];
  for (const [field, value] of Object.entries(query || {})) {
    if (!columns.includes(field)) {
      // Base44 vraća prazno za nepostojeće polje; isto radimo i ovde umesto da tiho vratimo sve redove.
      warn(`Filter po nepostojećem polju "${field}" u ${table}`);
      return { q, empty: true };
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [op, v] of Object.entries(value)) {
        if (op === "$gte") q = q.gte(field, v);
        else if (op === "$lte") q = q.lte(field, v);
        else if (op === "$gt") q = q.gt(field, v);
        else if (op === "$lt") q = q.lt(field, v);
        else if (op === "$ne") q = v === null ? q.not(field, "is", null) : q.neq(field, v);
        else if (op === "$in") q = q.in(field, v);
        else throw new Error(`Nepodržan operator filtera: ${op}`);
      }
    } else if (Array.isArray(value)) {
      q = q.in(field, value);
    } else if (value === null || value === undefined) {
      q = q.is(field, null);
    } else {
      q = q.eq(field, value);
    }
  }
  return { q, empty: false };
}

// Prazno polje iz forme ("") postaje null; prazni sati postaju 0 (kolone sati ne primaju prazno).
function cleanValue(key, value) {
  if (value === "") return key.endsWith("_hours") ? 0 : null;
  return value;
}

// Potpisan link (koji ističe) se pri čuvanju vraća u trajnu referencu.
function toStorageRef(value) {
  if (typeof value !== "string") return value;
  const marker = `/storage/v1/object/sign/${BUCKET}/`;
  const i = value.indexOf(marker);
  if (i === -1) return value;
  const path = decodeURIComponent(value.slice(i + marker.length).split("?")[0]);
  return STORAGE_PREFIX + path;
}

function preparePayload(table, data) {
  const columns = TABLE_COLUMNS[table];
  if (!columns) throw new Error(`Nepoznata tabela: ${table}`);
  const out = {};
  const dropped = [];
  for (const [key, raw] of Object.entries(data || {})) {
    if (SYSTEM_FIELDS.has(key)) continue;
    if (table === "employees" && PRIVATE_EMPLOYEE_FIELDS.has(key)) continue; // ide u employee_private
    if (!columns.includes(key)) {
      dropped.push(key);
      continue;
    }
    let value = cleanValue(key, raw);
    if ((FILE_FIELDS[table] || []).includes(key)) value = toStorageRef(value);
    out[key] = value;
  }
  if (dropped.length) warn(`Polja koja ne postoje u ${table} nisu sačuvana: ${dropped.join(", ")}`);
  return out;
}

async function signFileFields(table, rows) {
  const fields = FILE_FIELDS[table];
  if (!fields || !rows.length) return rows;
  const paths = new Set();
  for (const row of rows) {
    for (const f of fields) {
      if (typeof row[f] === "string" && row[f].startsWith(STORAGE_PREFIX)) paths.add(row[f].slice(STORAGE_PREFIX.length));
    }
  }
  if (!paths.size) return rows;
  const { data, error } = await requireSupabase().storage.from(BUCKET).createSignedUrls([...paths], SIGNED_URL_SECONDS);
  if (error) {
    warn("Potpisani linkovi nisu napravljeni:", error.message);
    return rows;
  }
  const signed = new Map((data || []).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
  return rows.map((row) => {
    const copy = { ...row };
    for (const f of fields) {
      if (typeof copy[f] === "string" && copy[f].startsWith(STORAGE_PREFIX)) {
        copy[f] = signed.get(copy[f].slice(STORAGE_PREFIX.length)) || null;
      }
    }
    return copy;
  });
}

// Uklanja fajlove iz Storage-a kad zapis koji ih je koristio nestane ili dobije drugi fajl (QA 14.11.2026:
// obrisan dokument i zamenjena fotografija ostajali su u bucketu i bili dostupni preko potpisanog linka).
function storagePaths(values) {
  return [...new Set(values.map((v) => toStorageRef(v)).filter((v) => typeof v === "string" && v.startsWith(STORAGE_PREFIX))
    .map((v) => v.slice(STORAGE_PREFIX.length)))];
}
async function removeFiles(paths, context) {
  if (!paths.length) return;
  const { error } = await requireSupabase().storage.from(BUCKET).remove(paths);
  if (error) warn(`Fajlovi nisu obrisani (${context}):`, error.message);
}

// Briše fajl otpremljen u formi koja je otkazana/zatvorena pre čuvanja (QA 14.11.2026). Prima potpisan link ili
// storage:// referencu; sve što nije u našem bucketu se ignoriše. Greška se samo beleži, korisnik je ne vidi.
async function DiscardUpload({ file_url } = {}) {
  try {
    await removeFiles(storagePaths([file_url]), "DiscardUpload");
  } catch (e) {
    warn("Otpremljeni fajl nije obrisan (DiscardUpload):", e?.message || e);
  }
}

// ───────────────────────── generički entitet ─────────────────────────
function makeEntity(name, table) {
  const selectCols = table === "employees" ? "*, employee_private(*)" : "*";

  const finish = async (rows) => {
    let out = rows || [];
    if (table === "employees") {
      out = out.map(({ employee_private: priv, ...row }) => {
        if (!priv) return row;
        const { employee_id: _ignored, updated_date: _ignored2, ...privFields } = priv;
        return { ...row, ...privFields };
      });
    }
    return signFileFields(table, out);
  };

  const stableColumn = STABLE_ORDER[table] || "id";
  const pk = PRIMARY_KEY[table] || "id";

  // Čita sve tražene redove u delovima od PAGE_SIZE (do `max`), uz stabilan redosled.
  const readPages = async (build, max, context) => {
    const rows = [];
    for (let from = 0; rows.length < max; from += PAGE_SIZE) {
      const to = Math.min(from + PAGE_SIZE, max) - 1;
      const { data, error } = await build().range(from, to);
      if (error) throw toError(error, context);
      rows.push(...(data || []));
      if ((data || []).length < to - from + 1) break;
    }
    return rows;
  };

  const runSelect = async (query, sortOrOptions, limit) => {
    const opts = parseOptions(sortOrOptions, limit);
    const sb = requireSupabase();
    if (opts.distinct) {
      const column = opts.distinct;
      if (!(TABLE_COLUMNS[table] || []).includes(column)) throw new Error(`Nepostojeće polje: ${column}`);
      const rows = await readPages(
        () => sb.from(table).select(column).not(column, "is", null).order(column).order(stableColumn),
        Infinity, `${name}.distinct`);
      return [...new Set(rows.map((r) => r[column]))];
    }
    if (applyQuery(sb.from(table).select(selectCols), query, table).empty) return [];
    const sort = parseSort(opts.sort, table);
    const max = Number(opts.limit) > 0 ? Number(opts.limit) : Infinity;
    const build = () => {
      let q = applyQuery(sb.from(table).select(selectCols), query, table).q;
      if (sort) q = q.order(sort.column, { ascending: sort.ascending, nullsFirst: false });
      if (!sort || sort.column !== stableColumn) q = q.order(stableColumn);
      return q;
    };
    return finish(await readPages(build, max, `${name}.list`));
  };

  const writePrivate = async (id, data) => {
    if (table !== "employees") return;
    const priv = {};
    for (const [k, v] of Object.entries(data || {})) {
      if (PRIVATE_EMPLOYEE_FIELDS.has(k) && v !== undefined) priv[k] = cleanValue(k, v);
    }
    if (!Object.keys(priv).length) return;
    if (!(await isAdmin())) {
      // Glavni zapis je već sačuvan, pa ovo nije greška nego upozorenje (inače bi ponovno čuvanje napravilo duplikat).
      if (Object.values(priv).some((v) => v !== null)) toast.warning(msg("privateSkipped"), { duration: 10000 });
      warn("Operater ne može da menja lične/platne podatke radnika — preskočeno");
      return;
    }
    const { error } = await requireSupabase()
      .from("employee_private")
      .upsert({ employee_id: id, ...priv }, { onConflict: "employee_id" });
    if (error) throw toError(error, `${name}.private`);
  };

  const getOne = async (id) => {
    const { data, error } = await requireSupabase().from(table).select(selectCols).eq(pk, id).maybeSingle();
    if (error) throw toError(error, `${name}.get`);
    if (!data) throw plainError("notFound", `${name}.get`);
    return (await finish([data]))[0];
  };

  return {
    list: (sortOrOptions, limit) => runSelect(null, sortOrOptions, limit),
    filter: (query, sortOrOptions, limit) => runSelect(query, sortOrOptions, limit),
    get: getOne,
    async create(data) {
      const payload = preparePayload(table, data);
      const { data: row, error } = await requireSupabase().from(table).insert(payload).select(pk).single();
      if (error) throw toError(error, `${name}.create`);
      await writePrivate(row[pk], data);
      return getOne(row[pk]);
    },
    async update(id, data) {
      const payload = preparePayload(table, data);
      const fileFields = (FILE_FIELDS[table] || []).filter((f) => f in payload);
      let oldFiles = [];
      if (fileFields.length) {
        const { data: old } = await requireSupabase().from(table).select(fileFields.join(",")).eq(pk, id).maybeSingle();
        oldFiles = fileFields.filter((f) => old?.[f] && toStorageRef(old[f]) !== payload[f]).map((f) => old[f]);
      }
      if (Object.keys(payload).length) {
        // RLS ne baca grešku kad korisnik nema pravo da menja red — samo ne izmeni ništa. Zato tražimo nazad
        // izmenjen red: ako ga nema, izmena nije prošla i to mora da se kaže, a ne da izgleda kao uspeh.
        const { data: changed, error } = await requireSupabase().from(table).update(payload).eq(pk, id).select(pk);
        if (error) throw toError(error, `${name}.update`);
        if (!changed?.length) throw plainError("noRows", `${name}.update`);
      }
      await writePrivate(id, data);
      await removeFiles(storagePaths(oldFiles), `${name}.update`);
      return getOne(id);
    },
    async delete(id) {
      const sb = requireSupabase();
      // Fajlovi zapisa (i dokumenata radnika, koje baza briše kaskadno) — brišu se tek posle uspešnog brisanja.
      const files = [];
      const fileFields = FILE_FIELDS[table] || [];
      if (fileFields.length) {
        const { data: row } = await sb.from(table).select(fileFields.join(",")).eq(pk, id).maybeSingle();
        fileFields.forEach((f) => row?.[f] && files.push(row[f]));
      }
      if (table === "employees") {
        const { data: docs } = await sb.from("documents").select("file_url").eq("employee_id", id);
        (docs || []).forEach((d) => d.file_url && files.push(d.file_url));
      }
      const { data: removed, error } = await sb.from(table).delete().eq(pk, id).select(pk);
      if (error) throw toError(error, `${name}.delete`);
      if (!removed?.length) throw plainError("noRows", `${name}.delete`);
      await removeFiles(storagePaths(files), `${name}.delete`);
      return { id };
    },
  };
}

const entities = Object.fromEntries(Object.entries(ENTITY_TABLES).map(([name, table]) => [name, makeEntity(name, table)]));

// ───────────────────────── integracije ─────────────────────────
// Sadržaj fajla mora da odgovara tipu (QA: .exe preimenovan u .pdf je prolazio jer se gledao samo naziv/tip).
const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"];
async function sniffType(file) {
  const b = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const ascii = (from, to) => String.fromCharCode(...b.slice(from, to));
  if (ascii(0, 5) === "%PDF-") return "application/pdf";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && ascii(1, 4) === "PNG") return "image/png";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (ascii(4, 8) === "ftyp" && /^(heic|heix|hevc|hevx|mif1|msf1)$/.test(ascii(8, 12))) return "image/heic";
  return null;
}

async function UploadFile({ file, maxBytes }) {
  if (!file) throw plainError("noFile", "UploadFile");
  if (maxBytes && file.size > maxBytes) throw plainError(maxBytes <= 5 * 1024 * 1024 ? "photoTooBig" : "fileTooBig", "UploadFile");
  if (file.size > 20 * 1024 * 1024) throw plainError("fileTooBig", "UploadFile");
  const real = await sniffType(file);
  if (!real) throw plainError(ALLOWED_TYPES.includes(file.type) ? "fileContent" : "fileType", "UploadFile");
  const safe = (file.name || "fajl").normalize("NFKD").replace(/[^\w.-]+/g, "_").slice(-120);
  const path = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}-${safe}`;
  const { error } = await requireSupabase().storage.from(BUCKET).upload(path, file, { contentType: real });
  if (error) throw toError(error, "UploadFile");
  const { data } = await requireSupabase().storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
  // Stranica odmah čuva ovaj link; pri čuvanju se vraća u trajnu referencu (toStorageRef).
  return { file_url: data?.signedUrl || STORAGE_PREFIX + path, storage_ref: STORAGE_PREFIX + path };
}

async function SendEmail() {
  throw plainError("emailNotConfigured", "SendEmail");
}

// ───────────────────────── prijava (za stare pozive iz Base44 stranica) ─────────────────────────
const auth = {
  async me() {
    const sb = requireSupabase();
    const { data } = await sb.auth.getUser();
    if (!data?.user) throw new Error("Niste prijavljeni");
    const { data: profile } = await sb.from("profiles").select("*").eq("id", data.user.id).maybeSingle();
    return { id: data.user.id, email: data.user.email, ...(profile || {}) };
  },
  async isAuthenticated() {
    const { data } = await requireSupabase().auth.getSession();
    return Boolean(data?.session);
  },
  async logout() {
    await requireSupabase().auth.signOut();
  },
  async redirectToLogin() {
    await requireSupabase().auth.signOut();
  },
};

export const base44 = {
  entities,
  integrations: { Core: { UploadFile, DiscardUpload, SendEmail } },
  auth,
  rpc: async (fn, args) => {
    const { data, error } = await requireSupabase().rpc(fn, args);
    if (error) throw toError(error, fn);
    return data;
  },
};
