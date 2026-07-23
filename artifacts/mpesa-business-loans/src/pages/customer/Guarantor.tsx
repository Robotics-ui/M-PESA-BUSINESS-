import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMyGuarantor,
  getGetMyGuarantorQueryKey,
  useUpsertMyGuarantor,
} from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Building2, CheckCircle2, Pencil } from "lucide-react";

export default function Guarantor() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: guarantor, isLoading } = useGetMyGuarantor({
    query: { retry: false, queryKey: getGetMyGuarantorQueryKey() },
  });

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    companyName: "",
    companyRegistration: "",
    contactPerson: "",
    phone: "",
    address: "",
  });

  // Pre-fill form when guarantor data loads
  useEffect(() => {
    if (guarantor) {
      setForm({
        companyName: guarantor.companyName ?? "",
        companyRegistration: guarantor.companyRegistration ?? "",
        contactPerson: guarantor.contactPerson ?? "",
        phone: guarantor.phone ?? "",
        address: guarantor.address ?? "",
      });
    }
  }, [guarantor]);

  // If no guarantor exists yet, open form by default
  useEffect(() => {
    if (!isLoading && !guarantor) setEditing(true);
  }, [isLoading, guarantor]);

  const { mutate: save, isPending } = useUpsertMyGuarantor({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMyGuarantorQueryKey() });
        toast({ title: "Saved", description: "Company guarantor details updated." });
        setEditing(false);
      },
      onError: () =>
        toast({ title: "Save failed", description: "Please check your details and try again.", variant: "destructive" }),
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.companyName.trim()) return;
    save({
      data: {
        companyName: form.companyName.trim(),
        companyRegistration: form.companyRegistration.trim() || undefined,
        contactPerson: form.contactPerson.trim() || undefined,
        phone: form.phone.trim() || undefined,
        address: form.address.trim() || undefined,
      },
    });
  };

  if (isLoading) {
    return (
      <div className="max-w-xl mx-auto px-4 py-8 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Company guarantor</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Provide the company details that will act as a guarantor for your loan applications.
        </p>
      </div>

      {/* Display card — shown when not editing and guarantor exists */}
      {guarantor && !editing && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between pb-2">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-blue-500" />
              <CardTitle className="text-base">{guarantor.companyName}</CardTitle>
            </div>
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
            </Button>
          </CardHeader>
          <CardContent className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
            {guarantor.companyRegistration && (
              <>
                <span className="text-muted-foreground">Registration no.</span>
                <span>{guarantor.companyRegistration}</span>
              </>
            )}
            {guarantor.contactPerson && (
              <>
                <span className="text-muted-foreground">Contact person</span>
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
      )}

      {/* Success confirmation when just saved */}
      {guarantor && !editing && (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-4 py-3">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Your company guarantor is on file. Admin will review it during your loan assessment.
        </div>
      )}

      {/* Edit / Add form */}
      {editing && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {guarantor ? "Edit company details" : "Add company guarantor"}
            </CardTitle>
            <CardDescription>
              Fill in as much detail as possible — this helps speed up loan assessment.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="companyName">
                  Company name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="companyName"
                  value={form.companyName}
                  onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
                  placeholder="e.g. Acme Traders Ltd"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="companyRegistration">Registration / Certificate no.</Label>
                <Input
                  id="companyRegistration"
                  value={form.companyRegistration}
                  onChange={(e) => setForm((f) => ({ ...f, companyRegistration: e.target.value }))}
                  placeholder="e.g. CPR/2019/12345"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="contactPerson">Contact person</Label>
                <Input
                  id="contactPerson"
                  value={form.contactPerson}
                  onChange={(e) => setForm((f) => ({ ...f, contactPerson: e.target.value }))}
                  placeholder="e.g. Jane Mwangi (Director)"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone number</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="e.g. 0712 345 678"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="address">Physical address</Label>
                <Textarea
                  id="address"
                  rows={2}
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  placeholder="e.g. 4th Floor, Westlands Business Park, Nairobi"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button type="submit" disabled={isPending || !form.companyName.trim()}>
                  {isPending ? "Saving…" : "Save"}
                </Button>
                {guarantor && (
                  <Button type="button" variant="outline" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
