let selectedAccountId = null;
let accounts = [];
let dockerReady = false; // true when daemon is running + image is built

// ---------------------------------------------------------------------------
// Trading performance benchmarks
// Sources: industry research on professional/prop-firm trading standards.
// Each entry defines:
//   target      — the threshold value (number)
//   higher      — true if "higher is better" (false for drawdown etc.)
//   label       — short human-readable reference text shown in card
//   atTolerance — optional +/- range treated as "at target" (default 0)
// ---------------------------------------------------------------------------
const BENCHMARKS = {
    win_rate: {
        target: 50,
        higher: true,
        label: "target >= 50%",
        atTolerance: 2,
        displayName: "Win Rate",
        statCardLabel: "Win Rate",
        weight: 0.15,
        format: v => v + "%",
    },
    profit_factor: {
        target: 1.5,
        higher: true,
        label: "target >= 1.5",
        atTolerance: 0.1,
        displayName: "Profit Factor",
        statCardLabel: "Profit Factor",
        weight: 0.20,
        format: v => v.toFixed(2),
    },
    sharpe_ratio: {
        target: 1.0,
        higher: true,
        label: "target >= 1.0",
        atTolerance: 0.1,
        displayName: "Sharpe Ratio",
        statCardLabel: "Sharpe Ratio",
        weight: 0.15,
        format: v => v.toFixed(2),
    },
    sortino_ratio: {
        target: 1.0,
        higher: true,
        label: "target >= 1.0",
        atTolerance: 0.1,
        displayName: "Sortino Ratio",
        statCardLabel: "Sortino Ratio",
        weight: 0,
        format: v => v.toFixed(2),
    },
    max_drawdown_pct: {
        target: 10,
        higher: false,
        label: "target <= 10%",
        atTolerance: 1,
        displayName: "Max Drawdown",
        statCardLabel: "Max DD %",
        weight: 0.20,
        format: v => v.toFixed(2) + "%",
    },
    risk_reward_ratio: {
        target: 1.5,
        higher: true,
        label: "target >= 1.5",
        atTolerance: 0.15,
        displayName: "R:R Ratio",
        statCardLabel: "R:R Ratio",
        weight: 0.10,
        format: v => v.toFixed(2),
    },
    expectancy: {
        target: 5,
        higher: true,
        label: "target >= $5",
        atTolerance: 1,
        displayName: "Expectancy",
        statCardLabel: "Expectancy",
        weight: 0.10,
        format: v => "$" + v.toFixed(2),
    },
    consistency: {
        target: 30,
        higher: false,
        label: "best trade < 30% of profit",
        atTolerance: 3,
        displayName: "Consistency",
        statCardLabel: "Consistency",
        weight: 0.10,
        format: v => v.toFixed(1) + "%",
    },
};

// ---------------------------------------------------------------------------
// Stat card category mapping — determines top-border color accent.
//   performance = green, risk = red, ratio = blue, volume = yellow, streak = gray
// ---------------------------------------------------------------------------
const STAT_CATEGORIES = {
    "Total Trades":    "volume",
    "Win Rate":        "performance",
    "Net Profit":      "performance",
    "Profit Factor":   "performance",
    "Sharpe Ratio":    "ratio",
    "Sortino Ratio":   "ratio",
    "Max Drawdown":    "risk",
    "Max DD %":        "risk",
    "Buy %":           "volume",
    "Sell %":          "volume",
    "Avg Win":         "performance",
    "Avg Loss":        "risk",
    "Largest Win":     "performance",
    "Largest Loss":    "risk",
    "Expectancy":      "ratio",
    "R:R Ratio":       "ratio",
    "Consec. Wins":    "streak",
    "Consec. Losses":  "streak",
};

