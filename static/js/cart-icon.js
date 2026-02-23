// cart-icon.js - SMART CART SYSTEM WITH FRONTEND SALE PROCESSING
// FIXED: Added proper staff handling, undefined value checks, and bilingual support
// ENHANCED: Added multi-payment method selection (Cash, M-Pesa, Card) with split payments

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
// GLOBAL CART STATE
// ====================================================
let cart = [];
let currentShopId = null;

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
// CART MANAGEMENT FUNCTIONS
// ====================================================

function saveCartToStorage() {
    localStorage.setItem('smart_sales_cart', JSON.stringify(cart));
    debugLog('Cart saved to storage', cart.length);
}

function loadCartFromStorage() {
    const saved = localStorage.getItem('smart_sales_cart');
    if (saved) {
        try {
            cart = JSON.parse(saved);
            debugLog('Cart loaded from storage', cart.length);
        } catch (error) {
            console.error('Error loading cart', error);
            cart = [];
        }
    }
    updateCartIcon();
}

function getCartCount() {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
}

function getCartTotal() {
    return cart.reduce((sum, item) => sum + ((item.price || item.sellPrice || item.sell_price || 0) * item.quantity), 0);
}

// ====================================================
// CART ICON
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
            🛒 ${count} items | $${total.toFixed(2)}
        </div>
    `;

    const container = cartIcon.querySelector('.cart-icon-container');
    
    container.onclick = () => {
        if (count > 0) {
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
        `;
        document.head.appendChild(style);
    }
}

// ====================================================
// ADD ITEM TO CART (UPDATED FOR SMART SYSTEM)
// ====================================================

