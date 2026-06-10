const { calculateDrawdown, getStrategy } = require("./strategy");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

const ASSETS = [
  {
    id: "nasdaq",
    name: "纳斯达克100",
    symbol: "^NDX",
    encodedSymbol: "%5ENDX",
    currency: "USD",
    market: "us"
  },
  {
    id: "sp500",
    name: "标普500",
    symbol: "^GSPC",
    encodedSymbol: "%5EGSPC",
    currency: "USD",
    market: "us"
  },
  {
    id: "btc",
    name: "Bitcoin",
    symbol: "BTC-USD",
    encodedSymbol: "BTC-USD",
    currency: "USD",
    market: "crypto"
  }
];

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) DCA-Dashboard/1.0";

async function fetchJsonWithPowerShell(url) {
  const escapedUrl = url.replace(/'/g, "''");
  const command = [
    "$ProgressPreference='SilentlyContinue'",
    `$response=Invoke-WebRequest -UseBasicParsing -Uri '${escapedUrl}'`,
    "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8",
    "$response.Content"
  ].join("; ");
  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command],
    { maxBuffer: 25 * 1024 * 1024, encoding: "utf8", timeout: 30000 }
  );
  return JSON.parse(stdout.replace(/^\uFEFF/, ""));
}

async function fetchJson(url) {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json"
      },
      signal: AbortSignal.timeout(20000)
    });

    if (response.ok) return response.json();
    if (response.status !== 403 && response.status !== 429) {
      throw new Error(`Data request failed (${response.status}).`);
    }
  } catch (error) {
    if (process.platform !== "win32") throw error;
  }

  if (process.platform !== "win32") {
    throw new Error("Data provider rejected the request.");
  }
  return fetchJsonWithPowerShell(url);
}

function partsForTimeZone(date, timeZone) {
  const values = {};
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);

  for (const part of parts) {
    if (part.type !== "literal") values[part.type] = part.value;
  }

  return {
    date: `${values.year}-${values.month}-${values.day}`,
    minutes: Number(values.hour) * 60 + Number(values.minute)
  };
}

function candleDate(timestamp, timeZone) {
  return partsForTimeZone(new Date(timestamp * 1000), timeZone).date;
}

function isCompletedCandle(timestamp, market, now = new Date()) {
  if (market === "crypto") {
    return candleDate(timestamp, "UTC") < partsForTimeZone(now, "UTC").date;
  }

  const candleDay = candleDate(timestamp, "America/New_York");
  const current = partsForTimeZone(now, "America/New_York");
  return candleDay < current.date || (candleDay === current.date && current.minutes >= 16 * 60 + 15);
}

async function fetchAsset(asset, now = new Date()) {
  const period2 = Math.floor(now.getTime() / 1000) + 86400;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${asset.encodedSymbol}`
    + `?period1=0&period2=${period2}&interval=1d&events=history`;

  const payload = await fetchJson(url);
  const result = payload.chart?.result?.[0];
  if (!result || payload.chart?.error) {
    throw new Error(payload.chart?.error?.description || `${asset.name} returned no data.`);
  }

  const timestamps = result.timestamp || [];
  const closes = result.indicators?.quote?.[0]?.close || [];
  const points = timestamps
    .map((timestamp, index) => ({ timestamp, close: closes[index] }))
    .filter((point) => Number.isFinite(point.close) && isCompletedCandle(point.timestamp, asset.market, now));

  if (!points.length) {
    throw new Error(`${asset.name} has no completed closing data.`);
  }

  const latest = points[points.length - 1];
  const previous = points[points.length - 2];
  const highPoint = points.reduce(
    (highest, point) => (point.close > highest.close ? point : highest),
    points[0]
  );
  const drawdown = calculateDrawdown(latest.close, highPoint.close);
  const strategy = getStrategy(asset.id, drawdown);
  const timeZone = asset.market === "crypto" ? "UTC" : "America/New_York";

  return {
    ...asset,
    close: latest.close,
    closeDate: candleDate(latest.timestamp, timeZone),
    previousClose: previous?.close ?? null,
    dailyChangePercent: previous
      ? ((latest.close / previous.close) - 1) * 100
      : null,
    historicalHigh: highPoint.close,
    historicalHighDate: candleDate(highPoint.timestamp, timeZone),
    drawdownPercent: drawdown,
    strategy
  };
}

async function fetchMarketSnapshot(now = new Date()) {
  const results = await Promise.allSettled(ASSETS.map((asset) => fetchAsset(asset, now)));
  const failures = results.filter((result) => result.status === "rejected");

  if (failures.length) {
    throw new Error(failures.map((failure) => failure.reason.message).join(" "));
  }

  return {
    updatedAt: now.toISOString(),
    methodology: "Latest completed daily close versus the highest completed historical daily close.",
    assets: results.map((result) => result.value)
  };
}

module.exports = {
  ASSETS,
  fetchAsset,
  fetchMarketSnapshot,
  isCompletedCandle,
  partsForTimeZone
};
