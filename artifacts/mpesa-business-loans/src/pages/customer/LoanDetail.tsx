import { useParams, Link } from "wouter";
import {
  useGetMyLoanApplication,
  getGetMyLoanApplicationQueryKey,
  useListMyLoans,
  useGetLoanRepaymentSchedule,
  getGetLoanRepaymentScheduleQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/StatusBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/format";
import { ArrowLeft } from "lucide-react";

export default function LoanDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id!;

  const { data: application, isLoading: appLoading } = useGetMyLoanApplication(id, {
    query: { enabled: !!id, queryKey: getGetMyLoanApplicationQueryKey(id) },
  });
  const { data: loans } = useListMyLoans();
  const loan = loans?.find((l) => l.applicationId === id);

  const { data: schedule, isLoading: scheduleLoading } = useGetLoanRepaymentSchedule(loan?.id ?? "", {
    query: { enabled: !!loan?.id, queryKey: getGetLoanRepaymentScheduleQueryKey(loan?.id ?? "") },
  });

  if (appLoading) {
    return (
      <div className="space-y-4 max-w-3xl">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!application) {
    return <p className="text-muted-foreground">Application not found.</p>;
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/loans">
        <a className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to my loans
        </a>
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground" data-testid="text-application-amount">
            {formatCurrency(application.amount)}
          </h1>
          <p className="text-muted-foreground text-sm capitalize">{application.loanType.replace(/_/g, " ")}</p>
        </div>
        <StatusBadge status={application.status} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Application details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-y-3 text-sm">
          <span className="text-muted-foreground">Term</span>
          <span className="text-foreground">{application.termMonths} months</span>
          <span className="text-muted-foreground">Purpose</span>
          <span className="text-foreground">{application.purpose}</span>
          <span className="text-muted-foreground">Submitted</span>
          <span className="text-foreground">{formatDate(application.createdAt)}</span>
          {application.reviewedAt && (
            <>
              <span className="text-muted-foreground">Reviewed</span>
              <span className="text-foreground">{formatDate(application.reviewedAt)}</span>
            </>
          )}
        </CardContent>
      </Card>

      {application.status === "rejected" && application.reviewNotes && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-sm font-medium text-red-800 mb-1">Reason for rejection</p>
            <p className="text-sm text-red-700">{application.reviewNotes}</p>
          </CardContent>
        </Card>
      )}

      {application.status === "approved" && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <p className="text-sm font-medium text-green-800 mb-1">Next step</p>
            <p className="text-sm text-green-700">
              {application.reviewNotes ||
                "Add and verify your virtual card, then request a withdrawal to receive your funds."}
            </p>
            <div className="flex gap-3 mt-3">
              <Link href="/virtual-card">
                <a className="text-xs text-primary hover:underline">Manage virtual card →</a>
              </Link>
              <Link href="/withdraw">
                <a className="text-xs text-primary hover:underline">Withdraw funds →</a>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {loan && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Repayment schedule</CardTitle>
          </CardHeader>
          <CardContent>
            {scheduleLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : !schedule || schedule.length === 0 ? (
              <p className="text-sm text-muted-foreground">No repayment schedule available yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Due date</TableHead>
                    <TableHead>Amount due</TableHead>
                    <TableHead>Amount paid</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schedule.map((installment) => (
                    <TableRow key={installment.id} data-testid={`row-installment-${installment.installmentNumber}`}>
                      <TableCell>{installment.installmentNumber}</TableCell>
                      <TableCell>{formatDate(installment.dueDate)}</TableCell>
                      <TableCell>{formatCurrency(installment.amountDue)}</TableCell>
                      <TableCell>{installment.amountPaid ? formatCurrency(installment.amountPaid) : "—"}</TableCell>
                      <TableCell>
                        <StatusBadge status={installment.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
