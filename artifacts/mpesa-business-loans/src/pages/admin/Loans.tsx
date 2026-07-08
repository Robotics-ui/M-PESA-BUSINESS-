import { useState } from "react";
import { Link } from "wouter";
import {
  useListAllLoanApplications,
  useDecideLoanApplication,
  useEditLoanApplication,
  getListAllLoanApplicationsQueryKey,
  ListAllLoanApplicationsStatus,
  LoanApplicationDecisionStatus,
  type LoanApplicationWithCustomer,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/StatusBadge";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/format";
import { ClipboardList, Check, X, PauseCircle, Pencil } from "lucide-react";

export default function AdminLoans() {
  const [status, setStatus] = useState<string>("all");
  const [reviewing, setReviewing] = useState<LoanApplicationWithCustomer | null>(null);
  const [decisionStatus, setDecisionStatus] = useState<LoanApplicationDecisionStatus>("approved");
  const [reviewNotes, setReviewNotes] = useState("");

  const [editing, setEditing] = useState<LoanApplicationWithCustomer | null>(null);
  const [editForm, setEditForm] = useState({ amount: "", purpose: "", loanType: "", termMonths: "" });

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: applications, isLoading } = useListAllLoanApplications({
    status: status === "all" ? undefined : (status as ListAllLoanApplicationsStatus),
  });

  const { mutate: decide, isPending } = useDecideLoanApplication({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAllLoanApplicationsQueryKey() });
        toast({ title: "Decision recorded" });
        setReviewing(null);
        setReviewNotes("");
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error ?? "Failed to record decision";
        toast({ title: msg, variant: "destructive" });
      },
    },
  });

  const { mutate: editApplication, isPending: isEditing } = useEditLoanApplication({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAllLoanApplicationsQueryKey() });
        toast({ title: "Application updated" });
        setEditing(null);
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error ?? "Failed to update application";
        toast({ title: msg, variant: "destructive" });
      },
    },
  });

  function openReview(app: LoanApplicationWithCustomer, decision: LoanApplicationDecisionStatus) {
    setReviewing(app);
    setDecisionStatus(decision);
    setReviewNotes("");
  }

  function openEdit(app: LoanApplicationWithCustomer) {
    setEditing(app);
    setEditForm({
      amount: app.amount,
      purpose: app.purpose,
      loanType: app.loanType,
      termMonths: String(app.termMonths),
    });
  }

  const isRejecting = decisionStatus === "rejected";
  const isApproving = decisionStatus === "approved";
  const canConfirmDecision = !isRejecting || reviewNotes.trim().length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center">
          <ClipboardList className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Loan applications</h1>
          <p className="text-muted-foreground text-sm">Review and decide on customer applications.</p>
        </div>
      </div>

      <Select value={status} onValueChange={setStatus}>
        <SelectTrigger className="w-48" data-testid="select-application-status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="pending">Pending</SelectItem>
          <SelectItem value="approved">Approved</SelectItem>
          <SelectItem value="rejected">Rejected</SelectItem>
          <SelectItem value="hold">On hold</SelectItem>
        </SelectContent>
      </Select>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6">
              <Skeleton className="h-64 w-full" />
            </div>
          ) : !applications || applications.length === 0 ? (
            <p className="text-sm text-muted-foreground p-6">No applications found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Term</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {applications.map((app) => (
                  <TableRow key={app.id} data-testid={`row-application-${app.id}`}>
                    <TableCell>
                      <Link href={`/admin/customers/${app.customerId}`}>
                        <a className="font-medium text-foreground hover:underline">{app.customerName ?? "Unnamed"}</a>
                      </Link>
                      <div className="text-xs text-muted-foreground">{app.customerEmail}</div>
                    </TableCell>
                    <TableCell>{formatCurrency(app.amount)}</TableCell>
                    <TableCell className="capitalize">{app.loanType.replace(/_/g, " ")}</TableCell>
                    <TableCell>{app.termMonths}mo</TableCell>
                    <TableCell>
                      <StatusBadge status={app.status} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(app.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      {app.status === "pending" || app.status === "hold" ? (
                        <div className="flex justify-end gap-2">
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-8 w-8"
                            onClick={() => openEdit(app)}
                            title="Edit details"
                            data-testid={`button-edit-${app.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-8 w-8"
                            onClick={() => openReview(app, "approved")}
                            title="Approve"
                            data-testid={`button-approve-${app.id}`}
                          >
                            <Check className="h-4 w-4 text-primary" />
                          </Button>
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-8 w-8"
                            onClick={() => openReview(app, "hold")}
                            title="Hold"
                            data-testid={`button-hold-${app.id}`}
                          >
                            <PauseCircle className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-8 w-8"
                            onClick={() => openReview(app, "rejected")}
                            title="Reject"
                            data-testid={`button-reject-${app.id}`}
                          >
                            <X className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      ) : app.status === "approved" ? (
                        <div className="flex justify-end gap-2 items-center">
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-8 w-8"
                            onClick={() => openEdit(app)}
                            title="Edit approved amount"
                            data-testid={`button-edit-${app.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <span className="text-xs text-muted-foreground">Reviewed</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Reviewed</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit application</DialogTitle>
            <DialogDescription>
              {editing &&
                (editing.status === "approved"
                  ? `Update ${editing.customerName ?? "this customer"}'s approved loan amount. This will immediately update their approved limit on their dashboard.`
                  : `Adjust ${editing.customerName ?? "this customer"}'s requested loan details before deciding.`)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-amount">Amount</Label>
              <Input
                id="edit-amount"
                value={editForm.amount}
                onChange={(e) => setEditForm((f) => ({ ...f, amount: e.target.value }))}
                data-testid="input-edit-amount"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-purpose">Purpose</Label>
              <Textarea
                id="edit-purpose"
                value={editForm.purpose}
                onChange={(e) => setEditForm((f) => ({ ...f, purpose: e.target.value }))}
                rows={3}
                data-testid="input-edit-purpose"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-loan-type">Loan type</Label>
                <Input
                  id="edit-loan-type"
                  value={editForm.loanType}
                  onChange={(e) => setEditForm((f) => ({ ...f, loanType: e.target.value }))}
                  data-testid="input-edit-loan-type"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-term">Term (months)</Label>
                <Input
                  id="edit-term"
                  type="number"
                  min={1}
                  max={60}
                  value={editForm.termMonths}
                  onChange={(e) => setEditForm((f) => ({ ...f, termMonths: e.target.value }))}
                  data-testid="input-edit-term"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={isEditing}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                editing &&
                editApplication({
                  id: editing.id,
                  data: {
                    amount: editForm.amount,
                    purpose: editForm.purpose,
                    loanType: editForm.loanType,
                    termMonths: Number(editForm.termMonths),
                  },
                })
              }
              disabled={isEditing}
              data-testid="button-save-edit"
            >
              {isEditing ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Decision dialog */}
      <Dialog open={!!reviewing} onOpenChange={(open) => !open && setReviewing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="capitalize">{decisionStatus} application</DialogTitle>
            <DialogDescription>
              {reviewing && `${reviewing.customerName ?? "This customer"}'s request for ${formatCurrency(reviewing.amount)}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="review-notes">
              {isRejecting
                ? "Reason for rejection (required, shown to the customer)"
                : isApproving
                  ? "Next step for the customer (optional, shown to the customer)"
                  : "Notes (optional)"}
            </Label>
            <Textarea
              id="review-notes"
              placeholder={
                isRejecting
                  ? "Explain why this application is being rejected…"
                  : isApproving
                    ? "e.g. Add and verify your virtual card, then request a withdrawal to receive your funds."
                    : "Add review notes (optional)"
              }
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              rows={4}
              data-testid="input-review-notes"
            />
            {isRejecting && !reviewNotes.trim() && (
              <p className="text-xs text-destructive">A rejection reason is required.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewing(null)} disabled={isPending}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                reviewing &&
                decide({
                  id: reviewing.id,
                  data: { status: decisionStatus, reviewNotes: reviewNotes.trim() || undefined },
                })
              }
              disabled={isPending || !canConfirmDecision}
              data-testid="button-confirm-decision"
            >
              {isPending ? "Saving..." : `Confirm ${decisionStatus}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
