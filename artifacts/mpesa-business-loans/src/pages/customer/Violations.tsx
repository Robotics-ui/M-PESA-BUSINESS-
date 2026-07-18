import { useQueryClient } from "@tanstack/react-query";
import {
  useListMyViolations,
  getListMyViolationsQueryKey,
  useAcknowledgeViolation,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { formatDateTime } from "@/lib/format";
import { AlertTriangle, ShieldAlert, CheckCircle2, Bell } from "lucide-react";

function TypeBadge({ type }: { type: string }) {
  if (type === "violation")
    return <Badge className="bg-red-100 text-red-700 border-red-200">Policy violation</Badge>;
  return <Badge className="bg-orange-100 text-orange-700 border-orange-200">Warning</Badge>;
}

export default function Violations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: violations, isLoading } = useListMyViolations();
  const { mutate: acknowledge, isPending: acknowledging } = useAcknowledgeViolation({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMyViolationsQueryKey() });
        toast({ title: "Notice acknowledged" });
      },
      onError: () => toast({ title: "Failed to acknowledge", variant: "destructive" }),
    },
  });

  const unacknowledged = violations?.filter((v) => !v.acknowledged) ?? [];
  const acknowledged = violations?.filter((v) => v.acknowledged) ?? [];

  if (isLoading) {
    return (
      <div className="max-w-xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
          <Bell className="h-6 w-6" /> Warnings &amp; Notices
        </h1>
        <p className="text-muted-foreground mt-1">
          Formal warnings and policy notices issued to your account.
        </p>
      </div>

      {!violations || violations.length === 0 ? (
        <Card>
          <CardContent className="pt-8 pb-8 flex flex-col items-center gap-3 text-center">
            <CheckCircle2 className="h-10 w-10 text-green-500" />
            <p className="font-medium text-foreground">No warnings on your account</p>
            <p className="text-sm text-muted-foreground">
              You have no active warnings or notices. Keep up the good work!
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {unacknowledged.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">
                New notices ({unacknowledged.length})
              </p>
              {unacknowledged.map((v) => (
                <Card key={v.id} className={v.type === "violation" ? "border-red-200 bg-red-50" : "border-orange-200 bg-orange-50"}>
                  <CardHeader className="pb-2 flex flex-row items-start justify-between">
                    <div className="flex items-center gap-2">
                      {v.type === "violation" ? (
                        <ShieldAlert className="h-4 w-4 text-red-600 shrink-0" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-orange-600 shrink-0" />
                      )}
                      <CardTitle className="text-sm font-semibold">
                        {v.type === "violation" ? "Policy violation" : "Account warning"}
                      </CardTitle>
                    </div>
                    <TypeBadge type={v.type} />
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-foreground">{v.reason}</p>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(v.createdAt.toISOString())}
                        {v.issuedByName && ` · Issued by ${v.issuedByName}`}
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={acknowledging}
                        onClick={() => acknowledge({ id: v.id })}
                      >
                        Acknowledge
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {acknowledged.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-muted-foreground">
                Past notices ({acknowledged.length})
              </p>
              {acknowledged.map((v) => (
                <Card key={v.id} className="opacity-70">
                  <CardContent className="pt-4 pb-4 flex items-start gap-3">
                    <CheckCircle2 className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <TypeBadge type={v.type} />
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(v.createdAt.toISOString())}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{v.reason}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
