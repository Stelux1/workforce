import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { sum2 } from "./money.js";
import { PAYSLIP_WARNINGS, warningLabel } from "./payrollMonth.js";
import {
  bankExportFileName, bankExportRows, bankSheetName, fileNamePart, formatHours, formatMoney, formatPercent, formatRate,
  monthNumeric, paymentDescription, payslipFileName, payslipModel, payslipsFileName, runIsFinal,
} from "./payslipExport.js";
import { companyHeader } from "@/lib/companyDetails";
import { buildBankWorkbook } from "@/lib/payrollBankExport";
import { buildPayslipsPdf } from "@/lib/payslipPdf";

// Redovi u obliku u kom ih vraća baza (PostgREST: numeric → broj). Iznosi su namerno „nezgodni" (centi, hiljade).
const PARAMS_ROW = {
  valid_from: "2026-01-01", tax_rate: 0.1, non_taxable_rsd: 34221, min_base_rsd: 51297, max_base_rsd: 732820,
  emp_pio: 0.14, emp_health: 0.0515, emp_unemployment: 0.0075, er_pio: 0.1, er_health: 0.0515,
};
const run = (status) => ({ id: "run-1", month: "2026-03-01", status, eur_rsd_rate: 117.2, params: PARAMS_ROW });

const SLIP_EMP = {
  id: "slip-1", run_id: "run-1", employee_id: "e1", employee_name: "Petar Petrović", engagement_type: "direct_employee",
  vendor_id: null, rate_basis: "neto", work_fraction: 1, total_hours: 168, hours_by_type: { redovni: 160, prekovremeni: 8 },
  basis_amount: 2112.4, bruto: 2941.07, neto: 2112.4, tax: 247.88, emp_pio: 411.75, emp_health: 151.47, emp_unemployment: 22.06,
  er_pio: 294.11, er_health: 151.47, total_cost: 3386.65, payout: 2112.4, warnings: [],
  projects: [
    { payslip_id: "slip-1", project_id: "p2", hours: 100.5, worker_amount: 1263.02, labor_cost: 2024.98, revenue: 2010 },
    { payslip_id: "slip-1", project_id: "p1", hours: 67.5, worker_amount: 849.38, labor_cost: 1361.67, revenue: 1350 },
  ],
};
const SLIP_LOW = {
  id: "slip-2", run_id: "run-1", employee_id: "e2", employee_name: "Ana Anić", engagement_type: "direct_employee",
  vendor_id: null, rate_basis: "bruto", work_fraction: 0.5, total_hours: 8, hours_by_type: { redovni: 8 },
  basis_amount: 96, bruto: 96, neto: 1.01, tax: 0, emp_pio: 30.64, emp_health: 11.27, emp_unemployment: 1.64,
  er_pio: 21.88, er_health: 11.27, total_cost: 129.15, payout: 1.01,
  warnings: [PAYSLIP_WARNINGS.BELOW_MIN_BASE],
  projects: [{ payslip_id: "slip-2", project_id: "p1", hours: 8, worker_amount: 96, labor_cost: 129.15, revenue: 160 }],
};
const SLIP_SUB = {
  id: "slip-3", run_id: "run-1", employee_id: "e3", employee_name: "Zoran Zorić", engagement_type: "subcontractor_worker",
  vendor_id: "v1", rate_basis: "neto", work_fraction: 1, total_hours: 40, hours_by_type: { redovni: 40 },
  basis_amount: 600, bruto: null, neto: null, tax: null, emp_pio: null, emp_health: null, emp_unemployment: null,
  er_pio: null, er_health: null, total_cost: 600, payout: 600, warnings: [],
  projects: [{ payslip_id: "slip-3", project_id: "p1", hours: 40, worker_amount: 600, labor_cost: 600, revenue: 800 }],
};
const SLIP_BIG = {
  ...SLIP_EMP, id: "slip-4", employee_id: "e4", employee_name: "Đorđe Šćekić", total_hours: 200,
  basis_amount: 12345.67, bruto: 17000.01, neto: 12345.67, tax: 1460.11, emp_pio: 2380, emp_health: 875.5, emp_unemployment: 127.5,
  er_pio: 1700, er_health: 875.5, total_cost: 19575.51, payout: 12345.67,
  projects: [{ payslip_id: "slip-4", project_id: "p1", hours: 200, worker_amount: 12345.67, labor_cost: 19575.51, revenue: 4000 }],
};
const PAYSLIPS = [SLIP_EMP, SLIP_LOW, SLIP_SUB, SLIP_BIG];
const EMPLOYEES = [
  { id: "e1", employee_id: "EMP-010", first_name: "Petar", last_name: "Petrović", jmbg: "0101990710008", bank_name: "Banka A", iban: "RS35160005080000123456" },
  { id: "e2", employee_id: "EMP-011", first_name: "Ana", last_name: "Anić", jmbg: null, bank_name: null, iban: "  " },
  { id: "e3", employee_id: "EMP-012", first_name: "Zoran", last_name: "Zorić", iban: "RS35000000000000000000" },
  { id: "e4", employee_id: "EMP-013", first_name: "Đorđe", last_name: "Šćekić", jmbg: "0101990710008", bank_name: "Banka B", iban: "RS35111111111111111111" },
];
const PROJECTS = [
  { id: "p1", name: "Hala A", project_number: "A-1" },
  { id: "p2", name: "Bazen", project_number: "B-2" },
];
const MONEY_FIELDS = ["basis_amount", "bruto", "emp_pio", "emp_health", "emp_unemployment", "tax", "neto", "er_pio", "er_health", "total_cost", "payout"];
// „1.234,56" → "1234.56" (vraćanje formatiranog teksta u oblik numeric(12,2) iz baze)
const unformat = (text) => text.replace(/\./g, "").replace(",", ".");

