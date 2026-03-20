// sidebar.js — shared sidebar: account list rendering + add-account modal
// Requires: api.js loaded before this file

window.sidebarAccounts = [];

async function loadSidebarAccounts() {
    try {
        window.sidebarAccounts = await api.getAccounts();
        document.dispatchEvent(new CustomEvent("sidebar:loaded", { detail: window.sidebarAccounts }));
    } catch (e) {
        console.error("Failed to load sidebar accounts:", e);
    }
    return window.sidebarAccounts;
}

function renderSidebarAccounts(selectedId) {
    const list = document.getElementById("account-list");
    if (!list) return;
    const accs = window.sidebarAccounts;
    if (!accs || accs.length === 0) {
        list.innerHTML = "<p style='color:var(--text-muted);font-size:13px;padding:8px 12px;'>No accounts added yet.</p>";
        return;
    }
    list.innerHTML = accs.map(acc => `
        <div class="account-item ${acc.id === selectedId ? 'selected' : ''}"
             onclick="sidebarAccountClick('${acc.id}')">
            <div class="info">
                <span class="name">${acc.name}</span>
                <span class="login">${acc.login} - ${acc.server}</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
                <span class="status-dot ${acc.container_status === 'running' ? 'running' : 'stopped'}"></span>
                <button class="btn btn-danger btn-sm" onclick="event.stopPropagation();sidebarRemoveAccount('${acc.id}')">x</button>
            </div>
        </div>
    `).join("");
}

function sidebarAccountClick(id) {
    document.dispatchEvent(new CustomEvent("sidebar:accountclick", { detail: { id } }));
}

async function sidebarRemoveAccount(id) {
    if (!confirm("Remove this account? The container will be stopped.")) return;
    try {
        await api.deleteAccount(id);
        await loadSidebarAccounts();
        renderSidebarAccounts();
        document.dispatchEvent(new CustomEvent("sidebar:accountremoved", { detail: { id } }));
    } catch (e) {
        alert("Failed to remove: " + e.message);
    }
}

function initSidebar() {
    document.getElementById("btn-add")?.addEventListener("click", _sidebarOpenModal);
    document.getElementById("modal-close")?.addEventListener("click", _sidebarCloseModal);
    document.getElementById("modal-cancel")?.addEventListener("click", _sidebarCloseModal);
    document.getElementById("account-form")?.addEventListener("submit", _sidebarOnAddAccount);
}

function _sidebarOpenModal() {
    document.getElementById("modal-overlay").classList.add("active");
}

function _sidebarCloseModal() {
    document.getElementById("modal-overlay").classList.remove("active");
    document.getElementById("account-form").reset();
}

async function _sidebarOnAddAccount(e) {
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
        _sidebarCloseModal();
        await loadSidebarAccounts();
        renderSidebarAccounts();
        document.dispatchEvent(new CustomEvent("sidebar:accountadded"));
    } catch (err) {
        alert("Failed to add account: " + err.message);
    }
}
