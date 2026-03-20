// static/js/install-button.js - HEADER BANNER VERSION
(function() {
    'use strict';
    
    console.log('📱 Superkeeper Install Button v3.0 - Header Banner');
    
    let deferredPrompt = null;
    let bannerShown = false;
    
    // Detect device type
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const isAndroid = /Android/.test(navigator.userAgent);
    
    // Check if already installed
    function isAppInstalled() {
        return window.matchMedia('(display-mode: standalone)').matches || 
               window.navigator.standalone === true;
    }
    
    // Check if user dismissed the install banner
    function wasDismissed() {
        return localStorage.getItem('sk_install_dismissed') === 'true';
    }
    
    // Mark as dismissed
    function markDismissed() {
        localStorage.setItem('sk_install_dismissed', 'true');
        localStorage.setItem('sk_dismissed_time', Date.now());
    }
    
    // Check if we should show the install banner again (after 7 days)
    function shouldShowAgain() {
        const dismissedTime = localStorage.getItem('sk_dismissed_time');
        if (!dismissedTime) return true;
        
        const daysSince = (Date.now() - parseInt(dismissedTime)) / (1000 * 60 * 60 * 24);
        return daysSince >= 7; // Show again after 7 days
    }
    
    // Find and get the welcome header div
    function getWelcomeHeader() {
        // Look for the header div that contains the welcome message
        const headers = document.querySelectorAll('header div');
        for (let header of headers) {
            if (header.querySelector('h1') && header.querySelector('h1').textContent.includes('Welcome')) {
                return header;
            }
        }
        return null;
    }
    
    // Show the install banner in the welcome area
    function showInstallBanner() {
        if (bannerShown) return;
        if (isAppInstalled()) return;
        if (wasDismissed() && !shouldShowAgain()) return;
        
        const welcomeContainer = getWelcomeHeader();
        if (!welcomeContainer) {
            console.log('⚠️ Welcome header not found, falling back to floating button');
            showFloatingButton();
            return;
        }
        
        console.log('🔔 Showing install banner in welcome area for', isIOS ? 'iOS' : 'Android');
        bannerShown = true;
        
        // Remove any existing banner
        const existingBanner = document.getElementById('sk-install-banner');
        if (existingBanner) existingBanner.remove();
        
        // Create the banner
        const banner = document.createElement('div');
        banner.id = 'sk-install-banner';
        banner.style.cssText = `
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 16px;
            padding: 16px 20px;
            margin-top: 16px;
            margin-bottom: 0;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
            animation: slideDown 0.5s ease;
            border: 1px solid rgba(255,255,255,0.2);
            flex-wrap: wrap;
        `;
        
        // Different content for iOS vs Android
        if (isIOS) {
            banner.innerHTML = `
                <div style="display: flex; align-items: center; gap: 15px; flex: 1; min-width: 200px;">
                    <div style="
                        background: rgba(255,255,255,0.2);
                        width: 48px;
                        height: 48px;
                        border-radius: 24px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 24px;
                    ">📱</div>
                    <div style="color: white;">
                        <div style="font-weight: bold; font-size: 16px; margin-bottom: 4px;">
                            Install Superkeeper App
                        </div>
                        <div style="font-size: 13px; opacity: 0.9;">
                            Tap Share → Add to Home Screen for quick access
                        </div>
                    </div>
                </div>
                <div style="display: flex; gap: 10px;">
                    <button id="sk-install-btn" style="
                        background: white;
                        color: #667eea;
                        border: none;
                        padding: 10px 20px;
                        border-radius: 40px;
                        font-weight: bold;
                        font-size: 14px;
                        cursor: pointer;
                        transition: transform 0.2s;
                        white-space: nowrap;
                    ">Install</button>
                    <button id="sk-dismiss-btn" style="
                        background: rgba(255,255,255,0.2);
                        color: white;
                        border: 1px solid rgba(255,255,255,0.3);
                        padding: 10px 20px;
                        border-radius: 40px;
                        font-weight: 500;
                        font-size: 14px;
                        cursor: pointer;
                        transition: transform 0.2s;
                        white-space: nowrap;
                    ">Later</button>
                </div>
            `;
        } else {
            banner.innerHTML = `
                <div style="display: flex; align-items: center; gap: 15px; flex: 1; min-width: 200px;">
                    <div style="
                        background: rgba(255,255,255,0.2);
                        width: 48px;
                        height: 48px;
                        border-radius: 24px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 24px;
                    ">📱</div>
                    <div style="color: white;">
                        <div style="font-weight: bold; font-size: 16px; margin-bottom: 4px;">
                            Get the Superkeeper App
                        </div>
                        <div style="font-size: 13px; opacity: 0.9;">
                            One-tap install • Works offline • Faster checkout
                        </div>
                    </div>
                </div>
                <div style="display: flex; gap: 10px;">
                    <button id="sk-install-btn" style="
                        background: white;
                        color: #667eea;
                        border: none;
                        padding: 10px 20px;
                        border-radius: 40px;
                        font-weight: bold;
                        font-size: 14px;
                        cursor: pointer;
                        transition: transform 0.2s;
                        white-space: nowrap;
                    ">Install Now</button>
                    <button id="sk-dismiss-btn" style="
                        background: rgba(255,255,255,0.2);
                        color: white;
                        border: 1px solid rgba(255,255,255,0.3);
                        padding: 10px 20px;
                        border-radius: 40px;
                        font-weight: 500;
                        font-size: 14px;
                        cursor: pointer;
                        transition: transform 0.2s;
                        white-space: nowrap;
                    ">Maybe Later</button>
                </div>
            `;
        }
        
        // Insert banner into the welcome container
        welcomeContainer.appendChild(banner);
        
        // Add hover effects
        const installBtn = document.getElementById('sk-install-btn');
        const dismissBtn = document.getElementById('sk-dismiss-btn');
        
        if (installBtn) {
            installBtn.onmouseenter = () => installBtn.style.transform = 'scale(1.05)';
            installBtn.onmouseleave = () => installBtn.style.transform = 'scale(1)';
        }
        
        if (dismissBtn) {
            dismissBtn.onmouseenter = () => dismissBtn.style.transform = 'scale(1.05)';
            dismissBtn.onmouseleave = () => dismissBtn.style.transform = 'scale(1)';
        }
        
        // Handle install click
        if (installBtn) {
            installBtn.onclick = async () => {
                console.log('🔘 Install button clicked');
                
                if (isIOS) {
                    banner.remove();
                    showIOSInstructions();
                } else if (deferredPrompt) {
                    // Android: Show native install prompt (ONE-TAP!)
                    deferredPrompt.prompt();
                    deferredPrompt.userChoice.then((choiceResult) => {
                        if (choiceResult.outcome === 'accepted') {
                            console.log('✅ User accepted install');
                            localStorage.setItem('sk_installed_before', 'true');
                            banner.innerHTML = `
                                <div style="display: flex; align-items: center; gap: 15px; flex: 1;">
                                    <div style="background: rgba(255,255,255,0.2); width: 48px; height: 48px; border-radius: 24px; display: flex; align-items: center; justify-content: center; font-size: 24px;">✅</div>
                                    <div style="color: white;">
                                        <div style="font-weight: bold; font-size: 16px;">Installed Successfully! 🎉</div>
                                        <div style="font-size: 13px;">You can now find Superkeeper on your home screen</div>
                                    </div>
                                </div>
                            `;
                            setTimeout(() => banner.remove(), 3000);
                        } else {
                            console.log('❌ User dismissed install');
                            banner.remove();
                        }
                        deferredPrompt = null;
                    });
                } else {
                    // Fallback for Android without prompt
                    banner.remove();
                    showManualInstructions();
                }
            };
        }
        
        // Handle dismiss click
        if (dismissBtn) {
            dismissBtn.onclick = () => {
                console.log('🔘 User dismissed install banner');
                markDismissed();
                banner.style.animation = 'slideUp 0.3s ease';
                setTimeout(() => banner.remove(), 300);
                bannerShown = false;
            };
        }
        
        // Add animation styles
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideDown {
                from { transform: translateY(-20px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
            @keyframes slideUp {
                from { transform: translateY(0); opacity: 1; }
                to { transform: translateY(-20px); opacity: 0; }
            }
            @keyframes slideInRight {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOutRight {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes fadeOut {
                from { opacity: 1; }
                to { opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }
    
    // Fallback floating button (if header not found)
    function showFloatingButton() {
        if (buttonShown) return;
        buttonShown = true;
        
        const btn = document.createElement('button');
        btn.id = 'sk-install-button';
        
        if (isIOS) {
            btn.innerHTML = `
                <div style="display: flex; align-items: center; gap: 12px;">
                    <span style="font-size: 24px;">📱</span>
                    <div style="text-align: left;">
                        <div style="font-weight: bold; font-size: 14px;">Install Superkeeper</div>
                        <div style="font-size: 11px; opacity: 0.8;">Tap Share → Add to Home Screen</div>
                    </div>
                    <span style="font-size: 18px;">📲</span>
                </div>
            `;
        } else {
            btn.innerHTML = `
                <div style="display: flex; align-items: center; gap: 12px;">
                    <span style="font-size: 24px;">📱</span>
                    <div style="text-align: left;">
                        <div style="font-weight: bold; font-size: 14px;">Install Superkeeper App</div>
                        <div style="font-size: 11px; opacity: 0.8;">One-tap install • Works offline</div>
                    </div>
                    <span style="font-size: 18px;">⬇️</span>
                </div>
            `;
        }
        
        btn.style.cssText = `
            position: fixed;
            bottom: 30px;
            right: 20px;
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            border: none;
            border-radius: 60px;
            padding: 14px 24px;
            cursor: pointer;
            z-index: 999999;
            box-shadow: 0 10px 30px rgba(102, 126, 234, 0.4);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-weight: 500;
            border: 1px solid rgba(255,255,255,0.2);
            transition: transform 0.2s;
            animation: slideInRight 0.5s ease;
        `;
        
        btn.onclick = () => {
            if (isIOS) {
                btn.remove();
                showIOSInstructions();
            } else if (deferredPrompt) {
                deferredPrompt.prompt();
            } else {
                alert('To install: Tap menu → "Add to Home screen"');
                btn.remove();
            }
        };
        
        document.body.appendChild(btn);
        
        setTimeout(() => {
            if (document.body.contains(btn)) {
                btn.style.animation = 'slideOutRight 0.3s ease';
                setTimeout(() => btn.remove(), 300);
                buttonShown = false;
            }
        }, 15000);
    }
    
    // Show iOS instructions modal
    function showIOSInstructions() {
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.9);
            z-index: 1000000;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            animation: fadeIn 0.3s ease;
        `;
        
        modal.innerHTML = `
            <div style="
                background: white;
                border-radius: 32px;
                padding: 32px 24px;
                max-width: 340px;
                text-align: center;
                animation: slideUp 0.3s ease;
                box-shadow: 0 25px 50px rgba(0,0,0,0.3);
            ">
                <div style="
                    background: linear-gradient(135deg, #667eea, #764ba2);
                    width: 80px;
                    height: 80px;
                    border-radius: 40px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 0 auto 20px;
                ">
                    <span style="font-size: 40px;">📱</span>
                </div>
                
                <h2 style="
                    margin: 0 0 8px;
                    color: #1e293b;
                    font-size: 24px;
                    font-weight: 700;
                ">Install Superkeeper</h2>
                
                <p style="
                    color: #64748b;
                    margin-bottom: 28px;
                    font-size: 14px;
                    line-height: 1.5;
                ">
                    Get the app on your home screen for quick access
                </p>
                
                <div style="
                    background: #f8fafc;
                    border-radius: 20px;
                    padding: 24px;
                    margin-bottom: 28px;
                    text-align: left;
                ">
                    <div style="display: flex; gap: 16px; margin-bottom: 24px; align-items: center;">
                        <div style="
                            background: #667eea;
                            color: white;
                            width: 32px;
                            height: 32px;
                            border-radius: 16px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            font-weight: bold;
                            font-size: 16px;
                            flex-shrink: 0;
                        ">1</div>
                        <div style="color: #334155;">
                            Tap <span style="
                                background: white;
                                padding: 6px 12px;
                                border-radius: 30px;
                                display: inline-flex;
                                align-items: center;
                                gap: 6px;
                                box-shadow: 0 2px 4px rgba(0,0,0,0.05);
                            ">
                                <span style="font-size: 16px;">🔲</span> Share
                            </span> button
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 16px; margin-bottom: 24px; align-items: center;">
                        <div style="
                            background: #667eea;
                            color: white;
                            width: 32px;
                            height: 32px;
                            border-radius: 16px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            font-weight: bold;
                            font-size: 16px;
                            flex-shrink: 0;
                        ">2</div>
                        <div style="color: #334155;">
                            Scroll down and tap <strong style="
                                background: #e2e8f0;
                                padding: 4px 8px;
                                border-radius: 8px;
                            ">Add to Home Screen</strong>
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 16px; align-items: center;">
                        <div style="
                            background: #667eea;
                            color: white;
                            width: 32px;
                            height: 32px;
                            border-radius: 16px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            font-weight: bold;
                            font-size: 16px;
                            flex-shrink: 0;
                        ">3</div>
                        <div style="color: #334155;">
                            Tap <strong style="
                                background: #e2e8f0;
                                padding: 4px 8px;
                                border-radius: 8px;
                            ">Add</strong> in top right corner
                        </div>
                    </div>
                </div>
                
                <button id="ios-close-btn" style="
                    background: linear-gradient(135deg, #667eea, #764ba2);
                    color: white;
                    border: none;
                    padding: 14px 28px;
                    border-radius: 40px;
                    font-weight: 600;
                    font-size: 16px;
                    width: 100%;
                    cursor: pointer;
                    transition: transform 0.2s;
                ">
                    Got it! ✓
                </button>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        document.getElementById('ios-close-btn').onclick = () => {
            modal.style.animation = 'fadeOut 0.3s ease';
            setTimeout(() => modal.remove(), 300);
        };
        
        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };
    }
    
    // Show manual instructions for browsers without install prompt
    function showManualInstructions() {
        alert('To install Superkeeper:\n\n1. Tap the browser menu (⋮)\n2. Select "Install App" or "Add to Home screen"\n3. Follow the prompts to install');
    }
    
    // Listen for install prompt (Android only)
    window.addEventListener('beforeinstallprompt', (e) => {
        console.log('🎯 Android install prompt available!');
        e.preventDefault();
        deferredPrompt = e;
        
        // Show banner after 2 seconds
        setTimeout(() => {
            if (!isAppInstalled() && !bannerShown) {
                showInstallBanner();
            }
        }, 2000);
    });
    
    // For iOS - show banner after 3 seconds
    if (isIOS && !isAppInstalled()) {
        console.log('🍎 iOS detected - showing install banner');
        setTimeout(() => {
            if (!isAppInstalled() && !bannerShown) {
                showInstallBanner();
            }
        }, 3000);
    }
    
    // For Android without prompt, show after 5 seconds as fallback
    setTimeout(() => {
        if (!isAppInstalled() && !bannerShown && !deferredPrompt && !isIOS) {
            console.log('⚠️ No install prompt detected, showing banner anyway');
            showInstallBanner();
        }
    }, 5000);
    
    console.log('✅ Install banner ready - will appear in welcome area');
})();