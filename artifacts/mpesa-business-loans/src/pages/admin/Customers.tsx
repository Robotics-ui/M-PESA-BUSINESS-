import { useState } from "react";
import { Link } from "wouter";
import { useListCustomers, ListCustomersStatus } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { fullName, formatDate } from "@/lib/format";
import { Users, Search } from "lucide-react";

export default function Customers() {
  const [status, setStatus] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data: customers, isLoading } = useListCustomers({
    status: status === "all" ? undefined : (status as ListCustomersStatus),
  });

  const filtered = customers?.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      fullName(c.firstName, c.lastName).toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.phone?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center">
          <Users className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Customers</h1>
          <p className="text-muted-foreground text-sm">Search and manage customer accounts.</p>
        </div>
      </div>

      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, or phone"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search-customers"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40" data-testid="select-customer-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6">
              <Skeleton className="h-64 w-full" />
            </div>
          ) : !filtered || filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground p-6">No customers found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Phone verified</TableHead>
                  <TableHead>Profile</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id} className="cursor-pointer" data-testid={`row-customer-${c.id}`}>
                    <TableCell>
                      <Link href={`/admin/customers/${c.id}`}>
                        <a className="font-medium text-foreground hover:underline">{fullName(c.firstName, c.lastName)}</a>
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <div>{c.email ?? "—"}</div>
                      <div className="text-xs">{c.phone ?? "No phone"}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{c.phoneVerified ? "Verified" : "Unverified"}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{c.profileComplete ? "Complete" : "Incomplete"}</Badge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={c.accountStatus} />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{formatDate(c.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
