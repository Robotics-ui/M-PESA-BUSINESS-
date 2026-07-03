import { useState } from "react";
import { Link } from "wouter";
import {
  useListAllLoanApplications,
  useDecideLoanApplication,
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
import { StatusBadge } from "@/components/StatusBadge";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/format";
import { ClipboardList, Check, X, PauseCircle } from "lucide-react";

export default function AdminLoans() {
  const [status, setStatus] = useState<string>("all");
  const [reviewing, setReviewing] = useState<LoanApplicationWithCustomer | null>(null);
  const [decisionStatus, setDecisionStatus] = useState<LoanApplicationDecisionStatus>("approved");
  const [reviewNotes, setReviewNotes] = useState("");

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
      onError: () => toast({ title: "Failed to record decision", variant: "destructive" }),
    },
  });

  function openReview(app: LoanApplicationWithCustomer, decision: LoanApplicationDecisionStatus) {
    setReviewing(app);
    setDecisionStatus(decision);
    setReviewNotes("");
  }

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

      <Dialog open={!!reviewing} onOpenChange={(open) => !open && setReviewing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="capitalize">{decisionStatus} application</DialogTitle>
            <DialogDescription>
              {reviewing && `${reviewing.customerName ?? "This customer"}'s request for ${formatCurrency(reviewing.amount)}`}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Add review notes (optional)"
            value={reviewNotes}
            onChange={(e) => setReviewNotes(e.target.value)}
            rows={4}
            data-testid="input-review-notes"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewing(null)} disabled={isPending}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                reviewing &&
                decide({
                  id: reviewing.id,
                  data: { status: decisionStatus, reviewNotes: reviewNotes || undefined },
                })
              }
              disabled={isPending}
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
