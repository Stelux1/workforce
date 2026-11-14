// Poruke o greškama: tehničke greške baze postaju razumljive, a naše srpske poruke iz baze prolaze nepromenjene.
import { describe, expect, it } from "vitest";
import { dataError, describeError, plainError } from "./errors";

const rs = (error) => describeError(error, "rs");

describe("describeError", () => {
  it("RLS odbijanje → nemate pravo", () => {
    const e = { code: "42501", message: 'new row violates row-level security policy for table "clients"' };
    expect(rs(e).key).toBe("permission");
    expect(rs(e).text).toBe("Nemate pravo na ovu izmenu.");
    expect(describeError(e, "en").text).toBe("You don't have permission to make this change.");
  });

  it("RLS odbijanje iz Storage-a (bez koda) → nemate pravo", () => {
    expect(rs({ statusCode: "403", message: "new row violates row-level security policy" }).key).toBe("permission");
  });

  it("naša poruka iz baze sa kodom 42501 ostaje kakva jeste", () => {
    expect(rs({ code: "42501", message: "Satnicu može da odobri samo admin" }).text).toBe("Satnicu može da odobri samo admin");
  });

  it("naša poruka iz baze sa kodom 23514 ostaje kakva jeste", () => {
    const e = { code: "23514", message: "Satnica nema tarifu radnika ili klijenta i ne može da se odobri" };
    expect(rs(e).text).toBe(e.message);
  });

  it("duplikati po vrsti", () => {
    const dup = (c) => ({ code: "23505", message: `duplicate key value violates unique constraint "${c}"` });
    expect(rs(dup("employees_employee_id_key")).key).toBe("duplicateEmployeeId");
    expect(rs(dup("timesheets_one_per_week")).key).toBe("duplicateTimesheet");
    expect(rs(dup("payroll_runs_month_key")).key).toBe("duplicatePayrollMonth");
    expect(rs(dup("holidays_pkey")).key).toBe("duplicateHoliday");
    expect(rs(dup("nesto_drugo")).key).toBe("duplicate");
  });

  it("provere u bazi po imenu pravila", () => {
    const chk = (c) => ({ code: "23514", message: `new row for relation "x" violates check constraint "${c}"` });
    expect(rs(chk("employees_dates")).key).toBe("dates");
    expect(rs(chk("leave_requests_dates")).key).toBe("dates");
    expect(rs(chk("employees_first_name_check")).key).toBe("emptyFirstName");
    expect(rs(chk("employees_last_name_check")).key).toBe("emptyLastName");
    expect(rs(chk("documents_title_check")).key).toBe("emptyName");
    expect(rs(chk("timesheets_mon_hours_check")).key).toBe("dayHours");
    expect(rs(chk("timesheets_week_start_check")).key).toBe("weekStart");
    expect(rs(chk("employee_private_jmbg_check")).key).toBe("jmbg");
    expect(rs(chk("employment_history_vendor")).key).toBe("vendorRequired");
    expect(rs(chk("project_costs_amount_check")).key).toBe("negative");
    expect(rs(chk("timesheets_b2c_rate_check")).key).toBe("negative");
    expect(rs(chk("hour_types_worker_coef_check")).key).toBe("coefficient");
    expect(rs(chk("tasks_status_check")).key).toBe("notAllowedValue");
  });

  it("preklapanje angažmana, strani ključ, obavezno polje", () => {
    expect(rs({ code: "23P01", message: 'conflicting key value violates exclusion constraint "employment_history_no_overlap"' }).key).toBe("overlap");
    expect(rs({ code: "23503", message: 'update or delete on table "vendors" violates foreign key constraint "x"' }).key).toBe("inUse");
    expect(rs({ code: "23503", message: 'insert or update on table "documents" violates foreign key constraint "x"' }).key).toBe("missingLink");
    expect(rs({ code: "23502", message: 'null value in column "first_name" of relation "employees" violates not-null constraint' }).text)
      .toBe("Obavezno polje nije popunjeno: ime.");
  });

  it("neispravna vrednost, datum, prevelik broj", () => {
    expect(rs({ code: "22P02", message: 'invalid input syntax for type uuid: ""' }).key).toBe("badValue");
    expect(rs({ code: "22007", message: "invalid input syntax for type date" }).key).toBe("badDate");
    expect(rs({ code: "22003", message: "numeric field overflow" }).key).toBe("tooBig");
  });

  it("mreža, istekla prijava, fajlovi", () => {
    expect(rs(Object.assign(new TypeError("Failed to fetch"))).key).toBe("network");
    expect(rs({ code: "PGRST301", message: "JWT expired" }).key).toBe("session");
    expect(rs({ statusCode: "413", message: "The object exceeded the maximum allowed size" }).key).toBe("fileTooBig");
    expect(rs({ statusCode: "415", message: "mime type text/plain is not supported" }).key).toBe("fileType");
  });

  it("nepoznata tehnička greška ne prikazuje sirov tekst baze", () => {
    expect(rs({ code: "XX000", message: 'internal error in relation "x"' }).key).toBe("unknown");
  });
});

