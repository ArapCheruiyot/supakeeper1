// sales.js - ONE-TAP BATCH-AWARE SALES SYSTEM (FIXED STOCK CHECKING LOGIC) + BILINGUAL UI
// EMERGENCY FIX: Added backend data mismatch handling + Fixed search 404 error
// STAFF FIX: Added proper shop ID resolution for staff logins
// UX FIX: Results persist after tapping + Professional modern design
// AUDIO FIX: Added beep sound when user taps an item
// CURRENCY: Changed from $ to KSh for Kenyan market
// RESPONSIVE FIX: Added mobile-optimized badge positioning + compact card styles
// CART ICON FIX: Hide floating cart when sales overlay opens, show when closed
// CLOSE BUTTON FIX: Ensure close button is visible and not hidden under banner
// PERFORMANCE FIX #1: Immediate cache invalidation after adding items
// PERFORMANCE FIX #2: Hybrid search (instant local + background backend)
// PERFORMANCE FIX #3: Pre-warm backend connection on overlay open

import { getAuth } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { db } from "./firebase-config.js";
import { doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const FLASK_BACKEND_URL = window.location.origin;

// Global state
let salesOverlay = null;
let searchTimeout = null;
let currentShopId = null;
let currentUser = null;
let useBackend = true; // Try backend first, fallback to local search
let lastSearchResults = []; // Store last search results for persistence
let lastSearchQuery = ''; // Store last search query
let localItemCache = new Map(); // Local cache of items for instant search
let isBackendReady = false; // Track if backend is warmed up
let pendingInvalidations = new Set(); // Track items that need cache refresh

// Audio for beep sound
let beepAudio = null;

const NAV_HEIGHT = 60; // Navbar height
const BANNER_HEIGHT = 60; // Banner height
const TOTAL_TOP_OFFSET = NAV_HEIGHT + BANNER_HEIGHT; // 120px total

// ====================================================
// RESPONSIVE STYLES - ADDED FOR MOBILE OPTIMIZATION
// ====================================================
(function addResponsiveStyles() {
    if (!document.getElementById('sales-responsive-styles')) {
        const style = document.createElement('style');
        style.id = 'sales-responsive-styles';
        style.textContent = `
            /* Base styles for all screens */
            .sales-item-card .stock-badge {
                position: absolute;
                top: 16px;
                right: 16px;
                padding: 6px 12px;
                font-size: 12px;
                border-radius: 30px;
                font-weight: 600;
                letter-spacing: 0.3px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                z-index: 5;
                max-width: 150px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            
            /* Mobile styles (screens smaller than 480px) */
            @media (max-width: 480px) {
                .sales-item-card .stock-badge {
                    top: 8px;
                    right: 8px;
                    padding: 3px 8px;
                    font-size: 9px;
                    max-width: 100px;
                }
                
                .sales-item-card {
                    padding: 12px !important;
                }
                
                .sales-item-card .item-thumbnail {
                    width: 50px !important;
                    height: 50px !important;
                }
                
                .sales-item-card .item-name {
                    font-size: 15px !important;
                    margin-bottom: 4px !important;
                }
                
                .sales-item-card .item-price {
                    font-size: 18px !important;
                }
                
                .sales-item-card .stock-text {
                    font-size: 11px !important;
                }
                
                .sales-item-card .conversion-info {
                    font-size: 11px !important;
                    margin-top: 2px !important;
                    padding-top: 4px !important;
                }
            }
            
            /* Very small screens (under 360px) */
            @media (max-width: 360px) {
                .sales-item-card .stock-badge {
                    top: 4px;
                    right: 4px;
                    padding: 2px 6px;
                    font-size: 8px;
                    max-width: 80px;
                }
                
                .sales-item-card {
                    padding: 8px !important;
                }
                
                .sales-item-card .item-thumbnail {
                    width: 40px !important;
                    height: 40px !important;
                }
                
                .sales-item-card .item-name {
                    font-size: 14px !important;
                }
                
                .sales-item-card .item-price {
                    font-size: 16px !important;
                }
            }
        `;
        document.head.appendChild(style);
    }
})();

// ====================================================
// PERFORMANCE FIX: Warm up backend connection
// ====================================================
async function warmUpBackend() {
    if (!currentShopId) return;
    
    try {
        console.log('🔥 Warming up backend connection...');
        const startTime = Date.now();
        
        // Send a lightweight warm-up request
        await fetch(`${FLASK_BACKEND_URL}/sales`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                query: "warmup", 
                shop_id: currentShopId,
                warmup: true // Optional: backend can ignore this request
            }),
            // Short timeout for warmup
            signal: AbortSignal.timeout(2000)
        }).catch(() => {}); // Ignore errors during warmup
        
        isBackendReady = true;
        console.log(`✅ Backend warmed up in ${Date.now() - startTime}ms`);
    } catch (error) {
        console.log('⚠️ Backend warmup failed, will use local search:', error);
        isBackendReady = false;
    }
}

// ====================================================
// PERFORMANCE FIX: Build local item cache
// ====================================================
async function buildLocalItemCache(shopId) {
    try {
        console.log('📦 Building local item cache...');
        const startTime = Date.now();
        
        const cache = new Map();
        
        // Get all categories
        const categoriesRef = collection(db, "Shops", shopId, "categories");
        const categoriesSnap = await getDocs(categoriesRef);
        
        for (const categoryDoc of categoriesSnap.docs) {
            const categoryId = categoryDoc.id;
            const categoryData = categoryDoc.data();
            
            // Get items in this category
            const itemsRef = collection(db, "Shops", shopId, "categories", categoryId, "items");
            const itemsSnap = await getDocs(itemsRef);
            
            for (const itemDoc of itemsSnap.docs) {
                const itemData = itemDoc.data();
                const itemName = (itemData.name || "").toLowerCase();
                
                // Cache main item
                const mainItem = {
                    item_id: itemDoc.id,
                    main_item_id: itemDoc.id,
                    category_id: categoryId,
                    category_name: categoryData.name || "Uncategorized",
                    name: itemData.name,
                    type: "main_item",
                    price: itemData.sellPrice || itemData.price || 0,
                    sellPrice: itemData.sellPrice || itemData.price || 0,
                    batch_id: itemData.currentBatchId || "default",
                    batch_remaining: itemData.stock || 0,
                    batch_name: "Current Stock",
                    stock: itemData.stock || 0,
                    thumbnail: itemData.images?.[0] || null,
                    batch_status: "active"
                };
                
                // Cache by name and ID for quick lookup
                cache.set(itemDoc.id, mainItem);
                
                // Also cache selling units
                const sellUnitsRef = collection(db, "Shops", shopId, "categories", categoryId, "items", itemDoc.id, "sellUnits");
                const sellUnitsSnap = await getDocs(sellUnitsRef);
                
                sellUnitsSnap.forEach(sellDoc => {
                    const sellData = sellDoc.data();
                    const sellUnitItem = {
                        item_id: itemDoc.id,
                        sell_unit_id: sellDoc.id,
                        main_item_id: itemDoc.id,
                        category_id: categoryId,
                        category_name: categoryData.name || "Uncategorized",
                        name: sellData.name,
                        display_name: sellData.name,
                        type: "selling_unit",
                        price: sellData.sellPrice || 0,
                        sellPrice: sellData.sellPrice || 0,
                        batch_id: "default",
                        batch_remaining: sellData.stock || 0,
                        available_stock: sellData.stock || 0,
                        batch_name: "Selling Unit",
                        stock: sellData.stock || 0,
                        thumbnail: sellData.images?.[0]?.thumb || sellData.images?.[0]?.url || null,
                        conversion_factor: sellData.conversionFactor || sellData.conversion || 1,
                        batch_status: "active"
                    };
                    
                    cache.set(`${itemDoc.id}_${sellDoc.id}`, sellUnitItem);
                });
            }
        }
        
        localItemCache = cache;
        console.log(`✅ Local cache built with ${cache.size} items in ${Date.now() - startTime}ms`);
        return true;
    } catch (error) {
        console.error('❌ Error building local cache:', error);
        return false;
    }
}

// ====================================================
// PERFORMANCE FIX: Immediate local search
// ====================================================
function searchLocalCache(query) {
    const searchTerm = query.toLowerCase().trim();
    if (!searchTerm || searchTerm.length < 2) return [];
    
    const startTime = Date.now();
    const results = [];
    
    for (const item of localItemCache.values()) {
        const itemName = (item.name || "").toLowerCase();
        const displayName = (item.display_name || "").toLowerCase();
        
        // Score the match
        let score = 0;
        if (itemName === searchTerm) score = 100;
        else if (itemName.startsWith(searchTerm)) score = 90;
        else if (itemName.includes(` ${searchTerm}`)) score = 80;
        else if (itemName.includes(searchTerm)) score = 70;
        else if (displayName.includes(searchTerm)) score = 60;
        
        if (score > 0) {
            results.push({
                ...item,
                search_score: score,
                _from_cache: true
            });
        }
    }
    
    // Sort by score
    results.sort((a, b) => (b.search_score || 0) - (a.search_score || 0));
    
    console.log(`🔍 Local cache search found ${results.length} results in ${Date.now() - startTime}ms`);
    return results;
}

// ====================================================
// PERFORMANCE FIX: Immediate item invalidation
// ====================================================
function invalidateItemFromCache(itemId, sellUnitId = null) {
    const key = sellUnitId ? `${itemId}_${sellUnitId}` : itemId;
    
    // Remove from local cache
    localItemCache.delete(key);
    
    // Track for backend refresh
    pendingInvalidations.add(key);
    
    console.log(`🔄 Invalidated item from cache: ${key}`);
    
    // Trigger a background refresh of the full cache
    debouncedRefreshBackendCache();
    
    // Also try to rebuild just this item
    rebuildSingleItem(itemId, sellUnitId);
}

