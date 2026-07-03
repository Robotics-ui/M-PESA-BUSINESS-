import {
  useListMyNotifications,
  useMarkNotificationRead,
  getListMyNotificationsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/format";
import { Bell, BellOff, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Notifications() {
  const { data: notifications, isLoading } = useListMyNotifications();
  const queryClient = useQueryClient();
  const { mutate: markRead, isPending } = useMarkNotificationRead({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMyNotificationsQueryKey() });
      },
    },
  });

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center">
          <Bell className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Notifications</h1>
          <p className="text-muted-foreground text-sm">Updates about your account and loans.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : !notifications || notifications.length === 0 ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center text-center">
            <BellOff className="h-10 w-10 text-muted-foreground mb-4" />
            <p className="font-medium text-foreground">No notifications yet</p>
            <p className="text-sm text-muted-foreground mt-1">We'll let you know when something changes.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => (
            <Card key={n.id} className={cn(!n.read && "border-primary/40 bg-primary/5")} data-testid={`card-notification-${n.id}`}>
              <CardContent className="py-4 flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-foreground">{n.title}</p>
                    {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{n.message}</p>
                  <p className="text-xs text-muted-foreground mt-2">{formatDateTime(n.createdAt)}</p>
                </div>
                {!n.read && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    onClick={() => markRead({ id: n.id })}
                    data-testid={`button-mark-read-${n.id}`}
                  >
                    <Check className="h-3.5 w-3.5 mr-1" /> Mark read
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
