// tourLogin.js - One-click demo login for Superkeeper
// UPDATED: Finds the actual shop belonging to the demo user + added delay for auth persistence
console.log("🎟️ Tour Login module loaded");

const DEMO_ACCOUNT = {
    email: "superkeeper35@gmail.com",
    password: "SUPAKIPA@123"
};

export async function handleDemoLogin() {
    console.log("🔐 Starting demo login...");
    
    try {
        const { getAuth, signInWithEmailAndPassword } = await import("https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js");
        const { doc, getDoc, collection, query, where, getDocs } = await import("https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js");
        const { db } = await import("./firebase-config.js");
        
        const auth = getAuth();
        
        console.log("📧 Attempting login with:", DEMO_ACCOUNT.email);
        
        // Clear any existing session
        await import("https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js").then(({ signOut }) => {
            return signOut(auth).catch(() => {});
        });
        
        const userCredential = await signInWithEmailAndPassword(
            auth, 
            DEMO_ACCOUNT.email, 
            DEMO_ACCOUNT.password
        );
        
        const user = userCredential.user;
        console.log("✅ Demo login successful:", user.email);
        
        // Find the shop associated with this user
        let shopId = null;
        let shopName = "Superkeeper Demo Shop";
        
        // Method 1: Check if there's a users document with shopId
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists() && userDoc.data().shopId) {
            shopId = userDoc.data().shopId;
            console.log("✅ Found shop ID in user document:", shopId);
        }
        
        // Method 2: If not, query Shops collection for ownerId == user.uid
        if (!shopId) {
            const shopsQuery = query(collection(db, "Shops"), where("ownerId", "==", user.uid));
            const shopsSnapshot = await getDocs(shopsQuery);
            if (!shopsSnapshot.empty) {
                const shopDoc = shopsSnapshot.docs[0];
                shopId = shopDoc.id;
                shopName = shopDoc.data().shopName || shopName;
                console.log("✅ Found shop via ownerId query:", shopId);
            }
        }
        
        // If still no shop, create one (this should not happen for the demo account)
        if (!shopId) {
            console.log("⚠️ No shop found for demo user. Creating a new one...");
            const { setDoc } = await import("https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js");
            const newShopRef = doc(collection(db, "Shops"));
            await setDoc(newShopRef, {
                shopName: "Superkeeper Demo Shop",
                ownerId: user.uid,
                createdAt: new Date(),
                isDemo: true
            });
            shopId = newShopRef.id;
            console.log("✅ Created new shop:", shopId);
        }
        
        // Set session flags
        localStorage.setItem("isDemoMode", "true");
        localStorage.setItem("activeShopId", shopId);
        localStorage.setItem("activeShopName", shopName);
        
        // Clear any old flags
        localStorage.removeItem("freshDemoLogin");
        localStorage.setItem("freshDemoLogin", "true");
        localStorage.setItem("demoLoginTime", Date.now().toString());
        
        console.log("🎉 Demo setup complete! Redirecting to dashboard in 500ms...");
        
        // Small delay to allow Firebase Auth to fully persist the session
        setTimeout(() => {
            window.location.href = "/dashboard";
        }, 500);
        
    } catch (error) {
        console.error("❌ Demo login failed:", error);
        
        let errorMessage = "Demo login failed. ";
        if (error.code === 'auth/invalid-login-credentials') {
            errorMessage += "Invalid credentials.";
        } else {
            errorMessage += error.message;
        }
        
        alert(errorMessage);
        throw error;
    }
}