describe("formatiranje", () => {
  it("novac: 1.234,56 (rs) i 1,234.56 (en), bez promene vrednosti", () => {
    expect(formatMoney(1234.56)).toBe("1.234,56");
    expect(formatMoney(1234567.5)).toBe("1.234.567,50");
    expect(formatMoney(0)).toBe("0,00");
    expect(formatMoney(0.1)).toBe("0,10");
    expect(formatMoney(-12.3)).toBe("-12,30");
    expect(formatMoney("1234.50")).toBe("1.234,50"); // numeric kao tekst
    expect(formatMoney(1234.56, "en")).toBe("1,234.56");
    expect(formatMoney(null)).toBe("");
    expect(() => formatMoney("abc")).toThrow();
  });
  it("sati, kurs i stopa", () => {
    expect(formatHours(40)).toBe("40");
    expect(formatHours(7.5)).toBe("7,5");
    expect(formatHours(7.25)).toBe("7,25");
    expect(formatHours(1234.5)).toBe("1.234,5");
    expect(formatRate(117.2)).toBe("117,20");
    expect(formatRate(117.1234)).toBe("117,1234");
    expect(formatRate(117.123)).toBe("117,123");
    expect(formatPercent(0.0515)).toBe("5,15%");
    expect(formatPercent(0.14)).toBe("14%");
    expect(formatPercent(0.0075)).toBe("0,75%");
    expect(formatPercent(0.5)).toBe("50%");
  });
  it("mesec i nazivi fajlova", () => {
    expect(monthNumeric("2026-03-01")).toBe("03.2026");
    expect(paymentDescription(run("approved"))).toBe("Zarada 03.2026");
    expect(bankSheetName(run("approved"))).toBe("Isplate 03.2026");
    expect(bankExportFileName(run("paid"))).toBe("Isplate_zarada_2026-03.xlsx");
    expect(payslipsFileName(run("approved"))).toBe("Platni_listici_2026-03.pdf");
    expect(payslipsFileName(run("draft"))).toBe("NACRT_Platni_listici_2026-03.pdf");
    expect(payslipFileName({ run: run("approved"), slip: SLIP_BIG, employee: EMPLOYEES[3] })).toBe("Platni_listic_2026-03_EMP-013_Djordje_Scekic.pdf");
    expect(fileNamePart("  Ćirić / Ž. ")).toBe("Ciric_Z.");
  });
});

