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
const CX = 450, CY = 330, CAT_RADIUS = 170, ARC_SPREAD = 110;
const STAT_NODE_R = 28; // radius of a stat circle

function _rad(deg) { return deg * Math.PI / 180; }

/**
 * Compute the minimum spoke length so that adjacent stat nodes (each with
 * radius STAT_NODE_R) have at least MIN_GAP pixels of clearance between them.
 */
function _statRadius(n) {
    const MIN_GAP = 10;
    const MIN_CHORD = STAT_NODE_R * 2 + MIN_GAP; // 66px
    if (n <= 1) return 145;
    const halfAngle = _rad(ARC_SPREAD / (2 * (n - 1)));
    return Math.max(145, Math.ceil(MIN_CHORD / (2 * Math.sin(halfAngle))));
}

function _buildLayout() {
    const categories = STAT_GRAPH_CONFIG.map(cat => {
        const catX = CX + CAT_RADIUS * Math.cos(_rad(cat.angle));
        const catY = CY + CAT_RADIUS * Math.sin(_rad(cat.angle));
        const n = cat.stats.length;
        const spread = ARC_SPREAD / Math.max(n - 1, 1);
        const statR = _statRadius(n);

        const stats = cat.stats.map((s, i) => {
            const offset = (i - (n - 1) / 2) * spread;
            const a = cat.angle + offset;
            const sx = catX + statR * Math.cos(_rad(a));
            const sy = catY + statR * Math.sin(_rad(a));
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

// ---------------------------------------------------------------------------
// Layout persistence (localStorage)
// ---------------------------------------------------------------------------

function _storageKey(accountId) { return `swLayout_${accountId}`; }

function _saveLayout(accountId, svgEl, tx, ty, scale) {
    const vp = svgEl && svgEl.querySelector("#web-viewport");
    const nodes = {};
    if (vp) {
        vp.querySelectorAll(".web-node").forEach(n => {
            const m = (n.getAttribute("transform") || "").match(/translate\(([^,]+),([^)]+)\)/);
            if (!m) return;
            const id = n.dataset.nodeType === "center" ? "center"
                : n.dataset.nodeType === "category" ? `cat_${n.dataset.category}`
                : `stat_${n.dataset.category}_${n.dataset.stat}`;
            nodes[id] = { x: parseFloat(m[1]), y: parseFloat(m[2]) };
        });
    }
    try {
        localStorage.setItem(_storageKey(accountId), JSON.stringify({
            nodes,
            pan: { tx, ty, scale },
        }));
    } catch (_) {}
}

function _loadLayout(accountId) {
    try { return JSON.parse(localStorage.getItem(_storageKey(accountId))); } catch (_) { return null; }
}

function _clearLayout(accountId) {
    try { localStorage.removeItem(_storageKey(accountId)); } catch (_) {}
}

/** Recompute all connector endpoints from current node transform attributes. */
function _syncConnectors(svgEl) {
    const vp = svgEl.querySelector("#web-viewport");
    if (!vp) return;

    const pos = {};
    vp.querySelectorAll(".web-node").forEach(n => {
        const m = (n.getAttribute("transform") || "").match(/translate\(([^,]+),([^)]+)\)/);
        if (!m) return;
        const id = n.dataset.nodeType === "center" ? "center"
            : n.dataset.nodeType === "category" ? `cat_${n.dataset.category}`
            : `stat_${n.dataset.category}_${n.dataset.stat}`;
        pos[id] = { x: parseFloat(m[1]), y: parseFloat(m[2]) };
    });

    vp.querySelectorAll(".web-connector").forEach(l => {
        const catKey = l.dataset.cat;
        const statKey = l.dataset.stat;
        if (!statKey) {
            const c = pos["center"], cp = pos[`cat_${catKey}`];
            if (c)  { l.setAttribute("x1", c.x);  l.setAttribute("y1", c.y);  }
            if (cp) { l.setAttribute("x2", cp.x); l.setAttribute("y2", cp.y); }
        } else {
            const cp = pos[`cat_${catKey}`], sp = pos[`stat_${catKey}_${statKey}`];
            if (cp) { l.setAttribute("x1", cp.x); l.setAttribute("y1", cp.y); }
            if (sp) { l.setAttribute("x2", sp.x); l.setAttribute("y2", sp.y); }
        }
    });
}

/** Apply saved node positions to the SVG and sync connectors. */
function _applyNodes(svgEl, savedNodes) {
    if (!savedNodes) return;
    const vp = svgEl.querySelector("#web-viewport");
    if (!vp) return;

    vp.querySelectorAll(".web-node").forEach(n => {
        const id = n.dataset.nodeType === "center" ? "center"
            : n.dataset.nodeType === "category" ? `cat_${n.dataset.category}`
            : `stat_${n.dataset.category}_${n.dataset.stat}`;
        const p = savedNodes[id];
        if (p) n.setAttribute("transform", `translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`);
    });

    _syncConnectors(svgEl);
}

// Pan/zoom constants
const ZOOM_MIN = 0.45, ZOOM_MAX = 3.0;
const VBW = 900, VBH = 660;

// Clamp pan so the graph content never fully leaves the viewport.
// Content bounding box in SVG space (before transform): x=[150,750], y=[30,630].
function _clampPan(tx, ty, scale) {
    const MARGIN = 120; // SVG units that must remain visible
    return {
        tx: Math.max(MARGIN - 750 * scale, Math.min(VBW - MARGIN - 150 * scale, tx)),
        ty: Math.max(MARGIN - 630 * scale, Math.min(VBH - MARGIN - 30  * scale, ty)),
    };
}

function _attachPanZoom(svgEl, lockBtn, onLockChange, initialTransform, onSave) {
    const vp = svgEl.querySelector("#web-viewport");
    if (!vp) return;

    const initTx = initialTransform?.tx ?? 0;
    const initTy = initialTransform?.ty ?? 0;
    const initS  = initialTransform?.scale ?? 1;

    let scale = initS, tx = initTx, ty = initTy;
    let targetScale = initS, targetTx = initTx, targetTy = initTy;
    vp.setAttribute("transform", `translate(${tx},${ty}) scale(${scale})`);
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
            if (onSave) onSave(tx, ty, scale);
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
        svgEl.style.cursor = locked ? "default" : "grab";
        if (onLockChange) onLockChange(val);
    }

    // Wheel → zoom centred on cursor
    svgEl.addEventListener("wheel", e => {
        if (locked) return; // let the page scroll
        e.preventDefault();

        const rect = svgEl.getBoundingClientRect();
        const sx = VBW / rect.width, sy = VBH / rect.height;
        const mx = (e.clientX - rect.left) * sx;
        const my = (e.clientY - rect.top)  * sy;

        // Accumulate wheel delta smoothly
        const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
        const newScale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, targetScale * factor));
        const ratio = newScale / targetScale;

        const clamped = _clampPan(mx + (targetTx - mx) * ratio, my + (targetTy - my) * ratio, newScale);
        targetTx = clamped.tx;
        targetTy = clamped.ty;
        targetScale = newScale;
        scheduleAnimate();
    }, { passive: false });

    // Drag to pan
    svgEl.addEventListener("mousedown", e => {
        if (locked || e.button !== 0) return;
        if (e.target.closest(".web-node")) return; // let node-drag handle it
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
        const sx = VBW / rect.width, sy = VBH / rect.height;
        const clamped = _clampPan(targetTx + (e.clientX - lastX) * sx, targetTy + (e.clientY - lastY) * sy, targetScale);
        targetTx = clamped.tx;
        targetTy = clamped.ty;
        lastX = e.clientX;
        lastY = e.clientY;
        applyInstant(); // pan feels best without interpolation lag
    });

    window.addEventListener("mouseup", () => {
        if (!dragging) return;
        dragging = false;
        svgEl.style.cursor = locked ? "default" : "grab";
        if (onSave) onSave(tx, ty, scale);
    });

    function triggerReset() {
        targetScale = 1; targetTx = 0; targetTy = 0;
        scheduleAnimate();
    }

    // Lock button
    lockBtn.addEventListener("click", e => {
        e.stopPropagation();
        setLocked(!locked);
    });

    // Start locked by default
    setLocked(true);

    return { isLocked: () => locked, triggerReset };
}

