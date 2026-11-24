import { describe, it, expect } from "vitest";
import { projectAddress, employeesForProject, negativeLabourMargin, projectQueryKeys } from "@/lib/projectSite";

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
