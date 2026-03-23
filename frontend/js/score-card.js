// ---------------------------------------------------------------------------
// Shared: BENCHMARKS, score computation, and score card rendering.
// Used by both dashboard.js and reports.js.
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

/**
 * Evaluate a benchmark: returns { statusCls: "above"|"at"|"below", statusText }
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
 */
function computeOverallScore(stats) {
    const results = [];
    let weightedSum = 0;

    const consistencyValue = stats.total_profit > 0
        ? (stats.largest_win / stats.total_profit) * 100
        : 100;

    for (const [key, bench] of Object.entries(BENCHMARKS)) {
        if (!bench.weight) continue;

        const value = key === "consistency" ? consistencyValue : (stats[key] ?? 0);
        const { statusCls } = evalBenchmark(value, bench);

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

        subScore = Math.round(Math.max(0, Math.min(100, subScore)));
        results.push({ key, bench, value, subScore, statusCls });
        weightedSum += subScore * bench.weight;
    }

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

    const sorted = [...components].sort((a, b) => a.subScore - b.subScore);

    const componentRows = sorted.map(c => {
        const weightPct = Math.round(c.bench.weight * 100);
        const formatted = c.bench.format(c.value);
        const barCls = c.statusCls === "above" ? "above" : c.statusCls === "at" ? "at" : "below";
        const statusLabel = c.statusCls === "above"
            ? (c.bench.higher ? "Above" : "Within")
            : c.statusCls === "at" ? "At target"
            : (c.bench.higher ? "Below" : "Exceeds");
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

// ---------------------------------------------------------------------------
// Category scoring and card stack rendering
// ---------------------------------------------------------------------------

const CATEGORY_BENCHMARKS = {
    performance: ["win_rate", "profit_factor", "expectancy"],
    risk: ["max_drawdown_pct"],
    ratios: ["sharpe_ratio", "risk_reward_ratio"],
    volume: [],
};

const CATEGORY_DESCRIPTIONS = {
    performance: "Core profitability and trade quality metrics including win rate, factor strength, and expectancy.",
    risk: "Downside exposure and loss control across drawdown depth, average losses, and adverse outliers.",
    ratios: "Risk-adjusted efficiency via Sharpe, Sortino, and risk-to-reward balance.",
    volume: "Execution activity and trade flow composition, including total trades, side mix, and streak behavior.",
};

function computeCategoryScore(stats, categoryKey) {
    const keys = CATEGORY_BENCHMARKS[categoryKey];
    if (!keys || keys.length === 0) return null;

    let total = 0;
    let count = 0;

    for (const key of keys) {
        const bench = BENCHMARKS[key];
        if (!bench) continue;

        const value = stats[key] ?? 0;

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

        total += Math.round(Math.max(0, Math.min(100, subScore)));
        count++;
    }

    if (count === 0) return null;

    const score = Math.round(total / count);
    let grade;
    if (score >= 90) grade = "A+";
    else if (score >= 80) grade = "A";
    else if (score >= 70) grade = "B+";
    else if (score >= 60) grade = "B";
    else if (score >= 50) grade = "C+";
    else if (score >= 40) grade = "C";
    else if (score >= 30) grade = "D";
    else grade = "F";

    return { score, grade };
}

function renderCardStack(categoryKey, categoryName, cardCount, cardsHtml, stats) {
    const catScore = stats ? computeCategoryScore(stats, categoryKey) : null;
    const scoreClass = catScore
        ? (catScore.score >= 70 ? "card-stack__score--green" : catScore.score >= 40 ? "card-stack__score--yellow" : "card-stack__score--red")
        : "card-stack__score--muted";
    const grade = catScore ? catScore.grade : "—";
    const points = catScore ? `${catScore.score} Points` : "No score";
    const description = CATEGORY_DESCRIPTIONS[categoryKey] || `${cardCount} metrics in this category.`;

    return `
        <div class="card-stack" data-category="${categoryKey}">
            <div class="card-stack__header" onclick="toggleCardStack(this.parentElement)">
                <div class="card-stack__info">
                    <div class="card-stack__name">${categoryName}</div>
                    <div class="card-stack__desc">${description}</div>
                </div>
                <div class="card-stack__score ${scoreClass}">
                    <div class="card-stack__grade">${grade}</div>
                    <div class="card-stack__points">${points}</div>
                </div>
                <svg class="card-stack__chevron" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                    <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd"/>
                </svg>
            </div>
            <div class="card-stack__cards">
                <div class="stats-grid">${cardsHtml}</div>
            </div>
        </div>`;
}

/**
 * FLIP-animate sibling card-stacks so they glide to new positions during reflow.
 * Call before the DOM change, returns a function to call after.
 */
function _flipSiblings(grid, skip) {
    if (!grid) return () => {};
    const stacks = [...grid.querySelectorAll(".card-stack")];
    const before = stacks.map(s => s.getBoundingClientRect());

    return () => {
        stacks.forEach((s, i) => {
            if (s === skip) return; // the toggled card animates via CSS width
            const after = s.getBoundingClientRect();
            const dx = before[i].left - after.left;
            const dy = before[i].top - after.top;
            if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;

            s.style.transform = `translate(${dx}px, ${dy}px)`;
            s.style.transition = "none";
            // Force reflow so the starting transform is registered
            s.offsetHeight;
            s.style.transition = "transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)";
            s.style.transform = "";
        });

        // Clean up inline styles after animation settles
        setTimeout(() => {
            stacks.forEach(s => {
                s.style.transition = "";
                s.style.transform = "";
            });
        }, 500);
    };
}

function toggleCardStack(el) {
    const cards = el.querySelector(".card-stack__cards");
    if (!cards) return;

    // Prevent interaction during any in-progress animation
    if (el.classList.contains("collapsing") || el.classList.contains("expanding")) return;

    const grid = el.closest(".card-stacks-grid");

    if (el.classList.contains("expanded")) {
        _collapseStack(el, cards, grid);
    } else {
        _expandStack(el, cards, grid);
    }
}

function _expandStack(el, cards, grid) {
    // Phase 1: width expands to 100%, header reshapes, siblings FLIP-slide
    const play = _flipSiblings(grid, el);
    el.classList.add("expanding");
    el.offsetHeight; // force layout at new state
    play();

    // Phase 2: after width transition completes, reveal content
    setTimeout(() => {
        el.classList.add("expanded");
        el.classList.remove("expanding");

        const targetHeight = cards.scrollHeight;
        cards.style.height = "0";
        el.offsetHeight; // force layout
        cards.style.height = targetHeight + "px";

        cards.addEventListener("transitionend", function handler(e) {
            if (e.target !== cards || e.propertyName !== "height") return;
            cards.style.height = "auto";
            cards.removeEventListener("transitionend", handler);
        });
    }, 400); // matches CSS width transition duration
}

function _collapseStack(el, cards, grid) {
    // Phase 1: stat cards fade out, content height collapses
    el.classList.add("collapsing");
    cards.style.height = cards.scrollHeight + "px";
    el.offsetHeight; // force layout before animating

    // Start collapsing after a brief moment so stat card fade-out is visible
    setTimeout(() => {
        cards.style.height = "0";
    }, 50);

    // Phase 2: after content collapses, FLIP siblings then collapse el width
    cards.addEventListener("transitionend", function handler(e) {
        if (e.target !== cards || e.propertyName !== "height") return;
        cards.removeEventListener("transitionend", handler);

        // Capture sibling positions BEFORE layout change (el still at 100%)
        const stacks = [...grid.querySelectorAll(".card-stack")];
        const befores = stacks.map(s => s.getBoundingClientRect());

        // Disable el's CSS transition so layout instantly settles at 50%.
        // Without this, getBoundingClientRect() after class removal reads from
        // the transition start frame (100%), making before≈after and delta≈0.
        el.style.transition = "none";
        el.classList.remove("expanded", "collapsing");
        cards.style.height = "";
        el.offsetHeight; // force layout at 50% — now correct "after" positions

        // Compute how much wider el was (typically ~2x for 50%→100%)
        const elAfterRect = el.getBoundingClientRect();
        const elIdx = stacks.indexOf(el);
        const widthRatio = elAfterRect.width > 0 ? befores[elIdx].width / elAfterRect.width : 1;

        // Visually restore el to its "before" width via scaleX — no layout impact.
        // Layout is already at 50% (correct for FLIP below), but el visually
        // still appears 100% wide; then we animate it contracting to natural width.
        const EASE = "cubic-bezier(0.4, 0, 0.2, 1)";
        if (widthRatio > 1.01) {
            el.style.transformOrigin = "left center";
            el.style.transform = `scaleX(${widthRatio.toFixed(4)})`;
        }

        // FLIP: compute deltas and apply all starting transforms (no transitions yet)
        const flips = [];
        stacks.forEach((s, i) => {
            if (s === el) return;
            const after = s.getBoundingClientRect();
            const dx = befores[i].left - after.left;
            const dy = befores[i].top - after.top;
            if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
            s.style.transition = "none";
            s.style.transform = `translate(${dx}px, ${dy}px)`;
            flips.push(s);
        });

        // Single reflow to commit ALL starting states at once (siblings + el scaleX)
        el.offsetHeight;

        // Animate all siblings from starting position → natural position
        flips.forEach(s => {
            s.style.transition = `transform 0.4s ${EASE}`;
            s.style.transform = "";
        });

        // Animate el's scaleX from widthRatio → 1 (simultaneous with sibling FLIP)
        if (widthRatio > 1.01) {
            el.style.transition = `transform 0.4s ${EASE}`;
            el.style.transform = ""; // animate to natural (scaleX 1)
        }

        // Clean up all inline overrides after animation settles
        setTimeout(() => {
            el.style.transition = "";
            el.style.transform = "";
            el.style.transformOrigin = "";
            stacks.forEach(s => { s.style.transition = ""; s.style.transform = ""; });
        }, 450);
    });
}