async function rebuildSingleItem(itemId, sellUnitId = null) {
    if (!currentShopId) return;
    
    try {
        // Find the item in Firestore and rebuild cache entry
        const categoriesRef = collection(db, "Shops", currentShopId, "categories");
        const categoriesSnap = await getDocs(categoriesRef);
        
        for (const categoryDoc of categoriesSnap.docs) {
            const categoryId = categoryDoc.id;
            const categoryData = categoryDoc.data();
            
            const itemRef = doc(db, "Shops", currentShopId, "categories", categoryId, "items", itemId);
            const itemDoc = await getDoc(itemRef);
            
            if (itemDoc.exists()) {
                const itemData = itemDoc.data();
                
                if (!sellUnitId) {
                    // Rebuild main item
                    const mainItem = {
                        item_id: itemDoc.id,
                        main_item_id: itemDoc.id,
                        category_id: categoryId,
                        category_name: categoryData.name || "Uncategorized",
                        name: itemData.name,
                        type: "main_item",
                        price: itemData.sellPrice || itemData.price || 0,
                        sellPrice: itemData.sellPrice || itemData.price || 0,
                        batch_id: itemData.currentBatchId || "default",
                        batch_remaining: itemData.stock || 0,
                        batch_name: "Current Stock",
                        stock: itemData.stock || 0,
                        thumbnail: itemData.images?.[0] || null,
                        batch_status: "active"
                    };
                    
                    localItemCache.set(itemId, mainItem);
                    console.log(`✅ Rebuilt main item cache: ${itemId}`);
                } else {
                    // Rebuild selling unit
                    const sellUnitRef = doc(itemRef, "sellUnits", sellUnitId);
                    const sellUnitDoc = await getDoc(sellUnitRef);
                    
                    if (sellUnitDoc.exists()) {
                        const sellData = sellUnitDoc.data();
                        const sellUnitItem = {
                            item_id: itemId,
                            sell_unit_id: sellUnitDoc.id,
                            main_item_id: itemId,
                            category_id: categoryId,
                            category_name: categoryData.name || "Uncategorized",
                            name: sellData.name,
                            display_name: sellData.name,
                            type: "selling_unit",
                            price: sellData.sellPrice || 0,
                            sellPrice: sellData.sellPrice || 0,
                            batch_id: "default",
                            batch_remaining: sellData.stock || 0,
                            available_stock: sellData.stock || 0,
                            batch_name: "Selling Unit",
                            stock: sellData.stock || 0,
                            thumbnail: sellData.images?.[0]?.thumb || sellData.images?.[0]?.url || null,
                            conversion_factor: sellData.conversionFactor || sellData.conversion || 1,
                            batch_status: "active"
                        };
                        
                        localItemCache.set(`${itemId}_${sellUnitId}`, sellUnitItem);
                        console.log(`✅ Rebuilt selling unit cache: ${itemId}_${sellUnitId}`);
                    }
                }
                break;
            }
        }
        
        // Remove from pending
        const key = sellUnitId ? `${itemId}_${sellUnitId}` : itemId;
        pendingInvalidations.delete(key);
        
    } catch (error) {
        console.error('❌ Error rebuilding item:', error);
    }
}

// ====================================================
// PERFORMANCE FIX: Debounced backend cache refresh
// ====================================================
let refreshTimeout = null;
function debouncedRefreshBackendCache() {
    if (refreshTimeout) {
        clearTimeout(refreshTimeout);
    }
    
    refreshTimeout = setTimeout(async () => {
        console.log('🔄 Debounced: Refreshing backend cache...');
        try {
            // Call backend to invalidate its cache
            await fetch(`${FLASK_BACKEND_URL}/debug/refresh-cache`, {
                method: "POST",
                headers: { "Content-Type": "application/json" }
            });
            console.log('✅ Backend cache refreshed');
        } catch (error) {
            console.log('⚠️ Could not refresh backend cache:', error);
        }
        
        // Clear pending invalidations
        pendingInvalidations.clear();
    }, 2000); // 2 second delay to batch multiple updates
}

// ====================================================
// AUDIO HELPER FUNCTIONS - BEEP SOUND
// ====================================================

/**
 * Initialize the beep sound audio object
 */
function initBeepSound() {
    try {
        if (!beepAudio) {
            beepAudio = new Audio('/static/audios/beep.MP3');
            beepAudio.volume = 0.3; // Set volume to 100% - not too loud
            console.log('✅ Beep sound initialized');
        }
    } catch (error) {
        console.warn('⚠️ Could not initialize beep sound:', error);
    }
}

/**
 * Play the beep sound
 */
function playBeep() {
    try {
        if (!beepAudio) {
            initBeepSound();
        }
        
        // Clone the audio to allow overlapping sounds
        const beepClone = beepAudio.cloneNode();
        beepClone.volume = 0.3;
        beepClone.play().catch(error => {
            // Silently fail - audio is not critical
            console.debug('Beep playback failed:', error);
        });
    } catch (error) {
        // Silently fail - audio is not critical
        console.debug('Beep error:', error);
    }
}

// ====================================================
// FLOATING POINT PRECISION FIX
// ====================================================

function safeFloat(value) {
    // Fix floating point precision issues
    if (typeof value !== 'number') return 0;
    
    // Round to 10 decimal places to avoid floating point errors
    return Math.round(value * 10000000000) / 10000000000;
}

function safeCompare(a, b, threshold = 0.0000001) {
    // Compare numbers with tolerance for floating point errors
    return Math.abs(safeFloat(a) - safeFloat(b)) < threshold;
}

// ====================================================
// BATCH INTELLIGENCE - SEPARATE TRACKING FOR BASE VS SELLING UNITS
// ====================================================

class BatchIntelligence {
    constructor() {
        // SEPARATE tracking for base items vs selling units
        this.baseItemBatchState = new Map();   // item_id -> {currentBatchId, tapsCount}
        this.sellingUnitBatchState = new Map(); // item_id_sell_unit_id -> {currentBatchId, tapsCount}
    }
    
    getItemKey(item) {
        // DIFFERENT KEYS for base vs selling unit
        if (item.type === 'selling_unit') {
            return `${item.item_id}_${item.sell_unit_id}`;
        } else {
            return `${item.item_id}_main`;
        }
    }
    
    getBatchKey(item) {
        // DIFFERENT batch tracking for base vs selling unit
        if (item.type === 'selling_unit') {
            return `${item.item_id}_${item.sell_unit_id}_batch`;
        } else {
            return `${item.item_id}_main_batch`;
        }
    }
    
