// cart-icon.js - SMART CART SYSTEM WITH MULTIPLE TABS (PUBS/CLUBS)
// AUTO‑NAMED TABS (Customer 1, Customer 2, …) + EDITABLE LABELS
// ENHANCED: Prevent empty tab clutter + overflow management (show 3, more modal) + rename in overflow
// FIXED: Added proper staff handling, undefined value checks, and bilingual support
// ENHANCED: Multi-payment (Cash, M-Pesa, Card, Split) + Multi‑tab support
// CURRENCY: All prices in KSh (Kenyan Shillings)

import { getAuth } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { db } from "./firebase-config.js";
import { 
    doc, 
    getDoc, 
    updateDoc, 
    arrayUnion,
    serverTimestamp,
    setDoc
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// ====================================================
// GLOBAL STATE – MULTIPLE TABS
// ====================================================
let tabs = {};               // key = tabId, value = { id, label, items, created, lastActivity }
let activeTabId = null;      // current tab being used
let currentShopId = null;

// Auto‑naming counter (persisted)
let nextCustomerNumber = parseInt(localStorage.getItem('nextCustomerNumber') || '1', 10);

// Payment tracking
let selectedPaymentMethods = [];
let paymentSplit = { cash: 0, mpesa: 0, card: 0 };
let totalAmount = 0;

// ====================================================
// DEBUG UTILITIES
// ====================================================
function debugLog(message, data = null) {
    console.log(`🛒 ${message}`, data || '');
}

// ====================================================
// TAB MANAGEMENT FUNCTIONS
// ====================================================

/**
 * Generate a short random tab ID
 */
function generateTabId() {
    return 'tab_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
}

/**
 * Create a new tab with optional label (customer/table name).
 * If no label, use "Customer X".
 */
function createTab(label = '') {
    const tabId = generateTabId();
    const now = Date.now();
    
    // Auto‑name if no label provided
    let displayLabel = label.trim();
    if (!displayLabel) {
        displayLabel = `Customer ${nextCustomerNumber++}`;
        localStorage.setItem('nextCustomerNumber', nextCustomerNumber);
    }
    
    tabs[tabId] = {
        id: tabId,
        label: displayLabel,
        items: [],
        created: now,
        lastActivity: now,
        total: 0
    };
    
    saveTabsToStorage();
    debugLog(`New tab created: ${displayLabel} (${tabId})`);
    
    // If no active tab, set this as active
    if (!activeTabId) {
        activeTabId = tabId;
        updateCartIcon();
    }
    
    return tabId;
}

/**
 * Edit a tab's label (rename)
 */
function editTabLabel(tabId) {
    const tab = tabs[tabId];
    if (!tab) return false;
    
    const newLabel = prompt('Edit customer name / table number / Hariri jina la mteja / namba ya meza:', tab.label);
    if (newLabel !== null && newLabel.trim() !== '') {
        tab.label = newLabel.trim();
        tab.lastActivity = Date.now();
        saveTabsToStorage();
        updateCartIcon();
        
        // If the cart review is open, refresh it to show new label
        const modal = document.querySelector('.cart-modal-backdrop');
        if (modal) {
            modal.remove();
            showCartReview();
        }
        return true;
    }
    return false;
}

/**
 * Switch to a different tab
 */
function switchTab(tabId) {
    if (!tabs[tabId]) {
        console.error(`Tab ${tabId} not found`);
        return false;
    }
    activeTabId = tabId;
    saveTabsToStorage();
    updateCartIcon();
    debugLog(`Switched to tab: ${tabs[tabId].label}`);
    return true;
}

/**
 * Close (delete) a tab. If it's the active tab, switch to another.
 * Returns true if tab was removed.
 */
function closeTab(tabId) {
    if (!tabs[tabId]) return false;
    
    // Cannot close if it's the last tab – instead clear its items?
    if (Object.keys(tabs).length === 1) {
        // Last tab: clear items instead of deleting
        tabs[tabId].items = [];
        tabs[tabId].lastActivity = Date.now();
        saveTabsToStorage();
        updateCartIcon();
        showNotification('Tab cleared – last tab cannot be removed. / Kichupo cha mwisho hakiwezi kufutwa.', 'info', 3000);
        return true;
    }
    
    // Remove the tab
    delete tabs[tabId];
    
    // If active tab was closed, switch to another
    if (activeTabId === tabId) {
        const remainingIds = Object.keys(tabs);
        activeTabId = remainingIds[0] || null;
    }
    
    saveTabsToStorage();
    updateCartIcon();
    debugLog(`Tab closed: ${tabId}`);
    return true;
}

/**
 * Get list of all tabs with basic info (for UI)
 */
function getTabsList() {
    return Object.values(tabs).map(t => ({
        id: t.id,
        label: t.label,
        itemCount: t.items.reduce((sum, i) => sum + i.quantity, 0),
        total: t.items.reduce((sum, i) => sum + ((i.price || i.sellPrice || i.sell_price || 0) * i.quantity), 0),
        isActive: t.id === activeTabId
    }));
}

/**
 * Save tabs to localStorage
 */
function saveTabsToStorage() {
    const data = {
        tabs,
        activeTabId,
        version: '2.0' // for future migrations
    };
    localStorage.setItem('superkeeper_tabs', JSON.stringify(data));
}

/**
 * Load tabs from localStorage; if none, create a default tab.
 */
function loadTabsFromStorage() {
    const saved = localStorage.getItem('superkeeper_tabs');
    if (saved) {
        try {
            const data = JSON.parse(saved);
            tabs = data.tabs || {};
            activeTabId = data.activeTabId || null;
            
            // Validate: ensure each tab has an items array and required fields
            Object.keys(tabs).forEach(id => {
                if (!Array.isArray(tabs[id].items)) tabs[id].items = [];
                tabs[id].total = tabs[id].items.reduce((sum, i) => sum + ((i.price || i.sellPrice || i.sell_price || 0) * i.quantity), 0);
            });
            
            // If active tab doesn't exist, pick first
            if (!activeTabId || !tabs[activeTabId]) {
                const ids = Object.keys(tabs);
                activeTabId = ids.length > 0 ? ids[0] : null;
            }
        } catch (e) {
            console.error('Error loading tabs', e);
            tabs = {};
            activeTabId = null;
        }
    }
    
    // If no tabs at all, create a default one
    if (Object.keys(tabs).length === 0) {
        createTab('Current Sale');
    }
    
    debugLog('Tabs loaded', { count: Object.keys(tabs).length, active: activeTabId });
}

// ====================================================
// CART OPERATIONS (ACTIVE TAB)
// ====================================================

function getActiveTab() {
    if (!activeTabId || !tabs[activeTabId]) {
        // Fallback: create a new tab
        activeTabId = createTab('Current Sale');
    }
    return tabs[activeTabId];
}

function getActiveTabItems() {
    return getActiveTab().items;
}

function getCartCount() {
    const tab = getActiveTab();
    return tab.items.reduce((sum, item) => sum + item.quantity, 0);
}

function getCartTotal() {
    const tab = getActiveTab();
    return tab.items.reduce((sum, item) => sum + ((item.price || item.sellPrice || item.sell_price || 0) * item.quantity), 0);
}

function saveActiveTab() {
    saveTabsToStorage();
    updateCartIcon();
}

// ====================================================
// CART ICON (now shows active tab + tabs badge)
// ====================================================

function updateCartIcon() {
    debugLog('Updating cart icon...');
    
    let cartIcon = document.getElementById('sales-cart-icon');

    if (!cartIcon) {
        cartIcon = document.createElement('div');
        cartIcon.id = 'sales-cart-icon';
        document.body.appendChild(cartIcon);
        addCartIconStyles();
    }

    const count = getCartCount();
    const total = getCartTotal();
    const tabsCount = Object.keys(tabs).length;
    const activeLabel = getActiveTab().label;

    cartIcon.innerHTML = `
        <div class="cart-icon-container" style="
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 12px 20px;
            border-radius: 50px;
            font-weight: bold;
            font-size: 16px;
            cursor: pointer;
            box-shadow: 0 4px 20px rgba(102, 126, 234, 0.4);
            border: 2px solid white;
            display: flex;
            align-items: center;
            gap: 8px;
            user-select: none;
            transition: transform 0.2s, box-shadow 0.2s;
        ">
            🛒 ${count} items | KSh ${total.toFixed(2)}
            <span style="
                background: rgba(255,255,255,0.2);
                padding: 2px 8px;
                border-radius: 20px;
                font-size: 12px;
                margin-left: 4px;
            ">${tabsCount} tab${tabsCount !== 1 ? 's' : ''}</span>
        </div>
    `;

    const container = cartIcon.querySelector('.cart-icon-container');
    
    container.onclick = () => {
        if (count > 0 || tabsCount > 1) {
            showCartReview();
        } else {
            showNotification('Cart is empty! Add items first. / Kikapu hakina bidhaa! Ongeza bidhaa kwanza.', 'info', 2000);
        }
    };
    
    container.onmouseenter = () => {
        container.style.transform = 'scale(1.05)';
        container.style.boxShadow = '0 6px 25px rgba(102, 126, 234, 0.6)';
    };
    
    container.onmouseleave = () => {
        container.style.transform = 'scale(1)';
        container.style.boxShadow = '0 4px 20px rgba(102, 126, 234, 0.4)';
    };
    
    if (count > 0) {
        container.style.animation = 'cartBounce 0.4s ease';
        setTimeout(() => container.style.animation = '', 400);
    }
    
    debugLog('Cart icon updated');
}

function addCartIconStyles() {
    if (!document.getElementById('cart-icon-styles')) {
        const style = document.createElement('style');
        style.id = 'cart-icon-styles';
        style.textContent = `
            #sales-cart-icon {
                position: fixed;
                bottom: 30px;
                right: 30px;
                z-index: 9990;
                max-width: calc(100vw - 40px);
                overflow: hidden;
            }
            
            .cart-icon-container {
                position: relative;
                min-width: 180px;
                text-align: center;
            }
            
            @keyframes cartBounce {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.1); }
            }
            
            .cart-modal-backdrop {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.8);
                z-index: 9999;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
                animation: fadeIn 0.3s ease;
            }
            
            .cart-modal-container {
                background: white;
                border-radius: 20px;
                width: 100%;
                max-width: 600px;
                max-height: 85vh;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
                animation: slideUp 0.3s ease;
            }
            
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            
            @keyframes slideUp {
                from { transform: translateY(20px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
            
            /* Payment method styles */
            .payment-option {
                background: #f8f9fa;
                border: 2px solid #e9ecef;
                border-radius: 12px;
                padding: 15px 8px;
                text-align: center;
                cursor: pointer;
                transition: all 0.2s;
            }
            
            .payment-option.selected {
                border-color: #3b82f6;
                background: #eff6ff;
            }
            
            .payment-option:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            }
            
            .split-input {
                width: 100%;
                padding: 10px;
                border: 1px solid #cbd5e1;
                border-radius: 8px;
                font-size: 14px;
            }
            
            .split-input:focus {
                outline: none;
                border-color: #3b82f6;
                box-shadow: 0 0 0 3px rgba(59,130,246,0.1);
            }
            
            /* Tab switcher styles */
            .tab-selector {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                margin-bottom: 16px;
                background: #f1f5f9;
                padding: 12px;
                border-radius: 12px;
            }
            
            .tab-button {
                padding: 8px 16px;
                background: white;
                border: 1px solid #cbd5e1;
                border-radius: 30px;
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s;
                display: flex;
                align-items: center;
                gap: 6px;
            }
            
            .tab-button.active {
                background: #3b82f6;
                color: white;
                border-color: #3b82f6;
            }
            
            .tab-button:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 8px rgba(0,0,0,0.1);
            }
            
            .tab-edit-icon {
                margin-left: 4px;
                cursor: pointer;
                opacity: 0.6;
                transition: opacity 0.2s;
                font-size: 14px;
            }
            .tab-edit-icon:hover {
                opacity: 1;
            }
            
            .new-tab-btn {
                background: #10b981;
                color: white;
                border: none;
                border-radius: 30px;
                padding: 8px 16px;
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 6px;
            }
            
            /* "More" button */
            .tab-more-btn {
                background: #f1f5f9;
                border: 1px dashed #94a3b8;
                border-radius: 30px;
                padding: 8px 16px;
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                color: #334155;
                transition: all 0.2s;
            }
            .tab-more-btn:hover {
                background: #e2e8f0;
            }
            
            /* All Tabs Modal edit icon */
            .all-tab-edit-icon {
                margin-left: 8px;
                cursor: pointer;
                opacity: 0.6;
                transition: opacity 0.2s;
                font-size: 14px;
            }
            .all-tab-edit-icon:hover {
                opacity: 1;
            }
        `;
        document.head.appendChild(style);
    }
}

// ====================================================
// ADD ITEM TO ACTIVE TAB (or specified tab)
// ====================================================

function addItemToCart(item, tabId = null) {
    const targetTabId = tabId || activeTabId;
    if (!targetTabId || !tabs[targetTabId]) {
        console.error('No valid tab to add item');
        return false;
    }
    
    console.log(`🛒 Adding item to tab ${targetTabId}:`, item);
    
    if (!item || !item.name) {
        console.error('Invalid item:', item);
        return false;
    }
    
    const qty = 1; // One-tap system
    
    // Use smart fields from backend
    const stock = item.real_available !== undefined ? item.real_available : item.batch_remaining;
    
    if (stock < qty && item.can_fulfill === false) {
        showNotification(`❌ "${item.name}" is out of stock! / "${item.name}" imeisha!`, 'error', 3000);
        return false;
    }
    
    // Create unique cart ID for this item+batch
    const cartItemId = item.type === 'selling_unit' 
        ? `${item.item_id}_${item.sell_unit_id}_${item.batch_id}`
        : `${item.item_id}_main_${item.batch_id}`;
    
    const cartItem = {
        id: cartItemId,
        cart_item_id: cartItemId,
        item_id: item.item_id,
        main_item_id: item.main_item_id || item.item_id,
        name: item.name,
        display_name: item.display_name || item.name,
        quantity: qty,
        price: item.price || item.sellPrice || item.sell_price || 0,
        sellPrice: item.price || item.sellPrice || item.sell_price || 0,
        sell_price: item.price || item.sellPrice || item.sell_price || 0,
        category_id: item.category_id || 'unknown',
        category_name: item.category_name || 'Uncategorized',
        stock: stock,
        available_stock: stock,
        type: item.type || 'main_item',
        batch_id: item.batch_id,
        batchId: item.batch_id,
        batch_name: item.batch_name,
        batch_remaining: item.batch_remaining || stock,
        sell_unit_id: item.sell_unit_id,
        conversion_factor: item.conversion_factor || 1,
        can_fulfill: item.can_fulfill !== undefined ? item.can_fulfill : true,
        batch_switch_required: item.batch_switch_required || false,
        is_current_batch: item.is_current_batch || false,
        real_available: item.real_available,
        thumbnail: item.thumbnail,
        added_at: new Date().toISOString(),
        _batch_switched: item._batch_switched || false
    };
    
    console.log('🛒 Cart item:', {
        id: cartItem.id,
        type: cartItem.type,
        batch_id: cartItem.batch_id,
        can_fulfill: cartItem.can_fulfill
    });
    
    const tab = tabs[targetTabId];
    const existingIndex = tab.items.findIndex(i => i.id === cartItemId);
    
    if (existingIndex !== -1) {
        const newQuantity = tab.items[existingIndex].quantity + qty;
        if (stock < newQuantity) {
            showNotification(`❌ Only ${stock - tab.items[existingIndex].quantity} available / ${stock - tab.items[existingIndex].quantity} tu zipo`, 'error', 3000);
            return false;
        }
        tab.items[existingIndex].quantity = newQuantity;
        console.log('🛒 Updated existing item:', tab.items[existingIndex].name, 'x', tab.items[existingIndex].quantity);
    } else {
        tab.items.push(cartItem);
        console.log('🛒 Added new item:', cartItem.name, 'Type:', cartItem.type);
    }
    
    tab.lastActivity = Date.now();
    tab.total = tab.items.reduce((sum, i) => sum + ((i.price || i.sellPrice || i.sell_price || 0) * i.quantity), 0);
    
    saveTabsToStorage();
    updateCartIcon();
    
    const itemName = cartItem.display_name || cartItem.name;
    showNotification(`✅ Added ${itemName} to ${tab.label}! / Umeongeza ${itemName} kwenye ${tab.label}!`, 'success', 2000);
    
    return true;
}

// ====================================================
// NOTIFICATION SYSTEM (Bilingual)
// ====================================================

function showNotification(message, type = 'info', duration = 3000) {
    const existing = document.getElementById('cart-notification');
    if (existing) existing.remove();
    
    const colors = {
        info: { bg: '#3498db', icon: 'ℹ️' },
        success: { bg: '#2ecc71', icon: '✅' },
        warning: { bg: '#f39c12', icon: '⚠️' },
        error: { bg: '#e74c3c', icon: '❌' }
    };
    
    const config = colors[type] || colors.info;
    
    const notification = document.createElement('div');
    notification.id = 'cart-notification';
    notification.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        background: ${config.bg};
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10001;
        display: flex;
        align-items: center;
        gap: 10px;
        max-width: 400px;
        animation: slideIn 0.3s ease;
    `;
    
    notification.innerHTML = `
        <span style="font-size: 18px;">${config.icon}</span>
        <span style="font-size: 14px; font-weight: 500;">${message}</span>
    `;
    
    document.body.appendChild(notification);
    
    if (!document.getElementById('notification-styles')) {
        const style = document.createElement('style');
        style.id = 'notification-styles';
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, duration);
    
    return notification;
}

// ====================================================
// ALL TABS MODAL (with rename icons) - UPDATED with KSh
// ====================================================

function showAllTabsModal() {
    const tabsList = getTabsList();
    const backdrop = document.createElement('div');
    backdrop.className = 'cart-modal-backdrop';
    backdrop.innerHTML = `
        <div class="cart-modal-container" style="max-width: 400px;">
            <div style="
                background: linear-gradient(135deg, #667eea, #764ba2);
                color: white;
                padding: 20px;
                text-align: center;
            ">
                <h2 style="margin:0; font-size:20px;">All Tabs / Vichupo Vyote</h2>
            </div>
            <div style="padding: 20px; max-height: 60vh; overflow-y: auto;">
                ${tabsList.map(t => `
                    <div class="all-tab-item" data-tab-id="${t.id}" style="
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 12px;
                        margin-bottom: 8px;
                        background: ${t.isActive ? '#e0f2fe' : '#f8f9fa'};
                        border: 1px solid ${t.isActive ? '#3b82f6' : '#e9ecef'};
                        border-radius: 10px;
                        cursor: pointer;
                    ">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <strong>${t.label}</strong>
                            <span class="all-tab-edit-icon" data-edit-tab-id="${t.id}" title="Edit name / Hariri jina">✎</span>
                        </div>
                        <div>
                            <span style="font-size:12px; color:#666;">${t.itemCount} items | KSh ${t.total.toFixed(2)}</span>
                            ${!t.isActive ? '<span style="color:#3b82f6; margin-left:10px;">Tap to switch</span>' : '<span style="color:#10b981; margin-left:10px;">✓ Active</span>'}
                        </div>
                    </div>
                `).join('')}
            </div>
            <div style="padding: 16px; border-top:1px solid #e9ecef; text-align:center;">
                <button id="close-all-tabs-btn" style="
                    background: #e9ecef;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 30px;
                    font-weight: 600;
                    cursor: pointer;
                ">Close / Funga</button>
            </div>
        </div>
    `;
    document.body.appendChild(backdrop);

    // Handle clicking on a tab item (switch tab) – unless click on edit icon
    backdrop.querySelectorAll('.all-tab-item').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target.classList.contains('all-tab-edit-icon')) return;
            const tabId = el.dataset.tabId;
            switchTab(tabId);
            backdrop.remove();
            setTimeout(() => showCartReview(), 100);
        });
    });

    // Edit icon listeners
    backdrop.querySelectorAll('.all-tab-edit-icon').forEach(icon => {
        icon.addEventListener('click', (e) => {
            e.stopPropagation();
            const tabId = icon.dataset.editTabId;
            editTabLabel(tabId);
            // After rename, the modal will be refreshed automatically by editTabLabel
        });
    });

    backdrop.querySelector('#close-all-tabs-btn').onclick = () => {
        backdrop.remove();
        setTimeout(() => showCartReview(), 100);
    };

    backdrop.onclick = (e) => {
        if (e.target === backdrop) {
            backdrop.remove();
            setTimeout(() => showCartReview(), 100);
        }
    };
}

// ====================================================
// CART REVIEW MODAL (with tab switcher + edit icons + overflow handling) - UPDATED with KSh
// ====================================================

function showCartReview() {
    debugLog('Showing cart review');
    
    if (Object.keys(tabs).length === 0) {
        createTab('Current Sale');
    }
    
    const activeTab = getActiveTab();
    const items = activeTab.items;
    const tabsList = getTabsList();
    
    if (items.length === 0 && tabsList.length <= 1) {
        showNotification('Cart is empty! / Kikapu hakina bidhaa!', 'info', 2000);
        return;
    }
    
    const existingModal = document.querySelector('.cart-modal-backdrop');
    if (existingModal) existingModal.remove();

    const total = getCartTotal();
    
    const modalBackdrop = document.createElement('div');
    modalBackdrop.className = 'cart-modal-backdrop';
    
    // Determine visible tabs (max 3, then "more" button)
    const maxVisibleTabs = 3;
    let tabsHtml = '';
    if (tabsList.length <= maxVisibleTabs) {
        // Show all
        tabsHtml = tabsList.map(t => `
            <button class="tab-button ${t.isActive ? 'active' : ''}" data-tab-id="${t.id}">
                ${t.label} (${t.itemCount} items | KSh ${t.total.toFixed(2)})
                <span class="tab-edit-icon" data-edit-tab-id="${t.id}" title="Edit name / Hariri jina">✎</span>
            </button>
        `).join('');
    } else {
        // Show first maxVisibleTabs
        const visibleTabs = tabsList.slice(0, maxVisibleTabs);
        tabsHtml = visibleTabs.map(t => `
            <button class="tab-button ${t.isActive ? 'active' : ''}" data-tab-id="${t.id}">
                ${t.label} (${t.itemCount} items | KSh ${t.total.toFixed(2)})
                <span class="tab-edit-icon" data-edit-tab-id="${t.id}" title="Edit name / Hariri jina">✎</span>
            </button>
        `).join('');
        
        const moreCount = tabsList.length - maxVisibleTabs;
        tabsHtml += `
            <button class="tab-more-btn" id="show-all-tabs-btn">
                ▼ ${moreCount} more
            </button>
        `;
    }
    
    modalBackdrop.innerHTML = `
        <div class="cart-modal-container">
            <!-- Header -->
            <div style="
                background: linear-gradient(135deg, #667eea, #764ba2);
                color: white;
                padding: 24px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            ">
                <h2 style="margin: 0; font-size: 24px; display: flex; align-items: center; gap: 10px;">
                    <span>🛒</span>
                    <span>Your Cart / Kikapu Chako</span>
                </h2>
                <button id="close-cart-btn" style="
                    background: rgba(255,255,255,0.2);
                    border: none;
                    color: white;
                    width: 40px;
                    height: 40px;
                    border-radius: 10px;
                    font-size: 24px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: background 0.2s;
                ">×</button>
            </div>
            
            <!-- Tab Switcher -->
            <div class="tab-selector">
                ${tabsHtml}
                <button class="new-tab-btn" id="new-tab-btn">
                    <span>➕</span> New Tab / Kichupo Kipya
                </button>
            </div>
            
            <!-- Active Tab Label -->
            <div style="padding: 0 24px 8px;">
                <span style="font-weight:600; color:#333;">${activeTab.label}</span>
            </div>
            
            <!-- Items List -->
            <div style="
                flex: 1;
                overflow-y: auto;
                padding: 20px 24px;
                max-height: 50vh;
            ">
                ${items.length === 0 ? `
                    <div style="text-align:center; color:#94a3b8; padding:30px;">
                        <p>No items in this tab. / Hakuna bidhaa kwenye kichupo hiki.</p>
                    </div>
                ` : items.map((item, index) => {
                    const price = item.price || item.sellPrice || item.sell_price || 0;
                    const subtotal = price * item.quantity;
                    const itemName = item.display_name || item.name;
                    
                    const typeBadge = item.type === 'selling_unit' 
                        ? `<span style="background:#9b59b6;color:white;font-size:10px;padding:2px 6px;border-radius:4px;margin-left:8px;">Selling Unit / Kitengo</span>`
                        : `<span style="background:#3498db;color:white;font-size:10px;padding:2px 6px;border-radius:4px;margin-left:8px;">Base Item / Kikuu</span>`;
                    
                    const batchInfo = item.batch_name ? `
                        <div style="
                            background: #e9ecef;
                            color: #7950f2;
                            font-size: 12px;
                            padding: 2px 8px;
                            border-radius: 4px;
                            display: inline-block;
                            margin-right: 8px;
                        ">${item.batch_name}</div>
                    ` : '';
                    
                    const smartIndicator = item._batch_switched ? `
                        <div style="
                            background: #ff9f43;
                            color: white;
                            font-size: 10px;
                            padding: 2px 6px;
                            border-radius: 4px;
                            display: inline-block;
                            margin-right: 8px;
                        ">Auto-switched / Imegeuzwa</div>
                    ` : '';
                    
                    const stockInfo = item.real_available !== undefined ? `
                        <div style="font-size:11px;color:#666;margin-top:2px;">
                            Real stock: ${item.real_available.toFixed(2)} / Stock halisi: ${item.real_available.toFixed(2)}
                        </div>
                    ` : '';
                    
                    return `
                        <div class="cart-item" style="
                            padding: 16px;
                            margin-bottom: 12px;
                            background: #f8f9fa;
                            border-radius: 12px;
                            border: 1px solid #e9ecef;
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            transition: transform 0.2s, box-shadow 0.2s;
                        ">
                            <div style="flex: 1;">
                                <div style="
                                    font-weight: 600;
                                    color: #333;
                                    font-size: 16px;
                                    margin-bottom: 4px;
                                    display: flex;
                                    align-items: center;
                                ">
                                    ${itemName} ${typeBadge}
                                </div>
                                <div style="
                                    color: #666;
                                    font-size: 14px;
                                    margin-bottom: 4px;
                                ">KSh ${price.toFixed(2)} × ${item.quantity}</div>
                                ${batchInfo}
                                ${smartIndicator}
                                ${stockInfo}
                            </div>
                            <div style="
                                display: flex;
                                align-items: center;
                                gap: 16px;
                            ">
                                <div style="
                                    font-weight: 700;
                                    color: #2ed573;
                                    font-size: 18px;
                                ">
                                    KSh ${subtotal.toFixed(2)}
                                </div>
                                <button onclick="window.cartIcon.removeItem('${activeTab.id}', ${index})" style="
                                    background: #ff6b6b;
                                    color: white;
                                    border: none;
                                    width: 36px;
                                    height: 36px;
                                    border-radius: 8px;
                                    font-size: 20px;
                                    cursor: pointer;
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                    transition: background 0.2s;
                                ">×</button>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
            
            <!-- Footer -->
            <div style="
                padding: 24px;
                border-top: 2px solid #e9ecef;
                background: #f8f9fa;
            ">
                <div style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                ">
                    <div>
                        <div style="font-size: 14px; color: #666; margin-bottom: 4px;">Total Amount / Jumla</div>
                        <div style="font-size: 32px; font-weight: 800; color: #333;">KSh ${total.toFixed(2)}</div>
                    </div>
                    <button id="clear-tab-btn" style="
                        padding: 12px 24px;
                        background: #f8f9fa;
                        border: 2px solid #ff6b6b;
                        color: #ff6b6b;
                        border-radius: 10px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s;
                    ">Clear Tab / Futa Kichupo</button>
                </div>
                
                <div style="display: flex; gap: 12px;">
                    <button id="continue-shopping-btn" style="
                        flex: 1;
                        padding: 16px;
                        background: #e9ecef;
                        color: #666;
                        border: none;
                        border-radius: 12px;
                        font-weight: 600;
                        font-size: 16px;
                        cursor: pointer;
                        transition: background 0.2s;
                    ">Continue Shopping / Endelea Kununua</button>
                    <button id="checkout-btn" style="
                        flex: 1;
                        padding: 16px;
                        background: linear-gradient(135deg, #2ed573, #1dd1a1);
                        color: white;
                        border: none;
                        border-radius: 12px;
                        font-weight: 600;
                        font-size: 16px;
                        cursor: pointer;
                        transition: transform 0.2s, box-shadow 0.2s;
                    ">Proceed to Checkout / Nenda Maliponi →</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modalBackdrop);
    
    // Add tab switcher event listeners
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.addEventListener('click', (e) => {
            // If the click was on the edit icon, ignore switching
            if (e.target.classList.contains('tab-edit-icon')) return;
            const tabId = btn.dataset.tabId;
            switchTab(tabId);
            modalBackdrop.remove();
            setTimeout(() => showCartReview(), 100);
        });
    });
    
    // Edit icon listeners
    document.querySelectorAll('.tab-edit-icon').forEach(icon => {
        icon.addEventListener('click', (e) => {
            e.stopPropagation();
            const tabId = icon.dataset.editTabId;
            editTabLabel(tabId);
        });
    });
    
    // "More" button listener
    document.getElementById('show-all-tabs-btn')?.addEventListener('click', () => {
        modalBackdrop.remove();
        showAllTabsModal();
    });
    
    // New tab button with strict empty‑tab prevention
    document.getElementById('new-tab-btn').addEventListener('click', () => {
        const active = getActiveTab();
        if (active.items.length === 0) {
            // Current tab is empty – disallow creating a new empty tab
            showNotification('Current tab is empty. Please use it before creating a new one. / Kichupo cha sasa hakina bidhaa. Tafadhali kitumie kabla ya kuunda kipya.', 'warning', 3000);
        } else {
            createTab('');
        }
        modalBackdrop.remove();
        setTimeout(() => showCartReview(), 100);
    });
    
    setTimeout(() => {
        const items = document.querySelectorAll('.cart-item');
        items.forEach(item => {
            item.onmouseenter = () => {
                item.style.transform = 'translateY(-2px)';
                item.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
            };
            item.onmouseleave = () => {
                item.style.transform = 'translateY(0)';
                item.style.boxShadow = 'none';
            };
        });
    }, 100);
    
    // Event handlers
    document.getElementById('close-cart-btn').onclick = () => modalBackdrop.remove();
    
    document.getElementById('clear-tab-btn').onclick = () => {
        if (confirm(`Clear all items from "${activeTab.label}"? / Futa vitu vyote kwenye "${activeTab.label}"?`)) {
            activeTab.items = [];
            activeTab.lastActivity = Date.now();
            activeTab.total = 0;
            saveTabsToStorage();
            updateCartIcon();
            modalBackdrop.remove();
            if (getCartCount() > 0 || Object.keys(tabs).length > 1) {
                setTimeout(() => showCartReview(), 100);
            }
            showNotification(`Tab "${activeTab.label}" cleared! / Kichupo "${activeTab.label}" kimefutwa!`, 'success', 2000);
        }
    };
    
    document.getElementById('continue-shopping-btn').onclick = () => modalBackdrop.remove();
    
    document.getElementById('checkout-btn').onclick = () => {
        modalBackdrop.remove();
        setTimeout(() => showPaymentModal(), 300);
    };
    
    modalBackdrop.onclick = (e) => {
        if (e.target === modalBackdrop) modalBackdrop.remove();
    };
}

// ====================================================
// PAYMENT MODAL – UPDATED with KSh
// ====================================================

function showPaymentModal() {
    debugLog('Showing payment modal');
    
    const total = getCartTotal();
    totalAmount = total;
    
    // Reset payment selections
    selectedPaymentMethods = [];
    paymentSplit = { cash: 0, mpesa: 0, card: 0 };
    
    const existingModal = document.querySelector('.cart-modal-backdrop');
    if (existingModal) existingModal.remove();
    
    const modalBackdrop = document.createElement('div');
    modalBackdrop.className = 'cart-modal-backdrop';
    
    modalBackdrop.innerHTML = `
        <div class="cart-modal-container" style="max-width: 500px;">
            <div style="
                background: linear-gradient(135deg, #1dd1a1, #10ac84);
                color: white;
                padding: 24px;
                text-align: center;
            ">
                <h2 style="margin: 0; font-size: 24px; display: flex; align-items: center; justify-content: center; gap: 10px;">
                    <span>💳</span>
                    <span>Complete Purchase / Maliza Ununuzi</span>
                </h2>
                <div style="margin-top: 16px; font-size: 14px; opacity: 0.9;">
                    Tab: ${getActiveTab().label}
                </div>
            </div>
            
            <div style="padding: 24px;">
                <div style="text-align: center; margin-bottom: 24px;">
                    <div style="font-size: 14px; color: #666; margin-bottom: 8px;">Total Amount / Jumla</div>
                    <div style="font-size: 48px; font-weight: 800; color: #333; margin-bottom: 8px;" id="modal-total">
                        KSh ${total.toFixed(2)}
                    </div>
                    <div style="color: #666; font-size: 14px;">
                        ${getActiveTab().items.length} item(s) • Smart batch tracking / Ufuatiliaji mahiri
                    </div>
                </div>
                
                <!-- Payment Method Selection -->
                <div style="margin-bottom: 20px;">
                    <div style="font-weight: 600; color: #333; margin-bottom: 12px;">
                        Payment Method / Njia ya Malipo
                        <span style="font-size: 12px; color: #666; margin-left: 8px;">(Tap to select / Bonyeza kuchagua)</span>
                    </div>
                    
                    <!-- Payment Method Grid -->
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 15px;">
                        <!-- Cash -->
                        <div class="payment-option" data-method="cash" style="
                            background: #f8f9fa;
                            border: 2px solid #e9ecef;
                            border-radius: 12px;
                            padding: 15px 8px;
                            text-align: center;
                            cursor: pointer;
                            transition: all 0.2s;
                        ">
                            <div style="font-size: 24px; margin-bottom: 5px;">💰</div>
                            <div style="font-weight: 600; font-size: 14px;">Cash</div>
                            <div style="font-size: 11px; color: #666;">Taslimu</div>
                        </div>
                        
                        <!-- M-Pesa / Phone -->
                        <div class="payment-option" data-method="mpesa" style="
                            background: #f8f9fa;
                            border: 2px solid #e9ecef;
                            border-radius: 12px;
                            padding: 15px 8px;
                            text-align: center;
                            cursor: pointer;
                            transition: all 0.2s;
                        ">
                            <div style="font-size: 24px; margin-bottom: 5px;">📱</div>
                            <div style="font-weight: 600; font-size: 14px;">M-Pesa</div>
                            <div style="font-size: 11px; color: #666;">Phone</div>
                        </div>
                        
                        <!-- Card -->
                        <div class="payment-option" data-method="card" style="
                            background: #f8f9fa;
                            border: 2px solid #e9ecef;
                            border-radius: 12px;
                            padding: 15px 8px;
                            text-align: center;
                            cursor: pointer;
                            transition: all 0.2s;
                        ">
                            <div style="font-size: 24px; margin-bottom: 5px;">💳</div>
                            <div style="font-weight: 600; font-size: 14px;">Card</div>
                            <div style="font-size: 11px; color: #666;">Kadi</div>
                        </div>
                    </div>
                    
                    <!-- Mixed Payment Section -->
                    <div id="mixed-payment-section" style="
                        background: #f0f9ff;
                        border: 2px solid #3b82f6;
                        border-radius: 12px;
                        padding: 15px;
                        margin-top: 10px;
                        display: none;
                    ">
                        <div style="font-weight: 600; color: #1e293b; margin-bottom: 10px;">
                            Split Payment / Gawanya Malipo
                        </div>
                        
                        <div style="display: flex; gap: 10px; margin-bottom: 10px; flex-wrap: wrap;">
                            <div style="flex: 1; min-width: 100px;">
                                <label style="font-size: 12px; color: #666; display: block; margin-bottom: 4px;">Cash Amount</label>
                                <input type="number" id="cash-amount" class="split-input" placeholder="0" min="0" value="0" step="0.01">
                            </div>
                            <div style="flex: 1; min-width: 100px;">
                                <label style="font-size: 12px; color: #666; display: block; margin-bottom: 4px;">M-Pesa Amount</label>
                                <input type="number" id="mpesa-amount" class="split-input" placeholder="0" min="0" value="0" step="0.01">
                            </div>
                            <div style="flex: 1; min-width: 100px;">
                                <label style="font-size: 12px; color: #666; display: block; margin-bottom: 4px;">Card Amount</label>
                                <input type="number" id="card-amount" class="split-input" placeholder="0" min="0" value="0" step="0.01">
                            </div>
                        </div>
                        
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div style="font-size: 13px; color: #2563eb;">
                                Total: <span id="split-total">0</span> / <span id="grand-total">${total.toFixed(2)}</span>
                            </div>
                            <button id="apply-split" style="
                                background: #3b82f6;
                                color: white;
                                border: none;
                                padding: 8px 16px;
                                border-radius: 8px;
                                font-size: 13px;
                                font-weight: 600;
                                cursor: pointer;
                            ">Apply Split / Weka</button>
                        </div>
                    </div>
                    
                    <!-- Selected Payment Summary -->
                    <div id="payment-summary" style="
                        margin-top: 15px;
                        padding: 12px;
                        background: #e8f5e9;
                        border-radius: 8px;
                        font-size: 13px;
                        color: #2e7d32;
                        display: none;
                    ">
                        <span id="payment-summary-text"></span>
                    </div>
                </div>
                
                <div style="display: flex; gap: 12px;">
                    <button id="back-to-cart-btn" style="
                        flex: 1;
                        padding: 16px;
                        background: #e9ecef;
                        color: #666;
                        border: none;
                        border-radius: 12px;
                        font-weight: 600;
                        font-size: 16px;
                        cursor: pointer;
                        transition: background 0.2s;
                    ">← Back to Cart / Rudi Kwenye Kikapu</button>
                    <button id="complete-purchase-btn" style="
                        flex: 1;
                        padding: 16px;
                        background: linear-gradient(135deg, #2ed573, #1dd1a1);
                        color: white;
                        border: none;
                        border-radius: 12px;
                        font-weight: 600;
                        font-size: 16px;
                        cursor: pointer;
                        transition: transform 0.2s, box-shadow 0.2s;
                        opacity: 0.5;
                        pointer-events: none;
                    " disabled>
                        <span style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                            <span>Complete Purchase / Maliza Ununuzi</span>
                            <span>✅</span>
                        </span>
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modalBackdrop);
    
    // Initialize payment method handlers (unchanged)
    initPaymentMethodHandlers(total);
    
    document.getElementById('back-to-cart-btn').onclick = () => {
        modalBackdrop.remove();
        setTimeout(() => showCartReview(), 300);
    };
    
    document.getElementById('complete-purchase-btn').onclick = async () => {
        const btn = document.getElementById('complete-purchase-btn');
        const originalText = btn.innerHTML;
        
        btn.innerHTML = '<span>Processing... / Inashughulikia...</span>';
        btn.disabled = true;
        
        try {
            // Determine payment method string for record
            let paymentMethod = selectedPaymentMethods.join('+');
            if (selectedPaymentMethods.length === 0) paymentMethod = 'cash'; // default
            
            await completeSale({
                method: paymentMethod,
                split: paymentSplit,
                total: total
            });
            
            modalBackdrop.remove();
            showNotification('✅ Sale completed! / Ununuzi umekamilika!', 'success', 3000);
            
        } catch (error) {
            btn.innerHTML = originalText;
            btn.disabled = false;
            showNotification(`❌ Sale failed: ${error.message} / Ununuzi umeshindwa: ${error.message}`, 'error', 5000);
        }
    };
    
    modalBackdrop.onclick = (e) => {
        if (e.target === modalBackdrop) modalBackdrop.remove();
    };
}

// ====================================================
// PAYMENT METHOD HANDLERS (unchanged)
// ====================================================
function initPaymentMethodHandlers(total) {
    const options = document.querySelectorAll('.payment-option');
    const mixedSection = document.getElementById('mixed-payment-section');
    const summary = document.getElementById('payment-summary');
    const summaryText = document.getElementById('payment-summary-text');
    const completeBtn = document.getElementById('complete-purchase-btn');
    
    options.forEach(opt => {
        opt.addEventListener('click', function() {
            const method = this.dataset.method;
            
            if (this.classList.contains('selected')) {
                this.classList.remove('selected');
                this.style.borderColor = '#e9ecef';
                this.style.background = '#f8f9fa';
                selectedPaymentMethods = selectedPaymentMethods.filter(m => m !== method);
                paymentSplit[method] = 0;
            } else {
                this.classList.add('selected');
                this.style.borderColor = '#3b82f6';
                this.style.background = '#eff6ff';
                selectedPaymentMethods.push(method);
            }
            
            if (selectedPaymentMethods.length > 1) {
                mixedSection.style.display = 'block';
                resetSplitInputs();
            } else {
                mixedSection.style.display = 'none';
                if (selectedPaymentMethods.length === 1) {
                    const method = selectedPaymentMethods[0];
                    paymentSplit = { cash: 0, mpesa: 0, card: 0 };
                    paymentSplit[method] = total;
                }
            }
            
            updatePaymentSummary(total, summary, summaryText);
            
            if (selectedPaymentMethods.length > 0) {
                completeBtn.style.opacity = '1';
                completeBtn.style.pointerEvents = 'auto';
                completeBtn.disabled = false;
            } else {
                completeBtn.style.opacity = '0.5';
                completeBtn.style.pointerEvents = 'none';
                completeBtn.disabled = true;
            }
        });
    });
    
    document.getElementById('cash-amount')?.addEventListener('input', () => validateSplit(total));
    document.getElementById('mpesa-amount')?.addEventListener('input', () => validateSplit(total));
    document.getElementById('card-amount')?.addEventListener('input', () => validateSplit(total));
    
    document.getElementById('apply-split')?.addEventListener('click', () => applySplit(total, summary, summaryText));
}

function resetSplitInputs() {
    document.getElementById('cash-amount').value = '0';
    document.getElementById('mpesa-amount').value = '0';
    document.getElementById('card-amount').value = '0';
    document.getElementById('split-total').textContent = '0';
}

function validateSplit(total) {
    const cash = parseFloat(document.getElementById('cash-amount').value) || 0;
    const mpesa = parseFloat(document.getElementById('mpesa-amount').value) || 0;
    const card = parseFloat(document.getElementById('card-amount').value) || 0;
    const splitTotal = cash + mpesa + card;
    
    document.getElementById('split-total').textContent = splitTotal.toFixed(2);
    
    const applyBtn = document.getElementById('apply-split');
    if (Math.abs(splitTotal - total) < 0.01) {
        applyBtn.style.background = '#10b981';
    } else {
        applyBtn.style.background = '#94a3b8';
    }
}

function applySplit(total, summary, summaryText) {
    const cash = parseFloat(document.getElementById('cash-amount').value) || 0;
    const mpesa = parseFloat(document.getElementById('mpesa-amount').value) || 0;
    const card = parseFloat(document.getElementById('card-amount').value) || 0;
    const splitTotal = cash + mpesa + card;
    
    if (Math.abs(splitTotal - total) > 0.01) {
        alert('Split amounts must equal total! / Malipo yanapaswa kuwa sawa na jumla!');
        return;
    }
    
    paymentSplit = { cash, mpesa, card };
    
    updatePaymentSummary(total, summary, summaryText);
}

function updatePaymentSummary(total, summary, summaryText) {
    if (selectedPaymentMethods.length === 0) {
        summary.style.display = 'none';
        return;
    }
    
    let text = '';
    if (selectedPaymentMethods.length === 1) {
        const method = selectedPaymentMethods[0];
        const methodNames = { cash: '💰 Cash', mpesa: '📱 M-Pesa', card: '💳 Card' };
        text = `${methodNames[method]} - Full payment / Malipo kamili`;
    } else {
        const parts = [];
        if (paymentSplit.cash > 0) parts.push(`💰 Cash: KSh ${paymentSplit.cash.toFixed(2)}`);
        if (paymentSplit.mpesa > 0) parts.push(`📱 M-Pesa: KSh ${paymentSplit.mpesa.toFixed(2)}`);
        if (paymentSplit.card > 0) parts.push(`💳 Card: KSh ${paymentSplit.card.toFixed(2)}`);
        text = `Split: ${parts.join(' + ')}`;
    }
    
    summaryText.textContent = text;
    summary.style.display = 'block';
}

// ====================================================
// FRONTEND SALE COMPLETION FUNCTIONS
// ====================================================

/**
 * Generate unique transaction ID
 */
function generateTransactionId() {
    return `sale_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Process single sale item (replaces backend logic)
 */
async function processSaleItem(shop_id, seller, cartItem, index) {
    console.log(`\n📦 Processing item ${index + 1}`, cartItem);
    
    const {
        item_id,
        category_id,
        batch_id,
        quantity,
        unit = "unit",
        conversion_factor = 1,
        type = "main_item"
    } = cartItem;
    
    if (!item_id || !category_id || !batch_id || !quantity || quantity <= 0) {
        throw new Error(`Invalid item data: ${JSON.stringify({ item_id, category_id, batch_id, quantity })}`);
    }
    
    const quantityNum = parseFloat(quantity);
    const conversionFactorNum = parseFloat(conversion_factor);
    
    console.log(`   Type: ${type} | Qty: ${quantityNum} | Conv: ${conversionFactorNum}`);
    
    const itemRef = doc(
        db,
        "Shops",
        shop_id,
        "categories",
        category_id,
        "items",
        item_id
    );
    
    const itemDoc = await getDoc(itemRef);
    
    if (!itemDoc.exists()) {
        throw new Error(`Item ${item_id} not found in category ${category_id}`);
    }
    
    const itemData = itemDoc.data();
    const batches = itemData.batches || [];
    const totalStock = parseFloat(itemData.stock || 0);
    
    const batchIndex = batches.findIndex(b => b.id === batch_id);
    if (batchIndex === -1) {
        throw new Error(`Batch ${batch_id} not found for item ${itemData.name}`);
    }
    
    const batch = batches[batchIndex];
    const batchQty = parseFloat(batch.quantity || 0);
    const sellPrice = parseFloat(batch.sellPrice || batch.sell_price || 0);
    
    console.log(`   Batch available: ${batchQty} base units`);
    
    let baseQty;
    let unitPrice;
    let totalPrice;
    
    if (type === "selling_unit") {
        baseQty = quantityNum / conversionFactorNum;
        unitPrice = sellPrice / conversionFactorNum;
        totalPrice = unitPrice * quantityNum;
        
        console.log(`   Selling unit: ${quantityNum} units ÷ ${conversionFactorNum} = ${baseQty} base units`);
        console.log(`   Unit price: KSh ${sellPrice} ÷ ${conversionFactorNum} = KSh ${unitPrice}`);
    } else {
        baseQty = quantityNum;
        unitPrice = sellPrice;
        totalPrice = sellPrice * baseQty;
        
        console.log(`   Main item: ${quantityNum} base units`);
    }
    
    console.log(`   Required to deduct: ${baseQty} base units`);
    
    if (batchQty < baseQty) {
        throw new Error(
            `Insufficient stock in batch ${batch_id}. ` +
            `Available: ${batchQty} base units, Requested: ${baseQty} base units`
        );
    }
    
    const newBatchQty = batchQty - baseQty;
    const newTotalStock = totalStock - baseQty;
    
    const stockTxn = {
        id: generateTransactionId(),
        type: "sale",
        item_type: type,
        batchId: batch_id,
        quantity: baseQty,
        selling_units_quantity: type === "selling_unit" ? quantityNum : null,
        unit: unit,
        sellPrice: sellPrice,
        unitPrice: unitPrice,
        totalPrice: totalPrice,
        timestamp: Math.floor(Date.now() / 1000),
        performedBy: seller,
        conversion_factor: type === "selling_unit" ? conversionFactorNum : null
    };
    
    const updatedBatches = [...batches];
    updatedBatches[batchIndex] = {
        ...updatedBatches[batchIndex],
        quantity: newBatchQty
    };
    
    const stockTransactions = itemData.stockTransactions || [];
    
    await updateDoc(itemRef, {
        batches: updatedBatches,
        stock: newTotalStock,
        stockTransactions: arrayUnion(stockTxn),
        lastStockUpdate: serverTimestamp(),
        lastTransactionId: stockTxn.id
    });
    
    console.log(`   ✅ Deducted: ${baseQty} base units`);
    console.log(`   ✅ Remaining in batch: ${newBatchQty}`);
    console.log(`   ✅ Total price: KSh ${totalPrice}`);
    
    return {
        item_id,
        item_type: type,
        batch_id,
        quantity_sold: quantityNum,
        base_units_deducted: baseQty,
        remaining_batch_quantity: newBatchQty,
        remaining_total_stock: newTotalStock,
        batch_exhausted: newBatchQty === 0,
        total_price: totalPrice,
        unit_price: unitPrice,
        transaction_id: stockTxn.id,
        item_ref: itemRef,
        original_batch_qty: batchQty,
        original_total_stock: totalStock
    };
}

async function rollbackItemDeduction(itemResult) {
    try {
        const { item_ref, original_batch_qty, original_total_stock, batch_id } = itemResult;
        
        const itemDoc = await getDoc(item_ref);
        if (!itemDoc.exists()) return;
        
        const itemData = itemDoc.data();
        const batches = itemData.batches || [];
        const batchIndex = batches.findIndex(b => b.id === batch_id);
        
        if (batchIndex !== -1) {
            const updatedBatches = [...batches];
            updatedBatches[batchIndex] = {
                ...updatedBatches[batchIndex],
                quantity: original_batch_qty
            };
            
            await updateDoc(item_ref, {
                batches: updatedBatches,
                stock: original_total_stock,
                lastStockUpdate: serverTimestamp()
            });
            
            itemResult.rolled_back = true;
            console.log(`🔄 Rolled back item`);
        }
    } catch (error) {
        console.error('Rollback error:', error);
    }
}

async function createSaleRecord(shop_id, seller, items, updatedItems, paymentDetails = {}) {
    try {
        const saleId = generateTransactionId();
        const totalAmount = updatedItems.reduce((sum, item) => sum + (item.total_price || 0), 0);
        
        const auth = getAuth();
        const user = auth.currentUser;
        
        const sessionType = localStorage.getItem("sessionType") || "owner";
        let staffInfo = {};
        
        if (sessionType === "staff") {
            try {
                const staffContext = JSON.parse(localStorage.getItem("staffContext") || "{}");
                staffInfo = {
                    staffId: staffContext.staffId || null,
                    roleName: staffContext.roleName || null,
                    accessLevel: staffContext.accessLevel || null,
                    staffName: staffContext.name || null
                };
            } catch (e) {
                console.error('Error parsing staff context:', e);
            }
        }
        
        const sellerInfo = {
            uid: user?.uid || null,
            email: user?.email || null,
            name: user?.displayName || seller?.name || null,
            sessionType: sessionType,
            ...staffInfo
        };
        
        const cleanItems = (items || []).map(item => ({
            item_id: item.item_id || null,
            main_item_id: item.main_item_id || item.item_id || null,
            category_id: item.category_id || null,
            name: item.name || null,
            display_name: item.display_name || item.name || null,
            type: item.type || "main_item",
            quantity: parseFloat(item.quantity) || 1,
            price: parseFloat(item.price || item.sellPrice || item.sell_price) || 0,
            batch_id: item.batch_id || null,
            sell_unit_id: item.sell_unit_id || null,
            conversion_factor: parseFloat(item.conversion_factor) || 1
        }));
        
        const cleanProcessedItems = (updatedItems || []).map(item => ({
            item_id: item.item_id || null,
            item_type: item.item_type || null,
            batch_id: item.batch_id || null,
            quantity_sold: parseFloat(item.quantity_sold) || 0,
            base_units_deducted: parseFloat(item.base_units_deducted) || 0,
            remaining_batch_quantity: parseFloat(item.remaining_batch_quantity) || 0,
            remaining_total_stock: parseFloat(item.remaining_total_stock) || 0,
            batch_exhausted: item.batch_exhausted || false,
            total_price: parseFloat(item.total_price) || 0,
            unit_price: parseFloat(item.unit_price) || 0,
            transaction_id: item.transaction_id || null
        }));
        
        const paymentMethod = paymentDetails.method || 'cash';
        const paymentSplit = paymentDetails.split || null;
        
        const saleRecord = {
            id: saleId,
            shop_id: shop_id || null,
            seller: sellerInfo,
            items: cleanItems,
            processed_items: cleanProcessedItems,
            total_amount: totalAmount || 0,
            payment_method: paymentMethod,
            payment_split: paymentSplit,
            timestamp: new Date().toISOString(),
            created_at: serverTimestamp(),
            status: 'completed',
            transaction_count: updatedItems?.length || 0,
            tab_label: getActiveTab().label
        };
        
        const finalSaleRecord = {};
        Object.keys(saleRecord).forEach(key => {
            if (saleRecord[key] !== undefined) {
                finalSaleRecord[key] = saleRecord[key];
            }
        });
        
        const saleRef = doc(db, "Shops", shop_id, "sales", saleId);
        await setDoc(saleRef, finalSaleRecord);
        console.log('📝 Sale record created:', saleId);
        
        return finalSaleRecord;
        
    } catch (error) {
        console.error('❌ Error creating sale record:', error);
        return {
            id: generateTransactionId(),
            error: 'Record creation failed',
            items_processed: updatedItems?.length || 0
        };
    }
}

/**
 * Main sale completion function – processes the active tab and then removes it.
 */
async function completeSale(paymentDetails = { method: 'cash', split: null, total: 0 }) {
    console.log('🛒 Starting FRONTEND sale completion for active tab');
    
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) throw new Error("Please login first / Tafadhali ingia kwanza");

    const sessionType = localStorage.getItem("sessionType") || "owner";
    let shop_id = user.uid;
    
    if (sessionType === "staff") {
        try {
            const staffContext = JSON.parse(localStorage.getItem("staffContext") || "{}");
            if (staffContext.shopId) {
                shop_id = staffContext.shopId;
                console.log('👥 Staff sale - using shop ID:', shop_id);
            }
        } catch (e) {
            console.error('Error parsing staff context:', e);
        }
    }
    
    const activeTab = getActiveTab();
    if (activeTab.items.length === 0) throw new Error("Cart is empty! / Kikapu hakina bidhaa!");

    const seller = {
        type: sessionType,
        authUid: user.uid,
        name: user.displayName || "",
        email: user.email || ""
    };

    const saleItems = activeTab.items.map(item => ({
        item_id: item.item_id,
        main_item_id: item.main_item_id || item.item_id,
        category_id: item.category_id || 'unknown',
        name: item.name,
        display_name: item.display_name || item.name,
        type: item.type || "main_item",
        quantity: item.quantity,
        price: item.price || item.sellPrice || item.sell_price || 0,
        sellPrice: item.price || item.sellPrice || item.sell_price || 0,
        batch_id: item.batch_id,
        batchId: item.batch_id,
        batch_remaining: item.batch_remaining || 0,
        can_fulfill: item.can_fulfill !== undefined ? item.can_fulfill : true,
        batch_switch_required: item.batch_switch_required || false,
        real_available: item.real_available,
        sell_unit_id: item.sell_unit_id,
        conversion_factor: item.conversion_factor || 1,
        unit: item.type === 'selling_unit' ? (item.display_name || 'unit') : 'unit'
    }));

    console.log('🛒 Processing sale with items:', saleItems.length);
    
    const updatedItems = [];
    const errors = [];
    
    for (let idx = 0; idx < saleItems.length; idx++) {
        const cartItem = saleItems[idx];
        try {
            const result = await processSaleItem(shop_id, seller, cartItem, idx);
            updatedItems.push(result);
            console.log(`✅ Item ${idx + 1} processed successfully`);
        } catch (error) {
            errors.push({
                item: cartItem,
                error: error.message,
                index: idx
            });
            console.log(`❌ Item ${idx + 1} failed:`, error.message);
        }
    }
    
    if (errors.length > 0) {
        console.log('Rolling back successful items due to errors', errors);
        for (const item of updatedItems) {
            if (item.rolled_back !== true) {
                try {
                    await rollbackItemDeduction(item);
                } catch (rollbackError) {
                    console.error('Rollback failed:', rollbackError);
                }
            }
        }
        throw new Error(`Sale partially failed: ${errors.length} item(s) could not be processed. ${errors[0].error}`);
    }
    
    const saleRecord = await createSaleRecord(shop_id, seller, saleItems, updatedItems, paymentDetails);
    
    // Remove the active tab after successful sale
    delete tabs[activeTabId];
    
    // If there are other tabs, switch to one; otherwise create a new default tab
    const remainingIds = Object.keys(tabs);
    if (remainingIds.length > 0) {
        activeTabId = remainingIds[0];
    } else {
        activeTabId = createTab('Current Sale');
    }
    
    saveTabsToStorage();
    updateCartIcon();
    
    console.log('🎉 FRONTEND SALE COMPLETED SUCCESSFULLY', {
        items_processed: updatedItems.length,
        sale_id: saleRecord.id,
        payment_method: paymentDetails.method,
        tab_closed: activeTab.label
    });
    
    showNotification('✅ Sale completed! / Ununuzi umekamilika!', 'success', 5000);
    
    return {
        success: true,
        updated_items: updatedItems,
        sale_record: saleRecord,
        message: `Sale completed successfully. ${updatedItems.length} item(s) processed. / Ununuzi umekamilika. Vitu ${updatedItems.length} vimeshughulikiwa.`
    };
}

// ====================================================
// CART ITEM REMOVAL (from a specific tab)
// ====================================================

function removeCartItem(tabId, index) {
    const tab = tabs[tabId];
    if (!tab) return;
    
    if (index >= 0 && index < tab.items.length) {
        const itemName = tab.items[index].name;
        tab.items.splice(index, 1);
        tab.lastActivity = Date.now();
        tab.total = tab.items.reduce((sum, i) => sum + ((i.price || i.sellPrice || i.sell_price || 0) * i.quantity), 0);
        saveTabsToStorage();
        updateCartIcon();
        showNotification(`Removed ${itemName} from ${tab.label} / Imeondolewa ${itemName} kwenye ${tab.label}`, 'info', 2000);
        
        const existingModal = document.querySelector('.cart-modal-backdrop');
        if (existingModal) {
            existingModal.remove();
            if (tab.items.length > 0 || Object.keys(tabs).length > 1) {
                setTimeout(() => showCartReview(), 100);
            }
        }
    }
}

// ====================================================
// INITIALIZATION
// ====================================================

document.addEventListener("DOMContentLoaded", () => {
    console.log('🛒 Smart Cart System (Multi‑Tab) Initializing...');
    
    loadTabsFromStorage();
    updateCartIcon();
    
    setTimeout(() => {
        if (!document.getElementById('sales-cart-icon')) {
            console.error('Cart icon not found - retrying...');
            updateCartIcon();
        }
    }, 100);
    
    // Expose globally
    window.cartIcon = {
        addItem: addItemToCart,
        getActiveTab: () => getActiveTab(),
        getTabsList: getTabsList,
        createTab: createTab,
        switchTab: switchTab,
        closeTab: closeTab,
        editTabLabel: editTabLabel,
        clearActiveTab: () => {
            const tab = getActiveTab();
            tab.items = [];
            tab.lastActivity = Date.now();
            tab.total = 0;
            saveTabsToStorage();
            updateCartIcon();
            showNotification(`Tab "${tab.label}" cleared / Kichupo "${tab.label}" kimefutwa`, 'info', 2000);
        },
        removeItem: removeCartItem,
        showCart: showCartReview,
        updateIcon: updateCartIcon,
        getCount: getCartCount,
        getTotal: getCartTotal,
        completeSale: completeSale,
        debug: () => {
            console.log('🛒 MULTI‑TAB DEBUG:', tabs);
        }
    };
    
    console.log('🛒 Smart Cart System (Multi‑Tab) Ready!');
    console.log(`
╔═══════════════════════════════════════════╗
║   🧠 MULTI‑TAB CART SYSTEM READY         ║
╠═══════════════════════════════════════════╣
║ • Multiple tabs (pubs, clubs, tables)    ║
║ • Auto‑named (Customer 1, 2, …)          ║
║ • Edit labels with pencil ✎               ║
║ • Prevents empty‑tab clutter              ║
║ • Overflow: first 3 tabs + more modal    ║
║ • Rename any tab, even hidden            ║
║ • Currency: KSh (Kenyan Shillings)       ║
║ • Smart batch tracking                    ║
║ • Frontend sale processing                ║
║ • Error recovery & rollback               ║
║ • Multi‑payment methods                   ║
║   (Cash, M-Pesa, Card, Split)             ║
║ • No backend required!                    ║
╚═══════════════════════════════════════════╝
`);
});

// Export main functions
export { addItemToCart, completeSale, createTab, switchTab, getTabsList };
