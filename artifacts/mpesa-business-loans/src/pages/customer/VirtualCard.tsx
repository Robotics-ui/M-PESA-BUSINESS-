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
import { CheckCircle2, Clock, XCircle, CreditCard, ArrowRight } from "lucide-react";

function CardStatusBadge({ status }: { status: string }) {
  if (status === "approved")
    return <Badge className="bg-green-100 text-green-700 border-green-200">Approved</Badge>;
  if (status === "rejected")
    return <Badge className="bg-red-100 text-red-700 border-red-200">Rejected</Badge>;
  return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">Pending approval</Badge>;
}

function ProgressStep({
  step,
  label,
  sublabel,
  active,
  done,
}: {
  step: number;
  label: string;
  sublabel: string;
  active?: boolean;
  done?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center text-center gap-1 ${active ? "opacity-100" : "opacity-40"}`}>
      <div
        className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-semibold border-2 ${
          done
            ? "bg-green-500 border-green-500 text-white"
            : active
              ? "border-primary bg-primary text-primary-foreground"
              : "border-muted bg-muted text-muted-foreground"
        }`}
      >
        {done ? <CheckCircle2 className="h-5 w-5" /> : step}
      </div>
      <p className="text-sm font-medium text-foreground">{label}</p>
      <p className="text-xs text-muted-foreground">{sublabel}</p>
    </div>
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
      },
      onError: () => toast({ title: "Submission failed", variant: "destructive" }),
    },
  });

  const [form, setForm] = useState({ cardNumber: "", cardHolderName: "", bank: "" });

  if (isLoading) {
    return (
      <div className="max-w-xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  // The active card is the most recent one
  const activeCard = cards?.[0];
  const canSubmitNew =
    !activeCard || activeCard.status === "rejected";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.cardNumber.trim() || !form.cardHolderName.trim()) return;
    submitCard({ data: { cardNumber: form.cardNumber.trim(), cardHolderName: form.cardHolderName.trim(), bank: form.bank.trim() || undefined } });
  };

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Virtual Card</h1>
        <p className="text-muted-foreground mt-1">
          Add and verify the card you'll use to receive loan withdrawals.
        </p>
      </div>

      <Card className="bg-muted/40">
        <CardContent className="pt-4 pb-4">
          <p className="text-sm font-medium text-foreground mb-2">How the virtual card works</p>
          <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-4">
            <li>Enter the card number and card holder name exactly as they appear on your card — you'll need to re-enter the number to verify a withdrawal later.</li>
            <li>Adding your bank or provider name is optional but helps our team review your card faster.</li>
            <li>An admin manually reviews every new card. This usually takes a short while — you'll get a notification the moment a decision is made.</li>
            <li>Once approved, your card stays linked to your account and is required to verify every future withdrawal.</li>
            <li>If your card is rejected, you can submit a new one straight away using the form below.</li>
            <li>Keep your card details private — never share your full card number with anyone claiming to be from support.</li>
          </ul>
        </CardContent>
      </Card>

      {/* Progress steps */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between gap-2">
            <ProgressStep
              step={1}
              label="Submit card"
              sublabel="Enter your card details"
              active={!activeCard || activeCard.status === "rejected"}
              done={!!activeCard}
            />
            <div className="flex-1 mt-5 border-t-2 border-dashed border-muted-foreground/30" />
            <ProgressStep
              step={2}
              label="Pending review"
              sublabel="Admin verifies your card"
              active={activeCard?.status === "pending"}
              done={activeCard?.status === "approved"}
            />
            <div className="flex-1 mt-5 border-t-2 border-dashed border-muted-foreground/30" />
            <ProgressStep
              step={3}
              label="Approved"
              sublabel="Card verified"
              active={activeCard?.status === "approved"}
              done={activeCard?.status === "approved"}
            />
          </div>
        </CardContent>
      </Card>

      {/* Current card status */}
      {activeCard && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="h-4 w-4" /> Current card
            </CardTitle>
            <CardStatusBadge status={activeCard.status} />
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-y-3 text-sm">
            <span className="text-muted-foreground">Card number</span>
            <span className="font-mono text-foreground">{"•••• " + activeCard.cardNumber.slice(-4)}</span>
            <span className="text-muted-foreground">Card holder</span>
            <span className="text-foreground">{activeCard.cardHolderName}</span>
            {activeCard.bank && (
              <>
                <span className="text-muted-foreground">Bank / Provider</span>
                <span className="text-foreground">{activeCard.bank}</span>
              </>
            )}
            {activeCard.status === "pending" && (
              <div className="col-span-2 flex items-center gap-2 mt-2 p-3 rounded-md bg-yellow-50 text-yellow-700 text-xs">
                <Clock className="h-4 w-4 shrink-0" />
                Waiting for admin review — you'll receive a notification once a decision is made.
              </div>
            )}
            {activeCard.status === "approved" && (
              <div className="col-span-2 flex items-center gap-2 mt-2 p-3 rounded-md bg-green-50 text-green-700 text-xs">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Card verified successfully. You can now withdraw your approved loan amount.
              </div>
            )}
            {activeCard.status === "rejected" && (
              <div className="col-span-2 flex items-center gap-2 mt-2 p-3 rounded-md bg-red-50 text-red-700 text-xs">
                <XCircle className="h-4 w-4 shrink-0" />
                {activeCard.rejectionReason
                  ? `Rejected: ${activeCard.rejectionReason}`
                  : "This card was rejected. Please submit a new one below."}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Submit / re-submit form */}
      {canSubmitNew && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {activeCard ? "Submit a new card" : "Add virtual card"}
            </CardTitle>
          </CardHeader>
          <CardContent>
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
                  Bank / Card provider <span className="text-muted-foreground text-xs">(optional)</span>
                </Label>
                <Input
                  id="bank"
                  value={form.bank}
                  onChange={(e) => setForm((f) => ({ ...f, bank: e.target.value }))}
                  placeholder="e.g. Equity, KCB, M-PESA"
                />
              </div>
              <Button type="submit" disabled={isPending} className="w-full">
                {isPending ? "Submitting…" : "Submit card for approval"}
                {!isPending && <ArrowRight className="h-4 w-4 ml-2" />}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
