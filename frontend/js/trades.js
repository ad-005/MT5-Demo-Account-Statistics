let selectedAccountId = null;
let accounts = [];
let allTrades = [];

document.addEventListener("DOMContentLoaded", () => {
    loadAccounts();
    document.getElementById("filter-form").addEventListener("submit", onFilter);
    document.getElementById("btn-reset").addEventListener("click", onReset);
});

async function loadAccounts() {
    try {
        accounts = await api.getAccounts();
        const select = document.getElementById("account-select");
        select.innerHTML = '<option value="">-- Select Account --</option>' +
            accounts.map(a => `<option value="${a.id}">${a.name} (${a.login})</option>`).join("");
        select.addEventListener("change", onAccountChange);
    } catch (e) {
        console.error("Failed to load accounts:", e);
    }
}

async function onAccountChange(e) {
    selectedAccountId = e.target.value;
    if (!selectedAccountId) return;

    const acc = accounts.find(a => a.id === selectedAccountId);
    if (acc && acc.container_status !== "running") {
        document.getElementById("trades-content").innerHTML = `
            <div class="empty-state"><h3>Container Not Running</h3><p>Start it from the dashboard first.</p></div>
        `;
        return;
    }

    await fetchTrades();
}

async function fetchTrades(filters = {}) {
    if (!selectedAccountId) return;

    const content = document.getElementById("trades-content");
    content.innerHTML = `<div class="loading"><div class="spinner"></div>Loading trades...</div>`;

    try {
        allTrades = await api.getTrades(selectedAccountId, filters);
        renderTrades(allTrades);
    } catch (e) {
        content.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${e.message}</p></div>`;
    }
}

function renderTrades(trades) {
    const content = document.getElementById("trades-content");

    if (trades.length === 0) {
        content.innerHTML = `<div class="empty-state"><h3>No Trades</h3><p>No trades match the current filters.</p></div>`;
        return;
    }

    const summary = computeSummary(trades);

    content.innerHTML = `
        <div class="stats-grid" style="margin-bottom:20px">
            <div class="stat-card"><div class="label">Filtered Trades</div><div class="value">${trades.length}</div></div>
            <div class="stat-card"><div class="label">Net P&L</div><div class="value ${summary.netPnl >= 0 ? 'positive' : 'negative'}">$${summary.netPnl.toFixed(2)}</div></div>
            <div class="stat-card"><div class="label">Win Rate</div><div class="value">${summary.winRate.toFixed(1)}%</div></div>
        </div>

        <div class="section">
            <table>
                <thead>
                    <tr>
                        <th>Ticket</th>
                        <th>Symbol</th>
                        <th>Direction</th>
                        <th>Volume</th>
                        <th>Open Price</th>
                        <th>Close Price</th>
                        <th>Open Time</th>
                        <th>Close Time</th>
                        <th>P&L</th>
                    </tr>
                </thead>
                <tbody>
                    ${trades.map(t => {
                        const pnl = t.profit + t.swap + t.commission;
                        return `<tr>
                            <td>${t.ticket}</td>
                            <td>${t.symbol}</td>
                            <td style="color:${t.direction === 'buy' ? 'var(--green)' : 'var(--red)'}">${t.direction.toUpperCase()}</td>
                            <td>${t.volume}</td>
                            <td>${t.open_price.toFixed(5)}</td>
                            <td>${t.close_price.toFixed(5)}</td>
                            <td>${t.open_time}</td>
                            <td>${t.close_time}</td>
                            <td class="${pnl >= 0 ? 'positive' : 'negative'}">$${pnl.toFixed(2)}</td>
                        </tr>`;
                    }).join("")}
                </tbody>
            </table>
        </div>
    `;
}

function computeSummary(trades) {
    let netPnl = 0;
    let wins = 0;
    trades.forEach(t => {
        const p = t.profit + t.swap + t.commission;
        netPnl += p;
        if (p > 0) wins++;
    });
    return {
        netPnl,
        winRate: trades.length > 0 ? (wins / trades.length) * 100 : 0,
    };
}

function onFilter(e) {
    e.preventDefault();
    const form = e.target;
    const filters = {
        start_date: form.start_date.value || null,
        end_date: form.end_date.value || null,
        direction: form.direction.value || null,
        symbol: form.symbol.value || null,
        min_profit: form.min_profit.value || null,
        max_profit: form.max_profit.value || null,
    };
    fetchTrades(filters);
}

function onReset() {
    document.getElementById("filter-form").reset();
    fetchTrades();
}