    prepareItemForCart(item) {
        const itemKey = this.getItemKey(item);
        const batchKey = this.getBatchKey(item);
        
        // Get appropriate state map
        const stateMap = item.type === 'selling_unit' 
            ? this.sellingUnitBatchState 
            : this.baseItemBatchState;
        
        // Get current batch state
        const currentState = stateMap.get(batchKey) || {
            currentBatchId: item.batch_id,
            tapsCount: 0,
            lastBatchId: item.batch_id
        };
        
        console.log(`📦 Batch analysis for ${item.name} (${item.type})`, {
            type: item.type,
            batchStatus: item.batch_status,
            currentBatch: item.batch_id,
            currentBatchRemaining: item.batch_remaining,
            safeCurrentBatchRemaining: safeFloat(item.batch_remaining || 0),
            nextBatchAvailable: item.next_batch_available,
            nextBatchRemaining: item.next_batch_remaining,
            safeNextBatchRemaining: safeFloat(item.next_batch_remaining || 0),
            nextBatchPrice: item.next_batch_price
        });
        
        // ====================================================
        // ⚠️ EMERGENCY FIX: Handle backend/frontend data mismatch
        // ====================================================
        
        // For BASE UNITS ONLY: If backend reports any issue, auto-switch proactively
        if ((item.type === 'base' || item.type === 'main_item')) {
            const currentStock = safeFloat(item.batch_remaining || 0);
            const hasNextBatch = item.next_batch_available;
            const nextStock = safeFloat(item.next_batch_remaining || 0);
            
            // ⚠️ CRITICAL: If batch_status indicates exhausted, force auto-switch
            if (item.batch_status === 'exhausted' && hasNextBatch && nextStock >= 0.999999) {
                console.log(`🚨 EMERGENCY: Backend reports batch exhausted, forcing auto-switch`);
                
                const switchedItem = {
                    ...item,
                    batch_id: item.next_batch_id,
                    batchId: item.next_batch_id,
                    price: item.next_batch_price,
                    batch_remaining: item.next_batch_remaining,
                    batch_name: item.next_batch_name,
                    next_batch_available: false,
                    next_batch_id: null,
                    next_batch_price: null,
                    next_batch_remaining: null,
                    next_batch_name: null,
                    _batch_switched: true,
                    _previous_batch_id: item.batch_id,
                    _previous_price: item.price,
                    _previous_stock: currentStock,
                    _emergency_switch: true
                };
                
                stateMap.set(batchKey, {
                    ...currentState,
                    currentBatchId: item.next_batch_id,
                    lastBatchId: item.batch_id,
                    tapsCount: 0
                });
                
                return {
                    item: switchedItem,
                    action: 'switch_and_add',
                    message: `Emergency auto-switch: Backend reports batch exhausted`
                };
            }
            
            // ⚠️ PROACTIVE SWITCH: If current batch shows low stock AND next batch is available, switch early
            if (currentStock < 2 && hasNextBatch && nextStock >= 0.999999) {
                console.log(`⚠️ PROACTIVE SWITCH: Current batch low (${currentStock}), next batch available (${nextStock})`);
                
                const switchedItem = {
                    ...item,
                    batch_id: item.next_batch_id,
                    batchId: item.next_batch_id,
                    price: item.next_batch_price,
                    batch_remaining: item.next_batch_remaining,
                    batch_name: item.next_batch_name,
                    next_batch_available: false,
                    next_batch_id: null,
                    next_batch_price: null,
                    next_batch_remaining: null,
                    next_batch_name: null,
                    _batch_switched: true,
                    _previous_batch_id: item.batch_id,
                    _previous_price: item.price,
                    _previous_stock: currentStock,
                    _proactive_switch: true
                };
                
                stateMap.set(batchKey, {
                    ...currentState,
                    currentBatchId: item.next_batch_id,
                    lastBatchId: item.batch_id,
                    tapsCount: 0
                });
                
                return {
                    item: switchedItem,
                    action: 'switch_and_add',
                    message: `Proactive auto-switch to prevent stock issues`
                };
            }
        }
        
        // ✅ CORRECT LOGIC: Check stock numbers directly WITH FLOATING POINT FIX
        
        // For SELLING UNITS: Just check if stock > 0 (with tolerance)
        if (item.type === 'selling_unit') {
            const stock = safeFloat(item.available_stock || item.batch_remaining || 0);
            if (stock <= 0.000001) { // Use tolerance for floating point
                console.log(`❌ Selling unit ${item.name} has no stock (${stock})`);
                return {
                    item: item,
                    action: 'cannot_add',
                    message: 'No stock available / Hakuna stock'
                };
            }
            
            // Normal case - add from current batch
            stateMap.set(batchKey, {
                ...currentState,
                tapsCount: currentState.tapsCount + 1
            });
            
            return {
                item: item,
                action: 'add_current_batch',
                message: ''
            };
        }
        
        // For BASE UNITS: Complex stock checking WITH FLOATING POINT FIX
        if (item.type === 'base' || item.type === 'main_item') {
            const currentStock = safeFloat(item.batch_remaining || 0);
            
            // 1. Check if current batch has ≥ 1 unit (with tolerance)
            if (currentStock >= 0.999999) { // Use 0.999999 instead of 1
                console.log(`✅ Current batch has enough stock: ${currentStock} (≥ 0.999999)`);
                stateMap.set(batchKey, {
                    ...currentState,
                    tapsCount: currentState.tapsCount + 1
                });
                
                let action = 'add_current_batch';
                let message = '';
                
                if (currentStock < 1.999999) { // Last or almost last (with tolerance)
                    action = 'add_with_warning';
                    message = `Last item in ${item.batch_name || 'current batch'}! / Kipande cha mwisho!`;
                }
                
                return {
                    item: item,
                    action: action,
                    message: message
                };
            }
            
            // 2. Current batch < 1, check if next batch available with ≥ 1 unit
            if (currentStock < 0.999999 && item.next_batch_available) {
                const nextStock = safeFloat(item.next_batch_remaining || 0);
                
                if (nextStock >= 0.999999) {
                    console.log(`🔄 Auto-switch: Current batch ${currentStock}, Next batch ${nextStock}`);
                    
                    // Create switched item with new batch details
                    const switchedItem = {
                        ...item, // This copies ALL properties including category_id, category_name
                        batch_id: item.next_batch_id,
                        batchId: item.next_batch_id,
                        price: item.next_batch_price,
                        batch_remaining: item.next_batch_remaining,
                        batch_name: item.next_batch_name,
                        // Clear next batch info since we're switching to it
                        next_batch_available: false,
                        next_batch_id: null,
                        next_batch_price: null,
                        next_batch_remaining: null,
                        next_batch_name: null,
                        // Metadata for tracking
                        _batch_switched: true,
                        _previous_batch_id: item.batch_id,
                        _previous_price: item.price,
                        _previous_stock: currentStock
                    };
                    
                    // Update batch state
                    stateMap.set(batchKey, {
                        ...currentState,
                        currentBatchId: item.next_batch_id,
                        lastBatchId: item.batch_id,
                        tapsCount: 0 // Reset for new batch
                    });
                    
                    return {
                        item: switchedItem,
                        action: 'switch_and_add',
                        message: `Auto-switched to ${item.next_batch_name || 'new batch'} (${nextStock} units available)`
                    };
                } else {
                    console.log(`❌ Next batch also insufficient: ${nextStock} units (< 0.999999)`);
                }
            }
            
            // 3. Special case: Current batch is basically 0 due to floating point error
            if (currentStock < 0.000001 && item.next_batch_available) {
                console.log(`⚠️ Current batch effectively 0 (${currentStock}), checking next batch...`);
                const nextStock = safeFloat(item.next_batch_remaining || 0);
                if (nextStock >= 0.999999) {
                    console.log(`🔄 Auto-switch triggered for floating point error`);
                    // Same auto-switch logic as above
                    const switchedItem = {
                        ...item,
                        batch_id: item.next_batch_id,
                        batchId: item.next_batch_id,
                        price: item.next_batch_price,
                        batch_remaining: item.next_batch_remaining,
                        batch_name: item.next_batch_name,
                        next_batch_available: false,
                        next_batch_id: null,
                        next_batch_price: null,
                        next_batch_remaining: null,
                        next_batch_name: null,
                        _batch_switched: true,
                        _previous_batch_id: item.batch_id,
                        _previous_price: item.price,
                        _previous_stock: currentStock
                    };
                    
                    stateMap.set(batchKey, {
                        ...currentState,
                        currentBatchId: item.next_batch_id,
                        lastBatchId: item.batch_id,
                        tapsCount: 0
                    });
                    
                    return {
                        item: switchedItem,
                        action: 'switch_and_add',
                        message: `Auto-switched to ${item.next_batch_name || 'new batch'} (${nextStock} units available)`
                    };
                }
            }
            
            // 4. No batch with ≥ 1 unit available
            console.log(`❌ No batch with sufficient stock. Current: ${currentStock}`);
            return {
                item: item,
                action: 'cannot_add',
                message: 'Insufficient stock in any batch / Hakuna stock ya kutosha'
            };
        }
        
        // Fallback for unknown types
        console.warn(`Unknown item type: ${item.type}`);
        return {
            item: item,
            action: 'add_current_batch',
            message: ''
        };
    }
    
    // Clear batch tracking for a specific item
    clearItemTracking(item) {
        const batchKey = this.getBatchKey(item);
        const stateMap = item.type === 'selling_unit' 
            ? this.sellingUnitBatchState 
            : this.baseItemBatchState;
        stateMap.delete(batchKey);
    }
}

// Initialize batch intelligence
const batchIntelligence = new BatchIntelligence();

// ====================================================
// HELPER FUNCTIONS FOR ONE-TAP
// ====================================================

function getItemStock(item) {
    let stock = 0;
    
    if (item.type === 'selling_unit') {
        stock = item.available_stock || 0;
    } else {
        stock = item.batch_remaining || item.stock || 0;
    }
    
    return safeFloat(stock);
}

function getItemPrice(item) {
    return safeFloat(item.price || item.sellPrice || item.sell_price || 0);
}

function getStockColor(item) {
    const stock = getItemStock(item);
    
    // For selling units: any stock > 0 is good
    if (item.type === 'selling_unit') {
        if (stock > 0.000001) return '#2ed573'; // Green (with tolerance)
        return '#ff6b6b'; // Red
    }
    
    // For base units: check if can sell
    if (canAddToCart(item)) {
        if (stock >= 10) return '#2ed573';  // Green (good stock)
        if (stock >= 0.999999) return '#ffa502';   // Yellow (low but sellable, with tolerance)
        // Stock < 1 but can auto-switch
        if (item.next_batch_available && safeFloat(item.next_batch_remaining || 0) >= 0.999999) {
            return '#9b59b6'; // Purple (auto-switch ready)
        }
    }
    
    return '#ff6b6b'; // Red (cannot sell)
}

function getStockText(item) {
    const stock = getItemStock(item);
    
    if (item.type === 'selling_unit') {
        const unitName = item.display_name || item.name;
        if (stock > 0.000001) return `Available: ${stock.toFixed(6)} ${unitName} / Ipo: ${stock.toFixed(6)} ${unitName}`;
        return '❌ Out of stock / Imeisha';
    }
    
    // For base units
    if (canAddToCart(item)) {
        if (stock >= 0.999999) {
            if (stock < 1.999999) return '🚨 Last item in batch! / Kipande cha mwisho!';
            return `Stock: ${stock.toFixed(2)} / Stock: ${stock.toFixed(2)}`;
        }
        
        // Stock < 1 but can auto-switch
        if (item.next_batch_available && safeFloat(item.next_batch_remaining || 0) >= 0.999999) {
            return `🔄 Auto-switch ready (${item.next_batch_remaining} available) / Tayari kubadilisha (${item.next_batch_remaining} ipo)`;
        }
    }
    
    return '❌ Out of stock / Imeisha';
}

