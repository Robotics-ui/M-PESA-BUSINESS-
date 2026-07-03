import { useGetAdminDashboardStats } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { Users, Wallet, FileClock, TrendingUp, AlertTriangle, ScrollText } from "lucide-react";

export default function AdminDashboard() {
  const { data: stats, isLoading } = useGetAdminDashboardStats();

  const cards = stats
    ? [
        { label: "Total customers", value: stats.totalCustomers, icon: Users },
        { label: "Active loans", value: stats.activeLoans, icon: Wallet },
        { label: "Pending applications", value: stats.pendingApplications, icon: FileClock },
        { label: "Total disbursed", value: formatCurrency(stats.totalDisbursed), icon: TrendingUp },
        { label: "Total outstanding", value: formatCurrency(stats.totalOutstanding), icon: TrendingUp },
        { label: "Overdue repayments", value: stats.overdueRepayments, icon: AlertTriangle },
      ]
    : [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Operations overview</h1>
        <p className="text-muted-foreground mt-1">A snapshot of the loan book right now.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)
          : cards.map((card) => (
              <Card key={card.label} data-testid={`card-stat-${card.label.toLowerCase().replace(/\s+/g, "-")}`}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{card.label}</CardTitle>
                  <card.icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-foreground">{card.value}</p>
                </CardContent>
              </Card>
            ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ScrollText className="h-4 w-4" /> Recent activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : !stats || stats.recentActivity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent activity.</p>
          ) : (
            <div className="space-y-3">
              {stats.recentActivity.map((log) => (
                <div key={log.id} className="flex items-start justify-between gap-3 border-b border-border last:border-0 pb-3 last:pb-0">
                  <div>
                    <p className="text-sm font-medium text-foreground capitalize">{log.action.replace(/_/g, " ")}</p>
                    <p className="text-sm text-muted-foreground">
                      {log.entityType}
                      {log.details ? ` — ${log.details}` : ""}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(log.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
