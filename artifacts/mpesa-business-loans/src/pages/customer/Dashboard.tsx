import { Link } from "wouter";
import { useAuth } from "@workspace/replit-auth-web";
import {
  useGetMyProfile,
  useListMyLoanApplications,
  useListMyLoans,
  useListMyNotifications,
  useListMyVirtualCards,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/format";
import { ArrowRight, Bell, CheckCircle2, Clock, CreditCard, FileText, UserCircle, Wallet, XCircle } from "lucide-react";

function LoanAmountCard({ profile }: { profile: { approvedLoanAmount: string; loanStatus: string } | null | undefined }) {
  const amount = Number(profile?.approvedLoanAmount ?? "0");
  const status = profile?.loanStatus ?? "active";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Approved loan limit</CardTitle>
        <Wallet className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {amount > 0 ? (
          <>
            <p className="text-2xl font-bold text-foreground" data-testid="text-approved-amount">
              {formatCurrency(amount.toString())}
            </p>
            <div className="mt-2">
              {status === "active" && (
                <Badge className="bg-green-100 text-green-700 border-green-200">Active</Badge>
              )}
              {status === "frozen" && (
                <Badge className="bg-blue-100 text-blue-700 border-blue-200">Frozen</Badge>
              )}
              {status === "rejected" && (
                <Badge className="bg-red-100 text-red-700 border-red-200">Rejected</Badge>
              )}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No loan limit set by admin yet.</p>
        )}
      </CardContent>
    </Card>
  );
}

function VirtualCardStatusCard({ cardStatus }: { cardStatus?: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Virtual card</CardTitle>
        <CreditCard className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {!cardStatus ? (
          <div>
            <p className="text-sm text-muted-foreground mb-2">No card submitted yet.</p>
            <Link href="/virtual-card">
              <Button size="sm" variant="outline" data-testid="button-add-card">
                Add card <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          </div>
        ) : cardStatus === "pending" ? (
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-yellow-500" />
            <div>
              <p className="text-sm font-medium">Pending approval</p>
              <p className="text-xs text-muted-foreground">Admin is reviewing your card</p>
            </div>
          </div>
        ) : cardStatus === "approved" ? (
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            <div>
              <p className="text-sm font-medium text-green-700">Card verified</p>
              <p className="text-xs text-muted-foreground">You're ready to withdraw</p>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <XCircle className="h-5 w-5 text-red-500" />
              <p className="text-sm font-medium text-red-700">Card rejected</p>
            </div>
            <Link href="/virtual-card">
              <Button size="sm" variant="outline" className="text-xs">
                Submit new card <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { data: profile, isLoading: profileLoading } = useGetMyProfile();
  const { data: applications, isLoading: appsLoading } = useListMyLoanApplications();
  const { data: loans, isLoading: loansLoading } = useListMyLoans();
  const { data: notifications } = useListMyNotifications();
  const { data: cards } = useListMyVirtualCards();

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
  const latestCard = cards?.[0];

  const approvedAmount = Number(profile?.approvedLoanAmount ?? "0");
  // Check *any* approved card, not just the most recent — backend searches all approved cards
  const cardApproved = cards?.some((c) => c.status === "approved") ?? false;
  const loanActive = profile?.loanStatus === "active";
  const canWithdraw = approvedAmount > 0 && cardApproved && loanActive;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground" data-testid="text-welcome">
          Welcome back, {user?.firstName ?? "there"}
        </h1>
        <p className="text-muted-foreground mt-1">Here's where things stand with your account.</p>
      </div>

      {/* Loan limit + card status + withdraw */}
      <Card className="border-2 border-primary/20 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="h-4 w-4" /> Loan & withdrawal status
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Approved amount</p>
            {profileLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : approvedAmount > 0 ? (
              <p className="text-2xl font-bold text-foreground">{formatCurrency(approvedAmount.toString())}</p>
            ) : (
              <p className="text-sm text-muted-foreground">Not set yet</p>
            )}
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Virtual card</p>
            {!latestCard ? (
              <Link href="/virtual-card">
                <Button size="sm" variant="outline" className="text-xs">
                  Add card <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </Link>
            ) : latestCard.status === "approved" ? (
              <div className="flex items-center gap-1 text-green-700 text-sm font-medium">
                <CheckCircle2 className="h-4 w-4" /> Verified
              </div>
            ) : latestCard.status === "pending" ? (
              <div className="flex items-center gap-1 text-yellow-700 text-sm font-medium">
                <Clock className="h-4 w-4" /> Pending review
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-1 text-red-700 text-sm font-medium mb-1">
                  <XCircle className="h-4 w-4" /> Rejected
                </div>
                <Link href="/virtual-card">
                  <Button size="sm" variant="outline" className="text-xs" data-testid="button-add-card-summary">
                    Add card <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </Link>
              </div>
            )}
          </div>
          <div className="flex items-end">
            {canWithdraw ? (
              <Link href="/withdraw" className="w-full">
                <Button className="w-full" data-testid="button-withdraw">
                  Withdraw loan
                </Button>
              </Link>
            ) : (
              <Button
                disabled
                className="w-full"
                data-testid="button-withdraw"
                title={
                  !loanActive
                    ? "Loan is not active"
                    : !cardApproved
                      ? "Virtual card not approved"
                      : "No approved loan amount"
                }
              >
                Withdraw loan
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {/* Profile completeness */}
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

        {/* Loan limit */}
        {profileLoading ? (
          <Card>
            <CardContent className="pt-6">
              <Skeleton className="h-8 w-24" />
            </CardContent>
          </Card>
        ) : (
          <LoanAmountCard profile={profile ?? null} />
        )}

        {/* Virtual card */}
        <VirtualCardStatusCard cardStatus={latestCard?.status} />
      </div>

      {/* Active loan */}
      {(activeLoan || loansLoading) && (
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
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* Latest application */}
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
              {latestApplication.status === "approved" && canWithdraw && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-green-700">
                    Your loan is approved and ready. Withdraw your funds now.
                  </p>
                  <Link href="/withdraw">
                    <Button size="sm" className="w-full" data-testid="button-withdraw-from-app">
                      Withdraw now <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </Link>
                </div>
              )}
              {latestApplication.status === "approved" && !canWithdraw && !cardApproved && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-yellow-700">
                    Loan approved — get your virtual card verified to unlock withdrawal.
                  </p>
                  <Link href="/virtual-card">
                    <Button size="sm" variant="outline" className="w-full text-xs">
                      Manage virtual card <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </Link>
                </div>
              )}
              {latestApplication.status === "rejected" && latestApplication.reviewNotes && (
                <p className="text-xs text-red-700 mt-2">Reason: {latestApplication.reviewNotes}</p>
              )}
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

      {/* Notifications */}
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
                <div
                  key={n.id}
                  className="flex items-start justify-between gap-3 border-b border-border last:border-0 pb-3 last:pb-0"
                >
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