function _attachNodeDrag(svgEl, isLockedFn, isActiveFn, onDragEnd) {
    const vp = svgEl.querySelector("#web-viewport");
    if (!vp) return;

    let dragNode = null;
    let dragOffsetX = 0, dragOffsetY = 0;
    let dragStartLocal = { x: 0, y: 0 };
    let childNodes = [];
    let childInitialPositions = [];
    let moved = false;

    function getVpTransform() {
        const t = vp.getAttribute("transform") || "";
        const m = t.match(/translate\(([^,]+),([^)]+)\)\s*scale\(([^)]+)\)/);
        if (!m) return { tx: 0, ty: 0, s: 1 };
        return { tx: parseFloat(m[1]), ty: parseFloat(m[2]), s: parseFloat(m[3]) };
    }

    function screenToLocal(clientX, clientY) {
        const rect = svgEl.getBoundingClientRect();
        const svgX = (clientX - rect.left) * (VBW / rect.width);
        const svgY = (clientY - rect.top)  * (VBH / rect.height);
        const { tx, ty, s } = getVpTransform();
        return { x: (svgX - tx) / s, y: (svgY - ty) / s };
    }

    function getNodePos(node) {
        const t = node.getAttribute("transform") || "translate(0,0)";
        const m = t.match(/translate\(([^,]+),([^)]+)\)/);
        return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : { x: 0, y: 0 };
    }

    function updateConnectors(node, nx, ny) {
        const type = node.dataset.nodeType;
        const catKey = node.dataset.category;
        const statKey = node.dataset.stat;

        if (type === "center") {
            vp.querySelectorAll(".web-connector[data-cat]:not([data-stat])").forEach(l => {
                l.setAttribute("x1", nx); l.setAttribute("y1", ny);
            });
        } else if (type === "category") {
            vp.querySelectorAll(`.web-connector[data-cat="${catKey}"]:not([data-stat])`).forEach(l => {
                l.setAttribute("x2", nx); l.setAttribute("y2", ny);
            });
            vp.querySelectorAll(`.web-connector[data-cat="${catKey}"][data-stat]`).forEach(l => {
                l.setAttribute("x1", nx); l.setAttribute("y1", ny);
            });
        } else if (type === "stat") {
            vp.querySelectorAll(`.web-connector[data-cat="${catKey}"][data-stat="${statKey}"]`).forEach(l => {
                l.setAttribute("x2", nx); l.setAttribute("y2", ny);
            });
        }
    }

    svgEl.addEventListener("mousedown", e => {
        if (isLockedFn() || !isActiveFn() || e.button !== 0) return;
        const node = e.target.closest(".web-node");
        if (!node) return;
        e.stopPropagation(); // prevent pan starting

        const pos = screenToLocal(e.clientX, e.clientY);
        const nodePos = getNodePos(node);
        dragNode = node;
        dragOffsetX = nodePos.x - pos.x;
        dragOffsetY = nodePos.y - pos.y;
        dragStartLocal = pos;
        moved = false;

        // If dragging a category node, collect child stat nodes and their initial positions
        if (node.dataset.nodeType === "category") {
            const catKey = node.dataset.category;
            childNodes = [...vp.querySelectorAll(`.web-node--stat[data-category="${catKey}"]`)];
            childInitialPositions = childNodes.map(cn => getNodePos(cn));
            childNodes.forEach(cn => vp.appendChild(cn));
        } else {
            childNodes = [];
            childInitialPositions = [];
        }

        // Bring dragged node to front, always keep center on top
        vp.appendChild(node);
        const center = vp.querySelector(".web-node--center");
        if (center && center !== node) vp.appendChild(center);

        svgEl.classList.add("nodes-dragging");
    });

    window.addEventListener("mousemove", e => {
        if (!dragNode) return;
        moved = true;
        const pos = screenToLocal(e.clientX, e.clientY);
        const nx = pos.x + dragOffsetX;
        const ny = pos.y + dragOffsetY;
        dragNode.setAttribute("transform", `translate(${nx.toFixed(1)},${ny.toFixed(1)})`);
        updateConnectors(dragNode, nx, ny);

        // Move children along with category node
        if (childNodes.length > 0) {
            const ddx = pos.x - dragStartLocal.x;
            const ddy = pos.y - dragStartLocal.y;
            childNodes.forEach((cn, i) => {
                const cnx = childInitialPositions[i].x + ddx;
                const cny = childInitialPositions[i].y + ddy;
                cn.setAttribute("transform", `translate(${cnx.toFixed(1)},${cny.toFixed(1)})`);
                updateConnectors(cn, cnx, cny);
            });
        }
    });

    window.addEventListener("mouseup", () => {
        if (!dragNode) return;
        if (moved) {
            // Suppress the click event so it doesn't accidentally set lockedNode
            svgEl.addEventListener("click", e => e.stopImmediatePropagation(), { once: true, capture: true });
            if (onDragEnd) onDragEnd();
        }
        svgEl.classList.remove("nodes-dragging");
        dragNode = null;
        moved = false;
    });
}

