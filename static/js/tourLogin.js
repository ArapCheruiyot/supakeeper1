// tourLogin.js - One-click demo login for Superkeeper
// BULLETPROOF: Waits for auth persistence, verifies session, multiple fallbacks
console.log("🎟️ Tour Login module loaded");

const DEMO_ACCOUNT = {
    email: "superkeeper35@gmail.com",
    password: "SUPAKIPA@123"
};

// FIXED SHOP ID - The actual shop ID in your Firestore
const DEMO_SHOP_ID = "yZPZIBNq9Qgrb8MI1f7aSvMSuwP2";
const DEMO_SHOP_NAME = "Superkeeper Demo Shop";

export async function handleDemoLogin() {
    console.log("🔐 Starting demo login...");
    
    try {
        const { getAuth, signInWithEmailAndPassword } = await import("https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js");
        
        const auth = getAuth();
        
        console.log("📧 Attempting login with:", DEMO_ACCOUNT.email);
        
        // Clear any existing session flags FIRST
        localStorage.clear(); // Start fresh - no stale data
        
        const userCredential = await signInWithEmailAndPassword(
            auth, 
            DEMO_ACCOUNT.email, 
            DEMO_ACCOUNT.password
        );
        
        const user = userCredential.user;
        console.log("✅ Demo login successful:", user.email);
        
        // Set session flags
        localStorage.setItem("isDemoMode", "true");
        localStorage.setItem("activeShopId", DEMO_SHOP_ID);
        localStorage.setItem("activeShopName", DEMO_SHOP_NAME);
        localStorage.setItem("freshDemoLogin", "true");
        localStorage.setItem("demoLoginTime", Date.now().toString());
        localStorage.setItem("sessionType", "owner"); // Explicitly set session type
        
        console.log("🎉 Demo setup complete. Verifying auth before redirect...");
        
        // ===== CRITICAL: Wait for auth to be fully ready =====
        // This function checks every 100ms until auth is confirmed
        const waitForAuth = () => {
            return new Promise((resolve) => {
                let attempts = 0;
                const maxAttempts = 30; // 3 seconds total
                
                const checkAuth = setInterval(() => {
                    attempts++;
                    
                    // Check if user is still authenticated
                    const currentUser = auth.currentUser;
                    
                    if (currentUser) {
                        console.log(`✅ Auth verified after ${attempts * 100}ms`);
                        clearInterval(checkAuth);
                        resolve(true);
                    } else if (attempts >= maxAttempts) {
                        console.log("⚠️ Auth not verified after max attempts, but proceeding anyway");
                        clearInterval(checkAuth);
                        resolve(false);
                    } else {
                        console.log(`⏳ Waiting for auth to persist... attempt ${attempts}/${maxAttempts}`);
                    }
                }, 100);
            });
        };
        
        // Wait for auth to be confirmed
        const authVerified = await waitForAuth();
        
        // Double-check localStorage is set
        const verifyStorage = () => {
            const checks = {
                activeShopId: localStorage.getItem("activeShopId") === DEMO_SHOP_ID,
                isDemoMode: localStorage.getItem("isDemoMode") === "true",
                freshDemoLogin: localStorage.getItem("freshDemoLogin") === "true"
            };
            
            console.log("📦 Storage verification:", checks);
            return Object.values(checks).every(v => v === true);
        };
        
        const storageVerified = verifyStorage();
        
        if (!storageVerified) {
            console.log("⚠️ Storage verification failed, resetting flags");
            localStorage.setItem("activeShopId", DEMO_SHOP_ID);
            localStorage.setItem("isDemoMode", "true");
            localStorage.setItem("freshDemoLogin", "true");
        }
        
        console.log("🚀 Redirecting to dashboard...");
        
        // Final redirect with a slightly longer delay if auth wasn't verified
        const redirectDelay = authVerified ? 200 : 500;
        
        setTimeout(() => {
            window.location.href = "/dashboard";
        }, redirectDelay);
        
    } catch (error) {
        console.error("❌ Demo login failed:", error);
        
        let errorMessage = "Demo login failed. ";
        if (error.code === 'auth/invalid-login-credentials') {
            errorMessage += "Invalid credentials. Please contact support.";
        } else {
            errorMessage += error.message;
        }
        
        alert(errorMessage);
        throw error;
    }
}