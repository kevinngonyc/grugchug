// A token bucket per WebSocket connection, so one client cannot flood a room.
// Pure and clock-injectable so it is testable without waiting in real time.

export interface RateLimitOptions {
  /** Burst size: how many messages can be sent back to back. */
  capacity: number;
  /** Sustained rate once the burst is spent. */
  refillPerSecond: number;
}

export class RateLimiter {
  private tokens: number;
  private lastRefillMs: number;

  private readonly options: RateLimitOptions;

  constructor(options: RateLimitOptions, nowMs: number = Date.now()) {
    this.options = options;
    this.tokens = options.capacity;
    this.lastRefillMs = nowMs;
  }

  /** Spends one token. Returns false when the caller is over the limit. */
  tryConsume(nowMs: number = Date.now()): boolean {
    const elapsedSeconds = Math.max(0, nowMs - this.lastRefillMs) / 1000;
    this.lastRefillMs = nowMs;
    this.tokens = Math.min(
      this.options.capacity,
      this.tokens + elapsedSeconds * this.options.refillPerSecond,
    );
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

export const CHAT_RATE_LIMIT: RateLimitOptions = { capacity: 15, refillPerSecond: 2 };
