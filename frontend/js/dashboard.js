let selectedAccountId = null;
let accounts = [];

document.addEventListener("DOMContentLoaded", () => {
    checkDocker();
    loadAccounts();

    document.getElementById("btn-add").addEventListener("click", openModal);
    document.getElementById("modal-close").addEventListener("click", closeModal);
    document.getElementById("modal-cancel").addEventListener("click", closeModal);
    document.getElementById("account-form").addEventListener("submit", onAddAccount);
});

async function checkDocker() {
    try {
        const status = await api.getDockerStatus();
        const banner = document.getElementById("docker-banner");
        if (!status.docker_available || !status.daemon_running) {
            banner.className = "docker-banner warning";
            banner.innerHTML = `
                <span class="message">${status.message}</span>
            `;
            banner.style.display = "flex";
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
            banner.className = "docker-banner";
            setTimeout(() => banner.style.display = "none", 3000);
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
        list.innerHTML = "<p style='color: var(--text-secondary); font-size: 13px; padding: 8px 12px;'>No accounts added yet.</p>";
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

async function selectAccount(id) {
    selectedAccountId = id;
    renderAccounts();

    const acc = accounts.find(a => a.id === id);
    if (!acc) return;

    const content = document.getElementById("dashboard-content");

    if (acc.container_status !== "running") {
        content.innerHTML = `
            <div class="empty-state">
                <h3>Container Not Running</h3>
                <p>Start the container to view statistics.</p>
                <button class="btn btn-primary" style="margin-top:16px" onclick="startContainer('${id}')">Start Container</button>
            </div>
        `;
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
    const content = document.getElementById("dashboard-content");
    content.innerHTML = `<div class="loading"><div class="spinner"></div>Starting container...</div>`;

    try {
        await api.startContainer(id);
    } catch (e) {
        content.innerHTML = `<div class="empty-state"><h3>Failed to Start</h3><p>${e.message}</p></div>`;
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

function renderStats(s) {
    const content = document.getElementById("dashboard-content");
    content.innerHTML = `
        <div class="stats-grid">
            ${statCard("Total Trades", s.total_trades)}
            ${statCard("Win Rate", s.win_rate + "%", s.win_rate >= 50)}
            ${statCard("Net Profit", "$" + s.net_profit.toFixed(2), s.net_profit >= 0)}
            ${statCard("Profit Factor", s.profit_factor)}
            ${statCard("Sharpe Ratio", s.sharpe_ratio, s.sharpe_ratio >= 1)}
            ${statCard("Sortino Ratio", s.sortino_ratio, s.sortino_ratio >= 1)}
            ${statCard("Max Drawdown", "$" + s.max_drawdown.toFixed(2), false, true)}
            ${statCard("Max DD %", s.max_drawdown_pct.toFixed(2) + "%", false, true)}
            ${statCard("Buy %", s.buy_percentage + "%")}
            ${statCard("Sell %", s.sell_percentage + "%")}
            ${statCard("Avg Win", "$" + s.average_profit.toFixed(2), true)}
            ${statCard("Avg Loss", "$" + s.average_loss.toFixed(2), false, true)}
            ${statCard("Largest Win", "$" + s.largest_win.toFixed(2), true)}
            ${statCard("Largest Loss", "$" + s.largest_loss.toFixed(2), false, true)}
            ${statCard("Expectancy", "$" + s.expectancy.toFixed(2), s.expectancy >= 0)}
            ${statCard("R:R Ratio", s.risk_reward_ratio)}
            ${statCard("Consec. Wins", s.consecutive_wins)}
            ${statCard("Consec. Losses", s.consecutive_losses)}
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

        <div style="text-align:center;margin-top:16px">
            <button class="btn btn-primary" onclick="stopContainerUI('${selectedAccountId}')">Stop Container</button>
        </div>
    `;
}

function statCard(label, value, positive = null, negative = false) {
    let cls = "";
    if (positive === true) cls = "positive";
    else if (negative || positive === false && positive !== null) cls = "negative";
    return `
        <div class="stat-card">
            <div class="label">${label}</div>
            <div class="value ${cls}">${value}</div>
        </div>
    `;
}

function renderBarChart(data) {
    if (!data || Object.keys(data).length === 0) return "<p style='color:var(--text-secondary)'>No data</p>";
    return Object.entries(data).map(([label, pct]) => `
        <div class="bar-row">
            <span class="bar-label">${label}</span>
            <div class="bar-track">
                <div class="bar-fill ${pct >= 50 ? 'green' : 'blue'}" style="width:${Math.max(pct, 2)}%">${pct}%</div>
            </div>
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
