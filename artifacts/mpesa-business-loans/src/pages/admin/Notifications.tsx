import { useLocation } from "wouter";
import {
  useListMyNotifications,
  useMarkNotificationRead,
  useDeleteNotification,
  getListMyNotificationsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import { Bell, BellOff, Check, Trash2, AlertTriangle, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

/** Detect dispute notifications so we can show a direct link to the Withdrawals page. */
function isDisputeNotification(title: string) {
  return title.toLowerCase().includes("withdrawal issue") || title.toLowerCase().includes("dispute");
}

export default function AdminNotifications() {
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { data: notifications, isLoading } = useListMyNotifications();

  const { mutate: markRead, isPending: isMarkingRead } = useMarkNotificationRead({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMyNotificationsQueryKey() });
      },
    },
  });

  const { mutate: deleteNotification, isPending: isDeleting } = useDeleteNotification({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMyNotificationsQueryKey() });
      },
    },
  });

  const isPending = isMarkingRead || isDeleting;
  const unreadCount = notifications?.filter((n) => !n.read).length ?? 0;

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center">
          <Bell className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-foreground">Notifications</h1>
            {unreadCount > 0 && (
              <Badge className="bg-orange-100 text-orange-700 border-orange-200">
                {unreadCount} unread
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground text-sm">Alerts and updates requiring your attention.</p>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => {
              notifications?.filter((n) => !n.read).forEach((n) => markRead({ id: n.id }));
            }}
          >
            <Check className="h-3.5 w-3.5 mr-1" />
            Mark all read
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : !notifications || notifications.length === 0 ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center text-center">
            <BellOff className="h-10 w-10 text-muted-foreground mb-4" />
            <p className="font-medium text-foreground">No notifications yet</p>
            <p className="text-sm text-muted-foreground mt-1">You'll be alerted here when customers report issues.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => {
            const isDispute = isDisputeNotification(n.title);
            return (
              <Card
                key={n.id}
                className={cn(
                  !n.read && "border-primary/40 bg-primary/5",
                  isDispute && !n.read && "border-orange-300 bg-orange-50/60",
                )}
              >
                <CardContent className="py-4 flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {isDispute && (
                        <AlertTriangle className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                      )}
                      <p className="font-medium text-foreground">{n.title}</p>
                      {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{n.message}</p>
                    <p className="text-xs text-muted-foreground mt-2">{formatDateTime(n.createdAt)}</p>
                    {isDispute && (
                      <Button
                        variant="link"
                        size="sm"
                        className="px-0 mt-1 h-auto text-orange-700 hover:text-orange-900"
                        onClick={() => {
                          if (!n.read) markRead({ id: n.id });
                          navigate("/admin/withdrawals");
                        }}
                      >
                        <ExternalLink className="h-3 w-3 mr-1" />
                        Go to Withdrawals → Resolve dispute
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!n.read && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isPending}
                        onClick={() => markRead({ id: n.id })}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      disabled={isPending}
                      onClick={() => deleteNotification({ id: n.id })}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
