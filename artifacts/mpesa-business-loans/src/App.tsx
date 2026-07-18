import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@workspace/replit-auth-web";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/Landing";
import Suspended from "@/pages/Suspended";
import ChangePassword from "@/pages/ChangePassword";
import { AppShell } from "@/components/AppShell";

import CustomerDashboard from "@/pages/customer/Dashboard";
import CustomerProfile from "@/pages/customer/Profile";
import CustomerApply from "@/pages/customer/Apply";
import CustomerLoans from "@/pages/customer/Loans";
import CustomerLoanDetail from "@/pages/customer/LoanDetail";
import CustomerNotifications from "@/pages/customer/Notifications";
import CustomerVirtualCard from "@/pages/customer/VirtualCard";
import CustomerWithdraw from "@/pages/customer/Withdraw";
import CustomerViolations from "@/pages/customer/Violations";

import AdminDashboard from "@/pages/admin/Dashboard";
import AdminCustomers from "@/pages/admin/Customers";
import AdminCustomerDetail from "@/pages/admin/CustomerDetail";
import AdminLoans from "@/pages/admin/Loans";
import AdminAuditLogs from "@/pages/admin/AuditLogs";
import AdminSettings from "@/pages/admin/Settings";
import AdminVirtualCards from "@/pages/admin/VirtualCards";
import AdminWithdrawals from "@/pages/admin/Withdrawals";
import AdminNotifications from "@/pages/admin/Notifications";

const queryClient = new QueryClient();

function LoadingScreen() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );
}

function CustomerRoutes() {
  return (
    <AppShell>
      <Switch>
        <Route path="/dashboard" component={CustomerDashboard} />
        <Route path="/profile" component={CustomerProfile} />
        <Route path="/apply" component={CustomerApply} />
        <Route path="/loans" component={CustomerLoans} />
        <Route path="/loans/:id" component={CustomerLoanDetail} />
        <Route path="/notifications" component={CustomerNotifications} />
        <Route path="/virtual-card" component={CustomerVirtualCard} />
        <Route path="/withdraw" component={CustomerWithdraw} />
        <Route path="/violations" component={CustomerViolations} />
        <Route path="/">
          <Redirect to="/dashboard" />
        </Route>
        <Route component={NotFound} />
      </Switch>
    </AppShell>
  );
}

function StaffRoutes({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  return (
    <AppShell>
      <Switch>
        <Route path="/admin" component={AdminDashboard} />
        <Route path="/admin/customers" component={AdminCustomers} />
        <Route path="/admin/customers/:id" component={AdminCustomerDetail} />
        <Route path="/admin/loans" component={AdminLoans} />
        <Route path="/admin/virtual-cards" component={AdminVirtualCards} />
        <Route path="/admin/withdrawals" component={AdminWithdrawals} />
        <Route path="/admin/audit-logs" component={AdminAuditLogs} />
        <Route path="/admin/notifications" component={AdminNotifications} />
        {isSuperAdmin && <Route path="/admin/settings" component={AdminSettings} />}
        <Route path="/">
          <Redirect to="/admin" />
        </Route>
        <Route component={NotFound} />
      </Switch>
    </AppShell>
  );
}

function AppRoutes() {
  const { user, isLoading, isAuthenticated } = useAuth();

  if (isLoading) return <LoadingScreen />;

  if (!isAuthenticated || !user) {
    return (
      <Switch>
        <Route path="/" component={Landing} />
        <Route>
          <Redirect to="/" />
        </Route>
      </Switch>
    );
  }

  if (user.accountStatus === "suspended") {
    return <Suspended />;
  }

  if (user.mustChangePassword) {
    return <ChangePassword />;
  }

  if (user.role === "super_admin" || user.role === "loan_officer") {
    return <StaffRoutes isSuperAdmin={user.role === "super_admin"} />;
  }

  return <CustomerRoutes />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AppRoutes />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
