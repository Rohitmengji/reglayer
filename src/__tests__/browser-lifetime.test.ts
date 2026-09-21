import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ launch: vi.fn() }));
vi.mock("@/lib/scanner/browser/launch", () => ({ launchBrowser: mocks.launch }));
import { createBrowserLifetime } from "@/lib/scanner/browser/lifetime";

beforeEach(() => { vi.resetAllMocks(); });

it("does not launch when already aborted", async () => {
  const controller = new AbortController();
  controller.abort();
  const lifetime = createBrowserLifetime(controller.signal);
  await expect(lifetime.launch()).rejects.toThrow();
  expect(mocks.launch).not.toHaveBeenCalled();
  await lifetime.dispose();
});

it("closes an active browser on abort and does not close it twice", async () => {
  const controller = new AbortController();
  const close = vi.fn(async () => {});
  mocks.launch.mockResolvedValue({ close });
  const lifetime = createBrowserLifetime(controller.signal);
  await lifetime.launch();
  controller.abort();
  await lifetime.dispose();
  await lifetime.dispose();
  expect(close).toHaveBeenCalledOnce();
});

it("closes a browser whose launch completes after cancellation", async () => {
  const controller = new AbortController();
  let launched!: (value: { close: () => Promise<void> }) => void;
  mocks.launch.mockReturnValue(new Promise(resolve => { launched = resolve; }));
  const lifetime = createBrowserLifetime(controller.signal);
  const pending = lifetime.launch();
  controller.abort();
  const close = vi.fn(async () => {});
  launched({ close });
  await expect(pending).rejects.toThrow();
  expect(close).toHaveBeenCalledOnce();
  await lifetime.dispose();
});

it("cleans up on normal completion and removes its abort listener", async () => {
  const controller = new AbortController();
  const remove = vi.spyOn(controller.signal, "removeEventListener");
  const close = vi.fn(async () => {});
  mocks.launch.mockResolvedValue({ close });
  const lifetime = createBrowserLifetime(controller.signal);
  await lifetime.launch();
  await lifetime.dispose();
  expect(close).toHaveBeenCalledOnce();
  expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
  await expect(lifetime.launch()).rejects.toThrow("closed");
});

it("does not let a close failure mask cancellation or escape as an unhandled rejection", async () => {
  const controller = new AbortController();
  mocks.launch.mockResolvedValue({ close: vi.fn().mockRejectedValue(new Error("Already closed")) });
  const lifetime = createBrowserLifetime(controller.signal);
  await lifetime.launch();
  controller.abort();
  await expect(lifetime.dispose()).resolves.toBeUndefined();
});