// ---------------------------------------------------------------------------
// Plain-language tooltip descriptions for each stat card.
// Written to be understandable by someone with no trading background.
// ---------------------------------------------------------------------------
const STAT_TOOLTIPS = {
    "Total Trades":    "The total number of buy or sell trades placed during the selected period.",
    "Win Rate":        "Out of all trades placed, this is the percentage that closed with a profit. A 60% win rate means 6 out of every 10 trades made money.",
    "Net Profit":      "The total money made minus the total money lost across all trades. Positive means you're ahead; negative means you're behind.",
    "Profit Factor":   "Divide total winnings by total losses. A value of 2.0 means for every $1 lost, $2 was won. Anything above 1.0 is profitable; above 1.5 is considered solid.",
    "Sharpe Ratio":    "A measure of how well the account is performing compared to the risk taken. A higher number means better returns relative to the ups and downs in the account balance. Above 1.0 is decent; above 2.0 is excellent.",
    "Sortino Ratio":   "Similar to the Sharpe Ratio, but only counts the bad (downward) swings as risk. Higher is better. Above 1.0 is decent.",
    "Max Drawdown":    "The largest drop in account value from a peak to the lowest point that followed it, shown in dollars.",
    "Max DD %":        "The same as Max Drawdown, but shown as a percentage of the account's peak value. Lower is better. Most prop firms cap this at 10%.",
    "Buy %":           "The share of trades that were 'buy' (betting the price would go up), out of all trades placed.",
    "Sell %":          "The share of trades that were 'sell' (betting the price would go down), out of all trades placed.",
    "Avg Win":         "The average dollar amount gained on trades that were profitable. A higher number here is better.",
    "Avg Loss":        "The average dollar amount lost on trades that were unprofitable. A lower (smaller) number here is better.",
    "Largest Win":     "The single biggest profit made on any one trade in this period.",
    "Largest Loss":    "The single biggest loss suffered on any one trade in this period.",
    "Expectancy":      "On average, how much money do you expect to make (or lose) per trade? A positive number means the strategy is expected to profit over time.",
    "R:R Ratio":       "Risk-to-Reward ratio. Compares the average win size to the average loss size. A ratio of 2.0 means wins are twice as large as losses on average. Higher is better.",
    "Consec. Wins":    "The longest streak of winning trades in a row during this period.",
    "Consec. Losses":  "The longest streak of losing trades in a row during this period.",
};

document.addEventListener("DOMContentLoaded", () => {
    checkDocker();
    loadAccounts();

    document.getElementById("btn-add").addEventListener("click", openModal);
    document.getElementById("modal-close").addEventListener("click", closeModal);
    document.getElementById("modal-cancel").addEventListener("click", closeModal);
    document.getElementById("account-form").addEventListener("submit", onAddAccount);

    // Dismiss any open tooltip when clicking outside
    document.addEventListener("click", () => {
        document.querySelectorAll(".stat-tooltip.visible").forEach(t => {
            t.classList.remove("visible");
            t.closest(".stat-card").classList.remove("tooltip-active");
        });
    });
});

function toggleTooltip(iconEl) {
    const card = iconEl.closest(".stat-card");
    const tooltip = card.querySelector(".stat-tooltip");
    if (!tooltip) return;

    // Close all other tooltips and lower their cards
    document.querySelectorAll(".stat-tooltip.visible").forEach(t => {
        if (t !== tooltip) {
            t.classList.remove("visible");
            t.closest(".stat-card").classList.remove("tooltip-active");
        }
    });

    const isOpen = tooltip.classList.toggle("visible");
    card.classList.toggle("tooltip-active", isOpen);
}

async function checkDocker() {
    try {
        const status = await api.getDockerStatus();
        const banner = document.getElementById("docker-banner");
        dockerReady = status.docker_available && status.daemon_running && status.image_built;

        if (!status.docker_available || !status.daemon_running) {
            banner.className = "docker-banner warning";
            banner.innerHTML = `
                <span class="message">${status.message}</span>
                <div class="spinner"></div>
            `;
            banner.style.display = "flex";
            // Re-check until the daemon is responsive
            setTimeout(checkDocker, 5000);
        } else if (!status.image_built) {
            banner.className = "docker-banner warning";
            banner.innerHTML = `
                <span class="message">${status.message}</span>
                <button class="btn btn-primary btn-sm" onclick="buildImage()">Build Image</button>
            `;
            banner.style.display = "flex";
        } else {
            banner.style.display = "none";
        }

        // Re-render account content area to reflect docker readiness change
        if (selectedAccountId) {
            const acc = accounts.find(a => a.id === selectedAccountId);
            if (acc && acc.container_status !== "running") {
                renderContainerStopped(selectedAccountId);
            }
        }
    } catch (e) {
        console.error("Docker check failed:", e);
    }
}

