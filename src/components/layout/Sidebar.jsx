import { Link, useLocation } from "react-router-dom";
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, LogOut } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { visibleNavItems } from "@/lib/access";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/LanguageContext";
import { DASHBOARD_ITEM, NAV_LABELS, NAV_SECTIONS, isActivePath } from "./navConfig";
import { usePendingTimesheets } from "./usePendingTimesheets";
import BrandLogo from "./BrandLogo";

export function NavBadge({ count, className }) {
  if (!count) return null;
  return (
    <span className={cn("ml-auto min-w-[22px] h-[22px] px-1.5 rounded-full bg-primary text-primary-foreground text-[11px] font-semibold flex items-center justify-center", className)}>
      {count > 99 ? "99+" : count}
    </span>
  );
}

function NavItem({ item, collapsed, NL, badge = 0, nested = false }) {
  const location = useLocation();
  const isActive = isActivePath(location.pathname, item.path);
  const label = NL[item.label] || item.label;
  return (
    <Link
      to={item.path}
      title={collapsed ? label : undefined}
      className={cn(
        "relative flex items-center gap-3 rounded-xl py-2 text-sm transition-colors duration-150",
        nested ? "px-3" : "px-3 py-2.5",
        collapsed && "justify-center px-0",
        isActive
          ? "bg-sidebar-accent text-sidebar-primary font-semibold"
          : "text-sidebar-foreground font-normal hover:bg-sidebar-accent/50"
      )}
    >
      <item.icon className={cn("w-[18px] h-[18px] shrink-0", isActive && "text-sidebar-primary")} strokeWidth={1.75} />
      {!collapsed && <span className="truncate">{label}</span>}
      {!collapsed && <NavBadge count={badge} />}
      {collapsed && badge > 0 && <span className="absolute top-1.5 right-3 w-2 h-2 rounded-full bg-primary" />}
    </Link>
  );
}

function SectionGroup({ sectionKey, icon: Icon, items, collapsed, NL, defaultOpen = true, pending }) {
  const location = useLocation();
  const hasActive = items.some((i) => isActivePath(location.pathname, i.path));
  const [open, setOpen] = useState(defaultOpen || hasActive);
  if (items.length === 0) return null;
  const badgeFor = (item) => (item.path === "/timesheets" ? pending : 0);

  if (collapsed) {
    return (
      <div className="space-y-0.5">
        {items.map((item) => <NavItem key={item.path} item={item} collapsed NL={NL} badge={badgeFor(item)} nested />)}
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold w-full transition-colors text-sidebar-primary bg-sidebar-accent/50 hover:bg-sidebar-accent/80"
      >
        <Icon className="w-[18px] h-[18px] shrink-0" strokeWidth={1.75} />
        <span className="flex-1 text-left truncate">{NL[sectionKey] || sectionKey}</span>
        {open ? <ChevronUp className="w-4 h-4" strokeWidth={2} /> : <ChevronDown className="w-4 h-4" strokeWidth={2} />}
      </button>
      {open && (
        <div className="mt-1.5 ml-3 space-y-0.5">
          {items.map((item) => <NavItem key={item.path} item={item} collapsed={false} NL={NL} badge={badgeFor(item)} nested />)}
        </div>
      )}
    </div>
  );
}

export default function Sidebar({ collapsed = false, onCollapsedChange = () => {} }) {
  const { lang } = useLang();
  const { logout, permissions } = useAuth();
  const NL = NAV_LABELS[lang] || NAV_LABELS.en;
  const pending = usePendingTimesheets();

  return (
    <aside
      className={cn(
        "fixed overflow-hidden left-0 top-0 h-screen bg-sidebar text-sidebar-foreground z-40 flex flex-col transition-all duration-300 border-r border-sidebar-border",
        collapsed ? "w-[68px]" : "w-[250px]"
      )}
    >
      <div className={cn("flex items-center h-16 shrink-0", collapsed ? "justify-center" : "px-5")}>
        <Link to="/" aria-label="Teamora">
          <BrandLogo variant={collapsed ? "mark" : "full"} className={collapsed ? "h-7" : "h-8"} />
        </Link>
      </div>

      <nav className="flex-1 py-2 px-3 space-y-1 overflow-y-auto">
        <NavItem item={DASHBOARD_ITEM} collapsed={collapsed} NL={NL} />

        {NAV_SECTIONS.map((section) => {
          const items = visibleNavItems(section.items, permissions);
          if (!items.length) return null;
          return (
            <div key={section.key} className="space-y-1">
              <div className="mx-2 my-2 border-t border-sidebar-border" />
              <SectionGroup
                sectionKey={section.key}
                icon={section.icon}
                items={items}
                collapsed={collapsed}
                NL={NL}
                defaultOpen={section.defaultOpen}
                pending={pending}
              />
            </div>
          );
        })}
      </nav>

      {/* Dekorativni lavanda talas u dnu (slika5) */}
      <svg aria-hidden="true" className="pointer-events-none absolute bottom-0 left-0 w-full h-28 text-primary" viewBox="0 0 250 112" preserveAspectRatio="none">
        <path d="M250 18 C 200 24, 160 60, 120 112 L250 112 Z" fill="currentColor" opacity="0.07" />
        <path d="M250 58 C 215 62, 185 84, 160 112 L250 112 Z" fill="currentColor" opacity="0.08" />
      </svg>

      <div className="relative p-3 border-t border-sidebar-border space-y-0.5">
        <button
          onClick={() => logout()}
          title={collapsed ? NL.Logout : undefined}
          className={cn("flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors w-full", collapsed && "justify-center px-0")}
        >
          <LogOut className="w-[18px] h-[18px] shrink-0" strokeWidth={1.75} />
          {!collapsed && <span>{NL.Logout}</span>}
        </button>
        <button
          onClick={() => onCollapsedChange(!collapsed)}
          title={collapsed ? NL.Collapse : undefined}
          className={cn("flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors w-full", collapsed && "justify-center px-0")}
        >
          {collapsed ? <ChevronRight className="w-[18px] h-[18px] shrink-0" strokeWidth={1.75} /> : <ChevronLeft className="w-[18px] h-[18px] shrink-0" strokeWidth={1.75} />}
          {!collapsed && <span>{NL.Collapse}</span>}
        </button>
      </div>
    </aside>
  );
}
