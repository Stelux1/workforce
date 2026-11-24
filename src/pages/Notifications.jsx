import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, ArrowRight, Bell, CalendarDays, CheckCheck, ClipboardCheck, Clock, FileText, Info, Mail,
  RefreshCw, ShieldAlert, Users, Wallet, ArrowLeftRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import PageHeader from "@/components/shared/PageHeader";
import EmptyState from "@/components/shared/EmptyState";
import {
  refreshNotifications, useNotificationActions, useNotificationList,
} from "@/components/notifications/useNotifications";
import { useL } from "@/lib/translations";
import { useLang } from "@/lib/LanguageContext";
import { formatIsoDate } from "@/lib/dateFormat";
import { cn } from "@/lib/utils";
import {
  TYPE_ORDER, countByType, filterNotifications, isRead, isResolved, notificationLink, notificationText,
  severityLabel, sortNotifications, typeLabel, unreadCount,
} from "@/lib/notifications";

const ICONS = {
  calendar: CalendarDays, users: Users, swap: ArrowLeftRight, file: FileText, clock: Clock,
  clipboard: ClipboardCheck, wallet: Wallet, bell: Bell, mail: Mail,
};
const TYPE_ICON = {
  leave_request: "calendar", workforce_shortage: "users", replacement_candidate: "swap", document_expiry: "file",
  document_missing: "file", assignment_expiry: "clock", timesheet_pending: "clipboard", payable_due: "wallet",
  receivable_due: "wallet", contract_expiry: "file", attendance: "clock", schedule_change: "calendar", general: "bell",
};
const SEVERITY_STYLE = {
  critical: { stripe: "bg-destructive", icon: "bg-destructive/10 text-destructive", Icon: ShieldAlert },
  warning: { stripe: "bg-warning", icon: "bg-warning-soft text-warning", Icon: AlertTriangle },
  info: { stripe: "bg-primary", icon: "bg-primary/10 text-primary", Icon: Info },
};

function Chip({ active, onClick, children, count }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 h-8 text-xs font-medium transition-colors",
        active ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:bg-accent"
      )}
    >
      {children}
      {count !== undefined && (
        <span className={cn("rounded-full px-1.5 text-[11px] tabular-nums", active ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground")}>
          {count}
        </span>
      )}
    </button>
  );
}

function NotificationCard({ n, read, lang, L, onOpen, onToggle, busy }) {
  const text = notificationText(n, lang);
  const link = notificationLink(n);
  const resolved = isResolved(n);
  const sev = SEVERITY_STYLE[n.severity] || SEVERITY_STYLE.info;
  const Icon = ICONS[TYPE_ICON[n.type] || "bell"] || Bell;
  const body = (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className={cn("text-sm", read ? "font-medium" : "font-semibold")}>{text.title}</p>
        {!resolved && n.severity !== "info" && (
          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", sev.icon)}>{severityLabel(n.severity, lang)}</span>
        )}
        {resolved && (
          <span className="rounded-full bg-success-soft text-success px-2 py-0.5 text-[11px] font-semibold">
            {L("Resolved", "Rešeno", "Vyriešené")}
          </span>
        )}
      </div>
      {text.message && <p className="text-sm text-muted-foreground mt-0.5 break-words">{text.message}</p>}
      <p className="text-xs text-muted-foreground mt-1.5 flex flex-wrap gap-x-3">
        <span>{typeLabel(n.type, lang)}</span>
        {n.due_date && !resolved && <span>{L("Date", "Datum", "Dátum")}: {formatIsoDate(n.due_date, lang)}</span>}
        {n.created_date && <span>{L("Created", "Kreirano", "Vytvorené")} {formatIsoDate(n.created_date.slice(0, 10), lang)}</span>}
        {resolved && n.resolved_at && <span>{L("Resolved", "Rešeno", "Vyriešené")} {formatIsoDate(n.resolved_at.slice(0, 10), lang)}</span>}
      </p>
    </div>
  );
  return (
    <Card className={cn("shadow-card overflow-hidden transition-colors", resolved && "opacity-70", !read && !resolved && "border-primary/30")}>
      <CardContent className="p-0 flex">
        <span className={cn("w-1 shrink-0", resolved ? "bg-muted" : sev.stripe)} aria-hidden="true" />
        <div className="p-4 flex items-start gap-3 flex-1 min-w-0">
          <span className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", resolved ? "bg-muted text-muted-foreground" : sev.icon)}>
            <Icon className="w-[18px] h-[18px]" strokeWidth={1.75} />
          </span>
          {body}
          <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1 shrink-0">
            {!resolved && (
              <Button
                variant="ghost" size="sm" className="h-8 text-xs" disabled={busy}
                onClick={() => onToggle(n, read)}
                aria-label={read ? L("Mark as unread", "Označi kao nepročitano", "Označiť ako neprečítané") : L("Mark as read", "Označi kao pročitano", "Označiť ako prečítané")}
              >
                {read ? L("Mark unread", "Nepročitano", "Neprečítané") : L("Mark read", "Pročitano", "Prečítané")}
              </Button>
            )}
            {link && (
              <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                <Link to={link} onClick={() => onOpen(n, read)}>
                  {L("Open", "Otvori", "Otvoriť")} <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </Button>
            )}
          </div>
        </div>
        {!read && !resolved && <span className="self-start mt-4 mr-3 w-2 h-2 rounded-full bg-primary shrink-0" aria-label={L("Unread", "Nepročitano", "Neprečítané")} />}
      </CardContent>
    </Card>
  );
}