async function buildImage() {
    const banner = document.getElementById("docker-banner");
    banner.innerHTML = `<span class="message">Building image... this may take several minutes.</span><div class="spinner"></div>`;
    try {
        const result = await api.buildImage();
        banner.innerHTML = `<span class="message">${result.message}</span>`;
        if (result.status === "ok") {
            dockerReady = true;
            banner.className = "docker-banner";
            setTimeout(() => banner.style.display = "none", 3000);
            // Re-render account area so Start Container button appears
            if (selectedAccountId) renderContainerStopped(selectedAccountId);
        }
    } catch (e) {
        banner.innerHTML = `<span class="message">Build failed: ${e.message}</span>`;
        banner.className = "docker-banner error";
    }
}

async function loadAccounts() {
    try {
        accounts = await api.getAccounts();
        renderAccounts();
    } catch (e) {
        console.error("Failed to load accounts:", e);
    }
}

function renderAccounts() {
    const list = document.getElementById("account-list");
    if (accounts.length === 0) {
        list.innerHTML = "<p style='color: var(--text-muted); font-size: 13px; padding: 8px 12px;'>No accounts added yet.</p>";
        return;
    }

    list.innerHTML = accounts.map(acc => `
        <div class="account-item ${acc.id === selectedAccountId ? 'selected' : ''}"
             onclick="selectAccount('${acc.id}')">
            <div class="info">
                <span class="name">${acc.name}</span>
                <span class="login">${acc.login} - ${acc.server}</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
                <span class="status-dot ${acc.container_status === 'running' ? 'running' : 'stopped'}"></span>
                <button class="btn btn-danger btn-sm" onclick="event.stopPropagation();removeAccount('${acc.id}')">x</button>
            </div>
        </div>
    `).join("");
}

function renderContainerStopped(id) {
    const content = document.getElementById("dashboard-content");
    if (!dockerReady) {
        content.innerHTML = `
            <div class="empty-state">
                <h3>Container Not Running</h3>
                <p>Waiting for Docker environment to be ready...</p>
                <button class="btn btn-primary" style="margin-top:16px" disabled
                    title="Docker daemon is still starting — please wait">
                    <span class="spinner" style="width:14px;height:14px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:8px"></span>
                    Warming Up
                </button>
            </div>
        `;
    } else {
        content.innerHTML = `
            <div class="empty-state">
                <h3>Container Not Running</h3>
                <p>Start the container to view statistics.</p>
                <button class="btn btn-primary" style="margin-top:16px" onclick="startContainer('${id}')">Start Container</button>
            </div>
        `;
    }
}

