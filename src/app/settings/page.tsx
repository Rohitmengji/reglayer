"use client";

import { useState, useEffect } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Clock, Play, Pause } from "lucide-react";

interface Schedule {
  id: string;
  name: string;
  url: string;
  cron: string;
  enabled: boolean;
  createdAt: string;
  lastRunAt?: string;
  nextRunAt?: string;
}

export default function SettingsPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [cron, setCron] = useState("0 9 * * 1"); // Every Monday at 9am

  useEffect(() => {
    fetchSchedules();
  }, []);

  async function fetchSchedules() {
    const res = await fetch("/api/schedules");
    if (res.ok) {
      const data = await res.json();
      setSchedules(data.schedules);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, url, cron }),
    });
    if (res.ok) {
      setName("");
      setUrl("");
      setCron("0 9 * * 1");
      setShowForm(false);
      fetchSchedules();
    }
  }

  async function handleToggle(id: string) {
    await fetch("/api/schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle", id }),
    });
    fetchSchedules();
  }

  async function handleDelete(id: string) {
    await fetch("/api/schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    fetchSchedules();
  }

  async function handleTrigger() {
    await fetch("/api/schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "trigger" }),
    });
    fetchSchedules();
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">Settings</h1>
            <p className="mt-1 text-sm text-neutral-500">
              Configure scheduled scans and monitoring.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleTrigger}>
              <Play className="mr-2 h-3 w-3" />
              Run Due Scans
            </Button>
            <Button size="sm" onClick={() => setShowForm(!showForm)}>
              <Plus className="mr-2 h-3 w-3" />
              New Schedule
            </Button>
          </div>
        </div>

        {/* Create Form */}
        {showForm && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">New Scan Schedule</CardTitle>
              <CardDescription>
                Set up recurring accessibility scans.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreate} className="space-y-3">
                <Input
                  placeholder="Schedule name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
                <Input
                  type="url"
                  placeholder="https://example.com"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                />
                <div>
                  <Input
                    placeholder="Cron expression (e.g. 0 9 * * 1)"
                    value={cron}
                    onChange={(e) => setCron(e.target.value)}
                    required
                  />
                  <p className="mt-1 text-xs text-neutral-500">
                    Common: 0 9 * * 1 (Mon 9am) | 0 0 * * * (daily) | 0 */6 * * * (every 6h)
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" size="sm">Create</Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowForm(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Schedules List */}
        {schedules.length === 0 ? (
          <div className="rounded-lg border border-neutral-200 bg-white p-12 text-center">
            <Clock className="mx-auto h-8 w-8 text-neutral-300" />
            <p className="mt-3 text-sm text-neutral-500">
              No schedules configured. Create one to start monitoring.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {schedules.map((schedule) => (
              <Card key={schedule.id}>
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-neutral-900">
                        {schedule.name}
                      </p>
                      <Badge variant={schedule.enabled ? "success" : "secondary"}>
                        {schedule.enabled ? "Active" : "Paused"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-neutral-500">
                      {schedule.url} • <code>{schedule.cron}</code>
                    </p>
                    {schedule.nextRunAt && (
                      <p className="text-xs text-neutral-400">
                        Next: {new Date(schedule.nextRunAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleToggle(schedule.id)}
                    >
                      {schedule.enabled ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(schedule.id)}
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
