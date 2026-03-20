let reports = [];
let selectedIds = new Set();
let currentView = "list"; // "list" | "detail" | "compare"

document.addEventListener("DOMContentLoaded", () => {
    initSidebar();
    document.getElementById("account-filter").addEventListener("change", onFilterChange);
    document.getElementById("btn-compare").addEventListener("click", onCompareClick);

    document.addEventListener("sidebar:loaded", () => {
        renderSidebarAccounts();
    });
    document.addEventListener("sidebar:accountclick", e => {
        const filter = document.getElementById("account-filter");
        filter.value = e.detail.id;
        onFilterChange();
    });

    loadSidebarAccounts().then(() => loadReports());
});

async function loadReports() {
    try {
        const filter = document.getElementById("account-filter").value;
        const params = filter ? { account_id: filter } : {};
        reports = await api.getReports(params);
        populateAccountFilter();
        renderReportList();
    } catch (e) {
        document.getElementById("reports-content").innerHTML =
            `<div class="empty-state"><h3>Error</h3><p>${e.message}</p></div>`;
    }
}

function populateAccountFilter() {
    const select = document.getElementById("account-filter");
    const current = select.value;
    const seen = new Map();
    reports.forEach(r => {
        if (!seen.has(r.account_id)) seen.set(r.account_id, r.account_name);
    });
    (window.sidebarAccounts || []).forEach(a => {
        if (!seen.has(a.id)) seen.set(a.id, a.name);
    });
    const opts = [`<option value="">All Accounts</option>`];
    seen.forEach((name, id) => {
        opts.push(`<option value="${id}" ${id === current ? "selected" : ""}>${name}</option>`);
    });
    select.innerHTML = opts.join("");
}

function onFilterChange() {
    selectedIds.clear();
    updateCompareButton();
    loadReports();
}

function renderReportList() {
    const content = document.getElementById("reports-content");

    if (reports.length === 0) {
        content.innerHTML = `
            <div class="empty-state">
                <h3>No Reports Yet</h3>
                <p>Save a snapshot from the Dashboard to create your first report.</p>
            </div>`;
        return;
    }

    content.innerHTML = `<div class="report-cards">${reports.map(r => reportCard(r)).join("")}</div>`;
}

function reportCard(r) {
    const date = new Date(r.created_at).toLocaleDateString("en-US", {
        year: "numeric", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit", hour12: false,
    });
    const checked = selectedIds.has(r.id) ? "checked" : "";
    const profit = r.stats.net_profit;
    const profitCls = profit >= 0 ? "positive" : "negative";
    const profitStr = (profit >= 0 ? "+" : "") + "$" + profit.toFixed(2);
    const scoreHtml = r.overall_score != null
        ? `<span class="report-card__score ${r.overall_score >= 70 ? "score-green" : r.overall_score >= 40 ? "score-yellow" : "score-red"}">${r.overall_score} ${r.overall_grade || ""}</span>`
        : "";
    const dateRange = r.date_range_start || r.date_range_end
        ? `<span class="report-card__range">${r.date_range_start || "..."} to ${r.date_range_end || "..."}</span>`
        : "";

    return `
        <div class="report-card ${selectedIds.has(r.id) ? "report-card--selected" : ""}">
            <div class="report-card__check">
                <input type="checkbox" ${checked} onchange="toggleSelect('${r.id}', this.checked)" />
            </div>
            <div class="report-card__body" onclick="viewReport('${r.id}')">
                <div class="report-card__top">
                    <div class="report-card__label">${escHtml(r.label)}</div>
                    <div class="report-card__stats">
                        ${scoreHtml}
                        <span class="report-card__profit ${profitCls}">${profitStr}</span>
                    </div>
                </div>
                <div class="report-card__meta">
                    <span>${escHtml(r.account_name)}</span>
                    <span class="meta-sep">&middot;</span>
                    <span>${r.trades_count} trades</span>
                    <span class="meta-sep">&middot;</span>
                    <span>${date}</span>
                    ${dateRange ? `<span class="meta-sep">&middot;</span>${dateRange}` : ""}
                </div>
            </div>
            <button class="report-card__delete" onclick="deleteReport('${r.id}')" title="Delete report">&times;</button>
        </div>`;
}

function escHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

function toggleSelect(id, checked) {
    if (checked) {
        if (selectedIds.size >= 2) {
            // Deselect oldest
            const first = selectedIds.values().next().value;
            selectedIds.delete(first);
        }
        selectedIds.add(id);
    } else {
        selectedIds.delete(id);
    }
    updateCompareButton();
    renderReportList();
}