describe("poruke posle QA 14.11.2026", () => {
  const fk = (table, constraint) => ({ code: "23503", message: `update or delete on table "${table}" violates foreign key constraint "${constraint}" on table "x"` });
  it("brisanje kaže šta tačno smeta", () => {
    expect(rs(fk("projects", "timesheets_project_id_fkey")).key).toBe("inUseProjectTimesheets");
    expect(rs(fk("employees", "timesheets_employee_id_fkey")).text).toMatch(/Radnik ima satnice/);
    expect(rs(fk("clients", "projects_client_id_fkey")).text).toMatch(/Klijent ima projekte/);
    expect(rs(fk("vendors", "employment_history_vendor_id_fkey")).text).toMatch(/Dobavljač ima angažmane/);
  });
  it("dupli projekat i dupli ručni red satnice", () => {
    expect(rs({ code: "23505", message: 'duplicate key value violates unique constraint "projects_name_client_key"' }).key).toBe("duplicateProject");
    expect(rs({ code: "23505", message: 'duplicate key value violates unique constraint "timesheets_one_per_week_manual"' }).key).toBe("duplicateTimesheet");
  });
  it("poruke iz baze su na engleskom kad je izabran EN", () => {
    expect(describeError({ code: "42501", message: "Satnicu može da odobri samo admin" }, "en").text).toBe("Only an admin can approve a timesheet.");
    expect(describeError({ code: "23514", message: "Mesec 03.2026 je zaključan" }, "en").text).toBe("Month 03.2026 is locked.");
    expect(describeError({ code: "23514", message: "Mesec 03.2026 je već zaključan" }, "en").text).toBe("Month 03.2026 is already locked.");
    expect(describeError({ code: "23514", message: "Mesec 03.2026 je zaključan" }, "rs").text).toBe("Mesec 03.2026 je zaključan");
  });
  it("koeficijent koji fali pri odobravanju (Faza 2): srpski prolazi, engleski kaže gde se upisuje", () => {
    const e = { code: "23514", message: "Nedostaje koeficijent za vrstu sati: vikend (radnik), vikend (klijent) — admin ga upisuje u Koeficijenti i praznici" };
    expect(rs(e).text).toBe(e.message);
    expect(describeError(e, "en").text).toBe(
      "Missing coefficient for hour type: vikend (radnik), vikend (klijent) — an admin enters it in Settings → Coefficients & Holidays."
    );
    expect(describeError({ code: "23514", message: "Satnica nema potpun obračun i ne može da se odobri" }, "en").text).toMatch(/incomplete/);
  });
  // Poruke su doslovno iz supabase/tests/04_tarifa_pri_odobravanju.test.sql (guard_timesheet).
  it("tarifa reda koja nije važeća tarifa (Faza 2): srpski prolazi, engleski kaže stranu, izvor i šta da se uradi", () => {
    const e = {
      code: "23514",
      message: "Tarifa radnika (99,00) ne odgovara važećoj tarifi (15,00, izvor: tarifa angažmana) — osvežite stranicu i odobrite ponovo",
    };
    expect(rs(e).text).toBe(e.message);
    expect(describeError(e, "en").text).toBe(
      "The worker rate (99.00) doesn't match the current rate (15.00, source: assignment rate) — refresh the page and approve again."
    );
    const klijent = { code: "23514", message: "Tarifa klijenta (31,00) ne odgovara važećoj tarifi (22,00, izvor: zanimanje na projektu) — osvežite stranicu i odobrite ponovo" };
    expect(describeError(klijent, "en").text).toBe(
      "The client rate (31.00) doesn't match the current rate (22.00, source: job role on the project) — refresh the page and approve again."
    );
  });
  it("tarifa koja fali ili nije EUR po satu pri odobravanju → engleski", () => {
    const oba = { code: "23514", message: "Nema važeće tarife radnika ni klijenta za nedelju od 07.03.2033 — satnica ne može da se odobri" };
    expect(rs(oba).text).toBe(oba.message);
    expect(describeError(oba, "en").text).toBe("No valid rate for the worker or the client for the week of 07.03.2033 — the timesheet can't be approved.");
    expect(describeError({ ...oba, message: "Nema važeće tarife klijenta za nedelju od 07.03.2033 — satnica ne može da se odobri" }, "en").text)
      .toBe("No valid rate for the client for the week of 07.03.2033 — the timesheet can't be approved.");
    const rsd = {
      code: "23514",
      message: "Važeća tarifa radnika (izvor: tarifa radnika) je 1500,00 RSD po satu — odobravanje prima samo EUR po satu; ispravite tu tarifu u Tarife i dodele",
    };
    expect(rs(rsd).text).toBe(rsd.message);
    expect(describeError(rsd, "en").text).toBe(
      "The current worker rate (source: employee rate) is 1500.00 RSD per hour — approval accepts only EUR per hour; fix that rate in Rates & Assignments."
    );
  });
});