describe("platni listić: iznosi su polja iz baze, bez preračunavanja", () => {
  it("svaka stavka ima vrednost polja iz payslips (ista vrednost) i taj broj formatiran", () => {
    for (const slip of PAYSLIPS) {
      const m = payslipModel({ run: run("approved"), slip, employee: EMPLOYEES.find((e) => e.id === slip.employee_id), projects: PROJECTS });
      for (const a of m.amounts) {
        expect(a.value).toBe(slip[a.field]);
        expect(a.text).toBe(formatMoney(slip[a.field]));
        expect(unformat(a.text)).toBe(Number(slip[a.field]).toFixed(2));
      }
      // Prikazane su tačno stavke koje u bazi nisu prazne.
      expect(m.amounts.map((a) => a.field)).toEqual(MONEY_FIELDS.filter((f) => slip[f] !== null));
      expect(m.totalHours).toBe(slip.total_hours);
      expect(m.basisAmount).toBe(slip.basis_amount);
      for (const p of m.projects) {
        const row = slip.projects.find((r) => r.project_id === p.projectId);
        expect(p.hours).toBe(row.hours);
        expect(p.workerAmount).toBe(row.worker_amount);
        expect(unformat(p.workerAmountText)).toBe(Number(row.worker_amount).toFixed(2));
      }
      for (const h of m.hoursByType) expect(h.value).toBe(slip.hours_by_type[h.code]);
    }
  });
  it("neusklađeni iznosi se ne popravljaju — PDF prikazuje tačno ono što je u bazi", () => {
    // neto ≠ bruto − doprinosi − porez: helper i dalje prikazuje polja baze (proveru usklađenosti radi baza, D17).
    const odd = { ...SLIP_EMP, neto: 1, payout: 2, bruto: 3 };
    const m = payslipModel({ run: run("approved"), slip: odd, projects: PROJECTS });
    expect(m.amounts.find((a) => a.field === "neto").text).toBe("1,00");
    expect(m.amounts.find((a) => a.field === "payout").text).toBe("2,00");
    expect(m.amounts.find((a) => a.field === "bruto").text).toBe("3,00");
  });
  it("za isplatu = payout, stope iz parametara obračuna, upozorenja preko warningLabel", () => {
    const m = payslipModel({ run: run("approved"), slip: SLIP_LOW, employee: EMPLOYEES[1], projects: PROJECTS });
    const payout = m.amounts.find((a) => a.payout);
    expect(payout.field).toBe("payout");
    expect(payout.text).toBe("1,01");
    expect(m.amounts.find((a) => a.field === "emp_pio").label).toBe("Doprinos za PIO — zaposleni (14%)");
    expect(m.amounts.find((a) => a.field === "tax").label).toBe("Porez na zaradu (10%)");
    expect(m.amounts.find((a) => a.field === "basis_amount").label).toBe("Zarada po satnici (bruto)");
    expect(m.warnings).toEqual([{ code: PAYSLIP_WARNINGS.BELOW_MIN_BASE, text: warningLabel(PAYSLIP_WARNINGS.BELOW_MIN_BASE, "rs") }]);
    expect(m.eurRsdRateText).toBe("117,20");
    expect(m.workFractionText).toBe("50%");
    expect(m.employeeCode).toBe("EMP-011");
  });
  it("podizvođač: bez poreza i doprinosa, samo iznos sati, trošak i za isplatu", () => {
    const m = payslipModel({ run: run("paid"), slip: SLIP_SUB, projects: PROJECTS, vendorName: "Podizvođač d.o.o." });
    expect(m.amounts.map((a) => a.field)).toEqual(["basis_amount", "total_cost", "payout"]);
    expect(m.vendorName).toBe("Podizvođač d.o.o.");
    expect(m.subcontractor).toBe(true);
  });
  it("projekti po nazivu, sati po vrsti redom redovni → prekovremeni", () => {
    const m = payslipModel({ run: run("approved"), slip: SLIP_EMP, projects: PROJECTS });
    expect(m.projects.map((p) => p.name)).toEqual(["Bazen", "Hala A"]);
    expect(m.hoursByType.map((h) => [h.code, h.text])).toEqual([["redovni", "160"], ["prekovremeni", "8"]]);
    expect(m.draft).toBe(false);
    expect(payslipModel({ run: run("draft"), slip: SLIP_EMP }).draft).toBe(true);
  });
});