function updateCompareButton() {
    const btn = document.getElementById("btn-compare");
    btn.disabled = selectedIds.size !== 2;
    btn.textContent = selectedIds.size === 2 ? "Compare Selected" : `Compare (${selectedIds.size}/2)`;
}

async function onCompareClick() {
    if (selectedIds.size !== 2) return;
    const [leftId, rightId] = [...selectedIds];
    try {
        const comparison = await api.compareReports(leftId, rightId);
        renderComparison(comparison);
    } catch (e) {
        alert("Comparison failed: " + e.message);
    }
}

async function viewReport(id) {
    const content = document.getElementById("reports-content");
    content.innerHTML = `<div class="loading"><div class="spinner"></div>Loading report...</div>`;

    try {
        const report = await api.getReport(id);
        renderReportDetail(report);
    } catch (e) {
        content.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${e.message}</p></div>`;
    }
}

function renderReportDetail(r) {
    currentView = "detail";
    const content = document.getElementById("reports-content");
    const date = new Date(r.created_at).toLocaleDateString("en-US", {
        year: "numeric", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit", hour12: false,
    });
    const s = r.stats;

    const dateRange = r.date_range_start || r.date_range_end
        ? `<div class="report-detail__range">Date range: ${r.date_range_start || "..."} to ${r.date_range_end || "..."}</div>`
        : "";

    content.innerHTML = `
        <div class="report-detail">
            <button class="btn-back" onclick="backToList()" title="Back to reports">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8L10 13" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <div class="report-detail__header">
                <div>
                    <h3>${escHtml(r.label)}</h3>
                    <div class="report-detail__meta">${escHtml(r.account_name)} | ${r.trades_count} trades | ${date}</div>
                    ${dateRange}
                </div>
                <div class="report-detail__actions">
                    <button class="btn btn-sm" onclick="compareLiveUI('${r.id}')">Compare with Live</button>
                </div>
            </div>
            ${renderScoreCard(r.stats)}

            <div class="card-stacks-grid">
            ${renderCardStack("performance", "Performance", 6, [
                simpleStatCard("Net Profit", "$" + s.net_profit.toFixed(2), s.net_profit >= 0),
                simpleStatCard("Win Rate", s.win_rate + "%", s.win_rate >= 50),
                simpleStatCard("Profit Factor", s.profit_factor.toFixed(2)),
                simpleStatCard("Avg Win", "$" + s.average_profit.toFixed(2), true),
                simpleStatCard("Largest Win", "$" + s.largest_win.toFixed(2), true),
                simpleStatCard("Expectancy", "$" + s.expectancy.toFixed(2), s.expectancy >= 0),
            ].join(""), r.stats)}

            ${renderCardStack("risk", "Risk", 4, [
                simpleStatCard("Max Drawdown", "$" + s.max_drawdown.toFixed(2), false),
                simpleStatCard("Max DD %", s.max_drawdown_pct.toFixed(2) + "%", false),
                simpleStatCard("Avg Loss", "$" + s.average_loss.toFixed(2), false),
                simpleStatCard("Largest Loss", "$" + s.largest_loss.toFixed(2), false),
            ].join(""), r.stats)}

            ${renderCardStack("ratios", "Ratios", 3, [
                simpleStatCard("Sharpe Ratio", s.sharpe_ratio.toFixed(2), s.sharpe_ratio >= 1),
                simpleStatCard("Sortino Ratio", s.sortino_ratio.toFixed(2), s.sortino_ratio >= 1),
                simpleStatCard("R:R Ratio", s.risk_reward_ratio.toFixed(2)),
            ].join(""), r.stats)}

            ${renderCardStack("volume", "Volume & Streaks", 5, [
                simpleStatCard("Total Trades", s.total_trades),
                simpleStatCard("Buy %", s.buy_percentage + "%"),
                simpleStatCard("Sell %", s.sell_percentage + "%"),
                simpleStatCard("Consec. Wins", s.consecutive_wins),
                simpleStatCard("Consec. Losses", s.consecutive_losses),
            ].join(""), r.stats)}
            </div>

            ${renderSessionDaily(s)}
            ${renderSymbolBreakdown(s)}
        </div>`;
}

function simpleStatCard(label, value, positive = null) {
    let cls = "";
    if (positive === true) cls = "positive";
    else if (positive === false) cls = "negative";
    return `
        <div class="stat-card">
            <div class="label-row"><div class="label">${label}</div></div>
            <div class="value ${cls}">${value}</div>
        </div>`;
}

function renderSessionDaily(s) {
    let html = "";
    if (s.session_win_rates && Object.keys(s.session_win_rates).length > 0) {
        html += `<div class="section"><h2>Session Win Rates</h2><div class="bar-chart">`;
        for (const [label, pct] of Object.entries(s.session_win_rates)) {
            html += `<div class="bar-row">
                <span class="bar-label">${label}</span>
                <div class="bar-track"><div class="bar-fill ${pct >= 50 ? "green" : "blue"}" style="width:${Math.max(pct, 4)}%"></div></div>
                <span class="bar-value">${pct}%</span>
            </div>`;
        }
        html += `</div></div>`;
    }
    if (s.daily_win_rates && Object.keys(s.daily_win_rates).length > 0) {
        html += `<div class="section"><h2>Daily Win Rates</h2><div class="bar-chart">`;
        for (const [label, pct] of Object.entries(s.daily_win_rates)) {
            html += `<div class="bar-row">
                <span class="bar-label">${label}</span>
                <div class="bar-track"><div class="bar-fill ${pct >= 50 ? "green" : "blue"}" style="width:${Math.max(pct, 4)}%"></div></div>
                <span class="bar-value">${pct}%</span>
            </div>`;
        }
        html += `</div></div>`;
    }
    return html;
}

function renderSymbolBreakdown(s) {
    if (!s.symbol_breakdown || Object.keys(s.symbol_breakdown).length === 0) return "";
    let rows = "";
    for (const [sym, d] of Object.entries(s.symbol_breakdown)) {
        rows += `<tr>
            <td>${sym}</td>
            <td>${d.trades}</td>
            <td>${d.win_rate}%</td>
            <td class="${d.pnl >= 0 ? "positive" : "negative"}">$${d.pnl.toFixed(2)}</td>
        </tr>`;
    }
    return `<div class="section"><h2>Symbol Breakdown</h2>
        <table><thead><tr><th>Symbol</th><th>Trades</th><th>Win Rate</th><th>P&L</th></tr></thead>
        <tbody>${rows}</tbody></table></div>`;
}

// ---------------------------------------------------------------------------
// Improvement grade — based on percentage-point delta of the overall score
// (0–100 scale). Percentage points are the standard unit for expressing
// absolute change on a bounded score scale.
// ---------------------------------------------------------------------------

function computeImprovementGrade(leftStats, rightStats) {
    if (!leftStats || !rightStats) return null;
    if ((leftStats.total_trades ?? 0) === 0 && (rightStats.total_trades ?? 0) === 0) return null;
    const left = computeOverallScore(leftStats);
    const right = computeOverallScore(rightStats);
    const delta = right.score - left.score; // pp = percentage points

    // Grade thresholds based on pp change
    let grade, label, colorCls;
    if (delta >= 20)      { grade = "A+"; label = "Major improvement";    colorCls = "cic--green";  }
    else if (delta >= 12) { grade = "A";  label = "Strong improvement";   colorCls = "cic--green";  }
    else if (delta >= 6)  { grade = "B+"; label = "Solid improvement";    colorCls = "cic--green";  }
    else if (delta >= 2)  { grade = "B";  label = "Modest improvement";   colorCls = "cic--yellow"; }
    else if (delta > -2)  { grade = "C+"; label = delta === 0 ? "No change" : "No significant change"; colorCls = "cic--yellow"; }
    else if (delta > -6)  { grade = "C";  label = "Modest decline";       colorCls = "cic--yellow"; }
    else if (delta > -12) { grade = "D";  label = "Notable decline";      colorCls = "cic--red";    }
    else                  { grade = "F";  label = "Major decline";        colorCls = "cic--red";    }

    return { leftScore: left.score, leftGrade: left.grade, rightScore: right.score, rightGrade: right.grade, delta, grade, label, colorCls };
}

function renderImprovementCard(c) {
    const ig = computeImprovementGrade(c.left_stats, c.right_stats);
    if (!ig) return "";

    const sign = ig.delta > 0 ? "+" : "";
    const deltaStr = `${sign}${ig.delta} pp`;
    const deltaCls = ig.delta >= 2 ? "cic__delta--up" : ig.delta <= -2 ? "cic__delta--down" : "cic__delta--flat";

    return `
        <div class="comparison-improvement-card ${ig.colorCls}">
            <div class="cic__grade">${ig.grade}</div>
            <div class="cic__body">
                <div class="cic__title">Overall Improvement</div>
                <div class="cic__label">${ig.label}</div>
            </div>
            <div class="cic__scores">
                <span class="cic__score-val">${ig.leftScore}<span class="cic__score-grade">${ig.leftGrade}</span></span>
                <svg class="cic__arrow" viewBox="0 0 24 12" fill="none" width="28" height="14">
                    <path d="M0 6h20M15 1l5 5-5 5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <span class="cic__score-val cic__score-val--right">${ig.rightScore}<span class="cic__score-grade">${ig.rightGrade}</span></span>
                <span class="cic__delta ${deltaCls}">${deltaStr}</span>
            </div>
        </div>`;
}

function renderComparison(c) {
    currentView = "compare";
    const content = document.getElementById("reports-content");

    const DISPLAY_LABELS = {
        total_trades: "Total Trades",
        winning_trades: "Winning Trades",
        losing_trades: "Losing Trades",
        win_rate: "Win Rate",
        net_profit: "Net Profit",
        total_profit: "Total Profit",
        total_loss: "Total Loss",
        average_profit: "Avg Win",
        average_loss: "Avg Loss",
        largest_win: "Largest Win",
        largest_loss: "Largest Loss",
        profit_factor: "Profit Factor",
        sharpe_ratio: "Sharpe Ratio",
        sortino_ratio: "Sortino Ratio",
        max_drawdown: "Max Drawdown",
        max_drawdown_pct: "Max DD %",
        average_trade: "Avg Trade",
        expectancy: "Expectancy",
        consecutive_wins: "Consec. Wins",
        consecutive_losses: "Consec. Losses",
        risk_reward_ratio: "R:R Ratio",
        buy_percentage: "Buy %",
        sell_percentage: "Sell %",
    };

    const allRows = [];
    for (const [field, d] of Object.entries(c.deltas)) {
        const label = DISPLAY_LABELS[field] || field;
        const leftVal = formatDeltaValue(field, d.left);
        const rightVal = formatDeltaValue(field, d.right);
        const deltaVal = d.delta > 0 ? "+" + formatDeltaValue(field, d.delta) : formatDeltaValue(field, d.delta);
        const pctStr = d.pct_change !== null ? `(${d.pct_change > 0 ? "+" : ""}${d.pct_change.toFixed(1)}%)` : "";

        let deltaCls = "delta-neutral";
        if (d.improved === true) deltaCls = "delta-improved";
        else if (d.improved === false) deltaCls = "delta-declined";

        allRows.push(`
            <tr>
                <td class="compare-label">${label}</td>
                <td class="compare-val">${leftVal}</td>
                <td class="compare-delta ${deltaCls}">${deltaVal} ${pctStr}</td>
                <td class="compare-val">${rightVal}</td>
            </tr>`);
    }

    const VISIBLE_ROWS = 3;
    const visibleRows = allRows.slice(0, VISIBLE_ROWS).join("");
    const hiddenRows = allRows.slice(VISIBLE_ROWS).join("");
    const hasMore = hiddenRows.length > 0;
    const remainingCount = allRows.length - VISIBLE_ROWS;

    const extraTbody = hasMore
        ? `<tbody class="compare-extra" id="compare-extra-rows" hidden>${hiddenRows}</tbody>`
        : "";

    // Side-by-side dict fields
    const leftName = c.left_account_name || c.left_label;
    const rightName = c.right_account_name || c.right_label;
    const dictHtml = renderDictComparison("Session Win Rates", c.left_stats.session_win_rates, c.right_stats.session_win_rates, leftName, rightName);
    const dailyHtml = renderDictComparison("Daily Win Rates", c.left_stats.daily_win_rates, c.right_stats.daily_win_rates, leftName, rightName);
    const radarHtml = renderRadarChart(c.left_stats, c.right_stats, c.left_label, c.right_label);
    const improvementHtml = renderImprovementCard(c);

    content.innerHTML = `
        <div class="comparison-view">
            <button class="btn-back" onclick="backToList()" title="Back to reports">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8L10 13" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <div class="comparison-header">
                <h3>Comparison</h3>
            </div>
            ${improvementHtml}
            ${radarHtml}
            <div class="section">
                <table class="comparison-table">
                    <thead>
                        <tr>
                            <th>Metric</th>
                            <th><span class="compare-color-dot" style="background:#007AFF"></span>${escHtml(c.left_label)}<br><span class="compare-account">${escHtml(c.left_account_name)}</span></th>
                            <th>Delta</th>
                            <th><span class="compare-color-dot" style="background:#FF9500"></span>${escHtml(c.right_label)}<br><span class="compare-account">${escHtml(c.right_account_name)}</span></th>
                        </tr>
                    </thead>
                    <tbody>${visibleRows}</tbody>
                    ${extraTbody}
                </table>
                ${hasMore ? `<button class="compare-show-more" onclick="toggleCompareRows(this)" data-count="${remainingCount}">Show ${remainingCount} more rows</button>` : ""}
            </div>
            ${dictHtml}
            ${dailyHtml}
        </div>`;
}

function renderDictComparison(title, leftDict, rightDict, leftName = "Left", rightName = "Right") {
    if ((!leftDict || Object.keys(leftDict).length === 0) && (!rightDict || Object.keys(rightDict).length === 0)) return "";
    const allKeys = new Set([...Object.keys(leftDict || {}), ...Object.keys(rightDict || {})]);
    let rows = "";
    for (const key of allKeys) {
        const lv = leftDict?.[key] ?? "-";
        const rv = rightDict?.[key] ?? "-";
        rows += `<tr><td>${key}</td><td>${typeof lv === "number" ? lv + "%" : lv}</td><td>${typeof rv === "number" ? rv + "%" : rv}</td></tr>`;
    }
    return `<div class="section"><h2>${title}</h2>
        <table><thead><tr><th></th><th>${escHtml(leftName)}</th><th>${escHtml(rightName)}</th></tr></thead>
        <tbody>${rows}</tbody></table></div>`;
}

function formatDeltaValue(field, val) {
    if (field.includes("pct") || field.includes("percentage") || field === "win_rate") return val.toFixed(2) + "%";
    if (field.includes("ratio") || field === "profit_factor") return val.toFixed(2);
    if (["total_trades", "winning_trades", "losing_trades", "consecutive_wins", "consecutive_losses"].includes(field)) return val.toString();
    return "$" + val.toFixed(2);
}

async function compareLiveUI(reportId) {
    let accountId;
    try {
        const accs = await api.getAccounts();
        const running = accs.filter(a => a.container_status === "running");
        if (running.length === 0) {
            alert("No running containers. Start an account's container first.");
            return;
        }
        if (running.length === 1) {
            accountId = running[0].id;
        } else {
            const choices = running.map((a, i) => `${i + 1}. ${a.name}`).join("\n");
            const pick = prompt(`Choose a running account:\n${choices}\nEnter number:`);
            if (!pick) return;
            const idx = parseInt(pick) - 1;
            if (idx < 0 || idx >= running.length) return;
            accountId = running[idx].id;
        }
    } catch (e) {
        alert("Failed to fetch accounts: " + e.message);
        return;
    }

    const content = document.getElementById("reports-content");
    content.innerHTML = `<div class="loading"><div class="spinner"></div>Comparing with live stats...</div>`;

    try {
        const comparison = await api.compareLive(reportId, accountId);
        renderComparison(comparison);
    } catch (e) {
        content.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${e.message}</p></div>`;
    }
}

