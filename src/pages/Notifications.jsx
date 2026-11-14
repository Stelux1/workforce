import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Bell, CheckCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { format, parseISO } from "date-fns";
import PageHeader from "@/components/shared/PageHeader";
import EmptyState from "@/components/shared/EmptyState";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/translations";

export default function Notifications() {
  const queryClient = useQueryClient();
  const t = useT();

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => base44.entities.Notification.list("-created_date", 100),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Notification.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAllRead = () => {
    notifications.filter((n) => !n.is_read).forEach((n) => {
      updateMutation.mutate({ id: n.id, data: { is_read: true } });
    });
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="space-y-6">
      <PageHeader title={t("Notifications")} subtitle={`${unreadCount} ${t("unread")}`}>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" className="gap-2" onClick={markAllRead}>
            <CheckCheck className="w-4 h-4" /> {t("Mark all read")}
          </Button>
        )}
      </PageHeader>

      {isLoading ? (
        <div className="space-y-3">{Array(4).fill(0).map((_, i) => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}</div>
      ) : notifications.length === 0 ? (
        <EmptyState icon={Bell} title={t("No notifications")} description={t("You're all caught up")} />
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <Card
              key={n.id}
              className={cn("hover:shadow-md transition-all cursor-pointer", !n.is_read && "border-primary/20 bg-primary/5")}
              onClick={() => !n.is_read && updateMutation.mutate({ id: n.id, data: { is_read: true } })}
            >
              <CardContent className="p-4 flex items-start gap-3">
                <div className={cn("w-2 h-2 rounded-full mt-2 shrink-0", n.is_read ? "bg-transparent" : "bg-primary")} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm">{n.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>
                  <p className="text-xs text-muted-foreground mt-1">{n.created_date && format(parseISO(n.created_date), "MMM d, yyyy 'at' h:mm a")}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}