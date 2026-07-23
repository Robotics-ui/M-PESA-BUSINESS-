import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAllWithdrawals,
  getListAllWithdrawalsQueryKey,
  useUnlockWithdrawal,
  useResolveWithdrawalIssue,
  useExtendWithdrawal,
  useSetWithdrawalRetryPeriod,
  useIssueViolation,
  getListCustomerViolationsQueryKey,
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
import { Unlock, MessageSquare, CreditCard, RefreshCw, XCircle, CalendarPlus, CalendarClock, Undo2, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";

function StatusBadge({ status }: { status: string }) {
  if (status === "disbursed")
    return <Badge className="bg-green-100 text-green-700 border-green-200">Disbursed</Badge>;
  if (status === "locked")
    return <Badge className="bg-red-100 text-red-700 border-red-200">Locked</Badge>;
  if (status === "failed")
    return <Badge className="bg-red-100 text-red-700 border-red-200">Failed</Badge>;
  if (status === "expired")
    return <Badge className="bg-gray-100 text-gray-600 border-gray-300">Expired</Badge>;
  return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">Pending verification</Badge>;
}

/** Days remaining until expiresAt (negative = already expired). */
function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function ExpiryBadge({ expiresAt, status }: { expiresAt?: string | null; status: string }) {
  if (!expiresAt || status === "disbursed" || status === "failed") return null;
  const days = daysUntil(expiresAt);
  if (days === null) return null;
  if (status === "expired" || days < 0)
    return <p className="text-xs text-gray-500 mt-1">Expired {formatDateTime(expiresAt)}</p>;
  if (days <= 1)
    return <p className="text-xs text-red-600 mt-1 font-medium">Expires today!</p>;
  if (days <= 3)
    return <p className="text-xs text-orange-600 mt-1">Expires in {days}d</p>;
  return <p className="text-xs text-muted-foreground mt-1">Expires in {days}d</p>;
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

type ResolutionType = "rejected" | "new_card_required" | "retry" | "reversed";

interface ResolveDialogState {
  withdrawalId: string;
  customerName: string;
  amount: string;
  adminResponse: string | null;
  resolutionType: string | null;
  resolvedAt: string | null;
}

interface ExtendDialogState {
  withdrawalId: string;
  customerName: string;
  currentExpiry: string | null;
  isExpired: boolean;
}

interface RetryPeriodDialogState {
  withdrawalId: string;
  customerName: string;
  expiresAt: string | null;
}

export default function Withdrawals() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("open_disputes");
  const [autoFiltered, setAutoFiltered] = useState(false);
  const [resolveDialog, setResolveDialog] = useState<ResolveDialogState | null>(null);
  const [resolveReason, setResolveReason] = useState("");
  const [resolveType, setResolveType] = useState<ResolutionType>("rejected");
  const [extendDialog, setExtendDialog] = useState<ExtendDialogState | null>(null);
  const [extendDays, setExtendDays] = useState("7");
  const [retryPeriodDialog, setRetryPeriodDialog] = useState<RetryPeriodDialogState | null>(null);
  const [retryPeriodDays, setRetryPeriodDays] = useState("30");

  // Violation dialog (issue notice directly from withdrawals page)
  const [violationDialog, setViolationDialog] = useState<{
    customerId: string;
    customerName: string;
  } | null>(null);
  const [violationType, setViolationType] = useState<"warning" | "violation">("warning");
  const [violationReason, setViolationReason] = useState("");

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

  const { mutate: extendDeadline, isPending: extending } = useExtendWithdrawal({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAllWithdrawalsQueryKey() });
        setExtendDialog(null);
        setExtendDays("7");
        toast({ title: "Deadline extended", description: "The customer has been notified." });
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error ?? "Failed to extend deadline.";
        toast({ title: "Error", description: msg, variant: "destructive" });
      },
    },
  });

  const { mutate: setRetryPeriod, isPending: settingRetry } = useSetWithdrawalRetryPeriod({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAllWithdrawalsQueryKey() });
        setRetryPeriodDialog(null);
        setRetryPeriodDays("30");
        toast({ title: "Retry period set", description: "The customer has been notified." });
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error ?? "Failed to set retry period.";
        toast({ title: "Error", description: msg, variant: "destructive" });
      },
    },
  });

  const { mutate: issueViolation, isPending: issuingViolation } = useIssueViolation({
    mutation: {
      onSuccess: () => {
        if (violationDialog) {
          queryClient.invalidateQueries({ queryKey: getListCustomerViolationsQueryKey(violationDialog.customerId) });
        }
        setViolationDialog(null);
        setViolationReason("");
        setViolationType("warning");
        toast({ title: "Notice sent", description: "The customer has been notified." });
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error ?? "Failed to send notice.";
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

  const handleOpenExtend = (w: NonNullable<typeof withdrawals>[number]) => {
    setExtendDialog({
      withdrawalId: w.id,
      customerName: w.customerName || "Customer",
      currentExpiry: w.expiresAt ? String(w.expiresAt) : null,
      isExpired: w.status === "expired",
    });
    setExtendDays("7");
  };

  const handleOpenRetryPeriod = (w: NonNullable<typeof withdrawals>[number]) => {
    setRetryPeriodDialog({
      withdrawalId: w.id,
      customerName: w.customerName || "Customer",
      expiresAt: w.expiresAt ? String(w.expiresAt) : null,
    });
    setRetryPeriodDays(String(w.retryAfterDays ?? 30));
  };

  const handleSubmitExtend = () => {
    if (!extendDialog) return;
    const days = parseInt(extendDays, 10);
    if (!days || days < 1) return;
    extendDeadline({ id: extendDialog.withdrawalId, data: { days } });
  };

  const handleSubmitRetryPeriod = () => {
    if (!retryPeriodDialog) return;
    const days = parseInt(retryPeriodDays, 10);
    if (isNaN(days) || days < 0) return;
    setRetryPeriod({ id: retryPeriodDialog.withdrawalId, data: { days } });
  };

  // Count open disputes for the header badge and auto-filter
  const openDisputeCount = withdrawals?.filter(
    (w) => w.receiptStatus === "not_received" && !w.resolvedAt,
  ).length ?? 0;

  // When data first loads: if there are no open disputes, fall back to "all"
  // so the page isn't confusingly empty. If disputes exist, stay on "open_disputes".
  useEffect(() => {
    if (!withdrawals || autoFiltered) return;
    setAutoFiltered(true);
    if (openDisputeCount === 0) setStatusFilter("all");
  }, [withdrawals, autoFiltered, openDisputeCount]);

  const filtered = withdrawals?.filter((w) => {
    if (statusFilter === "open_disputes")
      return w.receiptStatus === "not_received" && !w.resolvedAt;
    if (statusFilter === "all") return true;
    if (statusFilter === "trials") return !!w.isTrial;
    return w.status === statusFilter;
  });

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
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open_disputes">
              ⚠ Open disputes{openDisputeCount > 0 ? ` (${openDisputeCount})` : ""}
            </SelectItem>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="trials">Trial withdrawals</SelectItem>
            <SelectItem value="pending_verification">Pending verification</SelectItem>
            <SelectItem value="disbursed">Disbursed</SelectItem>
            <SelectItem value="locked">Locked</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
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
                  <TableHead>Status / Expiry</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((w) => {
                  const hasOpenDispute = w.status === "disbursed" && w.receiptStatus === "not_received" && !w.resolvedAt;
                  const hasResolvedDispute = w.receiptStatus === "not_received" && w.resolvedAt;

                  const isExpired = w.status === "expired";
                  const isPending = w.status === "pending_verification";
                  const canExtend = isPending || isExpired;

                  return (
                    <TableRow
                      key={w.id}
                      className={hasOpenDispute ? "bg-orange-50/50" : isExpired ? "bg-gray-50/60" : undefined}
                    >
                      <TableCell>
                        <p className="font-medium text-foreground">{w.customerName || "—"}</p>
                        <p className="text-xs text-muted-foreground">{w.customerEmail}</p>
                      </TableCell>
                      <TableCell className="font-medium">{formatCurrency(w.amount)}</TableCell>
                      <TableCell className="font-mono text-sm">{w.mpesaPhone}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <StatusBadge status={w.status} />
                          {w.isTrial && (
                            <Badge className="bg-blue-100 text-blue-700 border-blue-200">Trial</Badge>
                          )}
                        </div>
                        {w.status === "locked" && w.lockedAt && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Locked {formatDateTime(w.lockedAt as unknown as string)}
                          </p>
                        )}
                        <ExpiryBadge
                          expiresAt={w.expiresAt ? String(w.expiresAt) : null}
                          status={w.status}
                        />
                        {isExpired && w.retryAfterDays != null && w.retryAfterDays > 0 && w.expiresAt && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Retry after {w.retryAfterDays}d wait
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
                        <div className="flex items-center justify-end gap-2 flex-wrap">
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
                          {canExtend && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-blue-200 text-blue-700 hover:bg-blue-50"
                              onClick={() => handleOpenExtend(w)}
                            >
                              <CalendarPlus className="h-3.5 w-3.5 mr-1" />
                              {isExpired ? "Reinstate" : "Extend"}
                            </Button>
                          )}
                          {isExpired && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-orange-200 text-orange-700 hover:bg-orange-50"
                              onClick={() => handleOpenRetryPeriod(w)}
                            >
                              <CalendarClock className="h-3.5 w-3.5 mr-1" />
                              Retry period
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
                          {/* Issue violation — available for locked accounts and repeated failures */}
                          {(w.status === "locked" || hasOpenDispute || (w.verificationAttempts >= 2)) && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-orange-200 text-orange-700 hover:bg-orange-50"
                              onClick={() => {
                                setViolationDialog({ customerId: w.customerId, customerName: w.customerName || "Customer" });
                                setViolationType("warning");
                                setViolationReason("");
                              }}
                            >
                              <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                              Issue notice
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
                  {
                    value: "reversed" as ResolutionType,
                    label: "Reverse (wrong number)",
                    description: "Funds sent to the wrong M-Pesa number — reverse the transfer and cancel this loan so the customer owes nothing.",
                    icon: Undo2,
                    color: "border-orange-200 bg-orange-50 text-orange-800",
                    activeColor: "border-orange-500 bg-orange-100",
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
      {/* Extend deadline dialog */}
      <Dialog open={!!extendDialog} onOpenChange={(open) => { if (!open) setExtendDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {extendDialog?.isExpired ? "Reinstate & extend deadline" : "Extend withdrawal deadline"}
            </DialogTitle>
            <DialogDescription>
              {extendDialog && (
                <>
                  Add days to{" "}
                  <span className="font-medium">{extendDialog.customerName}</span>'s withdrawal deadline.
                  {extendDialog.isExpired && " This will also reinstate the expired request so the customer can continue."}
                  {!extendDialog.isExpired && extendDialog.currentExpiry && (
                    <> Current deadline: <span className="font-medium">{formatDateTime(extendDialog.currentExpiry)}</span>.</>
                  )}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="extendDays">Number of days to add</Label>
            <Input
              id="extendDays"
              type="number"
              min={1}
              max={90}
              value={extendDays}
              onChange={(e) => setExtendDays(e.target.value)}
              placeholder="7"
            />
            <p className="text-xs text-muted-foreground">
              The new deadline will be calculated from the current expiry date (or from now if already expired).
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtendDialog(null)}>Cancel</Button>
            <Button
              onClick={handleSubmitExtend}
              disabled={extending || !extendDays || parseInt(extendDays) < 1}
            >
              {extending ? "Extending…" : "Extend deadline"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Issue violation dialog */}
      <Dialog open={!!violationDialog} onOpenChange={(open) => { if (!open) setViolationDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Issue warning or notice</DialogTitle>
            <DialogDescription>
              {violationDialog && (
                <>Send a formal notice to <span className="font-medium">{violationDialog.customerName}</span> regarding repeated withdrawal failures.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-2">
              <Label>Type</Label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setViolationType("warning")}
                  className={`flex-1 rounded-md border-2 p-3 text-sm font-medium transition-colors ${violationType === "warning" ? "border-orange-400 bg-orange-50 text-orange-800" : "border-border text-muted-foreground hover:border-muted-foreground/40"}`}
                >
                  ⚠ Warning
                </button>
                <button
                  type="button"
                  onClick={() => setViolationType("violation")}
                  className={`flex-1 rounded-md border-2 p-3 text-sm font-medium transition-colors ${violationType === "violation" ? "border-red-400 bg-red-50 text-red-800" : "border-border text-muted-foreground hover:border-muted-foreground/40"}`}
                >
                  🚫 Policy violation
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="wViolationReason">Message to customer <span className="text-destructive">*</span></Label>
              <Textarea
                id="wViolationReason"
                rows={4}
                placeholder="e.g. Your account has been flagged for multiple failed withdrawal attempts. Further violations may result in account suspension."
                value={violationReason}
                onChange={(e) => setViolationReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setViolationDialog(null)}>Cancel</Button>
            <Button
              disabled={issuingViolation || !violationReason.trim()}
              variant={violationType === "violation" ? "destructive" : "default"}
              onClick={() => {
                if (!violationDialog) return;
                issueViolation({ id: violationDialog.customerId, data: { type: violationType, reason: violationReason.trim() } });
              }}
            >
              {issuingViolation ? "Sending…" : "Send notice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Set retry period dialog */}
      <Dialog open={!!retryPeriodDialog} onOpenChange={(open) => { if (!open) setRetryPeriodDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Set retry period</DialogTitle>
            <DialogDescription>
              {retryPeriodDialog && (
                <>
                  Set how many days{" "}
                  <span className="font-medium">{retryPeriodDialog.customerName}</span> must wait after
                  expiry before they can start a new withdrawal. Set to 0 to allow immediate retry.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="retryDays">Days after expiry before retry is allowed</Label>
            <Input
              id="retryDays"
              type="number"
              min={0}
              max={365}
              value={retryPeriodDays}
              onChange={(e) => setRetryPeriodDays(e.target.value)}
              placeholder="30"
            />
            {retryPeriodDialog?.expiresAt && parseInt(retryPeriodDays) > 0 && !isNaN(parseInt(retryPeriodDays)) && (
              <p className="text-xs text-muted-foreground">
                Customer can retry from:{" "}
                <span className="font-medium">
                  {formatDateTime(
                    new Date(
                      new Date(retryPeriodDialog.expiresAt).getTime() +
                      parseInt(retryPeriodDays) * 24 * 60 * 60 * 1000,
                    ).toISOString(),
                  )}
                </span>
              </p>
            )}
            {parseInt(retryPeriodDays) === 0 && (
              <p className="text-xs text-green-600">Customer can apply again immediately.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRetryPeriodDialog(null)}>Cancel</Button>
            <Button
              onClick={handleSubmitRetryPeriod}
              disabled={settingRetry || retryPeriodDays === "" || isNaN(parseInt(retryPeriodDays)) || parseInt(retryPeriodDays) < 0}
            >
              {settingRetry ? "Saving…" : "Set retry period"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
