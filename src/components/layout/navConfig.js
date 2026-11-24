// Jedan spisak stavki menija za bočni (desktop) i mobilni meni, da se ne razilaze (QA 14.11.2026).
import {
  LayoutGrid, Users, User, FileText, Calendar, SquareCheck, Bell, ChartNoAxesColumn, ClipboardList,
  Building2, Building, Mail, Settings, Folder, FolderKanban, Receipt, Table2, Handshake, Clock, CalendarDays, Percent,
  UserCog, Link2, CalendarRange, Gauge, Briefcase, Languages, Wallet,
} from "lucide-react";
import { CalendarDollar, CoinStack } from "./NavIcons";

export const NAV_LABELS = {
  en: {
    "Dashboard": "Dashboard",
    "Employees": "Employees", "Documents": "Documents", "Attendance": "Attendance",
    "Schedule": "Schedule", "Tasks": "Tasks", "Leave Requests": "Leave Requests",
    "Notifications": "Notifications", "Reports": "Reports",
    "Projects": "Project Overview", "Project Costs": "Project Costs",
    "Payroll Dashboard": "Payroll Dashboard", "Timesheets": "Timesheets",
    "Timesheet Dashboard": "Timesheet Overview",
    "Monthly Payroll": "Monthly Payroll", "Payables": "Payables & Payments", "Clients": "Clients / Billing Overview", "Payroll Reports": "Payroll Reports",
    "Email Notifications": "Email Notifications", "Departments & Positions": "Departments & Positions",
    "Cost Categories": "Cost Categories", "Coefficients & Holidays": "Coefficients & Holidays", "Company Details": "Company Details", "Users": "Users", "Language & Currency": "Language & Currency", "Vendors": "Vendors", "Project Assignments": "Project Assignments", "Workforce Planning": "Workforce Planning",
    "Logout": "Logout", "Collapse": "Collapse",
    "section_employees": "Staff Management", "section_projects": "Projects", "section_payroll": "Payroll", "section_settings": "Settings",
  },
  rs: {
    "Dashboard": "Početna",
    "Employees": "Zaposleni", "Documents": "Dokumenti", "Attendance": "Prisustvo",
    "Schedule": "Raspored", "Tasks": "Zadaci", "Leave Requests": "Odsustva",
    "Notifications": "Obaveštenja", "Reports": "Izveštaji",
    "Projects": "Pregled projekata", "Project Costs": "Troškovi projekata",
    "Payroll Dashboard": "Platni spisak", "Timesheets": "Radni sati",
    "Timesheet Dashboard": "Pregled radnih sati",
    "Monthly Payroll": "Mesečni obračun", "Payables": "Obaveze i isplate", "Clients": "Klijenti / Billing Overview", "Payroll Reports": "Finansijski izveštaji",
    "Email Notifications": "Email poruke", "Departments & Positions": "Odeljenja",
    "Cost Categories": "Kategorije troškova", "Coefficients & Holidays": "Koeficijenti i praznici", "Company Details": "Podaci firme", "Users": "Korisnici", "Language & Currency": "Jezik i valuta", "Vendors": "Dobavljači", "Project Assignments": "Angažmani na projektima", "Workforce Planning": "Planiranje radne snage",
    "Logout": "Odjava", "Collapse": "Skupi",
    "section_employees": "Kadrovi", "section_projects": "Projekti", "section_payroll": "Obračun i finansije", "section_settings": "Podešavanja",
  },
  sk: {
    "Dashboard": "Domov",
    "Employees": "Zamestnanci", "Documents": "Dokumenty", "Attendance": "Dochádzka",
    "Schedule": "Rozvrh", "Tasks": "Úlohy", "Leave Requests": "Žiadosti o voľno",
    "Notifications": "Upozornenia", "Reports": "Prehľady",
    "Projects": "Prehľad projektov", "Project Costs": "Náklady projektov",
    "Payroll Dashboard": "Mzdový prehľad", "Timesheets": "Pracovné výkazy",
    "Timesheet Dashboard": "Prehľad výkazov",
    "Monthly Payroll": "Mesačné zúčtovanie miezd", "Payables": "Záväzky a výplaty", "Clients": "Klienti / Billing Overview", "Payroll Reports": "Finančné prehľady",
    "Email Notifications": "E-mailové upozornenia", "Departments & Positions": "Oddelenia",
    "Cost Categories": "Kategórie nákladov", "Coefficients & Holidays": "Koeficienty a sviatky", "Company Details": "Údaje o firme", "Users": "Používatelia", "Language & Currency": "Jazyk a mena", "Vendors": "Dodávatelia", "Project Assignments": "Pridelenia na projektoch", "Workforce Planning": "Plánovanie pracovnej sily",
    "Logout": "Odhlásiť sa", "Collapse": "Zbaliť",
    "section_employees": "Správa personálu", "section_projects": "Projekty", "section_payroll": "Mzdy a financie", "section_settings": "Nastavenia",
  },
};

