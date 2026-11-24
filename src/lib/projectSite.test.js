import { describe, it, expect } from "vitest";
import { projectAddress, employeesForProject, assignmentWeekDays, negativeLabourMargin, projectQueryKeys } from "@/lib/projectSite";

const DEJAN = { id: "5b0c3f2e-8d1a-4c7e-9f00-0000000000d1", first_name: "Dejan", last_name: "Starcevic", status: "active" };
const MARKO = { id: "5b0c3f2e-8d1a-4c7e-9f00-0000000000d2", first_name: "Marko", last_name: "Antic", status: "active" };
const BIVSI = { id: "5b0c3f2e-8d1a-4c7e-9f00-0000000000d3", first_name: "Ivan", last_name: "Bivsi", status: "terminated" };
const INEOS = {
  id: "5b0c3f2e-8d1a-4c7e-9f00-0000000000a1",
  project_number: "MS26003",
  name: "INEOS Project ONE",
  assigned_employees: [{ employee_id: DEJAN.id, employee_name: "Starcevic Dejan", position: "Work Preparator", b2b_rate: 50, b2c_rate: 45 }],
};

describe("adresa projekta", () => {
  it("„Address, ZIP City“ iz tri polja", () => {
    expect(projectAddress({ address: "Scheldelaan 482", zip: "2040", city: "Antwerpen" })).toBe("Scheldelaan 482, 2040 Antwerpen");
  });
  it("stari projekat bez novih polja prikazuje stari tekst lokacije", () => {
    expect(projectAddress({ location: "Antwerp, BE" })).toBe("Antwerp, BE");
    expect(projectAddress({ location: "Antwerp, BE", city: "Antwerp" })).toBe("Antwerp");
    expect(projectAddress({})).toBe("");
    expect(projectAddress(null)).toBe("");
  });
});

describe("radnici za satnicu projekta (bug 16/17)", () => {
  it("radnik dodat na projekat (assigned_employees) se nudi, sa dodelom", () => {
    const out = employeesForProject(INEOS, [MARKO, DEJAN]);
    expect(out.map((x) => x.employee.id)).toEqual([DEJAN.id]);
    expect(out[0].assignment.position).toBe("Work Preparator");
  });
  it("ID se poredi bez obzira na velika/mala slova i razmake", () => {
    const p = { ...INEOS, assigned_employees: [{ employee_id: ` ${DEJAN.id.toUpperCase()} ` }] };
    expect(employeesForProject(p, [DEJAN]).map((x) => x.employee.id)).toEqual([DEJAN.id]);
  });
  it("neaktivan radnik i radnik koji nije na projektu se ne nude", () => {
    const p = { ...INEOS, assigned_employees: [...INEOS.assigned_employees, { employee_id: BIVSI.id }] };
    expect(employeesForProject(p, [DEJAN, MARKO, BIVSI]).map((x) => x.employee.id)).toEqual([DEJAN.id]);
  });
  it("projekat bez radnika → prazno; ručni unos → svi aktivni, po prezimenu", () => {
    expect(employeesForProject({ ...INEOS, assigned_employees: [] }, [DEJAN])).toEqual([]);
    expect(employeesForProject(undefined, [DEJAN])).toEqual([]);
    expect(employeesForProject(null, [DEJAN, BIVSI, MARKO], { manual: true }).map((x) => x.employee.last_name)).toEqual(["Antic", "Starcevic"]);
  });
  it("posle dodele radnika na projekat osvežava se i lista projekata koju čita Satnica (uzrok buga)", () => {
    const keys = projectQueryKeys(INEOS.id);
    expect(keys).toContainEqual(["project", INEOS.id]);
    expect(keys).toContainEqual(["projects"]);
  });
});

describe("negativna marža rada (spec §5)", () => {
  it("B2C veći od B2B → upozorenje", () => {
    expect(negativeLabourMargin(55, 50)).toBe(true);
    expect(negativeLabourMargin("50.01", "50")).toBe(true);
  });
  it("B2C jednak ili manji od B2B → bez upozorenja", () => {
    expect(negativeLabourMargin(45, 50)).toBe(false);
    expect(negativeLabourMargin(50, 50)).toBe(false);
  });
  it("tarifa koja nije uneta → bez upozorenja", () => {
    expect(negativeLabourMargin(45, null)).toBe(false);
    expect(negativeLabourMargin("", 50)).toBe(false);
    expect(negativeLabourMargin(45, 0)).toBe(false);
  });
});

describe("employeesForProject iz dodela (Phase 7, §2.4)", () => {
  const P = "a0000000-0000-4000-8000-0000000000p1";
  const WEEK = "2034-03-06"; // pon–ned 6.–12.3.
  const dodela = (o) => ({ id: o.id, employee_id: DEJAN.id, project_id: P, status: "active", start_date: "2034-01-01", end_date: null, ...o });

  it("nudi dodele koje pokrivaju bar jedan dan nedelje; otkazana i tuđi projekat se ne nude", () => {
    const assignments = [
      dodela({ id: "A1" }),
      dodela({ id: "A2", employee_id: MARKO.id, status: "cancelled" }),
      dodela({ id: "A3", employee_id: MARKO.id, project_id: "drugi" }),
      dodela({ id: "A4", employee_id: MARKO.id, start_date: "2034-03-13" }), // počinje posle nedelje
      dodela({ id: "A5", employee_id: MARKO.id, end_date: "2034-03-05" }),   // završena pre nedelje
    ];
    const out = employeesForProject({ id: P }, [DEJAN, MARKO], { assignments, weekStart: WEEK });
    expect(out.map((x) => x.assignment.id)).toEqual(["A1"]);
  });

  it("prelazak usred nedelje: dve dodele istog radnika su dve stavke, po početku", () => {
    const assignments = [dodela({ id: "B2", start_date: "2034-03-09" }), dodela({ id: "B1", end_date: "2034-03-08" })];
    const out = employeesForProject({ id: P }, [DEJAN], { assignments, weekStart: WEEK });
    expect(out.map((x) => x.assignment.id)).toEqual(["B1", "B2"]);
    expect(assignmentWeekDays(out[0].assignment, WEEK)).toEqual([0, 1, 2]);
    expect(assignmentWeekDays(out[1].assignment, WEEK)).toEqual([3, 4, 5, 6]);
    expect(assignmentWeekDays(null, WEEK)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("neaktivan radnik se ne nudi ni kad ima dodelu; bez nedelje → prazno", () => {
    expect(employeesForProject({ id: P }, [BIVSI], { assignments: [dodela({ id: "C1", employee_id: BIVSI.id })], weekStart: WEEK })).toEqual([]);
    expect(employeesForProject({ id: P }, [DEJAN], { assignments: [dodela({ id: "C2" })] })).toEqual([]);
  });
});