describe("spisak isplata za banku", () => {
  const rows = bankExportRows({ run: run("approved"), payslips: PAYSLIPS, employees: EMPLOYEES, vendorNames: new Map([["v1", "Podizvođač d.o.o."]]) });

  it("samo za odobren ili isplaćen obračun", () => {
    expect(runIsFinal(run("approved"))).toBe(true);
    expect(runIsFinal(run("paid"))).toBe(true);
    expect(() => bankExportRows({ run: run("draft"), payslips: PAYSLIPS, employees: EMPLOYEES })).toThrow(/odobren ili isplaćen/);
    expect(() => bankExportRows({ run: null, payslips: PAYSLIPS })).toThrow();
  });
  it("iznos = payslips.neto (ista vrednost), zbir spiska = zbir neto svih listića", () => {
    const listed = [...rows.payments, ...rows.invalidAmount, ...rows.missingAccount];
    for (const r of listed) expect(r.amount).toBe(PAYSLIPS.find((s) => s.employee_id === r.employeeId).neto);
    expect(sum2(listed.map((r) => r.amount))).toBe(sum2(PAYSLIPS.map((s) => s.neto ?? 0)));
    expect(sum2(listed.map((r) => r.amount))).toBe(14459.08);
  });
  it("radnik bez računa je na posebnom spisku, podizvođač posebno — niko nije tiho preskočen", () => {
    expect(rows.payments.map((r) => r.employeeName)).toEqual(["Đorđe Šćekić", "Petar Petrović"]);
    expect(rows.payments[1]).toMatchObject({ no: 2, employeeCode: "EMP-010", jmbg: "0101990710008", bankName: "Banka A", account: "RS35160005080000123456", currency: "EUR", description: "Zarada 03.2026" });
    expect(rows.missingAccount.map((r) => r.employeeName)).toEqual(["Ana Anić"]); // IBAN samo razmaci = nema računa
    expect(rows.subcontractors).toEqual([
      { no: 1, employeeId: "e3", employeeName: "Zoran Zorić", employeeCode: "EMP-012", vendorName: "Podizvođač d.o.o.", amount: 600, currency: "EUR" },
    ]);
    expect(rows.invalidAmount).toEqual([]);
    const all = [...rows.payments, ...rows.invalidAmount, ...rows.missingAccount, ...rows.subcontractors].map((r) => r.employeeId).sort();
    expect(all).toEqual(PAYSLIPS.map((s) => s.employee_id).sort()); // svaki listić tačno jednom
  });
  it("iznos ≤ 0 nikad nije u spisku za banku — poseban spisak uz upozorenje (i kad radnik ima račun)", () => {
    const neg = { ...SLIP_LOW, id: "slip-5", employee_id: "e1", employee_name: "Petar Petrović", neto: -12.5, payout: -12.5, warnings: [PAYSLIP_WARNINGS.NEGATIVE_NET] };
    const zero = { ...SLIP_LOW, id: "slip-6", employee_id: "e4", employee_name: "Đorđe Šćekić", neto: 0, payout: 0 };
    const noAccount = { ...SLIP_LOW, neto: -0.01, payout: -0.01 }; // bez računa i sa iznosom ≤ 0 → iznos je prvi problem
    const slips = [neg, zero, noAccount, SLIP_BIG];
    const r = bankExportRows({ run: run("approved"), payslips: slips.map((x, i) => ({ ...x, employee_id: x === SLIP_BIG ? "e3x" : x.employee_id, id: `s${i}` })), employees: [...EMPLOYEES, { ...EMPLOYEES[3], id: "e3x", employee_id: "EMP-099" }] });
    expect(r.payments.map((x) => x.amount)).toEqual([SLIP_BIG.neto]);
    expect(r.payments.every((x) => x.amount > 0)).toBe(true);
    expect(r.invalidAmount.map((x) => [x.employeeName, x.amount])).toEqual([["Ana Anić", -0.01], ["Đorđe Šćekić", 0], ["Petar Petrović", -12.5]]);
    expect(r.missingAccount).toEqual([]);
    const listed = [...r.payments, ...r.invalidAmount, ...r.missingAccount];
    expect(sum2(listed.map((x) => x.amount))).toBe(sum2(slips.map((x) => x.neto)));
    const wb = buildBankWorkbook(r, run("approved"));
    expect(wb.SheetNames).toEqual(["Isplate 03.2026", "Iznos nije za isplatu"]);
    const pay = XLSX.utils.sheet_to_json(wb.Sheets["Isplate 03.2026"], { header: 1 });
    expect(pay.slice(1).map((x) => x[6])).toEqual([SLIP_BIG.neto]);
    const invalid = XLSX.utils.sheet_to_json(wb.Sheets["Iznos nije za isplatu"], { header: 1 });
    expect(invalid.slice(1).map((x) => x[4])).toEqual([-0.01, 0, -12.5]);
    expect(invalid[1][7]).toMatch(/nije u spisku za banku/);
    expect(invalid.slice(1).every((x) => x[5] === "EUR")).toBe(true); // valuta je uvek upisana
  });
  it("zaposleni bez neto iznosa je greška, ne 0", () => {
    expect(() => bankExportRows({ run: run("approved"), payslips: [{ ...SLIP_EMP, neto: null }], employees: EMPLOYEES })).toThrow(/bez neto/);
  });
  it("Excel: iznosi kao brojevi iz baze, JMBG i račun kao tekst, posebni listovi", () => {
    const wb = buildBankWorkbook(rows, run("approved"));
    const back = XLSX.read(XLSX.write(wb, { type: "array", bookType: "xlsx" }), { type: "array", cellNF: true });
    expect(back.SheetNames).toEqual(["Isplate 03.2026", "Nedostaje račun", "Podizvođači"]);
    const pay = XLSX.utils.sheet_to_json(back.Sheets["Isplate 03.2026"], { header: 1 });
    expect(pay[0]).toEqual(["Rb.", "Ime i prezime", "Šifra radnika", "JMBG", "Banka", "Račun (IBAN)", "Iznos", "Valuta", "Opis plaćanja"]);
    expect(pay.slice(1).map((r) => r[6])).toEqual([SLIP_BIG.neto, SLIP_EMP.neto]);
    expect(pay[2][3]).toBe("0101990710008"); // vodeća nula ostaje
    expect(back.Sheets["Isplate 03.2026"].G2.t).toBe("n");
    expect(back.Sheets["Isplate 03.2026"].G2.z).toBe("#,##0.00");
    const missing = XLSX.utils.sheet_to_json(back.Sheets["Nedostaje račun"], { header: 1 });
    expect(missing[1].slice(0, 5)).toEqual([1, "Ana Anić", "EMP-011", "", SLIP_LOW.neto]);
    const excelSum = sum2([...pay.slice(1).map((r) => r[6]), ...missing.slice(1).map((r) => r[4])]);
    expect(excelSum).toBe(sum2(PAYSLIPS.map((s) => s.neto ?? 0)));
  });
  it("radnik bez JMBG-a ostaje u isplatama, ali je prijavljen: missingJmbg + list Nedostaje JMBG", () => {
    const noJmbg = { ...SLIP_BIG, id: "s-nj", employee_id: "e5", employee_name: "Bez Jmbga" };
    const emps = [...EMPLOYEES, { id: "e5", employee_id: "EMP-050", first_name: "Bez", last_name: "Jmbga", jmbg: "  ", bank_name: "Banka C", iban: "RS35222222222222222222" }];
    const r = bankExportRows({ run: run("approved"), payslips: [SLIP_EMP, noJmbg], employees: emps });
    expect(r.payments.map((x) => x.employeeName)).toEqual(["Bez Jmbga", "Petar Petrović"]); // nije izbačen iz isplata
    expect(r.missingJmbg).toEqual([expect.objectContaining({ no: 1, employeeName: "Bez Jmbga", employeeCode: "EMP-050", account: "RS35222222222222222222", amount: SLIP_BIG.neto })]);
    const wb = buildBankWorkbook(r, run("approved"));
    expect(wb.SheetNames).toEqual(["Isplate 03.2026", "Nedostaje JMBG"]);
    const sheet = XLSX.utils.sheet_to_json(wb.Sheets["Nedostaje JMBG"], { header: 1 });
    expect(sheet[1].slice(0, 3)).toEqual([1, "Bez Jmbga", "EMP-050"]);
    expect(sheet[1][7]).toMatch(/Nedostaje JMBG/);
    expect(sheet[1][5]).toBe(SLIP_BIG.neto);
    // svi radnici sa JMBG-om → nema upozorenja ni lista
    const ok = bankExportRows({ run: run("paid"), payslips: [SLIP_EMP], employees: EMPLOYEES });
    expect(ok.missingJmbg).toEqual([]);
  });
  it("bez radnika bez računa i bez podizvođača — samo list isplata", () => {
    const only = bankExportRows({ run: run("paid"), payslips: [SLIP_EMP], employees: EMPLOYEES });
    expect(buildBankWorkbook(only, run("paid")).SheetNames).toEqual(["Isplate 03.2026"]);
  });
});