/** Restore all node transforms and connector endpoints to original layout positions. */
function _resetNodes(svgEl, layout, accountId) {
    if (accountId) _clearLayout(accountId);
    const vp = svgEl.querySelector("#web-viewport");
    if (!vp) return;

    const center = vp.querySelector(".web-node--center");
    if (center) center.setAttribute("transform", `translate(${CX},${CY})`);

    for (const cat of layout.categories) {
        const catNode = vp.querySelector(`.web-node--cat[data-category="${cat.key}"]`);
        if (catNode) catNode.setAttribute("transform", `translate(${cat.x.toFixed(1)},${cat.y.toFixed(1)})`);

        for (const s of cat.stats) {
            const statNode = vp.querySelector(`.web-node--stat[data-stat="${s.key}"][data-category="${cat.key}"]`);
            if (statNode) statNode.setAttribute("transform", `translate(${s.x.toFixed(1)},${s.y.toFixed(1)})`);
        }
    }

    vp.querySelectorAll(".web-connector").forEach(l => {
        const catKey = l.dataset.cat;
        const statKey = l.dataset.stat;
        const cat = layout.categories.find(c => c.key === catKey);
        if (!cat) return;
        if (!statKey) {
            l.setAttribute("x1", CX);           l.setAttribute("y1", CY);
            l.setAttribute("x2", cat.x.toFixed(1)); l.setAttribute("y2", cat.y.toFixed(1));
        } else {
            const s = cat.stats.find(st => st.key === statKey);
            if (!s) return;
            l.setAttribute("x1", cat.x.toFixed(1)); l.setAttribute("y1", cat.y.toFixed(1));
            l.setAttribute("x2", s.x.toFixed(1));   l.setAttribute("y2", s.y.toFixed(1));
        }
    });
}

