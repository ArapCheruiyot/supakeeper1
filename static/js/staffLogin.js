import { auth, db } from "./firebase-config.js";
import {
  signInWithPopup,
  GoogleAuthProvider,
  signOut
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

import {
  collectionGroup,
  query,
  where,
  getDocs,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// ----------------------------
// Storage keys (clean separation)
// ----------------------------
const SESSION_TYPE_KEY = "sessionType";     // "owner" | "staff"
const STAFF_CTX_KEY = "staffContext";       // JSON
const ACTIVE_SHOP_ID_KEY = "activeShopId";
const ACTIVE_SHOP_NAME_KEY = "activeShopName";

// ----------------------------
// Helpers
// ----------------------------
function clearStaffSession() {
  localStorage.removeItem(STAFF_CTX_KEY);
  localStorage.removeItem("isStaff");
  localStorage.removeItem("shopId");
  localStorage.removeItem("ownerUid");
  localStorage.removeItem("shopName");
  localStorage.removeItem("staffName");
  localStorage.removeItem("staffEmail");
  localStorage.removeItem("staffRole");
  localStorage.removeItem("staffAccessLevel");
  localStorage.removeItem("staffPhone");
  localStorage.removeItem("staffId");
}

function setStaffSession(staffCtx) {
  localStorage.setItem(SESSION_TYPE_KEY, "staff");
  localStorage.setItem(STAFF_CTX_KEY, JSON.stringify(staffCtx));
  localStorage.setItem(ACTIVE_SHOP_ID_KEY, staffCtx.shopId);
  localStorage.setItem(ACTIVE_SHOP_NAME_KEY, staffCtx.shopName || "");
}

// ============================================
// 1) SETUP STAFF LOGIN BUTTON ON HOME PAGE
// ============================================
function setupStaffLoginButton() {
  // Try to find existing button first
  let staffBtn = document.getElementById('staff-signin-btn');
  
  // If button doesn't exist, create it
  if (!staffBtn) {
    console.log("🔧 Staff button not found, creating new one");
    const googleSignInBtn = document.getElementById("google-signin-btn");
    
    if (!googleSignInBtn) {
      console.error("❌ Google Sign-In button not found");
      return;
    }
    
    staffBtn = document.createElement("button");
    staffBtn.id = "staff-signin-btn";
    staffBtn.innerHTML = `<span>Staff Log In</span>`;
    
    staffBtn.style.cssText = `
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
    `;
    
    staffBtn.addEventListener("mouseenter", () => {
      staffBtn.style.transform = "translateY(-2px)";
      staffBtn.style.boxShadow = "0 6px 20px rgba(102, 126, 234, 0.6)";
    });
    
    staffBtn.addEventListener("mouseleave", () => {
      staffBtn.style.transform = "translateY(0)";
      staffBtn.style.boxShadow = "0 4px 15px rgba(102, 126, 234, 0.4)";
    });
    
    googleSignInBtn.parentNode.insertBefore(staffBtn, googleSignInBtn.nextSibling);
    console.log("✅ Staff Login button created");
  } else {
    console.log("✅ Found existing staff button, will attach handler");
  }
  
  // Remove any existing click handlers and add ours
  // Clone and replace to remove all previous handlers
  const newStaffBtn = staffBtn.cloneNode(true);
  staffBtn.parentNode.replaceChild(newStaffBtn, staffBtn);
  
  // Add our click handler
  newStaffBtn.addEventListener("click", handleStaffLogin);
  console.log("✅ Click handler attached to staff button");
}

// ============================================
// 2) HANDLE STAFF LOGIN PROCESS
// ============================================
async function handleStaffLogin() {
  console.log("🔐 Staff login initiated...");

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  try {
    clearStaffSession();

    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    const email = (user?.email || "").trim().toLowerCase();
    if (!email) {
      await signOut(auth);
      alert("Login failed: Google did not return an email.");
      return;
    }

    console.log("👤 User signed in:", email);

    const staffData = await findStaffByEmail(email);

    if (!staffData) {
      console.log("❌ Email not found in staff database");
      alert("Access Denied: You are not registered as a staff member. Please contact your shop owner.");
      await signOut(auth);
      clearStaffSession();
      return;
    }

    console.log("✅ Staff verified:", staffData);

    const staffContext = {
      uid: user.uid,
      email,
      staffId: staffData.staffId,
      name: staffData.name || user.displayName || "",
      phone: staffData.phone || "",
      roleName: staffData.roleName || "",
      accessLevel: staffData.accessLevel ?? null,
      shopId: staffData.shopId,
      shopName: staffData.shopName || "",
      staffDocPath: staffData.staffDocPath || ""
    };

    setStaffSession(staffContext);
    console.log("💾 staffContext saved:", staffContext);
    window.location.href = "/dashboard";
  } catch (error) {
    console.error("❌ Staff login error:", error);
    if (error?.code === "auth/popup-closed-by-user") return;
    alert("Login failed: " + (error?.message || "Unknown error"));
  }
}

// ============================================
// 3) FIND STAFF MEMBER (fast: collectionGroup)
// ============================================
async function findStaffByEmail(email) {
  console.log("🔍 Searching staff via collectionGroup for:", email);
  const q = query(collectionGroup(db, "staff"), where("email", "==", email));
  const snap = await getDocs(q);

  if (snap.empty) return null;

  const staffDoc = snap.docs[0];
  const staff = staffDoc.data();
  const shopId = staffDoc.ref.parent.parent.id;
  const staffId = staffDoc.id;

  let shopName = staff.shopName || "Unknown Shop";
  try {
    const shopSnap = await getDoc(doc(db, "Shops", shopId));
    if (shopSnap.exists()) {
      const shopData = shopSnap.data();
      shopName = shopData.shopName || shopData.name || shopName;
    }
  } catch (e) {
    // ignore
  }

  return {
    shopId,
    shopName,
    staffId,
    staffDocPath: staffDoc.ref.path,
    email: staff.email,
    name: staff.name,
    phone: staff.phone,
    roleName: staff.roleName,
    accessLevel: staff.accessLevel,
    createdAt: staff.createdAt,
    updatedAt: staff.updatedAt
  };
}

// ============================================
// 4) INIT ON PAGE LOAD
// ============================================
document.addEventListener("DOMContentLoaded", () => {
  console.log("📄 staffLogin.js loaded");
  if (window.location.pathname === "/" || window.location.pathname === "/index.html") {
    setupStaffLoginButton(); // Changed from injectStaffLoginButton
  }
});

console.log("✅ staffLogin.js module loaded");