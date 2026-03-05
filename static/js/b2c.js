// static/js/b2c.js - Self-contained B2C educational module
// UPDATED: Bulk payments, smart phone formatting, clear sandbox warnings
(function() {
    'use strict';
    
    // =============================================
    // STATE MANAGEMENT
    // =============================================
    let scheduledPayments = [];
    let paymentSettings = {
        autoPayTime: "17:00",
        autoPayEnabled: true
    };
    
    // =============================================
    // INITIALIZATION
    // =============================================
    window.initB2C = function(containerId) {
        console.log("🚜 Initializing B2C Farm Payments...");
        const container = document.getElementById(containerId);
        if (!container) return;
        
        container.innerHTML = getB2CHTML();
        injectB2CStyles();
        setupEventListeners();
        loadFromStorage();
        startPaymentChecker();
        updatePaymentsList();
    };
    
    // =============================================
    // HTML TEMPLATE - With GIANT sandbox warning
    // =============================================
    function getB2CHTML() {
        return `
            <div class="b2c-container">
                <!-- 🔬🔬🔬 GIANT SANDBOX WARNING - SUPER CLEAR 🔬🔬🔬 -->
                <div style="background: linear-gradient(135deg, #ff6b6b, #ff0000); color: white; padding: 20px; border-radius: 12px; margin-bottom: 25px; text-align: center; font-weight: bold; border: 4px solid #fff; box-shadow: 0 0 20px rgba(255,0,0,0.5);">
                    <div style="font-size: 32px; margin-bottom: 10px;">🧪🧪🧪</div>
                    <div style="font-size: 28px; margin-bottom: 10px;">⚠️ SANDBOX MODE - NO REAL MONEY ⚠️</div>
                    <div style="font-size: 18px; margin-bottom: 5px;">🔬 This is a LEARNING TOOL using Safaricom test environment</div>
                    <div style="font-size: 16px; background: rgba(255,255,255,0.2); padding: 10px; border-radius: 8px; margin-top: 10px;">
                        <strong>🔬 NO ACTUAL TRANSACTIONS OCCUR - ALL PAYMENTS ARE SIMULATED 🔬</strong>
                    </div>
                </div>

                <!-- Educational Header -->
                <div class="api-explanation" style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #4CAF50;">
                    <h3 style="margin-top: 0; color: #2E7D32; display: flex; align-items: center; gap: 10px;">
                        <span>💰</span> What is B2C API?
                        <span style="background: #ffd700; padding: 3px 10px; border-radius: 20px; font-size: 12px; margin-left: auto;">Sandbox Demo</span>
                    </h3>
                    <p><strong>Business to Customer</strong> - When a business <em>sends</em> money to a customer.</p>
                    
                    <div style="display: flex; gap: 20px; margin-top: 15px; flex-wrap: wrap;">
                        <div style="flex: 1; min-width: 200px; background: white; padding: 12px; border-radius: 6px;">
                            <span style="font-size: 24px;">🌾</span>
                            <h4 style="margin: 5px 0;">Farm Example</h4>
                            <p style="font-size: 14px;">Pay daily labourers based on supervisor's comments</p>
                        </div>
                        <div style="flex: 1; min-width: 200px; background: white; padding: 12px; border-radius: 6px;">
                            <span style="font-size: 24px;">💼</span>
                            <h4 style="margin: 5px 0;">Salaries</h4>
                            <p style="font-size: 14px;">Company pays employees at month end</p>
                        </div>
                        <div style="flex: 1; min-width: 200px; background: white; padding: 12px; border-radius: 6px;">
                            <span style="font-size: 24px;">🔄</span>
                            <h4 style="margin: 5px 0;">Refunds</h4>
                            <p style="font-size: 14px;">Business returns money to customer</p>
                        </div>
                    </div>
                </div>

                <!-- Small sandbox badge -->
                <div style="display: flex; justify-content: flex-end; margin-bottom: 10px;">
                    <span style="background: #ffd700; padding: 5px 15px; border-radius: 20px; font-size: 12px; font-weight: bold; border: 1px solid #daa520;">
                        🧪 Sandbox Testing Environment
                    </span>
                </div>

                <!-- BUTTONS: Pay Someone / Pay Your Team -->
                <div style="display: flex; gap: 15px; margin-bottom: 25px;">
                    <button id="paySomeoneBtn" class="b2c-action-btn" style="flex: 1; padding: 15px; background: #4CAF50; color: white; border: none; border-radius: 8px; font-size: 18px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                        💰 Pay Someone
                    </button>
                    <button id="payTeamBtn" class="b2c-action-btn" style="flex: 1; padding: 15px; background: #2196F3; color: white; border: none; border-radius: 8px; font-size: 18px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                        👥 Pay Your Team (Bulk)
                    </button>
                </div>

                <!-- PAYMENT FORM - Dynamic content based on selection -->
                <div id="paymentFormContainer" style="display: none; background: #f9f9f9; padding: 20px; border-radius: 8px; margin-bottom: 25px; border: 2px solid #4CAF50; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">
                    <h3 id="formTitle" style="margin-top: 0; color: #2E7D32; display: flex; align-items: center; gap: 10px;">
                        <span>💰</span> Pay Someone
                        <span style="background: #ffd700; padding: 2px 8px; border-radius: 12px; font-size: 11px; margin-left: auto;">Sandbox Only</span>
                    </h3>
                    
                    <div id="paymentFormContent">
                        <!-- Content dynamically injected by showPaymentForm -->
                    </div>
                    
                    <div style="margin-top: 20px; text-align: right; border-top: 1px solid #ddd; padding-top: 20px;">
                        <button id="cancelFormBtn" style="padding: 12px 25px; background: #999; color: white; border: none; border-radius: 6px; margin-right: 10px; cursor: pointer; font-weight: bold;">Cancel</button>
                        <button id="schedulePaymentBtn" style="padding: 12px 30px; background: #4CAF50; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer;">
                            📅 Schedule Payment(s)
                        </button>
                    </div>
                </div>

                <!-- SANDBOX INFO BAR -->
                <div style="background: #fff3cd; color: #856404; padding: 10px 15px; border-radius: 8px; margin: 15px 0; display: flex; align-items: center; gap: 10px; border-left: 4px solid #ffc107;">
                    <span style="font-size: 20px;">🧪</span>
                    <span style="font-size: 14px;"><strong>REMINDER:</strong> This is a sandbox demo. Phone numbers are not validated - we format them but M-Pesa will do final validation. Check terminal for detailed API logs!</span>
                </div>

                <!-- SCHEDULED PAYMENTS LIST -->
                <div style="margin-top: 30px;">
                    <h3 style="display: flex; justify-content: space-between; align-items: center;">
                        <span>📋 Scheduled Payments <span id="paymentCount" style="background: #4CAF50; color: white; padding: 2px 10px; border-radius: 12px; font-size: 14px;">0</span></span>
                        <span style="font-size: 14px; font-weight: normal; color: #666; background: #f0f0f0; padding: 5px 10px; border-radius: 20px;">
                            ⏰ Auto-pay at <span id="autoPayTimeDisplay">17:00</span>
                        </span>
                    </h3>
                    
                    <div id="paymentsList" style="min-height: 200px; border: 2px dashed #ddd; border-radius: 8px; padding: 20px; background: #fafafa;">
                        <!-- Payments will be dynamically inserted here -->
                        <div style="text-align: center; color: #999; padding: 40px;">
                            📭 No scheduled payments. Click "Pay Someone" or "Pay Your Team" to start!
                        </div>
                    </div>
                </div>

                <!-- EDUCATIONAL API FLOW EXPLANATION -->
                <div style="margin-top: 30px; background: #e8f5e8; padding: 15px; border-radius: 8px; border: 1px solid #4CAF50;">
                    <h4 style="margin-top: 0; color: #2E7D32; display: flex; align-items: center; gap: 10px;">
                        <span>🔍</span> Real B2C API Flow
                    </h4>
                    
                    <div id="liveApiExplanation" style="font-family: monospace; background: #1e1e1e; color: #d4d4d4; padding: 15px; border-radius: 6px;">
                        <p><span style="color: #569cd6;">1.</span> When time reaches ⏰, frontend calls <span style="color: #ce9178;">POST /api/b2c/payout</span></p>
                        <p><span style="color: #569cd6;">2.</span> Backend gets token → sends to Daraja</p>
                        <p><span style="color: #569cd6;">3.</span> Daraja responds immediately: <span style="color: #4ec9b0;">"Request Accepted"</span></p>
                        <p><span style="color: #569cd6;">4.</span> Later, Daraja calls back to <span style="color: #ce9178;">/api/b2c/result</span> with final status</p>
                        <p><span style="color: #569cd6;">5.</span> Check TERMINAL for complete logs!</p>
                        <p style="margin-top: 10px; color: #ce9178; border-top: 1px solid #333; padding-top: 10px;">
                            ⚡ Click any payment below to see the API request/response
                        </p>
                    </div>
                </div>

                <!-- TRANSACTION HISTORY -->
                <div style="margin-top: 30px;">
                    <h3 style="display: flex; align-items: center; gap: 10px;">
                        <span>📊</span> Payment History
                        <span style="background: #666; color: white; padding: 2px 8px; border-radius: 12px; font-size: 11px;">Sandbox Records</span>
                    </h3>
                    <div id="b2cHistory" style="max-height: 300px; overflow-y: auto; border: 1px solid #ddd; border-radius: 8px; background: white;">
                        <!-- History items will appear here -->
                    </div>
                </div>

                <!-- Footer note -->
                <div style="margin-top: 20px; text-align: center; font-size: 12px; color: #999; border-top: 1px solid #eee; padding-top: 20px;">
                    <p>🔬 All transactions are sandbox simulations. Check your terminal for detailed API logs.</p>
                    <p>📱 Phone numbers are automatically formatted but not validated - M-Pesa will do final validation.</p>
                </div>
            </div>
        `;
    }
    
    // =============================================
    // CSS STYLES (Additional)
    // =============================================
    function injectB2CStyles() {
        if (document.getElementById('b2c-styles')) return;
        
        const styles = `
            <style id="b2c-styles">
                .payment-item {
                    background: white;
                    border: 2px solid #e0e0e0;
                    border-radius: 8px;
                    padding: 15px;
                    margin-bottom: 15px;
                    transition: all 0.3s;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
                }
                .payment-item:hover {
                    border-color: #4CAF50;
                    box-shadow: 0 5px 15px rgba(0,0,0,0.1);
                    transform: translateY(-2px);
                }
                .payment-item.paid {
                    border-left: 6px solid #4CAF50;
                    background: #f0fff0;
                }
                .payment-item.failed {
                    border-left: 6px solid #f44336;
                    background: #fff0f0;
                }
                .payment-item.pending {
                    border-left: 6px solid #ff9800;
                    background: #fff8e7;
                }
                .payment-item.processing {
                    border-left: 6px solid #2196F3;
                    background: #e3f2fd;
                }
                .comment-badge {
                    display: inline-block;
                    padding: 5px 12px;
                    border-radius: 20px;
                    font-size: 12px;
                    font-weight: bold;
                    cursor: pointer;
                }
                .comment-good {
                    background: #4CAF50;
                    color: white;
                }
                .comment-bad {
                    background: #f44336;
                    color: white;
                }
                .comment-pending {
                    background: #ff9800;
                    color: white;
                }
                .status-icon {
                    font-size: 24px;
                    margin-right: 10px;
                }
                .api-details {
                    background: #f5f5f5;
                    padding: 10px;
                    border-radius: 4px;
                    font-family: monospace;
                    font-size: 12px;
                    margin-top: 10px;
                    display: none;
                    border: 1px solid #ddd;
                }
                .api-details.show {
                    display: block;
                }
                .api-details pre {
                    margin: 5px 0 0;
                    white-space: pre-wrap;
                    word-wrap: break-word;
                }
                .bulk-preview {
                    background: #e3f2fd;
                    padding: 10px;
                    border-radius: 4px;
                    margin-top: 10px;
                    font-size: 13px;
                }
                .sandbox-tag {
                    background: #ffd700;
                    color: #856404;
                    padding: 2px 8px;
                    border-radius: 12px;
                    font-size: 11px;
                    font-weight: bold;
                }
            </style>
        `;
        
        document.head.insertAdjacentHTML('beforeend', styles);
    }
    
    // =============================================
    // SMART PHONE FORMATTER - Never rejects, just formats
    // =============================================
    function formatPhoneNumber(phone) {
        if (!phone) return phone;
        
        // Store original
        const original = phone;
        
        // Remove all non-digits
        let cleaned = phone.replace(/\D/g, '');
        
        console.log(`📞 Formatting phone: "${original}" → cleaned: "${cleaned}"`);
        
        // Format based on common patterns, but NEVER reject
        if (cleaned.length === 9 && cleaned.startsWith('7')) {
            // 712345678 → 254712345678
            return '254' + cleaned;
        }
        else if (cleaned.length === 10 && cleaned.startsWith('07')) {
            // 0712345678 → 254712345678
            return '254' + cleaned.substring(1);
        }
        else if (cleaned.length === 10 && cleaned.startsWith('01')) {
            // 0114932232 → 254114932232
            return '254' + cleaned.substring(1);
        }
        else if (cleaned.length === 12 && cleaned.startsWith('254')) {
            // 254712345678 → 254712345678 (already correct)
            return cleaned;
        }
        else if (cleaned.length === 13 && cleaned.startsWith('254')) {
            // 2547123456789? Keep as is
            return cleaned;
        }
        else if (cleaned.length === 13 && cleaned.startsWith('+254')) {
            // +254712345678 → 254712345678
            return cleaned.substring(1);
        }
        
        // For any other format, return original and let M-Pesa validate
        console.log(`📞 Unusual format, sending as-is: "${original}"`);
        return original;
    }
    
    // =============================================
    // SHOW PAYMENT FORM - With dynamic content
    // =============================================
    function showPaymentForm(type) {
        const formContainer = document.getElementById('paymentFormContainer');
        const formTitle = document.getElementById('formTitle');
        const formContent = document.getElementById('paymentFormContent');
        
        formTitle.innerHTML = type === 'single' ? 
            '💰 Pay Someone <span class="sandbox-tag" style="margin-left: auto;">Single Payment</span>' : 
            '👥 Pay Your Team <span class="sandbox-tag" style="margin-left: auto;">Bulk Payments</span>';
        
        if (type === 'single') {
            formContent.innerHTML = `
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                    <div>
                        <label style="display: block; margin-bottom: 5px; font-weight: bold;">📱 Phone Number</label>
                        <input type="text" id="phoneInput" placeholder="e.g., 0712345678 or 0114932232" style="width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 6px;">
                        <small style="color: #666;">We'll auto-format any number - M-Pesa validates</small>
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 5px; font-weight: bold;">💰 Amount (KES)</label>
                        <input type="number" id="amountInput" placeholder="500" min="1" style="width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 6px;">
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 5px; font-weight: bold;">⏰ Pay At</label>
                        <input type="time" id="timeInput" value="17:00" style="width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 6px;">
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 5px; font-weight: bold;">👤 Name (Optional)</label>
                        <input type="text" id="nameInput" placeholder="John Kamau" style="width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 6px;">
                    </div>
                </div>
            `;
        } else {
            formContent.innerHTML = `
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: bold;">📱 Phone Numbers (one per line)</label>
                    <textarea id="bulkPhonesInput" rows="6" placeholder="e.g., 
0712345678
0114932232
254712345678
0723456789" style="width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 6px; font-family: monospace;"></textarea>
                    <small style="color: #666;">Enter each phone number on a new line. We'll auto-format them all.</small>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                    <div>
                        <label style="display: block; margin-bottom: 5px; font-weight: bold;">💰 Amount (KES) per person</label>
                        <input type="number" id="bulkAmountInput" placeholder="500" min="1" style="width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 6px;">
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 5px; font-weight: bold;">⏰ Pay At</label>
                        <input type="time" id="bulkTimeInput" value="17:00" style="width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 6px;">
                    </div>
                </div>
                <div id="bulkPreview" class="bulk-preview" style="display: none;">
                    <strong>Preview:</strong> <span id="bulkCount">0</span> numbers found
                </div>
            `;
            
            // Add live preview for bulk entries
            setTimeout(() => {
                const bulkInput = document.getElementById('bulkPhonesInput');
                if (bulkInput) {
                    bulkInput.addEventListener('input', updateBulkPreview);
                }
            }, 100);
        }
        
        formContainer.style.display = 'block';
    }
    
    // =============================================
    // UPDATE BULK PREVIEW
    // =============================================
    function updateBulkPreview() {
        const bulkInput = document.getElementById('bulkPhonesInput');
        const preview = document.getElementById('bulkPreview');
        const countSpan = document.getElementById('bulkCount');
        
        if (!bulkInput || !preview || !countSpan) return;
        
        const lines = bulkInput.value.split('\n').filter(line => line.trim() !== '');
        countSpan.textContent = lines.length;
        preview.style.display = lines.length > 0 ? 'block' : 'none';
    }
    
    // =============================================
    // EVENT LISTENERS
    // =============================================
    function setupEventListeners() {
        document.getElementById('paySomeoneBtn')?.addEventListener('click', () => {
            showPaymentForm('single');
        });
        
        document.getElementById('payTeamBtn')?.addEventListener('click', () => {
            showPaymentForm('team');
        });
        
        document.getElementById('cancelFormBtn')?.addEventListener('click', () => {
            document.getElementById('paymentFormContainer').style.display = 'none';
        });
        
        document.getElementById('schedulePaymentBtn')?.addEventListener('click', () => {
            schedulePayment();
        });
    }
    
    // =============================================
    // SCHEDULE PAYMENT(S) - Handles both single and bulk
    // =============================================
    function schedulePayment() {
        const formTitle = document.getElementById('formTitle').textContent;
        const isBulk = formTitle.includes('Bulk');
        
        if (isBulk) {
            scheduleBulkPayments();
        } else {
            scheduleSinglePayment();
        }
    }
    
    function scheduleSinglePayment() {
        let phone = document.getElementById('phoneInput').value.trim();
        const amount = document.getElementById('amountInput').value;
        const payTime = document.getElementById('timeInput').value;
        const name = document.getElementById('nameInput').value.trim() || 'Worker';
        
        if (!phone || !amount) {
            alert('Please enter phone number and amount');
            return;
        }
        
        // Format phone but don't validate
        const formattedPhone = formatPhoneNumber(phone);
        
        const payment = {
            id: Date.now() + Math.random().toString(36).substr(2, 5),
            phone: formattedPhone,
            originalPhone: phone,
            amount: amount,
            scheduledTime: payTime,
            name: name,
            comment: null,
            status: 'pending',
            paidAt: null,
            createdAt: new Date().toISOString(),
            apiResponse: null
        };
        
        scheduledPayments.push(payment);
        saveToStorage();
        document.getElementById('paymentFormContainer').style.display = 'none';
        updatePaymentsList();
        showEducationalMessage(`✅ Payment scheduled for ${formattedPhone} at ${payTime}`);
    }
    
    function scheduleBulkPayments() {
        const bulkPhones = document.getElementById('bulkPhonesInput').value.trim();
        const amount = document.getElementById('bulkAmountInput').value;
        const payTime = document.getElementById('bulkTimeInput').value;
        
        if (!bulkPhones || !amount) {
            alert('Please enter phone numbers and amount');
            return;
        }
        
        // Split by new line and filter empty lines
        const phoneLines = bulkPhones.split('\n').filter(line => line.trim() !== '');
        
        if (phoneLines.length === 0) {
            alert('Please enter at least one phone number');
            return;
        }
        
        let addedCount = 0;
        
        phoneLines.forEach((line, index) => {
            const phone = line.trim();
            if (phone) {
                const formattedPhone = formatPhoneNumber(phone);
                
                const payment = {
                    id: Date.now() + index + Math.random().toString(36).substr(2, 5),
                    phone: formattedPhone,
                    originalPhone: phone,
                    amount: amount,
                    scheduledTime: payTime,
                    name: `Worker ${index + 1}`,
                    comment: null,
                    status: 'pending',
                    paidAt: null,
                    createdAt: new Date().toISOString(),
                    apiResponse: null
                };
                
                scheduledPayments.push(payment);
                addedCount++;
            }
        });
        
        saveToStorage();
        document.getElementById('paymentFormContainer').style.display = 'none';
        updatePaymentsList();
        showEducationalMessage(`✅ Scheduled ${addedCount} payments for ${payTime}`);
    }
    
    // =============================================
    // UPDATE PAYMENTS LIST
    // =============================================
    function updatePaymentsList() {
        const listContainer = document.getElementById('paymentsList');
        const countSpan = document.getElementById('paymentCount');
        
        if (!listContainer) return;
        
        if (scheduledPayments.length === 0) {
            listContainer.innerHTML = '<div style="text-align: center; color: #999; padding: 40px;">📭 No scheduled payments. Click "Pay Someone" or "Pay Your Team" to start!</div>';
            if (countSpan) countSpan.textContent = '0';
            return;
        }
        
        if (countSpan) countSpan.textContent = scheduledPayments.length;
        
        const sorted = [...scheduledPayments].sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
        
        let html = '';
        sorted.forEach(payment => {
            let statusIcon = '⏳';
            let statusClass = 'pending';
            
            if (payment.status === 'paid') {
                statusIcon = '✅';
                statusClass = 'paid';
            } else if (payment.status === 'failed') {
                statusIcon = '❌';
                statusClass = 'failed';
            } else if (payment.status === 'held') {
                statusIcon = '⏸️';
                statusClass = 'failed';
            } else if (payment.status === 'processing') {
                statusIcon = '🔄';
                statusClass = 'processing';
            }
            
            let commentBadge = '';
            if (payment.comment === 'good') {
                commentBadge = '<span class="comment-badge comment-good">✅ Good work</span>';
            } else if (payment.comment === 'bad') {
                commentBadge = '<span class="comment-badge comment-bad">❌ Bad work</span>';
            } else if (payment.status === 'pending') {
                commentBadge = '<span class="comment-badge comment-pending">⏳ Awaiting comment</span>';
            }
            
            // Show original phone if different from formatted
            const phoneDisplay = (payment.originalPhone && payment.originalPhone !== payment.phone) ? 
                `${payment.phone} <small style="color: #999;">(was: ${payment.originalPhone})</small>` : 
                payment.phone;
            
            html += `
                <div class="payment-item ${statusClass}" data-id="${payment.id}">
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <div style="display: flex; align-items: center; flex: 1;">
                            <span class="status-icon">${statusIcon}</span>
                            <div style="flex: 1;">
                                <div><strong>${payment.name}</strong> - <span style="font-family: monospace;">${phoneDisplay}</span></div>
                                <div>KES ${payment.amount} at ${payment.scheduledTime}</div>
                                ${payment.status === 'processing' ? '<div style="color: #2196F3; font-size: 12px;">⏳ Calling API...</div>' : ''}
                            </div>
                        </div>
                        <div>
                            ${commentBadge}
                        </div>
                    </div>
                    
                    ${payment.status === 'pending' ? `
                        <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #eee;">
                            <div style="display: flex; gap: 10px; align-items: center;">
                                <span style="font-size: 14px;">📝 Add comment before ${payment.scheduledTime}:</span>
                                <button class="comment-btn good-btn" data-id="${payment.id}" style="padding: 8px 20px; background: #4CAF50; color: white; border: none; border-radius: 6px; cursor: pointer;">✅ Good work</button>
                                <button class="comment-btn bad-btn" data-id="${payment.id}" style="padding: 8px 20px; background: #f44336; color: white; border: none; border-radius: 6px; cursor: pointer;">❌ Bad work</button>
                            </div>
                        </div>
                    ` : ''}
                    
                    ${payment.apiResponse ? `
                        <div class="api-details show">
                            <strong>📡 API Response:</strong>
                            <pre>${JSON.stringify(payment.apiResponse, null, 2)}</pre>
                        </div>
                    ` : ''}
                    
                    ${payment.status === 'pending' && !payment.comment ? `
                        <div style="margin-top: 10px; font-size: 12px; color: #ff9800; background: #fff3e0; padding: 5px 10px; border-radius: 4px;">
                            ⚠️ No comment yet - won't pay until comment is added
                        </div>
                    ` : ''}
                </div>
            `;
        });
        
        listContainer.innerHTML = html;
        
        // Add comment button listeners
        document.querySelectorAll('.comment-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = e.target.dataset.id;
                const comment = e.target.classList.contains('good-btn') ? 'good' : 'bad';
                setComment(id, comment);
            });
        });
        
        // Add click to show API details
        document.querySelectorAll('.payment-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.classList.contains('comment-btn')) return;
                
                const details = item.querySelector('.api-details');
                if (details) {
                    details.classList.toggle('show');
                }
            });
        });
    }
    
    // =============================================
    // SET COMMENT
    // =============================================
    function setComment(paymentId, comment) {
        const payment = scheduledPayments.find(p => p.id === paymentId);
        if (!payment) return;
        
        payment.comment = comment;
        
        if (comment === 'bad') {
            payment.status = 'held';
        }
        
        saveToStorage();
        updatePaymentsList();
        showEducationalMessage(`📝 Comment: ${comment === 'good' ? '✅ Good' : '❌ Bad'}`);
        checkPayments();
    }
    
    // =============================================
    // PAYMENT CHECKER
    // =============================================
    function startPaymentChecker() {
        checkPayments();
        setInterval(checkPayments, 60000);
    }
    
    function checkPayments() {
        const now = new Date();
        const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        
        let changed = false;
        
        scheduledPayments.forEach(payment => {
            if (payment.status === 'pending' && payment.scheduledTime <= currentTime) {
                
                if (payment.comment === 'good') {
                    processPayment(payment);
                    changed = true;
                } else if (payment.comment === 'bad') {
                    payment.status = 'held';
                    changed = true;
                    showEducationalMessage(`⏸️ Payment held for ${payment.phone} (bad comment)`);
                }
            }
        });
        
        if (changed) {
            saveToStorage();
            updatePaymentsList();
        }
    }
    
    // =============================================
    // PROCESS PAYMENT - Now calls REAL backend
    // =============================================
    async function processPayment(payment) {
        console.log(`💰 Processing REAL payment for ${payment.phone} - KES ${payment.amount}`);
        
        payment.status = 'processing';
        updatePaymentsList();
        showEducationalMessage(`⏳ Calling B2C API for ${payment.phone}... Check terminal for logs`);
        
        try {
            const response = await fetch('/api/b2c/payout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phone: payment.phone,
                    amount: payment.amount,
                    remarks: `Farm payment - ${payment.name}`,
                    occasion: payment.comment === 'good' ? 'Work well done' : 'Payment'
                })
            });
            
            const data = await response.json();
            console.log('📥 B2C API Response:', data);
            
            if (data.ResponseCode === '0') {
                payment.status = 'paid';
                payment.paidAt = new Date().toLocaleTimeString();
                payment.apiResponse = data;
                showEducationalMessage(`✅ Payment request accepted! Check /api/b2c/result for final status`);
            } else {
                payment.status = 'failed';
                payment.apiResponse = data;
                showEducationalMessage(`❌ Payment failed: ${data.error || 'Check terminal for details'}`);
            }
            
        } catch (error) {
            console.error('❌ Error:', error);
            payment.status = 'failed';
            payment.apiResponse = { error: error.message };
            showEducationalMessage(`❌ Connection error: ${error.message}`);
        }
        
        addToHistory(payment);
        saveToStorage();
        updatePaymentsList();
    }
    
    // =============================================
    // ADD TO HISTORY
    // =============================================
    function addToHistory(payment) {
        const historyContainer = document.getElementById('b2cHistory');
        if (!historyContainer) return;
        
        const historyItem = document.createElement('div');
        historyItem.style.cssText = 'padding: 15px; border-bottom: 1px solid #eee; cursor: pointer; background: white; transition: background 0.2s;';
        historyItem.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: 20px;">${payment.status === 'paid' ? '✅' : '❌'}</span>
                    <div>
                        <strong>${payment.phone}</strong> - KES ${payment.amount}
                        <div style="font-size: 12px; color: #666;">${payment.name}</div>
                    </div>
                </div>
                <small>${payment.paidAt || payment.scheduledTime}</small>
            </div>
            <div class="history-details" style="display: none; margin-top: 10px; background: #f5f5f5; padding: 10px; border-radius: 4px; font-family: monospace; font-size: 12px;">
                <strong>📡 API Response:</strong>
                <pre style="margin: 5px 0 0; overflow-x: auto;">${JSON.stringify(payment.apiResponse, null, 2)}</pre>
            </div>
        `;
        
        historyItem.addEventListener('click', () => {
            const details = historyItem.querySelector('.history-details');
            details.style.display = details.style.display === 'none' ? 'block' : 'none';
        });
        
        historyContainer.insertBefore(historyItem, historyContainer.firstChild);
    }
    
    // =============================================
    // EDUCATIONAL MESSAGES
    // =============================================
    function showEducationalMessage(message) {
        console.log("📘 EDU:", message);
        
        const statusBar = document.querySelector('.api-explanation');
        if (statusBar) {
            const msgDiv = document.createElement('div');
            msgDiv.style.cssText = 'background: #4CAF50; color: white; padding: 10px; border-radius: 4px; margin-top: 10px; animation: fadeIn 0.3s;';
            msgDiv.textContent = message;
            statusBar.appendChild(msgDiv);
            
            setTimeout(() => msgDiv.remove(), 5000);
        }
    }
    
    // =============================================
    // STORAGE
    // =============================================
    function saveToStorage() {
        try {
            localStorage.setItem('b2cPayments', JSON.stringify(scheduledPayments));
        } catch (e) {
            console.error('Failed to save to localStorage', e);
        }
    }
    
    function loadFromStorage() {
        try {
            const saved = localStorage.getItem('b2cPayments');
            if (saved) {
                scheduledPayments = JSON.parse(saved);
                updatePaymentsList();
            }
        } catch (e) {
            console.error('Failed to load from localStorage', e);
        }
    }
    
})();