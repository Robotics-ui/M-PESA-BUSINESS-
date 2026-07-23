import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMyProfile,
  useListMyWithdrawals,
  useInitiateWithdrawal,
  useRequestWithdrawalOtp,
  useVerifyWithdrawalOtp,
  useVerifyWithdrawalCard,
  useConfirmWithdrawalReceipt,
  useListMyNotifications,
  useListMyVirtualCards,
  useListMyDocuments,
  getListMyWithdrawalsQueryKey,
  useGetMyGuarantor,
  getGetMyGuarantorQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
  Bell,
  AlertTriangle,
  Clock,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  CalendarX,
  CalendarClock,
  Undo2,
  Building2,
} from "lucide-react";

// ── Step progress bar ─────────────────────────────────────────────────────────
// Full step list — guarantor step is only entered when conditions require it
// (partial withdrawal + different M-Pesa number), but it's included here so
// the progress bar shows the correct position when it is active.
const STEPS_WITH_GUARANTOR = [
  { key: "phone",     label: "Enter number",     icon: Smartphone  },
  { key: "guarantor", label: "Confirm guarantor", icon: Building2   },
  { key: "otp",       label: "Verify number",     icon: ShieldCheck },
  { key: "verify",    label: "Confirm card",      icon: CreditCard  },
  { key: "success",   label: "Done",              icon: CheckCircle2 },
] as const;

const STEPS_WITHOUT_GUARANTOR = [
  { key: "phone",   label: "Enter number", icon: Smartphone  },
  { key: "otp",     label: "Verify number", icon: ShieldCheck },
  { key: "verify",  label: "Confirm card",  icon: CreditCard  },
  { key: "success", label: "Done",          icon: CheckCircle2 },
] as const;

type StepDef = { key: string; label: string; icon: React.ElementType };