describe("dataError / plainError", () => {
  it("dataError nosi poruku za korisnika i originalnu poruku", () => {
    const e = dataError({ code: "42501", message: "new row violates row-level security policy" }, "Client.create");
    expect(e.isDataError).toBe(true);
    expect(e.original).toMatch(/row-level security/);
    expect(e.context).toBe("Client.create");
  });

  it("izmena koju baza tiho preskoči postaje greška NO_ROWS", () => {
    const e = plainError("noRows", "Client.update");
    expect(e.isDataError).toBe(true);
    expect(e.code).toBe("NO_ROWS");
    expect(describeError(e, "rs").key).toBe("noRows");
  });
});

describe("trošak projekta bez kursa (migracija 20261114220000)", () => {
  it("poruka baze ostaje na srpskom, a na engleskom se prevodi", () => {
    const e = { code: "23514", message: "Trošak u RSD mora imati kurs veći od 0 (koliko RSD vredi 1 EUR)" };
    expect(describeError(e, "rs").text).toBe(e.message);
    expect(describeError(e, "en").text).toBe("A cost in RSD needs an exchange rate greater than 0 (how many RSD is 1 EUR).");
  });
});

describe("mesečni obračun (migracija 20261114200000)", () => {
  it("poruke baze ostaju na srpskom, a na engleskom se prevode (spisak problema ostaje na srpskom)", () => {
    const bezKursa = { code: "23514", message: "Bez kursa EUR/RSD nema obračuna — unesite kurs za mesec" };
    expect(describeError(bezKursa, "rs").text).toBe(bezKursa.message);
    expect(describeError(bezKursa, "en").text).toBe("No payroll without an EUR/RSD exchange rate — enter the rate for the month.");
    const neusklađen = { code: "23514", message: "Obračun nije usklađen: QA Radnik: nema platnog listića" };
    expect(describeError(neusklađen, "en").text).toBe("The payroll doesn't reconcile: QA Radnik: nema platnog listića");
    expect(describeError({ code: "42501", message: "Samo admin može da odobri obračun" }, "en").text).toBe("Only an admin can manage payroll.");
  });
});

describe("tarife samo admin (migracija 20261114240000)", () => {
  it("odbijena izmena tarife na projektu / u dodeli: srpski ostaje, engleski se prevodi", () => {
    const cases = [
      ["Zanimanje sa tarifom na projektu dodaje, menja i briše samo admin",
        "Only an admin can add, change or delete a job role that has a rate on the project."],
      ["Satnicu radnika na projektu (B2C/B2B tarifu) upisuje samo admin",
        "Only an admin can enter the employee's rate on the project (B2C/B2B)."],
      ["Radnika kome je admin odredio tarifu na projektu menja i uklanja samo admin",
        "Only an admin can change or remove an employee whose rate on the project was set by an admin."],
      ["Pozicija „QA Poslovođa\" ima tarifu na ovom projektu — radnika na nju raspoređuje samo admin",
        "Position \"QA Poslovođa\" has a rate on this project — only an admin can assign employees to it."],
      ["Dodele radnika kome je admin odredio tarifu na ovom projektu menja i briše samo admin",
        "Only an admin can change or delete the assignments of an employee whose rate on this project was set by an admin."],
    ];
    for (const [message, en] of cases) {
      const e = { code: "42501", message };
      expect(describeError(e, "rs")).toEqual({ key: "db", text: message });
      expect(describeError(e, "en").text).toBe(en);
    }
  });

  it("brisanje dodele ili projekta koji imaju tarife (on delete restrict) kaže šta smeta", () => {
    const fk = (table, c) => ({ code: "23503", message: `update or delete on table "${table}" violates foreign key constraint "${c}" on table "rates"` });
    expect(rs(fk("project_assignments", "rates_assignment_id_fkey")).key).toBe("inUseAssignmentRates");
    expect(rs(fk("project_assignments", "rates_assignment_id_fkey")).text).toBe("Dodela ima tarife (Tarife i dodele), pa ne može da se obriše. Prvo obrišite te tarife.");
    expect(rs(fk("projects", "rates_project_id_fkey")).key).toBe("inUseProjectRates");
    expect(describeError(fk("projects", "rates_project_id_fkey"), "en").text).toBe("The project has rates (Rates & Assignments), so it can't be deleted. An admin has to delete those rates first.");
  });
});
