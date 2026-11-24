import { describe, expect, it } from "vitest";
import { parseCsv, buildTemplate } from "@/lib/csvImport";
import { analyzeVendorImport, buildReportRows, MSG, summarizeVendorImport, VENDOR_IMPORT_FIELDS, VENDOR_TEMPLATE_EXAMPLE, validateVendorRow } from "@/lib/vendorImport";

describe("šablon", () => {
  it("ima kolonu za svako polje i primer sa istim brojem kolona", () => {
    expect(VENDOR_TEMPLATE_EXAMPLE).toHaveLength(VENDOR_IMPORT_FIELDS.length);
    const parsed = parseCsv(buildTemplate(VENDOR_IMPORT_FIELDS, [VENDOR_TEMPLATE_EXAMPLE]));
    const a = analyzeVendorImport(parsed, []);
    expect(Object.keys(a.mapping)).toHaveLength(VENDOR_IMPORT_FIELDS.length);
    expect(a.counts).toEqual({ total: 1, valid: 1, duplicate: 0, error: 0 });
  });
});

describe("mapiranje", () => {
  it("srpski nazivi, Vendor ID se ignoriše", () => {
    const parsed = parseCsv("Šifra dobavljača;Naziv dobavljača;PIB;Valuta\nVEN-777;Acme;123;rsd");
    const a = analyzeVendorImport(parsed, []);
    expect(a.ignored).toEqual(["Šifra dobavljača"]);
    expect(a.items[0].data).toMatchObject({ name: "Acme", tax_number: "123", default_currency: "RSD" });
    expect(a.items[0].data.vendor_id).toBeUndefined();
  });
  it("bez kolone za naziv nema redova", () => {
    const a = analyzeVendorImport(parseCsv("PIB\n1"), []);
    expect(a.hasName).toBe(false);
    expect(a.items).toEqual([]);
  });
});

describe("validacija reda", () => {
  it("podrazumevane vrednosti", () => {
    const { data, errors } = validateVendorRow({ name: " Acme " });
    expect(errors).toEqual([]);
    expect(data).toMatchObject({ name: "Acme", default_currency: "EUR", payroll_cycle: "monthly", status: "active", email: null });
  });
  it("greške: naziv, email, valuta, ciklus, status", () => {
    const { errors } = validateVendorRow({ name: "", email: "x", default_currency: "CHF", payroll_cycle: "yearly", status: "?" });
    expect(errors).toEqual([MSG.nameRequired, MSG.email, MSG.currency, MSG.cycle, MSG.status]);
  });
  it("SR vrednosti ciklusa i statusa", () => {
    const { data } = validateVendorRow({ name: "A", payroll_cycle: "Mesečno", status: "Neaktivan" });
    expect(data).toMatchObject({ payroll_cycle: "monthly", status: "inactive" });
  });
});

describe("duplikati", () => {
  const csv = [
    "Vendor Name,Registration No.,Tax No.",
    "Acme,111,T1",
    "ACME ,222,T2",
    "Beta,111,T3",
    "Gama,333,t-1",
    "Delta,444,T4",
    "Epsilon,999,T9",
    ",555,T5",
  ].join("\n");
  it("isto ime / Registration No. / Tax No. u fajlu i bazi se preskače", () => {
    const a = analyzeVendorImport(parseCsv(csv), [{ name: "Delta", registration_number: "", tax_number: "" }, { name: "Zeta", registration_number: "9-99", tax_number: null }]);
    expect(a.items.map((i) => i.status)).toEqual(["valid", "duplicate", "duplicate", "duplicate", "duplicate", "duplicate", "error"]);
    expect(a.items[1].messages).toEqual([MSG.dupFileName]);
    expect(a.items[2].messages).toEqual([MSG.dupFileReg]);
    expect(a.items[3].messages).toEqual([MSG.dupFileTax]);
    expect(a.items[4].messages).toEqual([MSG.dupDbName]);
    expect(a.items[5].messages).toEqual([MSG.dupDbReg]);
    expect(a.counts).toEqual({ total: 7, valid: 1, duplicate: 5, error: 1 });
  });
  it("izveštaj sadrži samo redove sa greškom ili preskočene, sa brojem reda", () => {
    const a = analyzeVendorImport(parseCsv(csv), []);
    const rows = buildReportRows(a.items);
    expect(rows[0]).toEqual(["Row", "Result", "Reason", "Vendor Name"]);
    expect(rows.slice(1).map((r) => r[0])).toEqual([3, 4, 5, 8]);
  });
});

describe("rezime uvoza", () => {
  it("preskočeni = duplikati + greške iz pregleda, neuspeli posebno", () => {
    expect(summarizeVendorImport({ total: 4, valid: 2, duplicate: 1, error: 1 }, 2, 0)).toEqual({ imported: 2, skipped: 2, failed: 0 });
    expect(summarizeVendorImport({ total: 3, valid: 3, duplicate: 0, error: 0 }, 2, 1)).toEqual({ imported: 2, skipped: 0, failed: 1 });
    expect(summarizeVendorImport(undefined, 0, 0)).toEqual({ imported: 0, skipped: 0, failed: 0 });
  });
});
