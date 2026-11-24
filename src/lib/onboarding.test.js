import { describe, expect, it } from "vitest";
import {
  addDaysIso, bestDocument, isExportable, onboardingAssignment, packageStatus, projectOnboarding,
  requirementStatus, requirementWindow, requirementsForAssignment, workerReadiness, zipEntryName,
} from "./onboarding";

// Isti primer kao pgTAP 26 (supabase/tests/26_onboarding.test.sql).
const TODAY = "2035-03-01";
const P = "p1";
const WELDER = "role-welder";
const FITTER = "role-fitter";
const TYPES = [
  { code: "passport", sensitive: true },
  { code: "certificate", sensitive: false },
  { code: "safety_certificate", sensitive: false },
  { code: "medical_certificate", sensitive: true },
];
const REQS = [
  { id: "q-pass", project_id: P, project_role_id: null, document_type: "passport", mandatory: true, validity_rule: "assignment_period", expiring_soon_days: 30, exportable: true },
  { id: "q-safety", project_id: P, project_role_id: null, document_type: "safety_certificate", mandatory: true, validity_rule: "assignment_start", expiring_soon_days: 30, exportable: true },
  { id: "q-weld", project_id: P, project_role_id: WELDER, document_type: "certificate", mandatory: true, validity_rule: "assignment_period", expiring_soon_days: 30, exportable: true },
  { id: "q-med", project_id: P, project_role_id: null, document_type: "medical_certificate", mandatory: false, validity_rule: "none", expiring_soon_days: 30, exportable: true },
  { id: "q-other-project", project_id: "p2", project_role_id: null, document_type: "certificate", mandatory: true },
];
const welder = { id: "a-w", employee_id: "e-w", project_id: P, project_role_id: WELDER, start_date: "2035-03-10", end_date: "2035-06-30", status: "active" };
const fitter = { id: "a-f", employee_id: "e-f", project_id: P, project_role_id: FITTER, start_date: "2035-03-10", end_date: "2035-06-30", status: "active" };
const DOCS = [
  { id: "d1", employee_id: "e-w", category: "passport", title: "Pasoš", file_url: "x", file_name: "pasos.pdf", expiration_date: "2040-01-01" },
  { id: "d2", employee_id: "e-w", category: "safety_certificate", title: "BZR", file_url: "x", file_name: "bzr.pdf", expiration_date: "2036-01-01" },
  { id: "d3", employee_id: "e-f", category: "passport", title: "Pasoš", file_url: "x", file_name: "pasos.pdf", expiration_date: "2040-01-01" },
  { id: "d4", employee_id: "e-f", category: "safety_certificate", title: "BZR", file_url: "x", file_name: "bzr.pdf", expiration_date: "2036-01-01" },
];
const ctx = { requirements: REQS, documents: DOCS, documentTypes: TYPES, today: TODAY, canViewSensitive: true };

describe("onboarding — zahtevi po ulozi", () => {
  it("T18 Welder bez sertifikata je missing i action_required; Fitter na istom projektu je ready", () => {
    const w = workerReadiness({ assignment: welder, ...ctx });
    expect(w.status).toBe("action_required");
    expect(w.reasons).toEqual([{ document_type: "certificate", status: "missing", expiration_date: null }]);
    expect(w.items.find((i) => i.requirement_id === "q-weld").status).toBe("missing");

    const f = workerReadiness({ assignment: fitter, ...ctx });
    expect(f.status).toBe("ready");
    expect(f.items.map((i) => i.requirement_id)).not.toContain("q-weld");
    expect(packageStatus([w, f])).toBe("incomplete");
    expect(packageStatus([f])).toBe("ready");
  });

  it("zahtevi drugog projekta i druge uloge se ne primenjuju", () => {
    expect(requirementsForAssignment(fitter, REQS).map((q) => q.id)).toEqual(["q-pass", "q-safety", "q-med"]);
    expect(requirementsForAssignment(welder, REQS).map((q) => q.id)).toEqual(["q-pass", "q-safety", "q-weld", "q-med"]);
  });

  it("neobavezan zahtev koji fali ne blokira radnika, ali je prikazan", () => {
    const f = workerReadiness({ assignment: fitter, ...ctx });
    expect(f.items.find((i) => i.requirement_id === "q-med").status).toBe("missing");
    expect(f.status).toBe("ready");
  });
});

