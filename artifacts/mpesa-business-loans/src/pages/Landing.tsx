import { useAuth } from "@workspace/replit-auth-web";
import { Button } from "@/components/ui/button";
import { Wallet, ShieldCheck, Clock, TrendingUp } from "lucide-react";

export default function Landing() {
  const { login } = useAuth();

  return (
    <div className="min-h-screen w-full bg-background flex flex-col">
      <header className="h-16 flex items-center justify-between px-6 md:px-10 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center">
            <Wallet className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-semibold">M-PESA Business Loans</span>
        </div>
        <Button onClick={login} data-testid="button-login-header">
          Sign in
        </Button>
      </header>

      <main className="flex-1 flex items-center">
        <div className="mx-auto max-w-5xl px-6 md:px-10 py-16 grid md:grid-cols-2 gap-12 items-center">
          <div>
            <p className="text-sm font-medium text-primary mb-3">Working capital for Kenyan businesses</p>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground mb-5">
              Grow your business with fast, transparent loans.
            </h1>
            <p className="text-muted-foreground text-lg mb-8 max-w-md">
              Apply in minutes, track every step of your application, and manage repayments — all from one
              trusted dashboard.
            </p>
            <Button size="lg" onClick={login} data-testid="button-login-hero">
              Sign in to get started
            </Button>
          </div>

          <div className="space-y-4">
            {[
              {
                icon: Clock,
                title: "Fast decisions",
                desc: "Our loan officers review applications quickly, with full visibility into where yours stands.",
              },
              {
                icon: ShieldCheck,
                title: "Secure by design",
                desc: "Verified identity, encrypted documents, and full audit history for every account action.",
              },
              {
                icon: TrendingUp,
                title: "Built to grow with you",
                desc: "From your first application to full repayment, track everything in one place.",
              },
            ].map((item) => (
              <div key={item.title} className="flex gap-4 p-5 rounded-lg border border-border bg-card">
                <div className="h-10 w-10 shrink-0 rounded-md bg-primary/10 flex items-center justify-center">
                  <item.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-card-foreground">{item.title}</p>
                  <p className="text-sm text-muted-foreground mt-1">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      <footer className="text-center text-xs text-muted-foreground py-6 border-t border-border">
        M-PESA Business Loans — Phase 1 foundation
      </footer>
    </div>
  );
}
