import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMyProfile,
  useListMyWithdrawals,
  useInitiateWithdrawal,
  useVerifyWithdrawalCard,
  getListMyWithdrawalsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDateTime } from "@/lib/format";
import {
  CheckCircle2,
  XCircle,
  Lock,
  ArrowLeft,
  Smartphone,
  CreditCard,
  Wallet,
  ArrowRight,
} from "lucide-react";

type Step = "loading" | "confirm" | "verify" | "success" | "locked" | "error";

export default function Withdraw() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("loading");
  const [withdrawalId, setWithdrawalId] = useState<string | null>(null);
  const [cardInput, setCardInput] = useState("");
  const [attemptsLeft, setAttemptsLeft] = useState(3);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [receiptData, setReceiptData] = useState<{
    amount: string;
    phone: string;
    at: string;
  } | null>(null);

  const { data: profile, isLoading: profileLoading } = useGetMyProfile();
  const { data: withdrawals, isLoading: withdrawalsLoading } = useListMyWithdrawals();

  // Determine initial step from existing withdrawal state
  useEffect(() => {
    if (profileLoading || withdrawalsLoading) return;

    const latest = withdrawals?.[0];
    if (latest?.status === "pending_verification") {
      setWithdrawalId(latest.id);
      setAttemptsLeft(3 - latest.verificationAttempts);
      setStep("verify");
    } else if (latest?.status === "disbursed") {
      setReceiptData({
        amount: latest.amount,
        phone: latest.mpesaPhone,
        at: latest.createdAt,
      });
      setStep("success");
    } else if (latest?.status === "locked") {
      setStep("locked");
    } else {
      setStep("confirm");
    }
  }, [profileLoading, withdrawalsLoading, withdrawals]);

  const { mutate: initiate, isPending: initiating } = useInitiateWithdrawal({
    mutation: {
      onSuccess: (data) => {
        setWithdrawalId(data.id);
        queryClient.invalidateQueries({ queryKey: getListMyWithdrawalsQueryKey() });
        setStep("verify");
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error ?? "Could not start withdrawal. Try again.";
        toast({ title: "Error", description: msg, variant: "destructive" });
      },
    },
  });

  const { mutate: verify, isPending: verifying } = useVerifyWithdrawalCard({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListMyWithdrawalsQueryKey() });
        if (data.success) {
          setReceiptData({
            amount: data.withdrawal?.amount ?? "0",
            phone: data.withdrawal?.mpesaPhone ?? "",
            at: data.withdrawal?.createdAt ?? new Date().toISOString(),
          });
          setStep("success");
        } else {
          setVerifyError(data.message);
          setAttemptsLeft(data.attemptsLeft ?? 0);
          if (data.withdrawal?.status === "locked") {
            setStep("locked");
          }
        }
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error ?? "Verification failed. Try again.";
        setVerifyError(msg);
      },
    },
  });

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (!withdrawalId || !cardInput.trim()) return;
    setVerifyError(null);
    verify({ id: withdrawalId, data: { cardNumber: cardInput.trim() } });
  };

  const approvedAmount = Number(profile?.approvedLoanAmount ?? "0");
  const phone = profile?.phone ?? "—";

  // ── Loading ───────────────────────────────────────────────────────────────
  if (step === "loading") {
    return (
      <div className="max-w-md space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  // ── Success receipt ───────────────────────────────────────────────────────
  if (step === "success" && receiptData) {
    return (
      <div className="max-w-md space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Loan disbursed</h1>
          <p className="text-muted-foreground mt-1">Your loan has been sent successfully.</p>
        </div>

        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center justify-center">
              <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-foreground">
                {formatCurrency(receiptData.amount)}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Sent to {receiptData.phone}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {formatDateTime(receiptData.at)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Amount disbursed</span>
              <span className="font-semibold">{formatCurrency(receiptData.amount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">M-Pesa number</span>
              <span className="font-mono">{receiptData.phone}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Interest rate</span>
              <span>10% flat</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Repayment term</span>
              <span>12 monthly installments</span>
            </div>
          </CardContent>
        </Card>

        <Button variant="outline" className="w-full" onClick={() => navigate("/loans")}>
          View repayment schedule <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
        <Button variant="ghost" className="w-full" onClick={() => navigate("/dashboard")}>
          Back to dashboard
        </Button>
      </div>
    );
  }

  // ── Locked ────────────────────────────────────────────────────────────────
  if (step === "locked") {
    return (
      <div className="max-w-md space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Withdrawal locked</h1>
          <p className="text-muted-foreground mt-1">Too many failed verification attempts.</p>
        </div>
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-center justify-center">
              <div className="h-14 w-14 rounded-full bg-red-100 flex items-center justify-center">
                <Lock className="h-7 w-7 text-red-600" />
              </div>
            </div>
            <p className="text-center text-sm text-red-700">
              Your withdrawal has been locked because the card number was entered incorrectly
              too many times. Our team has been notified. Please contact support to
              unlock your account.
            </p>
          </CardContent>
        </Card>
        <Button variant="outline" className="w-full" onClick={() => navigate("/dashboard")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to dashboard
        </Button>
      </div>
    );
  }

  // ── Confirm step ──────────────────────────────────────────────────────────
  if (step === "confirm") {
    return (
      <div className="max-w-md space-y-6">
        <div>
          <button
            onClick={() => navigate("/dashboard")}
            className="flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </button>
          <h1 className="text-2xl font-semibold text-foreground">Withdraw loan</h1>
          <p className="text-muted-foreground mt-1">
            Review the details below before continuing.
          </p>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="h-4 w-4" /> Withdrawal summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between py-2 border-b border-border">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Smartphone className="h-4 w-4" />
                Registered M-Pesa number
              </div>
              {profileLoading ? (
                <Skeleton className="h-5 w-28" />
              ) : (
                <span className="font-mono font-medium text-sm">{phone}</span>
              )}
            </div>
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Wallet className="h-4 w-4" />
                Approved loan amount
              </div>
              {profileLoading ? (
                <Skeleton className="h-6 w-24" />
              ) : (
                <span className="text-xl font-bold text-foreground">
                  {formatCurrency(approvedAmount.toString())}
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          Funds will be sent to your registered M-Pesa number. You cannot change the
          number at this stage. You will be asked to verify your virtual card next.
        </p>

        <Button
          className="w-full"
          disabled={initiating || profileLoading || approvedAmount <= 0}
          onClick={() => initiate()}
        >
          {initiating ? "Starting…" : "Continue"}
          {!initiating && <ArrowRight className="h-4 w-4 ml-2" />}
        </Button>
      </div>
    );
  }

  // ── Verify card step ──────────────────────────────────────────────────────
  return (
    <div className="max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Verify your card</h1>
        <p className="text-muted-foreground mt-1">
          Enter your approved virtual card number to confirm the withdrawal.
        </p>
      </div>

      {/* Summary reminder */}
      <Card className="bg-muted/40">
        <CardContent className="pt-4 pb-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground flex items-center gap-1">
              <Smartphone className="h-3.5 w-3.5" /> M-Pesa number
            </span>
            <span className="font-mono font-medium">
              {withdrawals?.find((w) => w.id === withdrawalId)?.mpesaPhone ?? phone}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground flex items-center gap-1">
              <Wallet className="h-3.5 w-3.5" /> Amount
            </span>
            <span className="font-semibold">
              {formatCurrency(
                withdrawals?.find((w) => w.id === withdrawalId)?.amount ?? approvedAmount.toString(),
              )}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4" /> Card verification
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleVerify} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cardNumber">Virtual card number</Label>
              <Input
                id="cardNumber"
                value={cardInput}
                onChange={(e) => setCardInput(e.target.value)}
                placeholder="Enter your full card number"
                autoComplete="off"
                required
              />
              <p className="text-xs text-muted-foreground">
                Enter the card number exactly as you registered it.
              </p>
            </div>

            {verifyError && (
              <div className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{verifyError}</span>
              </div>
            )}

            {attemptsLeft > 0 && attemptsLeft < 3 && !verifyError && (
              <p className="text-xs text-yellow-600">
                {attemptsLeft} attempt{attemptsLeft === 1 ? "" : "s"} remaining before the
                withdrawal is locked.
              </p>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={verifying || !cardInput.trim()}
            >
              {verifying ? "Verifying…" : "Verify & disburse"}
              {!verifying && <ArrowRight className="h-4 w-4 ml-2" />}
            </Button>
          </form>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        After {MAX_VERIFY_ATTEMPTS} failed attempts your withdrawal will be locked and you
        will need to contact support.
      </p>
    </div>
  );
}

const MAX_VERIFY_ATTEMPTS = 3;
