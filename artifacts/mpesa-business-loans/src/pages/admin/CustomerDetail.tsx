import { useState } from "react";
import { useParams, Link } from "wouter";
import {
  useGetCustomerDetail,
  getGetCustomerDetailQueryKey,
  useUpdateCustomerStatus,
  getListCustomersQueryKey,
  useUpdateCustomerLoanAmount,
  useUpdateCustomerLoanStatus,
  useUpdateCustomerName,
  useListAllVirtualCards,
  getListAllVirtualCardsQueryKey,
  useDecideVirtualCard,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/StatusBadge";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate, fullName } from "@/lib/format";
import {
  ArrowLeft,
  ShieldAlert,
  ShieldCheck,
  FileImage,
  ExternalLink,
  CreditCard,
  CheckCircle2,
  XCircle,
  RefreshCw,
  DollarSign,
  Snowflake,
  Ban,
  Play,
  Pencil,
} from "lucide-react";

type CardDecisionStatus = "approved" | "rejected" | "request_new";

export default function CustomerDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id!;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Name edit state
  const [editingName, setEditingName] = useState(false);
  const [firstNameInput, setFirstNameInput] = useState("");
  const [lastNameInput, setLastNameInput] = useState("");

  // Loan amount edit state
  const [editingAmount, setEditingAmount] = useState(false);
  const [amountInput, setAmountInput] = useState("");

  // Card decision modal state
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [cardDecision, setCardDecision] = useState<CardDecisionStatus>("approved");
  const [cardReason, setCardReason] = useState("");
  const [cardAdminNote, setCardAdminNote] = useState("");

  const { data: customer, isLoading } = useGetCustomerDetail(id, {
    query: { enabled: !!id, queryKey: getGetCustomerDetailQueryKey(id) },
  });

  const { data: virtualCards } = useListAllVirtualCards(undefined, {
    query: { queryKey: getListAllVirtualCardsQueryKey(), enabled: !!id },
  });
  const customerCards = virtualCards?.filter((c) => c.customerId === id) ?? [];

  const { mutate: updateStatus, isPending: updatingStatus } = useUpdateCustomerStatus({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetCustomerDetailQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
        toast({ title: "Account status updated" });
      },
      onError: () => toast({ title: "Failed to update status", variant: "destructive" }),
    },
  });

  const { mutate: setLoanAmount, isPending: settingAmount } = useUpdateCustomerLoanAmount({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetCustomerDetailQueryKey(id) });
        setEditingAmount(false);
        toast({ title: "Loan amount updated" });
      },
      onError: () => toast({ title: "Failed to update loan amount", variant: "destructive" }),
    },
  });

  const { mutate: setLoanStatus, isPending: settingLoanStatus } = useUpdateCustomerLoanStatus({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetCustomerDetailQueryKey(id) });
        toast({ title: "Loan status updated" });
      },
      onError: () => toast({ title: "Failed to update loan status", variant: "destructive" }),
    },
  });

  const { mutate: updateName, isPending: updatingName } = useUpdateCustomerName({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getGetCustomerDetailQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
        setEditingName(false);
        toast({ title: "Name updated", description: `${data.firstName ?? ""} ${data.lastName ?? ""}`.trim() });
      },
      onError: () => toast({ title: "Failed to update name", variant: "destructive" }),
    },
  });

  const { mutate: decideCard, isPending: decidingCard } = useDecideVirtualCard({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAllVirtualCardsQueryKey() });
        setSelectedCard(null);
        toast({ title: "Decision saved" });
      },
      onError: () => toast({ title: "Failed to save decision", variant: "destructive" }),
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
  const approvedAmount = Number(customer.profile?.approvedLoanAmount ?? "0");
  const loanStatus = customer.profile?.loanStatus ?? "active";

  return (
    <div className="max-w-4xl space-y-6">
      <Link href="/admin/customers">
        <a className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to customers
        </a>
      </Link>

      <div className="flex items-start justify-between">
        <div>
          {editingName ? (
            <div className="flex items-center gap-2 flex-wrap">
              <Input
                className="h-9 w-36 font-semibold text-lg"
                placeholder="First name"
                value={firstNameInput}
                onChange={(e) => setFirstNameInput(e.target.value)}
                autoFocus
              />
              <Input
                className="h-9 w-36 font-semibold text-lg"
                placeholder="Last name"
                value={lastNameInput}
                onChange={(e) => setLastNameInput(e.target.value)}
              />
              <Button
                size="sm"
                disabled={updatingName || !firstNameInput.trim() || !lastNameInput.trim()}
                onClick={() => updateName({ id: customer.id, data: { firstName: firstNameInput.trim(), lastName: lastNameInput.trim() } })}
              >
                {updatingName ? "Saving…" : "Save"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditingName(false)}>Cancel</Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold text-foreground" data-testid="text-customer-name">
                {fullName(customer.firstName, customer.lastName)}
              </h1>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                title="Edit name"
                onClick={() => {
                  setFirstNameInput(customer.firstName ?? "");
                  setLastNameInput(customer.lastName ?? "");
                  setEditingName(true);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
          <p className="text-muted-foreground text-sm">{customer.email}</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={customer.accountStatus} />
          <Button
            variant={isSuspended ? "default" : "outline"}
            disabled={updatingStatus}
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

      {/* Loan controls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="h-4 w-4" /> Loan controls
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-4">
            <div className="flex-1 space-y-2">
              <Label>Approved loan amount</Label>
              {editingAmount ? (
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min={0}
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                    placeholder="e.g. 80000"
                    className="max-w-xs"
                  />
                  <Button
                    size="sm"
                    disabled={settingAmount}
                    onClick={() => {
                      const val = parseFloat(amountInput);
                      if (!isNaN(val) && val >= 0) {
                        setLoanAmount({ id, data: { approvedLoanAmount: val } });
                      }
                    }}
                  >
                    {settingAmount ? "Saving…" : "Save"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingAmount(false)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="text-xl font-bold text-foreground">
                    {approvedAmount > 0 ? formatCurrency(approvedAmount.toString()) : "Not set"}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setAmountInput(approvedAmount > 0 ? approvedAmount.toString() : "");
                      setEditingAmount(true);
                    }}
                  >
                    {approvedAmount > 0 ? "Edit" : "Set amount"}
                  </Button>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Loan status</Label>
              <div className="flex items-center gap-2">
                <Badge
                  className={
                    loanStatus === "active"
                      ? "bg-green-100 text-green-700 border-green-200"
                      : loanStatus === "frozen"
                        ? "bg-blue-100 text-blue-700 border-blue-200"
                        : "bg-red-100 text-red-700 border-red-200"
                  }
                >
                  {loanStatus}
                </Badge>
                {loanStatus !== "frozen" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={settingLoanStatus}
                    onClick={() => setLoanStatus({ id, data: { loanStatus: "frozen" } })}
                    title="Freeze loan"
                  >
                    <Snowflake className="h-3.5 w-3.5 mr-1" /> Freeze
                  </Button>
                )}
                {loanStatus !== "rejected" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-700 border-red-200 hover:bg-red-50"
                    disabled={settingLoanStatus}
                    onClick={() => setLoanStatus({ id, data: { loanStatus: "rejected" } })}
                    title="Reject loan"
                  >
                    <Ban className="h-3.5 w-3.5 mr-1" /> Reject
                  </Button>
                )}
                {loanStatus !== "active" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-green-700 border-green-200 hover:bg-green-50"
                    disabled={settingLoanStatus}
                    onClick={() => setLoanStatus({ id, data: { loanStatus: "active" } })}
                    title="Activate loan"
                  >
                    <Play className="h-3.5 w-3.5 mr-1" /> Activate
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Profile + Documents */}
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

      {/* Virtual cards */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4" /> Virtual cards
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {customerCards.length === 0 ? (
            <p className="text-sm text-muted-foreground px-6 pb-6">No cards submitted yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Card holder</TableHead>
                  <TableHead>Card number</TableHead>
                  <TableHead>Bank</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customerCards.map((card) => (
                  <TableRow key={card.id}>
                    <TableCell>{card.cardHolderName}</TableCell>
                    <TableCell className="font-mono text-sm">{"•••• " + card.cardNumber.slice(-4)}</TableCell>
                    <TableCell className="text-muted-foreground">{card.bank ?? "—"}</TableCell>
                    <TableCell>
                      <Badge
                        className={
                          card.status === "approved"
                            ? "bg-green-100 text-green-700 border-green-200"
                            : card.status === "rejected"
                              ? "bg-red-100 text-red-700 border-red-200"
                              : "bg-yellow-100 text-yellow-700 border-yellow-200"
                        }
                      >
                        {card.status}
                      </Badge>
                      {card.rejectionReason && (
                        <p className="text-xs text-muted-foreground mt-1">{card.rejectionReason}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{formatDate(card.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      {card.status === "pending" && (
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-green-700 border-green-200 hover:bg-green-50"
                            onClick={() => { setSelectedCard(card.id); setCardDecision("approved"); setCardReason(""); setCardAdminNote(""); }}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-700 border-red-200 hover:bg-red-50"
                            onClick={() => { setSelectedCard(card.id); setCardDecision("rejected"); setCardReason(""); setCardAdminNote(""); }}
                          >
                            <XCircle className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { setSelectedCard(card.id); setCardDecision("request_new"); setCardReason(""); setCardAdminNote(""); }}
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Loan applications */}
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

      {/* Disbursed loans */}
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

      {/* Card decision modal */}
      <Dialog open={!!selectedCard} onOpenChange={(open) => { if (!open) { setSelectedCard(null); setCardReason(""); setCardAdminNote(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {cardDecision === "approved" ? "Approve card" : cardDecision === "rejected" ? "Reject card" : "Request new card"}
            </DialogTitle>
          </DialogHeader>
          {cardDecision !== "approved" && (
            <div className="space-y-2">
              <Label>Reason <span className="text-muted-foreground text-xs">(optional — sent to customer)</span></Label>
              <Textarea value={cardReason} onChange={(e) => setCardReason(e.target.value)} rows={3}
                placeholder={cardDecision === "rejected" ? "e.g. Card name does not match customer ID" : "e.g. Please provide a debit card"} />
            </div>
          )}
          <div className="space-y-2">
            <Label>Internal note <span className="text-muted-foreground text-xs">(optional — admin only)</span></Label>
            <Textarea value={cardAdminNote} onChange={(e) => setCardAdminNote(e.target.value)} rows={2}
              placeholder="e.g. Verified against KYC documents on file" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSelectedCard(null); setCardReason(""); setCardAdminNote(""); }}>Cancel</Button>
            <Button
              disabled={decidingCard}
              variant={cardDecision === "approved" ? "default" : "destructive"}
              onClick={() => {
                if (!selectedCard) return;
                decideCard({ id: selectedCard, data: { status: cardDecision, rejectionReason: cardReason || undefined, adminNote: cardAdminNote || undefined } });
                setCardAdminNote("");
              }}
            >
              {decidingCard ? "Saving…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
