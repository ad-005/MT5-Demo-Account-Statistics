// =============================================================================
// Signal Graph — Radial stats web visualisation
// Depends on: score-card.js (computeOverallScore, computeCategoryScore, evalBenchmark, BENCHMARKS)
// =============================================================================

const STAT_GRAPH_CONFIG = [
    {
        key: "performance",
        label: "Performance",
        angle: 315,
        color: "#34C759",
        glowColor: "#34C759",
        filterId: "glow-perf",
        stats: [
            {
                key: "net_profit",
                label: "Net Profit",
                format: v => "$" + v.toFixed(2),
                description: "Total money made minus total money lost across all trades.",
            },
            {
                key: "win_rate",
                label: "Win Rate",
                format: v => v + "%",
                description: "Percentage of trades that closed with a profit.",
            },
            {
                key: "profit_factor",
                label: "Profit Factor",
                format: v => (typeof v === "number" ? v.toFixed(2) : v),
                description: "Total winnings divided by total losses. Above 1.5 is solid.",
            },
            {
                key: "average_profit",
                label: "Avg Win",
                format: v => "$" + v.toFixed(2),
                description: "Average dollar amount gained on profitable trades.",
            },
            {
                key: "largest_win",
                label: "Lrg Win",
                format: v => "$" + v.toFixed(2),
                description: "The single biggest profit made on any one trade.",
            },
            {
                key: "expectancy",
                label: "Expect.",
                format: v => "$" + v.toFixed(2),
                description: "Average expected profit or loss per trade.",
            },
        ],
    },
    {
        key: "risk",
        label: "Risk",
        angle: 45,
        color: "#FF3B30",
        glowColor: "#FF3B30",
        filterId: "glow-risk",
        stats: [
            {
                key: "max_drawdown",
                label: "Max DD $",
                format: v => "$" + Math.abs(v).toFixed(2),
                description: "Largest drop in account value from peak to trough, in dollars.",
            },
            {
                key: "max_drawdown_pct",
                label: "Max DD %",
                format: v => v.toFixed(2) + "%",
                description: "Max drawdown as a percentage of peak value. Prop firms cap at 10%.",
            },
            {
                key: "average_loss",
                label: "Avg Loss",
                format: v => "$" + Math.abs(v).toFixed(2),
                description: "Average dollar amount lost on unprofitable trades.",
            },
            {
                key: "largest_loss",
                label: "Lrg Loss",
                format: v => "$" + Math.abs(v).toFixed(2),
                description: "The single biggest loss suffered on any one trade.",
            },
        ],
    },
    {
        key: "ratios",
        label: "Ratios",
        angle: 225,
        color: "#A78BFA",
        glowColor: "#A78BFA",
        filterId: "glow-ratio",
        stats: [
            {
                key: "sharpe_ratio",
                label: "Sharpe",
                format: v => (typeof v === "number" ? v.toFixed(2) : v),
                description: "Risk-adjusted return. Above 1.0 is decent; above 2.0 is excellent.",
            },
            {
                key: "sortino_ratio",
                label: "Sortino",
                format: v => (typeof v === "number" ? v.toFixed(2) : v),
                description: "Like Sharpe but only penalises downside volatility. Above 1.0 is decent.",
            },
            {
                key: "risk_reward_ratio",
                label: "R:R",
                format: v => (typeof v === "number" ? v.toFixed(2) : v),
                description: "Average win size divided by average loss size. Higher is better.",
            },
        ],
    },
    {
        key: "volume",
        label: "Volume",
        angle: 135,
        color: "#FF9500",
        glowColor: "#FF9500",
        filterId: "glow-vol",
        stats: [
            {
                key: "total_trades",
                label: "Trades",
                format: v => String(v),
                description: "Total number of buy or sell trades placed in the period.",
            },
            {
                key: "buy_percentage",
                label: "Buy %",
                format: v => v + "%",
                description: "Share of trades that were buy orders.",
            },
            {
                key: "sell_percentage",
                label: "Sell %",
                format: v => v + "%",
                description: "Share of trades that were sell orders.",
            },
            {
                key: "consecutive_wins",
                label: "Con.Wins",
                format: v => String(v),
                description: "Longest winning streak in a row during the period.",
            },
            {
                key: "consecutive_losses",
                label: "Con.Loss",
                format: v => String(v),
                description: "Longest losing streak in a row during the period.",
            },
        ],
    },
];

// Layout constants
const CX = 450, CY = 310, CAT_RADIUS = 170, STAT_RADIUS = 130, ARC_SPREAD = 110;

