import { Link, useLocation } from "react-router-dom";
import { X, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/AuthContext";
import { useLang } from "@/lib/LanguageContext";
import { useT } from "@/lib/translations";
import { visibleNavItems } from "@/lib/access";
import { DASHBOARD_ITEM, NAV_LABELS, NAV_SECTIONS, isActivePath } from "./navConfig";
import { usePendingTimesheets } from "./usePendingTimesheets";
import { NavBadge } from "./Sidebar";
import BrandLogo from "./BrandLogo";

// Mobilni meni ima iste stavke kao bočni (po ulozi), na izabranom jeziku (QA 14.11.2026).
export default function MobileNav({ open, onClose }) {
  const location = useLocation();
  const { logout, permissions } = useAuth();
  const { lang } = useLang();
  const T = useT();
  const pending = usePendingTimesheets();
  const NL = NAV_LABELS[lang] || NAV_LABELS.en;

  if (!open) return null;

  const renderItem = (item) => {
    const active = isActivePath(location.pathname, item.path);
    return (
      <Link
        key={item.path}
        to={item.path}
        onClick={onClose}
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors",
          active
            ? "bg-sidebar-accent text-sidebar-primary font-semibold"
            : "text-sidebar-foreground hover:bg-sidebar-accent/50"
        )}
      >
        <item.icon className="w-[18px] h-[18px] shrink-0" strokeWidth={1.75} />
        <span>{NL[item.label] || item.label}</span>
        {item.path === "/timesheets" && <NavBadge count={pending} />}
      </Link>
    );
  };

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute left-0 top-0 h-full w-[280px] bg-sidebar text-sidebar-foreground flex flex-col">
        <div className="flex items-center justify-between px-5 h-16">
          <BrandLogo />
          <button onClick={onClose} aria-label={T("Close menu")}><X className="w-5 h-5" /></button>
        </div>
        <nav className="flex-1 py-2 px-3 space-y-1 overflow-y-auto">
          {renderItem(DASHBOARD_ITEM)}
          {NAV_SECTIONS.map((section) => {
            const items = visibleNavItems(section.items, permissions);
            if (!items.length) return null;
            return (
              <div key={section.key} className="pt-3 border-t border-sidebar-border mt-2">
                <p className="flex items-center gap-2 px-3 pb-1.5 text-xs font-bold text-sidebar-primary">
                  <section.icon className="w-4 h-4" strokeWidth={1.75} />
                  {NL[section.key]}
                </p>
                {items.map(renderItem)}
              </div>
            );
          })}
        </nav>
        <div className="p-3 border-t border-sidebar-border">
          <button
            onClick={() => logout()}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-sidebar-foreground hover:bg-sidebar-accent/50 w-full"
          >
            <LogOut className="w-[18px] h-[18px]" strokeWidth={1.75} />
            <span>{NL.Logout}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
