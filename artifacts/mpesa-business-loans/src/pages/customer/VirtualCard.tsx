import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListMyVirtualCards,
  getListMyVirtualCardsQueryKey,
  useCreateVirtualCard,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Clock, XCircle, CreditCard, Plus, ChevronDown, ChevronUp } from "lucide-react";

function CardStatusBadge({ status }: { status: string }) {
  if (status === "approved")
    return <Badge className="bg-green-100 text-green-700 border-green-200">Approved</Badge>;
  if (status === "rejected")
    return <Badge className="bg-red-100 text-red-700 border-red-200">Rejected</Badge>;
  return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">Pending review</Badge>;
}

function CardItem({ card }: { card: { id: string; cardNumber: string; cardHolderName: string; bank?: string | null; status: string; rejectionReason?: string | null; createdAt: string } }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <CreditCard className="h-4 w-4" />
          <span className="font-mono">•••• {card.cardNumber.slice(-4)}</span>
        </CardTitle>
        <CardStatusBadge status={card.status} />
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-y-2 text-sm">
        <span className="text-muted-foreground">Card holder</span>
        <span className="text-foreground">{card.cardHolderName}</span>
        {card.bank && (
          <>
            <span className="text-muted-foreground">Bank / Provider</span>
            <span className="text-foreground">{card.bank}</span>
          </>
        )}
        {card.status === "pending" && (
          <div className="col-span-2 flex items-center gap-2 mt-2 p-3 rounded-md bg-yellow-50 text-yellow-700 text-xs">
            <Clock className="h-4 w-4 shrink-0" />
            Waiting for admin review — you'll get a notification once a decision is made.
          </div>
        )}
        {card.status === "approved" && (
          <div className="col-span-2 flex items-center gap-2 mt-2 p-3 rounded-md bg-green-50 text-green-700 text-xs">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Card verified. You can use this card to confirm your loan withdrawals.
          </div>
        )}
        {card.status === "rejected" && (
          <div className="col-span-2 flex items-center gap-2 mt-2 p-3 rounded-md bg-red-50 text-red-700 text-xs">
            <XCircle className="h-4 w-4 shrink-0" />
            {card.rejectionReason ? `Rejected: ${card.rejectionReason}` : "This card was rejected."}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function VirtualCard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: cards, isLoading } = useListMyVirtualCards();
  const { mutate: submitCard, isPending } = useCreateVirtualCard({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMyVirtualCardsQueryKey() });
        toast({ title: "Card submitted", description: "Your card is pending admin approval." });
        setForm({ cardNumber: "", cardHolderName: "", bank: "" });
        setShowForm(false);
      },
      onError: () => toast({ title: "Submission failed", variant: "destructive" }),
    },
  });

  const [form, setForm] = useState({ cardNumber: "", cardHolderName: "", bank: "" });
  const [showForm, setShowForm] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.cardNumber.trim() || !form.cardHolderName.trim()) return;
    submitCard({
      data: {
        cardNumber: form.cardNumber.trim(),
        cardHolderName: form.cardHolderName.trim(),
        bank: form.bank.trim() || undefined,
      },
    });
  };

  const approvedCount = cards?.filter((c) => c.status === "approved").length ?? 0;
  const pendingCount = cards?.filter((c) => c.status === "pending").length ?? 0;

  if (isLoading) {
    return (
      <div className="max-w-xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="max-w-xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Virtual Cards</h1>
          <p className="text-muted-foreground mt-1">
            Cards linked to your account for receiving loan withdrawals.
          </p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)} variant="outline" size="sm">
          {showForm ? (
            <><ChevronUp className="h-4 w-4 mr-1" /> Hide form</>
          ) : (
            <><Plus className="h-4 w-4 mr-1" /> Add card</>
          )}
        </Button>
      </div>

      {/* Status summary */}
      {cards && cards.length > 0 && (
        <div className="flex gap-3 text-sm">
          <span className="text-muted-foreground">
            {approvedCount > 0 && <span className="text-green-700 font-medium">{approvedCount} approved</span>}
            {approvedCount > 0 && pendingCount > 0 && ", "}
            {pendingCount > 0 && <span className="text-yellow-700 font-medium">{pendingCount} pending review</span>}
          </span>
        </div>
      )}

      {/* Add card form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="h-4 w-4" /> Add a virtual card
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Card className="bg-muted/40 border-0 mb-4">
              <CardContent className="pt-3 pb-3">
                <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                  <li>Enter the card number and holder name exactly as they appear on your card.</li>
                  <li>An admin manually reviews every submission — you'll get an in-app notification when a decision is made.</li>
                  <li>Once approved, you'll enter this card's number to verify each withdrawal.</li>
                  <li>You can submit multiple cards. Only approved cards can be used for withdrawals.</li>
                </ul>
              </CardContent>
            </Card>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cardNumber">Card number</Label>
                <Input
                  id="cardNumber"
                  value={form.cardNumber}
                  onChange={(e) => setForm((f) => ({ ...f, cardNumber: e.target.value }))}
                  placeholder="e.g. 4111 1111 1111 1111"
                  maxLength={19}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cardHolderName">Card holder name</Label>
                <Input
                  id="cardHolderName"
                  value={form.cardHolderName}
                  onChange={(e) => setForm((f) => ({ ...f, cardHolderName: e.target.value }))}
                  placeholder="As it appears on the card"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bank">
                  Bank / Card provider{" "}
                  <span className="text-muted-foreground text-xs">(optional)</span>
                </Label>
                <Input
                  id="bank"
                  value={form.bank}
                  onChange={(e) => setForm((f) => ({ ...f, bank: e.target.value }))}
                  placeholder="e.g. Equity, KCB, M-PESA"
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={isPending} className="flex-1">
                  {isPending ? "Submitting…" : "Submit for approval"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Cards list */}
      {!cards || cards.length === 0 ? (
        <Card>
          <CardContent className="pt-8 pb-8 flex flex-col items-center gap-3 text-center">
            <CreditCard className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium text-foreground">No cards yet</p>
            <p className="text-sm text-muted-foreground">
              Add a virtual card to enable loan withdrawals.
            </p>
            <Button onClick={() => setShowForm(true)} size="sm">
              <Plus className="h-4 w-4 mr-1" /> Add your first card
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {cards.map((card) => (
            <CardItem key={card.id} card={card} />
          ))}
        </div>
      )}
    </div>
  );
}