function _rad(deg) { return deg * Math.PI / 180; }

function _buildLayout() {
    const categories = STAT_GRAPH_CONFIG.map(cat => {
        const catX = CX + CAT_RADIUS * Math.cos(_rad(cat.angle));
        const catY = CY + CAT_RADIUS * Math.sin(_rad(cat.angle));
        const n = cat.stats.length;
        const spread = ARC_SPREAD / Math.max(n - 1, 1);

        const stats = cat.stats.map((s, i) => {
            const offset = (i - (n - 1) / 2) * spread;
            const a = cat.angle + offset;
            const sx = catX + STAT_RADIUS * Math.cos(_rad(a));
            const sy = catY + STAT_RADIUS * Math.sin(_rad(a));
            return { ...s, x: sx, y: sy };
        });

        return { ...cat, x: catX, y: catY, stats };
    });

    return { center: { x: CX, y: CY }, categories };
}

function _buildDefs() {
    const allFilters = STAT_GRAPH_CONFIG.map(cat => `
        <filter id="${cat.filterId}" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="5" result="blur"/>
            <feFlood flood-color="${cat.glowColor}" flood-opacity="0.30" result="color"/>
            <feComposite in="color" in2="blur" operator="in" result="glow"/>
            <feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>`).join("");

    const centerFilter = `
        <filter id="glow-center" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="7" result="blur"/>
            <feFlood flood-color="#007AFF" flood-opacity="0.35" result="color"/>
            <feComposite in="color" in2="blur" operator="in" result="glow"/>
            <feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>`;

    return `<defs>${allFilters}${centerFilter}</defs>`;
}

function _buildConnectors(layout) {
    let html = "";
    for (const cat of layout.categories) {
        // center → category — data-cat lets us find it when activating a node
        html += `<line class="web-connector" data-cat="${cat.key}"
            x1="${CX}" y1="${CY}" x2="${cat.x.toFixed(1)}" y2="${cat.y.toFixed(1)}"
            stroke="${cat.color}" stroke-width="1" stroke-opacity="0.3"/>`;
        // category → each stat
        for (const s of cat.stats) {
            html += `<line class="web-connector" data-cat="${cat.key}" data-stat="${s.key}"
                x1="${cat.x.toFixed(1)}" y1="${cat.y.toFixed(1)}"
                x2="${s.x.toFixed(1)}" y2="${s.y.toFixed(1)}"
                stroke="${cat.color}" stroke-width="0.8" stroke-opacity="0.22"/>`;
        }
    }
    return html;
}

function _buildCategoryNode(cat, catScore) {
    const x = cat.x.toFixed(1);
    const y = cat.y.toFixed(1);
    const gradeText = catScore ? catScore.grade : "–";
    const scoreText = catScore ? String(catScore.score) : "";

    return `
        <g class="web-node web-node--cat"
           data-node-type="category"
           data-category="${cat.key}"
           data-color="${cat.color}"
           transform="translate(${x},${y})">
            <circle r="38" fill="#FFFFFF" stroke="${cat.color}" stroke-width="1.5"
                filter="url(#${cat.filterId})"/>
            <text y="-14" text-anchor="middle" font-size="7" font-family="var(--font-mono,monospace)"
                fill="${cat.color}" letter-spacing="1" font-weight="600" opacity="0.85">${cat.label.toUpperCase()}</text>
            <text y="6" text-anchor="middle" font-size="20" font-family="var(--font-mono,monospace)"
                fill="${cat.color}" font-weight="700">${gradeText}</text>
            <text y="21" text-anchor="middle" font-size="9.5" font-family="var(--font-mono,monospace)"
                fill="${cat.color}" opacity="0.7">${scoreText}</text>
        </g>`;
}

function _buildStatNode(cat, s, rawValue) {
    const x = s.x.toFixed(1);
    const y = s.y.toFixed(1);
    const formatted = rawValue !== undefined && rawValue !== null ? s.format(rawValue) : "–";
    const fLen = formatted.length;
    const valueFontSize = fLen >= 7 ? 8 : fLen >= 5 ? 9.5 : 11;

    return `
        <g class="web-node web-node--stat"
           data-node-type="stat"
           data-stat="${s.key}"
           data-category="${cat.key}"
           data-color="${cat.color}"
           data-label="${s.label}"
           data-desc="${s.description.replace(/"/g, "&quot;")}"
           data-formatted="${formatted.replace(/"/g, "&quot;")}"
           transform="translate(${x},${y})">
            <circle r="28" fill="#FFFFFF" stroke="${cat.color}" stroke-width="1"
                stroke-opacity="0.7" filter="url(#${cat.filterId})"/>
            <text y="4" text-anchor="middle" font-size="${valueFontSize}"
                font-family="var(--font-mono,monospace)" fill="${cat.color}" font-weight="600">${formatted}</text>
            <text y="42" text-anchor="middle" font-size="7.5"
                font-family="var(--font-mono,monospace)" fill="${cat.color}" opacity="0.65">${s.label}</text>
        </g>`;
}

