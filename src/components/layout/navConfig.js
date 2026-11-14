// Jedan spisak stavki menija za bočni (desktop) i mobilni meni, da se ne razilaze (QA 14.11.2026).
import {
  LayoutDashboard, Users, FileText, Calendar, CheckSquare, Bell, BarChart3, DollarSign, ClipboardList,
  Building2, Building, Mail, Settings2, FolderKanban, Receipt, PieChart, Table2, Truck, Coins, Clock, CalendarDays, Percent,
  UserCog,
} from "lucide-react";

export const NAV_LABELS = {
  en: {
    "Dashboard": "Dashboard",
    "Employees": "Employees", "Documents": "Documents", "Attendance": "Attendance",
    "Schedule": "Schedule", "Tasks": "Tasks", "Leave Requests": "Leave Requests",
    "Notifications": "Notifications", "Reports": "Reports",
    "Projects": "Project Overview", "Project Costs": "Project Costs",
    "Payroll Dashboard": "Payroll Dashboard", "Timesheets": "Timesheets",
    "Timesheet Dashboard": "Timesheet Overview",
    "Monthly Payroll": "Monthly Payroll", "Clients": "Clients", "Payroll Reports": "Payroll Reports",
    "Email Notifications": "Email Notifications", "Departments & Positions": "Departments & Positions",
    "Cost Categories": "Cost Categories", "Coefficients & Holidays": "Coefficients & Holidays", "Company Details": "Company Details", "Users": "Users", "Vendors": "Vendors", "Rates & Assignments": "Rates & Assignments",
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
    "Monthly Payroll": "Mesečni obračun", "Clients": "Klijenti", "Payroll Reports": "Finansijski izveštaji",
    "Email Notifications": "Email poruke", "Departments & Positions": "Odeljenja",
    "Cost Categories": "Kategorije troškova", "Coefficients & Holidays": "Koeficijenti i praznici", "Company Details": "Podaci firme", "Users": "Korisnici", "Vendors": "Dobavljači", "Rates & Assignments": "Tarife i dodele",
    "Logout": "Odjava", "Collapse": "Skupi",
    "section_employees": "Kadrovi", "section_projects": "Projekti", "section_payroll": "Obračun i finansije", "section_settings": "Podešavanja",
  },
};

export const DASHBOARD_ITEM = { label: "Dashboard", icon: LayoutDashboard, path: "/" };

export const NAV_SECTIONS = [
  {
    key: "section_employees", icon: Users, defaultOpen: true,
    items: [
      { label: "Employees", icon: Users, path: "/employees" },
      { label: "Vendors", icon: Truck, path: "/vendors" },
      { label: "Documents", icon: FileText, path: "/documents" },
      { label: "Attendance", icon: Clock, path: "/attendance" },
      { label: "Schedule", icon: CalendarDays, path: "/schedule" },
      { label: "Tasks", icon: CheckSquare, path: "/tasks" },
      { label: "Leave Requests", icon: Calendar, path: "/leave-requests" },
      { label: "Notifications", icon: Bell, path: "/notifications" },
      { label: "Reports", icon: BarChart3, path: "/reports" },
    ],
  },
  {
    key: "section_projects", icon: FolderKanban, defaultOpen: true,
    items: [
      { label: "Projects", icon: FolderKanban, path: "/projects" },
      { label: "Project Costs", icon: Receipt, path: "/project-costs" },
      { label: "Rates & Assignments", icon: Coins, path: "/rates" },
    ],
  },
  {
    key: "section_payroll", icon: DollarSign, defaultOpen: false,
    items: [
      { label: "Payroll Dashboard", icon: DollarSign, path: "/payroll" },
      { label: "Timesheets", icon: ClipboardList, path: "/timesheets" },
      { label: "Timesheet Dashboard", icon: Table2, path: "/timesheet-dashboard" },
      { label: "Monthly Payroll", icon: PieChart, path: "/payroll/monthly" },
      { label: "Clients", icon: Building2, path: "/clients" },
      { label: "Payroll Reports", icon: BarChart3, path: "/payroll/reports" },
    ],
  },
  {
    key: "section_settings", icon: Settings2, defaultOpen: false,
    items: [
      { label: "Email Notifications", icon: Mail, path: "/email-notifications" },
      { label: "Departments & Positions", icon: Settings2, path: "/settings/departments" },
      { label: "Cost Categories", icon: Receipt, path: "/settings/cost-categories" },
      { label: "Coefficients & Holidays", icon: Percent, path: "/settings/coefficients" },
      { label: "Company Details", icon: Building, path: "/settings/company" },
      { label: "Users", icon: UserCog, path: "/settings/users" },
    ],
  },
];

// Aktivna stavka: tačna adresa ili podstranica, bez obzira na velika slova.
export function isActivePath(current, path) {
  const c = String(current || "").toLowerCase();
  return c === path || (path !== "/" && c.startsWith(path + "/")) || (path !== "/" && c === path);
}
