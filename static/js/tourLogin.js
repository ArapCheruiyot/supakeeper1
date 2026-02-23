// tourLogin.js - One-click demo login for Superkeeper
console.log("🎟️ Tour Login module loaded");

// Demo account credentials - USING YOUR ACTUAL DEMO ACCOUNT
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
        
        // Check if user has a shop document
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (!userDoc.exists()) {
            console.log("📝 Creating demo user document...");
            await setDoc(userDocRef, {
                email: user.email,
                displayName: "Demo User",
                role: "owner",
                createdAt: new Date(),
                isDemo: true
            });
        }
        
        // Create demo shop if needed
        const shopId = "demo-shop-" + Date.now();
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
        
        // Set demo session
        localStorage.setItem("isDemoMode", "true");
        localStorage.setItem("activeShopId", shopId);
        localStorage.setItem("activeShopName", DEMO_SHOP.name);
        
        console.log("🎉 Demo setup complete! Redirecting...");
        window.location.href = "/dashboard";
        
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