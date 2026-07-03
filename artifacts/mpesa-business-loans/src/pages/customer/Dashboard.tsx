import { Link } from "wouter";
import { useAuth } from "@workspace/replit-auth-web";
import {
  useGetMyProfile,
  useListMyLoanApplications,
  useListMyLoans,
  useListMyNotifications,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatDate } from "@/lib/format";
import { ArrowRight, Bell, FileText, UserCircle, Wallet } from "lucide-react";

export default function Dashboard() {
  const { user } = useAuth();
  const { data: profile, isLoading: profileLoading } = useGetMyProfile();
  const { data: applications, isLoading: appsLoading } = useListMyLoanApplications();
  const { data: loans, isLoading: loansLoading } = useListMyLoans();
  const { data: notifications } = useListMyNotifications();

  const completeness = profile
    ? [
        profile.phoneVerified,
        !!profile.dateOfBirth,
        !!profile.address,
        !!profile.nationalIdNumber,
        !!profile.idFrontUrl,
        !!profile.idBackUrl,
        !!profile.selfieUrl,
      ].filter(Boolean).length
    : 0;
  const completenessPct = Math.round((completeness / 7) * 100);

  const activeLoan = loans?.find((l) => l.status === "active" || l.status === "overdue");
  const latestApplication = applications?.[0];
  const unreadNotifications = notifications?.filter((n) => !n.read) ?? [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground" data-testid="text-welcome">
          Welcome back, {user?.firstName ?? "there"}
        </h1>
        <p className="text-muted-foreground mt-1">Here's where things stand with your account.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Profile completeness</CardTitle>
            <UserCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {profileLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <p className="text-2xl font-bold text-foreground" data-testid="text-profile-completeness">
                  {completenessPct}%
                </p>
                <Progress value={completenessPct} className="mt-3 h-2" />
                {!profile?.profileComplete && (
                  <Link href="/profile">
                    <a className="text-xs text-primary mt-2 inline-flex items-center gap-1 hover:underline">
                      Complete your profile <ArrowRight className="h-3 w-3" />
                    </a>
                  </Link>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active loan</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loansLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : activeLoan ? (
              <>
                <p className="text-2xl font-bold text-foreground" data-testid="text-active-loan-amount">
                  {formatCurrency(activeLoan.principal)}
                </p>
                <div className="mt-2">
                  <StatusBadge status={activeLoan.status} />
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No active loan right now.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Latest application</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {appsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : latestApplication ? (
              <>
                <p className="text-2xl font-bold text-foreground">{formatCurrency(latestApplication.amount)}</p>
                <div className="mt-2">
                  <StatusBadge status={latestApplication.status} />
                </div>
              </>
            ) : (
              <div>
                <p className="text-sm text-muted-foreground mb-2">No applications yet.</p>
                <Link href="/apply">
                  <Button size="sm" data-testid="button-apply-now">
                    Apply now
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="h-4 w-4" /> Latest notifications
          </CardTitle>
          <Link href="/notifications">
            <a className="text-sm text-primary hover:underline">View all</a>
          </Link>
        </CardHeader>
        <CardContent>
          {unreadNotifications.length === 0 ? (
            <p className="text-sm text-muted-foreground">You're all caught up.</p>
          ) : (
            <div className="space-y-3">
              {unreadNotifications.slice(0, 4).map((n) => (
                <div key={n.id} className="flex items-start justify-between gap-3 border-b border-border last:border-0 pb-3 last:pb-0">
                  <div>
                    <p className="text-sm font-medium text-foreground">{n.title}</p>
                    <p className="text-sm text-muted-foreground">{n.message}</p>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(n.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