describe("zaglavlje firme", () => {
  it("prazni podaci firme → nema zaglavlja (bez izmišljenog teksta)", () => {
    expect(companyHeader(null)).toBe(null);
    expect(companyHeader({ id: true, name: null, pib: "", logo_url: null })).toBe(null);
  });
  it("samo uneta polja", () => {
    expect(companyHeader({ name: "Firma d.o.o." })).toEqual({ name: "Firma d.o.o.", city: "", lines: [], footer: "Firma d.o.o.", logoUrl: null });
    const full = companyHeader({ name: "Firma d.o.o.", pib: "123456789", registration_number: "12345678", address: "Ulica 1", city: "Beograd", logo_url: "https://x/logo.png" });
    expect(full.lines).toEqual(["Ulica 1, Beograd", "PIB: 123456789  ·  MB: 12345678"]);
    expect(full.footer).toBe("Firma d.o.o.  ·  Ulica 1, Beograd  ·  PIB: 123456789  ·  MB: 12345678");
    expect(full.logoUrl).toBe("https://x/logo.png");
    expect(companyHeader({ logo_url: "https://x/logo.png" })).toMatchObject({ name: "", lines: [], logoUrl: "https://x/logo.png" });
  });
});

describe("PDF platnog listića", () => {
  const company = { ...companyHeader({ name: "Firma d.o.o.", pib: "123456789", city: "Beograd" }), logo: null };
  const pdfText = (doc) => doc.output();

  it("ima iznose iz baze, jedan listić po strani", () => {
    const doc = buildPayslipsPdf({ run: run("approved"), payslips: [SLIP_EMP, SLIP_BIG], employees: EMPLOYEES, projects: PROJECTS, company });
    expect(doc.getNumberOfPages()).toBe(2);
    const out = pdfText(doc);
    for (const v of [SLIP_EMP.neto, SLIP_EMP.bruto, SLIP_EMP.tax, SLIP_EMP.total_cost, SLIP_BIG.payout, SLIP_BIG.emp_health]) {
      expect(out).toContain(`(${formatMoney(v)})`);
    }
    expect(out).toContain("(Firma d.o.o.)");
    expect(out).toContain("PIB: 123456789");
    expect(out).not.toContain("nije za isplatu");
  });
  it("nacrt dobija vodeni žig, bez podataka firme nema zaglavlja", () => {
    const out = pdfText(buildPayslipsPdf({ run: run("draft"), payslips: [SLIP_LOW], employees: EMPLOYEES, projects: PROJECTS, company: null }));
    expect(out).toContain("nije za isplatu");
    expect(out).not.toContain("PIB:");
  });
  it("bez listića nema PDF-a", () => {
    expect(() => buildPayslipsPdf({ run: run("approved"), payslips: [] })).toThrow();
  });
});