async function selectAccount(id) {
    selectedAccountId = id;
    renderAccounts();

    const acc = accounts.find(a => a.id === id);
    if (!acc) return;

    const content = document.getElementById("dashboard-content");

    if (acc.container_status !== "running") {
        renderContainerStopped(id);
        return;
    }

    content.innerHTML = `<div class="loading"><div class="spinner"></div>Loading statistics...</div>`;

    try {
        const stats = await api.getStats(id);
        renderStats(stats);
    } catch (e) {
        content.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${e.message}</p></div>`;
    }
}

async function startContainer(id) {
    // Guard: if Docker isn't ready, show the disabled state instead of attempting
    if (!dockerReady) {
        renderContainerStopped(id);
        return;
    }

    const content = document.getElementById("dashboard-content");
    content.innerHTML = `<div class="loading"><div class="spinner"></div>Starting container...</div>`;

    try {
        await api.startContainer(id);
    } catch (e) {
        // Start failed — re-check Docker status; if Docker went down, show disabled button
        dockerReady = false;
        checkDocker(); // async re-check will update dockerReady and re-render
        renderContainerStopped(id);
        return;
    }

    // Poll for bridge readiness (container takes 3-4 min under QEMU)
    const maxWait = 360;
    for (let i = 0; i < maxWait; i += 5) {
        const elapsed = Math.floor(i / 60);
        const secs = i % 60;
        const timeStr = elapsed > 0 ? `${elapsed}m ${secs}s` : `${secs}s`;
        content.innerHTML = `<div class="loading"><div class="spinner"></div>Container starting... waiting for MT5 terminal (${timeStr})</div>`;

        await new Promise(r => setTimeout(r, 5000));
        try {
            const health = await api.checkHealth(id);
            if (health.ready) {
                await loadAccounts();
                await selectAccount(id);
                return;
            }
        } catch (e) {
            // Bridge not ready yet, keep polling
        }
    }

    content.innerHTML = `<div class="empty-state"><h3>Timeout</h3><p>Container started but MT5 bridge didn't become ready. Try refreshing.</p></div>`;
    await loadAccounts();
}

async function removeAccount(id) {
    if (!confirm("Remove this account? The container will be stopped.")) return;
    try {
        await api.deleteAccount(id);
        if (selectedAccountId === id) {
            selectedAccountId = null;
            document.getElementById("dashboard-content").innerHTML = `
                <div class="empty-state"><h3>Select an Account</h3><p>Choose an account from the sidebar to view statistics.</p></div>
            `;
        }
        await loadAccounts();
    } catch (e) {
        alert("Failed to remove: " + e.message);
    }
}

/**
 * Evaluate a benchmark: returns { status: "above"|"at"|"below", statusText, statusCls }
 * This is the SINGLE evaluation function used by both stat cards and the score breakdown.
 */
function evalBenchmark(rawValue, benchmark) {
    const tol = benchmark.atTolerance ?? 0;
    const diff = rawValue - benchmark.target;

    if (Math.abs(diff) <= tol) {
        return { statusCls: "at", statusText: "At target" };
    } else if (benchmark.higher ? diff > tol : diff < -tol) {
        return { statusCls: "above", statusText: benchmark.higher ? "Above" : "Within" };
    } else {
        return { statusCls: "below", statusText: benchmark.higher ? "Below" : "Exceeds" };
    }
}

/**
 * Compute overall score from raw stats using BENCHMARKS.
 * Each benchmark contributes a 0-100 sub-score weighted by its .weight.
 * Methodology informed by prop firm evaluation criteria (FTMO, Myfxbook)
 * and institutional risk-adjusted performance standards (CFA/GIPS).
 *
 * Consistency metric: largest single win as % of total profit (lower = better).
 * Drawdown penalty: 0.8x multiplier if DD > 20%, 0.5x if DD > 30% (prop firm hard gates).
 * Low sample warning: flagged when total_trades < 20.
 */
function computeOverallScore(stats) {
    const results = [];
    let weightedSum = 0;

    // Compute consistency value: best trade as % of total profit
    // Lower is better — a high value means one trade dominates profits
    const consistencyValue = stats.total_profit > 0
        ? (stats.largest_win / stats.total_profit) * 100
        : 100; // No profit = worst consistency

    for (const [key, bench] of Object.entries(BENCHMARKS)) {
        if (!bench.weight) continue;

        // Use computed consistency value; all other metrics come from stats
        const value = key === "consistency" ? consistencyValue : (stats[key] ?? 0);
        const { statusCls } = evalBenchmark(value, bench);

        let subScore;
        if (bench.higher) {
            const ratio = value / bench.target;
            if (ratio >= 2) subScore = 100;
            else if (ratio >= 1) subScore = 70 + (ratio - 1) * 30;
            else subScore = Math.max(0, ratio * 70);
        } else {
            // Lower is better (drawdown, consistency)
            if (value <= 0) subScore = 100;
            else if (value <= bench.target) subScore = 70 + ((bench.target - value) / bench.target) * 30;
            else subScore = Math.max(0, 70 - ((value - bench.target) / (bench.target * 2)) * 70);
        }

        subScore = Math.round(Math.max(0, Math.min(100, subScore)));
        results.push({ key, bench, value, subScore, statusCls });
        weightedSum += subScore * bench.weight;
    }

    // Drawdown penalty multiplier (mimics prop firm hard gates)
    const dd = stats.max_drawdown_pct ?? 0;
    let ddPenalty = 1.0;
    if (dd > 30) ddPenalty = 0.5;
    else if (dd > 20) ddPenalty = 0.8;
    weightedSum *= ddPenalty;

    const lowSample = stats.total_trades < 20;
    const overall = Math.round(Math.max(1, Math.min(100, weightedSum)));
    let grade;
    if (overall >= 90) grade = "A+";
    else if (overall >= 80) grade = "A";
    else if (overall >= 70) grade = "B+";
    else if (overall >= 60) grade = "B";
    else if (overall >= 50) grade = "C+";
    else if (overall >= 40) grade = "C";
    else if (overall >= 30) grade = "D";
    else grade = "F";

    return { score: overall, grade, components: results, lowSample, ddPenalty };
}

function renderScoreCard(stats) {
    if (!stats || stats.total_trades === 0) return "";

    const { score, grade, components, lowSample, ddPenalty } = computeOverallScore(stats);
    const colorClass = score >= 70 ? "score-card--green" : score >= 40 ? "score-card--yellow" : "score-card--red";

    const radius = 34;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (score / 100) * circumference;

    // Sort by sub-score ascending (worst first — things needing improvement on top)
    const sorted = [...components].sort((a, b) => a.subScore - b.subScore);

    const componentRows = sorted.map(c => {
        const weightPct = Math.round(c.bench.weight * 100);
        const formatted = c.bench.format(c.value);
        // Use the same status classes as stat card benchmarks
        const barCls = c.statusCls === "above" ? "above" : c.statusCls === "at" ? "at" : "below";
        const statusLabel = c.statusCls === "above"
            ? (c.bench.higher ? "Above" : "Within")
            : c.statusCls === "at" ? "At target"
            : (c.bench.higher ? "Below" : "Exceeds");

        // Extract short target label from benchmark (e.g. ">= 50%" from "target >= 50%")
        const shortTarget = c.bench.label.replace(/^target\s*/i, "");

        return `
            <div class="score-comp" data-card-label="${c.bench.statCardLabel}">
                <div>
                    <div class="score-comp__name">${c.bench.displayName}</div>
                    <div class="score-comp__meta">${formatted}</div>
                </div>
                <div class="score-comp__bar-wrap">
                    <div class="score-comp__bar-track">
                        <div class="score-comp__bar-fill score-comp__bar-fill--${barCls}" style="width:${c.subScore}%"></div>
                        <div class="score-comp__target" aria-label="Target: ${c.bench.label}">
                            <div class="score-comp__target-line"></div>
                            <span class="score-comp__target-label">${shortTarget}</span>
                        </div>
                    </div>
                    <span class="score-comp__bar-label">${c.subScore}</span>
                </div>
                <span class="bench-status ${barCls}">${statusLabel}</span>
            </div>`;
    }).join("");

    // Warning badges
    let badges = "";
    if (lowSample) {
        badges += `<span class="score-card__badge score-card__badge--warn">Low sample (${stats.total_trades} trades)</span>`;
    }
    if (ddPenalty < 1) {
        const pctPenalty = Math.round((1 - ddPenalty) * 100);
        badges += `<span class="score-card__badge score-card__badge--penalty">${pctPenalty}% DD penalty applied</span>`;
    }

    return `
        <div class="score-card ${colorClass}" onclick="toggleScoreBreakdown(this)">
            <div class="score-card__header">
                <svg class="score-card__gauge" viewBox="0 0 80 80">
                    <circle class="score-card__gauge-bg" cx="40" cy="40" r="${radius}"/>
                    <circle class="score-card__gauge-fill" cx="40" cy="40" r="${radius}"
                        stroke-dasharray="${circumference}"
                        stroke-dashoffset="${offset}"/>
                </svg>
                <div class="score-card__text">
                    <div class="score-card__title">Overall Score</div>
                    <div class="score-card__numbers">
                        <span class="score-card__score">${score}</span>
                        <span class="score-card__grade">${grade}</span>
                    </div>
                    <div class="score-card__label">${badges || "Click to see breakdown"}</div>
                </div>
                <svg class="score-card__chevron" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd"/>
                </svg>
            </div>
            <div class="score-card__breakdown">
                <div class="score-card__breakdown-inner">
                    ${componentRows}
                </div>
            </div>
        </div>`;
}

function toggleScoreBreakdown(el) {
    el.classList.toggle("expanded");
}

function renderStats(s) {
    const content = document.getElementById("dashboard-content");

    // Build score card (computed client-side from BENCHMARKS)
    const scoreCardHtml = renderScoreCard(s);

    // Build grouped stat cards
    const performanceCards = [
        statCard("Net Profit", "$" + s.net_profit.toFixed(2), s.net_profit >= 0),
        statCard("Win Rate", s.win_rate + "%", s.win_rate >= 50, false, BENCHMARKS.win_rate, s.win_rate),
        statCard("Profit Factor", s.profit_factor, null, false, BENCHMARKS.profit_factor, s.profit_factor),
        statCard("Avg Win", "$" + s.average_profit.toFixed(2), true),
        statCard("Largest Win", "$" + s.largest_win.toFixed(2), true),
        statCard("Expectancy", "$" + s.expectancy.toFixed(2), s.expectancy >= 0, false, BENCHMARKS.expectancy, s.expectancy),
    ].join("");

    const riskCards = [
        statCard("Max Drawdown", "$" + s.max_drawdown.toFixed(2), false, true),
        statCard("Max DD %", s.max_drawdown_pct.toFixed(2) + "%", false, true, BENCHMARKS.max_drawdown_pct, s.max_drawdown_pct),
        statCard("Avg Loss", "$" + s.average_loss.toFixed(2), false, true),
        statCard("Largest Loss", "$" + s.largest_loss.toFixed(2), false, true),
    ].join("");

    const ratioCards = [
        statCard("Sharpe Ratio", s.sharpe_ratio, s.sharpe_ratio >= 1, false, BENCHMARKS.sharpe_ratio, s.sharpe_ratio),
        statCard("Sortino Ratio", s.sortino_ratio, s.sortino_ratio >= 1, false, BENCHMARKS.sortino_ratio, s.sortino_ratio),
        statCard("R:R Ratio", s.risk_reward_ratio, null, false, BENCHMARKS.risk_reward_ratio, s.risk_reward_ratio),
    ].join("");

    const volumeCards = [
        statCard("Total Trades", s.total_trades),
        statCard("Buy %", s.buy_percentage + "%"),
        statCard("Sell %", s.sell_percentage + "%"),
        statCard("Consec. Wins", s.consecutive_wins),
        statCard("Consec. Losses", s.consecutive_losses),
    ].join("");

    content.innerHTML = `
        ${scoreCardHtml}
        <div class="stats-section-header">Performance</div>
        <div class="stats-grid">${performanceCards}</div>

        <div class="stats-section-header">Risk</div>
        <div class="stats-grid">${riskCards}</div>

        <div class="stats-section-header">Ratios</div>
        <div class="stats-grid">${ratioCards}</div>

        <div class="stats-section-header">Volume &amp; Streaks</div>
        <div class="stats-grid">${volumeCards}</div>

        <div class="section">
            <h2>Session Win Rates</h2>
            <div class="bar-chart">
                ${renderBarChart(s.session_win_rates)}
            </div>
        </div>

        <div class="section">
            <h2>Daily Win Rates</h2>
            <div class="bar-chart">
                ${renderBarChart(s.daily_win_rates)}
            </div>
        </div>

        ${Object.keys(s.symbol_breakdown).length > 0 ? `
        <div class="section">
            <h2>Symbol Breakdown</h2>
            <table>
                <thead><tr><th>Symbol</th><th>Trades</th><th>Win Rate</th><th>P&L</th></tr></thead>
                <tbody>
                    ${Object.entries(s.symbol_breakdown).map(([sym, d]) => `
                        <tr>
                            <td>${sym}</td>
                            <td>${d.trades}</td>
                            <td>${d.win_rate}%</td>
                            <td class="${d.pnl >= 0 ? 'positive' : 'negative'}">$${d.pnl.toFixed(2)}</td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
        ` : ""}

        <div style="text-align:center;margin-top:20px;padding-bottom:16px">
            <button class="btn btn-danger" style="padding:8px 24px" onclick="stopContainerUI('${selectedAccountId}')">Stop Container</button>
        </div>
    `;
}

/**
 * Render a stat card.
 * @param {string} label
 * @param {string|number} value      — display string
 * @param {boolean|null} positive    — true=green, false=red, null=neutral
 * @param {boolean} negative         — force red when true
 * @param {object|null} benchmark    — entry from BENCHMARKS (or null)
 * @param {number|null} rawValue     — numeric value for benchmark comparison
 */
function statCard(label, value, positive = null, negative = false, benchmark = null, rawValue = null) {
    let cls = "";
    if (positive === true) cls = "positive";
    else if (negative || (positive === false && positive !== null)) cls = "negative";

    // Benchmark indicator (uses shared evalBenchmark function)
    let benchmarkHtml = "";
    if (benchmark !== null && rawValue !== null && !isNaN(rawValue)) {
        const { statusCls, statusText } = evalBenchmark(rawValue, benchmark);

        benchmarkHtml = `
            <div class="stat-benchmark">
                <span class="bench-ref">${benchmark.label}</span>
                <span class="bench-status ${statusCls}">${statusText}</span>
            </div>`;
    }

    // Tooltip markup
    const tooltipText = STAT_TOOLTIPS[label] ?? null;
    const tooltipAttr = tooltipText ? ' data-tooltip="1"' : "";
    const tooltipHtml = tooltipText
        ? `<span class="stat-tooltip" role="tooltip">${tooltipText}</span>`
        : "";
    const infoIcon = tooltipText
        ? `<span class="stat-info-icon" onclick="event.stopPropagation();toggleTooltip(this)" aria-label="Info">i</span>`
        : "";

    // Category for color accent
    const category = STAT_CATEGORIES[label] || "";
    const categoryAttr = category ? ` data-category="${category}"` : "";

    return `
        <div class="stat-card"${tooltipAttr}${categoryAttr} tabindex="0">
            <div class="label-row">
                <div class="label">${label}</div>${infoIcon}
            </div>
            <div class="value ${cls}">${value}</div>${benchmarkHtml}${tooltipHtml}
        </div>
    `;
}

function renderBarChart(data) {
    if (!data || Object.keys(data).length === 0) return "<p style='color:var(--text-muted)'>No data</p>";
    return Object.entries(data).map(([label, pct]) => `
        <div class="bar-row">
            <span class="bar-label">${label}</span>
            <div class="bar-track">
                <div class="bar-fill ${pct >= 50 ? 'green' : 'blue'}" style="width:${Math.max(pct, 4)}%"></div>
            </div>
            <span class="bar-value">${pct}%</span>
        </div>
    `).join("");
}

async function stopContainerUI(id) {
    try {
        await api.stopContainer(id);
        await loadAccounts();
        await selectAccount(id);
    } catch (e) {
        alert("Failed to stop: " + e.message);
    }
}

function openModal() {
    document.getElementById("modal-overlay").classList.add("active");
}

function closeModal() {
    document.getElementById("modal-overlay").classList.remove("active");
    document.getElementById("account-form").reset();
}

async function onAddAccount(e) {
    e.preventDefault();
    const form = e.target;
    const data = {
        name: form.name.value,
        login: parseInt(form.login.value),
        password: form.password.value,
        server: form.server.value,
        trade_mode: form.trade_mode.value,
    };
    try {
        await api.createAccount(data);
        closeModal();
        await loadAccounts();
    } catch (err) {
        alert("Failed to add account: " + err.message);
    }
}