function addItemToCart(item) {
    console.log('🛒 Adding smart item to cart:', item);
    
    if (!item || !item.name) {
        console.error('Invalid item:', item);
        return false;
    }
    
    const qty = 1; // One-tap system
    
    // ✅ Use smart fields from backend
    const stock = item.real_available !== undefined ? item.real_available : item.batch_remaining;
    
    if (stock < qty && item.can_fulfill === false) {
        showNotification(`❌ "${item.name}" is out of stock! / "${item.name}" imeisha!`, 'error', 3000);
        return false;
    }
    
    // Create unique cart ID
    const cartItemId = item.type === 'selling_unit' 
        ? `${item.item_id}_${item.sell_unit_id}_${item.batch_id}`
        : `${item.item_id}_main_${item.batch_id}`;
    
    const cartItem = {
        // Core identification
        id: cartItemId,
        cart_item_id: cartItemId,
        item_id: item.item_id,
        main_item_id: item.main_item_id || item.item_id,
        
        // Item info
        name: item.name,
        display_name: item.display_name || item.name,
        
        // Quantity & pricing
        quantity: qty,
        price: item.price || item.sellPrice || item.sell_price || 0,
        sellPrice: item.price || item.sellPrice || item.sell_price || 0,
        sell_price: item.price || item.sellPrice || item.sell_price || 0,
        
        // Required for backend
        category_id: item.category_id || 'unknown',
        category_name: item.category_name || 'Uncategorized',
        
        // Stock info
        stock: stock,
        available_stock: stock,
        
        // Smart fields
        type: item.type || 'main_item',
        batch_id: item.batch_id,
        batchId: item.batch_id,
        batch_name: item.batch_name,
        batch_remaining: item.batch_remaining || stock,
        
        // Selling unit info
        sell_unit_id: item.sell_unit_id,
        conversion_factor: item.conversion_factor || 1,
        
        // Smart system fields
        can_fulfill: item.can_fulfill !== undefined ? item.can_fulfill : true,
        batch_switch_required: item.batch_switch_required || false,
        is_current_batch: item.is_current_batch || false,
        real_available: item.real_available,
        
        // Metadata
        thumbnail: item.thumbnail,
        added_at: new Date().toISOString(),
        _batch_switched: item._batch_switched || false
    };
    
    console.log('🛒 Smart cart item:', {
        id: cartItem.id,
        type: cartItem.type,
        batch_id: cartItem.batch_id,
        can_fulfill: cartItem.can_fulfill
    });
    
    // Find existing item by unique ID
    const existingIndex = cart.findIndex(i => i.id === cartItemId);
    
    if (existingIndex !== -1) {
        const newQuantity = cart[existingIndex].quantity + qty;
        if (stock < newQuantity) {
            showNotification(`❌ Only ${stock - cart[existingIndex].quantity} available / ${stock - cart[existingIndex].quantity} tu zipo`, 'error', 3000);
            return false;
        }
        cart[existingIndex].quantity = newQuantity;
        console.log('🛒 Updated existing item:', cart[existingIndex].name, 'x', cart[existingIndex].quantity);
    } else {
        cart.push(cartItem);
        console.log('🛒 Added new item:', cartItem.name, 'Type:', cartItem.type);
    }
    
    saveCartToStorage();
    updateCartIcon();
    
    const itemName = cartItem.display_name || cartItem.name;
    showNotification(`✅ Added ${itemName} to cart! / Umeongeza ${itemName} kwenye kikapu!`, 'success', 2000);
    
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
// CART REVIEW MODAL (ENHANCED)
// ====================================================

function showCartReview() {
    debugLog('Showing smart cart review');
    
    if (cart.length === 0) {
        showNotification('Cart is empty! / Kikapu hakina bidhaa!', 'info', 2000);
        return;
    }
    
    const existingModal = document.querySelector('.cart-modal-backdrop');
    if (existingModal) existingModal.remove();

    const total = getCartTotal();
    
    const modalBackdrop = document.createElement('div');
    modalBackdrop.className = 'cart-modal-backdrop';
    
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
                    <span>Your Cart / Kikapu Chako (${getCartCount()} items / vitu)</span>
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
            
            <!-- Items List -->
            <div style="
                flex: 1;
                overflow-y: auto;
                padding: 20px;
                max-height: 50vh;
            ">
                ${cart.map((item, index) => {
                    const price = item.price || item.sellPrice || item.sell_price || 0;
                    const subtotal = price * item.quantity;
                    const itemName = item.display_name || item.name;
                    
                    // Type indicator
                    const typeBadge = item.type === 'selling_unit' 
                        ? `<span style="background:#9b59b6;color:white;font-size:10px;padding:2px 6px;border-radius:4px;margin-left:8px;">Selling Unit / Kitengo</span>`
                        : `<span style="background:#3498db;color:white;font-size:10px;padding:2px 6px;border-radius:4px;margin-left:8px;">Base Item / Kikuu</span>`;
                    
                    // Batch info
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
                    
                    // Smart indicator
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
                    
                    // Stock info
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
                                ">$${price.toFixed(2)} × ${item.quantity}</div>
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
                                    $${subtotal.toFixed(2)}
                                </div>
                                <button onclick="window.cartIcon.removeItem(${index})" style="
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
                        <div style="font-size: 32px; font-weight: 800; color: #333;">$${total.toFixed(2)}</div>
                    </div>
                    <button id="clear-all-btn" style="
                        padding: 12px 24px;
                        background: #f8f9fa;
                        border: 2px solid #ff6b6b;
                        color: #ff6b6b;
                        border-radius: 10px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s;
                    ">Clear All / Futa Yote</button>
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
    
    document.getElementById('clear-all-btn').onclick = () => {
        if (confirm('Clear all items from cart? / Futa vitu vyote kwenye kikapu?')) {
            cart = [];
            saveCartToStorage();
            updateCartIcon();
            modalBackdrop.remove();
            showNotification('Cart cleared! / Kikapu kimefutwa!', 'success', 2000);
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
// PAYMENT MODAL - ENHANCED WITH MULTI-PAYMENT OPTIONS
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
                    Smart batch system ensures correct stock allocation / Mfumo mahiri unahakikisha ugawaji sahihi wa stock
                </div>
            </div>
            
            <div style="padding: 24px;">
                <div style="text-align: center; margin-bottom: 24px;">
                    <div style="font-size: 14px; color: #666; margin-bottom: 8px;">Total Amount / Jumla</div>
                    <div style="font-size: 48px; font-weight: 800; color: #333; margin-bottom: 8px;" id="modal-total">
                        $${total.toFixed(2)}
                    </div>
                    <div style="color: #666; font-size: 14px;">
                        ${cart.length} item${cart.length !== 1 ? 's' : ''} • Smart batch tracking / Ufuatiliaji mahiri
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
    
    // Initialize payment method handlers
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
// PAYMENT METHOD HANDLERS
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
            
            // Toggle selection
            if (this.classList.contains('selected')) {
                // Deselect
                this.classList.remove('selected');
                this.style.borderColor = '#e9ecef';
                this.style.background = '#f8f9fa';
                selectedPaymentMethods = selectedPaymentMethods.filter(m => m !== method);
                paymentSplit[method] = 0;
            } else {
                // Select
                this.classList.add('selected');
                this.style.borderColor = '#3b82f6';
                this.style.background = '#eff6ff';
                selectedPaymentMethods.push(method);
            }
            
            // Show/hide mixed payment section
            if (selectedPaymentMethods.length > 1) {
                mixedSection.style.display = 'block';
                resetSplitInputs();
            } else {
                mixedSection.style.display = 'none';
                // If only one method, set full amount
                if (selectedPaymentMethods.length === 1) {
                    const method = selectedPaymentMethods[0];
                    paymentSplit = { cash: 0, mpesa: 0, card: 0 };
                    paymentSplit[method] = total;
                }
            }
            
            // Update payment summary
            updatePaymentSummary(total, summary, summaryText);
            
            // Enable/disable complete button
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
    
    // Split payment handlers
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
    
    // Store the split
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
        if (paymentSplit.cash > 0) parts.push(`💰 Cash: $${paymentSplit.cash.toFixed(2)}`);
        if (paymentSplit.mpesa > 0) parts.push(`📱 M-Pesa: $${paymentSplit.mpesa.toFixed(2)}`);
        if (paymentSplit.card > 0) parts.push(`💳 Card: $${paymentSplit.card.toFixed(2)}`);
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
    
    // Validate required fields
    if (!item_id || !category_id || !batch_id || !quantity || quantity <= 0) {
        throw new Error(`Invalid item data: ${JSON.stringify({ item_id, category_id, batch_id, quantity })}`);
    }
    
    const quantityNum = parseFloat(quantity);
    const conversionFactorNum = parseFloat(conversion_factor);
    
    console.log(`   Type: ${type} | Qty: ${quantityNum} | Conv: ${conversionFactorNum}`);
    
    // Get item reference
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
    
    // Find target batch
    const batchIndex = batches.findIndex(b => b.id === batch_id);
    if (batchIndex === -1) {
        throw new Error(`Batch ${batch_id} not found for item ${itemData.name}`);
    }
    
    const batch = batches[batchIndex];
    const batchQty = parseFloat(batch.quantity || 0);
    const sellPrice = parseFloat(batch.sellPrice || batch.sell_price || 0);
    
    console.log(`   Batch available: ${batchQty} base units`);
    
    // Calculate base quantity (critical conversion logic)
    let baseQty;
    let unitPrice;
    let totalPrice;
    
    if (type === "selling_unit") {
        // Selling units: quantity ÷ conversion_factor
        baseQty = quantityNum / conversionFactorNum;
        unitPrice = sellPrice / conversionFactorNum;
        totalPrice = unitPrice * quantityNum;
        
        console.log(`   Selling unit: ${quantityNum} units ÷ ${conversionFactorNum} = ${baseQty} base units`);
        console.log(`   Unit price: $${sellPrice} ÷ ${conversionFactorNum} = $${unitPrice}`);
    } else {
        // Main item: no conversion needed
        baseQty = quantityNum;
        unitPrice = sellPrice;
        totalPrice = sellPrice * baseQty;
        
        console.log(`   Main item: ${quantityNum} base units`);
    }
    
    console.log(`   Required to deduct: ${baseQty} base units`);
    
    // Validate stock availability
    if (batchQty < baseQty) {
        throw new Error(
            `Insufficient stock in batch ${batch_id}. ` +
            `Available: ${batchQty} base units, Requested: ${baseQty} base units`
        );
    }
    
    // Calculate new quantities
    const newBatchQty = batchQty - baseQty;
    const newTotalStock = totalStock - baseQty;
    
    // Create stock transaction
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
    
    // Update batch quantity
    const updatedBatches = [...batches];
    updatedBatches[batchIndex] = {
        ...updatedBatches[batchIndex],
        quantity: newBatchQty
    };
    
    // Get existing stock transactions
    const stockTransactions = itemData.stockTransactions || [];
    
    // Update Firestore document
    await updateDoc(itemRef, {
        batches: updatedBatches,
        stock: newTotalStock,
        stockTransactions: arrayUnion(stockTxn),
        lastStockUpdate: serverTimestamp(),
        lastTransactionId: stockTxn.id
    });
    
    console.log(`   ✅ Deducted: ${baseQty} base units`);
    console.log(`   ✅ Remaining in batch: ${newBatchQty}`);
    console.log(`   ✅ Total price: $${totalPrice}`);
    
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

/**
 * Rollback item deduction (for error recovery)
 */
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

// ====================================================
// CREATE SALE RECORD - FIXED FOR STAFF
// ====================================================
async function createSaleRecord(shop_id, seller, items, updatedItems, paymentDetails = {}) {
    try {
        const saleId = generateTransactionId();
        const totalAmount = updatedItems.reduce((sum, item) => sum + (item.total_price || 0), 0);
        
        // ✅ FIX: Get current user safely
        const auth = getAuth();
        const user = auth.currentUser;
        
        // ✅ FIX: Get session type and staff context
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
        
        // ✅ FIX: Build seller info with NO undefined values
        const sellerInfo = {
            uid: user?.uid || null,
            email: user?.email || null,
            name: user?.displayName || seller?.name || null,
            sessionType: sessionType,
            ...staffInfo
        };
        
        // ✅ FIX: Clean items - remove any undefined values
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
        
        // ✅ FIX: Clean processed items
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
        
        // ✅ ENHANCED: Add payment method details
        const paymentMethod = paymentDetails.method || 'cash';
        const paymentSplit = paymentDetails.split || null;
        
        // ✅ FIX: Create sale record with NO undefined values
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
            transaction_count: updatedItems?.length || 0
        };
        
        // ✅ FIX: Final check - remove any undefined values at top level
        const finalSaleRecord = {};
        Object.keys(saleRecord).forEach(key => {
            if (saleRecord[key] !== undefined) {
                finalSaleRecord[key] = saleRecord[key];
            }
        });
        
        // Save to Firestore
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
 * Main sale completion function (replaces backend call)
 */
async function completeSale(paymentDetails = { method: 'cash', split: null, total: 0 }) {
    console.log('🛒 Starting FRONTEND sale completion');
    
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) throw new Error("Please login first / Tafadhali ingia kwanza");

    // ✅ FIX: Get shop ID properly (works for both owner and staff)
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
    
    if (cart.length === 0) throw new Error("Cart is empty! / Kikapu hakina bidhaa!");

    const seller = {
        type: sessionType,
        authUid: user.uid,
        name: user.displayName || "",
        email: user.email || ""
    };

    // Transform cart items to sale format
    const saleItems = cart.map(item => ({
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
    
    // Process each item sequentially
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
    
    // If any items failed, rollback successful ones
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
    
    // Create sale record with payment details
    const saleRecord = await createSaleRecord(shop_id, seller, saleItems, updatedItems, paymentDetails);
    
    // Clear cart and reset cart ID
    cart = [];
    localStorage.removeItem('current_cart_id');
    saveCartToStorage();
    updateCartIcon();
    
    console.log('🎉 FRONTEND SALE COMPLETED SUCCESSFULLY', {
        items_processed: updatedItems.length,
        sale_id: saleRecord.id,
        payment_method: paymentDetails.method
    });
    
    showNotification('✅ Frontend sale completed successfully! / Ununuzi umekamilika kikamilifu!', 'success', 5000);
    
    return {
        success: true,
        updated_items: updatedItems,
        sale_record: saleRecord,
        message: `Sale completed successfully. ${updatedItems.length} item(s) processed. / Ununuzi umekamilika. Vitu ${updatedItems.length} vimeshughulikiwa.`
    };
}

// ====================================================
// CART ITEM REMOVAL
// ====================================================

function removeCartItem(index) {
    if (index >= 0 && index < cart.length) {
        const itemName = cart[index].name;
        cart.splice(index, 1);
        saveCartToStorage();
        updateCartIcon();
        showNotification(`Removed ${itemName} from cart / Imeondolewa ${itemName} kwenye kikapu`, 'info', 2000);
        
        const existingModal = document.querySelector('.cart-modal-backdrop');
        if (existingModal) {
            existingModal.remove();
            if (cart.length > 0) setTimeout(() => showCartReview(), 300);
        }
    }
}

// ====================================================
// INITIALIZATION
// ====================================================

document.addEventListener("DOMContentLoaded", () => {
    console.log('🛒 Smart Cart System Initializing...');
    
    loadCartFromStorage();
    updateCartIcon();
    
    // Test cart icon
    setTimeout(() => {
        if (!document.getElementById('sales-cart-icon')) {
            console.error('Cart icon not found - retrying...');
            updateCartIcon();
        }
    }, 100);
    
    // Expose globally
    window.cartIcon = {
        addItem: addItemToCart,
        getCart: () => [...cart],
        clearCart: () => {
            cart = [];
            saveCartToStorage();
            updateCartIcon();
            showNotification('Cart cleared / Kikapu kimefutwa', 'info', 2000);
        },
        removeItem: removeCartItem,
        showCart: showCartReview,
        updateIcon: updateCartIcon,
        getCount: getCartCount,
        getTotal: getCartTotal,
        completeSale: completeSale,
        debug: () => {
            console.log('🛒 SMART CART DEBUG:', cart.map(item => ({
                name: item.name,
                type: item.type,
                id: item.id,
                batch_id: item.batch_id,
                can_fulfill: item.can_fulfill,
                quantity: item.quantity
            })));
        }
    };
    
    console.log('🛒 Smart Cart System Ready!');
    console.log(`
╔═══════════════════════════════════════════╗
║     🧠 SMART CART SYSTEM READY           ║
╠═══════════════════════════════════════════╣
║ • Smart batch tracking                   ║
║ • Real stock management                  ║
║ • Frontend sale processing               ║
║ • Error recovery & rollback              ║
║ • Multi-payment methods                  ║
║   (Cash, M-Pesa, Card, Split)            ║
║ • No backend required!                   ║
╚═══════════════════════════════════════════╝
`);
});

// Export main function
export { addItemToCart, completeSale };