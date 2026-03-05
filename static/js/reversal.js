// static/js/reversal.js - Educational Reversal API Demo
// Focus: Simple Shop (C2B → Hold → Reversal)

(function() {
    'use strict';
    
    // =============================================
    // STATE MANAGEMENT
    // =============================================
    let transactions = [];
    
    // =============================================
    // INITIALIZATION
    // =============================================
    window.initReversal = function(containerId) {
        console.log("↩️ Initializing Reversal Demo (Simple Shop)");
        const container = document.getElementById(containerId);
        if (!container) return;
        
        container.innerHTML = getReversalHTML();
        injectReversalStyles();
        loadTransactions();
        renderTransactionHistory();
        setupEventListeners();
    };
    
    // =============================================
    // HTML TEMPLATE - Educational Escrow Demo
    // =============================================
    function getReversalHTML() {
        return `
            <div class="reversal-container">
                <!-- Header with Escrow Focus -->
                <div class="reversal-header">
                    <div style="display: flex; align-items: center; gap: 15px; flex-wrap: wrap;">
                        <h2 style="color: var(--mpesa-green); margin: 0;">↩️ Reversal API</h2>
                        <span class="escrow-badge">🔒 ESCROW & REFUNDS</span>
                        <span class="sandbox-badge">🧪 Sandbox Demo</span>
                    </div>
                </div>
                
                <!-- Educational Introduction -->
                <div class="edu-section">
                    <h3>🔍 What is Reversal API?</h3>
                    <p>The Reversal API allows a business to reverse a successful transaction. This is the foundation for <strong>escrow systems</strong> where money is held temporarily and only released when both parties are satisfied.</p>
                    
                    <div class="feature-grid">
                        <div class="feature-card">
                            <span class="feature-icon">🛡️</span>
                            <h4>Protected Payments</h4>
                            <p>Buyer pays, money held, released only after delivery confirmation</p>
                        </div>
                        <div class="feature-card">
                            <span class="feature-icon">🔄</span>
                            <h4>Instant Refunds</h4>
                            <p>If buyer rejects item, money returns to their phone immediately</p>
                        </div>
                        <div class="feature-card">
                            <span class="feature-icon">🏪</span>
                            <h4>Simple Shop</h4>
                            <p>You're the seller. Test the flow with our KES 1 demo</p>
                        </div>
                    </div>
                </div>
                
                <!-- Simple Shop Demo (C2B → Hold → Reversal) -->
                <div class="demo-section">
                    <div class="demo-header">
                        <h3>🏪 Simple Shop Demo</h3>
                        <span class="badge-green">BASIC FLOW</span>
                    </div>
                    <p class="demo-tagline"><em>"I'm selling my own item. Test paying, then confirm or reject to see reversal in action."</em></p>
                    
                    <!-- Product Card -->
                    <div class="product-card">
                        <div class="product-image">📱</div>
                        <div class="product-details">
                            <h4>iPhone 13 Pro</h4>
                            <div class="product-price">KES 120,000</div>
                            <small class="demo-note">Demo uses KES 1 (sandbox)</small>
                        </div>
                    </div>
                    
                    <!-- Payment Form -->
                    <div class="payment-form">
                        <div class="form-row">
                            <div class="form-group">
                                <label>📱 Your Phone Number</label>
                                <input type="text" id="reversal-phone" value="254114932232" placeholder="07XX XXX XXX">
                                <small>Auto-formatted on send</small>
                            </div>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label>💰 Amount (KES)</label>
                                <input type="number" id="reversal-amount" value="1" min="1" readonly>
                                <small>Fixed at KES 1 for demo</small>
                            </div>
                            <div class="form-group">
                                <label>🏷️ Reference</label>
                                <input type="text" id="reversal-ref" value="ESCROW-" + Date.now().toString().slice(-6) placeholder="ESCROW-123456">
                            </div>
                        </div>
                        
                        <button id="buyNowBtn" class="buy-btn">
                            <span>🚀</span> Buy Now (KES 1 Demo)
                        </button>
                    </div>
                    
                    <!-- Current Status -->
                    <div id="reversal-status" class="status-box">
                        👆 Click "Buy Now" to start the escrow flow
                    </div>
                </div>
                
                <!-- Active Transaction (Shown after payment) -->
                <div id="activeTransactionSection" style="display: none;" class="active-transaction">
                    <h4>🛒 Your Active Order</h4>
                    <div id="activeTransactionCard" class="transaction-active">
                        <!-- Dynamically filled -->
                    </div>
                </div>
                
                <!-- Transaction History -->
                <div class="history-section">
                    <div class="history-header">
                        <h4>📋 Transaction History</h4>
                        <span id="historyCount">0</span>
                    </div>
                    <div id="reversalHistory" class="history-list">
                        <div class="empty-history">
                            📭 No transactions yet. Try the demo above!
                        </div>
                    </div>
                    <div class="history-actions">
                        <button id="clearHistoryBtn" class="clear-btn">🗑️ Clear History</button>
                    </div>
                </div>
                
                <!-- How It Works Explanation -->
                <div class="explanation-section">
                    <h4>📖 How This Demo Works</h4>
                    <div class="steps">
                        <div class="step">
                            <span class="step-number">1</span>
                            <div class="step-content">
                                <strong>You pay KES 1 via STK Push</strong>
                                <small>System calls C2B API (already working)</small>
                            </div>
                        </div>
                        <div class="step">
                            <span class="step-number">2</span>
                            <div class="step-content">
                                <strong>Money marked as "FUNDS HELD"</strong>
                                <small>Not yet released to seller (simulated escrow)</small>
                            </div>
                        </div>
                        <div class="step">
                            <span class="step-number">3</span>
                            <div class="step-content">
                                <strong>You choose: Accept or Reject</strong>
                                <small>Accept = complete (no reversal) | Reject = call Reversal API</small>
                            </div>
                        </div>
                        <div class="step">
                            <span class="step-number">4</span>
                            <div class="step-content">
                                <strong>If Reject: Money reversed to your phone</strong>
                                <small>Reversal API returns funds (simulated in sandbox)</small>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Sandbox Notice -->
                <div class="sandbox-notice">
                    <strong>🧪 Sandbox Environment:</strong>
                    <p>All payments use KES 1. No real money moves. In sandbox, transactions auto-reverse after 48 hours - our demo lets you trigger reversal immediately.</p>
                </div>
            </div>
        `;
    }
    
    // =============================================
    // CSS STYLES
    // =============================================
    function injectReversalStyles() {
        if (document.getElementById('reversal-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'reversal-styles';
        style.textContent = `
            .reversal-container {
                padding: 15px;
            }
            
            .escrow-badge {
                background: var(--mpesa-green);
                color: white;
                padding: 5px 20px;
                border-radius: 30px;
                font-weight: bold;
                font-size: 0.9em;
            }
            
            .sandbox-badge {
                background: #ffd700;
                color: #333;
                padding: 5px 15px;
                border-radius: 30px;
                font-size: 0.9em;
                font-weight: bold;
            }
            
            .edu-section {
                background: linear-gradient(135deg, #f5f7fa 0%, #e9ecef 100%);
                padding: 25px;
                border-radius: 16px;
                margin: 20px 0;
                border-left: 6px solid var(--mpesa-green);
            }
            
            .edu-section h3 {
                color: var(--mpesa-green);
                margin-top: 0;
                display: flex;
                align-items: center;
                gap: 10px;
            }
            
            .feature-grid {
                display: flex;
                gap: 20px;
                margin-top: 25px;
                flex-wrap: wrap;
            }
            
            .feature-card {
                flex: 1;
                min-width: 200px;
                background: white;
                padding: 20px;
                border-radius: 12px;
                box-shadow: 0 4px 10px rgba(0,0,0,0.05);
            }
            
            .feature-icon {
                font-size: 32px;
            }
            
            .feature-card h4 {
                margin: 10px 0;
                color: #333;
            }
            
            .feature-card p {
                color: #666;
                font-size: 0.9em;
                line-height: 1.5;
            }
            
            .demo-section {
                background: white;
                border: 3px solid var(--mpesa-green);
                border-radius: 16px;
                padding: 25px;
                margin: 25px 0;
                box-shadow: 0 10px 25px var(--mpesa-glow);
            }
            
            .demo-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 10px;
                flex-wrap: wrap;
            }
            
            .demo-header h3 {
                color: var(--mpesa-green);
                margin: 0;
            }
            
            .badge-green {
                background: var(--mpesa-green);
                color: white;
                padding: 4px 15px;
                border-radius: 30px;
                font-size: 0.8em;
                font-weight: bold;
            }
            
            .demo-tagline {
                font-size: 1.1em;
                color: #555;
                margin-bottom: 25px;
                padding-bottom: 15px;
                border-bottom: 1px dashed #ddd;
            }
            
            .product-card {
                display: flex;
                align-items: center;
                gap: 20px;
                background: #f8f9fa;
                padding: 20px;
                border-radius: 12px;
                margin-bottom: 25px;
            }
            
            .product-image {
                font-size: 48px;
                background: white;
                width: 80px;
                height: 80px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 50%;
                box-shadow: 0 4px 10px rgba(0,0,0,0.1);
            }
            
            .product-details h4 {
                margin: 0 0 5px;
                font-size: 1.3em;
            }
            
            .product-price {
                color: var(--mpesa-green);
                font-size: 1.8em;
                font-weight: bold;
            }
            
            .demo-note {
                color: #666;
                font-style: italic;
            }
            
            .payment-form {
                background: #f5f5f5;
                padding: 20px;
                border-radius: 12px;
            }
            
            .form-row {
                display: flex;
                gap: 20px;
                margin-bottom: 15px;
                flex-wrap: wrap;
            }
            
            .form-group {
                flex: 1;
                min-width: 200px;
            }
            
            .form-group label {
                display: block;
                margin-bottom: 5px;
                font-weight: 600;
                color: #333;
            }
            
            .form-group input {
                width: 100%;
                padding: 12px;
                border: 2px solid #ddd;
                border-radius: 8px;
                font-size: 1em;
            }
            
            .form-group input:focus {
                border-color: var(--mpesa-green);
                outline: none;
            }
            
            .form-group input[readonly] {
                background: #eee;
                color: #666;
            }
            
            .form-group small {
                display: block;
                font-size: 0.8em;
                color: #666;
                margin-top: 4px;
            }
            
            .buy-btn {
                width: 100%;
                padding: 16px;
                background: var(--mpesa-green);
                color: white;
                border: none;
                border-radius: 50px;
                font-size: 1.3em;
                font-weight: bold;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 10px;
                transition: all 0.3s;
                margin-top: 10px;
            }
            
            .buy-btn:hover {
                background: var(--mpesa-dark);
                transform: translateY(-2px);
                box-shadow: 0 10px 20px var(--mpesa-glow);
            }
            
            .status-box {
                margin-top: 20px;
                padding: 15px;
                background: #f8f9fa;
                border-radius: 8px;
                font-family: monospace;
                border-left: 4px solid #999;
            }
            
            .active-transaction {
                margin: 25px 0;
                padding: 20px;
                background: #e8f5e8;
                border-radius: 12px;
                border: 2px solid var(--mpesa-green);
            }
            
            .transaction-active {
                background: white;
                padding: 20px;
                border-radius: 8px;
                margin-top: 10px;
            }
            
            .action-buttons {
                display: flex;
                gap: 15px;
                margin: 20px 0 10px;
            }
            
            .accept-btn {
                flex: 1;
                padding: 15px;
                background: var(--mpesa-green);
                color: white;
                border: none;
                border-radius: 8px;
                font-weight: bold;
                cursor: pointer;
                font-size: 1.1em;
            }
            
            .reject-btn {
                flex: 1;
                padding: 15px;
                background: #ff4444;
                color: white;
                border: none;
                border-radius: 8px;
                font-weight: bold;
                cursor: pointer;
                font-size: 1.1em;
            }
            
            .history-section {
                margin: 30px 0;
                background: white;
                border-radius: 12px;
                padding: 20px;
                border: 2px solid #ddd;
            }
            
            .history-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 15px;
                padding-bottom: 10px;
                border-bottom: 2px solid #eee;
            }
            
            .history-header h4 {
                margin: 0;
                color: #333;
            }
            
            .history-header span {
                background: var(--mpesa-green);
                color: white;
                padding: 3px 12px;
                border-radius: 20px;
                font-weight: bold;
            }
            
            .history-list {
                max-height: 300px;
                overflow-y: auto;
            }
            
            .history-item {
                background: #f8f9fa;
                border-left: 4px solid #999;
                padding: 15px;
                margin-bottom: 10px;
                border-radius: 8px;
                cursor: pointer;
            }
            
            .history-item.completed {
                border-left-color: var(--mpesa-green);
            }
            
            .history-item.refunded {
                border-left-color: #ff4444;
            }
            
            .history-item.pending {
                border-left-color: #ffc107;
            }
            
            .empty-history {
                text-align: center;
                padding: 40px;
                color: #999;
                font-style: italic;
                background: #fafafa;
                border-radius: 8px;
            }
            
            .history-actions {
                margin-top: 15px;
                text-align: right;
            }
            
            .clear-btn {
                background: none;
                border: 1px solid #ff4444;
                color: #ff4444;
                padding: 8px 20px;
                border-radius: 30px;
                cursor: pointer;
                transition: all 0.3s;
            }
            
            .clear-btn:hover {
                background: #ff4444;
                color: white;
            }
            
            .explanation-section {
                margin: 30px 0;
                padding: 20px;
                background: #f5f5f5;
                border-radius: 12px;
            }
            
            .steps {
                display: flex;
                flex-direction: column;
                gap: 15px;
                margin-top: 15px;
            }
            
            .step {
                display: flex;
                gap: 15px;
                align-items: flex-start;
            }
            
            .step-number {
                width: 30px;
                height: 30px;
                background: var(--mpesa-green);
                color: white;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
                flex-shrink: 0;
            }
            
            .step-content {
                flex: 1;
            }
            
            .step-content strong {
                display: block;
                margin-bottom: 3px;
            }
            
            .step-content small {
                color: #666;
            }
            
            .sandbox-notice {
                background: #fff3cd;
                border-left: 6px solid #ffc107;
                padding: 15px;
                border-radius: 8px;
                margin: 20px 0;
            }
            
            @media (max-width: 768px) {
                .feature-grid {
                    flex-direction: column;
                }
                
                .product-card {
                    flex-direction: column;
                    text-align: center;
                }
                
                .action-buttons {
                    flex-direction: column;
                }
            }
        `;
        
        document.head.appendChild(style);
    }
    
    // =============================================
    // PHONE FORMATTER (reuse pattern from c2b.js)
    // =============================================
    function formatPhoneNumber(input) {
        let cleaned = input.replace(/\D/g, '');
        
        if (cleaned.length === 9) {
            return '254' + cleaned;
        }
        else if (cleaned.length === 10 && cleaned.startsWith('07')) {
            return '254' + cleaned.substring(1);
        }
        else if (cleaned.length === 10 && cleaned.startsWith('01')) {
            return '254' + cleaned.substring(1);
        }
        else if (cleaned.length === 12 && cleaned.startsWith('254')) {
            return cleaned;
        }
        else {
            return input;
        }
    }
    
    // =============================================
    // TRANSACTION MANAGEMENT
    // =============================================
    function loadTransactions() {
        const saved = localStorage.getItem('reversal_transactions');
        if (saved) {
            transactions = JSON.parse(saved);
        }
    }
    
    function saveTransactions() {
        localStorage.setItem('reversal_transactions', JSON.stringify(transactions));
    }
    
    function addTransaction(transaction) {
        transactions.unshift(transaction);
        if (transactions.length > 20) {
            transactions = transactions.slice(0, 20);
        }
        saveTransactions();
        renderTransactionHistory();
    }
    
    function updateTransactionStatus(id, status, callbackData) {
        const transaction = transactions.find(t => t.id === id);
        if (transaction) {
            transaction.status = status;
            transaction.callbackData = callbackData;
            transaction.updatedAt = new Date().toISOString();
            saveTransactions();
            renderTransactionHistory();
        }
    }
    
    function renderTransactionHistory() {
        const historyDiv = document.getElementById('reversalHistory');
        const countSpan = document.getElementById('historyCount');
        
        if (!historyDiv) return;
        
        if (transactions.length === 0) {
            historyDiv.innerHTML = '<div class="empty-history">📭 No transactions yet. Try the demo above!</div>';
            if (countSpan) countSpan.textContent = '0';
            return;
        }
        
        if (countSpan) countSpan.textContent = transactions.length;
        
        let html = '';
        transactions.forEach(t => {
            const statusClass = t.status === 'completed' ? 'completed' : (t.status === 'refunded' ? 'refunded' : 'pending');
            const time = new Date(t.timestamp).toLocaleString();
            
            html += `
                <div class="history-item ${statusClass}" onclick="toggleHistoryDetails('${t.id}')">
                    <div style="display: flex; justify-content: space-between;">
                        <span><strong>${t.reference}</strong></span>
                        <span>KES ${t.amount}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-top: 5px;">
                        <span>${t.phone}</span>
                        <span style="text-transform: uppercase;">${t.status}</span>
                    </div>
                    <div style="font-size: 0.8em; color: #666; margin-top: 5px;">${time}</div>
                    <div id="details-${t.id}" style="display: none; margin-top: 10px; background: #f0f0f0; padding: 10px; border-radius: 4px;">
                        <pre style="margin: 0; font-size: 0.8em;">${JSON.stringify(t, null, 2)}</pre>
                    </div>
                </div>
            `;
        });
        
        historyDiv.innerHTML = html;
    }
    
    window.toggleHistoryDetails = function(id) {
        const details = document.getElementById(`details-${id}`);
        if (details) {
            details.style.display = details.style.display === 'none' ? 'block' : 'none';
        }
    };
    
    // =============================================
    // EVENT LISTENERS
    // =============================================
    function setupEventListeners() {
        const buyBtn = document.getElementById('buyNowBtn');
        if (buyBtn) {
            buyBtn.addEventListener('click', initiatePurchase);
        }
        
        const clearBtn = document.getElementById('clearHistoryBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if (confirm('Clear all transaction history?')) {
                    transactions = [];
                    saveTransactions();
                    renderTransactionHistory();
                }
            });
        }
    }
    
    // =============================================
    // INITIATE PURCHASE (C2B Call)
    // =============================================
    async function initiatePurchase() {
        const statusDiv = document.getElementById('reversal-status');
        let phone = document.getElementById('reversal-phone').value.trim();
        const amount = document.getElementById('reversal-amount').value;
        let reference = document.getElementById('reversal-ref').value.trim();
        
        // Format phone
        const formattedPhone = formatPhoneNumber(phone);
        
        if (!formattedPhone || formattedPhone.length < 12) {
            statusDiv.innerHTML = `<span style="color: #ff4444;">❌ Invalid phone number</span>`;
            return;
        }
        
        // Auto-generate reference if empty
        if (!reference) {
            reference = 'ESCROW-' + Date.now().toString().slice(-6);
        }
        
        // Show loading
        statusDiv.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <span class="loading-spinner"></span>
                <span>Sending STK Push to ${formattedPhone}...</span>
            </div>
        `;
        
        try {
            // Call C2B API (reuse your existing endpoint)
            const response = await fetch('/api/c2b/stkpush', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phone: formattedPhone,
                    amount: amount,
                    reference: reference,
                    description: 'Escrow Demo Purchase'
                })
            });
            
            const data = await response.json();
            
            if (data.ResponseCode === '0') {
                // Create transaction in HELD state
                const transaction = {
                    id: data.CheckoutRequestID || Date.now().toString(),
                    timestamp: new Date().toISOString(),
                    phone: formattedPhone,
                    amount: amount,
                    reference: reference,
                    status: 'pending', // FUNDS HELD
                    CheckoutRequestID: data.CheckoutRequestID,
                    rawResponse: data
                };
                
                addTransaction(transaction);
                showActiveTransaction(transaction);
                
                statusDiv.innerHTML = `
                    <div style="color: #4CAF50;">✅ Payment received! Funds held in escrow.</div>
                    <small>Check transaction below to Accept (complete) or Reject (refund)</small>
                `;
            } else {
                statusDiv.innerHTML = `
                    <div style="color: #ff4444;">❌ Payment failed</div>
                    <pre>${JSON.stringify(data, null, 2)}</pre>
                `;
            }
            
        } catch (error) {
            statusDiv.innerHTML = `
                <div style="color: #ff4444;">❌ Connection error</div>
                <pre>${error.message}</pre>
            `;
        }
    }
    
    // =============================================
    // SHOW ACTIVE TRANSACTION WITH ACCEPT/REJECT
    // =============================================
    function showActiveTransaction(transaction) {
        const section = document.getElementById('activeTransactionSection');
        const card = document.getElementById('activeTransactionCard');
        
        if (!section || !card) return;
        
        card.innerHTML = `
            <div style="padding: 10px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 15px;">
                    <span><strong>Product:</strong> iPhone 13 Pro (Demo)</span>
                    <span><strong>Amount:</strong> KES ${transaction.amount}</span>
                </div>
                <div style="background: #fff3cd; padding: 10px; border-radius: 6px; margin-bottom: 15px;">
                    <strong>🔄 FUNDS HELD IN ESCROW</strong>
                    <p style="margin: 5px 0 0; font-size: 0.9em;">Money received. Confirm delivery to release or reject to refund.</p>
                </div>
                <div class="action-buttons">
                    <button class="accept-btn" onclick="window.acceptDelivery('${transaction.id}')">✅ Accept Delivery</button>
                    <button class="reject-btn" onclick="window.rejectDelivery('${transaction.id}')">❌ Reject Item</button>
                </div>
                <p style="text-align: center; margin-top: 15px; font-size: 0.9em; color: #666;">
                    ${transaction.CheckoutRequestID}
                </p>
            </div>
        `;
        
        section.style.display = 'block';
    }
    
    // =============================================
    // ACCEPT DELIVERY (No reversal)
    // =============================================
    window.acceptDelivery = function(transactionId) {
        console.log('✅ Accepting delivery:', transactionId);
        
        updateTransactionStatus(transactionId, 'completed');
        
        // Hide active transaction
        document.getElementById('activeTransactionSection').style.display = 'none';
        
        // Show message
        const statusDiv = document.getElementById('reversal-status');
        statusDiv.innerHTML = `
            <div style="color: #4CAF50;">✅ Delivery confirmed! Transaction completed.</div>
            <small>No reversal needed. Funds released to seller.</small>
        `;
    };
    
    // =============================================
    // REJECT DELIVERY (Trigger Reversal)
    // =============================================
    window.rejectDelivery = function(transactionId) {
        console.log('↩️ Rejecting delivery - would call Reversal API:', transactionId);
        
        const statusDiv = document.getElementById('reversal-status');
        
        // Show loading
        statusDiv.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <span class="loading-spinner"></span>
                <span>Calling Reversal API...</span>
            </div>
        `;
        
        // Simulate API call (replace with real /api/reversal when built)
        setTimeout(() => {
            updateTransactionStatus(transactionId, 'refunded');
            
            // Hide active transaction
            document.getElementById('activeTransactionSection').style.display = 'none';
            
            statusDiv.innerHTML = `
                <div style="color: #4CAF50;">✅ Reversal initiated! Money returned to buyer.</div>
                <small>In production, Reversal API would be called here.</small>
                <pre style="margin-top: 10px;">{
  "ResultCode": 0,
  "ResultDesc": "Reversal successful",
  "TransactionID": "RVL${Date.now()}"
}</pre>
            `;
        }, 1500);
    };
    
})();