function canAddToCart(item) {
    console.log(`🔍 Stock check for ${item.name} (${item.type}):`, {
        type: item.type,
        batch_remaining: item.batch_remaining,
        safe_batch_remaining: safeFloat(item.batch_remaining || 0),
        next_batch_available: item.next_batch_available,
        next_batch_remaining: item.next_batch_remaining,
        safe_next_batch_remaining: safeFloat(item.next_batch_remaining || 0),
        available_stock: item.available_stock,
        safe_available_stock: safeFloat(item.available_stock || 0),
        batch_status: item.batch_status  // Added for emergency fix
    });
    
    // For SELLING UNITS: Any stock > 0 (with floating point tolerance)
    if (item.type === 'selling_unit') {
        const stock = safeFloat(item.available_stock || item.batch_remaining || 0);
        // Use > 0.000001 instead of > 0 to handle floating point errors
        const canSell = stock > 0.000001;
        console.log(`📦 Selling unit check: ${stock} > 0.000001 = ${canSell}`);
        return canSell;
    }
    
    // For BASE UNITS: need ≥ 1 unit somewhere (with tolerance)
    const currentStock = safeFloat(item.batch_remaining || 0);
    
    // ⚠️ CRITICAL FIX: If batch_status says exhausted, check next batch even if frontend shows stock
    if (item.batch_status === 'exhausted' || item.batch_status === 'all_exhausted') {
        console.log(`⚠️ Batch status is '${item.batch_status}', checking next batch...`);
        if (item.next_batch_available) {
            const nextStock = safeFloat(item.next_batch_remaining || 0);
            if (nextStock >= 0.999999) {
                console.log(`🔄 Can add via next batch: ${nextStock} ≥ 0.999999`);
                return true;
            }
        }
        return false;
    }
    
    // 1. Current batch has ≥ 1 unit (with tolerance)
    if (currentStock >= 0.999999) {
        console.log(`✅ Current batch has ${currentStock} ≥ 0.999999`);
        return true;
    }
    
    // 2. Current batch < 1, but next batch has ≥ 1 unit (with tolerance)
    if (currentStock < 0.999999 && item.next_batch_available) {
        const nextStock = safeFloat(item.next_batch_remaining || 0);
        if (nextStock >= 0.999999) {
            console.log(`🔄 Next batch has ${nextStock} ≥ 0.999999`);
            return true;
        }
    }
    
    // 3. Special case: Current batch is basically 0 due to floating point error
    if (currentStock < 0.000001 && item.next_batch_available) {
        const nextStock = safeFloat(item.next_batch_remaining || 0);
        if (nextStock >= 0.999999) {
            console.log(`🔄 Floating point fix: current=${currentStock} (≈0), next=${nextStock} ≥ 0.999999`);
            return true;
        }
    }
    
    // 4. Cannot sell
    console.log(`❌ No stock available: current=${currentStock}, next_available=${item.next_batch_available}`);
    return false;
}

// ====================================================
// ONE-TAP ITEM HANDLER - FIXED WITH SEPARATE CART ENTRIES + BEEP SOUND + CACHE INVALIDATION
// ====================================================

async function handleOneTap(item) {
    console.group(`ONE-TAP: ${item.name} (${item.type})`);
    console.log('Item received:', {
        type: item.type,
        item_id: item.item_id,
        sell_unit_id: item.sell_unit_id,
        batch_id: item.batch_id,
        price: item.price,
        safe_price: safeFloat(item.price || 0),
        batch_remaining: item.batch_remaining,
        safe_batch_remaining: safeFloat(item.batch_remaining || 0),
        next_batch_available: item.next_batch_available,
        next_batch_remaining: item.next_batch_remaining,
        safe_next_batch_remaining: safeFloat(item.next_batch_remaining || 0),
        batch_status: item.batch_status
    });
    
    // Play beep sound for tactile feedback
    playBeep();
    
    // Add visual feedback on card
    const card = document.querySelector(`[data-item-id="${item.item_id}"][data-batch-id="${item.batch_id}"]`);
    if (card) {
        card.style.transform = 'scale(0.95)';
        card.style.transition = 'transform 0.1s';
        setTimeout(() => {
            card.style.transform = 'scale(1)';
        }, 100);
    }
    
    // Debug: Check if we can add to cart BEFORE calling prepareItemForCart
    console.log('🔍 Pre-check canAddToCart:', canAddToCart(item));
    
    // Get batch intelligence decision
    const { item: cartItem, action, message } = batchIntelligence.prepareItemForCart(item);
    
    // Check if we can add to cart
    if (action === 'cannot_add') {
        console.log('❌ Cannot add to cart:', message);
        showNotification(message || 'Item out of stock! / Bidhaa imeisha!', 'error');
        console.groupEnd();
        return false;
    }
    
    // ✅ CRITICAL: Create UNIQUE cart entry ID
    const uniqueCartId = cartItem.type === 'selling_unit' 
        ? `${cartItem.item_id}_${cartItem.sell_unit_id}_${cartItem.batch_id}`
        : `${cartItem.item_id}_main_${cartItem.batch_id}`;
    
    // ENSURE ALL REQUIRED FIELDS ARE PRESENT
    const enrichedItem = {
        // ✅ UNIQUE ID for cart (differentiates base vs selling unit)
        id: uniqueCartId,
        cart_item_id: uniqueCartId,
        
        // Core IDs
        item_id: cartItem.item_id || item.item_id,
        main_item_id: cartItem.main_item_id || item.main_item_id || cartItem.item_id || item.item_id,
        
        // Names
        name: cartItem.name || item.name,
        display_name: cartItem.display_name || item.display_name || cartItem.name || item.name,
        
        // Quantity & Pricing
        quantity: 1, // Always 1 for one-tap
        sellPrice: cartItem.sellPrice || cartItem.sell_price || cartItem.price || 0,
        sell_price: cartItem.sellPrice || cartItem.sell_price || cartItem.price || 0,
        price: cartItem.price || cartItem.sellPrice || cartItem.sell_price || 0,
        
        // ✅ CRITICAL: CATEGORY FIELDS
        category_id: cartItem.category_id || item.category_id || 'unknown',
        category_name: cartItem.category_name || item.category_name || 'Uncategorized',
        
        // Stock
        stock: cartItem.stock || item.stock || cartItem.available_stock || item.available_stock || 0,
        available_stock: cartItem.available_stock || item.available_stock || cartItem.stock || item.stock || 0,
        
        // ✅ CRITICAL: TYPE MUST BE PRESERVED
        type: cartItem.type || item.type || 'main_item',
        
        // Batch Info
        batch_id: cartItem.batch_id || cartItem.batchId || item.batch_id || item.batchId || null,
        batchId: cartItem.batch_id || cartItem.batchId || item.batch_id || item.batchId || null,
        batch_name: cartItem.batch_name || item.batch_name || null,
        batch_remaining: cartItem.batch_remaining || item.batch_remaining || 0,
        
        // ✅ Selling Unit Info (only for selling units)
        sell_unit_id: cartItem.sell_unit_id || item.sell_unit_id || null,
        conversion_factor: cartItem.conversion_factor || item.conversion_factor || 1,
        
        // Batch Status (critical for emergency fix)
        batch_status: cartItem.batch_status || item.batch_status || 'unknown',
        
        // Optional
        thumbnail: cartItem.thumbnail || item.thumbnail || null,
        
        // Emergency fix metadata
        _emergency_switch: cartItem._emergency_switch || false,
        _proactive_switch: cartItem._proactive_switch || false,
        _batch_switched: cartItem._batch_switched || false
    };
    
    console.log('📦 Enriched item for cart:', {
        id: enrichedItem.id,
        type: enrichedItem.type,
        name: enrichedItem.name,
        price: enrichedItem.price,
        safe_price: safeFloat(enrichedItem.price || 0),
        batch_id: enrichedItem.batch_id,
        batch_remaining: enrichedItem.batch_remaining,
        safe_batch_remaining: safeFloat(enrichedItem.batch_remaining || 0),
        batch_status: enrichedItem.batch_status,
        action: action,
        emergency_switch: enrichedItem._emergency_switch,
        proactive_switch: enrichedItem._proactive_switch
    });
    
    // Show notification if needed
    if (message) {
        let notificationType = 'info';
        if (action === 'switch_and_add') {
            notificationType = enrichedItem._emergency_switch ? 'error' : 'warning';
        } else if (action === 'add_with_warning') {
            notificationType = 'warning';
        }
        
        showNotification(message, notificationType);
    }
    
    // Use cart-icon.js to add ONE item (one-tap = quantity 1)
    if (window.cartIcon && window.cartIcon.addItem) {
        console.log('🛒 Adding to cart via cart-icon.js (one-tap)', {
            name: enrichedItem.name,
            type: enrichedItem.type,
            unique_id: enrichedItem.id,
            batch_id: enrichedItem.batch_id,
            emergency_switch: enrichedItem._emergency_switch
        });
        
        // Pass the enriched item with UNIQUE ID
        const success = window.cartIcon.addItem(enrichedItem);
        
        if (success) {
            // ✅ PERFORMANCE FIX: Immediately invalidate this item from cache
            // This ensures the item appears instantly in next search
            invalidateItemFromCache(enrichedItem.item_id, enrichedItem.sell_unit_id);
            
            // Show success notification
            let successMsg = `Added 1 × ${item.name} / Umeongeza 1 × ${item.name}`;
            if (action === 'switch_and_add') {
                if (enrichedItem._emergency_switch) {
                    successMsg += ` (Emergency batch switch / Mabadiliko ya dharura)`;
                } else if (enrichedItem._proactive_switch) {
                    successMsg += ` (Proactive batch switch / Mabadiliko ya tahadhari)`;
                } else {
                    successMsg += ` (Auto-switched to new batch / Imegeuza batch mpya)`;
                }
            }
            
            showNotification(successMsg, 'success', 2000);
            
            // ✅ FIX: DON'T clear search results - keep them visible
            // Just show success but keep results
            console.log('✅ Item added to cart successfully - results kept visible');
            
        } else {
            console.log('❌ Failed to add to cart');
            showNotification('Failed to add to cart / Imeshindwa kuongeza kwenye kikapu', 'error');
        }
        
        console.groupEnd();
        return success;
    } else {
        console.log('❌ Cart system not loaded');
        showNotification('Cart system not ready. Please refresh. / Mfumo wa kikapu hauko tayari. Tafadhali onyesha upya.', 'error');
        console.groupEnd();
        return false;
    }
}