function _buildCenterNode(score, grade) {
    return `
        <g class="web-node web-node--center"
           data-node-type="center"
           data-color="#007AFF"
           transform="translate(${CX},${CY})">
            <circle class="web-center__pulse" r="65" fill="none"
                stroke="#007AFF" stroke-width="1.5" stroke-opacity="0.2"/>
            <circle r="55" fill="#EFF6FF" stroke="#007AFF" stroke-width="2"
                filter="url(#glow-center)"/>
            <text y="-6" text-anchor="middle" font-size="28" font-family="var(--font-mono,monospace)"
                fill="#007AFF" font-weight="700">${grade}</text>
            <text y="16" text-anchor="middle" font-size="13" font-family="var(--font-mono,monospace)"
                fill="#007AFF" opacity="0.75">${score}</text>
            <text y="30" text-anchor="middle" font-size="7" font-family="var(--font-mono,monospace)"
                fill="#007AFF" opacity="0.5" letter-spacing="1">SCORE</text>
        </g>`;
}

function _buildSvgString(layout, stats, score, grade) {
    const defs = _buildDefs();
    const connectors = _buildConnectors(layout);

    let catNodes = "";
    let statNodes = "";

    for (const cat of layout.categories) {
        const catScore = computeCategoryScore(stats, cat.key);
        catNodes += _buildCategoryNode(cat, catScore);

        for (const s of cat.stats) {
            const rawValue = stats[s.key];
            statNodes += _buildStatNode(cat, s, rawValue);
        }
    }

    const centerNode = _buildCenterNode(score, grade);

    // Wrap everything in a viewport group for pan/zoom
    const content = connectors + catNodes + statNodes + centerNode;
    return defs + `<g id="web-viewport">${content}</g>`;
}

function _showTooltip(tipEl, nodeEl, stats) {
    const nodeType = nodeEl.dataset.nodeType;
    const color = nodeEl.dataset.color || "#007AFF";
    nodeEl.dataset.category && tipEl.setAttribute("data-category", nodeEl.dataset.category);

    if (nodeType === "center") {
        const { score, grade } = computeOverallScore(stats);
        tipEl.innerHTML = `
            <div class="swt__name">Overall Score</div>
            <div class="swt__value" style="color:${color}">${score}</div>
            <div class="swt__desc">Composite score across all benchmark metrics. Grade: <strong>${grade}</strong></div>`;
        tipEl.setAttribute("data-category", "center");
        tipEl.style.borderLeftColor = color;
        tipEl.classList.add("visible");
        return;
    }

    if (nodeType === "category") {
        const catKey = nodeEl.dataset.category;
        const catCfg = STAT_GRAPH_CONFIG.find(c => c.key === catKey);
        const catScore = computeCategoryScore(stats, catKey);
        const gradeStr = catScore ? `${catScore.score} — ${catScore.grade}` : "No benchmarks";
        tipEl.innerHTML = `
            <div class="swt__name">${catCfg ? catCfg.label : catKey}</div>
            <div class="swt__value" style="color:${color}">${catScore ? catScore.grade : "–"}</div>
            <div class="swt__desc">Category score: <strong>${gradeStr}</strong></div>`;
        tipEl.style.borderLeftColor = color;
        tipEl.classList.add("visible");
        return;
    }

    if (nodeType === "stat") {
        const statKey = nodeEl.dataset.stat;
        const formatted = nodeEl.dataset.formatted || "–";
        const desc = nodeEl.dataset.desc || "";
        const label = nodeEl.dataset.label || statKey;

        // Check if this stat has a benchmark
        const bench = BENCHMARKS[statKey];
        let benchHtml = "";
        const rawValue = stats[statKey];
        if (bench && rawValue !== undefined && rawValue !== null && !isNaN(rawValue)) {
            const { statusCls, statusText } = evalBenchmark(rawValue, bench);
            benchHtml = `
                <div class="swt__bench">
                    <span style="color:var(--text-muted)">${bench.label}</span>
                    <span class="bench-status ${statusCls}">${statusText}</span>
                </div>`;
        }

        tipEl.innerHTML = `
            <div class="swt__name">${label}</div>
            <div class="swt__value" style="color:${color}">${formatted}</div>
            <div class="swt__desc">${desc}</div>
            ${benchHtml}`;
        tipEl.style.borderLeftColor = color;
        tipEl.classList.add("visible");
    }
}

