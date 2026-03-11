// tourLogin.js - One-click demo login for Superkeeper
console.log("🎟️ Tour Login module loaded");

// Demo account credentials - USING YOUR ACTUAL DEMO ACCOUNT
const DEMO_ACCOUNT = {
    email: "superkeeper35@gmail.com",
    password: "SUPAKIPA@123"
};

// Demo shop settings - USE THE SAME SHOP FOR ALL DEMO USERS
const DEMO_SHOP = {
    name: "Superkeeper Demo Shop",
    id: "demo-shop-supakeeper",  // ← FIXED ID for all demo users
    plan: "BASIC",
    isDemo: true
};

export async function handleDemoLogin() {
    console.log("🔐 Starting demo login...");
    
    try {
        const { getAuth, signInWithEmailAndPassword } = await import("https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js");
        const { doc, getDoc, setDoc } = await import("https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js");
        const { db } = await import("./firebase-config.js");
        
        const auth = getAuth();
        
        console.log("📧 Attempting login with:", DEMO_ACCOUNT.email);
        
        // Clear any existing session first
        await import("https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js").then(({ signOut }) => {
            return signOut(auth).catch(() => {});
        });
        
        // Try to sign in
        const userCredential = await signInWithEmailAndPassword(
            auth, 
            DEMO_ACCOUNT.email, 
            DEMO_ACCOUNT.password
        );
        
        const user = userCredential.user;
        console.log("✅ Demo login successful:", user.email);
        
        // ========== IMPORTANT CHANGE: Use FIXED shop ID ==========
        const shopId = DEMO_SHOP.id;  // ← USE THE SAME SHOP FOR EVERYONE!
        
        // Check if shop exists (it should, since it's the main demo shop)
        const shopDocRef = doc(db, "Shops", shopId);
        const shopDoc = await getDoc(shopDocRef);
        
        if (!shopDoc.exists()) {
            console.log("⚠️ Main demo shop not found! Creating...");
            // Create main demo shop only if it doesn't exist
            await setDoc(shopDocRef, {
                shopName: DEMO_SHOP.name,
                ownerId: user.uid,
                plan: DEMO_SHOP.plan,
                isDemo: true,
                createdAt: new Date(),
                isMainDemo: true
            });
        } else {
            console.log("✅ Using existing main demo shop");
        }
        
        // ========== END OF CHANGE ==========
        
        // Set demo session
        localStorage.setItem("isDemoMode", "true");
        localStorage.setItem("activeShopId", shopId);
        localStorage.setItem("activeShopName", DEMO_SHOP.name);
        
        // ========== UPDATED: Clear any old flags first ==========
        console.log("🎉 Demo setup complete! Setting flags for dashboard...");
        
        // Clear any existing flags to avoid conflicts
        localStorage.removeItem("freshDemoLogin");
        
        // Set flag for dashboard to show loading state
        localStorage.setItem("freshDemoLogin", "true");
        
        // Also set a timestamp to track when login happened
        localStorage.setItem("demoLoginTime", Date.now().toString());
        
        console.log("⏱️ Demo login timestamp set");
        
        // Show loading message to user
        alert("🎮 Setting up your demo experience... This will take 10-15 seconds first time only!");
        
        // Small delay to let Firebase finish writing
        setTimeout(() => {
            console.log("➡️ Redirecting to dashboard...");
            window.location.href = "/dashboard";
        }, 2000); // 2 second delay
        
        // ========== END OF UPDATED SECTION ==========
        
    } catch (error) {
        console.error("❌ Demo login failed:", error);
        
        // Special handling - if we get invalid-login-credentials but we KNOW they work
        if (error.code === 'auth/invalid-login-credentials') {
            console.log("⚠️ Got invalid credentials error, but diagnostic shows they work!");
            console.log("🔄 Attempting one more time with fresh auth...");
            
            // Try one more time after a short delay
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        }
        
        let errorMessage = "Demo login failed. ";
        
        switch (error.code) {
            case 'auth/operation-not-allowed':
                errorMessage = "Email/Password login is not enabled. Please contact support.";
                console.error("🔧 FIX: Enable Email/Password in Firebase Console → Authentication → Sign-in method");
                break;
            case 'auth/user-not-found':
                errorMessage += "Demo account not set up. Please contact support.";
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
        throw error;
    }
}
