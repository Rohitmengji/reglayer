import { launchBrowser } from "./launch";

export function createBrowserLifetime(signal?: AbortSignal) {
  const browsers = new Set<Awaited<ReturnType<typeof launchBrowser>>>();
  const closing = new Set<Promise<void>>();
  let disposed = false;

  const close = (browser: Awaited<ReturnType<typeof launchBrowser>>) => {
    if (!browsers.delete(browser)) return;
    const pending = Promise.resolve().then(() => browser.close()).catch(() => {}).then(() => { closing.delete(pending); });
    closing.add(pending);
  };
  const abort = () => { for (const browser of browsers) close(browser); };
  signal?.addEventListener("abort", abort, { once: true });

  return {
    async launch() {
      signal?.throwIfAborted();
      if (disposed) throw new Error("Browser lifetime is closed.");
      const browser = await launchBrowser();
      browsers.add(browser);
      if (disposed || signal?.aborted) {
        close(browser);
        await Promise.all(closing);
        signal?.throwIfAborted();
        throw new Error("Browser lifetime is closed.");
      }
      return browser;
    },
    async dispose() {
      disposed = true;
      signal?.removeEventListener("abort", abort);
      abort();
      await Promise.all(closing);
    },
  };
}