describe("onboarding — važenje u planiranom periodu", () => {
  it("period: assignment_period do kraja dodele, assignment_start samo početak, none danas", () => {
    expect(requirementWindow(welder, "assignment_period", TODAY)).toEqual({ from: "2035-03-10", to: "2035-06-30" });
    expect(requirementWindow(welder, "assignment_start", TODAY)).toEqual({ from: "2035-03-10", to: "2035-03-10" });
    expect(requirementWindow(welder, "none", TODAY)).toEqual({ from: TODAY, to: TODAY });
    // dodela je već počela i nema kraj → R0 = R1 = danas
    expect(requirementWindow({ start_date: "2035-01-01", end_date: null }, "assignment_period", TODAY)).toEqual({ from: TODAY, to: TODAY });
  });

  it("dokument koji ističe pre kraja dodele je expired; posle kraja, ali uskoro, expiring_soon", () => {
    const docs = [...DOCS, { id: "c1", employee_id: "e-w", category: "certificate", title: "Zavarivanje", file_url: "x", expiration_date: "2035-05-01" }];
    const q = REQS.find((r) => r.id === "q-weld");
    expect(requirementStatus({ requirement: q, assignment: welder, documents: docs, documentTypes: TYPES, today: TODAY, canViewSensitive: true }).status).toBe("expired");
    const docs2 = [...DOCS, { id: "c2", employee_id: "e-w", category: "certificate", title: "Zavarivanje", file_url: "x", expiration_date: "2035-03-20" }];
    const shortAssignment = { ...welder, start_date: "2035-03-02", end_date: "2035-03-15" };
    expect(requirementStatus({ requirement: q, assignment: shortAssignment, documents: docs2, documentTypes: TYPES, today: TODAY, canViewSensitive: true }).status).toBe("expiring_soon");
  });

  it("assignment_start: važi na početku dodele je dovoljno", () => {
    const docs = DOCS.map((d) => (d.id === "d2" ? { ...d, expiration_date: "2035-03-25" } : d));
    const q = REQS.find((r) => r.id === "q-safety");
    expect(requirementStatus({ requirement: q, assignment: welder, documents: docs, documentTypes: TYPES, today: TODAY, canViewSensitive: true }).status).toBe("expiring_soon");
  });

  it("najbolji kandidat je dokument sa najkasnijim rokom; bez roka pobeđuje", () => {
    const docs = [
      { id: "x1", employee_id: "e", category: "certificate", expiration_date: "2035-01-01" },
      { id: "x2", employee_id: "e", category: "certificate", expiration_date: "2037-01-01" },
    ];
    expect(bestDocument(docs, "e", "certificate").id).toBe("x2");
    expect(bestDocument([...docs, { id: "x3", employee_id: "e", category: "certificate", expiration_date: null }], "e", "certificate").id).toBe("x3");
    expect(bestDocument(docs, "e", "passport")).toBeNull();
  });

  it("granica: istek tačno na poslednji dan dodele važi; dan ranije je expired", () => {
    const q = REQS.find((r) => r.id === "q-weld");
    const mk = (exp) => [{ id: "c", employee_id: "e-w", category: "certificate", file_url: "x", expiration_date: exp }];
    expect(requirementStatus({ requirement: q, assignment: welder, documents: mk("2035-06-30"), documentTypes: TYPES, today: TODAY, canViewSensitive: true }).status).toBe("available");
    expect(requirementStatus({ requirement: q, assignment: welder, documents: mk("2035-06-29"), documentTypes: TYPES, today: TODAY, canViewSensitive: true }).status).toBe("expired");
  });
});

