import { useState } from "react";
import { useLocation } from "wouter";
import { useCreateLoanApplication, getListMyLoanApplicationsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { FileText } from "lucide-react";

const LOAN_TYPES = [
  { value: "working_capital", label: "Working capital" },
  { value: "equipment", label: "Equipment financing" },
  { value: "inventory", label: "Inventory purchase" },
  { value: "expansion", label: "Business expansion" },
];

export default function Apply() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("");
  const [loanType, setLoanType] = useState("");
  const [termMonths, setTermMonths] = useState("12");

  const { mutate, isPending } = useCreateLoanApplication({
    mutation: {
      onSuccess: (application) => {
        queryClient.invalidateQueries({ queryKey: getListMyLoanApplicationsQueryKey() });
        toast({ title: "Application submitted", description: "We'll review it and update you soon." });
        navigate(`/loans/${application.id}`);
      },
      onError: () => {
        toast({ title: "Something went wrong", description: "Please try again.", variant: "destructive" });
      },
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !purpose || !loanType || !termMonths) return;
    mutate({
      data: {
        amount: parseFloat(amount).toFixed(2),
        purpose,
        loanType,
        termMonths: parseInt(termMonths, 10),
      },
    });
  };

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center">
          <FileText className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Apply for a loan</h1>
          <p className="text-muted-foreground text-sm">Tell us about your business needs.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Loan details</CardTitle>
          <CardDescription>A loan officer will review your application manually.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount requested (KES)</Label>
              <Input
                id="amount"
                type="number"
                min="1"
                step="0.01"
                placeholder="50000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                data-testid="input-amount"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="loanType">Loan type</Label>
              <Select value={loanType} onValueChange={setLoanType} required>
                <SelectTrigger id="loanType" data-testid="select-loan-type">
                  <SelectValue placeholder="Select a loan type" />
                </SelectTrigger>
                <SelectContent>
                  {LOAN_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="termMonths">Repayment term (months)</Label>
              <Input
                id="termMonths"
                type="number"
                min={1}
                max={60}
                value={termMonths}
                onChange={(e) => setTermMonths(e.target.value)}
                required
                data-testid="input-term-months"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="purpose">Purpose</Label>
              <Textarea
                id="purpose"
                placeholder="What will this loan be used for?"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                rows={4}
                required
                data-testid="input-purpose"
              />
            </div>

            <Button type="submit" disabled={isPending} className="w-full" data-testid="button-submit-application">
              {isPending ? "Submitting..." : "Submit application"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
