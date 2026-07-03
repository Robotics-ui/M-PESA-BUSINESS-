import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAllVirtualCards,
  getListAllVirtualCardsQueryKey,
  useDecideVirtualCard,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/format";
import { CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import type { VirtualCardWithCustomer } from "@workspace/api-client-react";

type DecisionStatus = "approved" | "rejected" | "request_new";

function StatusBadge({ status }: { status: string }) {
  if (status === "approved")
    return <Badge className="bg-green-100 text-green-700 border-green-200">Approved</Badge>;
  if (status === "rejected")
    return <Badge className="bg-red-100 text-red-700 border-red-200">Rejected</Badge>;
  return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">Pending</Badge>;
}

export default function VirtualCards() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [selected, setSelected] = useState<VirtualCardWithCustomer | null>(null);
  const [decisionStatus, setDecisionStatus] = useState<DecisionStatus>("approved");
  const [reason, setReason] = useState("");

  const { data: cards, isLoading } = useListAllVirtualCards(
    statusFilter === "all" ? undefined : { status: statusFilter as any },
  );

  const { mutate: decide, isPending } = useDecideVirtualCard({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAllVirtualCardsQueryKey() });
        toast({ title: "Decision saved" });
        setSelected(null);
        setReason("");
      },
      onError: () => toast({ title: "Failed to save decision", variant: "destructive" }),
    },
  });

  const openDecision = (card: VirtualCardWithCustomer, status: DecisionStatus) => {
    setSelected(card);
    setDecisionStatus(status);
    setReason("");
  };

  const confirm = () => {
    if (!selected) return;
    decide({ id: selected.id, data: { status: decisionStatus, rejectionReason: reason || undefined } });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Virtual cards</h1>
          <p className="text-muted-foreground mt-1">Review and approve customer withdrawal cards.</p>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="all">All cards</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : !cards || cards.length === 0 ? (
            <p className="text-sm text-muted-foreground px-6 py-8 text-center">
              No {statusFilter === "all" ? "" : statusFilter} cards found.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Card holder</TableHead>
                  <TableHead>Card number</TableHead>
                  <TableHead>Bank</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cards.map((card) => (
                  <TableRow key={card.id}>
                    <TableCell>
                      <p className="font-medium text-foreground">{card.customerName}</p>
                      <p className="text-xs text-muted-foreground">{card.customerEmail}</p>
                    </TableCell>
                    <TableCell>{card.cardHolderName}</TableCell>
                    <TableCell className="font-mono text-sm">{"•••• " + card.cardNumber.slice(-4)}</TableCell>
                    <TableCell className="text-muted-foreground">{card.bank ?? "—"}</TableCell>
                    <TableCell>
                      <StatusBadge status={card.status} />
                      {card.rejectionReason && (
                        <p className="text-xs text-muted-foreground mt-1">{card.rejectionReason}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{formatDate(card.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      {card.status === "pending" && (
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-green-700 border-green-200 hover:bg-green-50"
                            onClick={() => openDecision(card, "approved")}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-700 border-red-200 hover:bg-red-50"
                            onClick={() => openDecision(card, "rejected")}
                          >
                            <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openDecision(card, "request_new")}
                          >
                            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Request new
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decisionStatus === "approved"
                ? "Approve card"
                : decisionStatus === "rejected"
                  ? "Reject card"
                  : "Request new card"}
            </DialogTitle>
          </DialogHeader>

          {selected && (
            <div className="space-y-4">
              <div className="rounded-md border border-border p-3 text-sm space-y-1">
                <p>
                  <span className="text-muted-foreground">Customer: </span>
                  <span className="font-medium">{selected.customerName}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Card: </span>
                  <span className="font-mono">{"•••• " + selected.cardNumber.slice(-4)}</span> —{" "}
                  {selected.cardHolderName}
                </p>
              </div>

              {decisionStatus !== "approved" && (
                <div className="space-y-2">
                  <Label>
                    Reason{" "}
                    <span className="text-muted-foreground text-xs">(optional — sent to customer)</span>
                  </Label>
                  <Textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={
                      decisionStatus === "rejected"
                        ? "e.g. Card name does not match customer ID"
                        : "e.g. Please provide a debit card"
                    }
                    rows={3}
                  />
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>
              Cancel
            </Button>
            <Button
              onClick={confirm}
              disabled={isPending}
              variant={decisionStatus === "approved" ? "default" : "destructive"}
            >
              {isPending ? "Saving…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
