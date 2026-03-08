const API_BASE = "/api";

const api = {
    async get(path, params = {}) {
        const url = new URL(API_BASE + path, window.location.origin);
        Object.entries(params).forEach(([k, v]) => {
            if (v !== null && v !== undefined && v !== "") {
                url.searchParams.set(k, v);
            }
        });
        const resp = await fetch(url);
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({ detail: resp.statusText }));
            throw new Error(err.detail || resp.statusText);
        }
        return resp.json();
    },

    async post(path, body = null) {
        const opts = {
            method: "POST",
            headers: { "Content-Type": "application/json" },
        };
        if (body) opts.body = JSON.stringify(body);
        const resp = await fetch(API_BASE + path, opts);
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({ detail: resp.statusText }));
            throw new Error(err.detail || resp.statusText);
        }
        return resp.json();
    },

    async del(path) {
        const resp = await fetch(API_BASE + path, { method: "DELETE" });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({ detail: resp.statusText }));
            throw new Error(err.detail || resp.statusText);
        }
        return resp.json();
    },

    // Accounts
    getAccounts: () => api.get("/accounts"),
    createAccount: (data) => api.post("/accounts", data),
    deleteAccount: (id) => api.del(`/accounts/${id}`),
    startContainer: (id) => api.post(`/accounts/${id}/start`),
    stopContainer: (id) => api.post(`/accounts/${id}/stop`),
    checkHealth: (id) => api.get(`/accounts/${id}/health`),

    // Trades
    getTrades: (accountId, filters = {}) => api.get(`/trades/${accountId}`, filters),

    // Stats
    getStats: (accountId, params = {}) => api.get(`/stats/${accountId}`, params),

    // Docker
    getDockerStatus: () => api.get("/docker/status"),
    buildImage: () => api.post("/docker/build"),
};
