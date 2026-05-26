"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Scan, Loader2 } from "lucide-react";
import { handleUpgradeResponse } from "@/lib/upgrade-prompt";

interface ScanFormProps {
  onScanComplete?: (result: unknown) => void;
}

export function ScanForm({ onScanComplete }: ScanFormProps) {
  const [url, setUrl] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsScanning(true);

    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) {
        const data = await response.json();
        if (handleUpgradeResponse(data)) {
          return;
        }
        throw new Error(data.message ?? "Scan failed");
      }

      const result = await response.json();
      onScanComplete?.(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsScanning(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scan className="h-5 w-5" />
          New Accessibility Scan
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
                Scanning...
              </>
            ) : (
              <>
                <Scan className="mr-2 h-4 w-4" />
                Scan
              </>
            )}
          </Button>
        </form>
        {error && (
          <p className="mt-3 text-sm text-red-600">{error}</p>
        )}
      </CardContent>
    </Card>
  );
}
