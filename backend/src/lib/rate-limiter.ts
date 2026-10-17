interface RateRecord {
  timestamps: number[];
}

export class MemoryRateLimiter {
  private records = new Map<string, RateRecord>();

  constructor(private cleanupIntervalMs = 60_000) {
    const timer = setInterval(() => this.cleanup(), this.cleanupIntervalMs);
    if (timer.unref) timer.unref();
  }

  check(
    key: string,
    limit: number,
    windowMs: number,
  ): { allowed: boolean; remaining: number; resetInMs: number } {
    const now = Date.now();
    const windowStart = now - windowMs;
    const record = this.records.get(key);

    if (!record) {
      return { allowed: true, remaining: limit, resetInMs: 0 };
    }

    const validTimestamps = record.timestamps.filter((ts) => ts > windowStart);
    record.timestamps = validTimestamps;

    if (validTimestamps.length >= limit) {
      const oldest = validTimestamps[0] ?? now;
      const resetInMs = Math.max(0, oldest + windowMs - now);
      return { allowed: false, remaining: 0, resetInMs };
    }

    return {
      allowed: true,
      remaining: limit - validTimestamps.length,
      resetInMs: 0,
    };
  }

  record(key: string, windowMs: number): void {
    const now = Date.now();
    const windowStart = now - windowMs;
    let record = this.records.get(key);
    if (!record) {
      record = { timestamps: [] };
      this.records.set(key, record);
    }
    record.timestamps = record.timestamps.filter((ts) => ts > windowStart);
    record.timestamps.push(now);
  }

  reset(key: string): void {
    this.records.delete(key);
  }

  private cleanup(): void {
    const now = Date.now();
    const maxAge = 30 * 60_000;
    for (const [key, record] of this.records.entries()) {
      record.timestamps = record.timestamps.filter((ts) => now - ts < maxAge);
      if (record.timestamps.length === 0) {
        this.records.delete(key);
      }
    }
  }
}

export const authRateLimiter = new MemoryRateLimiter();
export { MemoryRateLimiter as AuthRateLimiter };
