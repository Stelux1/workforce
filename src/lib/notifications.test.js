import { describe, it, expect } from "vitest";
import {
  actionCenterItems,
  countByType,
  filterNotifications,
  formatAmount,
  isRead,
  notificationLink,
  notificationText,
  sortNotifications,
  unreadCount,
} from "./notifications";

const n = (id, extra = {}) => ({ id, type: "general", severity: "info", title: `t${id}`, message: `m${id}`, created_date: `2026-11-0${id}T10:00:00Z`, ...extra });

describe("pročitano po korisniku", () => {
  const list = [n(1), n(2), n(3, { is_read: true }), n(4, { resolved_at: "2026-11-10T00:00:00Z" })];

  it("računa nepročitana iz notification_reads korisnika; stari is_read važi za sve; rešena se ne broje", () => {
    expect(unreadCount(list, new Set())).toBe(2); // 1 i 2 (3 je stari pročitan, 4 je rešen)
    expect(unreadCount(list, new Set([1]))).toBe(1);
    expect(unreadCount(list, new Set([1, 2]))).toBe(0);
  });

  it("isti red je za jednog korisnika pročitan, za drugog nije", () => {
    const readByA = new Set([2]);
    const readByB = new Set();
    expect(isRead(list[1], readByA)).toBe(true);
    expect(isRead(list[1], readByB)).toBe(false);
  });

  it("prima i niz id-jeva", () => {
    expect(isRead(list[0], [1])).toBe(true);
    expect(isRead(list[0], undefined)).toBe(false);
  });
});

describe("sortiranje i filteri", () => {
  const list = [
    n(1, { severity: "info", due_date: "2026-12-01" }),
    n(2, { severity: "critical", due_date: "2026-12-05" }),
    n(3, { severity: "critical", due_date: "2026-11-30" }),
    n(4, { severity: "warning" }),
    n(5, { severity: "critical", resolved_at: "2026-11-11T00:00:00Z" }),
  ];

  it("hitno prvo, pa bliži rok; rešena na kraju", () => {
    expect(sortNotifications(list).map((x) => x.id)).toEqual([3, 2, 4, 1, 5]);
  });

  it("filter: otvorena / rešena / nepročitana / tip / stepen", () => {
    expect(filterNotifications(list).map((x) => x.id).sort()).toEqual([1, 2, 3, 4]);
    expect(filterNotifications(list, { status: "resolved" }).map((x) => x.id)).toEqual([5]);
    expect(filterNotifications(list, { status: "all" })).toHaveLength(5);
    expect(filterNotifications(list, { read: "unread" }, new Set([1, 2])).map((x) => x.id).sort()).toEqual([3, 4]);
    expect(filterNotifications(list, { severity: "critical" }).map((x) => x.id).sort()).toEqual([2, 3]);
    expect(filterNotifications([n(1, { type: "payable_due" }), n(2)], { type: "payable_due" })).toHaveLength(1);
  });

  it("countByType broji samo otvorena", () => {
    expect(countByType([n(1, { type: "payable_due" }), n(2, { type: "payable_due" }), n(3, { type: "payable_due", resolved_at: "x" })])).toEqual({ payable_due: 2 });
  });

  it("actionCenterItems vraća najhitnija otvorena sa oznakom nepročitano", () => {
    const items = actionCenterItems(list, new Set([3]), 2);
    expect(items.map((x) => x.id)).toEqual([3, 2]);
    expect(items.map((x) => x.unread)).toEqual([false, true]);
  });
});

