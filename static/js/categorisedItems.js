// categorisedItems.js (UPDATED: Better UX + Empty States + Visual Cues + Bilingual Text + Examples + Clickable Design)
import { db } from "./firebase-config.js";
import {
  collection,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

document.addEventListener("DOMContentLoaded", () => {
  // UI references
  const manageStockBtn = document.getElementById("manage-stock-btn");
  const overlay = document.getElementById("overlay");
  const overlayContent = document.querySelector(".overlay-content");
  const categoriesBtn = document.getElementById("categories-btn");
  const categoriesList = document.getElementById("categories-list");

  const categoryModal = document.getElementById("category-modal");
  const modalTitle = document.getElementById("modal-title");
  const addSubBtn = document.getElementById("add-subcategory-btn");
  const addItemBtn = document.getElementById("add-item-btn");
  const deleteCatBtn = document.getElementById("delete-category-btn");
  const closeModalX = document.getElementById("close-modal-x");

  const itemDetail = document.getElementById("item-detail");

  // Add helper text element if it doesn't exist
  let modalHelper = document.getElementById("modal-helper");
  if (!modalHelper && categoryModal) {
    modalHelper = document.createElement("div");
    modalHelper.id = "modal-helper";
    modalHelper.className = "modal-helper-text";
    categoryModal.querySelector(".modal-content")?.insertBefore(modalHelper, addSubBtn);
  }

  // State
  let currentCategory = null;
  let currentNodeData = null;

  let currentShopId = null;      // ✅ shop context (owner uid)
  let currentAuthUid = null;     // ✅ auth user uid (owner/staff)
  let currentActor = null;       // ✅ who is performing actions

  // ------------------------------
  // Session helpers (NEW)
  // ------------------------------
  function safeParse(json) {
    try { return JSON.parse(json); } catch { return null; }
  }

  function getSessionType() {
    return localStorage.getItem("sessionType") || "owner";
  }

  function getAccessLevel() {
    const t = getSessionType();
    if (t === "staff") {
      const ctx = safeParse(localStorage.getItem("staffContext")) || {};
      return Number(ctx.accessLevel ?? 1);
    }
    return 4; // owner full access
  }

  function canManageStock() {
    // adjust if your rules differ
    return getAccessLevel() >= 2;
  }

  function resolveShopId() {
    const shopId = localStorage.getItem("activeShopId");
    return shopId || null;
  }

  function resolveActor(authUser) {
    const t = getSessionType();
    if (t === "staff") {
      const ctx = safeParse(localStorage.getItem("staffContext")) || {};
      return {
        type: "staff",
        authUid: authUser.uid,
        staffId: ctx.staffId || null,
        name: ctx.name || authUser.displayName || "",
        email: ctx.email || authUser.email || "",
        roleName: ctx.roleName || "",
        accessLevel: ctx.accessLevel ?? null,
        shopId: ctx.shopId || null
      };
    }
    return {
      type: "owner",
      authUid: authUser.uid,
      name: authUser.displayName || "",
      email: authUser.email || "",
      accessLevel: 4
    };
  }

  async function writeAuditLog(action, entityType, entityId, extra = {}) {
    // Best-effort logging: if rules block it, we do not break the main flow
    try {
      if (!currentShopId) return;

      await addDoc(collection(db, "Shops", currentShopId, "auditLogs"), {
        action,                 // e.g. "create", "update", "delete"
        entityType,             // "category" | "item"
        entityId: entityId || null,
        shopId: currentShopId,

        performedBy: currentActor || null,
        performedByDisplay:
          currentActor?.name || currentActor?.email || currentActor?.authUid || "unknown",

        timestamp: serverTimestamp(),
        ...extra
      });
    } catch (e) {
      console.warn("Audit log failed (non-blocking):", e);
    }
  }

  function requireManageStockOrBlock() {
    if (!canManageStock()) {
      alert("Access denied: You don't have permission to manage stock. / Huna ruhusa ya kudhibiti stock.");
      return false;
    }
    return true;
  }

  /* ------------------------------
     Firestore path helpers
  -------------------------------*/
  function categoriesCollectionPath(shopId) {
    return ["Shops", shopId, "categories"];
  }
  function itemsCollectionPath(shopId, categoryId) {
    return ["Shops", shopId, "categories", categoryId, "items"];
  }

  /* ------------------------------
     Attach item handler (robust)
  -------------------------------*/
  function attachItemHandlerWithRetry(el, name, shopId, categoryId, itemId) {
    const MAX_ATTEMPTS = 12;
    let attempts = 0;

    function fallback() {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        alert(`Item clicked: ${name}`);
      });
      console.warn("attachItemDetailHandler not found after retries. Falling back to alert for item:", name);
    }

    function tryAttach() {
      attempts++;
      if (window && typeof window.attachItemDetailHandler === "function") {
        try {
          window.attachItemDetailHandler(el, name, shopId, categoryId, itemId);
        } catch (err) {
          console.error("attachItemDetailHandler threw:", err);
          fallback();
        }
      } else if (attempts > MAX_ATTEMPTS) {
        fallback();
      } else {
        setTimeout(tryAttach, 150);
      }
    }

    tryAttach();
  }

  /* ------------------------------
     IMPROVED: Create category DOM node with expand/collapse and clickable design
  -------------------------------*/
  function createCategoryNode(name, id) {
    const el = document.createElement("div");
    el.className = "category-item";
    el.dataset.id = id;

    // Create container for better styling
    const content = document.createElement("div");
    content.className = "category-content";
    
    // Category name with icon
    const nameSpan = document.createElement("span");
    nameSpan.className = "category-name";
    nameSpan.textContent = name;
    
    // Add expand/collapse indicator
    const expandIcon = document.createElement("span");
    expandIcon.className = "expand-icon";
    expandIcon.innerHTML = "▶"; // Right arrow
    
    content.appendChild(nameSpan);
    content.appendChild(expandIcon);
    el.appendChild(content);
    
    // Children container
    const children = document.createElement("div");
    children.className = "children";
    el.appendChild(children);
    
    // Toggle expand/collapse on content click
    content.addEventListener("click", (e) => {
      e.stopPropagation();
      
      // Toggle visibility of children
      if (children.children.length > 0) {
        children.classList.toggle("visible");
        expandIcon.innerHTML = children.classList.contains("visible") ? "▼" : "▶";
      }
      
      // Still open modal on click
      currentCategory = el;
      currentNodeData = { id, name };
      if (modalTitle) modalTitle.textContent = `Category: ${name}`;
      showModal();
      
      // Add visual feedback for click
      content.style.transform = "scale(0.99)";
      setTimeout(() => content.style.transform = "", 100);
    });

    return el;
  }

  /* ------------------------------
     Modal helpers (IMPROVED)
  -------------------------------*/
  function showModal() {
    if (!categoryModal) return;
    categoryModal.classList.remove("hidden");
    updateModalButtons();
  }

  function hideModal() {
    if (!categoryModal) return;
    categoryModal.classList.add("hidden");
    currentCategory = null;
    currentNodeData = null;
  }

  closeModalX?.addEventListener("click", hideModal);

  /* ------------------------------
     IMPROVED: Update modal buttons with clear guidance (BILINGUAL + EXAMPLES)
  -------------------------------*/
  function updateModalButtons() {
    if (!currentCategory) return;

    // RBAC: hide mutation actions if cannot manage stock
    const allow = canManageStock();
    
    const children = currentCategory.querySelector(".children")?.children || [];
    const hasSubcategories = Array.from(children).some(c => c.classList.contains("category-item"));
    const hasItems = Array.from(children).some(c => c.classList.contains("item"));

    // Update button text with context (bilingual)
    if (addSubBtn) {
      addSubBtn.innerHTML = hasItems 
        ? '📁 Cannot add subcategory (has items) / <i>Huwezi kuongeza tanzu (ina bidhaa)</i>' 
        : '📁 Add Subcategory / <i>Ongeza Tanzu</i>';
      addSubBtn.disabled = hasItems || !allow;
      addSubBtn.title = hasItems ? "This category already has items" : "Add a new subcategory";
    }
    
    if (addItemBtn) {
      addItemBtn.innerHTML = hasSubcategories 
        ? '📦 Cannot add item (has subcategories) / <i>Huwezi kuongeza bidhaa (ina tanzu)</i>' 
        : '📦 Add Item / <i>Ongeza Bidhaa</i>';
      addItemBtn.disabled = hasSubcategories || !allow;
      addItemBtn.title = hasSubcategories ? "This category has subcategories - add items to leaf categories" : "Add a new item";
    }
    
    if (deleteCatBtn) {
      deleteCatBtn.innerHTML = '🗑️ Delete Category / <i>Futa Aina</i>';
      deleteCatBtn.disabled = !allow;
    }
    
    // Show/hide based on permissions
    addSubBtn.style.display = allow ? "inline-block" : "none";
    addItemBtn.style.display = allow ? "inline-block" : "none";
    deleteCatBtn.style.display = allow ? "inline-block" : "none";
    
    // Update helper text with guidance AND EXAMPLES (bilingual)
    if (modalHelper) {
      if (!allow) {
        modalHelper.innerHTML = "You don't have permission to manage stock. / <i>Huna ruhusa ya kudhibiti stock.</i>";
      } else if (hasSubcategories && hasItems) {
        modalHelper.innerHTML = "This category contains both subcategories and items. / <i>Aina hii ina tanzu na bidhaa.</i>";
      } else if (hasSubcategories) {
        modalHelper.innerHTML = `
          <strong>This category has subcategories.</strong> / <i><strong>Aina hii ina tanzu.</strong></i><br>
          Add items only to leaf categories (subcategories with no further subcategories).<br>
          <i>Ongeza bidhaa kwenye tanzu za mwisho pekee (tanzu ambazo hazina tanzu nyingine).</i><br>
          <span style="display:block; background:#f0f9ff; padding:5px; margin-top:5px; border-radius:4px;">
            💡 Example: "Drinks" → "Sodas" → (add items like "Coca-Cola", "Pepsi" here)
          </span>
        `;
      } else if (hasItems) {
        modalHelper.innerHTML = `
          <strong>This category has items.</strong> / <i><strong>Aina hii ina bidhaa.</strong></i><br>
          Cannot add subcategories here. Create a new category if you need subcategories.<br>
          <i>Huwezi kuongeza tanzu hapa. Unda aina mpya ikiwa unahitaji tanzu.</i><br>
          <span style="display:block; background:#f0f9ff; padding:5px; margin-top:5px; border-radius:4px;">
            💡 Example: "Soft Drinks" (category) → "Coca-Cola", "Fanta", "Sprite" (items)
          </span>
        `;
      } else {
        modalHelper.innerHTML = `
          <strong>Add subcategories or items to organize your stock.</strong> / <i><strong>Ongeza tanzu au bidhaa kupanga stock yako.</strong></i><br>
          <span style="display:block; background:#f0f9ff; padding:8px; margin-top:8px; border-radius:4px;">
            📁 <strong>Subcategory example:</strong> "Drinks" → "Sodas", "Juices", "Water"<br>
            📦 <strong>Item example:</strong> "Sodas" → "Coca-Cola", "Pepsi", "Fanta"<br>
            <i>📁 <strong>Mfano wa tanzu:</strong> "Vinywaji" → "Soda", "Juisi", "Maji"</i><br>
            <i>📦 <strong>Mfano wa bidhaa:</strong> "Soda" → "Coca-Cola", "Pepsi", "Fanta"</i>
          </span>
        `;
      }
    }
  }

  /* ------------------------------
     Overlay helpers
  -------------------------------*/
  function showCategoriesOverlay() {
    overlay.classList.remove("hidden");
    overlayContent.classList.remove("hidden");
    if (itemDetail) {
      itemDetail.classList.add("hidden");
      itemDetail.setAttribute("aria-hidden", "true");
    }
    injectCategoriesCloseButton();
    
    // Add a class to body for potential overlay-specific styling
    document.body.classList.add("categories-overlay-open");
  }

  function closeCategoriesOverlay() {
    hideOverlayCompletely();
  }

  function hideOverlayCompletely() {
    overlay.classList.add("hidden");
    overlayContent.classList.add("hidden");
    if (itemDetail) {
      itemDetail.classList.add("hidden");
      itemDetail.setAttribute("aria-hidden", "true");
    }
    hideModal();
    document.body.classList.remove("categories-overlay-open");
  }

  function injectCategoriesCloseButton() {
    if (overlay && !document.getElementById("categories-close-btn")) {
      const closeBtn = document.createElement("span");
      closeBtn.id = "categories-close-btn";
      closeBtn.className = "close-x";
      closeBtn.setAttribute("role", "button");
      closeBtn.setAttribute("aria-label", "Close categories and go back to dashboard / Funga aina na urudi kwenye dashibodi");
      closeBtn.innerHTML = "&times;";
      closeBtn.style.position = "absolute";
      closeBtn.style.top = "10px";
      closeBtn.style.right = "15px";
      closeBtn.style.fontSize = "24px";
      closeBtn.style.cursor = "pointer";
      closeBtn.style.zIndex = "1001";
      overlay.appendChild(closeBtn);

      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        closeCategoriesOverlay();
      });
    }
  }

  /* ------------------------------
     IMPROVED: Load categories with empty state (BILINGUAL + EXAMPLES)
  -------------------------------*/
  async function loadCategories() {
    if (!currentShopId) return;
    categoriesList.innerHTML = "";

    const catSnap = await getDocs(collection(db, ...categoriesCollectionPath(currentShopId)));
    
    // Show empty state if no categories (bilingual + examples)
    if (catSnap.empty) {
      const emptyMsg = document.createElement("div");
      emptyMsg.className = "empty-state";
      emptyMsg.innerHTML = `
        <div style="font-size: 3rem; margin-bottom: 0.5rem;">📂</div>
        <p style="font-weight: bold; margin-bottom: 0.5rem;">No categories yet / <i>Hakuna aina bado</i></p>
        <p style="font-size: 0.9rem; color: #64748b; margin-bottom: 1rem;">Start by creating your first category / <i>Anza kwa kuunda aina yako ya kwanza</i></p>
        <div style="background: #f0f9ff; padding: 0.75rem; border-radius: 0.5rem; margin-bottom: 1rem; text-align: left;">
          <p style="font-weight: bold; margin-bottom: 0.25rem;">💡 Examples / <i>Mifano:</i></p>
          <p style="margin: 0.25rem 0;">• Drinks / <i>Vinywaji</i></p>
          <p style="margin: 0.25rem 0;">• Food / <i>Chakula</i></p>
          <p style="margin: 0.25rem 0;">• Clothes / <i>Nguo</i></p>
        </div>
        <button id="empty-state-category-btn" class="btn-start" style="padding: 0.5rem 1rem; font-size: 0.9rem;">+ Create Category / <i>Unda Aina</i></button>
      `;
      categoriesList.appendChild(emptyMsg);
      
      // Add event listener to the button
      document.getElementById("empty-state-category-btn")?.addEventListener("click", () => {
        categoriesBtn?.click();
      });
      return;
    }

    const map = {};

    catSnap.forEach(d => {
      const data = d.data();
      map[d.id] = {
        node: createCategoryNode(data.name, d.id),
        parentId: data.parentId
      };
    });

    Object.values(map).forEach(({ node, parentId }) => {
      if (parentId && map[parentId]) {
        map[parentId].node.querySelector(".children").appendChild(node);
      } else {
        categoriesList.appendChild(node);
      }
    });

    for (const catId of Object.keys(map)) {
      const itemsSnap = await getDocs(collection(db, ...itemsCollectionPath(currentShopId, catId)));
      
      // Show empty state for categories with no items (bilingual + examples)
      if (itemsSnap.empty) {
        const parent = map[catId]?.node;
        if (!parent) continue;
        
        const emptyItemMsg = document.createElement("div");
        emptyItemMsg.className = "empty-items-hint";
        emptyItemMsg.innerHTML = `
          <span style="color: #94a3b8; font-size: 0.8rem;">
            (No items - click category to add) / <i>(Hakuna bidhaa - bofya aina kuongeza)</i>
          </span>
          <div style="background: #f0f9ff; padding: 0.5rem; margin-top: 0.5rem; border-radius: 4px; font-size: 0.8rem;">
            💡 Examples / <i>Mifano</i>: 
            "Coca-Cola", "Fanta", "Sprite" for Drinks category<br>
            <i>"Coca-Cola", "Fanta", "Sprite" kwa aina ya Vinywaji</i>
          </div>
        `;
        parent.querySelector(".children").appendChild(emptyItemMsg);
        continue;
      }
      
      itemsSnap.forEach(d => {
        const data = d.data();
        const parent = map[catId]?.node;
        if (!parent) return;

        const item = document.createElement("div");
        item.className = "item";
        
        // Add item name with visual indicator
        const itemText = document.createElement("span");
        itemText.className = "item-text";
        itemText.textContent = data.name;
        
        // Add subtle hint that it's clickable
        const clickHint = document.createElement("span");
        clickHint.className = "item-click-hint";
        clickHint.innerHTML = "🔍";
        clickHint.style.opacity = "0.3";
        clickHint.style.marginLeft = "8px";
        clickHint.style.fontSize = "12px";
        
        item.appendChild(itemText);
        item.appendChild(clickHint);
        item.dataset.id = d.id;

        // Add hover effect to show click hint
        item.addEventListener("mouseenter", () => {
          clickHint.style.opacity = "1";
        });
        
        item.addEventListener("mouseleave", () => {
          clickHint.style.opacity = "0.3";
        });

        attachItemHandlerWithRetry(item, data.name, currentShopId, catId, d.id);
        parent.querySelector(".children").appendChild(item);
      });
    }
    
    // After loading, expand root categories by default for better visibility
    document.querySelectorAll(".category-item > .children").forEach(child => {
      if (child.children.length > 0) {
        child.classList.add("visible");
        const expandIcon = child.parentElement?.querySelector(".expand-icon");
        if (expandIcon) expandIcon.innerHTML = "▼";
      }
    });
  }

  window.reloadShopCategories = loadCategories;

  /* ------------------------------
     Auth watcher (FIXED)
  -------------------------------*/
  const auth = getAuth();
  auth.onAuthStateChanged(user => {
    if (!user) {
      currentShopId = null;
      currentAuthUid = null;
      currentActor = null;
      if (categoriesList) categoriesList.innerHTML = "";
      return;
    }

    currentAuthUid = user.uid;
    currentShopId = resolveShopId();      // ✅ critical: shop context
    currentActor = resolveActor(user);    // ✅ who is acting

    if (!currentShopId) {
      console.warn("activeShopId missing. Redirecting to home.");
      window.location.href = "/";
      return;
    }

    loadCategories().catch(err => console.error("Failed to load categories:", err));
  });

  /* ------------------------------
     Event bindings
  -------------------------------*/
  manageStockBtn?.addEventListener("click", () => {
    // You may allow staff to view but not edit; up to you.
    // If you want staff L1 to not even open overlay, enforce here:
    if (!canManageStock()) {
      alert("Access denied: You don't have permission to manage stock. / Huna ruhusa ya kudhibiti stock.");
      return;
    }
    showCategoriesOverlay();
  });

  overlay?.addEventListener("click", (e) => {
    if (e.target === overlay) hideOverlayCompletely();
  });

  /* ------------------------------
     CRUD helpers (UPDATED WITH TRACKING)
  -------------------------------*/
  async function saveCategory(name, parentId = null) {
    if (!currentShopId) return null;
    let ancestors = [];
    let fullPath = name;

    if (parentId) {
      const parentRef = doc(db, "Shops", currentShopId, "categories", parentId);
      const parentSnap = await getDoc(parentRef);
      if (!parentSnap.exists()) throw new Error("Parent category not found");

      const parent = parentSnap.data();
      ancestors = Array.isArray(parent.ancestors) ? [...parent.ancestors] : [];
      ancestors.push({ id: parentId, name: parent.name });
      fullPath = ancestors.map(a => a.name).concat(name).join(" > ");
    }

    const ref = await addDoc(collection(db, ...categoriesCollectionPath(currentShopId)), {
      name,
      parentId,
      ancestors,
      fullPath,
      createdAt: Date.now(),
      createdBy: currentActor || null
    });

    await writeAuditLog("create", "category", ref.id, { name, parentId });
    return ref.id;
  }

  async function saveItem(name, parentId, itemData = {}) {
    if (!currentShopId) return null;

    const catRef = doc(db, "Shops", currentShopId, "categories", parentId);
    const catSnap = await getDoc(catRef);
    if (!catSnap.exists()) throw new Error("Category not found");

    const cat = catSnap.data();
    const ancestors = Array.isArray(cat.ancestors) ? [...cat.ancestors] : [];
    ancestors.push({ id: parentId, name: cat.name });
    const fullPath = ancestors.map(a => a.name).concat(name).join(" > ");

    const ref = await addDoc(collection(db, ...itemsCollectionPath(currentShopId, parentId)), {
      name,
      categoryId: parentId,
      ancestors,
      fullPath,
      ...itemData,
      createdAt: Date.now(),
      createdBy: currentActor || null
    });

    await writeAuditLog("create", "item", ref.id, { name, categoryId: parentId });
    return ref.id;
  }

  async function nameExistsInCollection(collectionPath, name) {
    const colRef = collection(db, ...collectionPath);
    const snap = await getDocs(colRef);
    const key = name.trim().toLowerCase();
    const existingDoc = snap.docs.find(d => (d.data().name || "").toLowerCase() === key);
    return existingDoc
      ? { exists: true, docId: existingDoc.id, data: existingDoc.data() }
      : { exists: false };
  }

  async function updateNameInCollection(collectionPath, docId, newName) {
    await updateDoc(doc(db, ...collectionPath, docId), {
      name: newName,
      updatedAt: Date.now(),
      updatedBy: currentActor || null
    });

    await writeAuditLog("update", collectionPath[collectionPath.length - 1] === "categories" ? "category" : "item", docId, {
      field: "name",
      newName
    });

    if (collectionPath.length >= 3 && collectionPath[collectionPath.length - 1] === "categories") {
      await rebuildAllCategoryPaths(currentShopId);
    }
  }

  async function rebuildAllCategoryPaths(shopId) {
    const catSnap = await getDocs(collection(db, ...categoriesCollectionPath(shopId)));
    const map = {};
    catSnap.forEach(d => (map[d.id] = { id: d.id, ...d.data() }));

    function computeAncestorsAndPath(catId) {
      const ancestors = [];
      let cur = map[catId];
      while (cur && cur.parentId) {
        const parent = map[cur.parentId];
        if (!parent) break;
        ancestors.unshift({ id: parent.id, name: parent.name });
        cur = parent;
      }
      const fullPath = ancestors.map(a => a.name).concat(map[catId].name).join(" > ");
      return { ancestors, fullPath };
    }

    for (const id of Object.keys(map)) {
      const { ancestors, fullPath } = computeAncestorsAndPath(id);
      await updateDoc(doc(db, "Shops", shopId, "categories", id), {
        ancestors,
        fullPath,
        updatedAt: Date.now(),
        updatedBy: currentActor || null
      });
    }

    for (const id of Object.keys(map)) {
      const cat = map[id];
      const catAncestors = Array.isArray(cat.ancestors) ? [...cat.ancestors] : [];
      const itemsSnap = await getDocs(collection(db, ...itemsCollectionPath(shopId, id)));
      for (const itemDoc of itemsSnap.docs) {
        const item = itemDoc.data();
        const itemAncestors = [...catAncestors, { id, name: cat.name }];
        const itemFullPath = itemAncestors.map(a => a.name).concat(item.name).join(" > ");
        await updateDoc(doc(db, "Shops", shopId, "categories", id, "items", itemDoc.id), {
          ancestors: itemAncestors,
          fullPath: itemFullPath,
          updatedAt: Date.now(),
          updatedBy: currentActor || null
        });
      }
    }
  }

  /* ------------------------------
     Creation and deletion bindings (UPDATED WITH RBAC)
  -------------------------------*/
  categoriesBtn?.addEventListener("click", async () => {
    if (!requireManageStockOrBlock()) return;
    if (!currentShopId) return;

    const name = prompt("Enter category name (e.g., Drinks, Food, Clothes): / Ingiza jina la aina (mfano: Vinywaji, Chakula, Nguo):");
    if (!name?.trim()) return;
    const clean = name.trim();

    const { exists, docId } = await nameExistsInCollection(categoriesCollectionPath(currentShopId), clean);
    if (exists) {
      const confirmEdit = confirm(`Category "${clean}" already exists. Do you want to rename it? / Aina "${clean}" tayari ipo. Unataka kuibadilisha jina?`);
      if (!confirmEdit) return;
      const newName = prompt("Enter new name for category: / Ingiza jina jipya la aina:", clean);
      if (!newName?.trim()) return;
      await updateNameInCollection(categoriesCollectionPath(currentShopId), docId, newName.trim());
      await loadCategories();
      return;
    }

    try {
      const id = await saveCategory(clean);
      if (!id) return;
      const node = createCategoryNode(clean, id);
      categoriesList.appendChild(node);
      
      // Auto-expand new category
      setTimeout(() => {
        const expandIcon = node.querySelector(".expand-icon");
        const children = node.querySelector(".children");
        if (children && expandIcon) {
          children.classList.add("visible");
          expandIcon.innerHTML = "▼";
        }
      }, 100);
    } catch (err) {
      console.error("Failed to create category", err);
      alert("Failed to create category. See console for details. / Imeshindwa kuunda aina. Tafadhali angalia console kwa maelezo.");
    }
  });

  addSubBtn?.addEventListener("click", async () => {
    if (!requireManageStockOrBlock()) return;
    if (!currentCategory || !currentShopId) return;

    const name = prompt("Enter subcategory name (e.g., Sodas, Juices, Water): / Ingiza jina la tanzu (mfano: Soda, Juisi, Maji):");
    if (!name?.trim()) return;
    const clean = name.trim();

    const { exists, docId } = await nameExistsInCollection(categoriesCollectionPath(currentShopId), clean);
    if (exists) {
      const confirmEdit = confirm(`Subcategory "${clean}" already exists. Do you want to rename it? / Tanzu "${clean}" tayari ipo. Unataka kuibadilisha jina?`);
      if (!confirmEdit) return;
      const newName = prompt("Enter new name for subcategory: / Ingiza jina jipya la tanzu:", clean);
      if (!newName?.trim()) return;
      await updateNameInCollection(categoriesCollectionPath(currentShopId), docId, newName.trim());
      await loadCategories();
      return;
    }

    try {
      const id = await saveCategory(clean, currentCategory.dataset.id);
      if (!id) return;
      const node = createCategoryNode(clean, id);
      currentCategory.querySelector(".children").appendChild(node);
      
      // Auto-expand parent to show new subcategory
      const children = currentCategory.querySelector(".children");
      const expandIcon = currentCategory.querySelector(".expand-icon");
      if (children && expandIcon) {
        children.classList.add("visible");
        expandIcon.innerHTML = "▼";
      }
      
      hideModal();
    } catch (err) {
      console.error("Failed to create subcategory", err);
      alert("Failed to create subcategory. See console for details. / Imeshindwa kuunda tanzu. Tafadhali angalia console kwa maelezo.");
    }
  });

  addItemBtn?.addEventListener("click", async () => {
    if (!requireManageStockOrBlock()) return;
    if (!currentCategory || !currentShopId) return;

    const isLeaf = await isLeafCategory(currentShopId, currentCategory.dataset.id);
    if (!isLeaf) {
      alert("This category has subcategories. Add items only to a leaf category. / Aina hii ina tanzu. Ongeza bidhaa kwenye tanzu za mwisho pekee.");
      return;
    }

    const name = prompt("Enter item name (e.g., Coca-Cola, Fanta, Sprite): / Ingiza jina la bidhaa (mfano: Coca-Cola, Fanta, Sprite):");
    if (!name?.trim()) return;
    const clean = name.trim();

    const itemsPath = itemsCollectionPath(currentShopId, currentCategory.dataset.id);
    const { exists, docId } = await nameExistsInCollection(itemsPath, clean);
    if (exists) {
      const confirmEdit = confirm(`Item "${clean}" already exists. Do you want to rename it? / Bidhaa "${clean}" tayari ipo. Unataka kuibadilisha jina?`);
      if (!confirmEdit) return;
      const newName = prompt("Enter new name for item: / Ingiza jina jipya la bidhaa:", clean);
      if (!newName?.trim()) return;
      await updateNameInCollection(itemsPath, docId, newName.trim());
      await loadCategories();
      return;
    }

    try {
      const id = await saveItem(clean, currentCategory.dataset.id, { stock: 0 });
      if (!id) return;

      // Remove empty items hint if it exists
      const childrenContainer = currentCategory.querySelector(".children");
      const emptyHint = childrenContainer.querySelector(".empty-items-hint");
      if (emptyHint) emptyHint.remove();

      const item = document.createElement("div");
      item.className = "item";
      
      const itemText = document.createElement("span");
      itemText.className = "item-text";
      itemText.textContent = clean;
      
      const clickHint = document.createElement("span");
      clickHint.className = "item-click-hint";
      clickHint.innerHTML = "🔍";
      clickHint.style.opacity = "0.3";
      clickHint.style.marginLeft = "8px";
      clickHint.style.fontSize = "12px";
      
      item.appendChild(itemText);
      item.appendChild(clickHint);
      item.dataset.id = id;
      
      item.addEventListener("mouseenter", () => {
        clickHint.style.opacity = "1";
      });
      
      item.addEventListener("mouseleave", () => {
        clickHint.style.opacity = "0.3";
      });

      attachItemHandlerWithRetry(item, clean, currentShopId, currentCategory.dataset.id, id);
      childrenContainer.appendChild(item);
      
      // Auto-expand to show new item
      const expandIcon = currentCategory.querySelector(".expand-icon");
      if (childrenContainer && expandIcon) {
        childrenContainer.classList.add("visible");
        expandIcon.innerHTML = "▼";
      }
      
      hideModal();
    } catch (err) {
      console.error("Failed to create item", err);
      alert("Failed to create item. See console for details. / Imeshindwa kuunda bidhaa. Tafadhali angalia console kwa maelezo.");
    }
  });

  deleteCatBtn?.addEventListener("click", async () => {
    if (!requireManageStockOrBlock()) return;
    if (!currentCategory || !currentShopId) return;

    const ok = confirm("Delete this category/subcategory? This will not delete child categories or items automatically. / Futa aina/tanzu hii? Haitafuta aina au bidhaa ndogo moja kwa moja.");
    if (!ok) return;

    const id = currentCategory.dataset.id;

    try {
      await writeAuditLog("delete", "category", id, { name: currentNodeData?.name || null });
      await deleteDoc(doc(db, "Shops", currentShopId, "categories", id));
      currentCategory.remove();
      hideModal();
    } catch (err) {
      console.error("Failed to delete category", err);
      alert("Failed to delete category. See console for details. / Imeshindwa kufuta aina. Tafadhali angalia console kwa maelezo.");
    }
  });

  async function isLeafCategory(shopId, categoryId) {
    const q = query(collection(db, ...categoriesCollectionPath(shopId)), where("parentId", "==", categoryId));
    const snap = await getDocs(q);
    return snap.empty;
  }
});