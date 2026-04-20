import { useState, useRef } from "react";
import { useGetLastSync, getGetInventoryStatsQueryKey, getListInventoryItemsQueryKey, getGetLowStockItemsQueryKey, getListTransactionsQueryKey, getListCategoriesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
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

export default function UploadExcel() {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: lastSync, refetch: refetchLastSync } = useGetLastSync();

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
      if (isValidExcelFile(file)) {
        processUpload(file);
      } else {
        toast({
          title: "Invalid file type",
          description: "Please upload a .xlsx or .xls file.",
          variant: "destructive"
        });
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (isValidExcelFile(file)) {
        processUpload(file);
      } else {
        toast({
          title: "Invalid file type",
          description: "Please upload a .xlsx or .xls file.",
          variant: "destructive"
        });
      }
      // Reset input so the same file can be selected again if needed
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
      
      const response = await fetch("/api/upload/excel", {
        method: "POST",
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error(`Server error: ${response.statusText}`);
      }
      
      const result: UploadResult = await response.json();
      setUploadResult(result);
      
      if (result.success) {
        // Invalidate all relevant queries to refresh data across the app
        queryClient.invalidateQueries({ queryKey: getGetInventoryStatsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListInventoryItemsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetLowStockItemsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
        refetchLastSync();
        
        toast({
          title: "Sync Complete",
          description: `Processed ${result.itemsProcessed} items successfully.`,
        });
      } else {
        toast({
          title: "Sync Failed",
          description: result.message,
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error("Upload error:", error);
      toast({
        title: "Upload Error",
        description: "An unexpected error occurred during upload.",
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Sync Inventory</h1>
        <p className="text-muted-foreground mt-1">Upload Excel spreadsheets to update the inventory registry.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2 border-border/40 shadow-sm">
          <CardHeader>
            <CardTitle>Upload Spreadsheet</CardTitle>
            <CardDescription>Drag and drop your .xlsx file here or click to browse.</CardDescription>
          </CardHeader>
          <CardContent>
            <div 
              className={`border-2 border-dashed rounded-xl p-12 text-center transition-all duration-200 ${
                isDragging ? "border-primary bg-primary/5 scale-[1.01]" : "border-border/60 hover:border-primary/50 hover:bg-muted/30"
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept=".xlsx,.xls" 
                className="hidden" 
              />
              
              <div className="flex flex-col items-center justify-center space-y-4">
                <div className={`p-4 rounded-full transition-colors duration-300 ${isDragging ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                  {isUploading ? (
                    <RefreshCw className="h-8 w-8 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="h-8 w-8" />
                  )}
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
                            {uploadResult.errors.map((err, i) => (
                              <li key={i}>{err}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Upload Failed</AlertTitle>
                    <AlertDescription className="mt-2">
                      <p>{uploadResult.message}</p>
                      {uploadResult.errors && uploadResult.errors.length > 0 && (
                        <ul className="mt-2 text-xs space-y-1 list-disc pl-4">
                          {uploadResult.errors.map((err, i) => (
                            <li key={i}>{err}</li>
                          ))}
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
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Last File</p>
              <p className="font-mono text-sm truncate" title={lastSync?.fileName || "—"}>
                {lastSync?.fileName || "—"}
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Items Processed</p>
              <p className="font-mono text-sm">
                {lastSync?.itemsProcessed ?? 0} rows
              </p>
            </div>
          </CardContent>
          <CardFooter className="bg-muted/20 border-t border-border/40 p-4">
            <div className="flex items-start space-x-3 text-xs text-muted-foreground">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <p>Uploading a new file will overwrite existing quantities and update item details based on SKU match.</p>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}