export default function Notifications() {
  const L = useL();
  const { lang } = useLang();
  const { data, isLoading, isError, error, refetch, isFetching } = useNotificationList();
  const { markRead, markUnread, invalidate } = useNotificationActions();
  const [status, setStatus] = useState("open");
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [type, setType] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(null);

  const items = useMemo(() => data?.items ?? [], [data]);
  const readIds = data?.readIds;
  const unread = unreadCount(items, readIds);
  const typeCounts = useMemo(() => countByType(items), [items]);
  const types = TYPE_ORDER.filter((t) => typeCounts[t]);
  const resolvedCount = items.filter(isResolved).length;

  const visible = useMemo(
    () => sortNotifications(filterNotifications(items, { status, read: onlyUnread ? "unread" : "all", type, severity }, readIds)),
    [items, status, onlyUnread, type, severity, readIds]
  );

  const refreshNow = async () => {
    setRefreshing(true);
    setRefreshFailed(null);
    try {
      await refreshNotifications({ force: true });
      await invalidate();
    } catch (e) {
      setRefreshFailed(e);
    } finally {
      setRefreshing(false);
    }
  };

  const openItem = (n, read) => {
    if (!read && !isResolved(n)) markRead.mutate([n.id]);
  };
  const toggleItem = (n, read) => (read ? markUnread.mutate([n.id]) : markRead.mutate([n.id]));
  const markAll = () => markRead.mutate(null);
  const busy = markRead.isPending || markUnread.isPending;
  const failure = refreshFailed || data?.refreshError;

  return (
    <div className="space-y-6">
      <PageHeader
        title={L("Notifications", "Obaveštenja", "Upozornenia")}
        subtitle={
          isLoading ? "" : unread > 0
            ? L(`${unread} unread`, `${unread} nepročitano`, `${unread} neprečítaných`)
            : L("All caught up", "Sve je pročitano", "Všetko je prečítané")
        }
      >
        <Button variant="outline" size="sm" className="gap-2" onClick={refreshNow} disabled={refreshing || isLoading}>
          <RefreshCw className={cn("w-4 h-4", (refreshing || isFetching) && "animate-spin")} />
          {L("Refresh", "Osveži", "Obnoviť")}
        </Button>
        {unread > 0 && (
          <Button variant="outline" size="sm" className="gap-2" onClick={markAll} disabled={busy}>
            <CheckCheck className="w-4 h-4" /> {L("Mark all read", "Označi sve kao pročitano", "Označiť všetko ako prečítané")}
          </Button>
        )}
      </PageHeader>

      {failure && (
        <div role="alert" className="rounded-xl border border-warning/40 bg-warning-soft text-sm p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
          <p>
            {L(
              "The notification list could not be refreshed, so it may be out of date.",
              "Lista obaveštenja nije mogla da se osveži, pa možda nije aktuelna.",
              "Zoznam upozornení sa nepodarilo obnoviť, môže byť neaktuálny."
            )}{" "}
            <span className="text-muted-foreground">{failure.message}</span>
          </p>
        </div>
      )}

      {isError ? (
        <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-center space-y-3">
          <p className="font-semibold">{L("Notifications could not be loaded", "Obaveštenja nisu učitana", "Upozornenia sa nepodarilo načítať")}</p>
          <p className="text-sm text-muted-foreground">{error?.message}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>{L("Try again", "Pokušaj ponovo", "Skúsiť znova")}</Button>
        </div>
      ) : isLoading ? (
        <div className="space-y-3" aria-busy="true">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : (
        <>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label={L("Status", "Status", "Stav")}>
              <Chip active={status === "open"} onClick={() => setStatus("open")} count={items.length - resolvedCount}>{L("Open", "Otvorena", "Otvorené")}</Chip>
              <Chip active={status === "resolved"} onClick={() => setStatus("resolved")} count={resolvedCount}>{L("Resolved", "Rešena", "Vyriešené")}</Chip>
              <Chip active={status === "all"} onClick={() => setStatus("all")}>{L("All", "Sva", "Všetky")}</Chip>
              <span className="w-px h-5 bg-border mx-1" aria-hidden="true" />
              <Chip active={onlyUnread} onClick={() => setOnlyUnread((v) => !v)} count={unread}>{L("Unread only", "Samo nepročitana", "Iba neprečítané")}</Chip>
              <span className="w-px h-5 bg-border mx-1" aria-hidden="true" />
              {["all", "critical", "warning", "info"].map((s) => (
                <Chip key={s} active={severity === s} onClick={() => setSeverity(s)}>
                  {s === "all" ? L("Any severity", "Svi stepeni", "Všetky stupne") : severityLabel(s, lang)}
                </Chip>
              ))}
            </div>
            {types.length > 1 && (
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label={L("Type", "Vrsta", "Typ")}>
                <Chip active={type === "all"} onClick={() => setType("all")}>{L("All types", "Sve vrste", "Všetky typy")}</Chip>
                {types.map((t) => (
                  <Chip key={t} active={type === t} onClick={() => setType(t)} count={typeCounts[t]}>{typeLabel(t, lang)}</Chip>
                ))}
              </div>
            )}
          </div>

          {items.length === 0 ? (
            <EmptyState
              icon={Bell}
              title={L("No notifications", "Nema obaveštenja", "Žiadne upozornenia")}
              description={L(
                "Nothing needs your attention right now. Pending leave, shortages, expiring documents and overdue payments will show up here.",
                "Trenutno ništa ne traži vašu pažnju. Odsustva na čekanju, manjkovi radnika, dokumenta koja ističu i dospela plaćanja pojaviće se ovde.",
                "Momentálne nič nevyžaduje vašu pozornosť. Čakajúce neprítomnosti, nedostatok pracovníkov, končiace dokumenty a splatné platby sa zobrazia tu."
              )}
            />
          ) : visible.length === 0 ? (
            <EmptyState
              icon={Bell}
              title={L("Nothing matches these filters", "Nijedno obaveštenje ne odgovara filterima", "Filtrom nezodpovedá žiadne upozornenie")}
              description={L("Change or clear the filters to see more.", "Promenite ili uklonite filtere da vidite više.", "Zmeňte alebo zrušte filtre.")}
            />
          ) : (
            <ul className="space-y-2" aria-label={L("Notifications", "Obaveštenja", "Upozornenia")}>
              {visible.map((n) => (
                <li key={n.id}>
                  <NotificationCard
                    n={n} read={isRead(n, readIds)} lang={lang} L={L}
                    onOpen={openItem} onToggle={toggleItem} busy={busy}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