function _hideTooltip(tipEl) {
    tipEl.classList.remove("visible");
}

/** Mark connectors associated with the activated node as active. */
function _markConnectors(svgEl, nodeEl) {
    svgEl.querySelectorAll(".web-connector--active").forEach(l => l.classList.remove("web-connector--active"));

    const type = nodeEl.dataset.nodeType;
    const catKey = nodeEl.dataset.category;
    const statKey = nodeEl.dataset.stat;

    if (type === "center") {
        // All connectors stay visible
        svgEl.querySelectorAll(".web-connector").forEach(l => l.classList.add("web-connector--active"));
        return;
    }
    if (type === "category") {
        // center→cat + all cat→stat lines for this category
        svgEl.querySelectorAll(`.web-connector[data-cat="${catKey}"]`).forEach(l => l.classList.add("web-connector--active"));
        return;
    }
    if (type === "stat") {
        // center→cat line (no data-stat) + cat→this-stat line
        svgEl.querySelectorAll(`.web-connector[data-cat="${catKey}"]:not([data-stat])`).forEach(l => l.classList.add("web-connector--active"));
        svgEl.querySelectorAll(`.web-connector[data-cat="${catKey}"][data-stat="${statKey}"]`).forEach(l => l.classList.add("web-connector--active"));
    }
}

function _clearActive(svgEl, tipEl) {
    svgEl.classList.remove("has-active");
    svgEl.querySelectorAll(".web-node--active").forEach(n => n.classList.remove("web-node--active"));
    svgEl.querySelectorAll(".web-connector--active").forEach(l => l.classList.remove("web-connector--active"));
    _hideTooltip(tipEl);
}

function _activateNode(svgEl, tipEl, node, stats) {
    svgEl.querySelectorAll(".web-node--active").forEach(n => n.classList.remove("web-node--active"));
    svgEl.classList.add("has-active");
    node.classList.add("web-node--active");
    _markConnectors(svgEl, node);
    _showTooltip(tipEl, node, stats);
}

function _attachHoverListeners(svgEl, tipEl, stats) {
    let lockedNode = null;

    svgEl.addEventListener("mouseover", e => {
        const node = e.target.closest(".web-node");

        // Moved to empty space — restore lock or deselect
        if (!node) {
            if (lockedNode) {
                _activateNode(svgEl, tipEl, lockedNode, stats);
            } else if (svgEl.classList.contains("has-active")) {
                _clearActive(svgEl, tipEl);
            }
            return;
        }

        // Already active — skip re-fire from child element transitions
        if (node.classList.contains("web-node--active")) return;

        _activateNode(svgEl, tipEl, node, stats);
    });

    svgEl.addEventListener("mouseleave", () => {
        if (lockedNode) {
            _activateNode(svgEl, tipEl, lockedNode, stats);
        } else {
            _clearActive(svgEl, tipEl);
        }
    });

    svgEl.addEventListener("click", e => {
        const node = e.target.closest(".web-node");
        if (node) {
            lockedNode = node;
            _activateNode(svgEl, tipEl, node, stats);
        } else {
            // Clicked empty space — release lock and clear
            lockedNode = null;
            _clearActive(svgEl, tipEl);
        }
    });
}

// Pan/zoom constants
const ZOOM_MIN = 0.45, ZOOM_MAX = 3.0;

