"use client";

import { AppShell } from "@/components/layout/app-shell";
import { useScanStore } from "@/stores/scanStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Trash2, ExternalLink, Clock } from "lucide-react";
import Link from "next/link";

export default function ScansPage() {
  const { scanHistory, deleteScan, clearHistory } = useScanStore();

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">Scan History</h1>
            <p className="mt-1 text-sm text-neutral-500">
              View and manage past accessibility scans.
            </p>
          </div>
          {scanHistory.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => clearHistory()}>
              <Trash2 className="mr-2 h-3 w-3" />
              Clear All
            </Button>
          )}
        </div>

        {scanHistory.length === 0 ? (
          <div className="rounded-lg border border-neutral-200 bg-white p-12 text-center">
            <p className="text-sm text-neutral-500">
              No scans recorded yet. Run your first scan from the Dashboard.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {scanHistory.map((entry) => (
              <Card key={entry.scan.id}>
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/scans/${entry.scan.id}`}
                        className="text-sm font-medium text-neutral-900 hover:underline truncate"
                      >
                        {entry.scan.metadata.pageTitle || entry.scan.url}
                      </Link>
                      <Badge
                        variant={
                          entry.scan.summary.score >= 90
                            ? "success"
                            : entry.scan.summary.score >= 70
                            ? "moderate"
                            : "critical"
                        }
                      >
                        {entry.scan.summary.score}/100
                      </Badge>
                    </div>
                    <div className="mt-1 flex items-center gap-4 text-xs text-neutral-500">
                      <span className="flex items-center gap-1">
                        <ExternalLink className="h-3 w-3" />
                        {entry.scan.url}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(entry.scan.timestamp).toLocaleString()}
                      </span>
                      <span>
                        {entry.scan.summary.totalViolations} violations
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <Link href={`/scans/${entry.scan.id}`}>
                      <Button variant="ghost" size="sm">
                        View
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteScan(entry.scan.id)}
                    >
                      <Trash2 className="h-4 w-4 text-neutral-400" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
