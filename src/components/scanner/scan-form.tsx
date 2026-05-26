"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Scan, Loader2 } from "lucide-react";
import { handleUpgradeResponse } from "@/lib/upgrade-prompt";
import { useI18n } from "@/components/i18n-provider";
import { toast } from "sonner";

interface ScanFormProps {
  onScanComplete?: (result: unknown) => void;
}

export function ScanForm({ onScanComplete }: ScanFormProps) {
  const [url, setUrl] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const { t } = useI18n();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsScanning(true);

    const toastId = toast.loading(`Scanning ${url}...`);

    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) {
        const data = await response.json();
        if (handleUpgradeResponse(data)) {
          toast.dismiss(toastId);
          return;
        }
        throw new Error(data.message ?? "Scan failed");
      }

      const result = await response.json();
      const score = result?.compliance?.score ?? result?.scan?.score;
      toast.success(
        score != null
          ? `Scan complete — compliance score: ${score}/100`
          : "Scan completed successfully",
        { id: toastId }
      );
      onScanComplete?.(result);
      setUrl("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "An error occurred";
      toast.error(message, { id: toastId });
    } finally {
      setIsScanning(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scan className="h-5 w-5" />
          {t("scanForm.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex gap-3">
          <Input
            type="url"
            placeholder="https://example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
            disabled={isScanning}
            className="flex-1"
          />
          <Button type="submit" disabled={isScanning || !url}>
            {isScanning ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("scanForm.scanning")}
              </>
            ) : (
              <>
                <Scan className="mr-2 h-4 w-4" />
                {t("scanForm.scan")}
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
