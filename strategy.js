const STRATEGIES = {
  nasdaq: [
    { min: 0, max: 10, multiplier: 1, label: "正常定投" },
    { min: 10, max: 20, multiplier: 1.25, label: "轻度加仓" },
    { min: 20, max: 30, multiplier: 1.5, label: "加仓" },
    { min: 30, max: 40, multiplier: 2, label: "显著加仓" },
    { min: 40, max: 50, multiplier: 2.5, label: "深度回撤加仓" },
    { min: 50, max: Infinity, multiplier: 3, label: "极深回撤加仓" }
  ],
  sp500: [
    { min: 0, max: 10, multiplier: 1, label: "正常定投" },
    { min: 10, max: 20, multiplier: 1.25, label: "轻度加仓" },
    { min: 20, max: 30, multiplier: 1.5, label: "加仓" },
    { min: 30, max: 40, multiplier: 2, label: "显著加仓" },
    { min: 40, max: Infinity, multiplier: 2.5, label: "深度回撤加仓" }
  ],
  btc: [
    { min: 0, max: 20, multiplier: 1, label: "正常定投" },
    { min: 20, max: 35, multiplier: 1.25, label: "轻度加仓" },
    { min: 35, max: 50, multiplier: 1.5, label: "加仓" },
    { min: 50, max: 65, multiplier: 2, label: "显著加仓" },
    { min: 65, max: Infinity, multiplier: 2.5, label: "极深回撤加仓" }
  ]
};

function calculateDrawdown(close, historicalHigh) {
  if (!Number.isFinite(close) || !Number.isFinite(historicalHigh) || historicalHigh <= 0) {
    throw new Error("Close and historical high must be positive numbers.");
  }

  return Math.max(0, (1 - close / historicalHigh) * 100);
}

function getStrategy(assetId, drawdown) {
  const levels = STRATEGIES[assetId];
  if (!levels) {
    throw new Error(`Unknown asset: ${assetId}`);
  }

  return levels.find((level) => drawdown >= level.min && drawdown < level.max)
    || levels[levels.length - 1];
}

module.exports = { STRATEGIES, calculateDrawdown, getStrategy };