async function deleteReport(id) {
    if (!confirm("Delete this report?")) return;
    try {
        await api.deleteReport(id);
        selectedIds.delete(id);
        updateCompareButton();
        await loadReports();
    } catch (e) {
        alert("Failed to delete: " + e.message);
    }
}

function toggleCompareRows(btn) {
    const extra = document.getElementById("compare-extra-rows");
    if (!extra) return;
    const expanded = !extra.hidden;
    extra.hidden = expanded;
    const count = btn.dataset.count;
    btn.textContent = expanded ? `Show ${count} more rows` : "Show fewer rows";
}

function backToList() {
    currentView = "list";
    selectedIds.clear();
    updateCompareButton();
    loadReports();
}

// ---------------------------------------------------------------------------
// Radar chart — pure SVG, uses BENCHMARKS scoring from score-card.js
// ---------------------------------------------------------------------------

const RADAR_METRICS = [
    { key: "win_rate",         label: "Win Rate" },
    { key: "profit_factor",    label: "Profit Factor" },
    { key: "sharpe_ratio",     label: "Sharpe" },
    { key: "max_drawdown_pct", label: "Low DD" },
    { key: "risk_reward_ratio",label: "R:R" },
    { key: "expectancy",       label: "Expectancy" },
];

function radarNormalize(key, value) {
    const bench = BENCHMARKS[key];
    if (!bench) return 0;
    let subScore;
    if (bench.higher) {
        const ratio = value / bench.target;
        if (ratio >= 2) subScore = 100;
        else if (ratio >= 1) subScore = 70 + (ratio - 1) * 30;
        else subScore = Math.max(0, ratio * 70);
    } else {
        if (value <= 0) subScore = 100;
        else if (value <= bench.target) subScore = 70 + ((bench.target - value) / bench.target) * 30;
        else subScore = Math.max(0, 70 - ((value - bench.target) / (bench.target * 2)) * 70);
    }
    return Math.max(0, Math.min(100, subScore)) / 100;
}

