import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAllWithdrawals,
  getListAllWithdrawalsQueryKey,
  useUnlockWithdrawal,
  useResolveWithdrawalIssue,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { Unlock, MessageSquare, CreditCard, RefreshCw, XCircle } from "lucide-react";

function StatusBadge({ status }: { status: string }) {
  if (status === "disbursed")
    return <Badge className="bg-green-100 text-green-700 border-green-200">Disbursed</Badge>;
  if (status === "locked")
    return <Badge className="bg-red-100 text-red-700 border-red-200">Locked</Badge>;
  if (status === "failed")
    return <Badge className="bg-red-100 text-red-700 border-red-200">Failed</Badge>;
  return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">Pending verification</Badge>;
}

function ReceiptBadge({ receiptStatus, resolvedAt }: { receiptStatus: string; resolvedAt?: string | null }) {
  if (receiptStatus === "confirmed")
    return <Badge className="bg-green-100 text-green-700 border-green-200 mt-1">Confirmed received</Badge>;
  if (receiptStatus === "not_received" && !resolvedAt)
    return <Badge className="bg-orange-100 text-orange-700 border-orange-200 mt-1 animate-pulse">⚠ Dispute open</Badge>;
  if (receiptStatus === "not_received" && resolvedAt)
    return <Badge className="bg-gray-100 text-gray-600 border-gray-200 mt-1">Dispute resolved</Badge>;
  return null;
}

type ResolutionType = "rejected" | "new_card_required" | "retry";

interface ResolveDialogState {
  withdrawalId: string;
  customerName: string;
  amount: string;
  adminResponse: string | null;
  resolutionType: string | null;
  resolvedAt: string | null;
}

