let selectedAccountId = null;
let accounts = [];
let dockerReady = false; // true when daemon is running + image is built
let _dockerCheckTimer = null; // single timer ref to prevent duplicate polling chains
let _refreshFab = null; // floating refresh button element
let _snapshotFab = null; // floating snapshot button element
let _refreshing = false; // guard against double-clicks
let _currentStats = null; // last loaded stats for snapshot scoring

// BENCHMARKS, evalBenchmark, computeOverallScore, renderScoreCard, toggleScoreBreakdown
// are defined in score-card.js (loaded before this file).

// STAT_CATEGORIES and STAT_TOOLTIPS removed — replaced by Signal Graph (stats-web.js)

document.addEventListener("DOMContentLoaded", () => {
    checkDocker();
    loadAccounts();

    document.getElementById("btn-add").addEventListener("click", openModal);
    document.getElementById("modal-close").addEventListener("click", closeModal);
    document.getElementById("modal-cancel").addEventListener("click", closeModal);
    document.getElementById("account-form").addEventListener("submit", onAddAccount);

});

function scheduleDockerCheck(delayMs) {
    clearTimeout(_dockerCheckTimer);
    _dockerCheckTimer = setTimeout(checkDocker, delayMs);
}

async function checkDocker() {
    try {
        const status = await api.getDockerStatus();
        const banner = document.getElementById("docker-banner");
        const wasReady = dockerReady;
        dockerReady = status.docker_available && status.daemon_running && status.image_built;

        if (!status.docker_available || !status.daemon_running) {
            banner.className = "docker-banner setup-banner";
            banner.innerHTML = `
                <div class="setup-banner__content">
                    <div class="setup-banner__icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"/>
                            <polyline points="12 6 12 12 16 14"/>
                        </svg>
                    </div>
                    <div class="setup-banner__text">
                        <h3 class="setup-banner__title">Getting things ready</h3>
                        <p class="setup-banner__desc">Your trading environment is warming up. This should only take a moment.</p>
                    </div>
                    <div class="spinner"></div>
                </div>
            `;
            banner.style.display = "block";
            // Re-check frequently until the daemon is responsive
            scheduleDockerCheck(5000);
        } else if (!status.image_built) {
            banner.className = "docker-banner setup-banner";
            banner.innerHTML = `
                <div class="setup-banner__content">
                    <div class="setup-banner__icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                            <path d="M2 17l10 5 10-5"/>
                            <path d="M2 12l10 5 10-5"/>
                        </svg>
                    </div>
                    <div class="setup-banner__text">
                        <h3 class="setup-banner__title">Welcome — let's get you set up</h3>
                        <p class="setup-banner__desc">Your trading environment needs a one-time setup before you can connect accounts. This typically takes 5-15 minutes and only happens once.</p>
                    </div>
                    <button class="btn btn-primary setup-banner__btn" onclick="buildImage()">
                        <span>Set Up Now</span>
                        <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
                    </button>
                </div>
            `;
            banner.style.display = "block";
            // Keep polling in case image becomes available
            scheduleDockerCheck(15000);
        } else {
            banner.style.display = "none";
            // Keep polling at a slower cadence so dockerReady stays current
            scheduleDockerCheck(30000);
        }

        // Re-render account content area whenever readiness changes
        if (wasReady !== dockerReady && selectedAccountId) {
            const acc = accounts.find(a => a.id === selectedAccountId);
            if (acc && acc.container_status !== "running") {
                renderContainerStopped(selectedAccountId);
            }
        }
    } catch (e) {
        console.error("Docker check failed:", e);
        // On error, mark docker as not ready and keep retrying
        const wasReady = dockerReady;
        dockerReady = false;
        if (wasReady && selectedAccountId) {
            const acc = accounts.find(a => a.id === selectedAccountId);
            if (acc && acc.container_status !== "running") {
                renderContainerStopped(selectedAccountId);
            }
        }
        scheduleDockerCheck(5000);
    }
}

let _buildTimerInterval = null;

const BUILD_PHASES = [
    { label: "Downloading base components", minTime: 0 },
    { label: "Installing trading platform", minTime: 60 },
    { label: "Configuring environment", minTime: 180 },
    { label: "Finalizing setup", minTime: 360 },
];

