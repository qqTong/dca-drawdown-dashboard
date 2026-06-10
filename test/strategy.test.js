const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateDrawdown, getStrategy } = require("../strategy");
const { parseNasdaqDate, parseNasdaqNumber } = require("../data-service");

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

test("parses Nasdaq-formatted closing prices", () => {
  assert.equal(parseNasdaqNumber("29,084.50"), 29084.5);
  assert.equal(parseNasdaqNumber("$61,509.70"), 61509.7);
});

test("normalizes Nasdaq dates to ISO format", () => {
  assert.equal(parseNasdaqDate("06/09/2026"), "2026-06-09");
});