describe("tekst na tri jezika iz payload-a", () => {
  const shortage = n(1, {
    type: "workforce_shortage",
    payload: { project_name: "Lučka kapija", role_title: "Zavarivač", shift_name: "Jutro", date: "2026-12-03", required: 3, available: 1, deficit: 2 },
  });
  it("manjak radnika", () => {
    expect(notificationText(shortage, "en")).toEqual({
      title: "Workforce shortage",
      message: "Lučka kapija – Zavarivač (Jutro), Dec 3, 2026: needed 3, available 1, missing 2",
    });
    expect(notificationText(shortage, "rs").message).toContain("nedostaje 2");
    expect(notificationText(shortage, "sk").message).toContain("chýba 2");
  });

  it("odmor na čekanju koristi vrstu odsustva", () => {
    const leave = n(2, { type: "leave_request", payload: { employee_name: "Ana Kovač", leave_type: "sick", start_date: "2026-12-01", end_date: "2026-12-03" } });
    expect(notificationText(leave, "rs").message).toBe("Ana Kovač: bolovanje, 01.12.2026. – 03.12.2026.");
  });

  it("dokument koji je istekao i koji uskoro ističe imaju različit naslov", () => {
    const base = { employee_name: "Ana Kovač", title: "Pasoš", expiration_date: "2026-12-01" };
    expect(notificationText(n(1, { type: "document_expiry", payload: { ...base, expired: true } }), "en").title).toBe("Document expired");
    expect(notificationText(n(1, { type: "document_expiry", payload: { ...base, expired: false } }), "en").title).toBe("Document expiring soon");
  });

  it("iznosi uvek nose valutu; potraživanje i obaveza", () => {
    expect(formatAmount(1200.5, "EUR", "en")).toContain("1,200.50");
    expect(formatAmount(1200.5, "EUR", "en")).toContain("€");
    expect(formatAmount(10, "", "en")).toBe("");
    const payable = n(1, { type: "payable_due", payload: { payee_name: "Vendor d.o.o.", remaining: 400, currency: "EUR", due_date: "2026-11-20" } });
    expect(notificationText(payable, "en").message).toMatch(/^Vendor d\.o\.o\.: .*400.* remaining, was due Nov 20, 2026$/);
    const recv = n(1, { type: "receivable_due", payload: { client_name: "Acme", outstanding: 300, currency: "GBP", due_date: "2026-11-20" } });
    expect(notificationText(recv, "en").message).toContain("£300");
  });

  it("bez payload-a (stari red, replacement_candidate) ostaje tekst iz baze", () => {
    expect(notificationText(n(1), "rs")).toEqual({ title: "t1", message: "m1" });
    expect(notificationText(n(2, { type: "replacement_candidate", title: "Kandidat", message: "Ana je slobodna" }), "sk")).toEqual({ title: "Kandidat", message: "Ana je slobodna" });
    expect(notificationText(n(3, { type: "payable_due", payload: {} }), "en")).toEqual({ title: "t3", message: "m3" });
  });
});

describe("adresa obaveštenja", () => {
  it("vodi na izvornu listu po entity_table", () => {
    expect(notificationLink({ entity_table: "leave_requests", entity_id: "x" })).toBe("/leave-requests?status=pending");
    expect(notificationLink({ entity_table: "timesheets" })).toBe("/timesheets?status=submitted");
    expect(notificationLink({ entity_table: "payables", entity_id: "p" })).toBe("/payroll/payables?status=overdue");
    expect(notificationLink({ entity_table: "documents", payload: { employee_id: "e1" } })).toBe("/employees/e1");
    expect(notificationLink({ entity_table: "project_assignments", type: "document_missing", project_id: "p1" })).toBe("/projects/p1");
    expect(notificationLink({ entity_table: "project_assignments", type: "assignment_expiry", project_id: "p1" })).toBe("/assignments?project=p1&status=ending_soon");
  });

  it("stari red koristi svoj link samo ako je putanja u aplikaciji", () => {
    expect(notificationLink({ link: "/employees/5" })).toBe("/employees/5");
    expect(notificationLink({ link: "https://evil.example" })).toBeNull();
    expect(notificationLink({})).toBeNull();
    expect(notificationLink(null)).toBeNull();
  });
});
