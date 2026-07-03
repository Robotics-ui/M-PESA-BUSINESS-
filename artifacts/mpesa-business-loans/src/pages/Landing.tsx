import { useState, type FormEvent } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Wallet, ShieldCheck, Clock, TrendingUp, AlertCircle } from "lucide-react";

function LoginForm() {
  const { login, isLoginPending, loginError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await login(email, password);
    } catch {
      // error surfaced via loginError
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {loginError && (
        <Alert variant="destructive" data-testid="alert-login-error">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{loginError}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-2">
        <Label htmlFor="login-email">Email</Label>
        <Input
          id="login-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          data-testid="input-login-email"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="login-password">Password</Label>
        <Input
          id="login-password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          data-testid="input-login-password"
        />
      </div>
      <Button type="submit" className="w-full" disabled={isLoginPending} data-testid="button-submit-login">
        {isLoginPending ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  );
}

function SignupForm() {
  const { signup, isSignupPending, signupError } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await signup({ firstName, lastName, email, password });
    } catch {
      // error surfaced via signupError
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {signupError && (
        <Alert variant="destructive" data-testid="alert-signup-error">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{signupError}</AlertDescription>
        </Alert>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="signup-first-name">First name</Label>
          <Input
            id="signup-first-name"
            required
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            data-testid="input-signup-first-name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="signup-last-name">Last name</Label>
          <Input
            id="signup-last-name"
            required
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            data-testid="input-signup-last-name"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="signup-email">Email</Label>
        <Input
          id="signup-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          data-testid="input-signup-email"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="signup-password">Password</Label>
        <Input
          id="signup-password"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          data-testid="input-signup-password"
        />
        <p className="text-xs text-muted-foreground">At least 8 characters.</p>
      </div>
      <Button type="submit" className="w-full" disabled={isSignupPending} data-testid="button-submit-signup">
        {isSignupPending ? "Creating account..." : "Create account"}
      </Button>
    </form>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen w-full bg-background flex flex-col">
      <header className="h-16 flex items-center px-6 md:px-10 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center">
            <Wallet className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-semibold">M-PESA Business Loans</span>
        </div>
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

            <div className="space-y-4 max-w-md">
              {[
                {
                  icon: Clock,
                  title: "Fast decisions",
                  desc: "Our loan officers review applications quickly, with full visibility into where yours stands.",
                },
                {
                  icon: ShieldCheck,
                  title: "Secure by design",
                  desc: "Encrypted documents and full audit history for every account action.",
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

          <Card className="w-full max-w-md justify-self-center">
            <CardHeader>
              <CardTitle>Welcome</CardTitle>
              <CardDescription>Sign in to your account or create a new one to get started.</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="login">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="login" data-testid="tab-login">
                    Sign in
                  </TabsTrigger>
                  <TabsTrigger value="signup" data-testid="tab-signup">
                    Sign up
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="login" className="pt-4">
                  <LoginForm />
                </TabsContent>
                <TabsContent value="signup" className="pt-4">
                  <SignupForm />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </main>

      <footer className="text-center text-xs text-muted-foreground py-6 border-t border-border">
        M-PESA Business Loans — Phase 1 foundation
      </footer>
    </div>
  );
}
