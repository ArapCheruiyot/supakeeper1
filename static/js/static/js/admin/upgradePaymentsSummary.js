/**
 * upgradePaymentsSummary.js - Admin Dashboard for Upgrade Requests
 * 
 * This file:
 * 1. Shows all upgrade requests from all shops in real-time
 * 2. Categorizes them (Paid, Just Requested, Verified)
 * 3. Provides verify buttons for paid requests
 * 4. Updates shop plans when admin verifies payment
 * 
 * Bilingual: English + Swahili
 */

import { db } from "../firebase-config.js";
import { 
    collection, 
    getDocs, 
    onSnapshot,
    query,
    where,
    doc,
    getDoc,
    updateDoc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// Store the unsubscribe functions to clean up later
let unsubscribeFunctions = [];
let isListening = false;

// Staff limits for each plan
const STAFF_LIMITS = {
    BASIC: 5,
    TEAM: 10,
    BUSINESS: 20,
    ENTERPRISE: 100
};

// Plan prices
const PLAN_PRICES = {
    BASIC: 250,
    TEAM: 500,
    BUSINESS: 2500,
    ENTERPRISE: 5000
};

// Global array to store all requests (needed for refresh after verification)
let allRequests = [];

/**
 * MAIN FUNCTION: Load all upgrade requests from all shops
 * Called automatically when page loads and when refresh button is clicked
 */
async function loadUpgradeSummary() {
    const container = document.getElementById('upgrade-summary');
    container.innerHTML = '<div class="loading">Loading upgrade requests... / Inapakia maombi ya kuboresha...</div>';

    try {
        console.log("📊 Loading upgrade requests from all shops...");

        // 1️⃣ Get all shops first to get shop names
        const shopsSnapshot = await getDocs(collection(db, "Shops"));
        if (shopsSnapshot.empty) {
            container.innerHTML = '<p>No shops found. / Hakuna maduka yaliyopatikana.</p>';
            updateStats(0, 0, 0, 0);
            return;
        }

        // Create a map of shopId → shopName
        const shopMap = {};
        shopsSnapshot.forEach(shopDoc => {
            const shopData = shopDoc.data();
            shopMap[shopDoc.id] = shopData.name || shopData.shopName || "Unknown Shop";
        });

        console.log("🏪 Shop map:", shopMap);

        // Clear any existing listeners
        cleanupListeners();

        // Reset the global requests array
        allRequests = [];

        // 2️⃣ Set up real-time listeners for each shop's upgradeRequests subcollection
        const shopPromises = [];

        for (const shopId in shopMap) {
            const promise = setupShopListener(shopId, shopMap[shopId]);
            shopPromises.push(promise);
        }

        // Wait for all listeners to be set up
        await Promise.all(shopPromises);

        // Start listening for changes
        isListening = true;
        console.log("✅ Real-time listeners activated");

    } catch (error) {
        console.error("❌ Error loading upgrade requests:", error);
        container.innerHTML = `
            <div style="color: red; padding: 1rem; background: #f8d7da; border-radius: 5px;">
                <h3>Failed to load upgrade requests / Imeshindwa kupakia maombi</h3>
                <p>Error / Hitilafu: ${error.message}</p>
                <button onclick="loadUpgradeSummary()" style="padding: 5px 10px; margin-top: 10px;">Retry / Jaribu tena</button>
            </div>
        `;
        updateStats(0, 0, 0, 0);
    }
}

/**
 * Set up a real-time listener for a single shop's upgrade requests
 */
function setupShopListener(shopId, shopName) {
    return new Promise((resolve) => {
        try {
            const upgradeRequestsRef = collection(db, `Shops/${shopId}/upgradeRequests`);
            
            // Set up real-time listener
            const unsubscribe = onSnapshot(upgradeRequestsRef, (snapshot) => {
                console.log(`🔄 Real-time update for shop ${shopId}:`, snapshot.size, "documents");
                
                // Remove existing requests from this shop from the global array
                const existingIndexes = [];
                allRequests.forEach((req, index) => {
                    if (req.shopId === shopId) {
                        existingIndexes.push(index);
                    }
                });
                
                // Remove from end to beginning to maintain indexes
                existingIndexes.reverse().forEach(index => {
                    allRequests.splice(index, 1);
                });
                
                // Add new/updated requests
                snapshot.forEach(reqDoc => {
                    const req = reqDoc.data();
                    
                    allRequests.push({
                        id: reqDoc.id,
                        shopId,
                        shopName: req.shopName || shopName || "Unknown Shop",
                        requestedPlan: req.requestedPlan || req.planName || "N/A",
                        status: req.status || req.paymentStatus || "unknown",
                        mpesaReference: req.mpesaReference || "N/A",
                        requestedAt: req.requestedAt || req.timestamp || null,
                        verifiedAt: req.verifiedAt || null,
                        paymentSubmittedAt: req.paymentSubmittedAt || null,
                        priceKES: req.priceKES || PLAN_PRICES[req.requestedPlan] || "N/A",
                        staffLimit: req.staffLimit || STAFF_LIMITS[req.requestedPlan] || "N/A",
                        _raw: req,
                        _updatedAt: new Date() // Track when this record was last updated
                    });
                });
                
                // Process and display updated data
                processAndDisplayData();
                
                // Show notification for new updates
                showUpdateNotification(`Updated: ${shopName} / Imesasishwa: ${shopName}`);
            }, (error) => {
                console.error(`❌ Listener error for shop ${shopId}:`, error);
            });
            
            // Store unsubscribe function for cleanup
            unsubscribeFunctions.push(unsubscribe);
            resolve();
            
        } catch (error) {
            console.error(`⚠️ Error setting up listener for shop ${shopId}:`, error.message);
            resolve(); // Resolve anyway to continue with other shops
        }
    });
}

/**
 * Process all requests and display them in categorized tables
 */
function processAndDisplayData() {
    console.log("🔄 Processing data:", allRequests.length, "requests");
    
    if (allRequests.length === 0) {
        document.getElementById('upgrade-summary').innerHTML = "<p>No upgrade requests found. / Hakuna maombi ya kuboresha yaliyopatikana.</p>";
        updateStats(0, 0, 0, 0);
        return;
    }

    // 3️⃣ Categorize properly
    // Paid/Submitted statuses: 'submitted', 'payment_submitted', 'pending_verification'
    const paidStatuses = ['submitted', 'payment_submitted', 'pending_verification'];
    
    const paid = allRequests.filter(r => paidStatuses.includes(r.status));
    const requestedOnly = allRequests.filter(r => !paidStatuses.includes(r.status));
    const verified = allRequests.filter(r => r.verifiedAt !== null);

    console.log(`📊 Stats: Total=${allRequests.length}, Paid=${paid.length}, RequestedOnly=${requestedOnly.length}, Verified=${verified.length}`);

    // 4️⃣ Update statistics
    updateStats(allRequests.length, requestedOnly.length, paid.length, verified.length);

    // 5️⃣ Build HTML
    let html = '';

    // SECTION 1: Paid / Waiting Verification (NEEDS ADMIN ACTION)
    if (paid.length > 0) {
        // Sort by most recent first
        const sortedPaid = [...paid].sort((a, b) => {
            const dateA = a.paymentSubmittedAt || a.requestedAt;
            const dateB = b.paymentSubmittedAt || b.requestedAt;
            return getTimestamp(dateB) - getTimestamp(dateA);
        });
        
        html += `
            <div style="margin-bottom: 2rem;">
                <h3>💰 Paid / Waiting Verification (${paid.length})</h3>
                <p style="color: #666; margin: 5px 0 15px;">
                    <em>Wamelipa / Wanangoja Kuthibitishwa - Angalia simu yako kuthibitisha malipo kabla ya kubonyeza Thibitisha</em>
                </p>
                <table>
                    <thead>
                        <tr>
                            <th>Shop / Duka</th>
                            <th>Plan / Mpango</th>
                            <th>Status / Hali</th>
                            <th>M-PESA Ref / Kumbukumbu</th>
                            <th>Amount / Kiasi</th>
                            <th>Date / Tarehe</th>
                            <th>Action / Hatua</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sortedPaid.map(r => `
                            <tr>
                                <td><strong>${r.shopName}</strong></td>
                                <td>${r.requestedPlan}</td>
                                <td><span style="padding: 3px 8px; background: #d4edda; border-radius: 4px; color: #155724;">${r.status}</span></td>
                                <td><code>${r.mpesaReference}</code></td>
                                <td>KES ${r.priceKES}</td>
                                <td>${formatDate(r.paymentSubmittedAt || r.requestedAt)}</td>
                                <td>
                                    <button onclick="verifyPayment('${r.shopId}', '${r.id}', '${r.requestedPlan}', '${r.mpesaReference}')" 
                                            style="
                                                background: #28a745;
                                                color: white;
                                                border: none;
                                                padding: 8px 12px;
                                                border-radius: 4px;
                                                cursor: pointer;
                                                font-size: 13px;
                                                font-weight: 600;
                                                display: inline-flex;
                                                align-items: center;
                                                gap: 5px;
                                                transition: all 0.2s;
                                            "
                                            onmouseover="this.style.background='#218838'"
                                            onmouseout="this.style.background='#28a745'"
                                            title="Click to confirm payment and upgrade this shop / Bonyeza kuthibitisha malipo na kuboresha duka hili">
                                        ✅ Verify & Upgrade / Thibitisha & Boresha
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <p style="font-size:0.85rem; color:#dc3545; margin-top:5px;">
                    <strong>⚠️ Important / Muhimu:</strong> Check your phone to confirm M-Pesa payment before clicking Verify. / Angalia simu yako kuthibitisha malipo ya M-Pesa kabla ya kubonyeza Thibitisha.
                </p>
            </div>
        `;
    }

    // SECTION 2: Just Requested (not paid yet)
    if (requestedOnly.length > 0) {
        // Sort by most recent first
        const sortedRequested = [...requestedOnly].sort((a, b) => {
            return getTimestamp(b.requestedAt) - getTimestamp(a.requestedAt);
        });
        
        html += `
            <div style="margin-bottom: 2rem;">
                <h3>📝 Just Requested - Awaiting Payment (${requestedOnly.length})</h3>
                <p style="color: #666; margin: 5px 0 15px;">
                    <em>Wameomba tu - Wanangoja Malipo / Wateja hawa wameomba kuboresha lakini hawajalipa bado</em>
                </p>
                <table>
                    <thead>
                        <tr>
                            <th>Shop / Duka</th>
                            <th>Plan / Mpango</th>
                            <th>Status / Hali</th>
                            <th>Requested / Aliomba</th>
                            <th>Price / Bei</th>
                            <th>Last Update / Sasisho</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sortedRequested.map(r => `
                            <tr>
                                <td><strong>${r.shopName}</strong></td>
                                <td>${r.requestedPlan}</td>
                                <td><span style="padding: 3px 8px; background: #fff3cd; border-radius: 4px; color: #856404;">${r.status}</span></td>
                                <td>${formatDate(r.requestedAt)}</td>
                                <td>KES ${r.priceKES}</td>
                                <td><small style="color: #6c757d;">${formatTimeAgo(r._updatedAt)}</small></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <p style="font-size:0.85rem; color:#856404; margin-top:5px;">
                    <em>These customers have requested upgrade but haven't paid yet. / Wateja hawa wameomba kuboresha lakini hawajalipa bado.</em>
                </p>
            </div>
        `;
    }

    // SECTION 3: Already Verified
    if (verified.length > 0) {
        // Sort by most recent verification first
        const sortedVerified = [...verified].sort((a, b) => {
            return getTimestamp(b.verifiedAt) - getTimestamp(a.verifiedAt);
        });
        
        html += `
            <div style="margin-bottom: 2rem;">
                <h3>✅ Already Verified (${verified.length})</h3>
                <p style="color: #666; margin: 5px 0 15px;">
                    <em>Tayari Wamethibitishwa / Maboresho haya yamekamilika</em>
                </p>
                <table>
                    <thead>
                        <tr>
                            <th>Shop / Duka</th>
                            <th>Plan / Mpango</th>
                            <th>Verified / Ilithibitishwa</th>
                            <th>M-PESA Ref / Kumbukumbu</th>
                            <th>Last Update / Sasisho</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sortedVerified.map(r => `
                            <tr>
                                <td><strong>${r.shopName}</strong></td>
                                <td>${r.requestedPlan}</td>
                                <td>${formatDate(r.verifiedAt)}</td>
                                <td><code>${r.mpesaReference}</code></td>
                                <td><small style="color: #6c757d;">${formatTimeAgo(r._updatedAt)}</small></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <p style="font-size:0.85rem; color:#28a745; margin-top:5px;">
                    <em>These upgrades are complete. / Maboresho haya yamekamilika.</em>
                </p>
            </div>
        `;
    }

    // Dashboard Status Footer
    const statusIndicator = isListening ? 
        '<span style="color: green;">● Live / Moja kwa moja</span>' : 
        '<span style="color: orange;">● Manual</span>';
    
    html += `
        <div style="margin-top: 2rem; padding: 1rem; background: #f8f9fa; border-radius: 5px; font-size: 0.9rem;">
            <h4>📋 Dashboard Status / Hali ya Dashibodi ${statusIndicator}</h4>
            <p>Found / Imepatikana: ${allRequests.length} upgrade request(s) / maombi ya kuboresha</p>
            <p>Last updated / Sasisho la mwisho: ${new Date().toLocaleTimeString()}</p>
            <button onclick="toggleAutoRefresh()" style="padding: 5px 10px; margin-top: 5px; font-size: 0.8rem;">
                ${isListening ? '⏸️ Pause Updates / Simamisha' : '▶️ Resume Updates / Anza upya'}
            </button>
        </div>
    `;

    document.getElementById('upgrade-summary').innerHTML = html;
}

/**
 * VERIFY PAYMENT FUNCTION - The missing piece!
 * Called when admin clicks the verify button
 */
window.verifyPayment = async function(shopId, requestId, planName, mpesaRef) {
    // Step 1: Confirm with admin (Bilingual)
    const confirmMessage = 
        `📱 CONFIRM PAYMENT / THIBITISHA MALIPO\n\n` +
        `Have you received KES ${PLAN_PRICES[planName] || 'the amount'} via M-Pesa from this customer?\n` +
        `Reference / Kumbukumbu: ${mpesaRef}\n\n` +
        `Click OK to upgrade their plan. / Bonyeza OK kuboresha mpango wao.\n\n` +
        `⚠️ IMPORTANT: Check your phone first! / MUHIMU: Angalia simu yako kwanza!`;
    
    if (!confirm(confirmMessage)) {
        return;
    }
    
    try {
        // Get the button that was clicked
        const btn = event.target;
        const originalText = btn.textContent;
        
        // Show loading state
        btn.textContent = '⏳ Upgrading... / Inaboresha...';
        btn.disabled = true;
        btn.style.background = '#6c757d';
        
        console.log(`🔍 Verifying payment for shop ${shopId}, request ${requestId}`);
        
        // 1. Get the request details
        const requestRef = doc(db, "Shops", shopId, "upgradeRequests", requestId);
        const requestSnap = await getDoc(requestRef);
        
        if (!requestSnap.exists()) {
            alert("❌ Request not found / Ombi halikupatikana");
            resetButton(btn, originalText);
            return;
        }
        
        // 2. Update the shop's plan
        const planRef = doc(db, "Shops", shopId, "plan", "default");
        const staffLimit = STAFF_LIMITS[planName] || 5;
        
        // Check if plan document exists
        const planSnap = await getDoc(planRef);
        
        if (planSnap.exists()) {
            await updateDoc(planRef, {
                name: planName,
                staffLimit: staffLimit,
                updatedAt: serverTimestamp(),
                upgradedFrom: requestId,
                verifiedAt: serverTimestamp(),
                verifiedBy: "admin"
            });
            console.log("✅ Plan updated (existing)");
        } else {
            await setDoc(planRef, {
                name: planName,
                staffLimit: staffLimit,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                upgradedFrom: requestId,
                verifiedAt: serverTimestamp(),
                verifiedBy: "admin"
            });
            console.log("✅ Plan created (new)");
        }
        
        // 3. Mark the upgrade request as completed
        await updateDoc(requestRef, {
            status: "completed",
            verifiedAt: serverTimestamp(),
            verifiedBy: "admin",
            verifiedMpesaReference: mpesaRef,
            notes: "Manually verified by admin / Imethibitishwa na admin"
        });
        console.log("✅ Request marked as completed");
        
        // 4. Update payment record if exists (optional)
        try {
            const paymentsRef = collection(db, "Shops", shopId, "payments");
            const paymentsQuery = query(paymentsRef, where("mpesaReference", "==", mpesaRef));
            const paymentsSnap = await getDocs(paymentsQuery);
            
            paymentsSnap.forEach(async (paymentDoc) => {
                await updateDoc(paymentDoc.ref, {
                    status: "verified",
                    verifiedAt: serverTimestamp(),
                    verifiedBy: "admin"
                });
            });
            console.log("✅ Payment records updated");
        } catch (e) {
            console.log("No payment records found or error updating:", e);
        }
        
        // 5. Show success message (Bilingual)
        alert(
            `✅ SUCCESS! / IMEFAULU!\n\n` +
            `Shop upgraded to ${planName} plan.\n` +
            `Staff limit is now ${staffLimit}.\n\n` +
            `Duka limeboreshwa hadi mpango wa ${planName}.\n` +
            `Idadi ya wafanyakazi sasa ni ${staffLimit}.`
        );
        
        // No need to refresh - real-time listeners will update automatically
        
    } catch (error) {
        console.error("❌ Error verifying payment:", error);
        alert(
            `❌ Error upgrading plan: ${error.message}\n\n` +
            `Hitilafu katika kuboresha mpango: ${error.message}`
        );
        
        // Reset button
        const btn = event.target;
        btn.textContent = '✅ Verify & Upgrade / Thibitisha & Boresha';
        btn.disabled = false;
        btn.style.background = '#28a745';
    }
}

// Helper to reset button
function resetButton(btn, originalText) {
    btn.textContent = originalText;
    btn.disabled = false;
    btn.style.background = '#28a745';
}

// Update statistics at the top of the page
function updateStats(total, requested, paidVerify, verified) {
    document.getElementById('total-requests').textContent = total;
    document.getElementById('awaiting-payment').textContent = requested;
    document.getElementById('paid-verify').textContent = paidVerify;
    document.getElementById('verified').textContent = verified;
}

// Format date for display
function formatDate(timestamp) {
    if (!timestamp) return "N/A";
    
    try {
        let date;
        if (timestamp.toDate) {
            date = timestamp.toDate();
        } else if (timestamp.seconds) {
            date = new Date(timestamp.seconds * 1000);
        } else if (typeof timestamp === 'string') {
            date = new Date(timestamp);
        } else {
            return "Invalid date";
        }
        
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    } catch (e) {
        console.error("Date formatting error:", e);
        return "Date error";
    }
}

// Get timestamp from various formats
function getTimestamp(dateObj) {
    if (!dateObj) return 0;
    
    try {
        if (dateObj.toDate) {
            return dateObj.toDate().getTime();
        } else if (dateObj.seconds) {
            return dateObj.seconds * 1000;
        } else if (typeof dateObj === 'string') {
            return new Date(dateObj).getTime();
        } else if (dateObj instanceof Date) {
            return dateObj.getTime();
        }
    } catch (e) {
        console.error("Timestamp error:", e);
    }
    return 0;
}

// Format time ago (e.g., "2 min ago")
function formatTimeAgo(date) {
    if (!date) return "N/A";
    
    const now = new Date();
    const updateDate = date instanceof Date ? date : new Date(date);
    const diffMs = now - updateDate;
    const diffSec = Math.floor(diffMs / 1000);
    
    if (diffSec < 60) return "just now / sasa hivi";
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min ago / dakika zilizopita`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} hr ago / saa zilizopita`;
    return `${Math.floor(diffSec / 86400)} days ago / siku zilizopita`;
}

// Show notification for updates
function showUpdateNotification(message) {
    let notification = document.getElementById('update-notification');
    
    if (!notification) {
        notification = document.createElement('div');
        notification.id = 'update-notification';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #28a745;
            color: white;
            padding: 10px 15px;
            border-radius: 5px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            z-index: 1000;
            animation: slideIn 0.3s ease;
        `;
        document.body.appendChild(notification);
        
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes fadeOut {
                from { opacity: 1; }
                to { opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }
    
    notification.textContent = `🔄 ${message}`;
    notification.style.background = '#28a745';
    
    clearTimeout(notification.timeout);
    notification.timeout = setTimeout(() => {
        notification.style.animation = 'fadeOut 0.5s ease';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 500);
    }, 3000);
}

// Clean up listeners
function cleanupListeners() {
    console.log("🧹 Cleaning up listeners...");
    unsubscribeFunctions.forEach(unsubscribe => {
        try {
            unsubscribe();
        } catch (error) {
            console.error("Error unsubscribing:", error);
        }
    });
    unsubscribeFunctions = [];
    isListening = false;
}

// Toggle auto-refresh
function toggleAutoRefresh() {
    if (isListening) {
        cleanupListeners();
        showUpdateNotification("Updates paused / Sasisho zimesimamishwa");
    } else {
        loadUpgradeSummary();
    }
}

// Clean up when page is unloaded
window.addEventListener('beforeunload', cleanupListeners);

// Make functions available globally
window.loadUpgradeSummary = loadUpgradeSummary;
window.toggleAutoRefresh = toggleAutoRefresh;

// Run on page load
document.addEventListener('DOMContentLoaded', loadUpgradeSummary);