export default function Withdrawals() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [resolveDialog, setResolveDialog] = useState<ResolveDialogState | null>(null);
  const [resolveReason, setResolveReason] = useState("");
  const [resolveType, setResolveType] = useState<ResolutionType>("rejected");

  const { data: withdrawals, isLoading } = useListAllWithdrawals();

  const { mutate: unlock, isPending: unlocking, variables: unlockVars } = useUnlockWithdrawal({
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

  const { mutate: resolve, isPending: resolving } = useResolveWithdrawalIssue({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAllWithdrawalsQueryKey() });
        setResolveDialog(null);
        setResolveReason("");
        setResolveType("rejected");
        toast({ title: "Dispute resolved", description: "The customer has been notified." });
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error ?? "Failed to resolve dispute.";
        toast({ title: "Error", description: msg, variant: "destructive" });
      },
    },
  });

  const filtered = withdrawals?.filter((w) => statusFilter === "all" || w.status === statusFilter);

  // Count open disputes for the header
  const openDisputeCount = withdrawals?.filter(
    (w) => w.receiptStatus === "not_received" && !w.resolvedAt,
  ).length ?? 0;

  const handleOpenResolve = (w: NonNullable<typeof withdrawals>[number]) => {
    setResolveDialog({
      withdrawalId: w.id,
      customerName: w.customerName || "Customer",
      amount: w.amount,
      adminResponse: w.adminResponse ?? null,
      resolutionType: w.resolutionType ?? null,
      resolvedAt: w.resolvedAt ? String(w.resolvedAt) : null,
    });
    setResolveReason(w.adminResponse ?? "");
    setResolveType((w.resolutionType as ResolutionType) ?? "rejected");
  };

  const handleSubmitResolve = () => {
    if (!resolveDialog || !resolveReason.trim()) return;
    resolve({
      id: resolveDialog.withdrawalId,
      data: { resolution: resolveType, reason: resolveReason.trim() },
    });
  };

  const isAlreadyResolved = resolveDialog?.resolvedAt != null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-3">
            Withdrawals
            {openDisputeCount > 0 && (
              <Badge className="bg-orange-100 text-orange-700 border-orange-200">
                {openDisputeCount} open dispute{openDisputeCount !== 1 ? "s" : ""}
              </Badge>
            )}
          </h1>
          <p className="text-muted-foreground mt-1">
            Monitor loan withdrawal requests, unlock accounts, and resolve receipt disputes.
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
                {filtered.map((w) => {
                  const hasOpenDispute = w.status === "disbursed" && w.receiptStatus === "not_received" && !w.resolvedAt;
                  const hasResolvedDispute = w.receiptStatus === "not_received" && w.resolvedAt;

                  return (
                    <TableRow
                      key={w.id}
                      className={hasOpenDispute ? "bg-orange-50/50" : undefined}
                    >
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
                        <ReceiptBadge
                          receiptStatus={w.receiptStatus}
                          resolvedAt={w.resolvedAt ? String(w.resolvedAt) : null}
                        />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {w.verificationAttempts}/3
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDateTime(w.createdAt as unknown as string)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {w.status === "locked" && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={unlocking && unlockVars?.id === w.id}
                              onClick={() => unlock({ id: w.id })}
                            >
                              <Unlock className="h-3.5 w-3.5 mr-1" />
                              {unlocking && unlockVars?.id === w.id ? "Unlocking…" : "Unlock"}
                            </Button>
                          )}
                          {hasOpenDispute && (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleOpenResolve(w)}
                            >
                              <MessageSquare className="h-3.5 w-3.5 mr-1" />
                              Resolve dispute
                            </Button>
                          )}
                          {hasResolvedDispute && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-muted-foreground"
                              onClick={() => handleOpenResolve(w)}
                            >
                              <MessageSquare className="h-3.5 w-3.5 mr-1" />
                              View resolution
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Resolve dispute dialog */}
      <Dialog open={!!resolveDialog} onOpenChange={(open) => { if (!open) setResolveDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {isAlreadyResolved ? "Dispute resolution" : "Resolve withdrawal dispute"}
            </DialogTitle>
            <DialogDescription>
              {resolveDialog && (
                <>
                  <span className="font-medium">{resolveDialog.customerName}</span> reported they
                  did not receive{" "}
                  <span className="font-semibold">{formatCurrency(resolveDialog.amount)}</span>.
                  {isAlreadyResolved && " This dispute has already been resolved."}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Resolution type */}
            <div className="space-y-2">
              <Label>Resolution action</Label>
              <div className="grid grid-cols-1 gap-2">
                {[
                  {
                    value: "rejected" as ResolutionType,
                    label: "Reject dispute",
                    description: "Close the issue. Customer sees your reason.",
                    icon: XCircle,
                    color: "border-red-200 bg-red-50 text-red-800",
                    activeColor: "border-red-500 bg-red-100",
                  },
                  {
                    value: "new_card_required" as ResolutionType,
                    label: "Request new card",
                    description: "Ask customer to add a different virtual card.",
                    icon: CreditCard,
                    color: "border-blue-200 bg-blue-50 text-blue-800",
                    activeColor: "border-blue-500 bg-blue-100",
                  },
                  {
                    value: "retry" as ResolutionType,
                    label: "Reset & retry",
                    description: "Reset withdrawal steps so customer can retry.",
                    icon: RefreshCw,
                    color: "border-green-200 bg-green-50 text-green-800",
                    activeColor: "border-green-500 bg-green-100",
                  },
                ].map((opt) => {
                  const Icon = opt.icon;
                  const isSelected = resolveType === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={isAlreadyResolved}
                      onClick={() => setResolveType(opt.value)}
                      className={`flex items-start gap-3 rounded-md border-2 p-3 text-left transition-colors disabled:opacity-60 disabled:cursor-default ${
                        isSelected ? opt.activeColor + " border-2" : "border-border hover:border-muted-foreground/30"
                      }`}
                    >
                      <Icon className="h-4 w-4 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium leading-tight">{opt.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Reason / message to customer */}
            <div className="space-y-2">
              <Label htmlFor="resolveReason">
                Message to customer <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="resolveReason"
                rows={3}
                placeholder="Explain the reason or next steps to the customer…"
                value={resolveReason}
                onChange={(e) => setResolveReason(e.target.value)}
                disabled={isAlreadyResolved}
              />
              <p className="text-xs text-muted-foreground">
                This message will appear on the customer's dashboard.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveDialog(null)}>
              {isAlreadyResolved ? "Close" : "Cancel"}
            </Button>
            {!isAlreadyResolved && (
              <Button
                onClick={handleSubmitResolve}
                disabled={resolving || !resolveReason.trim()}
              >
                {resolving ? "Resolving…" : "Send resolution"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