function _formatElapsed(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function _getCurrentPhase(elapsed) {
    let phase = BUILD_PHASES[0];
    for (const p of BUILD_PHASES) {
        if (elapsed >= p.minTime) phase = p;
    }
    return phase;
}

async function buildImage() {
    const banner = document.getElementById("docker-banner");
    let elapsed = 0;

    function renderBuildProgress() {
        const phase = _getCurrentPhase(elapsed);
        const phaseIndex = BUILD_PHASES.indexOf(phase);

        const stepsHtml = BUILD_PHASES.map((p, i) => {
            let stepCls = "setup-step";
            if (i < phaseIndex) stepCls += " setup-step--done";
            else if (i === phaseIndex) stepCls += " setup-step--active";
            return `<div class="${stepCls}"><span class="setup-step__dot"></span><span class="setup-step__label">${p.label}</span></div>`;
        }).join("");

        banner.className = "docker-banner setup-banner setup-banner--building";
        banner.innerHTML = `
            <div class="setup-build__content">
                <div class="setup-build__header">
                    <div class="setup-build__pulse"></div>
                    <div>
                        <h3 class="setup-banner__title">Setting up your trading environment</h3>
                        <p class="setup-build__subtitle">This is a one-time process. Feel free to grab a coffee while we get things ready.</p>
                    </div>
                </div>
                <div class="setup-build__progress">
                    <div class="setup-build__bar-track">
                        <div class="setup-build__bar-fill" style="width: ${Math.min(95, (elapsed / 600) * 100)}%"></div>
                    </div>
                    <span class="setup-build__elapsed">${_formatElapsed(elapsed)} elapsed</span>
                </div>
                <div class="setup-steps">${stepsHtml}</div>
            </div>
        `;
        banner.style.display = "block";
    }

    renderBuildProgress();
    _buildTimerInterval = setInterval(() => {
        elapsed++;
        renderBuildProgress();
    }, 1000);

    try {
        const result = await api.buildImage();
        clearInterval(_buildTimerInterval);
        _buildTimerInterval = null;

        if (result.status === "ok") {
            dockerReady = true;
            banner.className = "docker-banner setup-banner setup-banner--success";
            banner.innerHTML = `
                <div class="setup-success__content">
                    <svg class="setup-success__check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                        <polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                    <div>
                        <h3 class="setup-banner__title">You're all set!</h3>
                        <p class="setup-build__subtitle">Your trading environment is ready. You can now connect and start your accounts.</p>
                    </div>
                </div>
            `;
            setTimeout(() => {
                banner.classList.add("setup-banner--fade-out");
                setTimeout(() => { banner.style.display = "none"; }, 500);
            }, 3000);
            if (selectedAccountId) renderContainerStopped(selectedAccountId);
        }
    } catch (e) {
        clearInterval(_buildTimerInterval);
        _buildTimerInterval = null;

        banner.className = "docker-banner setup-banner setup-banner--error";
        banner.innerHTML = `
            <div class="setup-error__content">
                <svg class="setup-error__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <div>
                    <h3 class="setup-banner__title">Setup ran into a problem</h3>
                    <p class="setup-build__subtitle">Something went wrong during the setup process. This can sometimes happen on the first attempt — trying again usually resolves it.</p>
                </div>
                <button class="btn btn-primary setup-banner__btn" onclick="buildImage()">
                    <span>Try Again</span>
                </button>
            </div>
        `;
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
    hideRefreshFab();
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

    hideRefreshFab();
    content.innerHTML = `<div class="loading"><div class="spinner"></div>Loading statistics...</div>`;

    try {
        const stats = await api.getStats(id);
        renderStats(stats);
    } catch (e) {
        hideRefreshFab();
        content.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${e.message}</p></div>`;
    }
}

async function startContainer(id) {
    // Guard: if Docker isn't ready, show the disabled state instead of attempting
    if (!dockerReady) {
        renderContainerStopped(id);
        return;
    }

    // Fresh check — dockerReady may be stale if polling hasn't caught a change
    try {
        const status = await api.getDockerStatus();
        dockerReady = status.docker_available && status.daemon_running && status.image_built;
        if (!dockerReady) {
            checkDocker();
            renderContainerStopped(id);
            return;
        }
    } catch (e) {
        dockerReady = false;
        checkDocker();
        renderContainerStopped(id);
        return;
    }

    const content = document.getElementById("dashboard-content");
    hideRefreshFab();
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

    // Poll for bridge readiness (container takes 2-3 min under QEMU)
    const maxWait = 360;
    const pollInterval = 2;
    for (let i = 0; i < maxWait; i += pollInterval) {
        const elapsed = Math.floor(i / 60);
        const secs = i % 60;
        const timeStr = elapsed > 0 ? `${elapsed}m ${secs}s` : `${secs}s`;
        content.innerHTML = `<div class="loading"><div class="spinner"></div>Container starting... waiting for MT5 terminal (${timeStr})</div>`;

        await new Promise(r => setTimeout(r, pollInterval * 1000));
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
            hideRefreshFab();
            document.getElementById("dashboard-content").innerHTML = `
                <div class="empty-state"><h3>Select an Account</h3><p>Choose an account from the sidebar to view statistics.</p></div>
            `;
        }
        await loadAccounts();
    } catch (e) {
        alert("Failed to remove: " + e.message);
    }
}

function renderStats(s) {
    _currentStats = s;
    const content = document.getElementById("dashboard-content");

    const scoreCardHtml = renderScoreCard(s);

    content.innerHTML = `
        ${scoreCardHtml}
        <div class="stats-web-panel">
            <svg class="stats-web-svg" viewBox="0 0 900 600" xmlns="http://www.w3.org/2000/svg"
                 preserveAspectRatio="xMidYMid meet"></svg>
            <div class="stats-web-tooltip" aria-live="polite"></div>
        </div>

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

    renderStatsWeb(content.querySelector(".stats-web-panel"), s);
    showRefreshFab();
    showSnapshotFab();
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

// ---------------------------------------------------------------------------
// Floating refresh button — re-fetches stats for the selected account
// ---------------------------------------------------------------------------

function ensureRefreshFab() {
    if (_refreshFab) return _refreshFab;

    const btn = document.createElement("button");
    btn.className = "refresh-fab";
    btn.setAttribute("aria-label", "Refresh statistics");
    btn.setAttribute("title", "Refresh statistics");
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="23 4 23 10 17 10"/>
        <polyline points="1 20 1 14 7 14"/>
        <path d="M3.51 9a9 9 0 0114.85-3.36L23 10"/>
        <path d="M20.49 15a9 9 0 01-14.85 3.36L1 14"/>
    </svg>`;

    btn.addEventListener("click", onRefreshClick);
    document.body.appendChild(btn);
    _refreshFab = btn;
    return btn;
}

function showRefreshFab() {
    const fab = ensureRefreshFab();
    // Force reflow before adding class so the enter transition plays
    fab.classList.remove("visible");
    void fab.offsetWidth;
    fab.classList.add("visible");
}

function hideRefreshFab() {
    if (_refreshFab) {
        _refreshFab.classList.remove("visible", "refresh-fab--loading");
        _refreshing = false;
    }
    hideSnapshotFab();
}

function ensureSnapshotFab() {
    if (_snapshotFab) return _snapshotFab;

    const btn = document.createElement("button");
    btn.className = "snapshot-fab";
    btn.setAttribute("aria-label", "Save snapshot");
    btn.setAttribute("title", "Save snapshot");
    btn.innerHTML = `
        <svg class="snapshot-fab__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
        </svg>
        <span class="snapshot-fab__label">Save as Report</span>`;

    btn.addEventListener("click", saveSnapshot);
    document.body.appendChild(btn);
    _snapshotFab = btn;
    return btn;
}

function showSnapshotFab() {
    const fab = ensureSnapshotFab();
    fab.classList.remove("visible");
    void fab.offsetWidth;
    fab.classList.add("visible");
}

function hideSnapshotFab() {
    if (_snapshotFab) {
        _snapshotFab.classList.remove("visible");
    }
}

async function onRefreshClick() {
    if (_refreshing || !selectedAccountId) return;

    const acc = accounts.find(a => a.id === selectedAccountId);
    if (!acc || acc.container_status !== "running") return;

    _refreshing = true;
    _refreshFab.classList.add("refresh-fab--loading");

    try {
        const stats = await api.getStats(selectedAccountId);
        renderStats(stats);
    } catch (e) {
        console.error("Refresh failed:", e);
    } finally {
        _refreshing = false;
        if (_refreshFab) _refreshFab.classList.remove("refresh-fab--loading");
    }
}

async function saveSnapshot() {
    if (!selectedAccountId) return;
    const acc = accounts.find(a => a.id === selectedAccountId);
    if (!acc) return;

    const today = new Date().toISOString().slice(0, 10);
    const label = prompt("Label for this snapshot:", `${acc.name} — ${today}`);
    if (!label) return;

    const payload = { account_id: selectedAccountId, label };
    if (_currentStats && _currentStats.total_trades > 0) {
        const { score, grade } = computeOverallScore(_currentStats);
        payload.overall_score = score;
        payload.overall_grade = grade;
    }

    try {
        await api.createReport(payload);
        showToast("Snapshot saved");
    } catch (e) {
        alert("Failed to save snapshot: " + e.message);
    }
}

function showToast(message) {
    let toast = document.querySelector(".toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.className = "toast";
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("visible");
    setTimeout(() => toast.classList.remove("visible"), 2500);
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