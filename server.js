const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { fetchMarketSnapshot } = require("./data-service");

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "127.0.0.1";
const PUBLIC_DIR = path.join(__dirname, "public");
const REFRESH_HOUR = 8;
const REFRESH_MINUTE = 10;
const ACCESS_USER = process.env.ACCESS_USER || "";
const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD || "";

let cache = null;
let lastError = null;
let refreshPromise = null;

async function refreshSnapshot() {
  if (refreshPromise) return refreshPromise;

  refreshPromise = fetchMarketSnapshot()
    .then((snapshot) => {
      cache = snapshot;
      lastError = null;
      console.log(`[data] Refreshed at ${snapshot.updatedAt}`);
      return snapshot;
    })
    .catch((error) => {
      lastError = error.message;
      console.error(`[data] Refresh failed: ${error.message}`);
      if (!cache) throw error;
      return cache;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

function millisecondsUntilNextRefresh(now = new Date()) {
  const shanghaiNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
  const target = new Date(shanghaiNow);
  target.setHours(REFRESH_HOUR, REFRESH_MINUTE, 0, 0);
  if (target <= shanghaiNow) target.setDate(target.getDate() + 1);
  return target.getTime() - shanghaiNow.getTime();
}

function scheduleRefresh() {
  setTimeout(async () => {
    await refreshSnapshot().catch(() => {});
    scheduleRefresh();
  }, millisecondsUntilNextRefresh());
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(body));
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length
    && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function isAuthorized(request) {
  if (!ACCESS_USER || !ACCESS_PASSWORD) return true;

  const header = request.headers.authorization || "";
  if (!header.startsWith("Basic ")) return false;

  try {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator < 0) return false;
    return safeEqual(decoded.slice(0, separator), ACCESS_USER)
      && safeEqual(decoded.slice(separator + 1), ACCESS_PASSWORD);
  } catch {
    return false;
  }
}

async function serveStatic(request, response) {
  const requestPath = request.url === "/" ? "/index.html" : request.url.split("?")[0];
  const normalized = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, normalized);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const content = await fs.readFile(filePath);
    const extension = path.extname(filePath);
    const contentTypes = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".svg": "image/svg+xml"
    };
    response.writeHead(200, {
      "Content-Type": contentTypes[extension] || "application/octet-stream",
      "Cache-Control": extension === ".html" ? "no-cache" : "public, max-age=3600"
    });
    response.end(content);
  } catch (error) {
    response.writeHead(error.code === "ENOENT" ? 404 : 500);
    response.end(error.code === "ENOENT" ? "Not found" : "Server error");
  }
}

const server = http.createServer(async (request, response) => {
  if (request.url === "/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (!isAuthorized(request)) {
    response.writeHead(401, {
      "WWW-Authenticate": 'Basic realm="DCA Dashboard", charset="UTF-8"',
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store"
    });
    response.end("需要登录后访问");
    return;
  }

  if (request.url === "/api/market") {
    try {
      const snapshot = cache || await refreshSnapshot();
      sendJson(response, 200, { ...snapshot, stale: Boolean(lastError), lastError });
    } catch (error) {
      sendJson(response, 503, { error: error.message });
    }
    return;
  }

  if (request.url === "/api/refresh" && request.method === "POST") {
    try {
      const snapshot = await refreshSnapshot();
      sendJson(response, 200, { ...snapshot, stale: Boolean(lastError), lastError });
    } catch (error) {
      sendJson(response, 503, { error: error.message });
    }
    return;
  }

  await serveStatic(request, response);
});

server.listen(PORT, HOST, () => {
  console.log(`DCA dashboard running at http://${HOST}:${PORT}`);
  refreshSnapshot().catch(() => {});
  scheduleRefresh();
});
