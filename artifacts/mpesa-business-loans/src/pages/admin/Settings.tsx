import { useEffect, useState } from "react";
import {
  useListSystemSettings,
  useUpdateSystemSetting,
  getListSystemSettingsQueryKey,
} from "@workspace/api-client-react";
import type { SystemSetting } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Settings as SettingsIcon, Plus, ShieldAlert, Wallet } from "lucide-react";

const DEFAULT_LOAN_LIMIT_KEY = "default_loan_limit";
const MAINTENANCE_MODE_KEY = "maintenance_mode";

export default function Settings() {
  const { data: settings, isLoading } = useListSystemSettings();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [defaultLoanLimitDraft, setDefaultLoanLimitDraft] = useState("");

  const defaultLoanLimitSetting = settings?.find((s: SystemSetting) => s.key === DEFAULT_LOAN_LIMIT_KEY);
  const maintenanceModeSetting = settings?.find((s: SystemSetting) => s.key === MAINTENANCE_MODE_KEY);
  const maintenanceModeOn = maintenanceModeSetting?.value === "true";

  useEffect(() => {
    if (defaultLoanLimitSetting && defaultLoanLimitDraft === "") {
      setDefaultLoanLimitDraft(defaultLoanLimitSetting.value);
    }
  }, [defaultLoanLimitSetting]);

  const { mutate: saveSetting, isPending } = useUpdateSystemSetting({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSystemSettingsQueryKey() });
        toast({ title: "Setting saved" });
      },
      onError: () => toast({ title: "Failed to save setting", variant: "destructive" }),
    },
  });

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center">
          <SettingsIcon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">System settings</h1>
          <p className="text-muted-foreground text-sm">Platform-wide configuration and key/value overrides.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-4 w-4" /> Default loan limit
          </CardTitle>
          <CardDescription>
            The default approved loan amount applied to new customers unless overridden individually.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-1">
              <Label className="text-xs text-muted-foreground">Amount (KES)</Label>
              <Input
                type="number"
                min={0}
                value={defaultLoanLimitDraft}
                onChange={(e) => setDefaultLoanLimitDraft(e.target.value)}
                data-testid="input-default-loan-limit"
              />
            </div>
            <Button
              disabled={isPending || !defaultLoanLimitDraft}
              onClick={() => saveSetting({ data: { key: DEFAULT_LOAN_LIMIT_KEY, value: defaultLoanLimitDraft } })}
              data-testid="button-save-default-loan-limit"
            >
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" /> Maintenance mode
          </CardTitle>
          <CardDescription>
            When enabled, customers see a maintenance notice and cannot submit new loan or card requests.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <p className="text-sm font-medium text-foreground">
                {maintenanceModeOn ? "Maintenance mode is ON" : "Maintenance mode is OFF"}
              </p>
              <p className="text-xs text-muted-foreground">Toggle to take the platform offline for customers.</p>
            </div>
            <Switch
              checked={maintenanceModeOn}
              disabled={isPending || isLoading}
              onCheckedChange={(checked) =>
                saveSetting({ data: { key: MAINTENANCE_MODE_KEY, value: checked ? "true" : "false" } })
              }
              data-testid="switch-maintenance-mode"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Existing settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : !settings || settings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No settings configured yet.</p>
          ) : (
            settings.map((setting: SystemSetting) => (
              <div key={setting.key} className="flex items-end gap-3" data-testid={`row-setting-${setting.key}`}>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs text-muted-foreground">{setting.key}</Label>
                  <Input
                    value={drafts[setting.key] ?? setting.value}
                    onChange={(e) => setDrafts((d) => ({ ...d, [setting.key]: e.target.value }))}
                  />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  onClick={() => saveSetting({ data: { key: setting.key, value: drafts[setting.key] ?? setting.value } })}
                  data-testid={`button-save-setting-${setting.key}`}
                >
                  Save
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add a new setting</CardTitle>
          <CardDescription>Introduce a new configuration key.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-1">
              <Label className="text-xs text-muted-foreground">Key</Label>
              <Input value={newKey} onChange={(e) => setNewKey(e.target.value)} data-testid="input-new-setting-key" />
            </div>
            <div className="flex-1 space-y-1">
              <Label className="text-xs text-muted-foreground">Value</Label>
              <Input value={newValue} onChange={(e) => setNewValue(e.target.value)} data-testid="input-new-setting-value" />
            </div>
            <Button
              disabled={isPending || !newKey || !newValue}
              onClick={() => {
                saveSetting({ data: { key: newKey, value: newValue } });
                setNewKey("");
                setNewValue("");
              }}
              data-testid="button-add-setting"
            >
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
