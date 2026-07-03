import { Link } from "wouter";
import { useListMyLoanApplications, useListMyLoans } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/StatusBadge";
import { formatCurrency, formatDate } from "@/lib/format";
import { FileText, Inbox } from "lucide-react";

export default function Loans() {
  const { data: applications, isLoading: appsLoading } = useListMyLoanApplications();
  const { data: loans, isLoading: loansLoading } = useListMyLoans();

  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">My loans</h1>
          <p className="text-muted-foreground text-sm">Track applications and disbursed loans.</p>
        </div>
        <Link href="/apply">
          <Button data-testid="button-new-application">New application</Button>
        </Link>
      </div>

      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Applications</h2>
        {appsLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : !applications || applications.length === 0 ? (
          <Card>
            <CardContent className="py-12 flex flex-col items-center text-center">
              <FileText className="h-8 w-8 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">No applications yet.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {applications.map((app) => (
              <Link key={app.id} href={`/loans/${app.id}`}>
                <a data-testid={`card-application-${app.id}`}>
                  <Card className="hover-elevate transition-colors">
                    <CardContent className="py-4 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-foreground">{formatCurrency(app.amount)}</p>
                        <p className="text-sm text-muted-foreground capitalize">
                          {app.loanType.replace(/_/g, " ")} · {app.termMonths} months
                        </p>
                      </div>
                      <div className="text-right">
                        <StatusBadge status={app.status} />
                        <p className="text-xs text-muted-foreground mt-1">{formatDate(app.createdAt)}</p>
                      </div>
                    </CardContent>
                    {app.status === "approved" && (
                      <CardContent className="pt-0 pb-4 -mt-2">
                        <p className="text-xs text-green-700">
                          Next step: {app.reviewNotes || "add and verify your virtual card, then withdraw your funds."}
                        </p>
                      </CardContent>
                    )}
                    {app.status === "rejected" && app.reviewNotes && (
                      <CardContent className="pt-0 pb-4 -mt-2">
                        <p className="text-xs text-red-700">Reason: {app.reviewNotes}</p>
                      </CardContent>
                    )}
                  </Card>
                </a>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Disbursed loans</h2>
        {loansLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : !loans || loans.length === 0 ? (
          <Card>
            <CardContent className="py-12 flex flex-col items-center text-center">
              <Inbox className="h-8 w-8 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">No disbursed loans yet.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {loans.map((loan) => (
              <Link key={loan.id} href={`/loans/${loan.applicationId}`}>
                <a data-testid={`card-loan-${loan.id}`}>
                  <Card className="hover-elevate transition-colors">
                    <CardContent className="py-4 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-foreground">{formatCurrency(loan.principal)}</p>
                        <p className="text-sm text-muted-foreground">
                          {loan.interestRate}% interest · {loan.termMonths} months
                        </p>
                      </div>
                      <div className="text-right">
                        <StatusBadge status={loan.status} />
                        <p className="text-xs text-muted-foreground mt-1">Due {formatDate(loan.dueDate)}</p>
                      </div>
                    </CardContent>
                  </Card>
                </a>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
