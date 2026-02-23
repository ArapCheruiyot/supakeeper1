// tourLogin.js - One-click demo login for Superkeeper (Mobile Optimized)
console.log("🎟️ Tour Login module loaded");

// Demo account credentials
const DEMO_ACCOUNT = {
    email: "superkeeper35@gmail.com",
    password: "SUPAKIPA@123"
};

// Demo shop settings
const DEMO_SHOP = {
    name: "Superkeeper Demo Shop",
    plan: "BASIC",
    isDemo: true
};

// Helper to detect mobile device
function isMobileDevice() {
    return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth <= 768;
}

// Helper to ensure storage access (important for iOS)
async function ensureStorageAccess() {
    try {
        // Test localStorage access
        localStorage.setItem('test_storage', 'test');
        localStorage.removeItem('test_storage');
        console.log('✅ Storage access granted');
        return true;
    } catch (e) {
        console.log('⚠️ Storage access blocked:', e);
        return false;
    }
}

// Helper to show mobile-friendly messages
function showMobileMessage(message, isError = false) {
    // Create a floating message for mobile
    const msgDiv = document.createElement('div');
    msgDiv.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: ${isError ? '#ff4444' : '#333'};
        color: white;
        padding: 15px 20px;
        border-radius: 10px;
        font-size: 16px;
        z-index: 10000;
        text-align: center;
        box-shadow: 0 4px 15px rgba(0,0,0,0.3);
        max-width: 80%;
        word-wrap: break-word;
    `;
    msgDiv.textContent = message;
    document.body.appendChild(msgDiv);
    
    // Auto remove after 3 seconds
    setTimeout(() => msgDiv.remove(), 3000);
}

export async function handleDemoLogin() {
    console.log("🔐 Starting demo login...");
    
    const isMobile = isMobileDevice();
    console.log(`📱 Device: ${isMobile ? 'Mobile' : 'Desktop'}`);
    
    // Show loading indicator for mobile
    if (isMobile) {
        showMobileMessage("🔄 Logging in to demo...");
    }
    
    try {
        // Import Firebase modules
        const { getAuth, signInWithEmailAndPassword, signOut } = await import("https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js");
        const { doc, getDoc, setDoc } = await import("https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js");
        const { db } = await import("./firebase-config.js");
        
        const auth = getAuth();
        
        // Ensure storage access (critical for mobile)
        await ensureStorageAccess();
        
        // Set a flag before login
        sessionStorage.setItem("demo_login_in_progress", "true");
        
        // Clear any existing session first
        try {
            await signOut(auth);
            console.log("✅ Signed out existing user");
        } catch (e) {
            // Ignore signout errors
        }
        
        console.log("📧 Attempting login with:", DEMO_ACCOUNT.email);
        
        // Add a small delay for mobile to ensure clean state
        if (isMobile) {
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        
        // Try to sign in
        const userCredential = await signInWithEmailAndPassword(
            auth, 
            DEMO_ACCOUNT.email, 
            DEMO_ACCOUNT.password
        );
        
        const user = userCredential.user;
        console.log("✅ Demo login successful:", user.email);
        console.log("🆔 User UID:", user.uid);
        
        // Verify auth state is stable
        if (!auth.currentUser) {
            throw new Error("Auth state lost immediately after login");
        }
        
        // Check if user has a shop document
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);
        
        let shopId;
        
        if (!userDoc.exists()) {
            console.log("📝 Creating demo user document...");
            await setDoc(userDocRef, {
                email: user.email,
                displayName: "Demo User",
                role: "owner",
                createdAt: new Date(),
                isDemo: true
            });
            
            // Create demo shop
            shopId = "demo-shop-" + Date.now();
            const shopDocRef = doc(db, "Shops", shopId);
            await setDoc(shopDocRef, {
                shopName: DEMO_SHOP.name,
                ownerId: user.uid,
                plan: DEMO_SHOP.plan,
                isDemo: true,
                createdAt: new Date()
            });
            
            // Update user with shop ID
            await setDoc(userDocRef, { shopId: shopId }, { merge: true });
        } else {
            // User exists, check if they have a shop
            const userData = userDoc.data();
            if (userData.shopId) {
                shopId = userData.shopId;
            } else {
                // Create new shop for existing user
                shopId = "demo-shop-" + Date.now();
                const shopDocRef = doc(db, "Shops", shopId);
                await setDoc(shopDocRef, {
                    shopName: DEMO_SHOP.name,
                    ownerId: user.uid,
                    plan: DEMO_SHOP.plan,
                    isDemo: true,
                    createdAt: new Date()
                });
                await setDoc(userDocRef, { shopId: shopId }, { merge: true });
            }
        }
        
        // Set demo session
        try {
            localStorage.setItem("isDemoMode", "true");
            localStorage.setItem("activeShopId", shopId);
            localStorage.setItem("activeShopName", DEMO_SHOP.name);
            sessionStorage.setItem("demo_login_complete", "true");
            console.log("✅ Session data saved");
        } catch (e) {
            console.warn("⚠️ Could not save to localStorage:", e);
        }
        
        // Clear in-progress flag
        sessionStorage.removeItem("demo_login_in_progress");
        
        console.log("🎉 Demo setup complete! Redirecting...");
        
        // Mobile-optimized redirect
        if (isMobile) {
            // For mobile, use replace and add a delay
            showMobileMessage("✅ Login successful! Loading dashboard...");
            
            // Small delay to ensure everything is saved
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Double-check auth state one last time
            if (auth.currentUser) {
                window.location.replace("/dashboard");
            } else {
                console.error("❌ Auth state lost before redirect");
                window.location.replace("/dashboard?retry=true");
            }
        } else {
            // Desktop - normal redirect
            window.location.href = "/dashboard";
        }
        
    } catch (error) {
        console.error("❌ Demo login failed:", error);
        
        // Clear in-progress flag
        sessionStorage.removeItem("demo_login_in_progress");
        
        // Mobile-specific error handling
        if (isMobileDevice()) {
            let mobileMessage = "Demo login failed. ";
            
            if (error.code === 'auth/network-request-failed') {
                mobileMessage = "📶 Network error. Please check your connection.";
            } else if (error.code === 'auth/too-many-requests') {
                mobileMessage = "⏰ Too many attempts. Please try again later.";
            } else if (error.message.includes('popup')) {
                mobileMessage = "🔄 Please try again. If problem persists, use desktop.";
            } else {
                mobileMessage = "❌ Login failed. Please try again.";
            }
            
            showMobileMessage(mobileMessage, true);
            
            // Try one more time with redirect approach?
            if (error.code === 'auth/invalid-login-credentials') {
                console.log("⚠️ Attempting one more redirect-based login...");
                setTimeout(() => {
                    window.location.reload();
                }, 2000);
            }
        } else {
            // Desktop error handling
            let errorMessage = "Demo login failed. ";
            
            switch (error.code) {
                case 'auth/operation-not-allowed':
                    errorMessage = "Email/Password login is not enabled.";
                    break;
                case 'auth/user-not-found':
                    errorMessage += "Demo account not set up.";
                    break;
                case 'auth/wrong-password':
                    errorMessage += "Demo account password incorrect.";
                    break;
                case 'auth/too-many-requests':
                    errorMessage += "Too many attempts. Please try again later.";
                    break;
                default:
                    errorMessage += "Please try again.";
            }
            
            alert(errorMessage);
        }
        
        throw error;
    }
}

// Auto-attach to button if it exists
document.addEventListener("DOMContentLoaded", () => {
    const tourBtn = document.getElementById('tour-demo-btn');
    if (tourBtn) {
        // Remove any existing handlers
        tourBtn.removeEventListener('click', handleDemoLogin);
        // Add our handler
        tourBtn.addEventListener('click', handleDemoLogin);
        console.log("✅ Tour button handler attached");
    }
});
