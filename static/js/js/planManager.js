{% extends "base.html" %}

{% block content %}
<!-- COMPACT HOMEPAGE - EVERYTHING FITS ON SCREEN -->
<div class="compact-homepage">
    
    <!-- THIN BORDER CONTAINER -->
    <div class="compact-container">
        
        <!-- Header with Top-Right Buttons -->
        <div class="compact-header">
            <div class="header-buttons">
                <button class="btn-start" id="google-signin-btn">
                    Start Free
                </button>
            </div>
        </div>
        
        <!-- Compact Navigation -->
        <div class="compact-nav">
            <nav>
                <a href="/features">Features</a>
                <a href="/story">Our Story</a>
                <a href="/pricing">Pricing</a>
                <a href="/testimonials">Success Stories</a>
            </nav>
        </div>
        
        <!-- Main Content - Fits perfectly -->
        <div class="compact-content">
            <!-- Logo on left -->
            <div class="compact-logo">
                <div class="logo-pulse" id="logoPulse">
                    <!-- Logo will be set by JavaScript animation -->
                </div>
            </div>
            
            <!-- Content on right -->
            <div class="compact-text">
                <h1>Superkeeper</h1>
                <p class="tagline">Inventory for small shops</p>
                
                <div class="benefit">
                    <span>✓</span> Track stock on phone
                </div>
                <div class="benefit">
                    <span>✓</span> Manage staff easily
                </div>
                <div class="benefit">
                    <span>✓</span> See sales in real-time
                </div>
                
                <!-- 🔥 HIGHLY VISIBLE TOUR SECTION - YOU CAN'T MISS THIS 🔥 -->
                <div style="
                    margin: 25px 0 20px 0;
                    padding: 20px;
                    background: #ffd966;
                    border: 4px solid #dc2626;
                    border-radius: 16px;
                    text-align: center;
                    box-shadow: 0 10px 25px rgba(220,38,38,0.3);
                ">
                    <p style="
                        font-size: 1.3rem;
                        font-weight: 800;
                        color: #991b1b;
                        margin: 0 0 8px 0;
                        text-transform: uppercase;
                        letter-spacing: 1px;
                    ">
                        🔍 👆 TRY BEFORE YOU SIGN UP! 👆 🔍
                    </p>
                    <p style="
                        font-size: 1.1rem;
                        color: #1e293b;
                        margin: 0 0 15px 0;
                        font-weight: 600;
                    ">
                        Click below to explore our demo shop instantly
                    </p>
                    <button id="tour-demo-btn" style="
                        background: #dc2626;
                        color: white;
                        border: none;
                        padding: 15px 35px;
                        border-radius: 50px;
                        font-size: 18px;
                        font-weight: 700;
                        cursor: pointer;
                        box-shadow: 0 8px 20px rgba(220,38,38,0.5);
                        transition: all 0.3s;
                        width: 100%;
                        max-width: 300px;
                        border: 2px solid white;
                    ">
                        🚀 TAKE A FREE TOUR 🚀
                    </button>
                    <p style="
                        font-size: 0.9rem;
                        color: #374151;
                        margin-top: 12px;
                        font-weight: 500;
                    ">
                        ⚡ No signup • No credit card • Instant access ⚡
                    </p>
                </div>
                
                <!-- Main CTA Button (same as header) -->
                <button class="btn-main-cta" id="google-signin-btn-mobile">
                    Start Free Forever
                </button>
                
                <p class="note">No credit card • Setup in 5 minutes</p>
            </div>
        </div>
    </div>
</div>

<!-- 🚧 CONSTRUCTION FOOTER - BLACK & YELLOW STRIPES 🚧 -->
<div style="
    background: repeating-linear-gradient(
        45deg,
        #000000,
        #000000 25px,
        #ffd700 25px,
        #ffd700 50px
    );
    padding: 25px 15px;
    text-align: center;
    margin-top: 30px;
    border-top: 3px solid #000;
