const DEFAULT_AMOUNTS = {
  nasdaq: 160,
  sp500: 40,
  btc: 140
};

const state = {
  snapshot: null,
  amounts: loadAmounts()
};

const currency = new Intl.NumberFormat("zh-CN", {
  style: "currency",
  currency: "CNY",
  maximumFractionDigits: 0
});

const marketNumber = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2
});

function loadAmounts() {
  try {
    return { ...DEFAULT_AMOUNTS, ...JSON.parse(localStorage.getItem("dca-base-amounts")) };
  } catch {
    return { ...DEFAULT_AMOUNTS };
  }
}

function setupAmountInputs() {
  for (const assetId of Object.keys(DEFAULT_AMOUNTS)) {
    const input = document.querySelector(`#base-${assetId}`);
    input.value = state.amounts[assetId];
    input.addEventListener("input", () => {
      state.amounts[assetId] = Math.max(0, Number(input.value) || 0);
      localStorage.setItem("dca-base-amounts", JSON.stringify(state.amounts));
      if (state.snapshot) renderSnapshot();
    });
  }
}

function formatPercent(value, forceSign = false) {
  const sign = forceSign && value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function renderSnapshot() {
  const grid = document.querySelector("#asset-grid");
  const template = document.querySelector("#asset-card-template");
  grid.replaceChildren();

  let total = 0;
  let elevatedCount = 0;

  for (const asset of state.snapshot.assets) {
    const card = template.content.firstElementChild.cloneNode(true);
    const amount = state.amounts[asset.id] * asset.strategy.multiplier;
    total += amount;
    if (asset.strategy.multiplier > 1) elevatedCount += 1;

    card.dataset.asset = asset.id;
    card.querySelector(".asset-symbol").textContent = asset.symbol;
    card.querySelector(".asset-name").textContent = asset.name;
    card.querySelector(".strategy-badge").textContent = asset.strategy.label;
    card.querySelector(".close-price").textContent = marketNumber.format(asset.close);
    card.querySelector(".close-meta").textContent = `${asset.closeDate} · ${asset.currency}`;
    card.querySelector(".drawdown-value").textContent = `-${asset.drawdownPercent.toFixed(2)}%`;
    card.querySelector(".drawdown-fill").style.width = `${Math.min(asset.drawdownPercent / 65 * 100, 100)}%`;
    card.querySelector(".high-meta").textContent =
      `历史最高 ${marketNumber.format(asset.historicalHigh)} · ${asset.historicalHighDate}`;
    card.querySelector(".recommended-amount").textContent = currency.format(amount);
    card.querySelector(".multiplier").textContent = `${asset.strategy.multiplier}× 基础`;

    const change = card.querySelector(".daily-change");
    change.textContent = asset.dailyChangePercent == null
      ? "--"
      : formatPercent(asset.dailyChangePercent, true);
    if (asset.dailyChangePercent != null) {
      change.classList.add(asset.dailyChangePercent >= 0 ? "positive" : "negative");
    }

    grid.append(card);
  }

  document.querySelector("#total-amount").textContent = currency.format(total);
  document.querySelector("#summary-copy").textContent = elevatedCount
    ? `${elevatedCount} 项资产进入回撤加仓档位；按仓位上限与可用现金执行。`
    : "三项资产均处于正常定投档位，无需因短期波动额外加仓。";
  document.querySelector("#market-state").style.background = elevatedCount ? "#aa6a16" : "#167353";

  const updated = new Date(state.snapshot.updatedAt);
  document.querySelector("#update-time").textContent =
    `更新于 ${updated.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}`;
}

function renderError(message) {
  const grid = document.querySelector("#asset-grid");
  grid.innerHTML = `<div class="error-message">数据暂时无法更新：${message}</div>`;
  document.querySelector("#update-time").textContent = "更新失败";
  document.querySelector("#summary-copy").textContent = "请稍后手动刷新，勿在数据不完整时调整定投档位。";
}

async function loadMarket(forceRefresh = false) {
  const button = document.querySelector("#refresh-button");
  button.disabled = true;

  try {
    const response = await fetch(forceRefresh ? "/api/refresh" : "/api/market", {
      method: forceRefresh ? "POST" : "GET"
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "未知错误");
    state.snapshot = payload;
    renderSnapshot();
  } catch (error) {
    renderError(error.message);
  } finally {
    button.disabled = false;
  }
}

setupAmountInputs();
document.querySelector("#refresh-button").addEventListener("click", () => loadMarket(true));
loadMarket();
