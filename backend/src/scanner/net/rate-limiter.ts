/**
 * Politeness limits per host (spec 6.2 step 5, 11.3): at most `maxConcurrent`
 * requests in flight and request starts spaced by at least `minIntervalMs`.
 */
export class HostRateLimiter {
  private readonly hosts = new Map<
    string,
    { active: number; nextStart: number; queue: (() => void)[] }
  >();

  constructor(
    private minIntervalMs = 1_000,
    private readonly maxConcurrent = 2,
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((r) => setTimeout(r, ms)),
  ) {}

  /** robots.txt Crawl-delay, capped at 5 s; never makes us faster than the default. */
  applyCrawlDelay(seconds: number | undefined): void {
    if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return;
    this.minIntervalMs = Math.max(this.minIntervalMs, Math.min(seconds, 5) * 1_000);
  }

  get intervalMs(): number {
    return this.minIntervalMs;
  }

  async schedule<T>(host: string, task: () => Promise<T>): Promise<T> {
    const state = this.hosts.get(host) ?? { active: 0, nextStart: 0, queue: [] };
    this.hosts.set(host, state);

    if (state.active >= this.maxConcurrent) {
      await new Promise<void>((resolve) => state.queue.push(resolve));
    }
    state.active++;

    // Reserve a start slot before awaiting so concurrent callers are spaced correctly.
    const startAt = Math.max(this.now(), state.nextStart);
    state.nextStart = startAt + this.minIntervalMs;
    const wait = startAt - this.now();
    if (wait > 0) await this.sleep(wait);

    try {
      return await task();
    } finally {
      state.active--;
      state.queue.shift()?.();
    }
  }
}
