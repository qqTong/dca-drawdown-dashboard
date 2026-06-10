const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateDrawdown, getStrategy } = require("../strategy");
const { isCompletedCandle } = require("../data-service");

test("calculates drawdown from the historical closing high", () => {
  assert.ok(Math.abs(calculateDrawdown(90, 100) - 10) < 1e-10);
  assert.equal(calculateDrawdown(100, 100), 0);
});

test("uses exact lower boundary for a new Nasdaq tier", () => {
  assert.equal(getStrategy("nasdaq", 9.99).multiplier, 1);
  assert.equal(getStrategy("nasdaq", 10).multiplier, 1.25);
  assert.equal(getStrategy("nasdaq", 50).multiplier, 3);
});

test("uses wider tiers for Bitcoin", () => {
  assert.equal(getStrategy("btc", 19.99).multiplier, 1);
  assert.equal(getStrategy("btc", 20).multiplier, 1.25);
  assert.equal(getStrategy("btc", 65).multiplier, 2.5);
});

test("excludes an unfinished UTC Bitcoin candle", () => {
  const now = new Date("2026-06-10T10:00:00Z");
  const currentDay = Date.parse("2026-06-10T00:00:00Z") / 1000;
  const priorDay = Date.parse("2026-06-09T00:00:00Z") / 1000;
  assert.equal(isCompletedCandle(currentDay, "crypto", now), false);
  assert.equal(isCompletedCandle(priorDay, "crypto", now), true);
});

test("includes a US index candle only after the close buffer", () => {
  const candle = Date.parse("2026-06-10T13:30:00Z") / 1000;
  assert.equal(isCompletedCandle(candle, "us", new Date("2026-06-10T19:00:00Z")), false);
  assert.equal(isCompletedCandle(candle, "us", new Date("2026-06-10T20:20:00Z")), true);
});
