import { auth } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

const userNameSpan = document.getElementById("user-name");
const logoutBtn = document.getElementById("logout-btn");

// Display logged-in user's name
onAuthStateChanged(auth, (user) => {
    if (user) {
        userNameSpan.textContent = `Welcome, ${user.displayName || 'User'}`;
    } else {
        // No user signed in, redirect to login page
        window.location.href = "/";
    }
});

// ========== IMPROVED LOGOUT FUNCTION ==========
function clearAllLocalStorage() {
    console.log("🧹 Clearing localStorage...");
    
    // List of all Superkeeper-related localStorage items
    const superkeeperKeys = [
        "isDemoMode",
        "isTempDemo",
        "freshDemoLogin",
        "demoLoginTime",
        "activeShopId", 
        "activeShopName",
        "sessionType",
        "staffContext",
        "userRole",
        "isFirstDemoUser",
        "demoForceContinue"
    ];
    
    // Remove each key
    superkeeperKeys.forEach(key => {
        if (localStorage.getItem(key) !== null) {
            localStorage.removeItem(key);
            console.log(`   ✅ Removed: ${key}`);
        }
    });
    
    // Alternative: Clear ALL localStorage (uncomment if you want this)
    // localStorage.clear();
    // console.log("   ✅ All localStorage cleared");
}

logoutBtn.addEventListener("click", async () => {
    console.log("🚪 Logout initiated...");
    
    // Disable button to prevent double-clicks
    logoutBtn.disabled = true;
    logoutBtn.textContent = "Logging out...";
    
    try {
        // Step 1: Clear localStorage FIRST (so no stale data remains)
        clearAllLocalStorage();
        
        // Step 2: Sign out from Firebase
        console.log("🔥 Signing out from Firebase...");
        await signOut(auth);
        
        console.log("✅ Logout successful, redirecting...");
        
        // Step 3: Small delay to ensure everything is clean
        setTimeout(() => {
            // Step 4: Redirect to home page
            window.location.href = "/";
        }, 100); // 100ms tiny delay
        
    } catch (error) {
        console.error("❌ Logout error:", error);
        
        // Even if Firebase fails, still try to redirect
        clearAllLocalStorage();
        window.location.href = "/";
    }
});
// ========== END OF IMPROVED LOGOUT ==========