// ====================================================
// NOTIFICATION SYSTEM
// ====================================================

function showNotification(message, type = 'info', duration = 3000) {
    // Remove existing notification
    const existing = document.getElementById('sales-notification');
    if (existing) existing.remove();
    
    const colors = {
        info: { bg: '#3498db', icon: 'ℹ️' },
        success: { bg: '#2ecc71', icon: '✅' },
        warning: { bg: '#f39c12', icon: '⚠️' },
        error: { bg: '#e74c3c', icon: '🚨' }
    };
    
    const config = colors[type] || colors.info;
    
    const notification = document.createElement('div');
    notification.id = 'sales-notification';
    notification.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        background: ${config.bg};
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        display: flex;
        align-items: center;
        gap: 10px;
        max-width: 400px;
        animation: slideIn 0.3s ease;
        font-weight: 500;
    `;
    
    notification.innerHTML = `
        <span style="font-size: 18px;">${config.icon}</span>
        <span style="font-size: 14px;">${message}</span>
    `;
    
    document.body.appendChild(notification);
    
    // Auto remove after duration
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, duration);
    
    // Add CSS animations if not already present
    if (!document.getElementById('notification-styles')) {
        const style = document.createElement('style');
        style.id = 'notification-styles';
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }
}

// ====================================================
// HELPER FUNCTION TO UPDATE CART ICON IN OVERLAY
// ====================================================

function updateOverlayCartIcon() {
    const cartIconContainer = document.getElementById('sales-overlay-cart');
    if (!cartIconContainer || !window.cartIcon) return;
    
    const count = window.cartIcon.getCount ? window.cartIcon.getCount() : 0;
    const total = window.cartIcon.getTotal ? window.cartIcon.getTotal() : 0;
    const tabsCount = window.cartIcon.getTabsList ? window.cartIcon.getTabsList().length : 1;
    
    cartIconContainer.innerHTML = `
        <div style="
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 8px 16px;
            border-radius: 30px;
            font-weight: 600;
            font-size: 14px;
            cursor: pointer;
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
            border: 1px solid rgba(255,255,255,0.2);
            display: flex;
            align-items: center;
            gap: 8px;
            transition: all 0.2s;
        ">
            🛒 ${count} | KSh ${total.toFixed(2)}
            <span style="
                background: rgba(255,255,255,0.2);
                padding: 2px 8px;
                border-radius: 20px;
                font-size: 11px;
            ">${tabsCount} tab${tabsCount !== 1 ? 's' : ''}</span>
        </div>
    `;
    
    const cartElement = cartIconContainer.firstElementChild;
    cartElement.onclick = (e) => {
        e.stopPropagation();
        if (window.cartIcon && window.cartIcon.showCart) {
            window.cartIcon.showCart();
        }
    };
    
    cartElement.onmouseenter = () => {
        cartElement.style.transform = 'scale(1.05)';
        cartElement.style.boxShadow = '0 6px 20px rgba(102, 126, 234, 0.5)';
    };
    
    cartElement.onmouseleave = () => {
        cartElement.style.transform = 'scale(1)';
        cartElement.style.boxShadow = '0 4px 15px rgba(102, 126, 234, 0.3)';
    };
}

// ====================================================
// SALES OVERLAY (ONE-TAP VERSION) - COMPACT HEADER DESIGN WITH CART ICON
// ====================================================

function createSalesOverlay() {
    if (salesOverlay) return;

    salesOverlay = document.createElement("div");
    salesOverlay.id = "sales-overlay";
    salesOverlay.style.cssText = `
        position: fixed;
        top: ${TOTAL_TOP_OFFSET}px; /* Navbar (60px) + Banner (60px) = 120px */
        left: 0;
        width: 100%;
        height: calc(100vh - ${TOTAL_TOP_OFFSET}px);
        background: #f8fafc;
        z-index: 2000;
        display: none;
        flex-direction: column;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        overflow: hidden;
    `;

    salesOverlay.innerHTML = `
        <!-- Header - Compact design with cart icon integrated -->
        <div style="
            background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
            color: white;
            padding: 12px 16px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            flex-shrink:0;
            border-bottom: 1px solid rgba(255,255,255,0.1);
            position: relative;
            z-index: 2001;
        ">
            <!-- Title row with close button -->
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <h1 style="margin:0; font-size:20px; font-weight:600; display:flex; align-items:center; gap:6px;">
                    <span style="font-size:22px;">🛍️</span>
                    <span>One-Tap Sale</span>
                </h1>
                <button id="close-sales" style="
                    background: rgba(255,255,255,0.2);
                    border: 1px solid rgba(255,255,255,0.3);
                    color: white;
                    width: 40px;
                    height: 40px;
                    border-radius: 20px;
                    font-size: 24px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                ">✕</button>
            </div>
            
            <!-- Search Box - Compact -->
            <div style="position:relative; margin-bottom:8px;">
                <div style="
                    position:absolute; 
                    left:12px; 
                    top:50%; 
                    transform:translateY(-50%); 
                    color: #94a3b8; 
                    font-size:16px; 
                    z-index:1;
                ">🔍</div>
                <input 
                    id="sales-search-input" 
                    placeholder="Search products / Tafuta bidhaa..." 
                    style="
                        width:100%; 
                        padding: 10px 12px 10px 38px; 
                        border: none; 
                        border-radius: 30px; 
                        font-size:14px; 
                        background: rgba(255,255,255,0.08);
                        color: white;
                        box-sizing:border-box;
                        border: 1px solid rgba(255,255,255,0.1);
                        transition: all 0.2s;
                    "
                    onfocus="this.style.background='rgba(255,255,255,0.15)'; this.style.borderColor='#3b82f6'"
                    onblur="this.style.background='rgba(255,255,255,0.08)'; this.style.borderColor='rgba(255,255,255,0.1)'"
                >
                <div id="search-clear" style="
                    position:absolute; 
                    right:12px; 
                    top:50%; 
                    transform:translateY(-50%); 
                    color: #94a3b8; 
                    font-size:16px; 
                    cursor:pointer; 
                    display:none; 
                    z-index:1;
                    width: 28px;
                    height: 28px;
                    background: rgba(255,255,255,0.1);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                ">×</div>
            </div>
            
            <!-- Toolbar - Batch legend and Cart on same line -->
            <div style="
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-top: 4px;
            ">
                <!-- Batch Legend - Compact -->
                <div style="display: flex; gap: 12px;">
                    <div style="display: flex; align-items: center; gap: 3px;" title="Good stock / Ipo kutosha">
                        <div style="width: 8px; height: 8px; background: #2ed573; border-radius: 50%;"></div>
                        <span style="color: #94a3b8; font-size: 10px;">Stock</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 3px;" title="Last item / Kipande cha mwisho">
                        <div style="width: 8px; height: 8px; background: #ffa502; border-radius: 50%;"></div>
                        <span style="color: #94a3b8; font-size: 10px;">Last</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 3px;" title="Out of stock / Imeisha">
                        <div style="width: 8px; height: 8px; background: #ff6b6b; border-radius: 50%;"></div>
                        <span style="color: #94a3b8; font-size: 10px;">Out</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 3px;" title="Auto-switch ready / Tayari kubadilisha">
                        <div style="width: 8px; height: 8px; background: #9b59b6; border-radius: 50%;"></div>
                        <span style="color: #94a3b8; font-size: 10px;">Switch</span>
                    </div>
                </div>
                
                <!-- Cart Icon Container - Will be populated by updateOverlayCartIcon -->
                <div id="sales-overlay-cart"></div>
            </div>
        </div>

        <!-- Results - Now gets maximum space -->
        <div id="sales-results" style="
            flex:1; 
            overflow-y:auto; 
            padding: 16px; 
            background: #f1f5f9;
            -webkit-overflow-scrolling:touch;
        ">
            <div style="
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                min-height: 200px;
                color: #64748b;
                text-align: center;
            ">
                <div style="
                    width: 80px;
                    height: 80px;
                    background: white;
                    border-radius: 40px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin-bottom: 16px;
                    box-shadow: 0 5px 15px rgba(0,0,0,0.05);
                ">
                    <span style="font-size: 36px;">🔍</span>
                </div>
                <h3 style="margin:0 0 4px; color: #334155; font-size:18px; font-weight:600;">Search Products</h3>
                <p style="margin:0; color: #64748b; font-size:14px;">Type 2+ letters to search</p>
            </div>
        </div>
        
        <!-- Info Footer - Minimal -->
        <div style="
            padding: 8px 16px; 
            background: white; 
            border-top: 1px solid #e2e8f0; 
            color: #64748b; 
            font-size: 11px; 
            text-align: center; 
            flex-shrink:0;
        ">
            <span>👆 Tap = 1 item • 🔄 Auto-switch batches</span>
        </div>
    `;

    document.body.appendChild(salesOverlay);

    // Event listeners
    document.getElementById("close-sales").onclick = closeSalesOverlay;
    const searchInput = document.getElementById("sales-search-input");
    const searchClear = document.getElementById("search-clear");

    searchInput.oninput = (e) => {
        const query = e.target.value;
        searchClear.style.display = query ? 'flex' : 'none';
        onSearchInput(query);
    };

    searchInput.onkeydown = (e) => {
        if (e.key === 'Escape') {
            searchInput.value = '';
            searchClear.style.display = 'none';
            clearSearchResults();
        }
    };

    searchClear.onclick = () => {
        searchInput.value = '';
        searchClear.style.display = 'none';
        clearSearchResults();
        searchInput.focus();
    };
    
    // Initial update of cart icon
    setTimeout(() => {
        updateOverlayCartIcon();
    }, 100);
}

// ====================================================
// SEARCH FUNCTIONS - OPTIMIZED FOR SPEED WITH HYBRID APPROACH
// ====================================================

function clearSearchResults() {
    lastSearchResults = [];
    lastSearchQuery = '';
    const results = document.getElementById("sales-results");
    if (!results) return;
    results.innerHTML = `
        <div style="
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 300px;
            color: #64748b;
            text-align: center;
        ">
            <div style="
                width: 120px;
                height: 120px;
                background: white;
                border-radius: 60px;
                display: flex;
                align-items: center;
                justify-content: center;
                margin-bottom: 24px;
                box-shadow: 0 10px 25px rgba(0,0,0,0.05);
            ">
                <span style="font-size: 48px;">🔍</span>
            </div>
            <h3 style="margin:0 0 8px; color: #334155; font-size:20px; font-weight:600;">Search Products / Tafuta Bidhaa</h3>
            <p style="margin:0; color: #64748b; font-size:15px;">Type 2+ letters to search / Andika herufi 2+ kutafuta</p>
        </div>
    `;
}

async function onSearchInput(query) {
    clearTimeout(searchTimeout);
    const results = document.getElementById("sales-results");

    if (!query.trim()) {
        clearSearchResults();
        return;
    }

    // Show "type more" message for single character
    if (query.length < 2) {
        results.innerHTML = `
            <div style="
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                min-height: 300px;
                color: #64748b;
                text-align: center;
            ">
                <div style="
                    width: 100px;
                    height: 100px;
                    background: white;
                    border-radius: 50px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin-bottom: 20px;
                ">
                    <span style="font-size: 40px;">⌨️</span>
                </div>
                <p style="color: #334155; font-size:16px;">Type at least 2 letters to search... / Andika angalau herufi 2 kutafuta...</p>
            </div>
        `;
        return;
    }

    // ⚡ OPTIMIZED: Reduced delay for faster response
    searchTimeout = setTimeout(async () => {
        console.log(`🔍 SEARCH: "${query}"`);
        
        // Show loading state
        results.innerHTML = `
            <div style="
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                min-height: 300px;
            ">
                <div style="
                    width: 60px;
                    height: 60px;
                    border: 4px solid #e2e8f0;
                    border-top: 4px solid #3b82f6;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin-bottom: 20px;
                "></div>
                <p style="color: #334155; font-size:16px;">Searching for "${query}" / Inatafuta "${query}"</p>
            </div>
        `;
        
        // Add spinner animation if needed
        if (!document.getElementById('spinner-styles')) {
            const style = document.createElement('style');
            style.id = 'spinner-styles';
            style.textContent = `
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(style);
        }
        
        // PERFORMANCE FIX: Hybrid search approach
        
        // 1. IMMEDIATE: Search local cache while waiting for backend
        const localResults = searchLocalCache(query);
        let backendResults = null;
        let backendComplete = false;
        
        // If we have local results, show them immediately
        if (localResults.length > 0) {
            console.log(`⚡ Showing ${localResults.length} local results immediately`);
            lastSearchResults = localResults;
            lastSearchQuery = query;
            renderResults(localResults);
            updateOverlayCartIcon();
        }
        
        // 2. BACKGROUND: Try backend for richer results
        if (useBackend && currentShopId) {
            try {
                const startTime = Date.now();
                
                const res = await fetch(`${FLASK_BACKEND_URL}/sales`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ 
                        query, 
                        shop_id: currentShopId,
                        user_id: currentUser?.uid 
                    })
                });

                if (!res.ok) {
                    throw new Error(`Backend returned ${res.status}`);
                }

                const data = await res.json();
                const searchTime = Date.now() - startTime;
                
                console.log(`✅ Backend search completed in ${searchTime}ms`, {
                    results: data.items?.length || 0
                });
                
                if (data.items?.length > 0) {
                    backendResults = data.items;
                    backendComplete = true;
                    
                    // Update local cache with backend results
                    data.items.forEach(item => {
                        const key = item.type === 'selling_unit' 
                            ? `${item.item_id}_${item.sell_unit_id}`
                            : item.item_id;
                        localItemCache.set(key, item);
                    });
                    
                    // Only replace results if backend found more/better items
                    if (!localResults.length || data.items.length > localResults.length) {
                        console.log('✨ Updating with richer backend results');
                        lastSearchResults = data.items;
                        lastSearchQuery = query;
                        renderResults(data.items);
                        updateOverlayCartIcon();
                    }
                }
                
            } catch (backendError) {
                console.log('⚠️ Backend search failed, using local results only:', backendError);
                useBackend = false;
            }
        }
        
        // If we have no local results and backend failed, show no results
        if (!backendComplete && localResults.length === 0) {
            showNoResults(results);
        }
        
    }, 100); // Reduced from 150ms to 100ms
}

