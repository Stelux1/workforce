import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Users, FileText, Calendar,
  CheckSquare, Bell, BarChart3, ChevronLeft, ChevronRight, ChevronDown,
  LogOut, Shield, DollarSign, ClipboardList, Building2, TrendingUp, Mail, Settings2, FolderKanban, Receipt, PieChart,
  Table2, Truck, Coins
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { visibleNavItems } from "@/lib/access";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/LanguageContext";
import { NAV_LABELS, NAV_SECTIONS } from "./navConfig";

const SECTION_BY_KEY = Object.fromEntries(NAV_SECTIONS.map((s) => [s.key, s.items]));
const employeeItems = SECTION_BY_KEY.section_employees;
const projectItems = SECTION_BY_KEY.section_projects;
const payrollItems = SECTION_BY_KEY.section_payroll;
const settingsItems = SECTION_BY_KEY.section_settings;

function NavItem({ item, collapsed, NL }) {
  const location = useLocation();
  const isActive = location.pathname === item.path ||
    (item.path !== "/" && location.pathname.startsWith(item.path));
  return (
    <Link
      to={item.path}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150",
        isActive
          ? "bg-sidebar-accent text-sidebar-primary"
          : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
      )}
    >
      <item.icon className={cn("w-4 h-4 shrink-0", isActive && "text-sidebar-primary")} />
      {!collapsed && <span className="text-xs truncate">{NL[item.label] || item.label}</span>}
    </Link>
  );
}

function SectionGroup({ sectionKey, icon: Icon, items, collapsed, NL, defaultOpen = true }) {
  const location = useLocation();
  const hasActive = items.some(i => location.pathname === i.path || (i.path !== "/" && location.pathname.startsWith(i.path)));
  const [open, setOpen] = useState(defaultOpen || hasActive);
  if (items.length === 0) return null;

  if (collapsed) {
    return (
      <div className="space-y-0.5">
        {items.map(item => <NavItem key={item.path} item={item} collapsed={collapsed} NL={NL} />)}
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-semibold w-full transition-all duration-150",
          hasActive ? "text-sidebar-primary bg-sidebar-accent/60" : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/40"
        )}
      >
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span className="flex-1 text-left truncate">{NL[sectionKey] || sectionKey}</span>
        <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-200", open && "rotate-180")} />
      </button>
      {open && (
        <div className="ml-2 mt-1 space-y-0.5 border-l border-sidebar-border/30 pl-2">
          {items.map(item => <NavItem key={item.path} item={item} collapsed={collapsed} NL={NL} />)}
        </div>
      )}
    </div>
  );
}

export default function Sidebar({ collapsed = false, onCollapsedChange = () => {} }) {
  const location = useLocation();
  const { lang } = useLang();
  const { logout, isAdmin } = useAuth();
  const NL = NAV_LABELS[lang] || NAV_LABELS.en;

  const isActive = (path) => location.pathname === path || (path !== "/" && location.pathname.startsWith(path));

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 h-screen bg-sidebar text-sidebar-foreground z-40 flex flex-col transition-all duration-300 border-r border-sidebar-border",
        collapsed ? "w-[68px]" : "w-[250px]"
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-sidebar-border shrink-0">
        <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center shrink-0">
          <Shield className="w-4 h-4 text-sidebar-primary-foreground" />
        </div>
        {!collapsed && (
          <span className="font-bold text-base tracking-tight truncate">WorkforceHub</span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
        {/* Dashboard */}
        <Link
          to="/"
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
            isActive("/") && location.pathname === "/"
              ? "bg-sidebar-accent text-sidebar-primary"
              : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
          )}
        >
          <LayoutDashboard className={cn("w-5 h-5 shrink-0", location.pathname === "/" && "text-sidebar-primary")} />
          {!collapsed && <span className="truncate">{NL["Dashboard"]}</span>}
        </Link>

        <div className="my-2 border-t border-sidebar-border/50" />

        {/* Employees section */}
        <SectionGroup
          sectionKey="section_employees"
          icon={Users}
          items={visibleNavItems(employeeItems, isAdmin)}
          collapsed={collapsed}
          NL={NL}
          defaultOpen={true}
        />

        <div className="my-2 border-t border-sidebar-border/50" />

        {/* Projects section */}
        <SectionGroup
          sectionKey="section_projects"
          icon={FolderKanban}
          items={visibleNavItems(projectItems, isAdmin)}
          collapsed={collapsed}
          NL={NL}
          defaultOpen={true}
        />

        <div className="my-2 border-t border-sidebar-border/50" />

        {/* Payroll section */}
        <SectionGroup
          sectionKey="section_payroll"
          icon={DollarSign}
          items={visibleNavItems(payrollItems, isAdmin)}
          collapsed={collapsed}
          NL={NL}
          defaultOpen={false}
        />

        <div className="my-2 border-t border-sidebar-border/50" />

        {/* Settings section */}
        <SectionGroup
          sectionKey="section_settings"
          icon={Settings2}
          items={visibleNavItems(settingsItems, isAdmin)}
          collapsed={collapsed}
          NL={NL}
          defaultOpen={false}
        />
      </nav>

      {/* Footer */}
      <div className="p-2 border-t border-sidebar-border space-y-1">
        <button
          onClick={() => logout()}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-all w-full"
        >
          <LogOut className="w-5 h-5 shrink-0" />
          {!collapsed && <span>{NL["Logout"]}</span>}
        </button>

        <button
           onClick={() => onCollapsedChange(!collapsed)}
           className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-all w-full"
         >
           {collapsed ? <ChevronRight className="w-5 h-5 shrink-0" /> : <ChevronLeft className="w-5 h-5 shrink-0" />}
           {!collapsed && <span>{NL["Collapse"]}</span>}
         </button>
      </div>
    </aside>
  );
}