export const DASHBOARD_ITEM = { label: "Dashboard", icon: LayoutGrid, path: "/" };

export const NAV_SECTIONS = [
  {
    key: "section_employees", icon: Users, defaultOpen: true,
    items: [
      { label: "Employees", icon: User, path: "/employees" },
      { label: "Vendors", icon: Handshake, path: "/vendors" },
      { label: "Documents", icon: FileText, path: "/documents" },
      { label: "Attendance", icon: Clock, path: "/attendance" },
      { label: "Schedule", icon: CalendarDays, path: "/schedule" },
      { label: "Tasks", icon: SquareCheck, path: "/tasks" },
      { label: "Leave Requests", icon: Calendar, path: "/leave-requests" },
      { label: "Notifications", icon: Bell, path: "/notifications" },
      { label: "Reports", icon: ChartNoAxesColumn, path: "/reports" },
    ],
  },
  {
    key: "section_projects", icon: Folder, defaultOpen: true,
    items: [
      { label: "Projects", icon: FolderKanban, path: "/projects" },
      { label: "Project Costs", icon: CoinStack, path: "/project-costs" },
      { label: "Project Assignments", icon: Link2, path: "/assignments" },
      { label: "Workforce Planning", icon: CalendarRange, path: "/workforce" },
    ],
  },
  {
    key: "section_payroll", icon: CoinStack, defaultOpen: true,
    items: [
      { label: "Payroll Dashboard", icon: Gauge, path: "/payroll" },
      { label: "Timesheets", icon: ClipboardList, path: "/timesheets" },
      { label: "Timesheet Dashboard", icon: Table2, path: "/timesheet-dashboard" },
      { label: "Monthly Payroll", icon: CalendarDollar, path: "/payroll/monthly" },
      { label: "Payables", icon: Wallet, path: "/payroll/payables" },
      { label: "Clients", icon: Building2, path: "/clients" },
      { label: "Payroll Reports", icon: ChartNoAxesColumn, path: "/payroll/reports" },
    ],
  },
  {
    key: "section_settings", icon: Settings, defaultOpen: false,
    items: [
      { label: "Email Notifications", icon: Mail, path: "/email-notifications" },
      { label: "Departments & Positions", icon: Briefcase, path: "/settings/departments" },
      { label: "Cost Categories", icon: Receipt, path: "/settings/cost-categories" },
      { label: "Coefficients & Holidays", icon: Percent, path: "/settings/coefficients" },
      { label: "Company Details", icon: Building, path: "/settings/company" },
      { label: "Users", icon: UserCog, path: "/settings/users" },
      { label: "Language & Currency", icon: Languages, path: "/settings/general" },
    ],
  },
];

// Aktivna stavka: tačna adresa ili podstranica, bez obzira na velika slova.
export function isActivePath(current, path) {
  const c = String(current || "").toLowerCase();
  return c === path || (path !== "/" && c.startsWith(path + "/")) || (path !== "/" && c === path);
}
