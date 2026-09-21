import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FeaturesProvider, invalidateFeatureCache, useFeatures } from "@/hooks/use-features";

const session = vi.hoisted(() => ({ current: { data: { user: { email: "first@example.test", isMasterAdmin: false } }, status: "authenticated" } }));
vi.mock("next-auth/react", () => ({ useSession: () => session.current }));

const request = vi.fn();
let client: QueryClient;

function Consumers() {
  return <>{["navigation", "form", "gate"].map(name => <Consumer key={name} name={name} />)}</>;
}

function Consumer({ name }: { name: string }) {
  const access = useFeatures();
  return <section aria-label={name}>
    <span>{access.accessLoading ? "checking" : access.accessError ? "failed" : access.canRunScans ? "allowed" : "denied"}</span>
    {!access.loading && access.hasFeature("scans") && <input aria-label={`Draft ${name}`} defaultValue="unsaved work" />}
    <button onClick={access.retryAccess}>Retry {name}</button>
  </section>;
}

function Root() {
  return <QueryClientProvider client={client}><FeaturesProvider><Consumers /></FeaturesProvider></QueryClientProvider>;
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  session.current = { data: { user: { email: "first@example.test", isMasterAdmin: false } }, status: "authenticated" };
  request.mockReset();
  request.mockResolvedValue(new Response(JSON.stringify({ features: ["scans"], permissions: ["scans.run"] }), { status: 200 }));
  vi.stubGlobal("fetch", request);
});

afterEach(() => { cleanup(); client.clear(); vi.unstubAllGlobals(); });

describe("shared feature requests", () => {
  it("serves all mounted consumers from one request and one request per invalidation", async () => {
    request.mockImplementation(async () => new Response(JSON.stringify({ features: ["scans"], permissions: ["scans.run"] })));
    render(<Root />);
    await waitFor(() => expect(screen.getAllByText("allowed")).toHaveLength(3));
    expect(request).toHaveBeenCalledTimes(1);
    act(() => invalidateFeatureCache());
    await waitFor(() => expect(screen.getAllByText("allowed")).toHaveLength(3));
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("drops permissions immediately on invalidation and shares failed-load recovery", async () => {
    render(<Root />);
    await waitFor(() => expect(screen.getAllByText("allowed")).toHaveLength(3));
    let finish: (response: Response) => void = () => {};
    request.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
    act(() => invalidateFeatureCache());
    expect(screen.queryAllByText("allowed")).toHaveLength(0);
    expect(screen.getAllByText("checking")).toHaveLength(3);
    await act(async () => finish(new Response("{}", { status: 503 })));
    await waitFor(() => expect(screen.getAllByText("failed")).toHaveLength(3));
    request.mockResolvedValueOnce(new Response(JSON.stringify({ features: ["scans"], permissions: ["scans.view"] })));
    act(() => screen.getByRole("button", { name: "Retry form" }).click());
    await waitFor(() => expect(screen.getAllByText("denied")).toHaveLength(3));
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("does not reuse the previous account's access and ignores its late result", async () => {
    let finish: (response: Response) => void = () => {};
    request.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
    const view = render(<Root />);
    request.mockResolvedValueOnce(new Response(JSON.stringify({ features: ["scans"], permissions: ["scans.view"] })));
    session.current = { data: { user: { email: "second@example.test", isMasterAdmin: false } }, status: "authenticated" };
    view.rerender(<Root />);
    await waitFor(() => expect(screen.getAllByText("denied")).toHaveLength(3));
    await act(async () => finish(new Response(JSON.stringify({ features: ["scans"], permissions: ["scans.run"] }))));
    expect(screen.queryAllByText("allowed")).toHaveLength(0);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("does not fetch for a master administrator", () => {
    session.current.data.user.isMasterAdmin = true;
    render(<Root />);
    expect(screen.getAllByText("allowed")).toHaveLength(3);
    expect(request).not.toHaveBeenCalled();
  });

  it("preserves feature content on background refresh without using stale permissions", async () => {
    render(<Root />);
    await waitFor(() => expect(screen.getAllByText("allowed")).toHaveLength(3));
    const draft = screen.getByRole("textbox", { name: "Draft form" });
    let finish: (response: Response) => void = () => {};
    request.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
    let refresh: Promise<void>;
    act(() => { refresh = client.refetchQueries({ queryKey: ["workspace-feature-access"] }); });
    await waitFor(() => expect(screen.getAllByText("checking")).toHaveLength(3));
    expect(screen.getByRole("textbox", { name: "Draft form" })).toBe(draft);
    await act(async () => {
      finish(new Response(JSON.stringify({ features: ["scans"], permissions: ["scans.view"] })));
      await refresh;
    });
    await waitFor(() => expect(screen.getAllByText("denied")).toHaveLength(3));
    expect(screen.getByRole("textbox", { name: "Draft form" })).toBe(draft);
  });
});