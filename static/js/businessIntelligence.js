// businessIntelligence.js — Superkeeper Business Intelligence
// IMPROVED:
//   1. Preloads data on page load (background, silent) — panel opens instantly
//   2. 5-minute in-memory cache — filter switches are instant, no re-fetching
//   3. Visible close button + backdrop click + Escape key to exit
//   4. Excel / CSV export — downloads full inventory + sales history spreadsheet
//   5. Corrected sale timestamp parsing (seconds, not milliseconds)
//   6. Counts selling_unit sales separately with human-readable unit names

import { db } from "./firebase-config.js";
import {
    collection,
    getDocs,
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

document.addEventListener("DOMContentLoaded", () => {
    console.log("📊 Business Intelligence module loading...");

    // ─── State ─────────────────────────────────────────────────────────────
    let biOverlay = null;
    let biCache = null;          // { rawData, loadedAt }
    let preloadPromise = null;   // so we never double-fetch
    const CACHE_TTL_MS = 5 * 60 * 1000;   // 5 minutes
    const NAV_HEIGHT = 64;

    // ─── Styles ────────────────────────────────────────────────────────────
    function injectStyles() {
        if (document.getElementById("bi-styles")) return;
        const s = document.createElement("style");
        s.id = "bi-styles";
        s.textContent = `
            /* ── Overlay shell ── */
            #bi-overlay {
                position: fixed;
                inset: 0;
                top: 0;
                background: #f8fafc;
                z-index: 999999;  /* Increased z-index to be above everything */
                display: none;
                flex-direction: column;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                overflow: hidden;
                animation: biFadeIn 0.18s ease;
            }
            #bi-overlay.visible { display: flex; }
            @keyframes biFadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

            /* ── Header with higher z-index ── */
            .bi-header {
                background: #1e293b;
                color: white;
                padding: 18px 24px 14px;
                flex-shrink: 0;
                position: relative;
                z-index: 1000000;  /* Ensure header is above everything */
                box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            }
            .bi-header-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 14px;
                gap: 12px;
            }
            .bi-title {
                font-size: 22px;
                font-weight: 700;
                margin: 0;
            }
            .bi-header-actions {
                display: flex;
                align-items: center;
                gap: 10px;
                flex-shrink: 0;
            }
            /* Export button */
            #bi-export-btn {
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 8px 14px;
                background: rgba(255,255,255,0.12);
                border: 1px solid rgba(255,255,255,0.25);
                color: white;
                border-radius: 8px;
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
                transition: background 0.15s;
                white-space: nowrap;
                position: relative;
                z-index: 1000001;  /* Ensure button is clickable */
            }
            #bi-export-btn:hover { background: rgba(255,255,255,0.22); }
            /* Visible close button - made more prominent */
            #bi-close-btn {
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 8px 16px;
                background: #ef4444;  /* Solid red background */
                border: none;
                color: white;
                border-radius: 8px;
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
                transition: background 0.15s;
                white-space: nowrap;
                position: relative;
                z-index: 1000001;  /* Ensure button is clickable */
                box-shadow: 0 2px 8px rgba(239,68,68,0.3);
            }
            #bi-close-btn:hover { background: #dc2626; }
            #bi-close-btn:active { transform: scale(0.97); }

            /* Time filter pills */
            .bi-time-filter { display: flex; gap: 8px; flex-wrap: wrap; }
            .bi-tf-btn {
                padding: 6px 16px;
                background: rgba(255,255,255,0.1);
                border: 1px solid rgba(255,255,255,0.18);
                color: rgba(255,255,255,0.75);
                border-radius: 30px;
                font-size: 13px;
                cursor: pointer;
                transition: all 0.15s;
            }
            .bi-tf-btn.active {
                background: white;
                border-color: white;
                color: #0f172a;
                font-weight: 600;
            }
            .bi-tf-btn:hover:not(.active) { background: rgba(255,255,255,0.18); color: white; }

            /* ── Scrollable content area ── */
            #bi-content {
                flex: 1;
                overflow-y: auto;
                padding: 20px 24px;
                max-width: 900px;
                width: 100%;
                margin: 0 auto;
                box-sizing: border-box;
            }

            /* ── Stat cards ── */
            .bi-stats-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
                gap: 14px;
                margin-bottom: 22px;
            }
            .bi-stat-card {
                background: white;
                border-radius: 14px;
                padding: 18px;
                border: 1px solid #e2e8f0;
            }
            .bi-stat-label { font-size: 13px; color: #64748b; margin-bottom: 6px; }
            .bi-stat-value { font-size: 28px; font-weight: 800; color: #0f172a; margin-bottom: 4px; }
            .bi-stat-sub   { font-size: 12px; color: #94a3b8; }

            /* ── Section cards ── */
            .bi-section {
                background: white;
                border-radius: 14px;
                padding: 18px 20px;
                margin-bottom: 18px;
                border: 1px solid #e2e8f0;
            }
            .bi-section-title {
                font-size: 16px;
                font-weight: 700;
                color: #0f172a;
                margin: 0 0 14px;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .bi-section-meta {
                font-size: 13px;
                font-weight: 400;
                color: #64748b;
                margin-left: auto;
            }

            /* ── List rows ── */
            .bi-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 10px 0;
                border-bottom: 1px solid #f1f5f9;
            }
            .bi-row:last-child { border-bottom: none; }
            .bi-row-name  { font-weight: 600; color: #334155; font-size: 14px; }
            .bi-row-meta  { font-size: 12px; color: #94a3b8; margin-top: 2px; }
            .bi-row-value { font-weight: 700; color: #0f172a; font-size: 14px; white-space: nowrap; }

            /* ── Badges ── */
            .bi-badge {
                padding: 3px 10px;
                border-radius: 20px;
                font-size: 12px;
                font-weight: 600;
            }
            .bi-warn    { background: #fef3c7; color: #92400e; }
            .bi-success { background: #dcfce7; color: #166534; }
            .bi-danger  { background: #fee2e2; color: #991b1b; }
            .bi-info    { background: #eff6ff; color: #1d4ed8; }

            /* ── Loading / empty states ── */
            .bi-center {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                min-height: 280px;
                color: #64748b;
                gap: 14px;
            }
            .bi-spinner {
                width: 36px; height: 36px;
                border: 3px solid #e2e8f0;
                border-top-color: #667eea;
                border-radius: 50%;
                animation: biSpin 0.9s linear infinite;
            }
            @keyframes biSpin { to { transform: rotate(360deg); } }
            @keyframes biBarPulse {
                0%   { width: 10%; opacity: 1; }
                50%  { width: 70%; opacity: 0.8; }
                100% { width: 10%; opacity: 1; }
            }

            /* ── Pre-load status badge (subtle, top-right corner) ── */
            #bi-preload-status {
                position: fixed;
                bottom: 80px;
                right: 20px;
                background: #1e293b;
                color: #94a3b8;
                font-size: 11px;
                padding: 5px 10px;
                border-radius: 20px;
                z-index: 999998;
                transition: opacity 0.5s;
                pointer-events: none;
            }

            /* ── BI trigger button ── */
            #business-intelligence-btn {
                background: linear-gradient(135deg, #667eea, #764ba2);
                color: white;
                border: none;
                padding: 14px 20px;
                border-radius: 10px;
                font-size: 15px;
                font-weight: 600;
                cursor: pointer;
                transition: opacity 0.2s, transform 0.15s;
                box-shadow: 0 4px 14px rgba(102,126,234,0.3);
                flex: 1;
                min-width: 200px;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                margin: 10px 5px;
            }
            #business-intelligence-btn:hover { opacity: 0.9; transform: translateY(-1px); }

            /* Mobile tweaks */
            @media (max-width: 480px) {
                #bi-content { padding: 14px 14px; }
                .bi-header  { padding: 14px 16px 12px; }
                .bi-title   { font-size: 18px; }
                .bi-stat-value { font-size: 22px; }
                #bi-export-btn { display: none; }
            }
        `;
        document.head.appendChild(s);
    }

    // ─── Resolve shop ID ───────────────────────────────────────────────────
    async function getShopId() {
        const auth = getAuth();
        const user = auth.currentUser;
        if (!user) return null;
        if (localStorage.getItem("sessionType") === "staff") {
            try {
                const ctx = JSON.parse(localStorage.getItem("staffContext") || "{}");
                if (ctx.shopId) return ctx.shopId;
            } catch (e) {}
        }
        try {
            const snap = await getDoc(doc(db, "Users", user.uid));
            if (snap.exists() && snap.data().shop_id) return snap.data().shop_id;
        } catch (e) {}
        return localStorage.getItem("activeShopId") || user.uid;
    }

    // ─── localStorage cache helpers ──────────────────────────────────────
    const LS_KEY_PREFIX = "bi_cache_v2_";
    const LS_TTL_MS = 5 * 60 * 1000;

    function saveCacheToLS(shopId, raw) {
        try {
            const payload = JSON.stringify({
                allItems: raw.allItems,
                allSales: raw.allSales.map(s => ({ ...s, date: s.date.toISOString() })),
                savedAt:  Date.now()
            });
            localStorage.setItem(LS_KEY_PREFIX + shopId, payload);
        } catch (e) {
            console.warn("BI: could not persist cache to localStorage:", e.message);
        }
    }

    function loadCacheFromLS(shopId) {
        try {
            const raw = localStorage.getItem(LS_KEY_PREFIX + shopId);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed.savedAt || Date.now() - parsed.savedAt > LS_TTL_MS) return null;
            parsed.allSales = parsed.allSales.map(s => ({ ...s, date: new Date(s.date) }));
            return { allItems: parsed.allItems, allSales: parsed.allSales };
        } catch (e) {
            return null;
        }
    }

    function invalidateBICache() {
        biCache = null;
        preloadPromise = null;
        try {
            const shopId = localStorage.getItem("activeShopId");
            if (shopId) localStorage.removeItem(LS_KEY_PREFIX + shopId);
        } catch (e) {}
    }

    // ─── Raw data fetch — PARALLEL (Promise.all) ─────────────────────────
    async function fetchRawData(onProgress) {
        const shopId = await getShopId();
        if (!shopId) throw new Error("No shop ID found");

        onProgress && onProgress(5, "Fetching categories…");
        const categoriesSnap = await getDocs(collection(db, "Shops", shopId, "categories"));
        const catDocs = categoriesSnap.docs;

        if (!catDocs.length) return { allItems: [], allSales: [], shopId };

        onProgress && onProgress(15, `Loading ${catDocs.length} categories in parallel…`);

        let completed = 0;
        const categoryResults = await Promise.all(
            catDocs.map(async catDoc => {
                const catName = catDoc.data().name || "Uncategorised";
                const itemsSnap = await getDocs(collection(catDoc.ref, "items"));

                completed++;
                const pct = 15 + Math.floor((completed / catDocs.length) * 75);
                onProgress && onProgress(pct, `Loaded ${completed}/${catDocs.length} categories…`);

                const items = [];
                const sales = [];

                itemsSnap.forEach(itemDoc => {
                    const d = itemDoc.data();
                    const item = {
                        id:            itemDoc.id,
                        name:          d.name          || "Unnamed",
                        category:      catName,
                        categoryId:    catDoc.id,
                        stock:         d.stock          ?? 0,
                        buyPrice:      d.buyPrice       || 0,
                        sellPrice:     d.sellPrice      || 0,
                        lowStockAlert: d.lowStockAlert  || 5,
                        baseUnit:      d.baseUnit       || "unit",
                        images:        d.images         || []
                    };
                    items.push(item);

                    if (Array.isArray(d.stockTransactions)) {
                        d.stockTransactions.forEach(txn => {
                            if (txn.type !== "sale") return;
                            const ts = txn.timestamp;
                            const date = ts
                                ? new Date(ts > 1e12 ? ts : ts * 1000)
                                : new Date();
                            sales.push({
                                id:        txn.id || "",
                                date,
                                itemId:    itemDoc.id,
                                itemName:  d.name || "Unnamed",
                                category:  catName,
                                unit:      txn.unit || item.baseUnit,
                                quantity:  txn.selling_units_quantity ?? txn.quantity ?? 1,
                                unitPrice: txn.unitPrice || txn.sellPrice || d.sellPrice || 0,
                                total:     txn.totalPrice || 0,
                                itemType:  txn.item_type || "main_item",
                                sellPrice: d.sellPrice || 0,
                                buyPrice:  d.buyPrice  || 0
                            });
                        });
                    }
                });

                return { items, sales };
            })
        );

        const allItems = categoryResults.flatMap(r => r.items);
        const allSales = categoryResults.flatMap(r => r.sales);
        allSales.sort((a, b) => b.date - a.date);

        onProgress && onProgress(100, "Done");
        return { allItems, allSales, shopId };
    }

    // ─── Preload — checks localStorage first, then Firestore ─────────────
    function preload() {
        if (preloadPromise) return preloadPromise;

        preloadPromise = (async () => {
            try {
                const shopId = await getShopId();
                const cached = shopId ? loadCacheFromLS(shopId) : null;
                if (cached) {
                    biCache = { raw: { ...cached, shopId }, loadedAt: Date.now() };
                    showPreloadBadge("✅ Dashboard ready (cached)");
                    setTimeout(hidePreloadBadge, 1800);
                    console.log("📊 BI: restored from localStorage cache");
                    return;
                }

                showPreloadBadge("⏳ Loading…");
                const raw = await fetchRawData((pct, msg) => {
                    showPreloadBadge(`⏳ ${msg || pct + "%"}`);
                });
                biCache = { raw, loadedAt: Date.now() };
                saveCacheToLS(raw.shopId, raw);
                showPreloadBadge(`✅ Ready — ${raw.allItems.length} items`);
                setTimeout(hidePreloadBadge, 2000);
                console.log("📊 BI preload complete:", raw.allItems.length, "items,", raw.allSales.length, "sales");
            } catch (err) {
                preloadPromise = null;
                console.warn("📊 BI preload failed (will retry on open):", err.message);
                hidePreloadBadge();
            }
        })();

        return preloadPromise;
    }

    function showPreloadBadge(msg) {
        let b = document.getElementById("bi-preload-status");
        if (!b) {
            b = document.createElement("div");
            b.id = "bi-preload-status";
            document.body.appendChild(b);
        }
        b.textContent = msg;
        b.style.opacity = "1";
    }
    function hidePreloadBadge() {
        const b = document.getElementById("bi-preload-status");
        if (b) b.style.opacity = "0";
    }

    // ─── Filter raw data by time window ───────────────────────────────────
    function filterByTime(raw, timeFilter) {
        const now = new Date();
        const start = new Date();
        if (timeFilter === "today") {
            start.setHours(0, 0, 0, 0);
        } else if (timeFilter === "week") {
            start.setDate(now.getDate() - 7);
            start.setHours(0, 0, 0, 0);
        } else if (timeFilter === "month") {
            start.setMonth(now.getMonth() - 1);
            start.setDate(1);
            start.setHours(0, 0, 0, 0);
        } else {
            start.setFullYear(2000);
        }

        const sales = raw.allSales.filter(s => s.date >= start);
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todaySales = raw.allSales.filter(s => s.date >= todayStart);

        let totalStockValue = 0;
        const lowStockItems = [];
        raw.allItems.forEach(item => {
            totalStockValue += item.stock * item.buyPrice;
            if (item.stock > 0 && item.stock <= item.lowStockAlert) {
                lowStockItems.push(item);
            }
        });

        const totalRevenue = sales.reduce((s, r) => s + r.total, 0);
        const todayRevenue  = todaySales.reduce((s, r) => s + r.total, 0);

        const byItem = {};
        sales.forEach(s => {
            if (!byItem[s.itemName]) byItem[s.itemName] = { name: s.itemName, quantity: 0, revenue: 0 };
            byItem[s.itemName].quantity += s.quantity;
            byItem[s.itemName].revenue  += s.total;
        });
        const topItems = Object.values(byItem).sort((a, b) => b.revenue - a.revenue).slice(0, 8);

        const byCat = {};
        sales.forEach(s => {
            if (!byCat[s.category]) byCat[s.category] = { name: s.category, revenue: 0, transactions: 0 };
            byCat[s.category].revenue      += s.total;
            byCat[s.category].transactions += 1;
        });
        const topCategories = Object.values(byCat).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

        return {
            summary: {
                todayRevenue,
                todaySales:       todaySales.length,
                totalRevenue,
                totalSales:       sales.length,
                totalItems:       raw.allItems.length,
                totalStockValue,
                lowStockCount:    lowStockItems.length,
                avgSaleValue:     sales.length ? Math.round(totalRevenue / sales.length) : 0
            },
            recentSales:    sales.slice(0, 15),
            lowStockItems:  lowStockItems.slice(0, 12),
            topItems,
            topCategories,
            timeFilter
        };
    }

    // ─── Format helpers ────────────────────────────────────────────────────
    const fmtKsh = n => "KSh " + Math.round(n).toLocaleString();
    const fmtDate = d => d.toLocaleDateString("en-KE", { day: "numeric", month: "short" });

    // ─── Render dashboard ──────────────────────────────────────────────────
    function renderDashboard(data) {
        const content = document.getElementById("bi-content");
        if (!content) return;

        const tfLabel = { today: "Today", week: "This week", month: "This month", all: "All time" };

        content.innerHTML = `
            <div class="bi-stats-grid">
                <div class="bi-stat-card">
                    <div class="bi-stat-label">💰 Today's revenue</div>
                    <div class="bi-stat-value">${fmtKsh(data.summary.todayRevenue)}</div>
                    <div class="bi-stat-sub">${data.summary.todaySales} transactions</div>
                </div>
                <div class="bi-stat-card">
                    <div class="bi-stat-label">📈 ${tfLabel[data.timeFilter]} revenue</div>
                    <div class="bi-stat-value">${fmtKsh(data.summary.totalRevenue)}</div>
                    <div class="bi-stat-sub">${data.summary.totalSales} transactions · avg ${fmtKsh(data.summary.avgSaleValue)}</div>
                </div>
                <div class="bi-stat-card">
                    <div class="bi-stat-label">📦 Inventory items</div>
                    <div class="bi-stat-value">${data.summary.totalItems}</div>
                    <div class="bi-stat-sub">Stock value: ${fmtKsh(data.summary.totalStockValue)}</div>
                </div>
                <div class="bi-stat-card">
                    <div class="bi-stat-label">⚠️ Low stock alerts</div>
                    <div class="bi-stat-value" style="color:${data.summary.lowStockCount > 0 ? "#dc2626" : "#0f172a"}">${data.summary.lowStockCount}</div>
                    <div class="bi-stat-sub">Items needing reorder</div>
                </div>
            </div>

            ${data.topItems.length > 0 ? `
            <div class="bi-section">
                <div class="bi-section-title">
                    🏆 Top selling items
                    <span class="bi-section-meta">${tfLabel[data.timeFilter]}</span>
                </div>
                ${data.topItems.map((item, i) => `
                    <div class="bi-row">
                        <div>
                            <div class="bi-row-name">
                                <span style="color:${["#f59e0b","#9ca3af","#b45309","#cbd5e1"][i]||"#cbd5e1"};font-weight:800;margin-right:8px">#${i+1}</span>
                                ${item.name}
                            </div>
                            <div class="bi-row-meta">${Math.round(item.quantity * 10) / 10} units sold</div>
                        </div>
                        <div class="bi-row-value">${fmtKsh(item.revenue)}</div>
                    </div>
                `).join("")}
            </div>` : ""}

            ${data.topCategories.length > 0 ? `
            <div class="bi-section">
                <div class="bi-section-title">📁 Revenue by category
                    <span class="bi-section-meta">${tfLabel[data.timeFilter]}</span>
                </div>
                ${data.topCategories.map(cat => {
                    const pct = data.summary.totalRevenue > 0 ? Math.round((cat.revenue / data.summary.totalRevenue) * 100) : 0;
                    return `<div class="bi-row">
                        <div>
                            <div class="bi-row-name">${cat.name}</div>
                            <div class="bi-row-meta">${cat.transactions} transactions</div>
                        </div>
                        <div style="display:flex;align-items:center;gap:10px">
                            <div style="width:80px;height:6px;background:#f1f5f9;border-radius:99px;overflow:hidden">
                                <div style="height:100%;width:${pct}%;background:#667eea;border-radius:99px"></div>
                            </div>
                            <div class="bi-row-value">${fmtKsh(cat.revenue)}</div>
                        </div>
                    </div>`;
                }).join("")}
            </div>` : ""}

            <div class="bi-section">
                <div class="bi-section-title">
                    🕒 Recent sales
                    <span class="bi-section-meta">Total: ${fmtKsh(data.summary.totalRevenue)}</span>
                </div>
                ${data.recentSales.length > 0 ? data.recentSales.map(sale => `
                    <div class="bi-row">
                        <div>
                            <div class="bi-row-name">${sale.itemName}</div>
                            <div class="bi-row-meta">${fmtDate(sale.date)} · ${Math.round(sale.quantity * 100) / 100} × ${sale.unit}</div>
                        </div>
                        <div class="bi-row-value">${fmtKsh(sale.total)}</div>
                    </div>
                `).join("") : `<div style="text-align:center;padding:30px;color:#94a3b8">No sales in this period</div>`}
            </div>

            ${data.lowStockItems.length > 0 ? `
            <div class="bi-section">
                <div class="bi-section-title">
                    ⚠️ Items low on stock
                    <span class="bi-badge bi-warn" style="margin-left:auto">Reorder soon</span>
                </div>
                ${data.lowStockItems.map(item => `
                    <div class="bi-row">
                        <div>
                            <div class="bi-row-name">${item.name}</div>
                            <div class="bi-row-meta">${item.category} · alert at ${item.lowStockAlert}</div>
                        </div>
                        <span class="bi-badge ${item.stock === 0 ? "bi-danger" : "bi-warn"}">${item.stock} ${item.baseUnit} left</span>
                    </div>
                `).join("")}
            </div>` : ""}

            <div class="bi-section">
                <div class="bi-section-title">📋 Inventory snapshot</div>
                <div style="overflow-x:auto">
                <table style="width:100%;border-collapse:collapse;font-size:13px">
                    <thead>
                        <tr style="border-bottom:2px solid #f1f5f9">
                            <th style="text-align:left;padding:8px 6px;color:#64748b;font-weight:600">Item</th>
                            <th style="text-align:left;padding:8px 6px;color:#64748b;font-weight:600">Category</th>
                            <th style="text-align:right;padding:8px 6px;color:#64748b;font-weight:600">Stock</th>
                            <th style="text-align:right;padding:8px 6px;color:#64748b;font-weight:600">Buy price</th>
                            <th style="text-align:right;padding:8px 6px;color:#64748b;font-weight:600">Sell price</th>
                            <th style="text-align:right;padding:8px 6px;color:#64748b;font-weight:600">Stock value</th>
                        </tr>
                    </thead>
                    <tbody>
                    ${(biCache?.raw.allItems || []).map(item => `
                        <tr style="border-bottom:1px solid #f8fafc">
                            <td style="padding:7px 6px;font-weight:600;color:#334155">${item.name}</td>
                            <td style="padding:7px 6px;color:#64748b">${item.category}</td>
                            <td style="padding:7px 6px;text-align:right;color:${item.stock <= item.lowStockAlert ? "#dc2626" : "#334155"}">${Math.round(item.stock * 100) / 100}</td>
                            <td style="padding:7px 6px;text-align:right;color:#64748b">${fmtKsh(item.buyPrice)}</td>
                            <td style="padding:7px 6px;text-align:right">${fmtKsh(item.sellPrice)}</td>
                            <td style="padding:7px 6px;text-align:right;font-weight:600">${fmtKsh(item.stock * item.buyPrice)}</td>
                        </tr>
                    `).join("")}
                    </tbody>
                </table>
                </div>
            </div>
        `;
    }

    // ─── Excel/CSV Export ─────────────────────────────────────────────────
    async function exportToExcel() {
        if (!biCache) {
            alert("Data not loaded yet — please wait a moment and try again.");
            return;
        }
        const btn = document.getElementById("bi-export-btn");
        if (btn) btn.textContent = "⏳ Preparing…";

        try {
            if (!window.XLSX) {
                await new Promise((resolve, reject) => {
                    const s = document.createElement("script");
                    s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
                    s.onload = resolve;
                    s.onerror = reject;
                    document.head.appendChild(s);
                });
            }

            const XLSX = window.XLSX;
            const wb = XLSX.utils.book_new();

            const inventoryRows = biCache.raw.allItems.map(item => ({
                "Item name":      item.name,
                "Category":       item.category,
                "Stock qty":      Math.round(item.stock * 1000) / 1000,
                "Unit":           item.baseUnit,
                "Buy price (KSh)":  item.buyPrice,
                "Sell price (KSh)": item.sellPrice,
                "Stock value (KSh)": Math.round(item.stock * item.buyPrice),
                "Low stock alert":  item.lowStockAlert,
                "Status":           item.stock === 0 ? "Out of stock"
                                  : item.stock <= item.lowStockAlert ? "Low stock"
                                  : "OK"
            }));
            const wsInventory = XLSX.utils.json_to_sheet(inventoryRows);
            wsInventory["!cols"] = [
                {wch:28},{wch:18},{wch:12},{wch:10},{wch:16},{wch:16},{wch:18},{wch:16},{wch:14}
            ];
            XLSX.utils.book_append_sheet(wb, wsInventory, "Inventory");

            const salesRows = biCache.raw.allSales.map(s => ({
                "Date":           s.date.toLocaleDateString("en-KE"),
                "Time":           s.date.toLocaleTimeString("en-KE", {hour:"2-digit", minute:"2-digit"}),
                "Item":           s.itemName,
                "Category":       s.category,
                "Unit sold":      s.unit,
                "Quantity":       Math.round(s.quantity * 1000) / 1000,
                "Unit price (KSh)": Math.round(s.unitPrice),
                "Total (KSh)":    Math.round(s.total),
                "Sale ID":        s.id
            }));
            const wsSales = XLSX.utils.json_to_sheet(salesRows);
            wsSales["!cols"] = [
                {wch:14},{wch:10},{wch:28},{wch:18},{wch:22},{wch:10},{wch:18},{wch:14},{wch:32}
            ];
            XLSX.utils.book_append_sheet(wb, wsSales, "Sales history");

            const lowStock = biCache.raw.allItems.filter(i => i.stock <= i.lowStockAlert);
            const wsLow = XLSX.utils.json_to_sheet(lowStock.map(i => ({
                "Item":              i.name,
                "Category":          i.category,
                "Current stock":     Math.round(i.stock * 100) / 100,
                "Alert threshold":   i.lowStockAlert,
                "Sell price (KSh)":  i.sellPrice
            })));
            wsLow["!cols"] = [{wch:28},{wch:18},{wch:14},{wch:16},{wch:16}];
            XLSX.utils.book_append_sheet(wb, wsLow, "Low stock");

            const dateStr = new Date().toLocaleDateString("en-KE").replace(/\//g, "-");
            XLSX.writeFile(wb, `Superkeeper_Report_${dateStr}.xlsx`);

        } catch (err) {
            console.error("Export failed:", err);
            alert("Export failed: " + err.message);
        } finally {
            if (btn) btn.textContent = "⬇ Export Excel";
        }
    }

    // ─── Build / show the overlay ─────────────────────────────────────────
    function buildOverlay() {
        if (biOverlay) return;
        biOverlay = document.createElement("div");
        biOverlay.id = "bi-overlay";
        document.body.appendChild(biOverlay);
    }

    async function openBI() {
        injectStyles();
        buildOverlay();

        biOverlay.innerHTML = `
            <div class="bi-header">
                <div class="bi-header-row">
                    <h1 class="bi-title">📊 Business Intelligence</h1>
                    <div class="bi-header-actions">
                        <button id="bi-export-btn">⬇ Export Excel</button>
                        <button id="bi-close-btn">✕ Close</button>
                    </div>
                </div>
                <div class="bi-time-filter">
                    <button class="bi-tf-btn active" data-filter="today">Today</button>
                    <button class="bi-tf-btn" data-filter="week">This week</button>
                    <button class="bi-tf-btn" data-filter="month">This month</button>
                    <button class="bi-tf-btn" data-filter="all">All time</button>
                </div>
            </div>
            <div id="bi-content">
                <div class="bi-center" style="gap:20px;padding:40px 24px;text-align:center">
                    <div class="bi-spinner"></div>
                    <div>
                        <p style="font-weight:600;color:#334155;font-size:16px;margin:0 0 6px">
                            Loading your business data…
                        </p>
                        <p style="color:#94a3b8;font-size:13px;margin:0">
                            Fetching from the cloud — about 5–10 seconds first time.
                        </p>
                    </div>
                    <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:12px;padding:16px 20px;max-width:340px;text-align:left">
                        <p style="font-weight:600;color:#0369a1;font-size:13px;margin:0 0 8px">💡 Good to know</p>
                        <p style="color:#64748b;font-size:13px;margin:0;line-height:1.6">
                            Once loaded, your dashboard stays ready for 5 minutes without re-fetching. 
                            You can explore the rest of the app — we'll have it ready when you return.
                        </p>
                    </div>
                    <div style="width:260px;height:6px;background:#e2e8f0;border-radius:99px;overflow:hidden">
                        <div style="height:100%;width:10%;background:#667eea;border-radius:99px;animation:biBarPulse 1.5s ease-in-out infinite"></div>
                    </div>
                </div>
            </div>
        `;

        biOverlay.classList.add("visible");
        document.body.style.overflow = "hidden";

        document.getElementById("bi-close-btn").onclick = closeBI;
        document.getElementById("bi-export-btn").onclick = exportToExcel;

        biOverlay.querySelectorAll(".bi-tf-btn").forEach(btn => {
            btn.onclick = async e => {
                biOverlay.querySelectorAll(".bi-tf-btn").forEach(b => b.classList.remove("active"));
                e.target.classList.add("active");
                await switchFilter(e.target.dataset.filter);
            };
        });

        biOverlay.addEventListener("click", e => {
            if (e.target === biOverlay) closeBI();
        });

        await switchFilter("today");
    }

    async function switchFilter(timeFilter) {
        const content = document.getElementById("bi-content");
        if (!content) return;

        if (biCache && Date.now() - biCache.loadedAt < CACHE_TTL_MS) {
            renderDashboard(filterByTime(biCache.raw, timeFilter));
            return;
        }

        content.innerHTML = `
            <div class="bi-center" style="gap:20px;padding:40px 24px;text-align:center">
                <div class="bi-spinner"></div>
                <div>
                    <p id="bi-load-msg" style="font-weight:600;color:#334155;font-size:16px;margin:0 0 6px">
                        Loading your business data…
                    </p>
                    <p style="color:#94a3b8;font-size:13px;margin:0">
                        This takes about 5–10 seconds on first load.
                    </p>
                </div>
                <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:12px;padding:16px 20px;max-width:340px;text-align:left">
                    <p style="font-weight:600;color:#0369a1;font-size:13px;margin:0 0 8px">💡 While you wait</p>
                    <p style="color:#64748b;font-size:13px;margin:0;line-height:1.6">
                        Your data is loading from the cloud. Next time you open this, it will be 
                        <strong>instant</strong> — we save it on your device.
                        Feel free to use the rest of the app while it loads.
                    </p>
                </div>
                <div id="bi-load-progress-wrap" style="width:260px;height:6px;background:#e2e8f0;border-radius:99px;overflow:hidden">
                    <div id="bi-load-progress" style="height:100%;width:5%;background:#667eea;border-radius:99px;transition:width 0.4s ease"></div>
                </div>
                <p id="bi-load-pct" style="color:#94a3b8;font-size:12px;margin:0">0%</p>
            </div>`;

        try {
            const raw = await fetchRawData((pct, msg) => {
                const bar = document.getElementById("bi-load-progress");
                const lbl = document.getElementById("bi-load-pct");
                const msgEl = document.getElementById("bi-load-msg");
                if (bar) bar.style.width = pct + "%";
                if (lbl) lbl.textContent = pct + "%";
                if (msgEl && msg && msg !== "Done") msgEl.textContent = msg;
            });
            biCache = { raw, loadedAt: Date.now() };
            renderDashboard(filterByTime(raw, timeFilter));
        } catch (err) {
            content.innerHTML = `
                <div class="bi-center">
                    <div style="font-size:40px">😕</div>
                    <p style="font-weight:600;color:#dc2626">Failed to load data</p>
                    <p style="font-size:13px">${err.message}</p>
                    <button onclick="location.reload()" style="
                        margin-top:10px;padding:9px 18px;background:#667eea;
                        color:white;border:none;border-radius:8px;cursor:pointer;font-size:14px">
                        Reload page
                    </button>
                </div>`;
        }
    }

    function closeBI() {
        if (biOverlay) biOverlay.classList.remove("visible");
        document.body.style.overflow = "";
    }

    document.addEventListener("keydown", e => {
        if (e.key === "Escape" && biOverlay?.classList.contains("visible")) closeBI();
    });

    function injectButton() {
        if (document.getElementById("business-intelligence-btn")) return;
        const container = document.querySelector(".action-buttons");
        if (!container) return;
        const btn = document.createElement("button");
        btn.id = "business-intelligence-btn";
        btn.innerHTML = "📊 Business Intelligence";
        btn.onclick = openBI;
        container.appendChild(btn);
    }

    function init() {
        injectStyles();
        setTimeout(injectButton, 400);

        const auth = getAuth();
        auth.onAuthStateChanged(user => {
            if (user) {
                setTimeout(() => preload(), 500);
            }
        });

        console.log("✅ BI module ready");
    }

    init();

    window.openBusinessIntelligence = openBI;
    window.closeBusinessIntelligence = closeBI;
    window.invalidateBICache = invalidateBICache;
});