// Helper functions for cleaner code
function showNoResults(container) {
    container.innerHTML = `
        <div style="
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 300px;
            color: #64748b;
            text-align: center;
        ">
            <div style="
                width: 100px;
                height: 100px;
                background: white;
                border-radius: 50px;
                display: flex;
                align-items: center;
                justify-content: center;
                margin-bottom: 20px;
            ">
                <span style="font-size: 40px;">🔍</span>
            </div>
            <h3 style="margin:0 0 8px; color: #334155; font-size:18px;">No items found / Hakuna bidhaa</h3>
            <p style="margin:0; color: #64748b; font-size:14px;">Try a different search term / Jaribu maneno mengine</p>
        </div>
    `;
}

function showError(container) {
    container.innerHTML = `
        <div style="
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 300px;
            color: #64748b;
            text-align: center;
        ">
            <div style="
                width: 100px;
                height: 100px;
                background: #fee2e2;
                border-radius: 50px;
                display: flex;
                align-items: center;
                justify-content: center;
                margin-bottom: 20px;
            ">
                <span style="font-size: 40px;">❌</span>
            </div>
            <h3 style="margin:0 0 8px; color: #dc2626; font-size:18px;">Search failed / Imeshindwa kutafuta</h3>
            <p style="margin:0; color: #64748b; font-size:14px;">Please try again / Tafadhali jaribu tena</p>
        </div>
    `;
}

// ====================================================
// FALLBACK: Local Firestore Search (Keep for compatibility)
// ====================================================
async function searchLocalFirestore(query) {
    try {
        if (!currentShopId) return [];
        
        const results = [];
        const searchTerm = query.toLowerCase();
        
        // Get all categories
        const categoriesRef = collection(db, "Shops", currentShopId, "categories");
        const categoriesSnap = await getDocs(categoriesRef);
        
        for (const categoryDoc of categoriesSnap.docs) {
            const categoryId = categoryDoc.id;
            const categoryData = categoryDoc.data();
            
            // Get items in this category
            const itemsRef = collection(db, "Shops", currentShopId, "categories", categoryId, "items");
            const itemsSnap = await getDocs(itemsRef);
            
            itemsSnap.forEach(itemDoc => {
                const itemData = itemDoc.data();
                const itemName = (itemData.name || "").toLowerCase();
                
                // Simple search matching
                if (itemName.includes(searchTerm)) {
                    results.push({
                        item_id: itemDoc.id,
                        main_item_id: itemDoc.id,
                        category_id: categoryId,
                        category_name: categoryData.name || "Uncategorized",
                        name: itemData.name,
                        type: "main_item",
                        price: itemData.sellPrice || itemData.price || 0,
                        sellPrice: itemData.sellPrice || itemData.price || 0,
                        batch_id: itemData.currentBatchId || "default",
                        batch_remaining: itemData.stock || 0,
                        batch_name: "Current Stock",
                        stock: itemData.stock || 0,
                        thumbnail: itemData.images?.[0] || null,
                        batch_status: "active"
                    });
                }
            });
            
            // Also check for selling units
            for (const itemDoc of itemsSnap.docs) {
                const itemId = itemDoc.id;
                
                // Check selling units subcollection
                const sellUnitsRef = collection(db, "Shops", currentShopId, "categories", categoryId, "items", itemId, "sellUnits");
                const sellUnitsSnap = await getDocs(sellUnitsRef);
                
                sellUnitsSnap.forEach(sellDoc => {
                    const sellData = sellDoc.data();
                    const sellName = (sellData.name || "").toLowerCase();
                    
                    if (sellName.includes(searchTerm)) {
                        results.push({
                            item_id: itemId,
                            sell_unit_id: sellDoc.id,
                            main_item_id: itemId,
                            category_id: categoryId,
                            category_name: categoryData.name || "Uncategorized",
                            name: sellData.name,
                            display_name: sellData.name,
                            type: "selling_unit",
                            price: sellData.sellPrice || 0,
                            sellPrice: sellData.sellPrice || 0,
                            batch_id: "default",
                            batch_remaining: sellData.stock || 0,
                            available_stock: sellData.stock || 0,
                            batch_name: "Selling Unit",
                            stock: sellData.stock || 0,
                            thumbnail: sellData.images?.[0]?.thumb || sellData.images?.[0]?.url || null,
                            conversion_factor: sellData.conversionFactor || sellData.conversion || 1,
                            batch_status: "active"
                        });
                    }
                });
            }
        }
        
        console.log(`✅ Local search found ${results.length} items`);
        return results;
        
    } catch (error) {
        console.error("❌ Local search error:", error);
        return [];
    }
}

