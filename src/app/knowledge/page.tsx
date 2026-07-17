"use client";

/**
 * RegLayer — Knowledge Base Page
 *
 * WHY: Users upload company docs (policies, templates, design system docs) so
 *      the AI can reference them in conversations. Makes the AI workspace-specific.
 * WHAT: Upload text content, view processing status, delete documents, see chunk counts.
 * HOW: POST /api/knowledge (text upload), GET (list), DELETE (remove).
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  FileText, Upload, Trash2, Loader2, CheckCircle2, AlertCircle,
  Clock, Plus, Search, BookOpen, X, File,
} from "lucide-react";
import { toast } from "sonner";
import { FeatureGate } from "@/components/ui/feature-gate";

interface KnowledgeDoc {
  id: string;
  title: string;
  source: string;
  mimeType: string;
  sizeBytes: number;
  status: "PROCESSING" | "READY" | "FAILED";
  chunkCount: number;
  errorMessage: string | null;
  createdAt: string;
}

const STATUS_CONFIG = {
  PROCESSING: { icon: Clock, color: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-950/30", label: "Processing" },
  READY: { icon: CheckCircle2, color: "text-green-500", bg: "bg-green-50 dark:bg-green-950/30", label: "Ready" },
  FAILED: { icon: AlertCircle, color: "text-red-500", bg: "bg-red-50 dark:bg-red-950/30", label: "Failed" },
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function KnowledgePageInner() {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [uploadMode, setUploadMode] = useState<"text" | "file">("file");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDocs = useCallback(async () => {
    try {
      const res = await fetch("/api/knowledge");
      if (res.ok) {
        const data = await res.json();
        setDocs(data.documents ?? []);
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch, setState after await
  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  // Poll for processing status updates
  useEffect(() => {
    const hasProcessing = docs.some((d) => d.status === "PROCESSING");
    if (!hasProcessing) return;
    const timer = setInterval(fetchDocs, 5000);
    return () => clearInterval(timer);
  }, [docs, fetchDocs]);

  const handleUpload = async () => {
    if (uploadMode === "file") {
      if (!selectedFile) return;
      setUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", selectedFile);
        if (title.trim()) formData.append("title", title.trim());
        const res = await fetch("/api/knowledge/upload", {
          method: "POST",
          body: formData,
        });
        if (res.ok) {
          toast.success("File uploaded — processing will take a few seconds");
          setSelectedFile(null);
          setTitle("");
          setShowUpload(false);
          fetchDocs();
        } else {
          const data = await res.json().catch(() => ({}));
          toast.error(data.error || "Upload failed");
        }
      } catch { toast.error("Network error"); }
      finally { setUploading(false); }
      return;
    }

    // Text mode
    if (!title.trim() || !content.trim()) return;
    setUploading(true);
    try {
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), content: content.trim() }),
      });
      if (res.ok) {
        toast.success("Document uploaded — processing will take a few seconds");
        setTitle("");
        setContent("");
        setShowUpload(false);
        fetchDocs();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Upload failed");
      }
    } catch { toast.error("Network error"); }
    finally { setUploading(false); }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/knowledge?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      setDocs((prev) => prev.filter((d) => d.id !== id));
      toast.success("Document deleted");
    } catch { toast.error("Delete failed"); }
  };

  const readyCount = docs.filter((d) => d.status === "READY").length;
  const totalChunks = docs.reduce((sum, d) => sum + d.chunkCount, 0);

  return (
    <AppShell>
      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                <BookOpen className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">Knowledge Base</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1 ml-11">
              Upload documents so the AI assistant can reference your company&apos;s policies, templates, and guidelines.
            </p>
          </div>
          <Button onClick={() => setShowUpload(!showUpload)}>
            <Plus className="h-4 w-4 mr-1" />
            Add Document
          </Button>
        </div>

        {/* Stats */}
        {docs.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold">{docs.length}</p>
                <p className="text-xs text-muted-foreground">Documents</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold">{readyCount}</p>
                <p className="text-xs text-muted-foreground">Indexed</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold">{totalChunks}</p>
                <p className="text-xs text-muted-foreground">Chunks</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Upload Form */}
        {showUpload && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Add Knowledge Document</CardTitle>
              <CardDescription>Upload a PDF file or paste text from your policies and documentation.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Mode Toggle */}
              <div className="flex gap-1 p-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg w-fit">
                <button
                  onClick={() => setUploadMode("file")}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${uploadMode === "file" ? "bg-white dark:bg-neutral-700 shadow-sm" : "text-muted-foreground"}`}
                >
                  <File className="h-3 w-3 inline mr-1" /> File Upload
                </button>
                <button
                  onClick={() => setUploadMode("text")}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${uploadMode === "text" ? "bg-white dark:bg-neutral-700 shadow-sm" : "text-muted-foreground"}`}
                >
                  <FileText className="h-3 w-3 inline mr-1" /> Paste Text
                </button>
              </div>

              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={uploadMode === "file" ? "Document title (optional — uses filename)" : "Document title — e.g., 'Company Accessibility Policy'"}
              />

              {uploadMode === "file" ? (
                <div
                  className="border-2 border-dashed border-neutral-300 dark:border-neutral-600 rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files[0];
                    if (file) setSelectedFile(file);
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.txt,.md,.csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) setSelectedFile(file);
                    }}
                  />
                  {selectedFile ? (
                    <div className="flex items-center justify-center gap-2">
                      <File className="h-5 w-5 text-blue-500" />
                      <span className="text-sm font-medium">{selectedFile.name}</span>
                      <Badge variant="secondary" className="text-[10px]">
                        {(selectedFile.size / 1024).toFixed(0)} KB
                      </Badge>
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
                        className="text-muted-foreground hover:text-red-500"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <Upload className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">
                        Drop a file here or click to browse
                      </p>
                      <p className="text-xs text-muted-foreground/60 mt-1">
                        PDF, TXT, MD, CSV — max 10MB
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Paste the document content here..."
                  className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3.5 py-2.5 text-sm min-h-[200px] resize-y focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
              )}

              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {uploadMode === "file"
                    ? selectedFile ? `${selectedFile.name} (${(selectedFile.size / 1024).toFixed(0)} KB)` : "Supports PDF, TXT, MD, CSV"
                    : content.length > 0 ? `${(content.length / 4).toFixed(0)} estimated tokens` : "Max 500K characters"
                  }
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setShowUpload(false)}>Cancel</Button>
                  <Button
                    size="sm"
                    onClick={handleUpload}
                    disabled={uploading || (uploadMode === "file" ? !selectedFile : !title.trim() || !content.trim())}
                  >
                    {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
                    Upload & Process
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Document List */}
        {loading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        ) : docs.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <BookOpen className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <h3 className="font-medium text-neutral-700 dark:text-neutral-300">No documents yet</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-md">
                Upload your company&apos;s accessibility policy, VPAT template, design system docs, or any reference material. The AI will use it to give workspace-specific answers.
              </p>
              <Button className="mt-4" onClick={() => setShowUpload(true)}>
                <Plus className="h-4 w-4 mr-1" /> Add Your First Document
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {docs.map((doc) => {
              const status = STATUS_CONFIG[doc.status];
              const Icon = status.icon;
              return (
                <Card key={doc.id} className="group">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className={`p-2 rounded-lg ${status.bg} shrink-0`}>
                          <FileText className={`h-4 w-4 ${status.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-medium text-neutral-800 dark:text-neutral-200 truncate">
                            {doc.title}
                          </h3>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span>{formatBytes(doc.sizeBytes)}</span>
                            {doc.chunkCount > 0 && <span>{doc.chunkCount} chunks</span>}
                            <Badge variant="outline" className={`text-[10px] ${status.color}`}>
                              <Icon className="h-2.5 w-2.5 mr-1" />
                              {status.label}
                            </Badge>
                          </div>
                          {doc.errorMessage && (
                            <p className="text-xs text-red-500 mt-1">{doc.errorMessage}</p>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 p-0 hover:text-red-500"
                        onClick={() => handleDelete(doc.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default function KnowledgePage() {
  return (
    <FeatureGate feature="knowledge">
      <KnowledgePageInner />
    </FeatureGate>
  );
}
