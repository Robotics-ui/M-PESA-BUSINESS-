import { useEffect, useRef, useState } from "react";
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
import { Settings as SettingsIcon, Plus, ShieldAlert, Wallet, Upload, ImageIcon, Video } from "lucide-react";

const DEFAULT_LOAN_LIMIT_KEY = "default_loan_limit";
const MAINTENANCE_MODE_KEY = "maintenance_mode";

// ── Media upload slot ────────────────────────────────────────────────────────

interface MediaSlotProps {
  settingKey: string;
  label: string;
  accept: string;
  currentUrl?: string;
  onSave: (key: string, value: string) => void;
  saving: boolean;
}

function MediaSlot({ settingKey, label, accept, currentUrl, onSave, saving }: MediaSlotProps) {
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const isVideo = accept.startsWith("video");
  const isLoading = uploading || saving;

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const urlRes = await fetch("/api/storage/uploads/request-public-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type || "application/octet-stream",
        }),
      });
      if (!urlRes.ok) {
        const err = await urlRes.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || "Failed to get upload URL");
      }
      const { uploadURL, publicPath } = (await urlRes.json()) as { uploadURL: string; publicPath: string };

      const putRes = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      if (!putRes.ok) throw new Error("Upload to storage failed");

      onSave(settingKey, `/api/storage/public-objects/${publicPath}`);
      toast({ title: `${label} uploaded` });
    } catch (err) {
      toast({ title: "Upload failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium text-foreground">{label}</Label>

      {currentUrl ? (
        <div className="rounded-lg overflow-hidden border border-border bg-muted h-32">
          {isVideo ? (
            <video src={currentUrl} className="h-full w-full object-cover" controls />
          ) : (
            <img src={currentUrl} alt={label} className="h-full w-full object-cover" />
          )}
        </div>
      ) : (
        <div className="rounded-lg border-2 border-dashed border-border bg-muted/40 h-32 flex flex-col items-center justify-center gap-1">
          {isVideo ? (
            <Video className="h-6 w-6 text-muted-foreground" />
          ) : (
            <ImageIcon className="h-6 w-6 text-muted-foreground" />
          )}
          <p className="text-xs text-muted-foreground">No {isVideo ? "video" : "image"} set</p>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={isLoading}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="h-3.5 w-3.5 mr-1.5" />
          {isLoading ? "Uploading…" : currentUrl ? "Replace" : "Upload"}
        </Button>
        {currentUrl && (
          <Button
            size="sm"
            variant="ghost"
            disabled={isLoading}
            className="text-destructive hover:text-destructive"
            onClick={() => onSave(settingKey, "")}
          >
            Remove
          </Button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="sr-only"
          onChange={handleFile}
          disabled={isLoading}
        />
      </div>
    </div>
  );
}

// ── Main settings page ───────────────────────────────────────────────────────

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

  // Media setting helpers
  const mediaSetting = (key: string) =>
    settings?.find((s: SystemSetting) => s.key === key)?.value || "";

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

  function handleMediaSave(key: string, value: string) {
    saveSetting({ data: { key, value } });
  }

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

      {/* Default loan limit */}
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

      {/* Maintenance mode */}
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

      {/* Landing page images */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4" /> Landing page images
          </CardTitle>
          <CardDescription>
            Upload up to three images shown in the gallery section of the public landing page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {(["media_landing_image_1", "media_landing_image_2", "media_landing_image_3"] as const).map(
                (key, i) => (
                  <MediaSlot
                    key={key}
                    settingKey={key}
                    label={`Image ${i + 1}`}
                    accept="image/*"
                    currentUrl={mediaSetting(key)}
                    onSave={handleMediaSave}
                    saving={isPending}
                  />
                ),
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dashboard media */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Video className="h-4 w-4" /> Dashboard media
          </CardTitle>
          <CardDescription>
            An image and video shown on the customer dashboard. Supports direct video files or YouTube links.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : (
            <div className="space-y-6">
              <MediaSlot
                settingKey="media_dashboard_image"
                label="Promo image"
                accept="image/*"
                currentUrl={mediaSetting("media_dashboard_image")}
                onSave={handleMediaSave}
                saving={isPending}
              />
              <div className="space-y-2">
                <MediaSlot
                  settingKey="media_dashboard_video"
                  label="Promo video (upload file)"
                  accept="video/*"
                  currentUrl={
                    mediaSetting("media_dashboard_video") &&
                    !mediaSetting("media_dashboard_video").includes("youtube") &&
                    !mediaSetting("media_dashboard_video").includes("youtu.be")
                      ? mediaSetting("media_dashboard_video")
                      : undefined
                  }
                  onSave={handleMediaSave}
                  saving={isPending}
                />
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs text-muted-foreground">
                    <span className="bg-card px-2">or paste a YouTube / video URL</span>
                  </div>
                </div>
                <div className="flex items-end gap-2">
                  <Input
                    placeholder="https://youtube.com/watch?v=... or https://..."
                    value={drafts["media_dashboard_video"] ?? mediaSetting("media_dashboard_video")}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, media_dashboard_video: e.target.value }))
                    }
                  />
                  <Button
                    size="sm"
                    disabled={isPending}
                    onClick={() =>
                      saveSetting({
                        data: {
                          key: "media_dashboard_video",
                          value: drafts["media_dashboard_video"] ?? mediaSetting("media_dashboard_video"),
                        },
                      })
                    }
                  >
                    Save
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Existing key/value settings */}
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
            settings
              .filter((s: SystemSetting) => !s.key.startsWith("media_"))
              .map((setting: SystemSetting) => (
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
                    onClick={() =>
                      saveSetting({ data: { key: setting.key, value: drafts[setting.key] ?? setting.value } })
                    }
                    data-testid={`button-save-setting-${setting.key}`}
                  >
                    Save
                  </Button>
                </div>
              ))
          )}
        </CardContent>
      </Card>

      {/* Add new setting */}
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