function StepProgress({ current, steps }: { current: string; steps: readonly StepDef[] }) {
  const stepIndex = steps.findIndex((s) => s.key === current);
  if (stepIndex < 0) return null;
  return (
    <div className="flex items-center gap-0 mb-6">
      {steps.map((step, idx) => {
        const done = idx < stepIndex;
        const active = idx === stepIndex;
        const Icon = step.icon;
        return (
          <div key={step.key} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1 min-w-0">
              <div
                className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                  done
                    ? "bg-primary text-primary-foreground"
                    : active
                      ? "bg-primary/10 border-2 border-primary text-primary"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </div>
              <span
                className={`text-[10px] leading-tight text-center whitespace-nowrap ${active ? "text-primary font-semibold" : done ? "text-foreground" : "text-muted-foreground"}`}
              >
                {step.label}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div className={`h-0.5 flex-1 mx-1 mb-4 rounded ${done ? "bg-primary" : "bg-border"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

type Step = "loading" | "phone" | "guarantor" | "otp" | "verify" | "success" | "locked" | "expired" | "error";

// Receipt sub-states (shown inside the "success" view)
type ReceiptPhase =
  | "confirm"       // just disbursed — ask Done / Not Received
  | "confirmed"     // customer confirmed receipt
  | "not_received"  // customer reported issue, waiting for admin
  | "resolved";     // admin has resolved the issue

const MAX_VERIFY_ATTEMPTS = 3;

export default function Withdraw() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("loading");
  const [withdrawalId, setWithdrawalId] = useState<string | null>(null);
  const [phoneInput, setPhoneInput] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [guarantorAcknowledged, setGuarantorAcknowledged] = useState(false);
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
  const { data: notifications } = useListMyNotifications();
  const { data: cards } = useListMyVirtualCards();
  const { data: documents } = useListMyDocuments();
  const { data: guarantor } = useGetMyGuarantor({
    query: { retry: false, queryKey: getGetMyGuarantorQueryKey() },
  });

  const activeWithdrawal = withdrawals?.find((w) => w.id === withdrawalId);
  const displayPhone = activeWithdrawal?.mpesaPhone ?? phoneInput ?? profile?.phone ?? "—";

  // Poll for admin resolution when waiting.
  // A reversed dispute moves the withdrawal's status to "failed" (funds never
  // landed), so the resolved/not_received checks must not require
  // status === "disbursed" — they key off receiptStatus/resolvedAt instead.
  const receiptPhase: ReceiptPhase = (() => {
    if (!activeWithdrawal) return "confirm";
    if (activeWithdrawal.receiptStatus === "not_received") {
      return activeWithdrawal.resolvedAt ? "resolved" : "not_received";
    }
    if (activeWithdrawal.status !== "disbursed") return "confirm";
    if (activeWithdrawal.receiptStatus === "confirmed") return "confirmed";
    return "confirm";
  })();

  // Auto-poll when waiting for admin resolution
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (step === "success" && receiptPhase === "not_received") {
      pollRef.current = setInterval(() => {
        queryClient.invalidateQueries({ queryKey: getListMyWithdrawalsQueryKey() });
      }, 8000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [step, receiptPhase, queryClient]);

  // Latest in-app OTP notification scoped to the current withdrawal's phone number
  const latestOtpNotification = notifications
    ?.filter(
      (n) =>
        n.title === "Your withdrawal verification code" &&
        (!displayPhone || n.message.includes(displayPhone)),
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

  // Approved virtual card to show context on the card step
  const approvedCard = cards?.find((c) => c.status === "approved");

  // Determine initial step from existing withdrawal state
  useEffect(() => {
    if (profileLoading || withdrawalsLoading) return;

    const latest = withdrawals?.[0];
    if (latest?.status === "pending_verification") {
      setWithdrawalId(latest.id);
      setPhoneInput(latest.mpesaPhone);
      setAttemptsLeft(3 - latest.verificationAttempts);
      // Check client-side if it has expired (server will also enforce)
      if (latest.expiresAt && new Date(latest.expiresAt) < new Date()) {
        setStep("expired");
      } else {
        setStep(latest.otpVerified ? "verify" : "otp");
      }
    } else if (latest?.status === "expired") {
      setWithdrawalId(latest.id);
      setStep("expired");
    } else if (latest?.status === "disbursed") {
      // If the previous withdrawal is fully confirmed AND a new loan has since
      // been approved (approvedLoanAmount > 0), treat this as a fresh start so
      // the user can withdraw their new loan — don't lock them into the old
      // success screen.
      const prevFullyDone =
        latest.receiptStatus === "confirmed" &&
        Number(profile?.approvedLoanAmount ?? 0) > 0;

      if (prevFullyDone) {
        setPhoneInput((prev) => prev || profile?.phone || "");
        setStep("phone");
      } else {
        setWithdrawalId(latest.id);
        setReceiptData({
          amount: latest.amount,
          phone: latest.mpesaPhone,
          at: latest.createdAt,
        });
        setStep("success");
      }
    } else if (latest?.status === "failed" && latest.receiptStatus === "not_received") {
      // A "not received" dispute that was resolved as a reversal — show the
      // resolution screen instead of falling through to a fresh withdrawal.
      setWithdrawalId(latest.id);
      setReceiptData({
        amount: latest.amount,
        phone: latest.mpesaPhone,
        at: latest.createdAt,
      });
      setStep("success");
    } else if (latest?.status === "locked") {
      setWithdrawalId(latest.id);
      setStep("locked");
    } else {
      setPhoneInput((prev) => prev || profile?.phone || "");
      setAmountInput((prev) => prev || profile?.approvedLoanAmount?.toString() || "");
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
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListMyWithdrawalsQueryKey() });
        setOtpError(null);
        // Trial withdrawals are auto-disbursed on OTP verify (no card step)
        if (data.withdrawal?.status === "disbursed") {
          setWithdrawalId(data.withdrawal.id);
          setReceiptData({
            amount: data.withdrawal.amount,
            phone: data.withdrawal.mpesaPhone,
            at: data.withdrawal.createdAt,
          });
          setStep("success");
        } else {
          setStep("verify");
        }
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
          setWithdrawalId(data.withdrawal?.id ?? withdrawalId);
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

  const { mutate: confirmReceipt, isPending: confirmingReceipt } = useConfirmWithdrawalReceipt({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMyWithdrawalsQueryKey() });
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error ?? "Could not record your response.";
        toast({ title: "Error", description: msg, variant: "destructive" });
      },
    },
  });

  const BUSINESS_DOC_TYPES = [
    "company_registration",
    "cr12",
    "cr1",
    "cr2",
    "cr8",
  ] as const;

  const handlePhoneSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneInput.trim()) return;

    // ── Trial mode: no approved card exists ──────────────────────────────────
    if (isTrialMode) {
      initiate({ data: { mpesaPhone: phoneInput.trim() } });
      return;
    }

    // ── Normal mode ──────────────────────────────────────────────────────────
    const parsedAmount = parseFloat(amountInput);
    if (!parsedAmount || parsedAmount <= 0 || parsedAmount > approvedAmount) return;

    const isPartial = parsedAmount < approvedAmount;
    const isFull = !isPartial;

    // Full withdrawal: require 2 approved virtual cards
    if (isFull) {
      const approvedCardCount = cards?.filter((c) => c.status === "approved").length ?? 0;
      if (approvedCardCount < 2) {
        toast({
          title: "Two virtual cards required",
          description: `Full withdrawals require 2 approved virtual cards. You currently have ${approvedCardCount}. Add another card and wait for approval.`,
          variant: "destructive",
        });
        return;
      }
    }

    // Partial withdrawal: require (profileComplete + all 5 business docs) OR a guarantor
    if (isPartial) {
      const hasGuarantor = !!guarantor;
      const hasAllBusinessDocs =
        !!profile?.profileComplete &&
        BUSINESS_DOC_TYPES.every((t) => documents?.some((d) => d.type === t));

      if (!hasGuarantor && !hasAllBusinessDocs) {
        if (!profile?.profileComplete) {
          toast({
            title: "Profile incomplete",
            description:
              "Complete your profile before making a partial withdrawal, or add a company guarantor.",
            variant: "destructive",
          });
        } else {
          const uploadedTypes = new Set(documents?.map((d) => d.type) ?? []);
          const missing = BUSINESS_DOC_TYPES.filter((t) => !uploadedTypes.has(t));
          const labels: Record<string, string> = {
            company_registration: "Company Registration",
            cr12: "CR12",
            cr1: "CR1",
            cr2: "CR2",
            cr8: "CR8",
          };
          toast({
            title: "Business documents required",
            description: `Upload missing documents (${missing.map((m) => labels[m]).join(", ")}) or add a company guarantor to make a partial withdrawal.`,
            variant: "destructive",
          });
        }
        return;
      }

      // Use guarantor confirmation step when the guarantor path is taken
      if (hasGuarantor) {
        setGuarantorAcknowledged(false);
        setStep("guarantor");
        return;
      }
    }

    initiate({ data: { mpesaPhone: phoneInput.trim(), amount: parsedAmount } });
  };

  const handleGuarantorConfirm = () => {
    if (!guarantorAcknowledged) return;
    const parsedAmount = parseFloat(amountInput);
    initiate({ data: { mpesaPhone: phoneInput.trim(), amount: parsedAmount } });
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

  const handleConfirmReceipt = (received: boolean) => {
    if (!withdrawalId) return;
    confirmReceipt({ id: withdrawalId, data: { received } });
  };

  const approvedAmount = Number(profile?.approvedLoanAmount ?? "0");

  // ── Trial mode: no approved virtual card exists ───────────────────────────
  // Up to 2 KES-15 trial withdrawals are allowed before any card is approved.
  // approvedCardCount is re-declared below in the checklist section; define it
  // early here so isTrialMode can reference it.
  const approvedCardCountEarly = cards?.filter((c) => c.status === "approved").length ?? 0;
  const isTrialMode = approvedCardCountEarly === 0;
  const trialWithdrawalsUsed =
    withdrawals?.filter((w) => (w as any).isTrial && w.status === "disbursed").length ?? 0;
  const trialWithdrawalsRemaining = Math.max(0, 2 - trialWithdrawalsUsed);

  // Show the guarantor confirmation step when the customer has a guarantor
  // and is making a partial withdrawal (guarantor path is always confirmed via
  // this step; if they use the business-docs path, it's skipped).
  const parsedAmountNum = parseFloat(amountInput) || 0;
  const isPartialWithGuarantor =
    parsedAmountNum > 0 &&
    parsedAmountNum < approvedAmount &&
    !!guarantor;
  const activeSteps = (isPartialWithGuarantor || step === "guarantor")
    ? STEPS_WITH_GUARANTOR
    : STEPS_WITHOUT_GUARANTOR;

  // ── Pre-flight conditions (reused in checklist + submit gate) ─────────────
  const approvedCardCount = cards?.filter((c) => c.status === "approved").length ?? 0;
  const hasPhone1Verified = !!profile?.phoneVerified;
  const hasPhone2Verified = !!profile?.phone2Verified;
  const hasAnyCard = approvedCardCount >= 1;
  const hasTwoCards = approvedCardCount >= 2;
  const isPartialAmount = parsedAmountNum > 0 && parsedAmountNum < approvedAmount;
  const isFullAmount = parsedAmountNum > 0 && parsedAmountNum >= approvedAmount;
  const hasGuarantorBool = !!guarantor;
  const hasAllBizDocs =
    !!profile?.profileComplete &&
    BUSINESS_DOC_TYPES.every((t) => documents?.some((d) => d.type === t));
  const partialDocsMet = hasGuarantorBool || hasAllBizDocs;
  const amountOk =
    parsedAmountNum > 0 &&
    parsedAmountNum <= approvedAmount &&
    !!phoneInput.trim();
  const allWithdrawalConditionsMet = isTrialMode
    ? !!phoneInput.trim() && trialWithdrawalsRemaining > 0
    : hasPhone1Verified &&
      hasPhone2Verified &&
      hasAnyCard &&
      amountOk &&
      (isPartialAmount ? partialDocsMet : isFullAmount ? hasTwoCards : false);

  // Helper: returns days remaining until expiresAt (null if not set)
  const expiresAt = activeWithdrawal?.expiresAt
    ? new Date(activeWithdrawal.expiresAt as unknown as string)
    : null;
  const daysRemaining = expiresAt
    ? Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  // ── Expired ───────────────────────────────────────────────────────────────
  if (step === "expired") {
    const latestWithdrawal = withdrawals?.[0];
    const expiredAt = latestWithdrawal?.expiresAt
      ? new Date(latestWithdrawal.expiresAt as unknown as string)
      : null;
    const retryAfterDays = latestWithdrawal?.retryAfterDays ?? null;
    const retryAllowedAt =
      expiredAt && retryAfterDays != null && retryAfterDays > 0
        ? new Date(expiredAt.getTime() + retryAfterDays * 24 * 60 * 60 * 1000)
        : null;
    const canRetryNow = retryAllowedAt ? new Date() >= retryAllowedAt : retryAfterDays === 0 || retryAfterDays == null;
    const retryDaysLeft = retryAllowedAt
      ? Math.ceil((retryAllowedAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : 0;

    return (
      <div className="max-w-md space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Withdrawal expired</h1>
          <p className="text-muted-foreground mt-1">Your withdrawal request has passed its deadline.</p>
        </div>
        <Card className="border-gray-200 bg-gray-50">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center justify-center">
              <div className="h-14 w-14 rounded-full bg-gray-100 flex items-center justify-center">
                <CalendarX className="h-7 w-7 text-gray-500" />
              </div>
            </div>
            <div className="text-center space-y-1">
              <p className="font-semibold text-gray-800">Request expired</p>
              {expiredAt && (
                <p className="text-sm text-gray-600">
                  This withdrawal expired on{" "}
                  <span className="font-medium">{formatDateTime(expiredAt.toISOString())}</span>.
                </p>
              )}
            </div>

            {retryAllowedAt && !canRetryNow && (
              <div className="rounded-md bg-orange-50 border border-orange-200 px-4 py-3 text-sm text-orange-800 text-center space-y-1">
                <CalendarClock className="h-5 w-5 mx-auto text-orange-600 mb-1" />
                <p className="font-semibold">Retry available in {retryDaysLeft} day{retryDaysLeft !== 1 ? "s" : ""}</p>
                <p className="text-xs text-orange-700">
                  You can apply for a new withdrawal from{" "}
                  <span className="font-medium">{formatDateTime(retryAllowedAt.toISOString())}</span>.
                </p>
              </div>
            )}

            {canRetryNow && (
              <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800 text-center space-y-1">
                <CheckCircle2 className="h-5 w-5 mx-auto text-green-600 mb-1" />
                <p className="font-semibold">You can apply again now</p>
                <p className="text-xs text-green-700">
                  Start a new withdrawal request when you're ready.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {canRetryNow && (
          <Button
            className="w-full"
            onClick={() => {
              setStep("phone");
              setWithdrawalId(null);
              setPhoneInput(profile?.phone || "");
            }}
          >
            Start new withdrawal <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        )}
        <Button variant="outline" className="w-full" onClick={() => navigate("/dashboard")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to dashboard
        </Button>
      </div>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (step === "loading") {
    return (
      <div className="max-w-md space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  // ── Success / receipt flow ────────────────────────────────────────────────
  if (step === "success" && receiptData) {
    // ── Sub-state: confirmed ────────────────────────────────────────────────
    if (receiptPhase === "confirmed") {
      return (
        <div className="max-w-md space-y-6">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Loan disbursed</h1>
            <p className="text-muted-foreground mt-1">Your loan has been received successfully.</p>
          </div>
          <Card className="border-green-200 bg-green-50">
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center justify-center">
                <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle2 className="h-8 w-8 text-green-600" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-foreground">{formatCurrency(receiptData.amount)}</p>
                <p className="text-sm text-muted-foreground mt-1">Sent to {receiptData.phone}</p>
                <p className="text-xs text-muted-foreground mt-1">{formatDateTime(receiptData.at)}</p>
                <Badge className="mt-2 bg-green-100 text-green-700 border-green-200">Funds confirmed received</Badge>
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

    // ── Sub-state: waiting for admin after "not received" ───────────────────
    if (receiptPhase === "not_received") {
      return (
        <div className="max-w-md space-y-6">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Issue reported</h1>
            <p className="text-muted-foreground mt-1">Our team is reviewing your case.</p>
          </div>
          <Card className="border-yellow-200 bg-yellow-50">
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center justify-center">
                <div className="h-14 w-14 rounded-full bg-yellow-100 flex items-center justify-center">
                  <Clock className="h-7 w-7 text-yellow-600" />
                </div>
              </div>
              <div className="text-center space-y-1">
                <p className="font-semibold text-yellow-800">Waiting for admin response</p>
                <p className="text-sm text-yellow-700">
                  You reported that <span className="font-semibold">{formatCurrency(receiptData.amount)}</span> was not received on{" "}
                  <span className="font-mono">{receiptData.phone}</span>.
                </p>
                <p className="text-xs text-yellow-600 mt-2">
                  Our team has been notified. We'll reply to your dashboard once we've reviewed the case.
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-muted/40">
            <CardContent className="pt-4 pb-4 text-sm space-y-2">
              <p className="text-xs font-medium text-foreground">What happens next?</p>
              <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-4">
                <li>An admin will review your transaction and the reason funds may not have arrived.</li>
                <li>They may reject the dispute, ask you to add a new virtual card, or reset your withdrawal so you can retry.</li>
                <li>You'll receive a notification and the resolution will appear here.</li>
              </ul>
            </CardContent>
          </Card>
          <Button variant="ghost" className="w-full" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to dashboard
          </Button>
        </div>
      );
    }

    // ── Sub-state: admin has resolved the issue ─────────────────────────────
    if (receiptPhase === "resolved" && activeWithdrawal) {
      const resolution = activeWithdrawal.resolutionType;
      const adminNote = activeWithdrawal.adminResponse;

      const isRetry = resolution === "retry";
      const isNewCard = resolution === "new_card_required";
      const isRejected = resolution === "rejected";
      const isReversed = resolution === "reversed";

      return (
        <div className="max-w-md space-y-6">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Admin response</h1>
            <p className="text-muted-foreground mt-1">Your withdrawal dispute has been reviewed.</p>
          </div>

          <Card className={
            isRejected
              ? "border-red-200 bg-red-50"
              : isNewCard
                ? "border-blue-200 bg-blue-50"
                : isReversed
                  ? "border-orange-200 bg-orange-50"
                  : "border-green-200 bg-green-50"
          }>
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center justify-center">
                <div className={`h-14 w-14 rounded-full flex items-center justify-center ${
                  isRejected ? "bg-red-100" : isNewCard ? "bg-blue-100" : isReversed ? "bg-orange-100" : "bg-green-100"
                }`}>
                  {isRejected
                    ? <XCircle className="h-7 w-7 text-red-600" />
                    : isNewCard
                      ? <CreditCard className="h-7 w-7 text-blue-600" />
                      : isReversed
                        ? <Undo2 className="h-7 w-7 text-orange-600" />
                        : <RefreshCw className="h-7 w-7 text-green-600" />
                  }
                </div>
              </div>
              <div className="text-center space-y-1">
                <p className={`font-semibold ${isRejected ? "text-red-800" : isNewCard ? "text-blue-800" : isReversed ? "text-orange-800" : "text-green-800"}`}>
                  {isRejected && "Dispute rejected"}
                  {isNewCard && "New card required"}
                  {isRetry && "Ready to retry"}
                  {isReversed && "Funds reversed"}
                </p>
                {isReversed && (
                  <p className="text-sm text-orange-700">
                    The transfer to the wrong number is being reversed and the loan created for this withdrawal has been cancelled — you owe nothing for it.
                  </p>
                )}
                {adminNote && (
                  <div className={`rounded-md px-3 py-2 mt-2 text-sm text-left ${
                    isRejected ? "bg-red-100 text-red-800" : isNewCard ? "bg-blue-100 text-blue-800" : isReversed ? "bg-orange-100 text-orange-800" : "bg-green-100 text-green-800"
                  }`}>
                    <p className="text-xs font-semibold mb-1">Admin note:</p>
                    <p>{adminNote}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {isRetry && (
            <Button
              className="w-full"
              onClick={() => {
                // Go to phone step so user re-confirms their M-Pesa number
                // before OTP is sent (full re-verification required on retry)
                queryClient.invalidateQueries({ queryKey: getListMyWithdrawalsQueryKey() });
                setPhoneInput(activeWithdrawal?.mpesaPhone ?? profile?.phone ?? "");
                setWithdrawalId(null);
                setStep("phone");
              }}
            >
              <RefreshCw className="h-4 w-4 mr-2" /> Retry withdrawal
            </Button>
          )}

          {isNewCard && (
            <>
              <Button
                className="w-full"
                onClick={() => navigate("/virtual-card")}
              >
                <CreditCard className="h-4 w-4 mr-2" /> Add a new virtual card
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  // Once they've added the new card, let them start a fresh
                  // withdrawal (the backend now allows this after new_card_required).
                  setWithdrawalId(null);
                  setReceiptData(null);
                  setPhoneInput(profile?.phone ?? "");
                  setAmountInput(profile?.approvedLoanAmount?.toString() ?? "");
                  setStep("phone");
                }}
              >
                <Wallet className="h-4 w-4 mr-2" /> Start new withdrawal
              </Button>
            </>
          )}

          {isReversed && (
            <Button
              className="w-full"
              onClick={() => {
                // This withdrawal is terminally "failed" — start a brand new
                // withdrawal request rather than trying to resume this one.
                setWithdrawalId(null);
                setReceiptData(null);
                setPhoneInput(profile?.phone ?? "");
                setStep("phone");
              }}
            >
              <Wallet className="h-4 w-4 mr-2" /> Start a new withdrawal
            </Button>
          )}

          <Button variant="ghost" className="w-full" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to dashboard
          </Button>
        </div>
      );
    }

    // ── Sub-state: just disbursed — ask for receipt confirmation ────────────
    const isTrial = !!(activeWithdrawal as any)?.isTrial;
    return (
      <div className="max-w-md space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            {isTrial ? "Trial withdrawal sent" : "Loan disbursed"}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isTrial
              ? "Your KES 15 trial has been sent. Please confirm receipt below."
              : "Your loan has been sent. Please confirm receipt below."}
          </p>
        </div>

        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center justify-center">
              <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-foreground">{formatCurrency(receiptData.amount)}</p>
              <p className="text-sm text-muted-foreground mt-1">Sent to {receiptData.phone}</p>
              <p className="text-xs text-muted-foreground mt-1">{formatDateTime(receiptData.at)}</p>
              {isTrial && (
                <Badge className="mt-2 bg-blue-100 text-blue-700 border-blue-200">Trial withdrawal</Badge>
              )}
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
            {isTrial ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Type</span>
                <span className="text-blue-700 font-medium">Trial ({trialWithdrawalsRemaining} of 2 remaining)</span>
              </div>
            ) : (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Interest rate</span>
                  <span>10% flat</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Repayment term</span>
                  <span>12 monthly installments</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Receipt confirmation */}
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-base">Did you receive the funds?</CardTitle>
          </CardHeader>
          <CardContent className="pb-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Confirm whether you received {formatCurrency(receiptData.amount)} on{" "}
              <span className="font-mono font-medium">{receiptData.phone}</span>.
            </p>
            <div className="flex gap-3">
              <Button
                className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                disabled={confirmingReceipt}
                onClick={() => handleConfirmReceipt(true)}
              >
                <ThumbsUp className="h-4 w-4 mr-2" />
                {confirmingReceipt ? "Saving…" : "Yes, received"}
              </Button>
              <Button
                variant="outline"
                className="flex-1 border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                disabled={confirmingReceipt}
                onClick={() => handleConfirmReceipt(false)}
              >
                <ThumbsDown className="h-4 w-4 mr-2" />
                Not received
              </Button>
            </div>
          </CardContent>
        </Card>

        {isTrial && trialWithdrawalsRemaining > 0 && (
          <Card className="bg-blue-50/50 border-blue-200">
            <CardContent className="pt-4 pb-4 text-sm space-y-2">
              <p className="font-medium text-blue-900 flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                {trialWithdrawalsRemaining} trial withdrawal{trialWithdrawalsRemaining !== 1 ? "s" : ""} remaining
              </p>
              <p className="text-xs text-blue-700">
                Add and get a virtual card approved to unlock your full loan amount.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="w-full border-blue-300 text-blue-700 hover:bg-blue-100 mt-1"
                onClick={() => navigate("/virtual-card")}
              >
                <CreditCard className="h-4 w-4 mr-2" /> Add a virtual card
              </Button>
            </CardContent>
          </Card>
        )}

        {!isTrial && (
          <Button variant="outline" className="w-full" onClick={() => navigate("/loans")}>
            View repayment schedule <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        )}
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
    // ── TRIAL MODE: no approved virtual card ─────────────────────────────
    if (isTrialMode) {
      return (
        <div className="max-w-md space-y-6">
          <div>
            <button
              onClick={() => navigate("/dashboard")}
              className="flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
            >
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </button>
            <h1 className="text-2xl font-semibold text-foreground">Trial Withdrawal</h1>
            <p className="text-muted-foreground mt-1">
              Try the withdrawal feature with KES 15 — up to 2 times while your virtual card is pending approval.
            </p>
          </div>

          <StepProgress current="phone" steps={STEPS_WITHOUT_GUARANTOR} />

          {/* Trial counter */}
          <Card className={trialWithdrawalsRemaining > 0 ? "border-blue-200 bg-blue-50/40" : "border-red-200 bg-red-50/40"}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Wallet className="h-4 w-4 text-blue-600" />
                  <span>Trial withdrawals remaining</span>
                </div>
                <span className={`text-xl font-bold ${trialWithdrawalsRemaining > 0 ? "text-blue-700" : "text-red-600"}`}>
                  {trialWithdrawalsRemaining} / 2
                </span>
              </div>
              {trialWithdrawalsRemaining === 0 && (
                <p className="text-xs text-red-700 mt-2">
                  Both trial withdrawals used. Add a virtual card and wait for admin approval to continue withdrawing.
                </p>
              )}
            </CardContent>
          </Card>

          {trialWithdrawalsRemaining > 0 ? (
            <Card>
              <CardContent className="pt-6 pb-4">
                <div className="flex items-center justify-between py-2 border-b border-border mb-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Wallet className="h-4 w-4" />
                    Trial withdrawal amount
                  </div>
                  <span className="text-xl font-bold text-foreground">KES 15.00</span>
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
                      KES 15 will be sent to this number after OTP verification.
                    </p>
                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={initiating || sendingOtp || !phoneInput.trim()}
                  >
                    {initiating || sendingOtp ? "Sending code…" : "Send verification code"}
                    {!initiating && !sendingOtp && <ArrowRight className="h-4 w-4 ml-2" />}
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : null}

          {/* Prompt to add a card */}
          <Card className="bg-muted/40">
            <CardContent className="pt-4 pb-4 space-y-2 text-sm">
              <p className="font-medium text-foreground flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Unlock full withdrawals
              </p>
              <p className="text-muted-foreground text-xs">
                Add a virtual card and wait for admin approval to withdraw your full loan amount without limits.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-1"
                onClick={() => navigate("/virtual-card")}
              >
                <CreditCard className="h-4 w-4 mr-2" /> Add a virtual card
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    // ── NORMAL MODE: approved virtual card exists ─────────────────────────
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
        <StepProgress current="phone" steps={activeSteps} />

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
              {/* Amount to withdraw */}
              <div className="space-y-2">
                <Label htmlFor="withdrawAmount">Amount to withdraw (KES)</Label>
                <Input
                  id="withdrawAmount"
                  type="number"
                  min={1}
                  max={approvedAmount}
                  step={0.01}
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  placeholder={approvedAmount.toString()}
                  required
                />
                {(() => {
                  const val = parseFloat(amountInput);
                  if (amountInput && val < approvedAmount) {
                    return (
                      <p className="text-xs text-amber-600">
                        Partial withdrawal — remaining{" "}
                        <span className="font-medium">
                          {formatCurrency((approvedAmount - val).toFixed(2))}
                        </span>{" "}
                        stays in your approved balance.
                      </p>
                    );
                  }
                  return (
                    <p className="text-xs text-muted-foreground">
                      You can withdraw up to {formatCurrency(approvedAmount.toString())}. Enter a
                      smaller amount for a partial withdrawal.
                    </p>
                  );
                })()}
              </div>

              {/* M-Pesa number */}
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
                disabled={
                  initiating ||
                  sendingOtp ||
                  profileLoading ||
                  !allWithdrawalConditionsMet
                }
              >
                {initiating || sendingOtp
                  ? "Sending code…"
                  : isPartialWithGuarantor
                    ? "Next: Confirm guarantor"
                    : "Send verification code"}
                {!initiating && !sendingOtp && <ArrowRight className="h-4 w-4 ml-2" />}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* ── Live checklist ──────────────────────────────────────────── */}
        <Card className={allWithdrawalConditionsMet ? "border-green-200 bg-green-50/40" : "border-amber-200 bg-amber-50/40"}>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              {allWithdrawalConditionsMet
                ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                : <AlertTriangle className="h-4 w-4 text-amber-600" />}
              {allWithdrawalConditionsMet ? "All requirements met" : "Complete all requirements to proceed"}
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4 space-y-2 text-sm">

            {/* ── Always-required rows ─────────────────────────────────── */}
            {(
              [
                { ok: hasPhone1Verified, label: "M-Pesa number 1 verified", path: "/profile" },
                { ok: hasPhone2Verified, label: "M-Pesa number 2 verified", path: "/profile" },
                { ok: hasAnyCard,        label: "At least 1 approved virtual card", path: "/virtual-card" },
              ] as { ok: boolean; label: string; path: string }[]
            ).map(({ ok, label, path }) => (
              <div key={label} className="flex items-center gap-2">
                {ok
                  ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                  : <XCircle className="h-4 w-4 text-red-500 shrink-0" />}
                <span className={ok ? "text-foreground" : "text-muted-foreground flex-1"}>{label}</span>
                {!ok && (
                  <button
                    type="button"
                    onClick={() => navigate(path)}
                    className="ml-auto text-xs text-primary underline shrink-0"
                  >
                    Fix →
                  </button>
                )}
              </div>
            ))}

            {/* ── Type-specific row (shows once amount is entered) ─────── */}
            {isPartialAmount && (
              <div className="flex items-start gap-2 border-t border-border/40 pt-2 mt-1">
                {partialDocsMet
                  ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                  : <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />}
                <div className="flex-1 min-w-0">
                  <span className={partialDocsMet ? "text-foreground" : "text-muted-foreground"}>
                    Partial withdrawal: company guarantor or all 5 business documents
                    {hasGuarantorBool && <span className="text-green-700"> (guarantor on file ✓)</span>}
                    {!hasGuarantorBool && hasAllBizDocs && <span className="text-green-700"> (documents complete ✓)</span>}
                  </span>
                  {!partialDocsMet && (
                    <div className="flex gap-3 mt-1">
                      <button type="button" onClick={() => navigate("/guarantor")} className="text-xs text-primary underline">Add guarantor</button>
                      <button type="button" onClick={() => navigate("/profile")} className="text-xs text-primary underline">Upload business docs</button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {isFullAmount && (
              <div className="flex items-center gap-2 border-t border-border/40 pt-2 mt-1">
                {hasTwoCards
                  ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                  : <XCircle className="h-4 w-4 text-red-500 shrink-0" />}
                <span className={hasTwoCards ? "text-foreground" : "text-muted-foreground flex-1"}>
                  Full withdrawal: {approvedCardCount}/2 approved virtual cards
                </span>
                {!hasTwoCards && (
                  <button type="button" onClick={() => navigate("/virtual-card")} className="ml-auto text-xs text-primary underline shrink-0">
                    Add card →
                  </button>
                )}
              </div>
            )}

            {!isPartialAmount && !isFullAmount && (
              <p className="text-xs text-muted-foreground border-t border-border/40 pt-2 mt-1">
                Enter an amount above to see type-specific requirements.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Guarantor confirmation step ───────────────────────────────────────────
  // Shown when the user chooses a partial withdrawal to a different M-Pesa number.
  if (step === "guarantor") {
    return (
      <div className="max-w-md space-y-6">
        <div>
          <button
            onClick={() => { setGuarantorAcknowledged(false); setStep("phone"); }}
            className="flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </button>
          <h1 className="text-2xl font-semibold text-foreground">Confirm company guarantor</h1>
          <p className="text-muted-foreground mt-1">
            You are making a partial withdrawal. Your registered company guarantor must
            acknowledge this transaction before you can proceed.
          </p>
        </div>

        <StepProgress current="guarantor" steps={STEPS_WITH_GUARANTOR} />

        {/* Transaction summary */}
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <span className="text-muted-foreground">Withdrawal amount</span>
              <span className="font-semibold text-foreground">
                {formatCurrency(parsedAmountNum.toFixed(2))}
              </span>
              <span className="text-muted-foreground">Sending to</span>
              <span className="font-mono text-foreground">{phoneInput.trim()}</span>
            </div>
          </CardContent>
        </Card>

        {/* Guarantor details */}
        {guarantor ? (
          <Card className="border-blue-200 bg-blue-50/40">
            <CardHeader className="pb-2 flex flex-row items-center gap-2 pt-4">
              <Building2 className="h-5 w-5 text-blue-500 shrink-0" />
              <CardTitle className="text-base text-blue-900">{guarantor.companyName}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1.5 text-sm pb-4">
              {guarantor.companyRegistration && (
                <>
                  <span className="text-muted-foreground">Reg. no.</span>
                  <span>{guarantor.companyRegistration}</span>
                </>
              )}
              {guarantor.contactPerson && (
                <>
                  <span className="text-muted-foreground">Contact</span>
                  <span>{guarantor.contactPerson}</span>
                </>
              )}
              {guarantor.phone && (
                <>
                  <span className="text-muted-foreground">Phone</span>
                  <span className="font-mono">{guarantor.phone}</span>
                </>
              )}
              {guarantor.address && (
                <>
                  <span className="text-muted-foreground">Address</span>
                  <span>{guarantor.address}</span>
                </>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              No company guarantor found. Please add one from the{" "}
              <button
                onClick={() => navigate("/guarantor")}
                className="underline font-medium"
              >
                Company Guarantor
              </button>{" "}
              page, then return here.
            </span>
          </div>
        )}

        {/* Acknowledgement checkbox */}
        {guarantor && (
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
              checked={guarantorAcknowledged}
              onChange={(e) => setGuarantorAcknowledged(e.target.checked)}
            />
            <span className="text-sm text-foreground">
              I confirm that{" "}
              <span className="font-medium">{guarantor.companyName}</span> is authorised to
              guarantee this partial withdrawal of{" "}
              <span className="font-medium">{formatCurrency(parsedAmountNum.toFixed(2))}</span>{" "}
              to{" "}
              <span className="font-mono">{phoneInput.trim()}</span>.
            </span>
          </label>
        )}

        <Button
          className="w-full"
          disabled={!guarantor || !guarantorAcknowledged || initiating || sendingOtp}
          onClick={handleGuarantorConfirm}
        >
          {initiating || sendingOtp ? "Sending code…" : "Confirm & send verification code"}
          {!initiating && !sendingOtp && <ArrowRight className="h-4 w-4 ml-2" />}
        </Button>
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
            Enter the 6-digit code sent to your in-app notifications to confirm{" "}
            <span className="font-mono font-medium">{displayPhone}</span>.
          </p>
        </div>

        <StepProgress current="otp" steps={activeSteps} />

        {/* Expiry countdown banner */}
        {daysRemaining !== null && daysRemaining <= 3 && daysRemaining > 0 && (
          <div className="flex items-start gap-2 rounded-md bg-orange-50 border border-orange-200 px-3 py-2 text-sm text-orange-800">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-orange-600" />
            <span>
              <span className="font-semibold">Deadline soon:</span> your withdrawal request expires in {daysRemaining} day{daysRemaining !== 1 ? "s" : ""}. Complete the steps before it expires.
            </span>
          </div>
        )}

        {latestOtpNotification && (
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start gap-3">
                <Bell className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-blue-800 mb-0.5">{latestOtpNotification.title}</p>
                  <p className="text-sm text-blue-900">{latestOtpNotification.message}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

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
                {!latestOtpNotification && (
                  <p className="text-xs text-muted-foreground">
                    The code appears in the notification above — check your{" "}
                    <span className="font-medium">bell icon</span> if not yet visible.
                  </p>
                )}
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
        <button
          onClick={() => setStep("otp")}
          disabled={verifying}
          className="flex items-center text-sm text-muted-foreground hover:text-foreground mb-4 disabled:opacity-50 disabled:pointer-events-none"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </button>
        <h1 className="text-2xl font-semibold text-foreground">Confirm your card</h1>
        <p className="text-muted-foreground mt-1">
          Enter your admin-approved virtual card number exactly as you registered it to authorise the withdrawal.
        </p>
      </div>

      <StepProgress current="verify" steps={activeSteps} />

      {/* Expiry countdown banner */}
      {daysRemaining !== null && daysRemaining <= 3 && daysRemaining > 0 && (
        <div className="flex items-start gap-2 rounded-md bg-orange-50 border border-orange-200 px-3 py-2 text-sm text-orange-800">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-orange-600" />
          <span>
            <span className="font-semibold">Deadline soon:</span> your withdrawal request expires in {daysRemaining} day{daysRemaining !== 1 ? "s" : ""}. Complete the steps before it expires.
          </span>
        </div>
      )}

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

      {approvedCard && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <CreditCard className="h-5 w-5 text-green-700 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-green-800 mb-0.5 flex items-center gap-2">
                  Your approved card
                  <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px] py-0">Approved</Badge>
                </p>
                <p className="text-sm text-green-900 font-medium">{approvedCard.cardHolderName}</p>
                {approvedCard.bank && (
                  <p className="text-xs text-green-700 mt-0.5">{approvedCard.bank}</p>
                )}
              </div>
            </div>
            <p className="text-xs text-green-700 mt-3">
              Enter the card number <span className="font-semibold">exactly as you typed it</span> when you registered this card.
            </p>
          </CardContent>
        </Card>
      )}

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
            </div>

            {verifyError && (
              <div className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{verifyError}</span>
              </div>
            )}

            {attemptsLeft > 0 && attemptsLeft < 3 && (
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

            <Button
              type="button"
              variant="ghost"
              className="w-full"
              disabled={verifying}
              onClick={() => { setCardInput(""); setVerifyError(null); setStep("phone"); }}
            >
              Use a different number
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
