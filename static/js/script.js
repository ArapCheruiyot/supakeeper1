// static/js/script.js
console.log("📜 script.js loaded");

// =============================================
// TAB SWITCHING FUNCTION
// =============================================
function switchTab(tabId) {
    console.log(`🔄 Switching to tab: ${tabId}`);
    
    // Update active tab button
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.textContent.toLowerCase().includes(tabId) || 
            (tabId === 'c2b' && btn.textContent.includes('C2B')) ||
            (tabId === 'b2c' && btn.textContent.includes('B2C')) ||
            (tabId === 'qr' && btn.textContent.includes('QR')) ||
            (tabId === 'reversal' && btn.textContent.includes('Reversal'))) {
            btn.classList.add('active');
        }
    });
    
    // Get the content container
    const contentDiv = document.getElementById('tabContent');
    
    // Clear current content
    contentDiv.innerHTML = '';
    
    // Load appropriate module based on tab
    if (tabId === 'c2b') {
        console.log("📱 Loading C2B module...");
        if (window.initC2B) {
            window.initC2B('tabContent');
        } else {
            contentDiv.innerHTML = '<div class="error">C2B module not loaded</div>';
        }
    }
    else if (tabId === 'b2c') {
        console.log("💰 Loading B2C module...");
        if (window.initB2C) {
            window.initB2C('tabContent');
        } else {
            contentDiv.innerHTML = '<div class="error">B2C module not loaded. Check if b2c.js is loaded correctly.</div>';
            console.error("❌ window.initB2C is not defined!");
        }
    }
    else if (tabId === 'qr') {
        contentDiv.innerHTML = `
            <div class="feature-placeholder">
                <h3>📷 QR Code</h3>
                <p>Coming soon! This will demonstrate Dynamic QR Code generation.</p>
            </div>
        `;
    }
    else if (tabId === 'reversal') {
        console.log("↩️ Loading Reversal module...");
        if (window.initReversal) {
            window.initReversal('tabContent');
        } else {
            contentDiv.innerHTML = `
                <div class="feature-placeholder">
                    <h3>↩️ Transaction Reversal</h3>
                    <p>Reversal module not loaded. Check if reversal.js is loaded correctly.</p>
                    <p style="color: #ff9800; margin-top: 10px;">⏳ Make sure reversal.js is added to your HTML</p>
                </div>
            `;
            console.error("❌ window.initReversal is not defined! Did you add reversal.js to index.html?");
        }
    }
}

// =============================================
// TEST CONNECTION FUNCTION
// =============================================
function testConnection() {
    console.log("🔍 Testing connection...");
    const statusDiv = document.getElementById('api-status');
    
    statusDiv.innerHTML = '<span style="color: #ff9800;">⏳ Testing connection...</span>';
    
    fetch('/api/test')
        .then(response => response.json())
        .then(data => {
            console.log("✅ Connection test response:", data);
            statusDiv.innerHTML = `
                <span style="color: #4CAF50;">✅ Connected! ${data.message}</span>
                <br><small>Consumer Key: ${data.credentials.consumer_key_set ? '✓ Set' : '✗ Missing'}</small>
            `;
        })
        .catch(error => {
            console.error("❌ Connection test failed:", error);
            statusDiv.innerHTML = '<span style="color: #f44336;">❌ Connection failed. Is the server running?</span>';
        });
}

// =============================================
// INITIALIZE ON PAGE LOAD
// =============================================
document.addEventListener('DOMContentLoaded', function() {
    console.log("🚀 Page loaded, initializing...");
    
    // Check if all modules are loaded
    console.log("✅ C2B loaded:", !!window.initC2B);
    console.log("✅ B2C loaded:", !!window.initB2C);
    console.log("✅ Reversal loaded:", !!window.initReversal);  // Added this check
    
    // Load C2B by default
    switchTab('c2b');
});