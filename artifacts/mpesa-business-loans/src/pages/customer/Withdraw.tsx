import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMyProfile,
  useListMyWithdrawals,
  useInitiateWithdrawal,
  useRequestWithdrawalOtp,
  useVerifyWithdrawalOtp,
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
  ShieldCheck,
} from "lucide-react";

type Step = "loading" | "phone" | "otp" | "verify" | "success" | "locked" | "error";

const MAX_VERIFY_ATTEMPTS = 3;

export default function Withdraw() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("loading");
  const [withdrawalId, setWithdrawalId] = useState<string | null>(null);
  const [phoneInput, setPhoneInput] = useState("");
  const [otpInput, setOtpInput] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpSent, setOtpSent] = useState(false);
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
      setPhoneInput(latest.mpesaPhone);
      setAttemptsLeft(3 - latest.verificationAttempts);
      setStep(latest.otpVerified ? "verify" : "otp");
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
      setPhoneInput((prev) => prev || profile?.phone || "");
      setStep("phone");
    }
  }, [profileLoading, withdrawalsLoading, withdrawals, profile]);

  const { mutate: initiate, isPending: initiating } = useInitiateWithdrawal({
    mutation: {
      onSuccess: (data) => {
        setWithdrawalId(data.id);
        queryClient.invalidateQueries({ queryKey: getListMyWithdrawalsQueryKey() });
        requestOtp({ id: data.id });
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error ?? "Could not start withdrawal. Try again.";
        toast({ title: "Error", description: msg, variant: "destructive" });
      },
    },
  });

  const { mutate: requestOtp, isPending: sendingOtp } = useRequestWithdrawalOtp({
    mutation: {
      onSuccess: () => {
        setOtpSent(true);
        setOtpError(null);
        setStep("otp");
        toast({
          title: "Code sent",
          description: "Check your in-app notifications for the verification code.",
        });
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error ?? "Could not send verification code.";
        toast({ title: "Error", description: msg, variant: "destructive" });
      },
    },
  });

  const { mutate: verifyOtp, isPending: verifyingOtp } = useVerifyWithdrawalOtp({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMyWithdrawalsQueryKey() });
        setOtpError(null);
        setStep("verify");
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error ?? "Invalid or expired code.";
        setOtpError(msg);
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

  const handlePhoneSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneInput.trim()) return;
    initiate({ data: { mpesaPhone: phoneInput.trim() } });
  };

  const handleOtpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!withdrawalId || !otpInput.trim()) return;
    setOtpError(null);
    verifyOtp({ id: withdrawalId, data: { code: otpInput.trim() } });
  };

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (!withdrawalId || !cardInput.trim()) return;
    setVerifyError(null);
    verify({ id: withdrawalId, data: { cardNumber: cardInput.trim() } });
  };

  const approvedAmount = Number(profile?.approvedLoanAmount ?? "0");
  const activeWithdrawal = withdrawals?.find((w) => w.id === withdrawalId);
  const displayPhone = activeWithdrawal?.mpesaPhone ?? phoneInput ?? profile?.phone ?? "—";

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

  // ── Phone step ────────────────────────────────────────────────────────────
  if (step === "phone") {
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
            Add or confirm the Safaricom (M-Pesa) number you want your funds sent to.
          </p>
        </div>

        <Card>
          <CardContent className="pt-6 pb-4">
            <div className="flex items-center justify-between py-2 border-b border-border mb-4">
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

            <form onSubmit={handlePhoneSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="mpesaPhone">Safaricom (M-Pesa) number</Label>
                <Input
                  id="mpesaPhone"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  placeholder="07XXXXXXXX or +2547XXXXXXXX"
                  autoComplete="tel"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  We'll send you an OTP code to confirm this number belongs to you before
                  disbursing funds.
                </p>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={initiating || sendingOtp || profileLoading || approvedAmount <= 0 || !phoneInput.trim()}
              >
                {initiating || sendingOtp ? "Sending code…" : "Send verification code"}
                {!initiating && !sendingOtp && <ArrowRight className="h-4 w-4 ml-2" />}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="bg-muted/40">
          <CardContent className="pt-4 pb-4">
            <p className="text-sm font-medium text-foreground mb-2">How withdrawal works</p>
            <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-4">
              <li>Enter the Safaricom number funds should be sent to, then confirm it with an OTP code sent to your in-app notifications.</li>
              <li>You must have an approved virtual card before you can withdraw. Add one from the Virtual Card page if you haven't already.</li>
              <li>After OTP verification, enter your virtual card number exactly as you registered it to confirm the withdrawal.</li>
              <li>After 3 failed card verification attempts, your withdrawal will be locked and you'll need to contact support to unlock it.</li>
              <li>Once verified, the full approved amount is disbursed immediately and a 12-month repayment schedule (10% flat interest) is created automatically.</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── OTP step ──────────────────────────────────────────────────────────────
  if (step === "otp") {
    return (
      <div className="max-w-md space-y-6">
        <div>
          <button
            onClick={() => setStep("phone")}
            className="flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Change number
          </button>
          <h1 className="text-2xl font-semibold text-foreground">Verify your number</h1>
          <p className="text-muted-foreground mt-1">
            Enter the code sent to your in-app notifications to confirm{" "}
            <span className="font-mono font-medium">{displayPhone}</span>.
          </p>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" /> OTP verification
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleOtpSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="otpCode">6-digit verification code</Label>
                <Input
                  id="otpCode"
                  value={otpInput}
                  onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="123456"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Check your notifications bell for the code — it expires in 10 minutes.
                </p>
              </div>

              {otpError && (
                <div className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                  <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{otpError}</span>
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={verifyingOtp || otpInput.trim().length < 6}
              >
                {verifyingOtp ? "Verifying…" : "Verify code"}
                {!verifyingOtp && <ArrowRight className="h-4 w-4 ml-2" />}
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="w-full"
                disabled={sendingOtp || !withdrawalId}
                onClick={() => withdrawalId && requestOtp({ id: withdrawalId })}
              >
                {sendingOtp ? "Resending…" : "Resend code"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Verify card step ──────────────────────────────────────────────────────
  return (
    <div className="max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Verify your card</h1>
        <p className="text-muted-foreground mt-1">
          Enter your admin-approved virtual card number to confirm the withdrawal.
        </p>
      </div>

      {/* Summary reminder */}
      <Card className="bg-muted/40">
        <CardContent className="pt-4 pb-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground flex items-center gap-1">
              <Smartphone className="h-3.5 w-3.5" /> M-Pesa number
            </span>
            <span className="font-mono font-medium">{displayPhone}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground flex items-center gap-1">
              <Wallet className="h-3.5 w-3.5" /> Amount
            </span>
            <span className="font-semibold">
              {formatCurrency(activeWithdrawal?.amount ?? approvedAmount.toString())}
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
                Enter the card number exactly as it appears on your admin-approved virtual card.
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