function _attachPanZoom(svgEl, resetBtn, lockBtn) {
    const vp = svgEl.querySelector("#web-viewport");
    if (!vp) return;

    let scale = 1, tx = 0, ty = 0;
    let targetScale = 1, targetTx = 0, targetTy = 0;
    let locked = false;
    let dragging = false, lastX = 0, lastY = 0;
    let rafId = null;

    // Smooth animation loop — lerps current toward target each frame
    function animate() {
        const EASE = 0.18;
        const ds = targetScale - scale;
        const dx = targetTx - tx;
        const dy = targetTy - ty;

        if (Math.abs(ds) > 0.0003 || Math.abs(dx) > 0.05 || Math.abs(dy) > 0.05) {
            scale += ds * EASE;
            tx    += dx * EASE;
            ty    += dy * EASE;
            vp.setAttribute("transform", `translate(${tx},${ty}) scale(${scale})`);
            rafId = requestAnimationFrame(animate);
        } else {
            // Snap to final value and stop
            scale = targetScale; tx = targetTx; ty = targetTy;
            vp.setAttribute("transform", `translate(${tx},${ty}) scale(${scale})`);
            rafId = null;
        }
    }

    function scheduleAnimate() {
        if (!rafId) rafId = requestAnimationFrame(animate);
    }

    function applyInstant() {
        scale = targetScale; tx = targetTx; ty = targetTy;
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        vp.setAttribute("transform", `translate(${tx},${ty}) scale(${scale})`);
    }

    function setLocked(val) {
        locked = val;
        lockBtn.classList.toggle("stats-web-btn--active", locked);
        lockBtn.title = locked ? "Unlock pan & zoom" : "Lock pan & zoom (enable page scroll)";
        lockBtn.querySelector(".swb-icon").textContent = locked ? "🔒" : "🔓";
        svgEl.style.cursor = locked ? "default" : "grab";
    }

    // Wheel → zoom centred on cursor
    svgEl.addEventListener("wheel", e => {
        if (locked) return; // let the page scroll
        e.preventDefault();

        const rect = svgEl.getBoundingClientRect();
        const vbW = 900, vbH = 600;
        const sx = vbW / rect.width, sy = vbH / rect.height;
        const mx = (e.clientX - rect.left) * sx;
        const my = (e.clientY - rect.top)  * sy;

        // Accumulate wheel delta smoothly
        const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
        const newScale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, targetScale * factor));
        const ratio = newScale / targetScale;

        targetTx = mx + (targetTx - mx) * ratio;
        targetTy = my + (targetTy - my) * ratio;
        targetScale = newScale;
        scheduleAnimate();
    }, { passive: false });

    // Drag to pan
    svgEl.addEventListener("mousedown", e => {
        if (locked || e.button !== 0) return;
        dragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
        svgEl.style.cursor = "grabbing";
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        // Snap targets to current so drag starts from actual position
        targetScale = scale; targetTx = tx; targetTy = ty;
    });

    window.addEventListener("mousemove", e => {
        if (!dragging) return;
        const rect = svgEl.getBoundingClientRect();
        const vbW = 900, vbH = 600;
        const sx = vbW / rect.width, sy = vbH / rect.height;
        targetTx += (e.clientX - lastX) * sx;
        targetTy += (e.clientY - lastY) * sy;
        lastX = e.clientX;
        lastY = e.clientY;
        applyInstant(); // pan feels best without interpolation lag
    });

    window.addEventListener("mouseup", () => {
        if (!dragging) return;
        dragging = false;
        svgEl.style.cursor = locked ? "default" : "grab";
    });

    // Reset button
    resetBtn.addEventListener("click", e => {
        e.stopPropagation();
        targetScale = 1; targetTx = 0; targetTy = 0;
        scheduleAnimate();
    });

    // Lock button
    lockBtn.addEventListener("click", e => {
        e.stopPropagation();
        setLocked(!locked);
    });

    // Double-click also resets (convenience)
    svgEl.addEventListener("dblclick", () => {
        targetScale = 1; targetTx = 0; targetTy = 0;
        scheduleAnimate();
    });
}

/**
 * Public entry point. Called from dashboard.js after stats HTML is injected.
 * @param {HTMLElement} panelEl  — the .stats-web-panel container
 * @param {object}      stats   — raw stats object from API
 */
function renderStatsWeb(panelEl, stats) {
    if (!panelEl || !stats) return;

    const svgEl = panelEl.querySelector(".stats-web-svg");
    const tipEl = panelEl.querySelector(".stats-web-tooltip");
    if (!svgEl || !tipEl) return;

    const { score, grade } = computeOverallScore(stats);
    const layout = _buildLayout();
    svgEl.innerHTML = _buildSvgString(layout, stats, score, grade);

    // Inject control buttons into panel
    const controls = document.createElement("div");
    controls.className = "stats-web-controls";
    controls.innerHTML = `
        <button class="stats-web-btn" title="Reset view" aria-label="Reset chart view">
            <span class="swb-icon">↺</span>
        </button>
        <button class="stats-web-btn" title="Lock pan &amp; zoom (enable page scroll)" aria-label="Lock chart">
            <span class="swb-icon">🔓</span>
        </button>`;
    panelEl.appendChild(controls);

    const [resetBtn, lockBtn] = controls.querySelectorAll(".stats-web-btn");

    _attachHoverListeners(svgEl, tipEl, stats);
    _attachPanZoom(svgEl, resetBtn, lockBtn);
}
