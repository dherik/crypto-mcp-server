import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatUSD, formatPercent, formatLargeNumber } from "../formatting.js";

describe("formatUSD", () => {
  it("formats large numbers with 2 decimal places", () => {
    assert.equal(formatUSD(42000.5), "$42,000.50");
  });

  it("formats small numbers with up to 6 decimal places", () => {
    assert.equal(formatUSD(0.000123), "$0.000123");
  });

  it("formats zero", () => {
    assert.equal(formatUSD(0), "$0.00");
  });

  it("formats whole dollars", () => {
    assert.equal(formatUSD(100), "$100.00");
  });
});

describe("formatPercent", () => {
  it("adds plus sign for positive values", () => {
    assert.equal(formatPercent(5.12), "+5.12%");
  });

  it("does not add plus sign for zero", () => {
    assert.equal(formatPercent(0), "+0.00%");
  });

  it("keeps minus sign for negative values", () => {
    assert.equal(formatPercent(-3.45), "-3.45%");
  });

  it("rounds to 2 decimal places", () => {
    assert.equal(formatPercent(1.23456), "+1.23%");
  });
});

describe("formatLargeNumber", () => {
  it("formats billions", () => {
    assert.equal(formatLargeNumber(2_500_000_000), "$2.50B");
  });

  it("formats millions", () => {
    assert.equal(formatLargeNumber(15_000_000), "$15.00M");
  });

  it("formats under 1 million as USD", () => {
    assert.equal(formatLargeNumber(500_000), "$500,000.00");
  });

  it("formats exactly 1 billion", () => {
    assert.equal(formatLargeNumber(1_000_000_000), "$1.00B");
  });

  it("formats exactly 1 million", () => {
    assert.equal(formatLargeNumber(1_000_000), "$1.00M");
  });
});
