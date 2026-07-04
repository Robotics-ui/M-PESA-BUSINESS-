import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAllWithdrawals,
  getListAllWithdrawalsQueryKey,
  useUnlockWithdrawal,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { Unlock } from "lucide-react";

function StatusBadge({ status }: { status: string }) {
  if (status === "disbursed")
    return <Badge className="bg-green-100 text-green-700 border-green-200">Disbursed</Badge>;
  if (status === "locked")
    return <Badge className="bg-red-100 text-red-700 border-red-200">Locked</Badge>;
  if (status === "failed")
    return <Badge className="bg-red-100 text-red-700 border-red-200">Failed</Badge>;
  return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">Pending verification</Badge>;
}

export default function Withdrawals() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: withdrawals, isLoading } = useListAllWithdrawals();

  const { mutate: unlock, isPending, variables } = useUnlockWithdrawal({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAllWithdrawalsQueryKey() });
        toast({ title: "Withdrawal unlocked" });
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error ?? "Failed to unlock withdrawal.";
        toast({ title: "Error", description: msg, variant: "destructive" });
      },
    },
  });

  const filtered = withdrawals?.filter((w) => statusFilter === "all" || w.status === statusFilter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Withdrawals</h1>
          <p className="text-muted-foreground mt-1">
            Monitor loan withdrawal requests and unlock accounts after too many failed card checks.
          </p>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending_verification">Pending verification</SelectItem>
            <SelectItem value="disbursed">Disbursed</SelectItem>
            <SelectItem value="locked">Locked</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : !filtered || filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground px-6 py-8 text-center">
              No {statusFilter === "all" ? "" : statusFilter.replace("_", " ")} withdrawals found.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>M-Pesa number</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell>
                      <p className="font-medium text-foreground">{w.customerName || "—"}</p>
                      <p className="text-xs text-muted-foreground">{w.customerEmail}</p>
                    </TableCell>
                    <TableCell className="font-medium">{formatCurrency(w.amount)}</TableCell>
                    <TableCell className="font-mono text-sm">{w.mpesaPhone}</TableCell>
                    <TableCell>
                      <StatusBadge status={w.status} />
                      {w.status === "locked" && w.lockedAt && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Locked {formatDateTime(w.lockedAt as unknown as string)}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {w.verificationAttempts}/3
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDateTime(w.createdAt as unknown as string)}
                    </TableCell>
                    <TableCell className="text-right">
                      {w.status === "locked" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isPending && variables?.id === w.id}
                          onClick={() => unlock({ id: w.id })}
                        >
                          <Unlock className="h-3.5 w-3.5 mr-1" />
                          {isPending && variables?.id === w.id ? "Unlocking…" : "Unlock"}
                        </Button>
                      )}
                    </TableCell>
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
