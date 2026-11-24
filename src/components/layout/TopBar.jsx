import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bell, ChevronDown, LogOut, Menu, Search, Settings, User, Folder, Building2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useLang } from "@/lib/LanguageContext";
import { useT } from "@/lib/translations";
import { cn } from "@/lib/utils";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NAV_LABELS } from "./navConfig";

const MAX_PER_GROUP = 5;

function norm(v) {
  return String(v ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "dj");
}

// Pretraga zaposlenih, projekata i klijenata; podaci se učitaju tek kad polje dobije fokus.
function GlobalSearch() {
  const T = useT();
  const { lang } = useLang();
  const NL = NAV_LABELS[lang] || NAV_LABELS.en;
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [focused, setFocused] = useState(false);
  const [armed, setArmed] = useState(false);
  const box = useRef(null);

  const enabled = armed;
  const opts = { enabled, staleTime: 60_000 };
  const { data: employees = [] } = useQuery({ queryKey: ["search-employees"], queryFn: () => base44.entities.Employee.list("-created_date", 1000), ...opts });
  const { data: projects = [] } = useQuery({ queryKey: ["search-projects"], queryFn: () => base44.entities.Project.list("-created_date", 1000), ...opts });
  const { data: clients = [] } = useQuery({ queryKey: ["search-clients"], queryFn: () => base44.entities.Client.list("-created_date", 1000), ...opts });

  useEffect(() => {
    const onDown = (e) => { if (box.current && !box.current.contains(e.target)) setFocused(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const term = norm(q.trim());
  const groups = useMemo(() => {
    if (!term) return [];
    const has = (...f) => norm(f.filter(Boolean).join(" ")).includes(term);
    return [
      {
        key: "emp", label: NL.Employees, icon: User,
        rows: employees
          .filter((e) => has(e.first_name, e.last_name, e.employee_id, e.position))
          .slice(0, MAX_PER_GROUP)
          .map((e) => ({ id: e.id, title: `${e.first_name || ""} ${e.last_name || ""}`.trim(), sub: e.position || e.employee_id, to: `/employees/${e.id}` })),
      },
      {
        key: "prj", label: NL.section_projects, icon: Folder,
        rows: projects
          .filter((p) => has(p.name, p.project_number, p.client_name))
          .slice(0, MAX_PER_GROUP)
          .map((p) => ({ id: p.id, title: p.name, sub: p.client_name || p.project_number, to: `/projects/${p.id}` })),
      },
      {
        key: "cli", label: NL.Clients, icon: Building2,
        rows: clients
          .filter((c) => has(c.name, c.contact_name, c.email))
          .slice(0, MAX_PER_GROUP)
          .map((c) => ({ id: c.id, title: c.name, sub: c.contact_name, to: "/clients" })),
      },
    ].filter((g) => g.rows.length);
  }, [term, employees, projects, clients, NL]);

  const go = (to) => {
    setFocused(false);
    setQ("");
    navigate(to);
  };
  const first = groups[0]?.rows[0];

  return (
    <div ref={box} className="relative w-full max-w-[520px]">
      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => { setArmed(true); setFocused(true); }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setFocused(false);
          if (e.key === "Enter" && first) go(first.to);
        }}
        placeholder={T("Search employees, projects, clients...")}
        aria-label={T("Search")}
        className="w-full h-10 rounded-xl border border-input bg-card pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 [&::-webkit-search-cancel-button]:hidden"
      />
      {focused && term && (
        <div className="absolute left-0 right-0 top-12 z-50 rounded-xl border border-border bg-popover shadow-lg p-1.5 max-h-[70vh] overflow-y-auto">
          {groups.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">{T("No results")}</p>
          ) : (
            groups.map((g) => (
              <div key={g.key} className="py-1">
                <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</p>
                {g.rows.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => go(r.to)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-accent transition-colors"
                  >
                    <g.icon className="w-4 h-4 text-primary shrink-0" strokeWidth={1.75} />
                    <span className="text-sm font-medium truncate">{r.title}</span>
                    {r.sub && <span className="ml-auto text-xs text-muted-foreground truncate">{r.sub}</span>}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function NotificationBell() {
  const T = useT();
  const { lang } = useLang();
  const NL = NAV_LABELS[lang] || NAV_LABELS.en;
  const { data: unread = 0 } = useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: async () => (await base44.entities.Notification.filter({ is_read: false }, "-created_date", 1)).length,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  return (
    <Link
      to="/notifications"
      aria-label={unread > 0 ? `${NL.Notifications} (${T("Unread notifications")})` : NL.Notifications}
      className="relative flex items-center justify-center w-10 h-10 rounded-full border border-border bg-card text-foreground shadow-sm hover:bg-accent transition-colors"
    >
      <Bell className="w-[18px] h-[18px]" strokeWidth={1.75} />
      {unread > 0 && <span className="absolute top-2 right-2.5 w-2 h-2 rounded-full bg-primary ring-2 ring-card" />}
    </Link>
  );
}

function UserMenu() {
  const T = useT();
  const { lang } = useLang();
  const NL = NAV_LABELS[lang] || NAV_LABELS.en;
  const { user, logout, isAdmin } = useAuth();
  const name = user?.full_name || user?.email || "";
  const initial = (name.trim()[0] || "?").toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={T("Account menu")}
        className="flex items-center gap-2.5 rounded-full pl-1 pr-2 py-1 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-primary/30 transition-colors"
      >
        <span className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold">{initial}</span>
        <span className="hidden md:block text-sm font-semibold max-w-[160px] truncate">{name}</span>
        <ChevronDown className="w-4 h-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52 rounded-xl">
        {isAdmin && (
          <DropdownMenuItem asChild>
            <Link to="/settings/company" className="gap-2 cursor-pointer"><Settings className="w-4 h-4" />{NL.section_settings}</Link>
          </DropdownMenuItem>
        )}
        {isAdmin && <DropdownMenuSeparator />}
        <DropdownMenuItem onSelect={() => logout()} className="gap-2 cursor-pointer">
          <LogOut className="w-4 h-4" />{NL.Logout}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function TopBar({ onOpenMenu }) {
  const T = useT();
  return (
    <header className="sticky top-0 z-30 bg-background/85 backdrop-blur-md border-b border-border h-16 flex items-center gap-3 px-4 md:px-6">
      <button
        onClick={onOpenMenu}
        aria-label={T("Open menu")}
        className="lg:hidden p-2 rounded-lg hover:bg-accent transition-colors"
      >
        <Menu className="w-5 h-5" />
      </button>
      <div className="flex-1 flex justify-start lg:justify-center lg:pl-6 min-w-0">
        <GlobalSearch />
      </div>
      <div className={cn("flex items-center gap-3 shrink-0")}>
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  );
}
