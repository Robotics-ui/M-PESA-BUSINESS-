import { useAuth } from "@workspace/replit-auth-web";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";

export default function Suspended() {
  const { logout } = useAuth();
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background px-6">
      <div className="max-w-md text-center">
        <div className="mx-auto h-14 w-14 rounded-full bg-destructive/10 flex items-center justify-center mb-6">
          <ShieldAlert className="h-7 w-7 text-destructive" />
        </div>
        <h1 className="text-2xl font-semibold text-foreground mb-2">Your account is suspended</h1>
        <p className="text-muted-foreground mb-8">
          Access to M-PESA Business Loans has been temporarily suspended for this account. If you believe this is
          a mistake, please contact our support team to resolve it.
        </p>
        <Button variant="outline" onClick={logout} data-testid="button-logout-suspended">
          Sign out
        </Button>
      </div>
    </div>
  );
}
