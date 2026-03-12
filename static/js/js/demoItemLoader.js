// demoItemLoader.js - Smart demo item loader with auto-refresh
console.log("📦 Demo Item Loader initialized");

(function() {
    // Only run for demo users
    const isDemo = localStorage.getItem("isDemoMode") === "true" || 
                   localStorage.getItem("isTempDemo") === "true";
    
    if (!isDemo) {
        console.log("👤 Real user - loader not needed");
        return;
    }

    // Check if this is a fresh login
    const isFreshDemo = localStorage.getItem("freshDemoLogin") === "true";
    
    // Configuration
    const MAX_WAIT_TIME = 10000; // 10 seconds max wait
    const CHECK_INTERVAL = 500; // Check every 500ms
    const START_TIME = Date.now();
    
    let checkCount = 0;
    let refreshAttempted = false;
    
    console.log("⏱️ Demo loader started at:", new Date().toLocaleTimeString());
    
    // Create loading overlay
    function createLoadingOverlay() {
        // Check if overlay already exists
        if (document.getElementById('demo-smart-loader')) return;
        
        const overlay = document.createElement('div');
        overlay.id = 'demo-smart-loader';
        overlay.innerHTML = `
            <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(255,255,255,0.98); z-index: 99999; display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                <div style="text-align: center; max-width: 400px; padding: 30px; background: white; border-radius: 20px; box-shadow: 0 10px 40px rgba(0,0,0,0.1);">
                    <div style="border: 4px solid #f3f3f3; border-top: 4px solid #22c55e; border-radius: 50%; width: 60px; height: 60px; animation: spin 1s linear infinite; margin: 0 auto 20px;"></div>
                    
                    <h3 style="color: #166534; margin-bottom: 10px; font-size: 22px;">Setting up your demo shop</h3>
                    
                    <p style="color: #4b5563; margin-bottom: 15px; font-size: 16px;" id="loader-message">
                        Loading your sample products...
                    </p>
                    
                    <div style="background: #f0fdf4; padding: 15px; border-radius: 12px; margin: 15px 0; text-align: left;">
                        <p style="color: #166534; font-weight: 600; margin-bottom: 8px;">⏱️ What's happening?</p>
                        <p style="color: #374151; font-size: 14px; margin-bottom: 5px;">✓ Creating your private demo shop</p>
                        <p style="color: #374151; font-size: 14px; margin-bottom: 5px;">✓ Copying sample items (50+ products)</p>
                        <p style="color: #374151; font-size: 14px;" id="status-detail">✓ Setting up categories...</p>
                    </div>
                    
                    <div style="color: #6b7280; font-size: 13px; margin-top: 15px;" id="timer-display">
                        Taking longer than usual? <span id="time-elapsed">0</span> seconds
                    </div>
                    
                    <div style="margin-top: 20px; display: none;" id="refresh-option">
                        <p style="color: #dc2626; font-size: 14px; margin-bottom: 10px;">⚠️ Loading is taking too long</p>
                        <button id="manual-refresh-btn" style="background: #22c55e; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 14px;">
                            Refresh Manually
                        </button>
                    </div>
                </div>
            </div>
            <style>
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            </style>
        `;
        document.body.appendChild(overlay);
        
        // Add manual refresh button handler
        setTimeout(() => {
            const refreshBtn = document.getElementById('manual-refresh-btn');
            if (refreshBtn) {
                refreshBtn.addEventListener('click', () => {
                    console.log("🔄 Manual refresh triggered");
                    window.location.reload();
                });
            }
        }, 100);
    }
    
    // Update loading message
    function updateMessage(msg, detail) {
        const msgEl = document.getElementById('loader-message');
        const detailEl = document.getElementById('status-detail');
        if (msgEl) msgEl.textContent = msg;
        if (detailEl && detail) detailEl.textContent = detail;
    }
    
    // Update timer
    function updateTimer() {
        const elapsed = Math.floor((Date.now() - START_TIME) / 1000);
        const timerEl = document.getElementById('time-elapsed');
        if (timerEl) timerEl.textContent = elapsed;
        
        // Show refresh option after 8 seconds
        if (elapsed >= 8 && !refreshAttempted) {
            const refreshOption = document.getElementById('refresh-option');
            if (refreshOption) refreshOption.style.display = 'block';
        }
    }
    
    // Check if items are loaded
    function areItemsLoaded() {
        // Look for actual item elements (not empty states)
        const items = document.querySelectorAll('.item');
        const hasRealItems = items.length > 0;
        
        // Check if we're in empty state
        const emptyState = document.querySelector('.empty-state');
        const isEmpty = emptyState !== null;
        
        console.log(`🔍 Check #${checkCount}: Items found: ${items.length}, Empty state: ${isEmpty}`);
        
        if (hasRealItems) {
            console.log(`✅ ITEMS LOADED SUCCESSFULLY after ${Math.floor((Date.now() - START_TIME)/1000)}s`);
            return true;
        }
        
        return false;
    }
    
    // Remove overlay with success message
    function finishLoading() {
        const overlay = document.getElementById('demo-smart-loader');
        if (overlay) {
            const loadTime = Math.floor((Date.now() - START_TIME) / 1000);
            console.log(`🎉 Demo shop ready in ${loadTime} seconds`);
            
            // Show quick success message
            overlay.innerHTML = `
                <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(255,255,255,0.98); z-index: 99999; display: flex; align-items: center; justify-content: center;">
                    <div style="text-align: center; background: white; padding: 30px; border-radius: 20px; box-shadow: 0 10px 40px rgba(0,0,0,0.1);">
                        <div style="color: #22c55e; font-size: 48px; margin-bottom: 15px;">✓</div>
                        <h3 style="color: #166534; margin-bottom: 5px;">Demo Ready!</h3>
                        <p style="color: #6b7280; font-size: 14px;">Loaded in ${loadTime} seconds</p>
                    </div>
                </div>
            `;
            
            // Remove after 1.5 seconds
            setTimeout(() => {
                overlay.style.transition = 'opacity 0.5s';
                overlay.style.opacity = '0';
                setTimeout(() => overlay.remove(), 500);
            }, 1500);
        }
    }
    
    // Handle failure - show message and offer refresh
    function handleFailure() {
        console.log("❌ Items failed to load after max time");
        
        const overlay = document.getElementById('demo-smart-loader');
        if (overlay) {
            overlay.innerHTML = `
                <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(255,255,255,0.98); z-index: 99999; display: flex; align-items: center; justify-content: center;">
                    <div style="text-align: center; max-width: 350px; background: white; padding: 30px; border-radius: 20px; box-shadow: 0 10px 40px rgba(0,0,0,0.1);">
                        <div style="color: #f59e0b; font-size: 48px; margin-bottom: 15px;">⚠️</div>
                        <h3 style="color: #92400e; margin-bottom: 10px;">Taking longer than expected</h3>
                        <p style="color: #6b7280; margin-bottom: 20px; font-size: 14px;">
                            Don't worry! Your demo is still setting up. Try refreshing:
                        </p>
                        <button id="final-refresh-btn" style="background: #22c55e; color: white; border: none; padding: 12px 30px; border-radius: 10px; font-weight: 600; font-size: 16px; cursor: pointer; width: 100%;">
                            Click Here To Begin
                        </button>
                        <p style="color: #9ca3af; margin-top: 15px; font-size: 12px;">
                            Or click "Manage Stock" to start adding items
                        </p>
                    </div>
                </div>
            `;
            
            document.getElementById('final-refresh-btn')?.addEventListener('click', () => {
                window.location.reload();
            });
        }
    }
    
    // Only show overlay for fresh demos
    if (isFreshDemo) {
        // Clear the flag so we don't show overlay on subsequent visits
        localStorage.removeItem("freshDemoLogin");
        
        // Show overlay immediately
        createLoadingOverlay();
        
        // Start checking for items
        const interval = setInterval(() => {
            checkCount++;
            updateTimer();
            
            // Update messages based on time
            const elapsed = Date.now() - START_TIME;
            
            if (elapsed > 3000) {
                updateMessage("Still setting up...", "✓ Organizing products into categories");
            }
            if (elapsed > 6000) {
                updateMessage("Almost there!", "✓ Finalizing your demo shop");
            }
            
            if (areItemsLoaded()) {
                // Items loaded - finish successfully
                clearInterval(interval);
                finishLoading();
                
            } else if (elapsed >= MAX_WAIT_TIME) {
                // Max time reached - give up
                clearInterval(interval);
                
                // Check one last time
                if (!areItemsLoaded()) {
                    handleFailure();
                } else {
                    finishLoading();
                }
            }
        }, CHECK_INTERVAL);
        
        // Also check if categoriesList is being populated
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.addedNodes.length > 0) {
                    const hasItems = document.querySelectorAll('.item').length > 0;
                    if (hasItems) {
                        console.log("👀 MutationObserver detected items!");
                        // Let the interval handle it
                    }
                }
            });
        });
        
        // Start observing
        const categoriesList = document.getElementById('categories-list');
        if (categoriesList) {
            observer.observe(categoriesList, { childList: true, subtree: true });
        }
        
        // Log load time when done
        window.addEventListener('load', () => {
            setTimeout(() => {
                if (areItemsLoaded()) {
                    console.log(`📊 PERFORMANCE: Demo items loaded in ${Math.floor((Date.now() - START_TIME)/1000)}s`);
                }
            }, 1000);
        });
    }
})();