">
    <div style="
        background: rgba(0,0,0,0.9);
        color: white;
        padding: 15px 30px;
        border-radius: 60px;
        display: inline-block;
        font-weight: 700;
        font-size: 18px;
        border: 3px solid #ffd700;
        box-shadow: 0 5px 20px rgba(0,0,0,0.5);
    ">
        🚧 WEBSITE UNDER CONSTRUCTION - ACTIVELY BUILDING! 🏗️
    </div>
    <p style="color: white; margin-top: 15px; font-weight: 600; text-shadow: 2px 2px 2px black;">
        More features coming soon • Stay tuned!
    </p>
</div>

<!-- Staff Login Button (hidden by default, shown by staffLogin.js) -->
<div id="staff-login-container" style="display: none;"></div>
{% endblock %}

{% block scripts %}
<!-- DEBUG SCRIPT - Helps identify issues -->
<script>
document.addEventListener("DOMContentLoaded", function() {
    console.log("🔍 DEBUG: Homepage loaded");
    
    // Check if button exists
    const button = document.getElementById("google-signin-btn");
    console.log("✅ Button exists:", !!button);
    console.log("📝 Button details:", button);
    
    if (button) {
        button.addEventListener("click", function() {
            console.log("🟢 DEBUG: Button clicked - basic click works!");
        });
    }

    // Handle Tour Button Click
    const tourBtn = document.getElementById('tour-demo-btn');
    if (tourBtn) {
        tourBtn.addEventListener('click', function() {
            console.log("🔍 Tour button clicked");
            alert("🎉 Demo tour loading! You'll be able to explore Superkeeper in seconds.");
            // You can implement your demo login logic here
            // window.location.href = '/demo-login';
        });
        
        // Hover effects
        tourBtn.onmouseenter = function() {
            this.style.transform = 'scale(1.05)';
            this.style.boxShadow = '0 12px 25px rgba(220,38,38,0.6)';
        };
        tourBtn.onmouseleave = function() {
            this.style.transform = 'scale(1)';
            this.style.boxShadow = '0 8px 20px rgba(220,38,38,0.5)';
        };
    }
});
</script>

<!-- Import your login.js file -->
<script type="module" src="{{ url_for('static', filename='js/login.js') }}"></script>
<script type="module" src="{{ url_for('static', filename='js/staffLogin.js') }}"></script>

<!-- Your existing JavaScript with fixes -->
<script>
// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log("🎨 Setting up animations...");
    
    // Fix logo animation - check if element exists first
    let logo = document.getElementById('logoPulse');
    
    if (logo) {
        console.log("✅ Logo element found, starting animation");
        let beatCount = 0;
        const logos = ['📱', '📦', '💰', '👥', '📊', '✓', '🚀', 'SK'];

        setInterval(() => {
            logo.textContent = logos[beatCount % logos.length];
            logo.style.transform = 'scale(1.05)';
            setTimeout(() => logo.style.transform = 'scale(1)', 100);
            beatCount++;
        }, 857);
    } else {
        console.warn("⚠️ Logo element not found for animation");
    }

    // Make mobile button also trigger Google login
    const mobileBtn = document.getElementById('google-signin-btn-mobile');
    if (mobileBtn) {
        console.log("✅ Mobile button found");
        mobileBtn.addEventListener('click', function() {
            console.log("📱 Mobile button clicked");
            // Trigger the Google button click
            const googleBtn = document.getElementById('google-signin-btn');
            if (googleBtn) {
                console.log("🔄 Triggering Google button click");
                googleBtn.click();
            }
        });
        
        // Add hover effects
        mobileBtn.onmouseenter = function() {
            this.style.transform = 'translateY(-2px)';
            this.style.boxShadow = '0 6px 15px rgba(37, 99, 235, 0.3)';
        };
        mobileBtn.onmouseleave = function() {
            this.style.transform = 'translateY(0)';
            this.style.boxShadow = '0 4px 12px rgba(37, 99, 235, 0.2)';
        };
    } else {
        console.warn("⚠️ Mobile button not found");
    }
    
    console.log("🎯 Homepage setup complete");
});
</script>