function renderRadarChart(leftStats, rightStats, leftLabel, rightLabel) {
    const n = RADAR_METRICS.length;
    const cx = 200, cy = 195, r = 130;
    const levels = 4;
    const LEFT_COLOR = "#007AFF";
    const RIGHT_COLOR = "#FF9500";

    function angleFor(i) {
        return (Math.PI * 2 * i / n) - Math.PI / 2;
    }

    function getPoints(stats) {
        return RADAR_METRICS.map((m, i) => {
            const norm = radarNormalize(m.key, stats[m.key] ?? 0);
            const angle = angleFor(i);
            return { x: cx + norm * r * Math.cos(angle), y: cy + norm * r * Math.sin(angle) };
        });
    }

    function ptsStr(pts) {
        return pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    }

    // Grid polygon levels
    let grid = "";
    for (let l = 1; l <= levels; l++) {
        const fr = (r * l) / levels;
        const pts = RADAR_METRICS.map((_, i) => {
            const a = angleFor(i);
            return `${(cx + fr * Math.cos(a)).toFixed(1)},${(cy + fr * Math.sin(a)).toFixed(1)}`;
        }).join(" ");
        grid += `<polygon points="${pts}" fill="none" stroke="#D2D2D7" stroke-width="${l === levels ? 1.5 : 0.75}"/>`;
    }

    // Axis lines + labels
    let axes = "";
    let labels = "";
    RADAR_METRICS.forEach((m, i) => {
        const a = angleFor(i);
        const ex = (cx + r * Math.cos(a)).toFixed(1);
        const ey = (cy + r * Math.sin(a)).toFixed(1);
        axes += `<line x1="${cx}" y1="${cy}" x2="${ex}" y2="${ey}" stroke="#D2D2D7" stroke-width="1"/>`;

        const lx = cx + (r + 24) * Math.cos(a);
        const ly = cy + (r + 24) * Math.sin(a);
        let anchor = "middle";
        const cosA = Math.cos(a);
        if (cosA > 0.25) anchor = "start";
        else if (cosA < -0.25) anchor = "end";
        labels += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}" dominant-baseline="central" class="radar-label">${m.label}</text>`;
    });

    // Data polygons
    const leftPts = getPoints(leftStats);
    const rightPts = getPoints(rightStats);

    const leftDots = leftPts.map(p =>
        `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" fill="${LEFT_COLOR}"/>`).join("");
    const rightDots = rightPts.map(p =>
        `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" fill="${RIGHT_COLOR}"/>`).join("");

    return `
        <div class="radar-section">
            <h2>Radar Comparison</h2>
            <div class="radar-wrap">
                <svg viewBox="0 0 400 390" class="radar-svg" aria-label="Radar comparison chart">
                    ${grid}
                    ${axes}
                    <polygon points="${ptsStr(rightPts)}" fill="${RIGHT_COLOR}" fill-opacity="0.18" stroke="${RIGHT_COLOR}" stroke-width="2" stroke-linejoin="round"/>
                    <polygon points="${ptsStr(leftPts)}" fill="${LEFT_COLOR}" fill-opacity="0.18" stroke="${LEFT_COLOR}" stroke-width="2" stroke-linejoin="round"/>
                    ${rightDots}
                    ${leftDots}
                    ${labels}
                </svg>
                <div class="radar-legend">
                    <div class="radar-legend-item">
                        <span class="radar-legend-swatch" style="background:${LEFT_COLOR}"></span>
                        <span>${escHtml(leftLabel)}</span>
                    </div>
                    <div class="radar-legend-item">
                        <span class="radar-legend-swatch" style="background:${RIGHT_COLOR}"></span>
                        <span>${escHtml(rightLabel)}</span>
                    </div>
                </div>
            </div>
        </div>`;
}
