const { calculateDrawdown, getStrategy } = require("./strategy");

const ASSETS = [
  {
    id: "nasdaq",
    name: "纳斯达克100",
    symbol: "^NDX",
    apiSymbol: "NDX",
    assetClass: "index",
    currency: "USD",
    historicalHigh: 30660.599609375,
    historicalHighDate: "2026-06-02"
  },
  {
    id: "sp500",
    name: "标普500（SPY代理）",
    symbol: "SPY",
    apiSymbol: "SPY",
    assetClass: "etf",
    currency: "USD",
    historicalHigh: 759.57,
    historicalHighDate: "2026-06-02"
  },
  {
    id: "btc",
    name: "Bitcoin",
    symbol: "BTC-USD",
    apiSymbol: "BTC",
    assetClass: "crypto",
    currency: "USD",
    historicalHigh: 124752.53125,
    historicalHighDate: "2025-10-06"
  }
];

const REQUEST_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/137.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  Origin: "https://www.nasdaq.com",
  Referer: "https://www.nasdaq.com/"
};

function parseNasdaqNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return NaN;
  return Number(value.replace(/[$,%\s,]/g, ""));
}

function parseNasdaqDate(value) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value || "");
  if (!match) throw new Error(`Unexpected market date: ${value}`);
  return `${match[3]}-${match[1]}-${match[2]}`;
}

async function fetchNasdaqRows(asset) {
  const url = new URL(
    `https://api.nasdaq.com/api/quote/${asset.apiSymbol}/historical`
  );
  url.searchParams.set("assetclass", asset.assetClass);
  url.searchParams.set("fromdate", asset.historicalHighDate);
  url.searchParams.set("limit", "5000");

  const response = await fetch(url, {
    headers: REQUEST_HEADERS,
    signal: AbortSignal.timeout(12000)
  });

  if (!response.ok) {
    throw new Error(`${asset.name} data request failed (${response.status}).`);
  }

  const payload = await response.json();
  const rows = payload.data?.tradesTable?.rows;
  if (!Array.isArray(rows) || rows.length < 2) {
    const detail = payload.status?.bCodeMessage?.[0]?.errorMessage;
    throw new Error(detail || `${asset.name} returned no completed closing data.`);
  }

  return rows
    .map((row) => ({
      date: parseNasdaqDate(row.date),
      close: parseNasdaqNumber(row.close)
    }))
    .filter((point) => Number.isFinite(point.close))
    .sort((left, right) => left.date.localeCompare(right.date));
}

async function fetchAsset(asset) {
  const points = await fetchNasdaqRows(asset);
  if (points.length < 2) {
    throw new Error(`${asset.name} has insufficient closing data.`);
  }

  const latest = points[points.length - 1];
  const previous = points[points.length - 2];
  let highPoint = {
    close: asset.historicalHigh,
    date: asset.historicalHighDate
  };

  for (const point of points) {
    if (point.close > highPoint.close) highPoint = point;
  }

  const drawdown = calculateDrawdown(latest.close, highPoint.close);
  const strategy = getStrategy(asset.id, drawdown);

  return {
    id: asset.id,
    name: asset.name,
    symbol: asset.symbol,
    currency: asset.currency,
    close: latest.close,
    closeDate: latest.date,
    previousClose: previous.close,
    dailyChangePercent: ((latest.close / previous.close) - 1) * 100,
    historicalHigh: highPoint.close,
    historicalHighDate: highPoint.date,
    drawdownPercent: drawdown,
    strategy
  };
}

async function fetchMarketSnapshot(now = new Date()) {
  const results = await Promise.allSettled(ASSETS.map((asset) => fetchAsset(asset)));
  const failures = results.filter((result) => result.status === "rejected");

  if (failures.length) {
    throw new Error(failures.map((failure) => failure.reason.message).join(" "));
  }

  return {
    updatedAt: now.toISOString(),
    methodology: "Latest completed daily close versus the highest completed historical daily close.",
    source: "Nasdaq",
    assets: results.map((result) => result.value)
  };
}

module.exports = {
  ASSETS,
  fetchAsset,
  fetchMarketSnapshot,
  parseNasdaqDate,
  parseNasdaqNumber
};
