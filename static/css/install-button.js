// static/js/install-button.js - Smart Install Button for Superkeeper
(function() {
    'use strict';
    
    // ====================================================
    // CONFIGURATION
    // ====================================================
    const CONFIG = {
        BUTTON_DELAY: 5000,        // Show after 5 seconds
        REMINDER_DAYS: 3,           // Wait 3 days before showing again
        MAX_PROMPTS: 3,              // Max 3 prompts ever
        BUTTON_LIFETIME: 30000,      // Button stays for 30 seconds then hides
        STORAGE_KEYS: {
            INSTALLED: 'sk_app_installed',
            PROMPT_COUNT: 'sk_install_prompt_count',
            LAST_PROMPT: 'sk_last_install_prompt',
            NEVER_SHOW: 'sk_never_show_install'
        }
    };

    // ====================================================
    // HELPER FUNCTIONS
    // ====================================================
    
    /**
     * Check if app is already installed
     */
    function isAppInstalled() {
        return window.matchMedia('(display-mode: standalone)').matches ||
               window.navigator.standalone === true ||
               localStorage.getItem(CONFIG.STORAGE_KEYS.INSTALLED) === 'true';
    }

    /**
     * Check if we should show the button
     */
    function shouldShowButton() {
        // Don't show if already installed
        if (isAppInstalled()) {
            console.log('📱 App already installed - hiding button');
            return false;
        }

        // Don't show if user said never
        if (localStorage.getItem(CONFIG.STORAGE_KEYS.NEVER_SHOW) === 'true') {
            return false;
        }

        // Check prompt count
        const promptCount = parseInt(localStorage.getItem(CONFIG.STORAGE_KEYS.PROMPT_COUNT) || '0');
        if (promptCount >= CONFIG.MAX_PROMPTS) {
            console.log('📱 Max prompts reached - hiding button');
            return false;
        }

        // Check last prompt time
        const lastPrompt = localStorage.getItem(CONFIG.STORAGE_KEYS.LAST_PROMPT);
        if (lastPrompt) {
            const daysSince = (Date.now() - parseInt(lastPrompt)) / (1000 * 60 * 60 * 24);
            if (daysSince < CONFIG.REMINDER_DAYS) {
                console.log(`📱 Last prompt was ${daysSince.toFixed(1)} days ago - waiting`);
                return false;
            }
        }

        // Check if we're on iOS and it's not supported
        const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
        if (isIOS && !window.navigator.standalone) {
            // iOS supports installation via Safari
            return true;
        }

        // Check if browser supports PWA install
        if (!window.deferredPrompt && !isIOS) {
            console.log('📱 Browser does not support installation');
            return false;
        }

        return true;
    }

    /**
     * Track prompt shown
     */
    function trackPromptShown() {
        const count = parseInt(localStorage.getItem(CONFIG.STORAGE_KEYS.PROMPT_COUNT) || '0');
        localStorage.setItem(CONFIG.STORAGE_KEYS.PROMPT_COUNT, (count + 1).toString());
        localStorage.setItem(CONFIG.STORAGE_KEYS.LAST_PROMPT, Date.now().toString());
    }

    /**
     * Show iOS installation instructions
     */
    function showIOSInstructions() {
        const modal = document.createElement('div');
        modal.id = 'ios-install-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.8);
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
                border-radius: 24px;
                padding: 30px 20px;
                max-width: 320px;
                text-align: center;
                box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                animation: slideUp 0.3s ease;
            ">
                <div style="
                    background: linear-gradient(135deg, #667eea, #764ba2);
                    width: 70px;
                    height: 70px;
                    border-radius: 35px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 0 auto 20px;
                    font-size: 30px;
                    color: white;
                ">📱</div>
                
                <h3 style="
                    margin: 0 0 10px;
                    color: #1e293b;
                    font-size: 20px;
                    font-weight: 700;
                ">Install Superkeeper</h3>
                
                <p style="
                    color: #64748b;
                    font-size: 14px;
                    margin-bottom: 25px;
                    line-height: 1.6;
                ">Get the best experience with our app</p>
                
                <div style="
                    background: #f8fafc;
                    border-radius: 16px;
                    padding: 20px;
                    margin-bottom: 25px;
                    text-align: left;
                ">
                    <div style="display: flex; gap: 15px; margin-bottom: 15px;">
                        <div style="
                            background: #667eea;
                            color: white;
                            width: 24px;
                            height: 24px;
                            border-radius: 12px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            font-size: 14px;
                            font-weight: bold;
                            flex-shrink: 0;
                        ">1</div>
                        <div style="color: #334155;">
                            Tap <span style="
                                background: white;
                                padding: 4px 10px;
                                border-radius: 20px;
                                font-size: 13px;
                                box-shadow: 0 2px 4px rgba(0,0,0,0.05);
                            ">Share</span> button
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 15px; margin-bottom: 15px;">
                        <div style="
                            background: #667eea;
                            color: white;
                            width: 24px;
                            height: 24px;
                            border-radius: 12px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            font-size: 14px;
                            font-weight: bold;
                            flex-shrink: 0;
                        ">2</div>
                        <div style="color: #334155;">
                            Scroll down and tap <strong>"Add to Home Screen"</strong>
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 15px;">
                        <div style="
                            background: #667eea;
                            color: white;
                            width: 24px;
                            height: 24px;
                            border-radius: 12px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            font-size: 14px;
                            font-weight: bold;
                            flex-shrink: 0;
                        ">3</div>
                        <div style="color: #334155;">
                            Tap <strong>"Add"</strong> in top right corner
                        </div>
                    </div>
                </div>
                
                <div style="display: flex; gap: 10px;">
                    <button id="ios-got-it" style="
                        flex: 2;
                        background: linear-gradient(135deg, #667eea, #764ba2);
                        color: white;
                        border: none;
                        padding: 14px;
                        border-radius: 30px;
                        font-weight: 600;
                        font-size: 15px;
                        cursor: pointer;
                        border: none;
                    ">Got it ✓</button>
                    
                    <button id="ios-close" style="
                        flex: 1;
                        background: #f1f5f9;
                        color: #64748b;
                        border: none;
                        padding: 14px;
                        border-radius: 30px;
                        font-weight: 600;
                        font-size: 15px;
                        cursor: pointer;
                    ">Close</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        document.getElementById('ios-got-it').onclick = () => {
            modal.remove();
            trackPromptShown();
        };

        document.getElementById('ios-close').onclick = () => {
            modal.remove();
            trackPromptShown();
        };

        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };
    }

    /**
     * Create and show the install button
     */
    function createInstallButton() {
        // Double-check if we should show
        if (!shouldShowButton()) return;

        // Create button element
        const btn = document.createElement('button');
        btn.id = 'sk-install-button';
        
        // Style the button
        btn.style.cssText = `
            position: fixed;
            bottom: 30px;
            right: 20px;
            background: white;
            border: none;
            border-radius: 60px;
            padding: 16px 24px;
            box-shadow: 0 10px 40px rgba(102, 126, 234, 0.3);
            cursor: pointer;
            z-index: 999999;
            display: flex;
            align-items: center;
            gap: 15px;
            border: 2px solid #667eea;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            max-width: 360px;
            animation: skSlideIn 0.5s ease, skPulse 2s infinite 1s;
        `;

        // Button content
        btn.innerHTML = `
            <div style="
                background: linear-gradient(135deg, #667eea, #764ba2);
                width: 48px;
                height: 48px;
                border-radius: 30px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 24px;
                color: white;
                box-shadow: 0 4px 10px rgba(102, 126, 234, 0.3);
            ">📱</div>
            
            <div style="text-align: left; flex: 1;">
                <div style="
                    font-weight: 700;
                    color: #1e293b;
                    font-size: 16px;
                    margin-bottom: 4px;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                ">
                    Install Superkeeper App
                    <span style="
                        background: #10b981;
                        color: white;
                        font-size: 10px;
                        padding: 2px 8px;
                        border-radius: 12px;
                        font-weight: 600;
                    ">FREE</span>
                </div>
                <div style="
                    color: #64748b;
                    font-size: 12px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                ">
                    <span>⚡ Instant access</span>
                    <span>•</span>
                    <span>📴 Works offline</span>
                    <span>•</span>
                    <span>🔒 Secure</span>
                </div>
            </div>
            
            <div style="
                background: #f1f5f9;
                width: 32px;
                height: 32px;
                border-radius: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #667eea;
                font-size: 18px;
                font-weight: bold;
            ">→</div>
        `;

        // Add hover effects
        btn.onmouseenter = () => {
            btn.style.transform = 'translateY(-5px) scale(1.02)';
            btn.style.boxShadow = '0 20px 50px rgba(102, 126, 234, 0.4)';
        };
        
        btn.onmouseleave = () => {
            btn.style.transform = 'translateY(0) scale(1)';
            btn.style.boxShadow = '0 10px 40px rgba(102, 126, 234, 0.3)';
        };

        // Handle click
        btn.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            btn.style.opacity = '0.7';
            btn.style.pointerEvents = 'none';
            btn.innerHTML = '<div style="padding: 15px; text-align: center;">⏳ Preparing installation...</div>';

            // Check if it's iOS
            const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
            
            if (isIOS) {
                btn.remove();
                showIOSInstructions();
                trackPromptShown();
                return;
            }

            // For Android/Chrome
            if (window.deferredPrompt) {
                try {
                    window.deferredPrompt.prompt();
                    const { outcome } = await window.deferredPrompt.userChoice;
                    
                    if (outcome === 'accepted') {
                        btn.innerHTML = '<div style="padding: 15px; text-align: center;">✅ Installed! ✓</div>';
                        localStorage.setItem(CONFIG.STORAGE_KEYS.INSTALLED, 'true');
                        setTimeout(() => btn.remove(), 2000);
                    } else {
                        btn.remove();
                    }
                    
                    window.deferredPrompt = null;
                    trackPromptShown();
                    
                } catch (error) {
                    console.error('Install error:', error);
                    btn.remove();
                }
            } else {
                btn.remove();
                alert('To install: Use Chrome menu "Add to Home screen"');
            }
        };

        // Add to page
        document.body.appendChild(btn);

        // Auto-hide after configured time
        setTimeout(() => {
            if (document.body.contains(btn)) {
                btn.style.animation = 'skSlideOut 0.3s ease';
                setTimeout(() => btn.remove(), 300);
            }
        }, CONFIG.BUTTON_LIFETIME);

        // Track that we showed it
        trackPromptShown();
    }

    // ====================================================
    // ADD ANIMATION STYLES
    // ====================================================
    function addStyles() {
        if (document.getElementById('sk-install-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'sk-install-styles';
        style.textContent = `
            @keyframes skSlideIn {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            
            @keyframes skSlideOut {
                from {
                    transform: translateX(0);
                    opacity: 1;
                }
                to {
                    transform: translateX(100%);
                    opacity: 0;
                }
            }
            
            @keyframes skPulse {
                0%, 100% {
                    box-shadow: 0 10px 40px rgba(102, 126, 234, 0.3);
                }
                50% {
                    box-shadow: 0 15px 50px rgba(102, 126, 234, 0.5);
                }
            }
            
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            
            @keyframes slideUp {
                from {
                    transform: translateY(20px);
                    opacity: 0;
                }
                to {
                    transform: translateY(0);
                    opacity: 1;
                }
            }
            
            #sk-install-button {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            }
            
            #sk-install-button:hover {
                cursor: pointer;
            }
            
            /* Mobile optimization */
            @media (max-width: 480px) {
                #sk-install-button {
                    bottom: 20px;
                    right: 15px;
                    left: 15px;
                    max-width: none;
                    padding: 14px 20px;
                }
                
                #sk-install-button > div:first-child {
                    width: 40px;
                    height: 40px;
                    font-size: 20px;
                }
            }
        `;
        
        document.head.appendChild(style);
    }

    // ====================================================
    // INITIALIZATION
    // ====================================================
    function init() {
        console.log('📱 Superkeeper Install Button Initializing...');
        
        // Add styles
        addStyles();
        
        // Listen for install prompt
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            window.deferredPrompt = e;
            console.log('📱 Install prompt available');
            
            // Show button after delay
            setTimeout(() => {
                if (shouldShowButton()) {
                    createInstallButton();
                }
            }, CONFIG.BUTTON_DELAY);
        });

        // If already installed, mark it
        if (isAppInstalled()) {
            localStorage.setItem(CONFIG.STORAGE_KEYS.INSTALLED, 'true');
        }

        // For iOS, we can still show the button
        const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
        if (isIOS && !window.navigator.standalone && shouldShowButton()) {
            setTimeout(() => {
                createInstallButton();
            }, CONFIG.BUTTON_DELAY);
        }

        console.log('📱 Install Button Ready');
    }

    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();