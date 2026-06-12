"use client";

/**
 * RegLayer — Screen Reader Simulation Page
 *
 * WHY: Developers need to understand how screen readers interpret their pages.
 * WHAT: Simulates screen reader output for a given URL (narration sequence, landmarks, headings).
 * HOW: Fetches /api/screen-reader with URL, renders narration output in sequential order.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/i18n-provider";
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Square,
  Volume2,
  VolumeX,
  Eye,
  Loader2,
  Landmark,
  Heading,
  MousePointer2,
  Layers,
} from "lucide-react";

interface NarrationStep {
  index: number;
  announcement: string;
  role: string;
  name: string;
  selector: string;
  bounds: { x: number; y: number; width: number; height: number } | null;
  level: number;
  isLandmark: boolean;
  isInteractive: boolean;
  states: string[];
}

interface ScreenReaderSnapshot {
  url: string;
  pageTitle: string;
  steps: NarrationStep[];
  totalElements: number;
  landmarks: number;
  headings: number;
  interactiveElements: number;
  capturedAt: string;
}

export default function ScreenReaderPage() {
  const { t } = useI18n();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [snapshot, setSnapshot] = useState<ScreenReaderSnapshot | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [speed, setSpeed] = useState(1);

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const playIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speakTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playStepRef = useRef<(stepIndex: number) => void>(() => {});
  const audioUnlockedRef = useRef(false);

  // Warm up speech synthesis — voices load async in most browsers
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    const loadVoices = () => { window.speechSynthesis.getVoices(); };
    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
    };
  }, []);

  // Stop playback on unmount — speechSynthesis is a global, so without this
  // narration keeps speaking (and queued timeouts keep firing) after the user
  // navigates away
  useEffect(() => {
    return () => {
      if (playIntervalRef.current) clearTimeout(playIntervalRef.current);
      if (speakTimeoutRef.current) clearTimeout(speakTimeoutRef.current);
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);
  const stepsContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll the step list to keep current step visible
  useEffect(() => {
    if (stepsContainerRef.current && snapshot) {
      const activeEl = stepsContainerRef.current.querySelector(`[data-step="${currentStep}"]`);
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
  }, [currentStep, snapshot]);

  const handleCapture = async () => {
    if (!url.trim()) return;

    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) {
      normalizedUrl = `https://${normalizedUrl}`;
    }

    setLoading(true);
    setError("");
    setSnapshot(null);
    setCurrentStep(0);
    setIsPlaying(false);

    try {
      const res = await fetch("/api/screen-reader", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: normalizedUrl }),
      });

      if (!res.ok) {
        let errorMsg = `Server error (${res.status})`;
        try {
          const data = await res.json();
          errorMsg = data.error || errorMsg;
        } catch {
          // Empty response body
        }
        throw new Error(errorMsg);
      }

      const data: ScreenReaderSnapshot = await res.json();
      setSnapshot(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const speak = useCallback(
    (text: string) => {
      if (typeof window === "undefined" || !window.speechSynthesis) return;
      if (isMuted) return;

      // Clear any pending speech timeout
      if (speakTimeoutRef.current) {
        clearTimeout(speakTimeoutRef.current);
        speakTimeoutRef.current = null;
      }

      // Cancel any ongoing speech
      window.speechSynthesis.cancel();

      // Delay after cancel — Chrome/Safari bug: speak() immediately after cancel() produces no audio
      speakTimeoutRef.current = setTimeout(() => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = speed;
        utterance.pitch = 1;
        utterance.volume = 1;
        utterance.lang = "en-US";

        // Select a local English voice if available (higher quality, lower latency)
        const voices = window.speechSynthesis.getVoices();
        const englishVoice = voices.find(
          (v) => v.lang.startsWith("en") && v.localService
        ) || voices.find((v) => v.lang.startsWith("en")) || voices[0];
        if (englishVoice) utterance.voice = englishVoice;

        utteranceRef.current = utterance;
        window.speechSynthesis.speak(utterance);

        // Chrome bug workaround: speech engine pauses after ~15s of continuous use
        const resumeInterval = setInterval(() => {
          if (!window.speechSynthesis.speaking) {
            clearInterval(resumeInterval);
          } else {
            window.speechSynthesis.pause();
            window.speechSynthesis.resume();
          }
        }, 10000);

        utterance.onend = () => clearInterval(resumeInterval);
        utterance.onerror = () => clearInterval(resumeInterval);
      }, 100);
    },
    [isMuted, speed]
  );

  const stopPlayback = useCallback(() => {
    setIsPlaying(false);
    if (playIntervalRef.current) {
      clearTimeout(playIntervalRef.current);
      playIntervalRef.current = null;
    }
    if (speakTimeoutRef.current) {
      clearTimeout(speakTimeoutRef.current);
      speakTimeoutRef.current = null;
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, []);

  const playStep = useCallback(
    (stepIndex: number) => {
      if (!snapshot || stepIndex >= snapshot.steps.length) {
        stopPlayback();
        return;
      }
      setCurrentStep(stepIndex);
      const step = snapshot.steps[stepIndex];
      speak(step.announcement);

      // Schedule next step
      const delay = Math.max(800, step.announcement.length * 50) / speed;
      playIntervalRef.current = setTimeout(() => {
        playStepRef.current(stepIndex + 1);
      }, delay);
    },
    [snapshot, speak, speed, stopPlayback]
  );

  // Keep ref in sync so recursive setTimeout calls use latest version
  useEffect(() => {
    playStepRef.current = playStep;
  }, [playStep]);

  const startPlayback = useCallback(() => {
    if (!snapshot) return;

    // Unlock audio on first user gesture — browsers require a speak() call
    // directly inside a click handler before async speech will work
    if (!audioUnlockedRef.current && window.speechSynthesis) {
      const unlock = new SpeechSynthesisUtterance("");
      unlock.volume = 0;
      window.speechSynthesis.speak(unlock);
      audioUnlockedRef.current = true;
    }

    setIsPlaying(true);
    playStep(currentStep);
  }, [snapshot, currentStep, playStep]);

  const togglePlayback = () => {
    if (isPlaying) {
      stopPlayback();
    } else {
      startPlayback();
    }
  };

  const goToStep = (index: number) => {
    if (!snapshot) return;
    const clamped = Math.max(0, Math.min(index, snapshot.steps.length - 1));
    setCurrentStep(clamped);
    stopPlayback();

    // Unlock audio on first user gesture
    if (!audioUnlockedRef.current && window.speechSynthesis) {
      const unlock = new SpeechSynthesisUtterance("");
      unlock.volume = 0;
      window.speechSynthesis.speak(unlock);
      audioUnlockedRef.current = true;
    }

    speak(snapshot.steps[clamped].announcement);
  };

  const currentStepData = snapshot?.steps[currentStep] || null;

  const getRoleBadgeColor = (role: string, isLandmark: boolean, isInteractive: boolean) => {
    if (isLandmark) return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300";
    if (isInteractive) return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
    if (role === "heading") return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
    return "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300";
  };

  return (
    <AppShell>
      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white flex items-center gap-2">
              <Eye className="h-6 w-6" />
              {t("screenReader.title")}
            </h1>
            <p className="text-neutral-600 dark:text-neutral-400 mt-1">
              {t("screenReader.subtitle")}
            </p>
          </div>

          {/* URL Input */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCapture()}
                  placeholder={t("screenReader.placeholder")}
                  className="flex-1 min-w-0 px-4 py-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <Button onClick={handleCapture} disabled={loading || !url.trim()} className="shrink-0">
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      {t("screenReader.capturing")}
                    </>
                  ) : (
                    t("screenReader.capture")
                  )}
                </Button>
              </div>
              {error && (
                <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
              )}
              <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-500">
                {t("screenReader.helpText")}
              </p>
            </CardContent>
          </Card>

          {/* Results */}
          {snapshot && (
            <>
              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card>
                  <CardContent className="pt-4 pb-4 flex items-center gap-3">
                    <Layers className="h-5 w-5 text-neutral-500" />
                    <div>
                      <p className="text-2xl font-bold text-neutral-900 dark:text-white">{snapshot.totalElements}</p>
                      <p className="text-xs text-neutral-500">{t("screenReader.totalElements")}</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-4 flex items-center gap-3">
                    <Landmark className="h-5 w-5 text-purple-500" />
                    <div>
                      <p className="text-2xl font-bold text-neutral-900 dark:text-white">{snapshot.landmarks}</p>
                      <p className="text-xs text-neutral-500">{t("screenReader.landmarks")}</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-4 flex items-center gap-3">
                    <Heading className="h-5 w-5 text-amber-500" />
                    <div>
                      <p className="text-2xl font-bold text-neutral-900 dark:text-white">{snapshot.headings}</p>
                      <p className="text-xs text-neutral-500">{t("screenReader.headings")}</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-4 flex items-center gap-3">
                    <MousePointer2 className="h-5 w-5 text-blue-500" />
                    <div>
                      <p className="text-2xl font-bold text-neutral-900 dark:text-white">{snapshot.interactiveElements}</p>
                      <p className="text-xs text-neutral-500">{t("screenReader.interactive")}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Playback Controls */}
              <Card>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-4">
                    {/* Transport controls */}
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => goToStep(currentStep - 1)}
                        disabled={currentStep === 0}
                      >
                        <SkipBack className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        onClick={togglePlayback}
                        className="w-10 h-10 rounded-full"
                      >
                        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => goToStep(currentStep + 1)}
                        disabled={currentStep >= snapshot.steps.length - 1}
                      >
                        <SkipForward className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={stopPlayback}>
                        <Square className="h-3 w-3" />
                      </Button>
                    </div>

                    {/* Progress */}
                    <div className="flex-1">
                      <div className="relative h-2 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                        <div
                          className="absolute top-0 left-0 h-full bg-blue-500 rounded-full transition-all duration-300"
                          style={{ width: `${((currentStep + 1) / snapshot.steps.length) * 100}%` }}
                        />
                      </div>
                      <p className="text-xs text-neutral-500 mt-1">
                        {t("screenReader.stepOf", { current: String(currentStep + 1), total: String(snapshot.steps.length) })}
                      </p>
                    </div>

                    {/* Speed */}
                    <div className="flex items-center gap-2">
                      <select
                        value={speed}
                        onChange={(e) => setSpeed(Number(e.target.value))}
                        className="text-xs rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1"
                      >
                        <option value={0.5}>0.5x</option>
                        <option value={0.75}>0.75x</option>
                        <option value={1}>1x</option>
                        <option value={1.5}>1.5x</option>
                        <option value={2}>2x</option>
                      </select>
                    </div>

                    {/* Mute */}
                    <Button size="sm" variant="ghost" onClick={() => setIsMuted(!isMuted)}>
                      {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                    </Button>
                  </div>

                  {/* Current announcement */}
                  {currentStepData && (
                    <div className="mt-4 p-4 rounded-lg bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700">
                      <p className="text-lg font-medium text-neutral-900 dark:text-white">
                        &ldquo;{currentStepData.announcement}&rdquo;
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge className={getRoleBadgeColor(currentStepData.role, currentStepData.isLandmark, currentStepData.isInteractive)}>
                          {currentStepData.role}
                        </Badge>
                        {currentStepData.states.map((state) => (
                          <Badge key={state} variant="outline" className="text-xs">
                            {state}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Step List */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t("screenReader.readingOrder")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div
                    ref={stepsContainerRef}
                    className="max-h-125 overflow-y-auto space-y-1"
                  >
                    {snapshot.steps.map((step) => (
                      <button
                        key={step.index}
                        data-step={step.index}
                        onClick={() => goToStep(step.index)}
                        className={`w-full text-left px-3 py-2 rounded-lg transition-colors flex items-start gap-3 ${
                          step.index === currentStep
                            ? "bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800"
                            : "hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                        }`}
                      >
                        <span className="text-xs text-neutral-500 dark:text-neutral-400 font-mono w-6 shrink-0 pt-0.5">
                          {step.index + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-sm truncate ${
                              step.index === currentStep
                                ? "text-blue-900 dark:text-blue-100 font-medium"
                                : "text-neutral-700 dark:text-neutral-300"
                            }`}
                          >
                            {step.announcement}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <Badge className={`text-[10px] px-1.5 py-0 ${getRoleBadgeColor(step.role, step.isLandmark, step.isInteractive)}`}>
                              {step.role}
                            </Badge>
                            {step.isLandmark && (
                              <Landmark className="h-3 w-3 text-purple-500" />
                            )}
                            {step.isInteractive && (
                              <MousePointer2 className="h-3 w-3 text-blue-500" />
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
