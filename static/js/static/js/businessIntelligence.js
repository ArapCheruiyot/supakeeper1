// businessIntelligence.js - SIMPLE BUSINESS INTELLIGENCE FOR SUPERKEEPER
// Shows only what shopkeepers actually need to know

import { db } from "./firebase-config.js";
import { 
    collection, 
    query, 
    getDocs,
    doc,
    getDoc,
    orderBy,
    limit,
    where
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

document.addEventListener("DOMContentLoaded", () => {
    console.log("📊 Business Intelligence module loading...");
    
    let biOverlay = null;
    let currentShopId = null;
    let currentUser = null;
    
    const NAV_HEIGHT = 64;
    
    // ===========================================
    // 1. STYLES (Keep it simple)
    // ===========================================
    function injectStyles() {
        if (document.getElementById('bi-simple-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'bi-simple-styles';
        style.textContent = `
            #business-intelligence-overlay {
                position: fixed;
                top: ${NAV_HEIGHT}px;
                left: 0;
                width: 100%;
                height: calc(100vh - ${NAV_HEIGHT}px);
                background: #f8fafc;
                z-index: 2000;
                display: none;
                flex-direction: column;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                overflow: hidden;
            }
            
            #business-intelligence-btn {
                background: linear-gradient(135deg, #667eea, #764ba2);
                color: white;
                border: none;
                padding: 14px 20px;
                border-radius: 10px;
                font-size: 16px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s ease;
                box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
                flex: 1;
                min-width: 200px;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                margin: 10px 5px;
            }
            
            .bi-header {
                background: linear-gradient(135deg, #1e293b, #0f172a);
                color: white;
                padding: 20px 24px;
                flex-shrink: 0;
            }
            
            .bi-stats-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 16px;
                margin-bottom: 24px;
            }
            
            .bi-stat-card {
                background: white;
                border-radius: 16px;
                padding: 20px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.05);
                border: 1px solid #e2e8f0;
            }
            
            .bi-stat-value {
                font-size: 32px;
                font-weight: 800;
                color: #0f172a;
                margin: 8px 0 4px;
            }
            
            .bi-stat-label {
                font-size: 14px;
                color: #64748b;
            }
            
            .bi-section {
                background: white;
                border-radius: 16px;
                padding: 20px;
                margin-bottom: 20px;
                border: 1px solid #e2e8f0;
            }
            
            .bi-section-title {
                font-size: 18px;
                font-weight: 700;
                color: #0f172a;
                margin: 0 0 16px 0;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .bi-list-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px;
                border-bottom: 1px solid #f1f5f9;
            }
            
            .bi-list-item:last-child {
                border-bottom: none;
            }
            
            .bi-item-name {
                font-weight: 600;
                color: #334155;
            }
            
            .bi-item-meta {
                font-size: 13px;
                color: #64748b;
            }
            
            .bi-item-value {
                font-weight: 700;
                color: #0f172a;
            }
            
            .bi-badge {
                padding: 4px 10px;
                border-radius: 20px;
                font-size: 12px;
                font-weight: 600;
            }
            
            .bi-badge-warning {
                background: #fef3c7;
                color: #92400e;
            }
            
            .bi-badge-success {
                background: #dcfce7;
                color: #166534;
            }
            
            .bi-badge-danger {
                background: #fee2e2;
                color: #991b1b;
            }
            
            .time-filter {
                display: flex;
                gap: 8px;
                margin-top: 12px;
            }
            
            .time-filter-btn {
                padding: 6px 14px;
                background: rgba(255,255,255,0.1);
                border: 1px solid rgba(255,255,255,0.2);
                color: white;
                border-radius: 30px;
                font-size: 13px;
                cursor: pointer;
            }
            
            .time-filter-btn.active {
                background: white;
                color: #0f172a;
                font-weight: 600;
            }
            
            .loading-spinner {
                width: 40px;
                height: 40px;
                border: 4px solid #e2e8f0;
                border-top: 4px solid #667eea;
                border-radius: 50%;
                animation: spin 1s linear infinite;
                margin: 40px auto;
            }
            
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }
    
    // ===========================================
    // 2. INJECT BUTTON
    // ===========================================
    function injectButton() {
        if (document.getElementById('business-intelligence-btn')) return;
        
        const actionButtons = document.querySelector('.action-buttons');
        if (!actionButtons) return;
        
        const btn = document.createElement('button');
        btn.id = 'business-intelligence-btn';
        btn.innerHTML = '📊 Business Intelligence';
        btn.onclick = openBI;
        
        actionButtons.appendChild(btn);
        console.log('✅ BI button added');
    }
    
    // ===========================================
    // 3. GET SHOP ID (Helper)
    // ===========================================
    async function getShopId() {
        const auth = getAuth();
        const user = auth.currentUser;
        if (!user) return null;
        
        // Check if staff
        const sessionType = localStorage.getItem('sessionType');
        if (sessionType === 'staff') {
            try {
                const staffContext = JSON.parse(localStorage.getItem('staffContext') || '{}');
                if (staffContext.shopId) return staffContext.shopId;
            } catch (e) {}
        }
        
        // Check if owner with shop mapping
        try {
            const userDoc = await getDoc(doc(db, "Users", user.uid));
            if (userDoc.exists() && userDoc.data().shop_id) {
                return userDoc.data().shop_id;
            }
        } catch (e) {}
        
        return user.uid; // Default
    }
    
    // ===========================================
    // 4. LOAD BUSINESS DATA (Simple & Direct)
    // ===========================================
    async function loadBusinessData(timeFilter = 'today') {
        console.log(`📊 Loading data for: ${timeFilter}`);
        
        try {
            const shopId = await getShopId();
            if (!shopId) throw new Error('No shop ID found');
            
            // Calculate date range
            const now = new Date();
            const startDate = new Date();
            
            if (timeFilter === 'today') {
                startDate.setHours(0, 0, 0, 0);
            } else if (timeFilter === 'week') {
                startDate.setDate(now.getDate() - 7);
            } else if (timeFilter === 'month') {
                startDate.setMonth(now.getMonth() - 1);
            }
            
            // Get all categories and items
            const categoriesSnap = await getDocs(collection(db, "Shops", shopId, "categories"));
            
            let allItems = [];
            let allSales = [];
            let totalStockValue = 0;
            let lowStockItems = [];
            
            // Loop through each category
            for (const categoryDoc of categoriesSnap.docs) {
                const categoryName = categoryDoc.data().name || 'Uncategorized';
                const itemsSnap = await getDocs(collection(categoryDoc.ref, "items"));
                
                for (const itemDoc of itemsSnap.docs) {
                    const item = itemDoc.data();
                    
                    // Basic item info
                    const itemInfo = {
                        id: itemDoc.id,
                        name: item.name || 'Unnamed',
                        category: categoryName,
                        stock: item.stock || 0,
                        buyPrice: item.buyPrice || 0,
                        sellPrice: item.sellPrice || 0,
                        lowStockAlert: item.lowStockAlert || 5,
                        images: item.images || []
                    };
                    
                    allItems.push(itemInfo);
                    
                    // Calculate stock value
                    totalStockValue += (itemInfo.stock * itemInfo.buyPrice);
                    
                    // Check low stock
                    if (itemInfo.stock <= itemInfo.lowStockAlert && itemInfo.stock > 0) {
                        lowStockItems.push(itemInfo);
                    }
                    
                    // Extract sales from stockTransactions
                    if (item.stockTransactions && Array.isArray(item.stockTransactions)) {
                        item.stockTransactions.forEach(txn => {
                            if (txn.type === 'sale') {
                                const txnDate = txn.timestamp ? new Date(txn.timestamp * 1000) : new Date();
                                
                                // Filter by date
                                if (txnDate >= startDate) {
                                    allSales.push({
                                        id: txn.id,
                                        date: txnDate,
                                        itemName: item.name,
                                        quantity: txn.quantity || txn.quantity_sold || 1,
                                        price: txn.sellPrice || txn.unitPrice || item.sellPrice || 0,
                                        total: txn.totalPrice || (txn.quantity * item.sellPrice) || 0,
                                        batchId: txn.batchId
                                    });
                                }
                            }
                        });
                    }
                }
            }
            
            // Sort sales by date (newest first)
            allSales.sort((a, b) => b.date - a.date);
            
            // Calculate totals
            const todaySales = allSales.filter(s => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                return s.date >= today;
            });
            
            const totalRevenue = allSales.reduce((sum, s) => sum + s.total, 0);
            const todayRevenue = todaySales.reduce((sum, s) => sum + s.total, 0);
            
            // Get top selling items
            const salesByItem = {};
            allSales.forEach(sale => {
                if (!salesByItem[sale.itemName]) {
                    salesByItem[sale.itemName] = { name: sale.itemName, quantity: 0, revenue: 0 };
                }
                salesByItem[sale.itemName].quantity += sale.quantity;
                salesByItem[sale.itemName].revenue += sale.total;
            });
            
            const topItems = Object.values(salesByItem)
                .sort((a, b) => b.revenue - a.revenue)
                .slice(0, 5);
            
            return {
                summary: {
                    todayRevenue,
                    totalRevenue,
                    totalSales: allSales.length,
                    todaySales: todaySales.length,
                    totalItems: allItems.length,
                    totalStockValue,
                    lowStockCount: lowStockItems.length
                },
                recentSales: allSales.slice(0, 10),
                lowStockItems: lowStockItems.slice(0, 10),
                topItems,
                timeFilter
            };
            
        } catch (error) {
            console.error('Error loading business data:', error);
            throw error;
        }
    }
    
    // ===========================================
    // 5. RENDER DASHBOARD (Clean & Simple)
    // ===========================================
    function renderDashboard(data) {
        const content = document.getElementById('bi-content');
        if (!content) return;
        
        const timeFilterNames = {
            today: 'Today',
            week: 'This Week',
            month: 'This Month'
        };
        
        content.innerHTML = `
            <!-- Stats Grid -->
            <div class="bi-stats-grid">
                <div class="bi-stat-card">
                    <div class="bi-stat-label">💰 Today's Sales</div>
                    <div class="bi-stat-value">KSh ${data.summary.todayRevenue.toLocaleString()}</div>
                    <div style="font-size: 13px; color: #64748b;">${data.summary.todaySales} transactions</div>
                </div>
                
                <div class="bi-stat-card">
                    <div class="bi-stat-label">📦 Total Items</div>
                    <div class="bi-stat-value">${data.summary.totalItems}</div>
                    <div style="font-size: 13px; color: #64748b;">in inventory</div>
                </div>
                
                <div class="bi-stat-card">
                    <div class="bi-stat-label">⚠️ Low Stock</div>
                    <div class="bi-stat-value" style="color: ${data.summary.lowStockCount > 0 ? '#dc2626' : '#0f172a'};">
                        ${data.summary.lowStockCount}
                    </div>
                    <div style="font-size: 13px; color: #64748b;">items need attention</div>
                </div>
                
                <div class="bi-stat-card">
                    <div class="bi-stat-label">💎 Stock Value</div>
                    <div class="bi-stat-value">KSh ${data.summary.totalStockValue.toLocaleString()}</div>
                    <div style="font-size: 13px; color: #64748b;">at cost price</div>
                </div>
            </div>
            
            <!-- Recent Sales -->
            <div class="bi-section">
                <div class="bi-section-title">
                    <span>🕒 Recent Sales (${timeFilterNames[data.timeFilter]})</span>
                    <span style="font-size: 14px; font-weight: normal; color: #64748b; margin-left: auto;">
                        Total: KSh ${data.summary.totalRevenue.toLocaleString()}
                    </span>
                </div>
                
                ${data.recentSales.length > 0 ? `
                    <div>
                        ${data.recentSales.map(sale => `
                            <div class="bi-list-item">
                                <div>
                                    <div class="bi-item-name">${sale.itemName}</div>
                                    <div class="bi-item-meta">
                                        ${sale.date.toLocaleDateString()} • ${sale.quantity} unit${sale.quantity > 1 ? 's' : ''}
                                    </div>
                                </div>
                                <div class="bi-item-value">KSh ${sale.total.toLocaleString()}</div>
                            </div>
                        `).join('')}
                    </div>
                ` : `
                    <div style="text-align: center; padding: 40px; color: #64748b;">
                        No sales in this period
                    </div>
                `}
            </div>
            
            <!-- Low Stock Items -->
            ${data.lowStockItems.length > 0 ? `
                <div class="bi-section">
                    <div class="bi-section-title">
                        <span>⚠️ Items Low on Stock</span>
                        <span class="bi-badge bi-badge-warning" style="margin-left: auto;">
                            Order soon
                        </span>
                    </div>
                    
                    <div>
                        ${data.lowStockItems.map(item => `
                            <div class="bi-list-item">
                                <div>
                                    <div class="bi-item-name">${item.name}</div>
                                    <div class="bi-item-meta">
                                        ${item.category} • Alert at: ${item.lowStockAlert}
                                    </div>
                                </div>
                                <div>
                                    <span class="bi-badge ${item.stock === 0 ? 'bi-badge-danger' : 'bi-badge-warning'}" 
                                          style="margin-right: 8px;">
                                        ${item.stock} left
                                    </span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
            
            <!-- Top Selling Items -->
            ${data.topItems.length > 0 ? `
                <div class="bi-section">
                    <div class="bi-section-title">
                        <span>🏆 Top Selling Items</span>
                    </div>
                    
                    <div>
                        ${data.topItems.map((item, index) => `
                            <div class="bi-list-item">
                                <div style="display: flex; align-items: center; gap: 12px;">
                                    <span style="font-weight: 800; color: ${index === 0 ? '#fbbf24' : index === 1 ? '#94a3b8' : index === 2 ? '#b45309' : '#cbd5e1'};">
                                        #${index + 1}
                                    </span>
                                    <div>
                                        <div class="bi-item-name">${item.name}</div>
                                        <div class="bi-item-meta">${item.quantity} units sold</div>
                                    </div>
                                </div>
                                <div class="bi-item-value">KSh ${item.revenue.toLocaleString()}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
        `;
    }
    
    // ===========================================
    // 6. OPEN BUSINESS INTELLIGENCE
    // ===========================================
    async function openBI() {
        console.log('📊 Opening Business Intelligence...');
        
        injectStyles();
        
        // Create overlay if needed
        if (!biOverlay) {
            biOverlay = document.createElement('div');
            biOverlay.id = 'business-intelligence-overlay';
            document.body.appendChild(biOverlay);
        }
        
        // Show loading
        biOverlay.innerHTML = `
            <div class="bi-header">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <h1 style="margin: 0; font-size: 24px; font-weight: 700;">📊 Business Intelligence</h1>
                    <button id="close-bi" style="
                        background: rgba(255,255,255,0.2);
                        border: none;
                        color: white;
                        width: 40px;
                        height: 40px;
                        border-radius: 10px;
                        font-size: 20px;
                        cursor: pointer;
                    ">×</button>
                </div>
                
                <div class="time-filter">
                    <button class="time-filter-btn active" data-filter="today">Today</button>
                    <button class="time-filter-btn" data-filter="week">This Week</button>
                    <button class="time-filter-btn" data-filter="month">This Month</button>
                </div>
            </div>
            
            <div id="bi-content" style="flex: 1; overflow-y: auto; padding: 20px;">
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 300px;">
                    <div class="loading-spinner"></div>
                    <p style="color: #64748b; margin-top: 20px;">Loading your business data...</p>
                </div>
            </div>
        `;
        
        biOverlay.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        
        // Close button
        document.getElementById('close-bi').onclick = () => {
            biOverlay.style.display = 'none';
            document.body.style.overflow = '';
        };
        
        // Time filter buttons
        const filterBtns = biOverlay.querySelectorAll('.time-filter-btn');
        filterBtns.forEach(btn => {
            btn.onclick = async (e) => {
                filterBtns.forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                
                // Show loading in content
                document.getElementById('bi-content').innerHTML = `
                    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 300px;">
                        <div class="loading-spinner"></div>
                        <p style="color: #64748b; margin-top: 20px;">Loading...</p>
                    </div>
                `;
                
                const data = await loadBusinessData(e.target.dataset.filter);
                renderDashboard(data);
            };
        });
        
        // Load initial data
        try {
            const data = await loadBusinessData('today');
            renderDashboard(data);
        } catch (error) {
            document.getElementById('bi-content').innerHTML = `
                <div style="text-align: center; padding: 60px 20px;">
                    <div style="font-size: 48px; margin-bottom: 20px;">😕</div>
                    <h3 style="color: #dc2626;">Failed to load data</h3>
                    <p style="color: #64748b;">${error.message}</p>
                    <button onclick="location.reload()" style="
                        margin-top: 20px;
                        padding: 10px 20px;
                        background: #667eea;
                        color: white;
                        border: none;
                        border-radius: 8px;
                        cursor: pointer;
                    ">Try Again</button>
                </div>
            `;
        }
    }
    
    // ===========================================
    // 7. INITIALIZE
    // ===========================================
    function init() {
        injectStyles();
        setTimeout(injectButton, 500); // Wait for DOM
        console.log('✅ BI module ready');
    }
    
    init();
    
    // Export to window
    window.openBusinessIntelligence = openBI;
});