import { useState, type FormEvent } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { KeyRound, AlertCircle } from "lucide-react";

export default function ChangePassword() {
  const { changePassword, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      return;
    }

    setIsSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
    } catch (err) {
      setError(err && typeof err === "object" && "error" in err ? String((err as { error: unknown }).error) : "Could not change password");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-background flex items-center justify-center px-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center mb-2">
            <KeyRound className="h-5 w-5 text-primary" />
          </div>
          <CardTitle>Set a new password</CardTitle>
          <CardDescription>
            You're using a temporary password. Choose a new password to continue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive" data-testid="alert-change-password-error">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="current-password">Temporary password</Label>
              <Input
                id="current-password"
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                data-testid="input-current-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                data-testid="input-new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input
                id="confirm-password"
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                data-testid="input-confirm-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitting} data-testid="button-submit-change-password">
              {isSubmitting ? "Updating..." : "Update password"}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => logout()} data-testid="button-cancel-change-password">
              Sign out instead
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
