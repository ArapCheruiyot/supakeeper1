// c2b.js - Enhanced with split view and transaction history
(function() {
    // =============================================
    // 1. INJECT CSS STYLES
    // =============================================
    function injectStyles() {
        if (document.getElementById('c2b-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'c2b-styles';
        style.textContent = `
            /* C2B Tab Specific Styles */
            .c2b-container {
                padding: 10px;
            }
            
            .c2b-header {
                display: flex;
                align-items: center;
                gap: 10px;
                margin-bottom: 25px;
            }
            
            .c2b-header h2 {
                color: var(--mpesa-green);
                font-size: 2em;
                margin: 0;
            }
            
            .c2b-header .badge {
                background: var(--mpesa-green);
                color: white;
                padding: 5px 15px;
                border-radius: 20px;
                font-size: 0.9em;
                font-weight: 600;
            }
            
            /* Split View Layout */
            .split-view {
                display: flex;
                gap: 25px;
                margin-top: 20px;
            }
            
            .payment-section {
                flex: 1;
                min-width: 0;
            }
            
            .history-section {
                flex: 1;
                min-width: 0;
                background: white;
                border-radius: 16px;
                padding: 20px;
                border: 2px solid var(--mpesa-green);
                box-shadow: 0 5px 15px var(--mpesa-glow);
            }
            
            .history-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
                padding-bottom: 10px;
                border-bottom: 2px solid #e0e0e0;
            }
            
            .history-header h3 {
                color: var(--mpesa-green);
                margin: 0;
                font-size: 1.3em;
            }
            
            .history-header span {
                background: var(--mpesa-green);
                color: white;
                padding: 5px 12px;
                border-radius: 20px;
                font-size: 0.9em;
                font-weight: 600;
            }
            
            .transaction-list {
                max-height: 500px;
                overflow-y: auto;
                padding-right: 10px;
            }
            
            .transaction-item {
                background: #f8f9fa;
                border-radius: 12px;
                padding: 15px;
                margin-bottom: 15px;
                border-left: 4px solid var(--mpesa-green);
                transition: transform 0.2s, box-shadow 0.2s;
                cursor: pointer;
            }
            
            .transaction-item:hover {
                transform: translateX(-2px);
                box-shadow: 0 5px 15px rgba(0,169,79,0.1);
            }
            
            .transaction-item.pending {
                border-left-color: #ffc107;
                opacity: 0.8;
            }
            
            .transaction-item.success {
                border-left-color: var(--mpesa-green);
            }
            
            .transaction-item.failed {
                border-left-color: #ff4444;
            }
            
            .transaction-header {
                display: flex;
                justify-content: space-between;
                margin-bottom: 8px;
                font-size: 0.9em;
            }
            
            .transaction-time {
                color: #666;
                font-size: 0.85em;
            }
            
            .transaction-status {
                padding: 3px 10px;
                border-radius: 20px;
                font-size: 0.8em;
                font-weight: 600;
            }
            
            .status-pending {
                background: #fff3cd;
                color: #856404;
            }
            
            .status-success {
                background: #d4edda;
                color: #155724;
            }
            
            .status-failed {
                background: #f8d7da;
                color: #721c24;
            }
            
            .transaction-details {
                font-size: 0.95em;
            }
            
            .transaction-details .amount {
                font-size: 1.2em;
                font-weight: 700;
                color: #333;
            }
            
            .transaction-details .phone {
                color: #666;
                margin: 5px 0;
            }
            
            .transaction-details .ref {
                font-family: monospace;
                background: #eee;
                padding: 2px 5px;
                border-radius: 4px;
                font-size: 0.9em;
            }
            
            .transaction-expanded {
                margin-top: 10px;
                padding-top: 10px;
                border-top: 1px dashed #ccc;
                font-size: 0.9em;
            }
            
            .transaction-expanded pre {
                background: #2d2d2d;
                color: #f8f8f2;
                padding: 10px;
                border-radius: 8px;
                overflow-x: auto;
                font-size: 0.8em;
                margin: 10px 0 0;
            }
            
            .empty-history {
                text-align: center;
                padding: 40px 20px;
                color: #999;
                font-style: italic;
                border: 2px dashed #ddd;
                border-radius: 8px;
            }
            
            .clear-history-btn {
                background: none;
                border: 1px solid #ff4444;
                color: #ff4444;
                padding: 5px 15px;
                border-radius: 20px;
                cursor: pointer;
                font-size: 0.85em;
                transition: all 0.3s;
            }
            
            .clear-history-btn:hover {
                background: #ff4444;
                color: white;
            }
            
            .demo-box {
                background: linear-gradient(135deg, #f5f7fa 0%, #e9ecef 100%);
                border: 2px solid var(--mpesa-green);
                border-radius: 16px;
                padding: 25px;
                margin: 0;
            }
            
            .input-group {
                margin-bottom: 20px;
            }
            
            .input-group label {
                display: block;
                margin-bottom: 8px;
                font-weight: 600;
                color: #333;
                font-size: 0.95em;
            }
            
            .input-group input {
                width: 100%;
                padding: 14px;
                border: 2px solid #ddd;
                border-radius: 8px;
                font-size: 1em;
                transition: all 0.3s;
                background: white;
            }
            
            .input-group input:focus {
                border-color: var(--mpesa-green);
                box-shadow: 0 0 0 3px var(--mpesa-glow);
                outline: none;
            }
            
            .input-group input[readonly] {
                background: #f5f5f5;
                color: #666;
                border-color: #ccc;
                cursor: not-allowed;
            }
            
            .field-note {
                display: block;
                font-size: 0.85em;
                color: #666;
                margin-top: 5px;
                font-style: italic;
            }
            
            .demo-btn {
                background: var(--mpesa-green);
                color: white;
                border: none;
                padding: 16px 30px;
                font-size: 1.2em;
                font-weight: 600;
                border-radius: 50px;
                cursor: pointer;
                width: 100%;
                margin: 20px 0;
                transition: all 0.3s;
                box-shadow: 0 5px 15px var(--mpesa-glow);
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 10px;
            }
            
            .demo-btn:hover {
                background: var(--mpesa-dark);
                transform: translateY(-2px);
                box-shadow: 0 8px 20px var(--mpesa-glow);
            }
            
            .demo-btn:active {
                transform: translateY(0);
            }
            
            .warning-box {
                background: #fff3cd;
                border-left: 4px solid #ffc107;
                padding: 15px;
                border-radius: 8px;
                margin: 20px 0;
                font-size: 0.95em;
            }
            
            .warning-box strong {
                color: #856404;
                display: block;
                margin-bottom: 8px;
            }
            
            .warning-box ul {
                margin: 10px 0 0 20px;
                color: #856404;
            }
            
            .small-note {
                font-size: 0.85em;
                color: #666;
                margin-top: 10px;
                font-style: italic;
            }
            
            .loading-spinner {
                display: inline-block;
                width: 20px;
                height: 20px;
                border: 3px solid rgba(0,169,79,0.3);
                border-radius: 50%;
                border-top-color: var(--mpesa-green);
                animation: spin 1s ease-in-out infinite;
                margin-right: 10px;
            }
            
            @keyframes spin {
                to { transform: rotate(360deg); }
            }
            
            .flex-row {
                display: flex;
                gap: 15px;
                flex-wrap: wrap;
            }
            
            .flex-row .input-group {
                flex: 1;
            }
            
            .test-link {
                color: var(--mpesa-green);
                text-decoration: none;
                font-weight: 600;
                cursor: pointer;
                border-bottom: 1px dashed var(--mpesa-green);
            }
            
            .test-link:hover {
                border-bottom: 1px solid var(--mpesa-green);
            }
            
            /* Responsive */
            @media (max-width: 768px) {
                .split-view {
                    flex-direction: column;
                }
            }
        `;
        
        document.head.appendChild(style);
    }

    // =============================================
    // 2. PHONE NUMBER FORMATTER
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
        else if (cleaned.length === 13 && cleaned.startsWith('254')) {
            return cleaned;
        }
        else {
            return input;
        }
    }

    // =============================================
    // 3. TRANSACTION HISTORY MANAGEMENT
    // =============================================
    let transactions = [];

    function loadTransactions() {
        const saved = localStorage.getItem('mpesa_transactions');
        if (saved) {
            transactions = JSON.parse(saved);
        }
    }

    function saveTransactions() {
        localStorage.setItem('mpesa_transactions', JSON.stringify(transactions));
    }

    function addTransaction(transaction) {
        transactions.unshift(transaction); // Add to beginning
        if (transactions.length > 20) { // Keep only last 20
            transactions = transactions.slice(0, 20);
        }
        saveTransactions();
        renderTransactionHistory();
    }

    function updateTransactionStatus(checkoutRequestID, callbackData) {
        const transaction = transactions.find(t => t.CheckoutRequestID === checkoutRequestID);
        if (transaction) {
            transaction.status = 'completed';
            transaction.callbackData = callbackData;
            transaction.completedAt = new Date().toISOString();
            saveTransactions();
            renderTransactionHistory();
        }
    }

    function getStatusClass(status) {
        switch(status) {
            case 'pending': return 'status-pending';
            case 'success': return 'status-success';
            case 'failed': return 'status-failed';
            default: return '';
        }
    }

    function renderTransactionHistory() {
        const container = document.getElementById('transaction-history');
        if (!container) return;

        if (transactions.length === 0) {
            container.innerHTML = `
                <div class="empty-history">
                    📭 No transactions yet<br>
                    <small>Click "Send STK Push" to make your first payment</small>
                </div>
            `;
            return;
        }

        let html = '';
        transactions.forEach((t, index) => {
            const statusClass = getStatusClass(t.status);
            const time = new Date(t.timestamp).toLocaleTimeString();
            const date = new Date(t.timestamp).toLocaleDateString();
            
            html += `
                <div class="transaction-item ${t.status}" onclick="toggleTransactionDetails(${index})">
                    <div class="transaction-header">
                        <span class="transaction-time">${date} ${time}</span>
                        <span class="transaction-status ${statusClass}">${t.status.toUpperCase()}</span>
                    </div>
                    <div class="transaction-details">
                        <div class="amount">KES ${t.amount}</div>
                        <div class="phone">${t.phone}</div>
                        <div class="ref">Ref: ${t.reference}</div>
                    </div>
                    <div id="details-${index}" class="transaction-expanded" style="display: none;">
                        <strong>CheckoutRequestID:</strong><br>
                        <small>${t.CheckoutRequestID}</small>
                        ${t.callbackData ? `
                            <hr>
                            <strong>Callback Data:</strong>
                            <pre>${JSON.stringify(t.callbackData, null, 2)}</pre>
                        ` : `
                            <hr>
                            <em>Awaiting callback from M-Pesa...</em>
                        `}
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    }

    // Make toggle function global
    window.toggleTransactionDetails = function(index) {
        const details = document.getElementById(`details-${index}`);
        if (details) {
            details.style.display = details.style.display === 'none' ? 'block' : 'none';
        }
    };

    // =============================================
    // 4. GENERATE THE HTML CONTENT (SPLIT VIEW)
    // =============================================
    function getC2BHTML() {
        return `
            <div class="c2b-container">
                <!-- Header -->
                <div class="c2b-header">
                    <h2>📱 C2B (STK Push)</h2>
                    <span class="badge">Customer to Business</span>
                </div>
                
                <!-- What Is It Section -->
                <div class="c2b-section">
                    <h3><i>🔍</i> What is it?</h3>
                    <p style="line-height: 1.8; margin-bottom: 0;"><strong>STK Push</strong> allows a business to send a payment prompt directly to a customer's phone. The customer only enters their PIN — no typing till numbers or amounts.</p>
                </div>
                
                <!-- Split View: Payment Form (Left) + Transaction History (Right) -->
                <div class="split-view">
                    <!-- LEFT: Payment Form -->
                    <div class="payment-section">
                        <div class="demo-box">
                            <h3 style="margin-top: 0; color: var(--mpesa-green);"><i>🎮</i> Make a Payment</h3>
                            <p style="margin-bottom: 20px;">Enter details and send STK push to customer</p>
                            
                            <!-- PayBill Display (Grayed Out) -->
                            <div class="input-group">
                                <label>🏦 Sandbox PayBill (Fixed)</label>
                                <input type="text" value="174379" readonly class="readonly-field">
                                <small class="field-note">Official Safaricom sandbox PayBill</small>
                            </div>
                            
                            <div class="flex-row">
                                <div class="input-group">
                                    <label>📱 Phone Number</label>
                                    <input type="text" id="c2b-phone" value="254114932232" placeholder="07XX XXX XXX">
                                    <small class="field-note">Auto-formatted on send</small>
                                </div>
                                
                                <div class="input-group">
                                    <label>💰 Amount (KES)</label>
                                    <input type="number" id="c2b-amount" value="1" min="1" max="10" step="1">
                                    <small class="field-note">KES 1 default (sandbox)</small>
                                </div>
                            </div>
                            
                            <div class="input-group">
                                <label>🏷️ Account Reference</label>
                                <input type="text" id="c2b-ref" value="INV" + Date.now() placeholder="Invoice #">
                                <small class="field-note">Shows on customer's statement</small>
                            </div>
                            
                            <div class="input-group">
                                <label>📝 Transaction Description</label>
                                <input type="text" id="c2b-desc" value="Payment for goods" placeholder="Description">
                                <small class="field-note">Appears on M-Pesa statement</small>
                            </div>
                            
                            <button class="demo-btn" id="c2b-send-btn">
                                <span>🚀</span> Send STK Push
                            </button>
                            
                            <!-- Current Payment Status -->
                            <div class="result-box" id="c2b-result">
                                👆 Click to initiate payment
                            </div>
                        </div>
                    </div>
                    
                    <!-- RIGHT: Transaction History -->
                    <div class="history-section">
                        <div class="history-header">
                            <h3>📋 Recent Transactions</h3>
                            <span>${transactions.length}</span>
                        </div>
                        <div id="transaction-history" class="transaction-list">
                            <!-- Transactions will be rendered here -->
                        </div>
                        <div style="margin-top: 15px; text-align: right;">
                            <button class="clear-history-btn" onclick="clearAllTransactions()">
                                🗑️ Clear History
                            </button>
                        </div>
                    </div>
                </div>
                
                <!-- Disclaimer -->
                <div class="warning-box">
                    <strong>⚠️ Sandbox Information</strong>
                    <ul>
                        <li>Default amount is <strong>KES 1</strong> (sandbox only)</li>
                        <li><strong>No real money is moved</strong> – test environment</li>
                        <li>Transactions auto-reverse within <strong>48 hours</strong></li>
                        <li>Need to test connection? <a class="test-link" onclick="window.testConnection()">Click here</a></li>
                    </ul>
                </div>
            </div>
        `;
    }

    // =============================================
    // 5. SETUP EVENT LISTENERS
    // =============================================
    function setupEventListeners() {
        const sendBtn = document.getElementById('c2b-send-btn');
        if (sendBtn) {
            sendBtn.replaceWith(sendBtn.cloneNode(true));
            document.getElementById('c2b-send-btn').addEventListener('click', initiateStkPush);
        }
    }

    // =============================================
    // 6. STK PUSH INITIATION FUNCTION
    // =============================================
    async function initiateStkPush() {
        const resultDiv = document.getElementById('c2b-result');
        let phone = document.getElementById('c2b-phone').value.trim();
        const amount = document.getElementById('c2b-amount').value;
        let reference = document.getElementById('c2b-ref').value.trim();
        const description = document.getElementById('c2b-desc').value.trim() || 'Sandbox Payment';
        
        // Auto-generate reference if empty
        if (!reference) {
            reference = 'INV' + Date.now().toString().slice(-6);
        }
        
        // Auto-format phone
        const originalPhone = phone;
        phone = formatPhoneNumber(phone);
        
        if (!phone || phone.length < 12) {
            resultDiv.innerHTML = `
                <span style="color: #ff4444;">❌ Invalid phone number: ${originalPhone}</span>
            `;
            return;
        }
        
        // Show loading
        resultDiv.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <span class="loading-spinner"></span>
                <span>Sending payment request to ${phone}...</span>
            </div>
        `;
        
        try {
            const response = await fetch('/api/c2b/stkpush', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, amount, reference, description })
            });
            
            const data = await response.json();
            
            if (data.ResponseCode === '0') {
                // Add to transaction history
                addTransaction({
                    id: Date.now(),
                    timestamp: new Date().toISOString(),
                    phone: phone,
                    amount: amount,
                    reference: reference,
                    description: description,
                    CheckoutRequestID: data.CheckoutRequestID,
                    MerchantRequestID: data.MerchantRequestID,
                    status: 'pending',
                    rawResponse: data
                });
                
                resultDiv.innerHTML = `
                    <div style="color: #4CAF50;">✅ Payment request sent!</div>
                    <small>Check customer's phone for STK prompt</small>
                    <hr>
                    <pre>${JSON.stringify(data, null, 2)}</pre>
                `;
            } else {
                resultDiv.innerHTML = `
                    <div style="color: #ff4444;">❌ Failed: ${data.ResponseDescription || 'Unknown error'}</div>
                    <pre>${JSON.stringify(data, null, 2)}</pre>
                `;
            }
            
        } catch (error) {
            resultDiv.innerHTML = `
                <div style="color: #ff4444;">❌ Connection error</div>
                <pre>${error.message}</pre>
            `;
        }
    }

    // Clear history function
    window.clearAllTransactions = function() {
        if (confirm('Clear all transaction history?')) {
            transactions = [];
            saveTransactions();
            renderTransactionHistory();
        }
    };

    // =============================================
    // 7. POLL FOR CALLBACK UPDATES (Optional)
    // =============================================
    function startPollingForCallbacks() {
        // In a real app, you'd have an endpoint to check transaction status
        // For now, we'll simulate updates after 30 seconds
        setInterval(() => {
            // This is where you'd check for callback updates
            console.log('Checking for callback updates...');
        }, 30000);
    }

    // =============================================
    // 8. MAIN EXPORT FUNCTIONS
    // =============================================
    
    // Function that matches what script.js expects
    window.initC2B = function(containerId) {
        console.log("📱 initC2B called with container:", containerId);
        
        const container = document.getElementById(containerId);
        if (!container) {
            console.error("Container not found:", containerId);
            return;
        }
        
        // Load saved transactions
        loadTransactions();
        
        // Inject styles and HTML
        injectStyles();
        container.innerHTML = getC2BHTML();
        
        // Render transaction history and setup listeners
        setTimeout(() => {
            renderTransactionHistory();
            setupEventListeners();
        }, 100);
        
        // Start polling (optional)
        startPollingForCallbacks();
    };

    // Keep the old name for backward compatibility
    window.renderC2BTab = function() {
        console.log("📱 renderC2BTab called (deprecated)");
        window.initC2B('tabContent');
    };

    // Test connection function
    window.testConnection = window.testConnection || function() {
        const statusDiv = document.getElementById('api-status');
        if (statusDiv) {
            statusDiv.innerHTML = `<span class="loading-spinner"></span> Testing...`;
            fetch('/api/test')
                .then(res => res.json())
                .then(data => {
                    statusDiv.innerHTML = `<span style="color: var(--mpesa-green);">✅ Connected</span>`;
                })
                .catch(() => {
                    statusDiv.innerHTML = `<span style="color: #ff4444;">❌ Cannot connect</span>`;
                });
        }
    };

    console.log('✅ c2b.js loaded with transaction history');
})();