// ====================================================
// RENDER RESULTS WITH ONE-TAP FUNCTIONALITY - PROFESSIONAL CARDS (UPDATED WITH KSh + RESPONSIVE CLASS)
// ====================================================

function renderResults(items) {
    const resultsContainer = document.getElementById("sales-results");
    resultsContainer.innerHTML = '';
    
    console.log(`📋 Rendering ${items.length} results`);
    
    // Filter items based on canAddToCart
    const availableItems = items.filter(item => canAddToCart(item));
    const outOfStockItems = items.filter(item => !canAddToCart(item));
    
    console.log('📊 Item availability:', {
        total: items.length,
        available: availableItems.length,
        outOfStock: outOfStockItems.length
    });
    
    // Render available items first
    if (availableItems.length > 0) {
        const groupHeader = document.createElement('div');
        groupHeader.style.cssText = `
            color: #0f172a;
            font-size: 18px;
            font-weight: 700;
            margin: 0 0 16px 0;
            padding: 0 8px;
            display: flex;
            align-items: center;
            gap: 8px;
        `;
        groupHeader.innerHTML = `
            <span style="
                background: #2ed573;
                width: 8px;
                height: 24px;
                border-radius: 4px;
                display: inline-block;
            "></span>
            Available Items / Bidhaa Zilizopo (${availableItems.length})
        `;
        resultsContainer.appendChild(groupHeader);
        
        availableItems.forEach(item => renderItemCard(item, resultsContainer));
    }
    
    // Render out of stock items
    if (outOfStockItems.length > 0) {
        const groupHeader = document.createElement('div');
        groupHeader.style.cssText = `
            color: #64748b;
            font-size: 18px;
            font-weight: 700;
            margin: 24px 0 16px 0;
            padding: 0 8px;
            display: flex;
            align-items: center;
            gap: 8px;
        `;
        groupHeader.innerHTML = `
            <span style="
                background: #94a3b8;
                width: 8px;
                height: 24px;
                border-radius: 4px;
                display: inline-block;
            "></span>
            Out of Stock / Zilizoisha (${outOfStockItems.length})
        `;
        resultsContainer.appendChild(groupHeader);
        
        outOfStockItems.forEach(item => renderItemCard(item, resultsContainer));
    }
    
    // If no items at all
    if (items.length === 0) {
        resultsContainer.innerHTML = `
            <div style="
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                min-height: 300px;
                color: #64748b;
                text-align: center;
            ">
                <div style="
                    width: 120px;
                    height: 120px;
                    background: white;
                    border-radius: 60px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin-bottom: 24px;
                    box-shadow: 0 10px 25px rgba(0,0,0,0.05);
                ">
                    <span style="font-size: 48px;">🔍</span>
                </div>
                <h3 style="margin:0 0 8px; color: #334155; font-size:20px; font-weight:600;">No items found / Hakuna bidhaa</h3>
                <p style="margin:0; color: #64748b; font-size:15px;">Try a different search term / Jaribu maneno mengine</p>
            </div>
        `;
    }
    
    console.log(`✅ Rendered ${items.length} items`);
}

function renderItemCard(item, resultsContainer) {
    const stock = getItemStock(item);
    const stockColor = getStockColor(item);
    const stockText = getStockText(item);
    const canAdd = canAddToCart(item);
    const price = getItemPrice(item);
    
    // Determine batch indicator based on actual stock
    let batchIndicator = '';
    
    if (item.type === 'selling_unit') {
        if (stock > 0.000001) {
            batchIndicator = '📦 SELLING UNIT';
        } else {
            batchIndicator = '❌ OUT OF STOCK';
        }
    } else {
        // Base unit indicators
        if (canAdd) {
            if (stock >= 0.999999) {
                if (stock < 1.999999) {
                    batchIndicator = '🚨 LAST ITEM';
                } else if (stock < 10) {
                    batchIndicator = '⚠️ LOW STOCK';
                } else {
                    batchIndicator = '✅ IN STOCK';
                }
            } else if (stock < 0.999999 && item.next_batch_available && safeFloat(item.next_batch_remaining || 0) >= 0.999999) {
                batchIndicator = '🔄 AUTO-SWITCH';
            }
        } else {
            batchIndicator = '❌ OUT OF STOCK';
        }
    }
    
    // Emergency switch indicator
    if (item.batch_status === 'exhausted' && item.next_batch_available && safeFloat(item.next_batch_remaining || 0) >= 0.999999) {
        batchIndicator = '🚨 EMERGENCY SWITCH';
        stockColor = '#e74c3c';
    }
    
    const card = document.createElement('div');
    card.dataset.itemId = item.item_id;
    card.dataset.batchId = item.batch_id;
    card.dataset.canAdd = canAdd;
    card.classList.add('sales-item-card'); // ADDED: Class for responsive styling
    
    card.style.cssText = `
        background: white;
        border-radius: 20px;
        padding: 20px;
        margin-bottom: 16px;
        border: 1px solid #e2e8f0;
        cursor: ${canAdd ? 'pointer' : 'default'};
        position: relative;
        transition: all 0.2s ease;
        opacity: ${canAdd ? '1' : '0.8'};
        box-shadow: 0 4px 12px rgba(0,0,0,0.02);
    `;
    
    if (canAdd) {
        card.onmouseenter = () => {
            card.style.transform = 'translateY(-2px)';
            card.style.boxShadow = '0 12px 25px rgba(0,0,0,0.08)';
            card.style.borderColor = '#3b82f6';
        };
        card.onmouseleave = () => {
            card.style.transform = 'translateY(0)';
            card.style.boxShadow = '0 4px 12px rgba(0,0,0,0.02)';
            card.style.borderColor = '#e2e8f0';
        };
    }

    let displayName = item.name;
    if (item.type === 'selling_unit' && item.display_name) {
        displayName = `${item.name.split('(')[0].trim()} (${item.display_name})`;
    }

    card.innerHTML = `
        ${batchIndicator ? `
            <div class="stock-badge" style="background: ${stockColor}; box-shadow: 0 2px 8px ${stockColor}40;">
                ${batchIndicator}
            </div>
        ` : ''}
        
        <div style="display:flex; align-items:center; gap:20px;">
            <div class="item-thumbnail" style="
                width: 80px;
                height: 80px;
                background: #f8fafc;
                border-radius: 16px;
                overflow: hidden;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink:0;
                border: 1px solid #e2e8f0;
            ">
                ${item.thumbnail ? 
                    `<img src="${item.thumbnail}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none';this.parentElement.innerHTML='<span style=\\'font-size:32px;color:#94a3b8\\'>📦</span>';">` : 
                    `<span style="font-size:32px;color:#94a3b8">📦</span>`
                }
            </div>
            <div style="flex:1; min-width:0;">
                <div class="item-name" style="
                    font-weight: 700;
                    color: ${canAdd ? '#0f172a' : '#64748b'};
                    font-size: 18px;
                    margin-bottom: 8px;
                    line-height: 1.3;
                    word-break: break-word;
                ">${displayName}</div>
                
                <div style="display:flex; align-items:center; gap:16px; margin-bottom: 12px; flex-wrap:wrap;">
                    <div class="item-price" style="
                        color: ${canAdd ? '#0f172a' : '#94a3b8'};
                        font-weight: 800;
                        font-size: 24px;
                        flex-shrink:0;
                    ">
                        KSh ${price.toFixed(2)}
                    </div>
                    ${item.batch_name ? `
                        <div style="
                            background: #f1f5f9; 
                            color: #475569; 
                            padding: 4px 10px; 
                            border-radius: 8px; 
                            font-size: 12px;
                            font-weight: 500;
                        ">
                            ${item.batch_name}
                        </div>
                    ` : ''}
                    ${item.type === 'selling_unit' ? `
                        <div style="
                            background: #f3e8ff; 
                            color: #9333ea; 
                            padding: 4px 10px; 
                            border-radius: 8px; 
                            font-size: 12px;
                            font-weight: 500;
                        ">
                            Selling Unit
                        </div>
                    ` : ''}
                </div>
                
                <div class="stock-text" style="
                    color: ${stockColor}; 
                    font-size: 14px; 
                    font-weight: 500; 
                    display: flex; 
                    align-items: center; 
                    gap: 8px;
                    margin-bottom: 8px;
                ">
                    <div style="
                        width: 10px;
                        height: 10px;
                        border-radius: 50%;
                        background: ${stockColor};
                        ${stock < 1.999999 && stock >= 0.999999 ? 'animation: pulse 1.5s infinite;' : ''}
                    "></div>
                    ${stockText}
                </div>
                
                ${item.type === 'selling_unit' && item.conversion_factor ? 
                    `<div class="conversion-info" style="
                        font-size: 13px; 
                        color: #64748b; 
                        margin-top: 4px;
                        padding-top: 8px;
                        border-top: 1px dashed #e2e8f0;
                    ">
                        <span style="font-weight:500;">1 Main Item</span> = ${item.conversion_factor} ${item.display_name || 'units'}
                    </div>` : ''
                }
            </div>
        </div>
        
        ${canAdd ? `
            <div style="
                margin-top: 16px; 
                text-align: right; 
                font-size: 13px; 
                color: #3b82f6; 
                border-top: 1px solid #f1f5f9; 
                padding-top: 12px;
                font-weight: 500;
                display: flex;
                align-items: center;
                justify-content: flex-end;
                gap: 6px;
            ">
                <span>👆</span>
                <span>Tap to add 1 to cart / Gusa kuongeza 1 kwenye kikapu</span>
            </div>
        ` : ''}
    `;

    if (canAdd) {
        card.onclick = () => {
            console.log('Item selected:', {
                name: item.name,
                type: item.type,
                batch_id: item.batch_id,
                batch_remaining: item.batch_remaining,
                safe_batch_remaining: safeFloat(item.batch_remaining || 0),
                next_batch_available: item.next_batch_available,
                batch_status: item.batch_status
            });
            
            // Play beep sound when item is tapped
            playBeep();
            
            // Visual feedback
            card.style.transform = 'scale(0.98)';
            card.style.background = '#f8fafc';
            setTimeout(() => {
                card.style.transform = 'scale(1)';
                card.style.background = 'white';
            }, 100);
            
            handleOneTap(item);
        };
        
        // Add click effect
        card.style.cursor = 'pointer';
        card.onmousedown = () => {
            card.style.transform = 'scale(0.98)';
        };
        card.onmouseup = () => {
            card.style.transform = 'scale(1)';
        };
    }
    
    resultsContainer.appendChild(card);
    
    // Add pulse animation styles if not already present
    if (!document.getElementById('pulse-styles')) {
        const style = document.createElement('style');
        style.id = 'pulse-styles';
        style.textContent = `
            @keyframes gentlePulse {
                0%, 100% { opacity: 1; transform: scale(1); }
                50% { opacity: 0.9; transform: scale(1.02); }
            }
            @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.5; }
            }
        `;
        document.head.appendChild(style);
    }
}

