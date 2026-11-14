import { Link, useLocation } from "react-router-dom";
import { X, Shield, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/AuthContext";
import { useLang } from "@/lib/LanguageContext";
import { visibleNavItems } from "@/lib/access";
import { DASHBOARD_ITEM, NAV_LABELS, NAV_SECTIONS, isActivePath } from "./navConfig";

// Mobilni meni ima iste stavke kao bočni (po ulozi), na izabranom jeziku (QA 14.11.2026).
export default function MobileNav({ open, onClose }) {
  const location = useLocation();
  const { logout, isAdmin } = useAuth();
  const { lang } = useLang();
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
          "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
          active
            ? "bg-sidebar-accent text-sidebar-primary"
            : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
        )}
      >
        <item.icon className="w-5 h-5 shrink-0" />
        <span>{NL[item.label] || item.label}</span>
      </Link>
    );
  };

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute left-0 top-0 h-full w-[280px] bg-sidebar text-sidebar-foreground flex flex-col">
        <div className="flex items-center justify-between px-4 h-16 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center">
              <Shield className="w-4 h-4 text-sidebar-primary-foreground" />
            </div>
            <span className="font-bold text-base">WorkforceHub</span>
          </div>
          <button onClick={onClose} aria-label={lang === "rs" ? "Zatvori meni" : "Close menu"}><X className="w-5 h-5" /></button>
        </div>
        <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
          {renderItem(DASHBOARD_ITEM)}
          {NAV_SECTIONS.map((section) => {
            const items = visibleNavItems(section.items, isAdmin);
            if (!items.length) return null;
            return (
              <div key={section.key} className="pt-3">
                <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/50">{NL[section.key]}</p>
                {items.map(renderItem)}
              </div>
            );
          })}
        </nav>
        <div className="p-2 border-t border-sidebar-border">
          <button
            onClick={() => logout()}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 w-full"
          >
            <LogOut className="w-5 h-5" />
            <span>{NL.Logout}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
