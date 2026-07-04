import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Tone = "green" | "amber" | "red" | "slate" | "blue";

const TONE_CLASSES: Record<Tone, string> = {
  green: "bg-primary/10 text-primary border-primary/20 dark:bg-primary/15",
  amber: "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-400",
  red: "bg-destructive/10 text-destructive border-destructive/20",
  slate: "bg-muted text-muted-foreground border-border",
  blue: "bg-blue-500/10 text-blue-700 border-blue-500/20 dark:text-blue-400",
};

const STATUS_MAP: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Pending", tone: "amber" },
  approved: { label: "Approved", tone: "green" },
  rejected: { label: "Rejected", tone: "red" },
  hold: { label: "On hold", tone: "blue" },
  active: { label: "Active", tone: "green" },
  repaid: { label: "Repaid", tone: "slate" },
  overdue: { label: "Overdue", tone: "red" },
  defaulted: { label: "Defaulted", tone: "red" },
  cancelled: { label: "Cancelled", tone: "slate" },
  paid: { label: "Paid", tone: "green" },
  suspended: { label: "Suspended", tone: "red" },
  sent: { label: "Sent", tone: "green" },
  failed: { label: "Failed", tone: "red" },
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const entry = STATUS_MAP[status] ?? { label: status, tone: "slate" as Tone };
  return (
    <Badge
      variant="outline"
      className={cn("capitalize font-medium", TONE_CLASSES[entry.tone], className)}
      data-testid={`status-badge-${status}`}
    >
      {entry.label}
    </Badge>
  );
}