/**
 * Public entry point. Called from dashboard.js after stats HTML is injected.
 * @param {HTMLElement} panelEl  — the .stats-web-panel container
 * @param {object}      stats   — raw stats object from API
 */
function renderStatsWeb(panelEl, stats, accountId) {
    if (!panelEl || !stats) return;

    const svgEl = panelEl.querySelector(".stats-web-svg");
    const tipEl = panelEl.querySelector(".stats-web-tooltip");
    if (!svgEl || !tipEl) return;

    const { score, grade } = computeOverallScore(stats);
    const layout = _buildLayout();
    svgEl.innerHTML = _buildSvgString(layout, stats, score, grade);

    // Restore persisted node positions (if any)
    const saved = accountId ? _loadLayout(accountId) : null;
    if (saved?.nodes) _applyNodes(svgEl, saved.nodes);

    // Inject control buttons into panel
    const controls = document.createElement("div");
    controls.className = "stats-web-controls";
    controls.innerHTML = `
        <button class="stats-web-btn stats-web-btn--reset" data-tooltip="Reset view" aria-label="Reset chart view">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
                <polyline points="23 4 23 10 17 10"/>
                <polyline points="1 20 1 14 7 14"/>
                <path d="M3.51 9a9 9 0 0114.85-3.36L23 10"/>
                <path d="M20.49 15a9 9 0 01-14.85 3.36L1 14"/>
            </svg>
        </button>
        <button class="stats-web-btn stats-web-btn--nodes" data-tooltip="Move nodes" aria-label="Toggle node movement">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round" width="17" height="17">
                <line x1="12" y1="2" x2="12" y2="22"/>
                <line x1="2" y1="12" x2="22" y2="12"/>
                <polyline points="9 5 12 2 15 5"/>
                <polyline points="9 19 12 22 15 19"/>
                <polyline points="5 9 2 12 5 15"/>
                <polyline points="19 9 22 12 19 15"/>
            </svg>
        </button>
        <button class="stats-web-btn stats-web-btn--lock" data-tooltip="Lock pan &amp; zoom" aria-label="Lock chart">
            <svg class="swb-lock-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75"
                 stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
                <rect x="4" y="9" width="12" height="9" rx="2"/>
                <path d="M7 9V6a3 3 0 0 1 6 0v3"/>
                <circle cx="10" cy="14" r="1.2" fill="currentColor" stroke="none"/>
            </svg>
        </button>`;
    panelEl.appendChild(controls);

    // Confirm dialog
    const confirmEl = document.createElement("div");
    confirmEl.className = "swc-overlay";
    confirmEl.setAttribute("hidden", "");
    confirmEl.innerHTML = `
        <div class="swc-box">
            <p class="swc-msg">Reset chart view and node positions?</p>
            <div class="swc-actions">
                <button class="swc-btn swc-btn--cancel">Cancel</button>
                <button class="swc-btn swc-btn--ok">Reset</button>
            </div>
        </div>`;
    panelEl.appendChild(confirmEl);

    const resetBtn  = controls.querySelector(".stats-web-btn--reset");
    const nodesBtn  = controls.querySelector(".stats-web-btn--nodes");
    const lockBtn   = controls.querySelector(".stats-web-btn--lock");

    let nodesMoveActive = false;

    nodesBtn.addEventListener("click", e => {
        e.stopPropagation();
        nodesMoveActive = !nodesMoveActive;
        nodesBtn.classList.toggle("stats-web-btn--active", nodesMoveActive);
        svgEl.classList.toggle("nodes-mode", nodesMoveActive);
    });

    // currentPan is a shared reference updated by _attachPanZoom callbacks
    const currentPan = { tx: saved?.pan?.tx ?? 0, ty: saved?.pan?.ty ?? 0, scale: saved?.pan?.scale ?? 1 };
    const saveFn = (tx, ty, scale) => {
        currentPan.tx = tx; currentPan.ty = ty; currentPan.scale = scale;
        if (accountId) _saveLayout(accountId, svgEl, tx, ty, scale);
    };

    _attachHoverListeners(svgEl, tipEl, stats);
    const { isLocked, triggerReset } = _attachPanZoom(svgEl, lockBtn, (locked) => {
        if (locked && nodesMoveActive) {
            nodesMoveActive = false;
            nodesBtn.classList.remove("stats-web-btn--active");
            svgEl.classList.remove("nodes-mode");
        }
    }, saved?.pan ?? null, saveFn);
    _attachNodeDrag(svgEl, isLocked, () => nodesMoveActive,
        () => { if (accountId) _saveLayout(accountId, svgEl, currentPan.tx, currentPan.ty, currentPan.scale); });

    // Reset button → show confirm dialog
    resetBtn.addEventListener("click", e => {
        e.stopPropagation();
        confirmEl.removeAttribute("hidden");
        confirmEl.querySelector(".swc-btn--cancel").focus();
    });

    confirmEl.querySelector(".swc-btn--cancel").addEventListener("click", () => {
        confirmEl.setAttribute("hidden", "");
    });

    confirmEl.querySelector(".swc-btn--ok").addEventListener("click", () => {
        confirmEl.setAttribute("hidden", "");
        triggerReset();
        _resetNodes(svgEl, layout, accountId);
    });

    // Dismiss on backdrop click
    confirmEl.addEventListener("click", e => {
        if (e.target === confirmEl) confirmEl.setAttribute("hidden", "");
    });
}
