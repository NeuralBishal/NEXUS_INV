import { useState, useRef, useEffect, useCallback } from "react";
import { useGetLastSync, getGetInventoryStatsQueryKey, getListInventoryItemsQueryKey, getGetLowStockItemsQueryKey, getListTransactionsQueryKey, getListCategoriesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, RefreshCw, AlertTriangle, Link as LinkIcon, Cloud, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface UploadResult {
  success: boolean;
  message: string;
  itemsProcessed: number;
  itemsAdded: number;
  itemsUpdated: number;
  itemsRemoved: number;
  errors: string[];
  syncedAt: string;
}

const SHEET_URL_KEY = "inv_sheet_url";
const AUTO_SYNC_KEY = "inv_auto_sync";
const AUTO_SYNC_INTERVAL_KEY = "inv_auto_sync_interval";

export default function UploadExcel() {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSyncingUrl, setIsSyncingUrl] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [sheetUrl, setSheetUrl] = useState<string>(() => localStorage.getItem(SHEET_URL_KEY) || "");
  const [savedUrl, setSavedUrl] = useState<string>(() => localStorage.getItem(SHEET_URL_KEY) || "");
  const [autoSync, setAutoSync] = useState<boolean>(() => localStorage.getItem(AUTO_SYNC_KEY) === "1");
  const [autoSyncMinutes, setAutoSyncMinutes] = useState<string>(() => localStorage.getItem(AUTO_SYNC_INTERVAL_KEY) || "15");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: lastSync, refetch: refetchLastSync } = useGetLastSync();

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getGetInventoryStatsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListInventoryItemsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetLowStockItemsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
    refetchLastSync();
  }, [queryClient, refetchLastSync]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (isValidExcelFile(file)) processUpload(file);
      else toast({ title: "Invalid file type", description: "Please upload a .xlsx or .xls file.", variant: "destructive" });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (isValidExcelFile(file)) processUpload(file);
      else toast({ title: "Invalid file type", description: "Please upload a .xlsx or .xls file.", variant: "destructive" });
      e.target.value = "";
    }
  };

  const isValidExcelFile = (file: File) => {
    const validTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel"
    ];
    return validTypes.includes(file.type) || file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
  };

  const processUpload = async (file: File) => {
    setIsUploading(true);
    setUploadResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/upload/excel", { method: "POST", body: formData });
      if (!response.ok && response.status !== 400) throw new Error(`Server error: ${response.statusText}`);
      const result: UploadResult = await response.json();
      setUploadResult(result);
      if (result.success) {
        invalidateAll();
        toast({ title: "Sync Complete", description: `Processed ${result.itemsProcessed} items successfully.` });
      } else {
        toast({ title: "Sync Failed", description: result.message, variant: "destructive" });
      }
    } catch (error) {
      console.error("Upload error:", error);
      toast({ title: "Upload Error", description: "An unexpected error occurred during upload.", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const syncFromGoogleSheet = useCallback(async (silent = false) => {
    const url = localStorage.getItem(SHEET_URL_KEY);
    if (!url) return;
    setIsSyncingUrl(true);
    if (!silent) setUploadResult(null);
    try {
      const response = await fetch("/api/upload/google-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const result: UploadResult = await response.json();
      if (!silent) setUploadResult(result);
      if (result.success) {
        invalidateAll();
        if (!silent) {
          toast({ title: "Synced from Google Sheet", description: `Processed ${result.itemsProcessed} items.` });
        }
      } else {
        if (!silent) {
          toast({ title: "Sync Failed", description: result.message, variant: "destructive" });
        }
      }
    } catch (error) {
      console.error("Google Sheet sync error:", error);
      if (!silent) {
        toast({ title: "Sync Error", description: "Could not reach the server.", variant: "destructive" });
      }
    } finally {
      setIsSyncingUrl(false);
    }
  }, [invalidateAll, toast]);

  const handleSaveUrl = () => {
    const trimmed = sheetUrl.trim();
    if (!trimmed) {
      localStorage.removeItem(SHEET_URL_KEY);
      setSavedUrl("");
      toast({ title: "Cleared", description: "Google Sheet link removed." });
      return;
    }
    if (!trimmed.includes("docs.google.com/spreadsheets/d/")) {
      toast({
        title: "Invalid Google Sheets link",
        description: "Paste the URL from your browser address bar while viewing the sheet.",
        variant: "destructive",
      });
      return;
    }
    localStorage.setItem(SHEET_URL_KEY, trimmed);
    setSavedUrl(trimmed);
    toast({ title: "Saved", description: "Google Sheet link saved. You can now sync." });
  };

  const handleAutoSyncToggle = (checked: boolean) => {
    setAutoSync(checked);
    localStorage.setItem(AUTO_SYNC_KEY, checked ? "1" : "0");
  };

  const handleIntervalChange = (val: string) => {
    setAutoSyncMinutes(val);
    localStorage.setItem(AUTO_SYNC_INTERVAL_KEY, val);
  };

  // Auto-sync interval
  useEffect(() => {
    if (!autoSync || !savedUrl) return;
    const minutes = parseInt(autoSyncMinutes, 10) || 15;
    const intervalMs = minutes * 60 * 1000;
    const timer = setInterval(() => {
      syncFromGoogleSheet(true);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [autoSync, savedUrl, autoSyncMinutes, syncFromGoogleSheet]);

  const isBusy = isUploading || isSyncingUrl;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Sync Inventory</h1>
        <p className="text-muted-foreground mt-1">Upload an Excel file or sync directly from a Google Sheet.</p>
      </div>

      {/* Google Sheets section */}
      <Card className="border-border/40 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Cloud className="h-5 w-5 text-primary" />
                Auto-Sync from Google Sheets
              </CardTitle>
              <CardDescription className="mt-1">
                Paste a public Google Sheets link. Make sure sharing is set to "Anyone with the link can view".
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="sheet-url">Google Sheets URL</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="sheet-url"
                  type="url"
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                  className="pl-9 font-mono text-sm"
                />
              </div>
              <Button onClick={handleSaveUrl} variant="outline">
                <Save className="h-4 w-4 mr-2" />
                Save
              </Button>
              <Button
                onClick={() => syncFromGoogleSheet(false)}
                disabled={!savedUrl || isBusy}
              >
                {isSyncingUrl ? (
                  <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Syncing...</>
                ) : (
                  <><RefreshCw className="h-4 w-4 mr-2" />Sync Now</>
                )}
              </Button>
            </div>
            {savedUrl && (
              <p className="text-xs text-muted-foreground font-mono truncate" title={savedUrl}>
                Saved: {savedUrl}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border border-border/40 bg-muted/20">
            <div className="space-y-0.5">
              <Label htmlFor="auto-sync" className="text-sm font-medium">Auto-sync</Label>
              <p className="text-xs text-muted-foreground">
                Pull fresh data automatically on a schedule
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Select value={autoSyncMinutes} onValueChange={handleIntervalChange} disabled={!autoSync}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">Every 5 min</SelectItem>
                  <SelectItem value="15">Every 15 min</SelectItem>
                  <SelectItem value="30">Every 30 min</SelectItem>
                  <SelectItem value="60">Every hour</SelectItem>
                  <SelectItem value="360">Every 6 hours</SelectItem>
                </SelectContent>
              </Select>
              <Switch id="auto-sync" checked={autoSync} onCheckedChange={handleAutoSyncToggle} disabled={!savedUrl} />
            </div>
          </div>

          <div className="text-xs text-muted-foreground bg-muted/30 border border-border/40 rounded-lg p-3 space-y-1">
            <p className="font-medium text-foreground">How to share your sheet:</p>
            <ol className="list-decimal pl-5 space-y-0.5">
              <li>Open your sheet in Google Sheets</li>
              <li>Click <span className="font-mono">Share</span> → <span className="font-mono">General access</span> → <span className="font-mono">Anyone with the link</span></li>
              <li>Copy the URL from your browser and paste it above</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      {/* File upload section */}
      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2 border-border/40 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" />
              Upload Excel File
            </CardTitle>
            <CardDescription>Drag and drop your .xlsx file here or click to browse.</CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className={`border-2 border-dashed rounded-xl p-12 text-center transition-all duration-200 cursor-pointer ${
                isDragging ? "border-primary bg-primary/5 scale-[1.01]" : "border-border/60 hover:border-primary/50 hover:bg-muted/30"
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".xlsx,.xls" className="hidden" />
              <div className="flex flex-col items-center justify-center space-y-4">
                <div className={`p-4 rounded-full transition-colors duration-300 ${isDragging ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                  {isUploading ? <RefreshCw className="h-8 w-8 animate-spin" /> : <FileSpreadsheet className="h-8 w-8" />}
                </div>
                {isUploading ? (
                  <div>
                    <h3 className="font-semibold text-lg">Processing File...</h3>
                    <p className="text-sm text-muted-foreground mt-1">This may take a moment.</p>
                  </div>
                ) : (
                  <div>
                    <h3 className="font-semibold text-lg">Click or drag file to upload</h3>
                    <p className="text-sm text-muted-foreground mt-1">Supports .xlsx and .xls formats</p>
                  </div>
                )}
              </div>
            </div>

            {uploadResult && (
              <div className="mt-6 animate-in slide-in-from-bottom-4 duration-300">
                {uploadResult.success ? (
                  <Alert className="border-emerald-500/30 bg-emerald-500/5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    <AlertTitle className="text-emerald-700 dark:text-emerald-400">Sync Successful</AlertTitle>
                    <AlertDescription className="text-emerald-600/90 dark:text-emerald-500/90 mt-2">
                      <div className="grid grid-cols-4 gap-2 text-center text-sm font-mono mt-3 mb-1">
                        <div className="bg-background/50 rounded p-2 border border-border/20">
                          <div className="text-xs text-muted-foreground mb-1 font-sans">Processed</div>
                          <div className="font-bold text-foreground">{uploadResult.itemsProcessed}</div>
                        </div>
                        <div className="bg-background/50 rounded p-2 border border-border/20">
                          <div className="text-xs text-muted-foreground mb-1 font-sans">Added</div>
                          <div className="font-bold text-emerald-500">+{uploadResult.itemsAdded}</div>
                        </div>
                        <div className="bg-background/50 rounded p-2 border border-border/20">
                          <div className="text-xs text-muted-foreground mb-1 font-sans">Updated</div>
                          <div className="font-bold text-blue-500">{uploadResult.itemsUpdated}</div>
                        </div>
                        <div className="bg-background/50 rounded p-2 border border-border/20">
                          <div className="text-xs text-muted-foreground mb-1 font-sans">Removed</div>
                          <div className="font-bold text-destructive">-{uploadResult.itemsRemoved}</div>
                        </div>
                      </div>
                      {uploadResult.errors && uploadResult.errors.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-emerald-500/20">
                          <p className="text-xs font-semibold mb-2 flex items-center">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Warnings ({uploadResult.errors.length})
                          </p>
                          <ul className="text-xs space-y-1 max-h-32 overflow-y-auto pl-4 list-disc">
                            {uploadResult.errors.map((err, i) => <li key={i}>{err}</li>)}
                          </ul>
                        </div>
                      )}
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Sync Failed</AlertTitle>
                    <AlertDescription className="mt-2">
                      <p>{uploadResult.message}</p>
                      {uploadResult.errors && uploadResult.errors.length > 0 && (
                        <ul className="mt-2 text-xs space-y-1 list-disc pl-4">
                          {uploadResult.errors.map((err, i) => <li key={i}>{err}</li>)}
                        </ul>
                      )}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/40 shadow-sm flex flex-col">
          <CardHeader>
            <CardTitle className="text-lg">System Status</CardTitle>
            <CardDescription>Last synchronization details</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 space-y-6">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Last Sync Time</p>
              <p className="font-mono text-sm">
                {lastSync?.syncedAt ? format(new Date(lastSync.syncedAt), "MMM d, yyyy HH:mm:ss") : "Never"}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Last Source</p>
              <p className="font-mono text-sm truncate" title={lastSync?.fileName || "—"}>
                {lastSync?.fileName || "—"}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Items Processed</p>
              <p className="font-mono text-sm">{lastSync?.itemsProcessed ?? 0} rows</p>
            </div>
            {autoSync && savedUrl && (
              <div className="space-y-1 pt-2 border-t border-border/40">
                <p className="text-xs text-emerald-500 uppercase tracking-wider font-semibold flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  Auto-Sync Active
                </p>
                <p className="text-xs text-muted-foreground">Every {autoSyncMinutes} minutes</p>
              </div>
            )}
          </CardContent>
          <CardFooter className="bg-muted/20 border-t border-border/40 p-4">
            <div className="flex items-start space-x-3 text-xs text-muted-foreground">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <p>Items are matched by SKU or name — re-syncing updates existing items rather than duplicating them.</p>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