describe("onboarding — zabrana izvoza (T19, prikaz)", () => {
  it("osetljiv dokument bez prava je not_permitted, radnik je i dalje ready, a fajl ne ide u ZIP", () => {
    const f = workerReadiness({ assignment: fitter, ...ctx, canViewSensitive: false });
    const pass = f.items.find((i) => i.requirement_id === "q-pass");
    expect(pass.status).toBe("not_permitted");
    expect(isExportable(pass)).toBe(false);
    expect(f.status).toBe("ready");
    expect(isExportable(f.items.find((i) => i.requirement_id === "q-safety"))).toBe(true);
  });

  it("restricted dokument i zahtev bez dozvole izvoza su not_permitted i uz pravo", () => {
    const docs = DOCS.map((d) => (d.id === "d4" ? { ...d, restricted: true } : d));
    const f = workerReadiness({ assignment: fitter, ...ctx, documents: docs, canViewSensitive: false });
    expect(f.items.find((i) => i.requirement_id === "q-safety").status).toBe("not_permitted");
    const noExport = REQS.map((q) => (q.id === "q-safety" ? { ...q, exportable: false } : q));
    const f2 = workerReadiness({ assignment: fitter, ...ctx, requirements: noExport, canViewSensitive: true });
    expect(f2.items.find((i) => i.requirement_id === "q-safety").status).toBe("not_permitted");
  });

  it("istekao osetljiv dokument je expired (nedostatak se ne prikriva zabranom)", () => {
    const docs = DOCS.map((d) => (d.id === "d3" ? { ...d, expiration_date: "2035-04-01" } : d));
    const f = workerReadiness({ assignment: fitter, ...ctx, documents: docs, canViewSensitive: false });
    expect(f.reasons).toEqual([{ document_type: "passport", status: "expired", expiration_date: "2035-04-01" }]);
  });

  it("dokument bez fajla se ne izvozi", () => {
    expect(isExportable({ status: "available", has_file: false })).toBe(false);
  });
});

describe("onboarding — dodela i projekat", () => {
  it("bira tekuću ili sledeću dodelu, poništena se ne računa", () => {
    const list = [
      { id: "old", employee_id: "e", project_id: P, start_date: "2034-01-01", end_date: "2034-12-31", status: "active" },
      { id: "next", employee_id: "e", project_id: P, start_date: "2035-05-01", end_date: null, status: "active" },
      { id: "cur", employee_id: "e", project_id: P, start_date: "2035-02-01", end_date: "2035-04-30", status: "active" },
      { id: "canc", employee_id: "e", project_id: P, start_date: "2035-01-01", end_date: null, status: "cancelled" },
    ];
    expect(onboardingAssignment(list, "e", P, TODAY).id).toBe("cur");
    expect(onboardingAssignment(list.filter((a) => a.id !== "cur" && a.id !== "next"), "e", P, TODAY).id).toBe("old");
    expect(onboardingAssignment([list[3]], "e", P, TODAY)).toBeNull();
  });

  it("projectOnboarding vraća po jedan red po radniku sa razlozima", () => {
    const rows = projectOnboarding({
      project: { id: P }, assignments: [welder, fitter],
      employees: [{ id: "e-w", first_name: "Marko", last_name: "Varilac" }, { id: "e-f", first_name: "Ivan", last_name: "Monter" }],
      ...ctx,
    });
    expect(rows.map((r) => [r.employee_name, r.status])).toEqual([["Ivan Monter", "ready"], ["Marko Varilac", "action_required"]]);
  });

  it("pomoćne: datumi i nazivi u ZIP-u", () => {
    expect(addDaysIso("2035-02-27", 2)).toBe("2035-03-01");
    const used = new Set();
    const a = zipEntryName({ employee_name: "Đorđe Šćekić", document_type: "passport", title: "Pasoš", file_name: "p.PDF" }, used);
    const b = zipEntryName({ employee_name: "Đorđe Šćekić", document_type: "passport", title: "Pasoš", file_name: "p.pdf" }, used);
    expect(a).toBe("Djordje_Scekic/passport_Pasos.pdf");
    expect(b).toBe("Djordje_Scekic/passport_Pasos_2.pdf");
  });
});
