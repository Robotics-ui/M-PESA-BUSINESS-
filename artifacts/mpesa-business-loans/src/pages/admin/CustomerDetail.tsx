import { useParams, Link } from "wouter";
import {
  useGetCustomerDetail,
  getGetCustomerDetailQueryKey,
  useUpdateCustomerStatus,
  getListCustomersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate, fullName } from "@/lib/format";
import { ArrowLeft, ShieldAlert, ShieldCheck, FileImage, ExternalLink } from "lucide-react";

export default function CustomerDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id!;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: customer, isLoading } = useGetCustomerDetail(id, {
    query: { enabled: !!id, queryKey: getGetCustomerDetailQueryKey(id) },
  });

  const { mutate: updateStatus, isPending } = useUpdateCustomerStatus({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetCustomerDetailQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
        toast({ title: "Account status updated" });
      },
      onError: () => toast({ title: "Failed to update status", variant: "destructive" }),
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-4xl">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!customer) {
    return <p className="text-muted-foreground">Customer not found.</p>;
  }

  const isSuspended = customer.accountStatus === "suspended";

  return (
    <div className="max-w-4xl space-y-6">
      <Link href="/admin/customers">
        <a className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to customers
        </a>
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground" data-testid="text-customer-name">
            {fullName(customer.firstName, customer.lastName)}
          </h1>
          <p className="text-muted-foreground text-sm">{customer.email}</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={customer.accountStatus} />
          <Button
            variant={isSuspended ? "default" : "outline"}
            disabled={isPending}
            onClick={() =>
              updateStatus({
                id: customer.id,
                data: { accountStatus: isSuspended ? "active" : "suspended" },
              })
            }
            data-testid="button-toggle-status"
          >
            {isSuspended ? (
              <>
                <ShieldCheck className="h-4 w-4 mr-1.5" /> Activate account
              </>
            ) : (
              <>
                <ShieldAlert className="h-4 w-4 mr-1.5" /> Suspend account
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profile</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-y-3 text-sm">
            <span className="text-muted-foreground">Phone</span>
            <span className="text-foreground">
              {customer.phone ?? "—"}{" "}
              <Badge variant="outline" className="ml-1">
                {customer.phoneVerified ? "Verified" : "Unverified"}
              </Badge>
            </span>
            <span className="text-muted-foreground">National ID</span>
            <span className="text-foreground">{customer.profile?.nationalIdNumber ?? "—"}</span>
            <span className="text-muted-foreground">Date of birth</span>
            <span className="text-foreground">{formatDate(customer.profile?.dateOfBirth)}</span>
            <span className="text-muted-foreground">Address</span>
            <span className="text-foreground">
              {customer.profile?.address ?? "—"}
              {customer.profile?.city ? `, ${customer.profile.city}` : ""}
            </span>
            <span className="text-muted-foreground">Profile status</span>
            <span className="text-foreground">
              <Badge variant="outline">{customer.profileComplete ? "Complete" : "Incomplete"}</Badge>
            </span>
            <span className="text-muted-foreground">Joined</span>
            <span className="text-foreground">{formatDate(customer.createdAt)}</span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileImage className="h-4 w-4" /> Documents
            </CardTitle>
          </CardHeader>
          <CardContent>
            {customer.documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No documents uploaded.</p>
            ) : (
              <div className="space-y-2">
                {customer.documents.map((doc) => (
                  <a
                    key={doc.id}
                    href={doc.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between text-sm rounded-md border border-border px-3 py-2 hover-elevate"
                    data-testid={`link-document-${doc.id}`}
                  >
                    <span className="capitalize text-foreground">{doc.type.replace(/_/g, " ")}</span>
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                  </a>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Loan applications</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {customer.loanApplications.length === 0 ? (
            <p className="text-sm text-muted-foreground px-6 pb-6">No applications yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Amount</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submitted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customer.loanApplications.map((app) => (
                  <TableRow key={app.id}>
                    <TableCell>{formatCurrency(app.amount)}</TableCell>
                    <TableCell className="capitalize">{app.loanType.replace(/_/g, " ")}</TableCell>
                    <TableCell>
                      <StatusBadge status={app.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{formatDate(app.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Loans</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {customer.loans.length === 0 ? (
            <p className="text-sm text-muted-foreground px-6 pb-6">No disbursed loans yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Principal</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Due date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customer.loans.map((loan) => (
                  <TableRow key={loan.id}>
                    <TableCell>{formatCurrency(loan.principal)}</TableCell>
                    <TableCell>{loan.interestRate}%</TableCell>
                    <TableCell>
                      <StatusBadge status={loan.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{formatDate(loan.dueDate)}</TableCell>
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