// ====================================================
// OPEN / CLOSE OVERLAY - FIXED FOR STAFF LOGIN + PERFORMANCE WARMUP
// ====================================================

/**
 * Opens the sales overlay and resolves the correct shop ID
 * - For owners: Uses Users collection to get shop_id
 * - For staff: Uses staffContext from localStorage
 */
async function openSalesOverlay() {
    const auth = getAuth();
    currentUser = auth.currentUser;
    
    if (!currentUser) { 
        showNotification("Please login first / Tafadhali ingia kwanza", "error");
        return; 
    }
    
    console.log('🚀 Opening Sales Overlay');
    console.log('👤 Current user:', currentUser.uid);
    
    // ✅ HIDE the floating cart icon when sales overlay opens
    if (window.cartIcon && window.cartIcon.hideIcon) {
        window.cartIcon.hideIcon();
        console.log('🛒 Floating cart icon hidden');
    }
    
    // ✅ Check if this is a staff login from localStorage
    const sessionType = localStorage.getItem("sessionType");
    console.log('📋 Session type:', sessionType);
    
    let shopId = currentUser.uid; // Default to user's UID (works for owners)
    
    if (sessionType === "staff") {
        // ✅ This is a staff member - get shopId from staffContext
        try {
            const staffContext = JSON.parse(localStorage.getItem("staffContext") || "{}");
            console.log('👥 Staff context:', staffContext);
            
            if (staffContext.shopId) {
                shopId = staffContext.shopId;
                console.log('✅ Using shop ID from staff context:', shopId);
            } else {
                console.error('❌ No shopId in staff context');
                showNotification("Staff context error - please login again", "error");
                return;
            }
        } catch (e) {
            console.error('❌ Error parsing staff context:', e);
            showNotification("Staff login error - please try again", "error");
            return;
        }
    } else {
        // ✅ Owner login - try to resolve from Users collection
        try {
            const snap = await getDoc(doc(db, "Users", shopId));
            if (snap.exists() && snap.data().shop_id) {
                shopId = snap.data().shop_id;
                console.log('✅ Owner shop ID resolved:', { 
                    original: currentUser.uid, 
                    resolved: shopId 
                });
            } else {
                console.log('ℹ️ Using original UID as shop ID (owner)');
            }
        } catch (error) {
            console.log('⚠️ Error resolving owner shop ID:', error);
            // Continue with original shopId
        }
    }
    
    currentShopId = shopId;
    console.log('📍 FINAL SHOP ID FOR SEARCH:', currentShopId);
    console.log('👤 USER ID:', currentUser.uid);

    createSalesOverlay();
    salesOverlay.style.display = 'flex';
    
    // PERFORMANCE FIX: Build local cache and warm up backend
    await Promise.all([
        buildLocalItemCache(shopId),
        warmUpBackend()
    ]);
    
    // If there are previous results, restore them
    if (lastSearchResults.length > 0) {
        setTimeout(() => {
            renderResults(lastSearchResults);
            const searchInput = document.getElementById('sales-search-input');
            if (searchInput && lastSearchQuery) {
                searchInput.value = lastSearchQuery;
                const searchClear = document.getElementById('search-clear');
                if (searchClear) searchClear.style.display = 'flex';
            }
            updateOverlayCartIcon();
        }, 100);
    }
    
    setTimeout(() => {
        const input = document.getElementById("sales-search-input");
        if (input) input.focus();
        updateOverlayCartIcon();
    }, 50);
}

function closeSalesOverlay() {
    if (salesOverlay) {
        console.log('🔒 Closing Sales Overlay');
        salesOverlay.style.display = 'none';
        
        // ✅ SHOW the floating cart icon when sales overlay closes
        if (window.cartIcon && window.cartIcon.showIcon) {
            window.cartIcon.showIcon();
            console.log('🛒 Floating cart icon shown');
        }
    }
}

// ====================================================
// INITIALIZATION
// ====================================================

document.addEventListener("DOMContentLoaded", () => {
    console.log('⚡ Sales System Initialization');
    
    // Initialize beep sound
    initBeepSound();
    
    // Check if cart-icon.js is loaded
    if (!window.cartIcon) {
        console.log('⚠️ cart-icon.js not loaded yet. Waiting...');
        
        // Try to check again after a delay
        setTimeout(() => {
            if (window.cartIcon) {
                console.log('✅ cart-icon.js now loaded');
                // If overlay is open, update cart icon
                if (salesOverlay && salesOverlay.style.display === 'flex') {
                    updateOverlayCartIcon();
                }
            } else {
                console.log('❌ cart-icon.js still not loaded');
                console.error('cart-icon.js is required for sales functionality');
            }
        }, 1000);
    } else {
        console.log('✅ cart-icon.js is loaded');
    }
    
    // Expose functions globally
    window.openSalesOverlay = openSalesOverlay;
    window.closeSalesOverlay = closeSalesOverlay;
    window.batchIntelligence = batchIntelligence;
    window.updateOverlayCartIcon = updateOverlayCartIcon; // Expose for cart updates
    
    // Initialize sell button
    const sellBtn = document.getElementById("sell-btn");
    if (sellBtn) {
        sellBtn.addEventListener("click", e => { 
            e.preventDefault(); 
            console.log('Sell button clicked');
            openSalesOverlay(); 
        });
        console.log('✅ Sell button initialized');
    } else {
        console.log('⚠️ Sell button not found in DOM');
    }
    
    // Add keyboard shortcut (Alt+S for sales)
    document.addEventListener('keydown', (e) => {
        if (e.altKey && e.key === 's') {
            e.preventDefault();
            console.log('Keyboard shortcut activated: Alt+S');
            openSalesOverlay();
        }
    });
    
    // Listen for cart updates to refresh the overlay cart icon
    document.addEventListener('cartUpdated', () => {
        if (salesOverlay && salesOverlay.style.display === 'flex') {
            updateOverlayCartIcon();
        }
    });
    
    // Periodically check cart icon if needed
    setInterval(() => {
        if (salesOverlay && salesOverlay.style.display === 'flex' && window.cartIcon) {
            updateOverlayCartIcon();
        }
    }, 2000);
    
    console.log('✅ Sales system ready');
    console.log('🚨 EMERGENCY FIX ACTIVE: Handling frontend/backend stock mismatch');
    console.log('🔧 SEARCH FIX: Added local fallback search when backend is unavailable');
    console.log('👥 STAFF FIX: Proper shop ID resolution for staff logins');
    console.log('🎨 UX FIX: Results persist after tapping + Professional design');
    console.log('🔊 AUDIO FIX: Added beep sound when tapping items');
    console.log('💰 CURRENCY: All prices now in KSh (Kenyan Shillings)');
    console.log('📱 RESPONSIVE: Added mobile-optimized badge positioning');
    console.log('🛒 CART ICON: Integrated into sales overlay header');
    console.log('🔄 CART ICON FIX: Floating cart hides when overlay opens, shows when closed');
    console.log('🔘 CLOSE BUTTON FIX: Made more visible and accessible');
    console.log('⚡ PERFORMANCE FIX #1: Immediate cache invalidation after adding items');
    console.log('⚡ PERFORMANCE FIX #2: Hybrid search (instant local + background backend)');
    console.log('⚡ PERFORMANCE FIX #3: Pre-warm backend connection on overlay open');
    
    console.log(`
╔═══════════════════════════════════════════╗
║     🛍️ ONE-TAP SALES SYSTEM READY        ║
╠═══════════════════════════════════════════╣
║ • One tap = 1 item to cart               ║
║ • Auto batch switching                   ║
║ • No quantity prompts                    ║
║ • Integrated with cart-icon.js           ║
║ • 🛒 Cart icon in sales header           ║
║ • 🔄 Floating cart hides during sale     ║
║ • 🔘 Close button always visible         ║
║ • ⚡ INSTANT SEARCH (local cache)        ║
║ • ⚡ ITEMS APPEAR IMMEDIATELY            ║
║ • Press Alt+S to open sales              ║
║ • 💰 Currency: KSh (Kenyan Shillings)    ║
║ • 📱 Mobile-optimized badges & cards     ║
╚═══════════════════════════════════════════╝
`);
});

// ====================================================
// EXPORT FOR MODULE USAGE
// ====================================================

export {
    openSalesOverlay,
    closeSalesOverlay,
    batchIntelligence,
    handleOneTap,
    updateOverlayCartIcon
};