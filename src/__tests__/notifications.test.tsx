import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

vi.mock("next-auth/react", () => ({ useSession: () => ({ status: "authenticated", data: { user: { email: "test@example.test" } } }) }));
import { useNotifications } from "@/hooks/use-notifications";

let feed: { scope: string; items: Array<{ id: string; type: string; title: string; body: string; href: string; severity: string; createdAt: string }> };
const item = (id: string) => ({ id, type: "scan", title: id, body: "Example", href: "/scans/test", severity: "info", createdAt: "2026-09-01T00:00:00Z" });
const clients: QueryClient[] = [];
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { ...renderHook(() => useNotifications(), { wrapper }), client };
}
beforeEach(() => {
  localStorage.clear();
  feed = { scope: "user-1:workspace-1", items: [item("one"), item("two")] };
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => feed })));
});
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("marks loaded notifications read explicitly and preserves new arrivals even with old timestamps", async () => {
  const { result, client } = setup();
  await waitFor(() => expect(result.current.unreadCount).toBe(2));
  act(() => result.current.markAllSeen());
  expect(result.current.unreadCount).toBe(0);
  feed = { ...feed, items: [item("three"), ...feed.items] };
  await act(async () => { await client.invalidateQueries(); });
  await waitFor(() => expect(result.current.unreadCount).toBe(1));
});

it("does not carry read state into a different workspace", async () => {
  const { result, client } = setup();
  await waitFor(() => expect(result.current.unreadCount).toBe(2));
  act(() => result.current.markAllSeen());
  feed = { ...feed, scope: "user-1:workspace-2" };
  await act(async () => { await client.invalidateQueries(); });
  await waitFor(() => expect(result.current.unreadCount).toBe(2));
});

it("synchronizes read changes between hook consumers", async () => {
  const first = setup();
  const second = setup();
  await waitFor(() => expect(first.result.current.unreadCount).toBe(2));
  await waitFor(() => expect(second.result.current.unreadCount).toBe(2));
  act(() => first.result.current.markAllSeen());
  await waitFor(() => expect(second.result.current.unreadCount).toBe(0));
});

it("distinguishes a failed feed from an empty inbox", async () => {
  vi.mocked(fetch).mockResolvedValue({ ok: false, status: 503 } as Response);
  const { result } = setup();
  await waitFor(() => expect(result.current.error).toBe(true));
  expect(result.current.loading).toBe(false);
});

it("marks an individual item read without clearing the others", async () => {
  const { result } = setup();
  await waitFor(() => expect(result.current.unreadCount).toBe(2));
  act(() => result.current.markSeen(result.current.items[0]));
  expect(result.current.unreadCount).toBe(1);
});

it("updates from another tab's storage event", async () => {
  const { result } = setup();
  await waitFor(() => expect(result.current.unreadCount).toBe(2));
  act(() => result.current.markSeen(result.current.items[0]));
  const key = Object.keys(localStorage).find(key => key.startsWith("reglayer-notifications-read:v2:"))!;
  act(() => {
    localStorage.setItem(key, JSON.stringify(["one", "two"]));
    const event = new Event("storage");
    Object.defineProperty(event, "key", { value: key });
    window.dispatchEvent(event);
  });
  expect(result.current.unreadCount).toBe(0);
});

it("keeps the panel usable if browser storage rejects writes", async () => {
  feed = { ...feed, scope: "storage-blocked" };
  const { result } = setup();
  await waitFor(() => expect(result.current.unreadCount).toBe(2));
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Storage blocked"); });
  act(() => result.current.markAllSeen());
  expect(result.current.unreadCount).toBe(0);
  expect(result.current.storageError).toBe(true);
});