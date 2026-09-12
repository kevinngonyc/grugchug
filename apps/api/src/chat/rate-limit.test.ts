import { expect, test } from "bun:test";
import { RateLimiter } from "./rate-limit";

test("allows a burst up to capacity, then blocks", () => {
  const limiter = new RateLimiter({ capacity: 3, refillPerSecond: 1 }, 0);
  expect(limiter.tryConsume(0)).toBe(true);
  expect(limiter.tryConsume(0)).toBe(true);
  expect(limiter.tryConsume(0)).toBe(true);
  expect(limiter.tryConsume(0)).toBe(false);
});

test("refills over time at the configured rate", () => {
  const limiter = new RateLimiter({ capacity: 2, refillPerSecond: 2 }, 0);
  limiter.tryConsume(0);
  limiter.tryConsume(0);
  expect(limiter.tryConsume(0)).toBe(false);
  expect(limiter.tryConsume(400)).toBe(false);
  expect(limiter.tryConsume(500)).toBe(true);
});

test("does not refill past capacity while idle", () => {
  const limiter = new RateLimiter({ capacity: 2, refillPerSecond: 10 }, 0);
  expect(limiter.tryConsume(60_000)).toBe(true);
  expect(limiter.tryConsume(60_000)).toBe(true);
  expect(limiter.tryConsume(60_000)).toBe(false);
});
