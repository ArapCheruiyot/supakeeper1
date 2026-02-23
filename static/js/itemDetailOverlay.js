// itemDetailOverlay.js - COMPLETE VERSION WITH ORIGINAL VISUAL CHARM + BILINGUAL TEXT + KSH CURRENCY
// ✅ Preserves ALL existing functionality
// ✅ Restores original visual design (icons, lines, sections)
// ✅ Keeps bilingual text (English + Swahili)
// ✅ Changed all currency from $ to KSh for Kenyan market
// ✅ Maintains all improvements

import { db } from "./firebase-config.js";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  arrayUnion,
  increment,
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

const CLOUDINARY_CLOUD = "decckqobb";
const CLOUDINARY_UPLOAD_PRESET = "Superkeeper";
const FLASK_BACKEND_URL = window.location.origin;

document.addEventListener("DOMContentLoaded", () => {
  const overlay = document.getElementById("overlay");
  const overlayContent = document.querySelector(".overlay-content");
  const itemDetail = document.getElementById("item-detail");
  const itemNameEl = document.getElementById("item-name");
  const itemMeta = document.getElementById("item-meta");
  const editToggleBtn = document.getElementById("edit-toggle-btn");

  let currentItem = null;
  let captureInProgress = false;
  let editMode = false;

  console.log("itemDetailOverlay.js loaded with original visual charm + bilingual text + KSh currency");

  // One-time: wire Selling Units module if present
  try {
    window.sellingUnitsConfigure?.({
      db,
      auth: getAuth(),
      FS: { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, serverTimestamp },
      cloudName: CLOUDINARY_CLOUD,
      uploadPreset: CLOUDINARY_UPLOAD_PRESET
    });
  } catch (e) {
    console.warn("[SellingUnits] configure skipped:", e);
  }

  // =========================================================
  // SESSION / RBAC / ACTOR HELPERS
  // =========================================================
  function safeParse(json) {
    try { return JSON.parse(json); } catch { return null; }
  }

  function getSessionType() {
    return localStorage.getItem("sessionType") || "owner";
  }

  function getAccessLevel() {
    if (getSessionType() === "staff") {
      const ctx = safeParse(localStorage.getItem("staffContext")) || {};
      return Number(ctx.accessLevel ?? 1);
    }
    return 4; // owner
  }

  function canManageStock() {
    return getAccessLevel() >= 2;
  }

  function getActiveShopId() {
    return localStorage.getItem("activeShopId");
  }

  function getActor() {
    const auth = getAuth();
    const user = auth.currentUser;
    const sessionType = getSessionType();

    if (sessionType === "staff") {
      const ctx = safeParse(localStorage.getItem("staffContext")) || {};
      return {
        type: "staff",
        authUid: user?.uid || null,
        staffId: ctx.staffId || null,
        name: ctx.name || user?.displayName || "",
        email: ctx.email || user?.email || "",
        roleName: ctx.roleName || "",
        accessLevel: ctx.accessLevel ?? null,
        shopId: ctx.shopId || getActiveShopId() || null
      };
    }

    return {
      type: "owner",
      authUid: user?.uid || null,
      name: user?.displayName || "",
      email: user?.email || "",
      accessLevel: 4,
      shopId: getActiveShopId() || user?.uid || null
    };
  }

  function actorDisplayName(actor) {
    return actor?.name || actor?.email || actor?.authUid || "User";
  }

  function syncEditButtonUI() {
    if (!editToggleBtn) return;

    if (canManageStock()) {
      editToggleBtn.disabled = false;
      editToggleBtn.style.opacity = "1";
      editToggleBtn.title = "";
      return;
    }

    editToggleBtn.disabled = true;
    editToggleBtn.style.opacity = "0.6";
    editToggleBtn.title = "Access denied: you cannot edit items/stock. / Huna ruhusa ya kuhariri bidhaa.";
    editToggleBtn.textContent = "Edit / Hariri";
    editMode = false;
  }

  // =========================================================
  // UNIT & BATCH HELPERS (BILINGUAL) - UPDATED TO KSH
  // =========================================================
  async function getBaseUnitFromUser(itemName) {
    const exampleText =
      `How do you measure "${itemName}"? / Unapimaje "${itemName}"?\n\n` +
      `Examples / Mifano:\n` +
      `• "bag" / "gunia" for sugar / sukari\n` +
      `• "kg" for rice / mchele\n` +
      `• "carton" / "katoni" for soap / sabuni\n` +
      `• "piece" / "kipande" for items you count / bidhaa unazohesabu\n\n` +
      `Enter your measurement unit: / Weka kipimo chako:`;

    const unit = prompt(exampleText, "piece");
    return unit ? unit.trim().toLowerCase() : "piece";
  }

  async function getBatchPrices(itemData, isFirstBatch = false) {
    const unit = itemData.baseUnit || "unit";
    const currentBuy = itemData.buyPrice || 0;
    const currentSell = itemData.sellPrice || 0;

    if (isFirstBatch) {
      const buyMsg = `Buying price per ${unit}? / Bei ya kununua kwa ${unit}?\nExample / Mfano: KSh 3000 per bag / kwa gunia`;
      const buyPrice = parseFloat(prompt(buyMsg, currentBuy || ""));
      if (isNaN(buyPrice)) return null;

      const sellMsg = `Selling price per ${unit}? / Bei ya kuuza kwa ${unit}?\nExample / Mfano: KSh 3500 per bag / kwa gunia`;
      const sellPrice = parseFloat(prompt(sellMsg, currentSell || ""));
      if (isNaN(sellPrice)) return null;

      return { buyPrice, sellPrice, updateBuy: true, updateSell: true };
    }

    const msg =
      `Adding more stock of "${itemData.name}" / Unaongeza stock ya "${itemData.name}"\n\n` +
      `Current prices / Bei za sasa (per ${unit}):\n` +
      `Buy / Kununua: KSh ${currentBuy} | Sell / Kuuza: KSh ${currentSell}\n\n` +
      `Have prices changed? / Bei zimebadilika?\n` +
      `• Enter "b" to update buy price only / Bonyeza "b" kubadilisha bei ya kununua tu\n` +
      `• Enter "s" to update sell price only / Bonyeza "s" kubadilisha bei ya kuuza tu\n` +
      `• Enter "bs" to update both / Bonyeza "bs" kubadilisha zote\n` +
      `• Enter "n" for no change / Bonyeza "n" ikiwa hazijabadilika\n\n` +
      `Enter your choice / Weka chaguo lako (b/s/bs/n):`;

    const choice = prompt(msg, "n")?.toLowerCase() || "n";

    let buyPrice = currentBuy;
    let sellPrice = currentSell;
    let updateBuy = false;
    let updateSell = false;

    if (choice.includes("b")) {
      const newBuy = parseFloat(prompt(`New buying price per ${unit}: / Bei mpya ya kununua kwa ${unit}:`, currentBuy));
      if (!isNaN(newBuy)) {
        buyPrice = newBuy;
        updateBuy = true;
      }
    }

    if (choice.includes("s")) {
      const newSell = parseFloat(prompt(`New selling price per ${unit}: / Bei mpya ya kuuza kwa ${unit}:`, currentSell));
      if (!isNaN(newSell)) {
        sellPrice = newSell;
        updateSell = true;
      }
    }

    return { buyPrice, sellPrice, updateBuy, updateSell };
  }

  function calculateFIFOCost(batches, quantity) {
    if (!batches || batches.length === 0) return 0;

    let remaining = quantity;
    let totalCost = 0;
    const sortedBatches = [...batches].sort((a, b) => a.timestamp - b.timestamp);

    for (const batch of sortedBatches) {
      if (remaining <= 0) break;
      const available = batch.quantity || 0;
      const use = Math.min(available, remaining);
      totalCost += use * (batch.buyPrice || 0);
      remaining -= use;
    }

    return totalCost;
  }

  // =========================================================
  // SELL-UNITS PRICING HELPERS (BILINGUAL) - UPDATED TO KSH
  // =========================================================
  async function fetchSellUnits(shopId, categoryId, itemId) {
    const colNames = ["sellUnits", "sellingUnits"];
    const results = [];
    for (const colName of colNames) {
      try {
        const colRef = collection(db, "Shops", shopId, "categories", categoryId, "items", itemId, colName);
        const snap = await getDocs(colRef);
        snap.docs.forEach(d => results.push({ id: d.id, __col: colName, ...d.data() }));
      } catch (e) {
        console.warn(`fetchSellUnits: failed for ${colName}`, e);
      }
    }
    return results;
  }

  async function ensureSellUnitPrices(ctx, baseSellPrice, actor) {
    try {
      const units = await fetchSellUnits(ctx.shopId, ctx.categoryId, ctx.itemId);
      if (!units || units.length === 0) return;

      const timestamp = Date.now();
      for (const u of units) {
        const conv = Number(u.conversionFactor ?? u.conversion ?? 1) || 1;
        const suggested = Math.round(((Number(baseSellPrice || 0) / conv) + Number.EPSILON) * 100) / 100;

        if (u.sellPrice == null) {
          let val = prompt(
            `Set selling price for "${u.name}" (no price yet) / Weka bei ya kuuza kwa "${u.name}" (hakuna bei bado)\n` +
            `Suggestion / Mapendekezo: KSh ${suggested} (main price ÷ ${conv})\n\n` +
            `Enter price per ${u.name}: / Weka bei kwa ${u.name}:`,
            String(suggested)
          );
          if (val === null) continue;
          const price = parseFloat(val);
          if (!isFinite(price) || price <= 0) {
            alert(`Skipping "${u.name}" — invalid price. / "${u.name}" imerukwa — bei si sahihi.`);
            continue;
          }
          const uRef = doc(db, "Shops", ctx.shopId, "categories", ctx.categoryId, "items", ctx.itemId, u.__col || "sellUnits", u.id);
          await updateDoc(uRef, {
            sellPrice: price,
            lastSellPriceUpdate: timestamp,
            updatedAt: timestamp,
            updatedBy: actor
          });
          continue;
        }

        const wantsChange = confirm(
          `"${u.name}" current price / bei ya sasa: KSh ${u.sellPrice}\n` +
          `Suggested / Mapendekezo (main price ÷ ${conv}): KSh ${suggested}\n\n` +
          `Do you want to change it now? / Unataka kuibadilisha sasa?`
        );
        if (!wantsChange) continue;

        let val = prompt(
          `Enter new price for "${u.name}": / Weka bei mpya ya "${u.name}":\n` +
          `Suggestion / Mapendekezo: KSh ${suggested}`,
          String(u.sellPrice)
        );
        if (val === null) continue;
        const price = parseFloat(val);
        if (!isFinite(price) || price <= 0) {
          alert(`Skipping "${u.name}" — invalid price. / "${u.name}" imerukwa — bei si sahihi.`);
          continue;
        }
        const uRef = doc(db, "Shops", ctx.shopId, "categories", ctx.categoryId, "items", ctx.itemId, u.__col || "sellUnits", u.id);
        await updateDoc(uRef, {
          sellPrice: price,
          lastSellPriceUpdate: timestamp,
          updatedAt: timestamp,
          updatedBy: actor
        });
      }
    } catch (e) {
      console.warn("ensureSellUnitPrices failed:", e);
    }
  }

  // =========================================================
  // STYLES - RESTORED ORIGINAL VISUAL CHARM
  // =========================================================
  function injectAlertStyles() {
    if (document.getElementById("alert-styles")) return;

    const style = document.createElement("style");
    style.id = "alert-styles";
    style.textContent = `
      #item-detail .item-images {
        display: flex !important;
        flex-direction: row !important;
        flex-wrap: nowrap !important;
        gap: 15px !important;
        margin: 20px 0 !important;
        justify-content: space-between !important;
        width: 100% !important;
      }
      #item-detail .image-slot {
        flex: 1 !important;
        width: 48% !important;
        min-width: 48% !important;
        max-width: 48% !important;
        height: 200px !important;
        border: 2px dashed #ccc !important;
        border-radius: 10px !important;
        overflow: hidden !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        background: #f9f9f9 !important;
        position: relative !important;
        float: left !important;
        box-sizing: border-box !important;
      }
      #item-detail .image-slot.placeholder { color: #999; font-style: italic; font-size: 14px; padding: 20px; text-align: center; }
      #item-detail .item-thumb { width: 100% !important; height: 100% !important; object-fit: cover !important; display: block !important; }
      #item-detail .image-edit-overlay {
        position: absolute; bottom: 0; left: 0; right: 0; background: rgba(0, 0, 0, 0.7);
        padding: 8px; display: flex; justify-content: center; gap: 10px; opacity: 0; transition: opacity 0.3s ease;
      }
      #item-detail .image-slot:hover .image-edit-overlay { opacity: 1; }
      #item-detail .retake-btn { background: #ff6b6b; color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 12px; cursor: pointer; }
      #item-detail .pencil { color: white; }

      .alert-slider-container { margin: 20px 0; padding: 15px; background: #f0fff0; border: 2px solid #2ed573; border-radius: 10px; transition: all 0.3s ease; clear: both; }
      .alert-slider-container.alert-active { background: #fff5f5; border-color: #ff6b6b; }
      .alert-slider-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
      .alert-title { font-size: 16px; font-weight: bold; color: #2ed573; }
      .alert-title.alert-active { color: #ff6b6b; }
      .alert-status { font-size: 12px; padding: 4px 8px; border-radius: 12px; background: #2ed57320; color: #2ed573; font-weight: 500; }
      .alert-status.alert-active { background: #ff6b6b20; color: #ff6b6b; }
      .alert-config-panel { display: none; margin-top: 15px; padding: 20px; background: white; border-radius: 8px; border: 1px solid #e9ecef; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }

      .alert-slider { width: 100%; height: 8px; -webkit-appearance: none; background: linear-gradient(to right, #2ed573, #ff6b6b); border-radius: 4px; outline: none; margin: 10px 0; }
      .alert-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 24px; height: 24px; border-radius: 50%; background: #667eea; cursor: pointer; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.2); }

      .alert-value-display { font-size: 18px; font-weight: bold; color: #667eea; text-align: center; margin: 10px 0; }
      .alert-labels { display: flex; justify-content: space-between; margin-top: 8px; font-size: 12px; color: #666; }
      .alert-buttons { display: flex; gap: 10px; margin-top: 15px; }
      .alert-save-btn { flex: 1; padding: 12px; background: linear-gradient(135deg, #2ed573, #1dd1a1); color: white; border: none; border-radius: 6px; font-weight: 600; font-size: 14px; cursor: pointer; }
      .alert-cancel-btn { flex: 1; padding: 12px; background: #f8f9fa; color: #666; border: 2px solid #e9ecef; border-radius: 6px; font-weight: 600; font-size: 14px; cursor: pointer; }

      #item-detail .item-prices { margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 8px; border: 1px solid #e9ecef; clear: both; }
      #item-detail .capture-actions { margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 8px; text-align: center; }
      #item-detail .capture-status { margin-top: 10px; color: #666; font-style: italic; text-align: center; }

      #item-detail .image-slot:nth-child(1),
      #item-detail .image-slot:nth-child(2) { float: left !important; display: block !important; width: 48% !important; margin-right: 2% !important; }
      #item-detail .image-slot:nth-child(2) { margin-right: 0 !important; }

      @media (min-width: 480px) {
        #item-detail .item-images { display: block !important; font-size: 0 !important; }
        #item-detail .image-slot { display: inline-block !important; vertical-align: top !important; width: 49% !important; margin-right: 2% !important; }
        #item-detail .image-slot:last-child { margin-right: 0 !important; }
      }

      /* Tiny graph icon and section separators - RESTORED */
      .section-icon { font-size: 18px; margin-right: 8px; vertical-align: middle; }
      .section-divider { height: 1px; background: linear-gradient(to right, transparent, #ccc, transparent); margin: 20px 0; }
      .tiny-graph { display: inline-block; width: 12px; height: 12px; background: #4f46e5; border-radius: 2px; margin-right: 4px; }
      
      .batch-item { 
        padding: 8px; margin: 4px 0; background: white; border-radius: 6px; 
        border-left: 3px solid #28a745; box-shadow: 0 1px 3px rgba(0,0,0,0.05);
      }
      .batch-item.old-batch { border-left-color: #f59e0b; }

      .stock-badge {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 11px;
        font-weight: 500;
      }
      .stock-badge.healthy { background: #10b98120; color: #10b981; }
      .stock-badge.warning { background: #f59e0b20; color: #f59e0b; }
      .stock-badge.critical { background: #ef444420; color: #ef4444; }

      /* Camera modal (seamless capture) - FULLSCREEN */
      .sk-cam-backdrop{
        position: fixed;
        inset: 0;
        background: #000;
        z-index: 25000;
      }
      .sk-cam-sheet{
        position: fixed;
        inset: 0;
        width: 100vw;
        height: 100vh;
        background: #000;
        color: #fff;
        border-radius: 0;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }
      .sk-cam-topbar{
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: calc(env(safe-area-inset-top, 0px) + 12px) 12px 12px;
        background: linear-gradient(to bottom, rgba(0,0,0,.75), rgba(0,0,0,0));
        z-index: 2;
      }
      .sk-cam-title{
        font-weight: 700;
        font-size: 15px;
        line-height: 1.2;
      }
      .sk-cam-view{
        position: relative;
        flex: 1;
        width: 100%;
        overflow: hidden;
      }
      .sk-cam-video{
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .sk-cam-hud{
        position: absolute;
        top: 12px;
        left: 12px;
        right: 12px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        z-index: 2;
        pointer-events: none;
      }
      .sk-cam-thumbs{ display:flex; gap:10px; pointer-events:none; }
      .sk-cam-thumb{
        width:56px; height:56px; border-radius:10px;
        background: rgba(255,255,255,.12);
        border: 1px solid rgba(255,255,255,.18);
        overflow:hidden;
        display:flex; align-items:center; justify-content:center;
        font-size:12px; color:#ddd;
      }
      .sk-cam-thumb img{ width:100%; height:100%; object-fit:cover; display:block; }
      .sk-cam-bottombar{
        padding: 12px 12px calc(env(safe-area-inset-bottom, 0px) + 14px);
        background: linear-gradient(to top, rgba(0,0,0,.75), rgba(0,0,0,0));
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        z-index: 2;
      }
      .sk-cam-status{
        position: absolute;
        left: 12px;
        right: 12px;
        bottom: calc(env(safe-area-inset-bottom, 0px) + 96px);
        z-index: 3;
        text-align: center;
        font-size: 13px;
        color: rgba(255,255,255,.9);
        text-shadow: 0 1px 3px rgba(0,0,0,.7);
      }
      .sk-btn{
        border:none; border-radius:10px;
        padding:12px 14px;
        cursor:pointer;
        font-weight:700;
      }
      .sk-btn-secondary{ background:#2d2d2d; color:#fff; }
      .sk-btn-danger{ background:#c0392b; color:#fff; }
      .sk-shutter{
        width: 74px;
        height: 74px;
        border-radius: 50%;
        background: #fff;
        border: 6px solid rgba(255,255,255,.35);
        cursor: pointer;
      }
      .sk-shutter:active{ transform: scale(0.98); }
    `;
    document.head.appendChild(style);
  }

  // =========================================================
  // ALERT HELPERS (BILINGUAL)
  // =========================================================
  function updateAlertSliderValue(sliderId, displayId) {
    const slider = document.getElementById(sliderId);
    const display = document.getElementById(displayId);
    if (slider && display) {
      const value = parseInt(slider.value);
      display.textContent = value;
      const percent = (value / 50) * 100;
      slider.style.background = `linear-gradient(to right, #2ed573 ${percent}%, #ff6b6b ${percent}%)`;
      return value;
    }
    return 0;
  }

  async function saveAlertSettings() {
    if (!currentItem) return;
    if (!canManageStock()) {
      alert("Access denied: You don't have permission to change alert settings. / Huna ruhusa ya kubadilisha mipangilio ya arifa.");
      return;
    }

    const actor = getActor();
    const alertValue = parseInt(document.getElementById("alert-slider")?.value || 5);
    const alertDescription = document.getElementById("alert-description")?.value.trim() || "";

    const itemRef = doc(
      db, "Shops", currentItem.uid,
      "categories", currentItem.categoryId,
      "items", currentItem.itemId
    );

    try {
      await updateDoc(itemRef, {
        lowStockAlert: alertValue,
        alertDescription: alertDescription || null,
        alertLastChecked: Date.now(),
        updatedAt: Date.now(),
        updatedBy: actor
      });

      currentItem.data.lowStockAlert = alertValue;
      currentItem.data.alertDescription = alertDescription || null;
      
      showStatus("✅ Alert settings saved / Mipangilio ya arifa imehifadhiwa");
      setTimeout(() => clearStatus(), 2000);
      
      renderItemMeta(currentItem.data);
    } catch (error) {
      console.error("❌ Error saving alert:", error);
      alert("Failed to save alert settings. Please try again. / Imeshindwa kuhifadhi mipangilio ya arifa. Tafadhali jaribu tena.");
    }
  }

  function getBufferStatus(stock, threshold) {
    const buffer = stock - threshold;
    if (buffer > 10) return { class: "healthy", text: "Healthy Buffer / Hifadhi ya Kutosha" };
    if (buffer > 0) return { class: "warning", text: "Low Buffer / Hifadhi Ndogo" };
    return { class: "critical", text: "Needs Attention / Inahitaji Uangalizi" };
  }

  // =========================================================
  // BACKEND NOTIFY
  // =========================================================
  function sendImageForEmbedding(imageUrl, imageIndex) {
    if (!imageUrl || !currentItem || imageIndex == null) return;

    const payload = {
      event: "image_saved",
      image_url: imageUrl,
      item_id: currentItem.itemId,
      shop_id: currentItem.uid,
      category_id: currentItem.categoryId,
      image_index: imageIndex,
      timestamp: Date.now()
    };

    fetch(`${FLASK_BACKEND_URL}/vectorize-item`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(res => res.json())
      .then(data => console.log("[BACKEND RESPONSE]", data))
      .catch(err => console.warn("Backend request failed:", err));
  }

  // =========================================================
  // EDIT/SAVE TOGGLE (BILINGUAL)
  // =========================================================
  if (editToggleBtn) {
    editToggleBtn.addEventListener("click", async () => {
      if (!canManageStock()) {
        alert("Access denied: You don't have permission to edit items. / Huna ruhusa ya kuhariri bidhaa.");
        return;
      }
      if (!currentItem) return;

      if (editMode) {
        await saveEdits();
        editMode = false;
        editToggleBtn.textContent = "Edit / Hariri";
      } else {
        editMode = true;
        editToggleBtn.textContent = "Save / Hifadhi";
      }
      renderItemMeta(currentItem?.data);
    });
  }

  async function saveEdits() {
    if (!currentItem) return;
    if (!canManageStock()) return;

    const actor = getActor();
    const nameInput = document.getElementById("item-name-input");
    const buyPriceInput = document.getElementById("buy-price-input");
    const sellPriceInput = document.getElementById("sell-price-input");

    const updatedName = nameInput ? nameInput.value.trim() : currentItem.data.name;
    const updatedBuyPrice = buyPriceInput ? parseFloat(buyPriceInput.value) || 0 : currentItem.data.buyPrice || 0;
    const updatedSellPrice = sellPriceInput ? parseFloat(sellPriceInput.value) || 0 : currentItem.data.sellPrice || 0;

    const itemRef = doc(
      db,
      "Shops", currentItem.uid,
      "categories", currentItem.categoryId,
      "items", currentItem.itemId
    );

    try {
      await updateDoc(itemRef, {
        name: updatedName,
        buyPrice: updatedBuyPrice,
        sellPrice: updatedSellPrice,
        updatedAt: Date.now(),
        updatedBy: actor
      });

      currentItem.data.name = updatedName;
      currentItem.data.buyPrice = updatedBuyPrice;
      currentItem.data.sellPrice = updatedSellPrice;
      currentItem.name = updatedName;

      itemDetail.dataset.itemName = updatedName;
      
      showStatus("✅ Changes saved / Mabadiliko yamehifadhiwa");
      setTimeout(() => clearStatus(), 2000);
    } catch (error) {
      console.error("Error updating item:", error);
      alert("Failed to save changes. Please try again. / Imeshindwa kuhifadhi mabadiliko. Tafadhali jaribu tena.");
    }
  }

  // =========================================================
  // SHOW ITEM DETAIL (UPDATED: requires 2 images)
  // =========================================================
  async function showItemDetail(name, uid, categoryId, itemId) {
    editMode = false;
    if (editToggleBtn) editToggleBtn.textContent = "Edit / Hariri";

    injectAlertStyles();

    const shopId = getActiveShopId();
    if (!shopId) {
      alert("Missing shop context. Please login again. / Hakuna duka lililochaguliwa. Tafadhali ingia tena.");
      window.location.href = "/";
      return;
    }

    uid = shopId;

    overlay.classList.remove("hidden");
    overlayContent.classList.add("hidden");
    itemDetail.classList.remove("hidden");
    document.body.style.overflow = "hidden";

    const itemRef = doc(db, "Shops", uid, "categories", categoryId, "items", itemId);
    const snap = await getDoc(itemRef);

    const data = snap.exists()
      ? snap.data()
      : {
          name,
          images: [],
          stock: 0,
          stockTransactions: [],
          batches: [],
          lowStockAlert: 5,
          alertDescription: ""
        };

    currentItem = { uid, categoryId, itemId, name, data };

    // Attach context to overlay dataset
    itemDetail.dataset.shopId = uid;
    itemDetail.dataset.categoryId = categoryId;
    itemDetail.dataset.itemId = itemId;
    itemDetail.dataset.itemName = data.name || name || "";
    if (data.baseUnit) itemDetail.dataset.baseUnit = data.baseUnit;

    document.dispatchEvent(new CustomEvent("item-detail:opened", {
      detail: {
        shopId: uid,
        categoryId,
        itemId,
        itemName: data.name || name || "",
        baseUnit: data.baseUnit || null
      }
    }));

    syncEditButtonUI();
    renderItemMeta(data);
    injectItemDetailCloseButton();

    // ✅ HARD REQUIREMENT: must have 2 images before continuing
    if (canManageStock()) {
      const ok = await ensureTwoItemImages(itemRef, data);
      if (!ok) {
        injectMustCaptureCTA(itemRef, data);
        return;
      }
    }

    if ((data.buyPrice == null || data.sellPrice == null) && canManageStock()) {
      await ensurePrices(itemRef, data);
      renderItemMeta(currentItem.data);
    }
  }

  function injectItemDetailCloseButton() {
    if (itemDetail && !document.getElementById("item-detail-close-btn")) {
      const closeBtn = document.createElement("span");
      closeBtn.id = "item-detail-close-btn";
      closeBtn.className = "close-x";
      closeBtn.setAttribute("role", "button");
      closeBtn.setAttribute("aria-label", "Close item detail and go back to categories / Funga bidhaa na urudi kwenye aina");
      closeBtn.innerHTML = "&times;";
      closeBtn.style.position = "absolute";
      closeBtn.style.top = "10px";
      closeBtn.style.right = "15px";
      closeBtn.style.fontSize = "24px";
      closeBtn.style.cursor = "pointer";
      closeBtn.style.zIndex = "1002";
      closeBtn.style.width = "32px";
      closeBtn.style.height = "32px";
      closeBtn.style.display = "flex";
      closeBtn.style.alignItems = "center";
      closeBtn.style.justifyContent = "center";
      closeBtn.style.background = "#f1f5f9";
      closeBtn.style.borderRadius = "50%";
      closeBtn.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)";
      closeBtn.style.transition = "all 0.2s";
      itemDetail.appendChild(closeBtn);

      closeBtn.addEventListener("mouseenter", () => {
        closeBtn.style.background = "#ef4444";
        closeBtn.style.color = "white";
        closeBtn.style.transform = "rotate(90deg)";
      });
      
      closeBtn.addEventListener("mouseleave", () => {
        closeBtn.style.background = "#f1f5f9";
        closeBtn.style.color = "#333";
        closeBtn.style.transform = "rotate(0deg)";
      });

      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (captureInProgress) return alert("Finish image capture first. / Maliza kupiga picha kwanza.");
        hideItemDetail();
      });
    }
  }

  // =========================================================
  // REQUIRED 2-IMAGE CAPTURE (BEST + FALLBACK)
  // =========================================================
  function normalizeTwoImages(images) {
    const arr = Array.isArray(images) ? images.filter(Boolean) : [];
    return arr.slice(0, 2);
  }

  function stopStream(stream) {
    try { stream?.getTracks()?.forEach(t => t.stop()); } catch (_) {}
  }

  function waitClick(el) {
    return new Promise(resolve => el.addEventListener("click", resolve, { once: true }));
  }

  function canvasToFile(canvas, filename = "capture.jpg", mime = "image/jpeg", quality = 0.9) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (!blob) return reject(new Error("Failed to create image blob"));
        resolve(new File([blob], filename, { type: mime }));
      }, mime, quality);
    });
  }

  async function ensureTwoItemImages(itemRef, data) {
    if (!canManageStock()) return true;

    const actor = getActor();
    const existing = normalizeTwoImages(data.images);

    if (existing.length === 2) {
      data.images = existing;
      if (currentItem?.data) currentItem.data.images = existing;
      return true;
    }

    // Ensure UI slots exist
    renderItemMeta({ ...data, images: existing });

    const startIndex = existing.length; // 0 or 1
    const neededCount = 2 - startIndex;

    showStatus(`📸 ${neededCount} more photo(s) needed / picha ${neededCount} zaidi zinahitajika`);

    // BEST: open camera stream modal (seamless) - FULLSCREEN VERSION
    if (navigator.mediaDevices?.getUserMedia) {
      const result = await captureMissingWithStreamModal(existing, startIndex, neededCount);
      if (result?.cancelled) return false;

      if (Array.isArray(result?.files) && result.files.length === neededCount) {
        const finalImages = existing.slice(0, 2);

        // Upload captured files
        for (let i = 0; i < result.files.length; i++) {
          const slot = startIndex + i;
          showStatus(`📤 Uploading image ${slot + 1} of 2... / Inapakia picha ${slot + 1} kati ya 2...`);
          const url = await uploadToCloudinary(result.files[i]);
          finalImages[slot] = url;
          setPreviewImageSlot(slot, url);
          sendImageForEmbedding(url, slot);
        }

        if (!finalImages[0] || !finalImages[1]) return false;

        await setDoc(itemRef, {
          ...data,
          images: finalImages,
          stock: data.stock ?? 0,
          stockTransactions: Array.isArray(data.stockTransactions) ? data.stockTransactions : [],
          batches: Array.isArray(data.batches) ? data.batches : [],
          lowStockAlert: data.lowStockAlert ?? 5,
          alertDescription: data.alertDescription ?? "",
          createdAt: data.createdAt ?? Date.now(),
          createdBy: data.createdBy ?? actor,
          updatedAt: Date.now(),
          updatedBy: actor
        }, { merge: true });

        data.images = finalImages;
        if (currentItem?.data) currentItem.data.images = finalImages;

        clearCaptureActions();
        showStatus("✅ Both images saved / Picha zote zimehifadhiwa");
        setTimeout(() => clearStatus(), 1200);
        renderItemMeta(currentItem?.data || data);
        return true;
      }
      // If stream failed without cancel, we fallback below
    }

    // FALLBACK: picker capture with guaranteed user gesture (button per capture)
    const fallback = await captureMissingWithPickerModal(existing, startIndex, neededCount);
    if (!fallback || fallback.cancelled) return false;

    const finalImages = existing.slice(0, 2);

    for (let i = 0; i < fallback.files.length; i++) {
      const slot = startIndex + i;
      showStatus(`📤 Uploading image ${slot + 1} of 2... / Inapakia picha ${slot + 1} kati ya 2...`);
      const url = await uploadToCloudinary(fallback.files[i]);
      finalImages[slot] = url;
      setPreviewImageSlot(slot, url);
      sendImageForEmbedding(url, slot);
    }

    if (!finalImages[0] || !finalImages[1]) return false;

    await setDoc(itemRef, {
      ...data,
      images: finalImages,
      stock: data.stock ?? 0,
      stockTransactions: Array.isArray(data.stockTransactions) ? data.stockTransactions : [],
      batches: Array.isArray(data.batches) ? data.batches : [],
      lowStockAlert: data.lowStockAlert ?? 5,
      alertDescription: data.alertDescription ?? "",
      createdAt: data.createdAt ?? Date.now(),
      createdBy: data.createdBy ?? actor,
      updatedAt: Date.now(),
      updatedBy: actor
    }, { merge: true });

    data.images = finalImages;
    if (currentItem?.data) currentItem.data.images = finalImages;

    clearCaptureActions();
    showStatus("✅ Both images saved / Picha zote zimehifadhiwa");
    setTimeout(() => clearStatus(), 1200);
    renderItemMeta(currentItem?.data || data);
    return true;
  }

  async function captureMissingWithStreamModal(existingUrls, startIndex, neededCount) {
    let stream = null;
    let backdrop = null;

    try {
      captureInProgress = true;
      showStatus("Opening camera... / Kufungua kamera...");

      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" } }
      });

      backdrop = document.createElement("div");
      backdrop.className = "sk-cam-backdrop";
      backdrop.innerHTML = `
        <div class="sk-cam-sheet" role="dialog" aria-modal="true">
          <div class="sk-cam-topbar">
            <div class="sk-cam-title" id="sk-title">Capture item photos / Piga picha za bidhaa</div>
            <button class="sk-btn sk-btn-danger" id="sk-cancel">Cancel / Ghairi</button>
          </div>

          <div class="sk-cam-view">
            <video class="sk-cam-video" id="sk-video" autoplay playsinline muted></video>

            <div class="sk-cam-hud">
              <div class="sk-cam-thumbs">
                <div class="sk-cam-thumb" id="sk-t1">1</div>
                <div class="sk-cam-thumb" id="sk-t2">2</div>
              </div>
            </div>

            <div class="sk-cam-status" id="sk-status"></div>
          </div>

          <div class="sk-cam-bottombar">
            <div style="display:flex; gap:10px;">
              <button class="sk-btn sk-btn-secondary" id="sk-retake" style="display:none;">Retake / Piga Tena</button>
              <button class="sk-btn sk-btn-secondary" id="sk-reset" style="display:none;">Reset / Anzisha Upya</button>
            </div>

            <button class="sk-shutter" id="sk-shot" aria-label="Capture photo / Piga picha"></button>

            <div style="width:110px;"></div>
          </div>
        </div>
      `;
      document.body.appendChild(backdrop);

      const video = backdrop.querySelector("#sk-video");
      const btnCancel = backdrop.querySelector("#sk-cancel");
      const btnShot = backdrop.querySelector("#sk-shot");
      const btnRetake = backdrop.querySelector("#sk-retake");
      const btnReset = backdrop.querySelector("#sk-reset");
      const statusEl = backdrop.querySelector("#sk-status");
      const titleEl = backdrop.querySelector("#sk-title");
      const t1 = backdrop.querySelector("#sk-t1");
      const t2 = backdrop.querySelector("#sk-t2");

      video.srcObject = stream;

      await new Promise(resolve => (video.onloadedmetadata = resolve));
      try { await video.play(); } catch (_) {}

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      const files = new Array(neededCount).fill(null);
      const previews = new Array(neededCount).fill(null);

      // Show existing thumbs if already have one image
      if (existingUrls[0]) t1.innerHTML = `<img src="${existingUrls[0]}" alt="Existing 1">`;
      if (existingUrls[1]) t2.innerHTML = `<img src="${existingUrls[1]}" alt="Existing 2">`;

      const setThumb = (absoluteSlot, url) => {
        const target = absoluteSlot === 0 ? t1 : t2;
        target.innerHTML = `<img src="${url}" alt="Preview ${absoluteSlot + 1}">`;
      };

      let step = 0;

      const updateUI = () => {
        const absSlot = startIndex + step;
        titleEl.textContent = `Capture photo ${absSlot + 1} of 2 / Piga picha ${absSlot + 1} kati ya 2`;
        statusEl.textContent = `Take photo ${absSlot + 1} now / Piga picha ${absSlot + 1} sasa`;

        btnRetake.style.display = (step > 0) ? "inline-block" : "none";
        btnReset.style.display = (step > 1) ? "inline-block" : "none";
      };

      const cleanupAndReturn = (result) => {
        stopStream(stream);
        try { backdrop.remove(); } catch (_) {}
        captureInProgress = false;
        return result;
      };

      const waitClick = (el) => new Promise(resolve => el.addEventListener("click", resolve, { once: true }));

      btnReset.onclick = () => {
        // reset only the missing captures
        for (let i = 0; i < neededCount; i++) {
          const absSlot = startIndex + i;

          if (previews[i]) {
            try { URL.revokeObjectURL(previews[i]); } catch (_) {}
            previews[i] = null;
          }
          files[i] = null;

          // Reset thumbs only if they were missing slots
          if (absSlot === 0 && !existingUrls[0]) t1.textContent = "1";
          if (absSlot === 1 && !existingUrls[1]) t2.textContent = "2";

          // Reset main UI slot if it was missing slot
          if ((absSlot === 0 && !existingUrls[0]) || (absSlot === 1 && !existingUrls[1])) {
            setPlaceholderMessage(absSlot, "No image / Hakuna picha");
          }
        }
        step = 0;
        updateUI();
      };

      btnRetake.onclick = () => {
        if (step <= 0) return;
        const i = step - 1;
        const absSlot = startIndex + i;

        if (previews[i]) {
          try { URL.revokeObjectURL(previews[i]); } catch (_) {}
          previews[i] = null;
        }
        files[i] = null;

        if (absSlot === 0 && !existingUrls[0]) t1.textContent = "1";
        if (absSlot === 1 && !existingUrls[1]) t2.textContent = "2";

        if ((absSlot === 0 && !existingUrls[0]) || (absSlot === 1 && !existingUrls[1])) {
          setPlaceholderMessage(absSlot, "No image / Hakuna picha");
        }

        step = i;
        updateUI();
      };

      updateUI();

      while (step < neededCount) {
        const action = await Promise.race([
          waitClick(btnShot).then(() => "shot"),
          waitClick(btnCancel).then(() => "cancel")
        ]);

        if (action === "cancel") return cleanupAndReturn({ cancelled: true });

        const w = video.videoWidth || 1280;
        const h = video.videoHeight || 720;
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(video, 0, 0, w, h);

        const absSlot = startIndex + step;
        const file = await canvasToFile(canvas, `item_${Date.now()}_${absSlot + 1}.jpg`, "image/jpeg", 0.9);

        const previewUrl = URL.createObjectURL(file);
        files[step] = file;
        previews[step] = previewUrl;

        setThumb(absSlot, previewUrl);
        setPreviewImageSlot(absSlot, previewUrl);

        step++;
        updateUI();
      }

      statusEl.textContent = "Captured required photos. Closing camera... / Picha zimekamilika. Kufunga kamera...";
      return cleanupAndReturn({ cancelled: false, files: files.filter(Boolean) });

    } catch (e) {
      console.warn("Stream modal failed:", e);
      stopStream(stream);
      if (backdrop) backdrop.remove();
      captureInProgress = false;
      return null; // allow fallback
    }
  }

  async function captureMissingWithPickerModal(existingUrls, startIndex, neededCount) {
    // This fallback guarantees user gesture because EACH capture is triggered by button click.
    // Returns {files} or {cancelled:true}
    return new Promise(resolve => {
      captureInProgress = true;

      const backdrop = document.createElement("div");
      backdrop.className = "sk-cam-backdrop";
      backdrop.innerHTML = `
        <div class="sk-cam-sheet" role="dialog" aria-modal="true">
          <div class="sk-cam-header" style="padding:16px; display:flex; justify-content:space-between; align-items:center;">
            <div style="color:white; font-weight:bold;">Capture item photos (fallback) / Piga picha (njia mbadala)</div>
            <button style="background:#c0392b; color:white; border:none; border-radius:10px; padding:8px 16px; cursor:pointer;" id="pk-cancel">Cancel / Ghairi</button>
          </div>
          <div style="padding:16px;">
            <div style="margin-bottom:10px; color:#ddd; font-size:13px;">
              Your browser blocked continuous camera mode. Use this fallback:
              click the button for each photo. / Kivinjari chako kimezuia kamera. Tumia njia hii:
              bonyeza kitufe kwa kila picha.
            </div>

            <div style="display:flex; align-items:center; gap:20px; margin-bottom:16px;">
              <div style="display:flex; gap:10px;">
                <div style="width:56px; height:56px; border-radius:10px; background:rgba(255,255,255,0.1); border:1px solid #444; display:flex; align-items:center; justify-content:center; overflow:hidden;" id="pk-t1">${existingUrls[0] ? `<img src="${existingUrls[0]}" style="width:100%; height:100%; object-fit:cover;">` : "1"}</div>
                <div style="width:56px; height:56px; border-radius:10px; background:rgba(255,255,255,0.1); border:1px solid #444; display:flex; align-items:center; justify-content:center; overflow:hidden;" id="pk-t2">${existingUrls[1] ? `<img src="${existingUrls[1]}" style="width:100%; height:100%; object-fit:cover;">` : "2"}</div>
              </div>
              <button style="background:#4f46e5; color:white; border:none; border-radius:10px; padding:8px 16px; cursor:pointer;" id="pk-next">Capture next / Piga inayofuata</button>
            </div>

            <div style="color:#ddd; font-size:13px;" id="pk-status"></div>
          </div>
        </div>
      `;
      document.body.appendChild(backdrop);

      const btnCancel = backdrop.querySelector("#pk-cancel");
      const btnNext = backdrop.querySelector("#pk-next");
      const statusEl = backdrop.querySelector("#pk-status");
      const t1 = backdrop.querySelector("#pk-t1");
      const t2 = backdrop.querySelector("#pk-t2");

      const files = [];
      let step = 0;

      const setThumb = (absSlot, url) => {
        const target = absSlot === 0 ? t1 : t2;
        target.innerHTML = `<img src="${url}" style="width:100%; height:100%; object-fit:cover;" alt="Preview ${absSlot + 1}">`;
      };

      const updateStatus = () => {
        const absSlot = startIndex + step;
        statusEl.textContent = `Click to capture photo ${absSlot + 1} of 2 / Bonyeza kupiga picha ${absSlot + 1} kati ya 2`;
        btnNext.textContent = `Capture photo ${absSlot + 1} / Piga picha ${absSlot + 1}`;
      };

      const cleanup = (result) => {
        try { backdrop.remove(); } catch (_) {}
        captureInProgress = false;
        resolve(result);
      };

      btnCancel.onclick = () => cleanup({ cancelled: true });

      btnNext.onclick = async () => {
        if (step >= neededCount) return;

        const absSlot = startIndex + step;
        updateStatus();
        btnNext.disabled = true;

        const file = await promptCameraCapture(); // called INSIDE user click => allowed
        btnNext.disabled = false;

        if (!file) {
          const retry = confirm(`Photo ${absSlot + 1} is required. / Picha ${absSlot + 1} inahitajika.\n\nTry again? / Jaribu tena?`);
          if (!retry) return cleanup({ cancelled: true });
          return;
        }

        const preview = URL.createObjectURL(file);
        setPreviewImageSlot(absSlot, preview);
        setThumb(absSlot, preview);

        files.push(file);
        step++;

        if (step >= neededCount) {
          statusEl.textContent = "Captured required photos. Closing... / Picha zimekamilika. Kufunga...";
          return cleanup({ cancelled: false, files });
        }

        updateStatus();
      };

      updateStatus();
    });
  }

  function injectMustCaptureCTA(itemRef, data) {
    if (!canManageStock()) return;

    const actions = itemMeta.querySelector(".capture-actions");
    if (!actions) return;

    actions.innerHTML = `
      <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 16px; margin: 20px 0; border-radius: 4px;">
        <div style="font-weight:600; margin-bottom:10px; color: #856404;">
          ⚠️ Two item photos are required / Picha mbili za bidhaa zinahitajika
        </div>
        <button id="capture-required" 
                style="background: #0077cc; color: white; border: none; padding: 12px 20px; border-radius: 6px; font-size: 16px; cursor: pointer; width: 100%;">
          📸 Capture Required Photos / Piga Picha Zinazohitajika
        </button>
      </div>
    `;

    const btn = actions.querySelector("#capture-required");
    btn.onclick = async () => {
      actions.innerHTML = "";
      const ok = await ensureTwoItemImages(itemRef, data);
      if (!ok) {
        injectMustCaptureCTA(itemRef, data);
        return;
      }

      // Continue normal flow
      if ((data.buyPrice == null || data.sellPrice == null) && canManageStock()) {
        await ensurePrices(itemRef, data);
      }
      renderItemMeta(currentItem?.data || data);
    };
  }

  function clearCaptureActions() {
    const actions = itemMeta.querySelector(".capture-actions");
    if (actions) actions.innerHTML = "";
  }

  // =========================================================
  // ensurePrices with baseUnit + dataset sync (BILINGUAL)
  // =========================================================
  async function ensurePrices(itemRef, data) {
    if (!canManageStock()) return;
    if (data.buyPrice != null && data.sellPrice != null && data.baseUnit) return;

    const actor = getActor();

    if (!data.baseUnit) {
      const baseUnit = await getBaseUnitFromUser(data.name);
      if (!baseUnit) return;

      await updateDoc(itemRef, {
        baseUnit: baseUnit,
        updatedAt: Date.now(),
        updatedBy: actor
      });
      data.baseUnit = baseUnit;

      itemDetail.dataset.baseUnit = baseUnit;
      document.dispatchEvent(new CustomEvent("item-detail:base-unit-set", {
        detail: {
          shopId: currentItem?.uid,
          categoryId: currentItem?.categoryId,
          itemId: currentItem?.itemId,
          baseUnit
        }
      }));
    }

    if (data.buyPrice == null || data.sellPrice == null) {
      const priceResult = await getBatchPrices(data, true);
      if (!priceResult) return;

      await updateDoc(itemRef, {
        buyPrice: priceResult.buyPrice,
        sellPrice: priceResult.sellPrice,
        updatedAt: Date.now(),
        updatedBy: actor
      });

      data.buyPrice = priceResult.buyPrice;
      data.sellPrice = priceResult.sellPrice;
    }
  }

  // =========================================================
  // addStockToItem with batch tracking + SELL UNIT PRICING (BILINGUAL)
  // =========================================================
  async function addStockToItem() {
    if (!currentItem) return;
    if (!canManageStock()) {
      alert("Access denied: You don't have permission to add stock. / Huna ruhusa ya kuongeza stock.");
      return;
    }

    const actor = getActor();
    const itemData = currentItem.data;
    const baseUnit = itemData.baseUnit || "unit";

    const quantity = parseFloat(prompt(
      `How many ${baseUnit} of "${currentItem.name}" to add? / Unaongeza ${baseUnit} ngapi za "${currentItem.name}"?\n\n` +
      `Example / Mfano: If adding 3 bags, enter "3" / Ukiongeza gunia 3, andika "3"\n` +
      `Current stock / Stock ya sasa: ${itemData.stock || 0} ${baseUnit}`,
      "1"
    ));

    if (isNaN(quantity) || quantity <= 0) {
      alert("Please enter a valid number / Tafadhali weka namba sahihi");
      return;
    }

    const timestamp = Date.now();
    const date = new Date().toLocaleDateString();

    const batches = itemData.batches || [];
    const isFirstBatch = batches.length === 0;

    const priceResult = await getBatchPrices(itemData, isFirstBatch);
    if (!priceResult) {
      alert("Stock addition cancelled. / Kuongeza stock kumekataliwa.");
      return;
    }

    const batchId = `batch_${timestamp}_${Math.random().toString(36).substr(2, 6)}`;
    const batch = {
      id: batchId,
      quantity: quantity,
      unit: baseUnit,
      buyPrice: priceResult.buyPrice,
      sellPrice: priceResult.sellPrice,
      date: date,
      timestamp: timestamp,
      addedBy: actorDisplayName(actor),
      performedBy: actor
    };

    const txnId = `stock_${timestamp}_${Math.random().toString(36).substr(2, 6)}`;
    const stockTransaction = {
      id: txnId,
      quantity: quantity,
      date: date,
      timestamp: timestamp,
      type: "stock_in",
      batchId: batchId,
      unit: baseUnit,
      buyPrice: priceResult.buyPrice,
      sellPrice: priceResult.sellPrice,
      addedBy: actorDisplayName(actor),
      performedBy: actor,
      sessionType: getSessionType()
    };

    const itemRef = doc(
      db, "Shops", currentItem.uid,
      "categories", currentItem.categoryId,
      "items", currentItem.itemId
    );

    try {
      const updates = {
        stockTransactions: arrayUnion(stockTransaction),
        stock: increment(quantity),
        batches: arrayUnion(batch),
        lastTransactionId: txnId,
        lastStockUpdate: timestamp,
        updatedAt: timestamp,
        updatedBy: actor
      };

      if (priceResult.updateBuy) {
        updates.buyPrice = priceResult.buyPrice;
        updates.lastBuyPriceUpdate = timestamp;
      }
      if (priceResult.updateSell) {
        updates.sellPrice = priceResult.sellPrice;
        updates.lastSellPriceUpdate = timestamp;
      }
      if (!itemData.baseUnit) {
        updates.baseUnit = baseUnit;
      }

      await updateDoc(itemRef, updates);

      await ensureSellUnitPrices(
        { shopId: currentItem.uid, categoryId: currentItem.categoryId, itemId: currentItem.itemId },
        priceResult.sellPrice ?? currentItem.data.sellPrice ?? 0,
        actor
      );

      currentItem.data.stockTransactions = [
        ...(currentItem.data.stockTransactions || []),
        stockTransaction
      ];
      currentItem.data.batches = [
        ...batches,
        batch
      ];
      currentItem.data.stock = (currentItem.data.stock || 0) + quantity;

      if (priceResult.updateBuy) currentItem.data.buyPrice = priceResult.buyPrice;
      if (priceResult.updateSell) currentItem.data.sellPrice = priceResult.sellPrice;
      if (!currentItem.data.baseUnit) currentItem.data.baseUnit = baseUnit;

      // Add flash animation to stock display
      const stockElement = document.querySelector('.stock-success-flash');
      if (stockElement) {
        stockElement.classList.add('stock-success-flash');
        setTimeout(() => stockElement.classList.remove('stock-success-flash'), 500);
      }

      let message = `✅ Added ${quantity} ${baseUnit} / Umeongeza ${quantity} ${baseUnit}`;
      if (batches.length > 0) {
        message += `\n\nThis is batch #${batches.length + 1} / Hii ni batch #${batches.length + 1}`;
      }
      message += `\n\nTotal stock now / Jumla ya stock sasa: ${currentItem.data.stock} ${baseUnit}`;
      alert(message);

      renderItemMeta(currentItem.data);

    } catch (error) {
      console.error("❌ Error adding stock:", error);
      alert("Failed to add stock. Please try again. / Imeshindwa kuongeza stock. Tafadhali jaribu tena.");
    }
  }

  // =========================================================
  // renderItemMeta - RESTORED ORIGINAL VISUAL CHARM + BILINGUAL + KSH CURRENCY
  // =========================================================
  function renderItemMeta(data = {}) {
    const imgs = data.images || [];
    const baseUnit = data.baseUnit || "units";
    const totalStock = data.stock || 0;
    const transactions = data.stockTransactions || [];
    const batches = data.batches || [];
    const lastThree = transactions.slice(-3).reverse();
    const canStock = canManageStock();

    if (itemNameEl) {
      if (editMode) {
        itemNameEl.innerHTML = `
          <div style="display: flex; align-items: center; gap: 10px;">
            <input type="text" id="item-name-input" value="${data.name || ""}"
                   style="font-size: 1.5rem; padding: 8px 12px; width: 80%; border: 2px solid #ccc; border-radius: 8px; font-weight: bold;">
            <span style="color: #666; cursor: pointer; font-size: 1.2rem;">✎</span>
          </div>
        `;
      } else {
        itemNameEl.innerHTML = `<span style="font-size: 1.8rem; font-weight: bold; color: #1e293b;">${data.name || ""}</span>`;
      }
    }

    const imgHtml = [0, 1].map(i => {
      if (!imgs[i]) return `<div class="image-slot placeholder">${i === 0 ? 'Front' : 'Back'} / ${i === 0 ? 'Mbele' : 'Nyuma'}</div>`;
      return `
        <div class="image-slot">
          <img src="${imgs[i]}" class="item-thumb">
          ${editMode ? `
            <div class="image-edit-overlay">
              <span class="pencil" style="color: white;">✎</span>
              <button class="retake-btn" data-index="${i}" style="background: #ff6b6b; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">Retake / Piga Tena</button>
            </div>
          ` : ""}
        </div>
      `;
    }).join("");

    let pricesHtml;
    if (editMode) {
      pricesHtml = `
        <div style="margin: 20px 0; padding: 20px; background: #f8f9fa; border-radius: 12px; border: 1px solid #e9ecef;">
          <div style="display: flex; gap: 20px; align-items: center;">
            <span class="pencil" style="color: #666;">✎</span>
            <div style="flex: 1;">
              <label style="display: block; margin-bottom: 5px; font-weight: 500;">Buy Price / Bei ya Kununua (per ${baseUnit})</label>
              <input type="number" id="buy-price-input" value="${data.buyPrice || ""}"
                     step="0.01" min="0" style="padding: 8px; width: 100%; border: 1px solid #ccc; border-radius: 4px;">
            </div>
            <div style="flex: 1;">
              <label style="display: block; margin-bottom: 5px; font-weight: 500;">Sell Price / Bei ya Kuuza (per ${baseUnit})</label>
              <input type="number" id="sell-price-input" value="${data.sellPrice || ""}"
                     step="0.01" min="0" style="padding: 8px; width: 100%; border: 1px solid #ccc; border-radius: 4px;">
            </div>
          </div>
        </div>
      `;
    } else {
      pricesHtml = `
        <div style="margin: 20px 0; padding: 15px 20px; background: linear-gradient(135deg, #667eea20, #764ba220); border-radius: 50px; display: inline-block; border: 1px solid #667eea40;">
          <span style="margin-right: 20px;"><span class="tiny-graph"></span> Buy / Nunua: <strong style="color: #2563eb;">KSh ${data.buyPrice || 0}</strong> / ${baseUnit}</span>
          <span><span class="tiny-graph" style="background: #10b981;"></span> Sell / Uza: <strong style="color: #059669;">KSh ${data.sellPrice || 0}</strong> / ${baseUnit}</span>
        </div>
      `;
    }

    const batchDisplay = batches.length > 0 ? `
      <div style="margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 12px; border: 1px solid #dee2e6;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
          <div style="font-size: 16px; font-weight: 600; color: #495057;">
            <span class="section-icon">📦</span> Stock Batches / Makundi ya Stock (${batches.length})
          </div>
          <div style="font-size: 12px; color: #6c757d; display: flex; align-items: center;">
            <span class="tiny-graph"></span> Each batch tracks price when added
          </div>
        </div>
        <div style="max-height: 150px; overflow-y: auto; padding-right: 5px;">
          ${batches.slice(-3).reverse().map((batch, idx) => `
            <div class="batch-item ${idx > 0 ? 'old-batch' : ''}" style="padding: 10px; margin: 8px 0; background: white; border-radius: 8px; border-left: 4px solid ${idx === 0 ? '#28a745' : '#f59e0b'}; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 10px;">
                  <span style="background: ${idx === 0 ? '#28a74520' : '#f59e0b20'}; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 500; color: ${idx === 0 ? '#28a745' : '#f59e0b'};">
                    ${idx === 0 ? 'NEW / MPYA' : `Batch ${batches.length - idx}`}
                  </span>
                  <span style="font-size: 12px; color: #6c757d;">${batch.date || ''}</span>
                </div>
                <span style="font-weight: bold; color: #28a745;">+${batch.quantity} ${batch.unit}</span>
              </div>
              <div style="display: flex; gap: 20px; margin-top: 8px; font-size: 12px; color: #6c757d;">
                <span>💰 Buy / Nunua: KSh ${batch.buyPrice || 0}</span>
                <span>💵 Sell / Uza: KSh ${batch.sellPrice || 0}</span>
              </div>
            </div>
          `).join('')}
          ${batches.length > 3 ? `
            <div style="text-align: center; font-size: 12px; color: #adb5bd; margin-top: 10px;">
              +${batches.length - 3} more batches / makundi mengine
            </div>
          ` : ''}
        </div>
      </div>
    ` : '';

    const stockHtml = `
      <div style="margin: 25px 0; padding: 20px; background: linear-gradient(135deg, #0066cc, #004999); border-radius: 16px; box-shadow: 0 10px 25px rgba(0,102,204,0.3);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
          <div>
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
              <span style="font-size: 24px;">📊</span>
              <span style="color: white; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; opacity: 0.9;">STOCK TRACKING / UFUATILIAJI WA STOCK</span>
            </div>
            <div style="display: flex; align-items: baseline;">
              <span style="font-size: 48px; font-weight: bold; color: white; line-height: 1;">${totalStock}</span>
              <span style="font-size: 20px; color: rgba(255,255,255,0.8); margin-left: 10px;">${baseUnit}</span>
            </div>
            ${transactions.length > 0 ? `
              <div style="font-size: 12px; color: rgba(255,255,255,0.7); margin-top: 5px;">
                Based on ${transactions.length} transaction${transactions.length === 1 ? '' : 's'} / shughuli ${batches.length > 0 ? `• ${batches.length} batch${batches.length === 1 ? '' : 'es'} / makundi` : ''}
              </div>
            ` : ''}
          </div>

          <button id="add-stock-btn"
                  ${canStock ? "" : "disabled"}
                  style="
                    padding: 12px 24px;
                    background: ${canStock ? "white" : "#95a5a6"};
                    color: ${canStock ? "#0066cc" : "white"};
                    border: none;
                    border-radius: 50px;
                    font-size: 16px;
                    cursor: ${canStock ? "pointer" : "not-allowed"};
                    font-weight: bold;
                    box-shadow: ${canStock ? "0 4px 10px rgba(0,0,0,0.2)" : "none"};
                    transition: all 0.2s;
                  "
                  onmouseover="this.style.transform='${canStock ? 'scale(1.05)' : 'none'}'"
                  onmouseout="this.style.transform='none'">
            ➕ Add Stock / Ongeza Stock
          </button>
        </div>

        ${batchDisplay}

        <div class="section-divider" style="height: 1px; background: linear-gradient(to right, transparent, rgba(255,255,255,0.3), transparent); margin: 20px 0;"></div>

        ${transactions.length > 0 ? `
          <div>
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 15px;">
              <span style="font-size: 16px;">📋</span>
              <span style="color: white; font-size: 14px; font-weight: 500;">Recent Movements / Shughuli za Karibuni</span>
            </div>
            <div style="max-height: 200px; overflow-y: auto; padding-right: 5px;">
              ${lastThree.map(t => {
                const isSale = t.type === "sale" || Number(t.quantity) < 0;
                const label = isSale ? "Sold by / Imeuzwa na" : "Added by / Imeongezwa na";
                const who = t?.performedBy?.name || t?.performedBy?.email || t.addedBy || "Unknown";
                const qtyText = Number(t.quantity) > 0 ? `+${t.quantity}` : `${t.quantity}`;
                const qtyColor = isSale ? "#dc2626" : "#10b981";
                const bgColor = isSale ? "#fee2e2" : "#e6f7e6";

                return `
                  <div style="padding: 12px; margin: 8px 0; background: ${bgColor}; border-radius: 10px; border-left: 4px solid ${qtyColor};">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                      <span style="color: #333; font-weight: 500;">${t.date || ""}</span>
                      <span style="font-weight: bold; color: ${qtyColor};">${qtyText} ${t.unit || baseUnit}</span>
                    </div>
                    <div style="font-size: 12px; color: #666;">
                      ${label}: ${who}
                      ${t.buyPrice ? ` • Buy / Nunua: KSh ${t.buyPrice}` : ''}
                      ${t.sellPrice ? ` • Sell / Uza: KSh ${t.sellPrice}` : ''}
                    </div>
                  </div>
                `;
              }).join("")}
            </div>
          </div>
        ` : `
          <div style="padding: 30px; text-align: center; background: rgba(255,255,255,0.1); border-radius: 12px;">
            <p style="color: white; font-style: italic; margin: 0;">No stock recorded yet. / Hakuna stock bado.</p>
          </div>
        `}
      </div>
    `;

    const alertThreshold = data.lowStockAlert || 5;
    const isAlertActive = totalStock <= alertThreshold;
    const bufferStatus = getBufferStatus(totalStock, alertThreshold);

    const alertHtml = `
      <div class="alert-slider-container ${isAlertActive ? "alert-active" : ""}" style="margin: 20px 0; padding: 20px; background: ${isAlertActive ? '#fff5f5' : '#f0fff0'}; border: 2px solid ${isAlertActive ? '#ff6b6b' : '#2ed573'}; border-radius: 12px;">
        <div class="alert-slider-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
          <div style="font-size: 16px; font-weight: bold; color: ${isAlertActive ? '#ff6b6b' : '#2ed573'}; display: flex; align-items: center; gap: 8px;">
            <span class="section-icon">${isAlertActive ? '⚠️' : '📊'}</span>
            ${isAlertActive ? "LOW STOCK ALERT / ARIFA YA STOCK KIDOGO" : "STOCK ALERTS / ARIFA ZA STOCK"}
          </div>
          <div style="font-size: 12px; padding: 4px 12px; border-radius: 20px; background: ${isAlertActive ? '#ff6b6b20' : '#2ed57320'}; color: ${isAlertActive ? '#ff6b6b' : '#2ed573'}; font-weight: 500;">
            ${isAlertActive ? "ACTIVE / IMEWASHWA" : "MONITORING / INAFUATILIWA"}
          </div>
        </div>

        <div style="background: white; padding: 15px; border-radius: 10px; margin: 15px 0;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="color: #666;">Alert when stock reaches / Arifa wakati stock inafikia:</span>
            <span style="font-weight: bold; font-size: 18px;">${alertThreshold} ${baseUnit}</span>
          </div>
          ${isAlertActive ? `
            <div style="margin-top: 10px; padding: 10px; background: #fee2e2; color: #dc2626; border-radius: 8px; font-weight: bold; display: flex; align-items: center; gap: 8px;">
              <span>⚠️</span>
              <span>Alert Active: Stock is at ${totalStock} ${baseUnit}! / Arifa Imewashwa: Stock iko ${totalStock} ${baseUnit}!</span>
            </div>
          ` : ''}
        </div>

        <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #dee2e6;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="font-weight: 500;">Buffer / Hifadhi:</span>
              <span style="font-weight: bold; color: ${bufferStatus.class === 'healthy' ? '#10b981' : (bufferStatus.class === 'warning' ? '#f59e0b' : '#ef4444')};">
                ${totalStock - alertThreshold} ${baseUnit}
              </span>
              <span class="stock-badge ${bufferStatus.class}" style="font-size: 11px;">${bufferStatus.text}</span>
            </div>

            ${editMode ? `
              <button id="configure-alert-btn" 
                      style="padding: 8px 16px; background: linear-gradient(135deg, #667eea, #764ba2); color: white; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; font-weight: 500; display: flex; align-items: center; gap: 5px;">
                ⚙️ Configure / Sanidi
              </button>
            ` : `
              <div style="padding: 8px 12px; background: #f8f9fa; border-radius: 6px; color: #666; font-size: 12px;">
                ${canStock ? "Edit mode to change / Hariri kubadilisha" : "No permission / Huna ruhusa"}
              </div>
            `}
          </div>
        </div>

        ${editMode ? `
          <div id="alert-config-panel" class="alert-config-panel" style="display: none; margin-top: 20px; padding: 20px; background: white; border-radius: 8px; border: 1px solid #e9ecef;">
            <div style="margin-bottom: 20px;">
              <div style="font-weight: 600; color: #333; margin-bottom: 10px;">
                Set Low Stock Alert Level / Weka Kiwango cha Arifa ya Stock
              </div>

              <input type="range"
                     id="alert-slider"
                     min="0"
                     max="50"
                     value="${alertThreshold}"
                     step="1"
                     style="width: 100%; height: 8px; -webkit-appearance: none; background: linear-gradient(to right, #2ed573, #ff6b6b); border-radius: 4px; outline: none; margin: 10px 0;">

              <div id="alert-value-display" style="font-size: 24px; font-weight: bold; color: #667eea; text-align: center; margin: 15px 0;">${alertThreshold}</div>

              <div style="display: flex; justify-content: space-between; font-size: 12px; color: #666;">
                <span>0 (No Alert / Hakuna)</span>
                <span>Critical / Muhimu: 5</span>
                <span>Warning / Tahadhari: 10</span>
                <span>Safe / Salama: 25</span>
                <span>50+</span>
              </div>
            </div>

            <div style="margin-bottom: 20px;">
              <label style="display: block; margin-bottom: 8px; color: #666; font-size: 14px;">
                Alert Description / Maelezo ya Arifa (Optional)
              </label>
              <input type="text"
                     id="alert-description"
                     placeholder="e.g., 'Restock immediately' / mfano: 'Jaza stock mara moja'"
                     value="${data.alertDescription || ""}"
                     style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px;">
            </div>

            <div style="display: flex; gap: 10px;">
              <button id="save-alert-btn" 
                      style="flex: 1; padding: 12px; background: linear-gradient(135deg, #2ed573, #1dd1a1); color: white; border: none; border-radius: 6px; font-weight: 600; cursor: pointer;">
                Save / Hifadhi
              </button>
              <button id="cancel-alert-btn" 
                      style="flex: 1; padding: 12px; background: #f8f9fa; color: #666; border: 2px solid #e9ecef; border-radius: 6px; font-weight: 600; cursor: pointer;">
                Cancel / Ghairi
              </button>
            </div>
          </div>
        ` : ""}
      </div>
    `;

    itemMeta.innerHTML = `
      <div class="item-images">${imgHtml}</div>
      ${pricesHtml}
      ${stockHtml}
      ${alertHtml}
      <div class="capture-actions"></div>
      <div class="capture-status" style="margin-top: 10px; color: #666; font-style: italic; text-align: center;"></div>
    `;

    const addStockBtn = itemMeta.querySelector("#add-stock-btn");
    if (addStockBtn) addStockBtn.addEventListener("click", addStockToItem);

    if (editMode) {
      setTimeout(() => updateAlertSliderValue("alert-slider", "alert-value-display"), 50);

      const configureBtn = itemMeta.querySelector("#configure-alert-btn");
      const saveAlertBtn = itemMeta.querySelector("#save-alert-btn");
      const cancelAlertBtn = itemMeta.querySelector("#cancel-alert-btn");
      const alertConfigPanel = itemMeta.querySelector("#alert-config-panel");
      const alertSlider = itemMeta.querySelector("#alert-slider");

      if (configureBtn && alertConfigPanel) {
        configureBtn.addEventListener("click", () => {
          alertConfigPanel.style.display =
            alertConfigPanel.style.display === "none" || !alertConfigPanel.style.display
              ? "block" : "none";
        });
      }

      if (saveAlertBtn) saveAlertBtn.addEventListener("click", saveAlertSettings);

      if (cancelAlertBtn && alertConfigPanel) {
        cancelAlertBtn.addEventListener("click", () => {
          alertConfigPanel.style.display = "none";
        });
      }

      if (alertSlider) {
        alertSlider.addEventListener("input", () => {
          updateAlertSliderValue("alert-slider", "alert-value-display");
        });
      }

      bindRetakeButtons();
    }
  }

  // =========================================================
  // RETAKE IMAGE
  // =========================================================
  function bindRetakeButtons() {
    if (!canManageStock()) return;

    itemMeta.querySelectorAll(".retake-btn").forEach(btn => {
      btn.onclick = async () => {
        if (!canManageStock()) return;

        const actor = getActor();
        const index = Number(btn.dataset.index);
        showStatus(`Retaking image ${index + 1}… / Kupiga picha ${index + 1} tena…`);

        const file = await promptCameraCapture();
        if (!file) return clearStatus();

        const preview = URL.createObjectURL(file);
        setPreviewImageSlot(index, preview);

        const url = await uploadToCloudinary(file);
        currentItem.data.images[index] = url;

        const itemRef = doc(
          db,
          "Shops", currentItem.uid,
          "categories", currentItem.categoryId,
          "items", currentItem.itemId
        );

        await updateDoc(itemRef, {
          images: currentItem.data.images,
          updatedAt: Date.now(),
          updatedBy: actor
        });

        sendImageForEmbedding(url, index);
        showStatus("✅ Image updated / Picha imesasishwa");
        setTimeout(() => clearStatus(), 1500);
        renderItemMeta(currentItem.data);

        try { URL.revokeObjectURL(preview); } catch (_) {}
      };
    });
  }

  // =========================================================
  // HELPERS
  // =========================================================

  // Cancel-safe picker capture (no hanging if user cancels)
  function promptCameraCapture() {
    return new Promise(resolve => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.capture = "environment";
      input.style.display = "none";

      captureInProgress = true;
      let settled = false;

      const cleanup = (fileOrNull) => {
        if (settled) return;
        settled = true;
        captureInProgress = false;
        try { window.removeEventListener("focus", onFocusBack); } catch (_) {}
        try { input.remove(); } catch (_) {}
        resolve(fileOrNull || null);
      };

      input.onchange = () => cleanup(input.files?.[0] || null);

      const onFocusBack = () => {
        setTimeout(() => {
          if (!settled && (!input.files || input.files.length === 0)) cleanup(null);
        }, 350);
      };
      window.addEventListener("focus", onFocusBack);

      document.body.appendChild(input);
      input.click();
    });
  }

  function setPreviewImageSlot(index, url) {
    const slot = itemMeta.querySelector(`.image-slot:nth-child(${index + 1})`);
    if (slot) slot.innerHTML = `<img src="${url}" class="item-thumb">`;
  }

  function setPlaceholderMessage(index, text) {
    const slot = itemMeta.querySelector(`.image-slot:nth-child(${index + 1})`);
    if (slot) slot.textContent = text;
  }

  async function uploadToCloudinary(file) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`,
      { method: "POST", body: fd }
    );

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Cloudinary upload failed: ${res.status} ${txt}`);
    }

    const json = await res.json();
    return json.secure_url;
  }

  function showStatus(text) {
    const s = itemMeta.querySelector(".capture-status");
    if (s) s.textContent = text;
  }

  function clearStatus() {
    const s = itemMeta.querySelector(".capture-status");
    if (s) s.textContent = "";
  }

  // =========================================================
  // HIDE ITEM DETAIL
  // =========================================================
  function hideItemDetail() {
    itemDetail.classList.add("hidden");
    overlayContent.classList.remove("hidden");
    document.body.style.overflow = "";
    currentItem = null;
    editMode = false;

    if (editToggleBtn) editToggleBtn.textContent = "Edit / Hariri";
    syncEditButtonUI();

    const closeBtn = document.getElementById("item-detail-close-btn");
    if (closeBtn) closeBtn.remove();

    if (itemDetail) {
      ["shopId","categoryId","itemId","baseUnit","itemName"].forEach(k => delete itemDetail.dataset[k]);
    }
    document.dispatchEvent(new CustomEvent("item-detail:closed"));
  }

  // =========================================================
  // PUBLIC API
  // =========================================================
  window.attachItemDetailHandler = (el, name, uid, categoryId, itemId) => {
    el.onclick = e => {
      e.stopPropagation();
      showItemDetail(name, uid, categoryId, itemId);
    };
  };

  window.getCurrentItemContext = () => {
    if (!currentItem) return null;
    return {
      shopId: currentItem.uid,
      categoryId: currentItem.categoryId,
      itemId: currentItem.itemId,
      itemName: currentItem.data?.name || currentItem.name || "",
      baseUnit: currentItem.data?.baseUnit || itemDetail?.dataset?.baseUnit || "unit"
    };
  };

  window.hideItemDetail = hideItemDetail;
});