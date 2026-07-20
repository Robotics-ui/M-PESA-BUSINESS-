import { useEffect, useState } from "react";
import {
  useGetMyProfile,
  useUpdateMyProfile,
  getGetMyProfileQueryKey,
  useListMyDocuments,
  useAddMyDocument,
  getListMyDocumentsQueryKey,
  useRequestPhoneOtp,
  useVerifyPhoneOtp,
  useRequestUploadUrl,
  DocumentType,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { UserCircle, ShieldCheck, Upload, FileImage, Check, Building2 } from "lucide-react";

type DocKey = "idFrontUrl" | "idBackUrl" | "selfieUrl";

const PHOTO_SLOTS: { key: DocKey; label: string }[] = [
  { key: "idFrontUrl", label: "National ID (front)" },
  { key: "idBackUrl", label: "National ID (back)" },
  { key: "selfieUrl", label: "Selfie" },
];

export default function Profile() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: profile, isLoading } = useGetMyProfile();
  const { data: documents } = useListMyDocuments();

  const [form, setForm] = useState({
    phone: "",
    dateOfBirth: "",
    address: "",
    city: "",
    nationalIdNumber: "",
  });
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setForm({
        phone: profile.phone ?? "",
        dateOfBirth: profile.dateOfBirth ?? "",
        address: profile.address ?? "",
        city: profile.city ?? "",
        nationalIdNumber: profile.nationalIdNumber ?? "",
      });
    }
  }, [profile]);

  const { mutate: saveProfile, isPending: saving } = useUpdateMyProfile({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMyProfileQueryKey() });
        toast({ title: "Profile updated" });
      },
      onError: () => toast({ title: "Failed to update profile", variant: "destructive" }),
    },
  });

  const { mutate: requestOtp, isPending: requestingOtp } = useRequestPhoneOtp({
    mutation: {
      onSuccess: () => {
        setOtpSent(true);
        toast({ title: "Verification code sent", description: "Check your notifications for the code." });
      },
      onError: () => toast({ title: "Couldn't send code", variant: "destructive" }),
    },
  });

  const { mutate: verifyOtp, isPending: verifying } = useVerifyPhoneOtp({
    mutation: {
      onSuccess: (result) => {
        if (result.verified) {
          queryClient.invalidateQueries({ queryKey: getGetMyProfileQueryKey() });
          toast({ title: "Phone number verified" });
          setOtpSent(false);
          setOtpCode("");
        } else {
          toast({ title: "Incorrect code", variant: "destructive" });
        }
      },
      onError: () => toast({ title: "Verification failed", variant: "destructive" }),
    },
  });

  const { mutateAsync: requestUploadUrl } = useRequestUploadUrl();
  const { mutateAsync: addDocument } = useAddMyDocument();

  const handleFieldSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveProfile({
      data: {
        phone: form.phone || undefined,
        dateOfBirth: form.dateOfBirth || undefined,
        address: form.address || undefined,
        city: form.city || undefined,
        nationalIdNumber: form.nationalIdNumber || undefined,
      },
    });
  };

  async function handlePhotoUpload(slotKey: DocKey, file: File) {
    setUploadingSlot(slotKey);
    try {
      const { uploadURL, objectPath } = await requestUploadUrl({
        data: { name: file.name, size: file.size, contentType: file.type || "application/octet-stream" },
      });
      await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      await saveProfile({ data: { [slotKey]: objectPath } });
      toast({ title: "Photo uploaded" });
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setUploadingSlot(null);
    }
  }

  async function handleDocumentUpload(type: string, file: File) {
    setUploadingSlot(type);
    try {
      const { uploadURL, objectPath } = await requestUploadUrl({
        data: { name: file.name, size: file.size, contentType: file.type || "application/octet-stream" },
      });
      await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      await addDocument({
        data: { type: type as typeof DocumentType[keyof typeof DocumentType], fileName: file.name, fileUrl: objectPath },
      });
      queryClient.invalidateQueries({ queryKey: getListMyDocumentsQueryKey() });
      toast({ title: "Document uploaded" });
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setUploadingSlot(null);
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-2xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const supportingDocs = documents?.filter((d) => d.type === "supporting") ?? [];

  const BUSINESS_DOC_SLOTS = [
    { type: "company_registration", label: "Company Registration Certificate" },
    { type: "cr12", label: "Latest CR12" },
    { type: "cr1",  label: "CR1" },
    { type: "cr2",  label: "CR2" },
    { type: "cr8",  label: "CR8" },
  ] as const;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center">
          <UserCircle className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Your profile</h1>
          <p className="text-muted-foreground text-sm">Keep your details up to date for faster approvals.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Personal details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleFieldSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dateOfBirth">Date of birth</Label>
                <Input
                  id="dateOfBirth"
                  type="date"
                  value={form.dateOfBirth}
                  onChange={(e) => setForm((f) => ({ ...f, dateOfBirth: e.target.value }))}
                  data-testid="input-date-of-birth"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nationalIdNumber">National ID number</Label>
                <Input
                  id="nationalIdNumber"
                  value={form.nationalIdNumber}
                  onChange={(e) => setForm((f) => ({ ...f, nationalIdNumber: e.target.value }))}
                  data-testid="input-national-id"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                data-testid="input-address"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                data-testid="input-city"
              />
            </div>
            <Button type="submit" disabled={saving} data-testid="button-save-profile">
              {saving ? "Saving..." : "Save changes"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Phone verification
          </CardTitle>
          <CardDescription>
            {profile?.phoneVerified ? "Your phone number is verified." : "Verify your phone number by SMS."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-2">
              <Label htmlFor="phone">Phone number</Label>
              <Input
                id="phone"
                placeholder="+254700000000"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                data-testid="input-phone"
              />
            </div>
            {profile?.phoneVerified ? (
              <Badge className="mb-0.5" variant="outline">
                <Check className="h-3 w-3 mr-1" /> Verified
              </Badge>
            ) : (
              <Button
                type="button"
                variant="outline"
                disabled={requestingOtp || !form.phone}
                onClick={async () => {
                  await saveProfile({ data: { phone: form.phone } });
                  requestOtp({ data: { phone: form.phone } });
                }}
                data-testid="button-request-otp"
              >
                {requestingOtp ? "Sending..." : "Send code"}
              </Button>
            )}
          </div>

          {otpSent && !profile?.phoneVerified && (
            <div className="rounded-md border border-dashed border-border p-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                Your verification code was sent — check the notification bell at the top of the page.
              </p>
              <div className="flex items-end gap-3">
                <div className="space-y-2">
                  <Label htmlFor="otp">Enter code</Label>
                  <Input
                    id="otp"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    maxLength={6}
                    data-testid="input-otp-code"
                  />
                </div>
                <Button
                  type="button"
                  disabled={verifying || !otpCode}
                  onClick={() => verifyOtp({ data: { phone: form.phone, code: otpCode } })}
                  data-testid="button-verify-otp"
                >
                  {verifying ? "Verifying..." : "Verify"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Identity documents</CardTitle>
          <CardDescription>Upload clear photos for verification.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {PHOTO_SLOTS.map((slot) => {
              const uploaded = !!profile?.[slot.key];
              return (
                <label
                  key={slot.key}
                  className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border p-4 cursor-pointer hover-elevate text-center"
                  data-testid={`upload-slot-${slot.key}`}
                >
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handlePhotoUpload(slot.key, file);
                    }}
                  />
                  {uploaded ? (
                    <Check className="h-6 w-6 text-primary" />
                  ) : (
                    <FileImage className="h-6 w-6 text-muted-foreground" />
                  )}
                  <span className="text-xs text-foreground">{slot.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {uploadingSlot === slot.key ? "Uploading..." : uploaded ? "Uploaded" : "Tap to upload"}
                  </span>
                </label>
              );
            })}
          </div>

          <Separator />

          <div>
            <Label className="mb-2 block">Supporting documents</Label>
            <div className="space-y-2 mb-3">
              {supportingDocs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No supporting documents uploaded.</p>
              ) : (
                supportingDocs.map((doc) => (
                  <div key={doc.id} className="flex items-center gap-2 text-sm text-foreground">
                    <FileImage className="h-4 w-4 text-muted-foreground" />
                    {doc.fileName}
                  </div>
                ))
              )}
            </div>
            <label
              className="inline-flex items-center gap-2 cursor-pointer rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover-elevate"
              data-testid="button-upload-supporting"
            >
              <input
                type="file"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleDocumentUpload("supporting", file);
                }}
              />
              <Upload className="h-4 w-4" />
              {uploadingSlot === "supporting" ? "Uploading..." : "Upload document"}
            </label>
          </div>
        </CardContent>
      </Card>

      {/* ── Business documents ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4" /> Business documents
          </CardTitle>
          <CardDescription>
            Required for partial loan withdrawals (if you don't have a company guarantor). Upload
            the Company Registration Certificate plus all CR forms.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {BUSINESS_DOC_SLOTS.map((slot) => {
            const uploaded = documents?.some((d) => d.type === slot.type);
            const isUploading = uploadingSlot === slot.type;
            return (
              <label
                key={slot.type}
                className="flex items-center justify-between gap-3 rounded-md border border-dashed border-border p-3 cursor-pointer hover-elevate"
                data-testid={`upload-slot-${slot.type}`}
              >
                <input
                  type="file"
                  accept=".pdf,image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleDocumentUpload(slot.type, file);
                  }}
                />
                <div className="flex items-center gap-3 min-w-0">
                  {uploaded ? (
                    <Check className="h-5 w-5 text-primary shrink-0" />
                  ) : (
                    <FileImage className="h-5 w-5 text-muted-foreground shrink-0" />
                  )}
                  <span className="text-sm text-foreground truncate">{slot.label}</span>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {isUploading ? "Uploading…" : uploaded ? "Uploaded ✓" : "Tap to upload"}
                </span>
              </label>
            );
          })}
          <p className="text-xs text-muted-foreground pt-1">
            Accepted formats: PDF, JPG, PNG. All 5 documents must be uploaded to qualify for a
            partial withdrawal without a guarantor.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