<style>
/* COMPACT HOMEPAGE - FITS ON SCREEN */
.compact-homepage {
    min-height: calc(100vh - 120px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4rem 1rem 1rem;
    background: white;
    overflow-y: auto;
}

/* Compact container */
.compact-container {
    width: 100%;
    max-width: 1000px;
    border: 1px solid #e2e8f0;
    border-radius: 0.5rem;
    padding: 1.5rem;
    background: white;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

/* COMPACT HEADER - Single Button on Right */
.compact-header {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid #f1f5f9;
}

.header-buttons {
    display: flex;
    align-items: center;
}

.btn-start {
    background: #3b82f6;
    color: white;
    border: none;
    padding: 0.6rem 1.2rem;
    font-size: 0.9rem;
    border-radius: 0.5rem;
    cursor: pointer;
    font-weight: 600;
    transition: all 0.2s;
}

.btn-start:hover {
    background: #2563eb;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2);
}

/* Compact navigation */
.compact-nav {
    display: flex;
    justify-content: center;
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid #f1f5f9;
}

.compact-nav nav {
    display: flex;
    gap: 1.5rem;
    flex-wrap: wrap;
    justify-content: center;
}

.compact-nav a {
    text-decoration: none;
    color: #475569;
    font-size: 0.85rem;
    font-weight: 500;
    padding: 0.25rem 0;
    transition: color 0.2s;
}

.compact-nav a:hover {
    color: #3b82f6;
}

/* Compact content layout */
.compact-content {
    display: flex;
    align-items: center;
    gap: 3rem;
    padding: 0.5rem;
}

/* Compact logo */
.compact-logo {
    flex: 1;
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 200px;
}

.logo-pulse {
    font-size: 6rem;
    font-weight: 800;
    color: #3b82f6;
    transition: transform 0.2s;
    animation: gentle-pulse 1.5s infinite;
    text-align: center;
}

@keyframes gentle-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.9; }
}

/* Compact text */
.compact-text {
    flex: 1;
    max-width: 450px;
}

.compact-text h1 {
    font-size: 2.5rem;
    margin: 0 0 0.5rem 0;
    color: #1e293b;
    line-height: 1.1;
}

.compact-text .tagline {
    font-size: 1rem;
    color: #64748b;
    margin-bottom: 1.5rem;
    line-height: 1.5;
}

.compact-text .benefit {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
    font-size: 1rem;
    color: #475569;
}

.compact-text .benefit span {
    color: #10b981;
    font-weight: bold;
}

/* Main CTA Button */
.btn-main-cta {
    background: #3b82f6;
    color: white;
    border: none;
    padding: 0.85rem 2rem;
    font-size: 1.1rem;
    border-radius: 0.5rem;
    margin: 1.5rem 0 0.75rem 0;
    cursor: pointer;
    width: 100%;
    font-weight: 600;
    transition: all 0.2s;
}

.btn-main-cta:hover {
    background: #2563eb;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2);
}

.compact-text .note {
    font-size: 0.75rem;
    color: #94a3b8;
    text-align: center;
    margin: 0.5rem 0;
}

/* Responsive - ensure it fits */
@media (max-width: 768px) {
    .compact-homepage {
        min-height: calc(100vh - 100px);
        padding: 5rem 0.5rem 0.5rem;
    }
    
    .compact-container {
        border: none;
        padding: 1rem;
        box-shadow: none;
        max-width: 100%;
    }
    
    .compact-content {
        flex-direction: column;
        gap: 1.5rem;
        text-align: center;
    }
    
    .compact-logo {
        min-height: 150px;
    }
    
    .logo-pulse {
        font-size: 4rem;
    }
    
    .compact-nav nav {
        gap: 1rem;
        flex-wrap: wrap;
        justify-content: center;
    }
    
    .compact-nav a {
        font-size: 0.8rem;
    }
    
    .compact-text h1 {
        font-size: 2rem;
    }
    
    /* Center header button on mobile */
    .compact-header {
        justify-content: center;
    }
    
    .header-buttons {
        width: 100%;
    }
    
    .btn-start {
        width: 100%;
        max-width: 300px;
        padding: 0.75rem;
        font-size: 1rem;
    }
    
    /* Mobile adjustments for tour section */
    .tour-section button {
        width: 100%;
    }
}
</style>

<!-- Staff Login Button Styles -->
<style>
#staff-signin-btn {
    margin-top: 15px;
    padding: 12px 24px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 16px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.3s ease;
    box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
    width: 100%;
    max-width: 300px;
}

#staff-signin-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
}
</style>
{% endblock %}