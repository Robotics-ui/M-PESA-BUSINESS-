import { useListAuditLogs } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { ScrollText } from "lucide-react";

export default function AuditLogs() {
  const { data: logs, isLoading } = useListAuditLogs();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center">
          <ScrollText className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Audit logs</h1>
          <p className="text-muted-foreground text-sm">A chronological record of actions across the system.</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6">
              <Skeleton className="h-64 w-full" />
            </div>
          ) : !logs || logs.length === 0 ? (
            <p className="text-sm text-muted-foreground p-6">No audit log entries yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id} data-testid={`row-audit-log-${log.id}`}>
                    <TableCell className="whitespace-nowrap text-sm">{formatDateTime(log.createdAt)}</TableCell>
                    <TableCell className="capitalize">{log.action.replace(/_/g, " ")}</TableCell>
                    <TableCell className="capitalize">
                      {log.entityType}
                      {log.entityId ? ` #${log.entityId.slice(0, 8)}` : ""}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{log.details ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
