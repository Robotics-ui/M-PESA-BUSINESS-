import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@workspace/replit-auth-web";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { initials, fullName } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  UserCircle,
  FileText,
  Wallet,
  Bell,
  Users,
  ClipboardList,
  ScrollText,
  Settings,
  LogOut,
  CreditCard,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
}

const CUSTOMER_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/apply", label: "Apply for a loan", icon: FileText },
  { href: "/loans", label: "My loans", icon: Wallet },
  { href: "/virtual-card", label: "Virtual card", icon: CreditCard },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/profile", label: "Profile", icon: UserCircle },
];

const STAFF_NAV: NavItem[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/customers", label: "Customers", icon: Users },
  { href: "/admin/loans", label: "Loan applications", icon: ClipboardList },
  { href: "/admin/virtual-cards", label: "Virtual cards", icon: CreditCard },
  { href: "/admin/audit-logs", label: "Audit logs", icon: ScrollText },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();

  const isStaff = user?.role === "super_admin" || user?.role === "loan_officer";
  const navItems = isStaff ? STAFF_NAV : CUSTOMER_NAV;
  const showSettings = user?.role === "super_admin";

  return (
    <div className="min-h-screen w-full flex bg-background">
      <aside className="hidden md:flex md:w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shrink-0">
        <div className="h-16 flex items-center gap-2 px-5 border-b border-sidebar-border">
          <div className="h-8 w-8 rounded-md bg-sidebar-primary flex items-center justify-center">
            <Wallet className="h-4 w-4 text-sidebar-primary-foreground" />
          </div>
          <div className="leading-tight">
            <p className="font-semibold text-sm">M-PESA Business</p>
            <p className="text-xs text-muted-foreground">Loans</p>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const active = location === item.href;
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}>
                <a
                  data-testid={`link-nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </a>
              </Link>
            );
          })}
          {showSettings && (
            <Link href="/admin/settings">
              <a
                data-testid="link-nav-settings"
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  location === "/admin/settings"
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <Settings className="h-4 w-4" />
                Settings
              </a>
            </Link>
          )}
        </nav>

        <Separator className="bg-sidebar-border" />
        <div className="p-4 flex items-center gap-3">
          <Avatar className="h-9 w-9">
            <AvatarImage src={user?.profileImageUrl ?? undefined} />
            <AvatarFallback>{initials(user?.firstName, user?.lastName)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{fullName(user?.firstName, user?.lastName)}</p>
            <p className="text-xs text-muted-foreground capitalize truncate">{user?.role?.replace("_", " ")}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={logout}
            title="Sign out"
            data-testid="button-logout"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden h-14 border-b border-border flex items-center justify-between px-4 bg-background">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center">
              <Wallet className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span className="font-semibold text-sm">M-PESA Business Loans</span>
          </div>
          <Button variant="ghost" size="icon" onClick={logout} data-testid="button-logout-mobile">
            <LogOut className="h-4 w-4" />
          </Button>
        </header>
        <nav className="md:hidden flex overflow-x-auto border-b border-border bg-background px-2">
          {[...navItems, ...(showSettings ? [{ href: "/admin/settings", label: "Settings", icon: Settings }] : [])].map(
            (item) => {
              const active = location === item.href;
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href}>
                  <a
                    className={cn(
                      "flex flex-col items-center gap-1 px-3 py-2 text-xs whitespace-nowrap border-b-2",
                      active ? "border-primary text-primary" : "border-transparent text-muted-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </a>
                </Link>
              );
            },
          )}
        </nav>
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-6xl p-4 md:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
