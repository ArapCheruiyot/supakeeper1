// smallSellingUnit.js - Selling Units UI Manager
// Version 3.1.0 - Bilingual (English/Swahili) + Improved UX + Tailwind Classes

(function() {
  'use strict';

  // ========= Configuration =========
  const SELL_UNITS_COLLECTION = 'sellUnits'; // change to 'sellingUnits' if you prefer that name

  const IMAGES = {
    requiredCount: 2,
    maxSize: 5 * 1024 * 1024, // 5MB
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/jpg']
  };

  // ========= Integrations (injected once by your app/overlay) =========
  const INTEGRATIONS = { db: null, auth: null, FS: null, cloudName: null, uploadPreset: null };

  // Allow host app to inject Firebase + Cloudinary deps once
  window.sellingUnitsConfigure = function ({ db, auth, FS, cloudName, uploadPreset } = {}) {
    if (db) INTEGRATIONS.db = db;
    if (auth) INTEGRATIONS.auth = auth;
    if (FS) INTEGRATIONS.FS = FS; // { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, serverTimestamp }
    if (cloudName) INTEGRATIONS.cloudName = cloudName;
    if (uploadPreset) INTEGRATIONS.uploadPreset = uploadPreset;
  };

  function requireConfigured() {
    if (!INTEGRATIONS.db || !INTEGRATIONS.FS) {
      throw new Error("SellingUnits: Firebase not configured. Call window.sellingUnitsConfigure(...) once.");
    }
    if (!INTEGRATIONS.cloudName || !INTEGRATIONS.uploadPreset) {
      throw new Error("SellingUnits: Cloudinary not configured. Pass cloudName and uploadPreset in sellingUnitsConfigure.");
    }
  }

  // ========= UI Config =========
  const CONFIG = {
    selectors: {
      itemDetail: '#item-detail, .item-detail',
      itemDetailHeader: '.item-detail-header',
      itemName: '#item-name'
    },
    button: {
      label: '📦 Selling Units / Vipimo vya Kuuza',
      id: 'selling-units-btn',
      className: 'selling-units-btn'
    },
    modal: {
      id: 'selling-units-modal',
      className: 'selling-units-modal',
      backdropClass: 'selling-units-backdrop',
      title: '📦 Selling Units / Vipimo vya Kuuza'
    }
  };

  // ========= State =========
  const state = {
    currentItemId: null,
    sellingUnits: new Map(), // itemId -> array of units [{id,name,conversionFactor,images,...}]
    observers: [],
    isModalOpen: false,
    loading: false
  };

  // ========= DOM cache =========
  const elements = {
    button: null,
    modal: null,
    backdrop: null
  };

  // ========= Utils =========
  function createElement(tag, attributes = {}, children = []) {
    const el = document.createElement(tag);
    Object.entries(attributes).forEach(([k, v]) => {
      if (k === 'className') el.className = v;
      else if (k === 'textContent') el.textContent = v;
      else if (k === 'innerHTML') el.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else el.setAttribute(k, v);
    });
    children.forEach(c => el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return el;
  }

  function clearElement(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function bytesToMB(b) {
    return (b / (1024 * 1024)).toFixed(1);
  }

  // ========= Styles =========
  function injectStyles() {
    const styleId = 'selling-units-styles';
    if (document.getElementById(styleId)) return;

    const styles = `
      .selling-units-btn {
        width: 100%;
        padding: 14px 20px;
        background: linear-gradient(135deg, #4f46e5, #6366f1);
        color: white;
        border: none;
        border-radius: 12px;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s ease;
        margin-top: 16px;
        text-align: center;
        display: block;
        box-sizing: border-box;
        box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.2);
      }
      .selling-units-btn:hover { 
        background: linear-gradient(135deg, #4338ca, #4f46e5);
        transform: translateY(-2px);
        box-shadow: 0 10px 15px -3px rgba(79, 70, 229, 0.3);
      }
      .selling-units-btn:active { transform: translateY(0); }

      .selling-units-backdrop {
        position: fixed; inset: 0; background: rgba(0,0,0,0.6);
        backdrop-filter: blur(4px);
        z-index: 9999; display: flex; align-items: center; justify-content: center;
        animation: fadeIn 0.2s ease;
      }
      .selling-units-modal {
        background: white; border-radius: 20px; width: 90%; max-width: 560px;
        max-height: 90vh; overflow-y: auto; animation: slideIn 0.3s ease;
        box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
      }
      .modal-header {
        padding: 20px 24px; border-bottom: 1px solid #e5e7eb;
        display: flex; justify-content: space-between; align-items: center;
        background: #f9fafb;
        border-radius: 20px 20px 0 0;
      }
      .modal-title { margin: 0; font-size: 20px; font-weight: 700; color: #111827; }
      .close-btn { 
        background: none; border: none; font-size: 28px; cursor: pointer; color: #6b7280;
        width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;
        border-radius: 50%; transition: all 0.2s;
      }
      .close-btn:hover { background: #fee2e2; color: #ef4444; transform: rotate(90deg); }
      .modal-body { padding: 24px; }

      .item-info { 
        background: linear-gradient(135deg, #f0f9ff, #e0f2fe); 
        padding: 16px 20px; border-radius: 16px; margin-bottom: 24px;
        border: 1px solid #bae6fd;
      }
      .item-name { margin: 0 0 6px 0; font-weight: 700; color: #0369a1; font-size: 18px; }
      .base-unit { margin: 0; font-size: 14px; color: #0284c7; display: flex; align-items: center; gap: 6px; }
      .base-unit::before { content: "📏"; }

      .form-group { margin-bottom: 20px; }
      .form-label { 
        display: block; margin-bottom: 8px; font-size: 14px; font-weight: 600; color: #374151;
        display: flex; align-items: center; gap: 4px;
      }
      .form-label.required::after { content: " *"; color: #ef4444; }
      .form-input { 
        width: 100%; padding: 12px 16px; border: 2px solid #e5e7eb; border-radius: 12px; 
        font-size: 15px; box-sizing: border-box; transition: all 0.2s;
      }
      .form-input:focus { 
        outline: none; border-color: #4f46e5; box-shadow: 0 0 0 4px rgba(79,70,229,0.1);
      }
      .help-text { 
        font-size: 12px; color: #6b7280; margin-top: 6px; display:block;
        background: #f3f4f6; padding: 6px 12px; border-radius: 20px;
      }

      .add-btn {
        width: 100%; padding: 14px 20px; background: #10b981; color: white;
        border: none; border-radius: 12px; font-size: 16px; font-weight: 600; 
        cursor: pointer; transition: all 0.2s ease;
        box-shadow: 0 4px 6px -1px rgba(16, 185, 129, 0.2);
      }
      .add-btn:hover { background: #059669; transform: translateY(-2px); box-shadow: 0 10px 15px -3px rgba(16, 185, 129, 0.3); }
      .add-btn[disabled] { opacity: .5; cursor: not-allowed; transform: none; }

      .units-list { margin-top: 32px; background: #f9fafb; padding: 20px; border-radius: 16px; }
      .list-title { 
        font-size: 18px; font-weight: 700; margin: 0 0 16px 0; color: #111827;
        display: flex; align-items: center; gap: 8px;
      }
      .list-title::before { content: "📋"; }
      .unit-item {
        display: flex; justify-content: space-between; align-items: center;
        padding: 16px; background: white; border-radius: 12px; margin-bottom: 10px;
        border: 1px solid #e5e7eb; box-shadow: 0 2px 4px rgba(0,0,0,0.02);
        transition: all 0.2s;
      }
      .unit-item:hover { box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); border-color: #4f46e5; }
      .unit-info { flex: 1; display:flex; gap:12px; align-items: center; }
      .unit-name { margin: 0 0 4px 0; font-weight: 600; color: #111827; }
      .unit-conversion { margin: 0; font-size: 13px; color: #6b7280; }
      .unit-thumb { 
        width: 48px; height: 48px; border-radius: 10px; object-fit: cover; 
        border: 2px solid #e5e7eb; transition: all 0.2s;
      }
      .unit-item:hover .unit-thumb { border-color: #4f46e5; }

      .unit-remove {
        background: #fef2f2; color: #ef4444; border: 1px solid #fee2e2; border-radius: 30px;
        width: 36px; height: 36px; cursor: pointer; font-size: 18px; 
        display: flex; align-items: center; justify-content: center;
        transition: all 0.2s;
      }
      .unit-remove:hover { background: #ef4444; color: white; border-color: #ef4444; }

      .empty-state { 
        text-align: center; padding: 30px 20px; color: #6b7280; font-style: italic;
        background: white; border-radius: 12px; border: 2px dashed #e5e7eb;
      }

      /* Image UI */
      .image-upload-section { 
        margin-top: 16px; padding: 16px; background: #f9fafb; border-radius: 16px;
        border: 1px solid #e5e7eb;
      }
      .image-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
      .image-slot {
        border: 2px dashed #d1d5db; border-radius: 16px; height: 150px; background: white;
        display:flex; flex-direction:column; align-items:center; justify-content:center; 
        cursor:pointer; position: relative; overflow:hidden;
        transition: all 0.2s;
      }
      .image-slot:hover { border-color: #4f46e5; background: #f5f3ff; }
      .image-slot.has-image { border-style: solid; border-color: #10b981; background: #f0fdf4; }
      .image-icon { font-size: 28px; color:#9ca3af; margin-bottom: 8px; }
      .image-text { font-size: 13px; color:#6b7280; text-align:center; font-weight: 500; }
      .image-preview { width: 100%; height: 100%; object-fit: cover; display: block; }
      .image-remove {
        position: absolute; top: 8px; right: 8px; background: rgba(239, 68, 68, 0.9);
        color: white; border: none; border-radius: 50%; width: 28px; height: 28px; 
        font-size: 14px; cursor: pointer; display:flex; align-items:center; justify-content:center;
        transition: all 0.2s;
      }
      .image-remove:hover { background: #dc2626; transform: scale(1.1); }

      .image-badge {
        position: absolute; bottom: 8px; left: 8px; background: #10b981;
        color: white; font-size: 11px; padding: 2px 8px; border-radius: 20px;
        font-weight: 600;
      }

      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes slideIn { from { opacity: 0; transform: translateY(-30px); } to { opacity: 1; transform: translateY(0); } }
    `;
    document.head.appendChild(createElement('style', { id: styleId }, [styles]));
  }

  // ========= Context helpers =========
  function resolveItemContext() {
    const el = document.querySelector('#item-detail');
    if (!el) return null;
    const shopId = el.dataset.shopId;
    const categoryId = el.dataset.categoryId;
    const itemId = el.dataset.itemId;
    const itemName = el.dataset.itemName || document.querySelector(CONFIG.selectors.itemName)?.textContent || "";
    const baseUnit = el.dataset.baseUnit || "unit";
    if (!shopId || !categoryId || !itemId) return null;
    return { shopId, categoryId, itemId, itemName, baseUnit };
  }

  function getCurrentItemId() {
    return resolveItemContext()?.itemId || null;
  }

  function getBaseUnit() {
    return resolveItemContext()?.baseUnit || "Unit";
  }

  function getItemName() {
    return resolveItemContext()?.itemName || "Unknown Item";
  }

  // ========= Cloudinary =========
  function validateFile(file) {
    if (!IMAGES.allowedTypes.includes(file.type)) {
      throw new Error(`Unsupported type: ${file.type} / Aina haitambuliki: ${file.type}`);
    }
    if (file.size > IMAGES.maxSize) {
      throw new Error(`Max size is ${bytesToMB(IMAGES.maxSize)}MB. Got ${bytesToMB(file.size)}MB / Ukubwa unaoruhusiwa ni ${bytesToMB(IMAGES.maxSize)}MB. Imeingia ${bytesToMB(file.size)}MB`);
    }
  }

  async function uploadToCloudinary(file) {
    requireConfigured();
    validateFile(file);

    const fd = new FormData();
    fd.append("file", file);
    fd.append("upload_preset", INTEGRATIONS.uploadPreset);

    const res = await fetch(`https://api.cloudinary.com/v1_1/${INTEGRATIONS.cloudName}/image/upload`, {
      method: "POST",
      body: fd
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return data;
  }

  function toImageMeta(cld) {
    return {
      url: cld.secure_url,
      thumb: cld.secure_url.replace("/upload/", "/upload/c_fill,w_300,h_300,q_auto,f_auto/"),
      publicId: cld.public_id,
      width: cld.width,
      height: cld.height,
      bytes: cld.bytes,
      format: cld.format
    };
  }

  // ========= Firestore helpers =========
  function sellingUnitsColRef(ctx) {
    const { collection } = INTEGRATIONS.FS;
    return collection(
      INTEGRATIONS.db,
      "Shops", ctx.shopId,
      "categories", ctx.categoryId,
      "items", ctx.itemId,
      SELL_UNITS_COLLECTION
    );
  }

  async function fetchSellingUnits(ctx) {
    requireConfigured();
    const { getDocs } = INTEGRATIONS.FS;
    const snap = await getDocs(sellingUnitsColRef(ctx));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  async function createSellingUnit(ctx, { name, conversionFactor, files }) {
    requireConfigured();
    const { addDoc, serverTimestamp } = INTEGRATIONS.FS;
    const user = INTEGRATIONS.auth?.currentUser || null;

    // Upload exactly two images
    if (!files || files.length < IMAGES.requiredCount) {
      throw new Error(`Please add ${IMAGES.requiredCount} images / Tafadhali ongeza picha ${IMAGES.requiredCount}`);
    }
    const [f1, f2] = files;
    const [c1, c2] = await Promise.all([uploadToCloudinary(f1), uploadToCloudinary(f2)]);
    const images = [toImageMeta(c1), toImageMeta(c2)];

    const data = {
      name,
      // store both names for compatibility with older/newer code
      conversionFactor: Number(conversionFactor),
      conversion: Number(conversionFactor),
      baseUnit: ctx.baseUnit,
      itemName: ctx.itemName,
      images,
      createdAt: serverTimestamp(),
      createdBy: user ? { uid: user.uid, email: user.email || null, name: user.displayName || null } : null
    };

    const ref = await addDoc(sellingUnitsColRef(ctx), data);
    return { id: ref.id, ...data };
  }

  async function deleteSellingUnitDoc(ctx, id) {
    requireConfigured();
    const { deleteDoc, doc } = INTEGRATIONS.FS;
    const ref = doc(
      INTEGRATIONS.db,
      "Shops", ctx.shopId,
      "categories", ctx.categoryId,
      "items", ctx.itemId,
      SELL_UNITS_COLLECTION, id
    );
    await deleteDoc(ref);
  }

  // ========= Button injection =========
  function createButton() {
    return createElement('button', {
      id: CONFIG.button.id,
      className: CONFIG.button.className,
      textContent: CONFIG.button.label,
      type: 'button'
    });
  }

  function injectButton(itemDetail) {
    let btn = itemDetail.querySelector(`#${CONFIG.button.id}`);
    if (btn) {
      elements.button = btn;
      if (!btn.dataset.suBound) {
        btn.addEventListener('click', handleButtonClick);
        btn.dataset.suBound = "1";
      }
      return;
    }

    const header = itemDetail.querySelector(CONFIG.selectors.itemDetailHeader);
    if (!header) {
      console.warn('SellingUnits: item detail header not found');
      return;
    }
    btn = createButton();
    elements.button = btn;
    header.parentNode.insertBefore(btn, header.nextSibling);
    btn.addEventListener('click', handleButtonClick);
    btn.dataset.suBound = "1";
  }

  function handleButtonClick(e) {
    e.stopPropagation();
    e.preventDefault();
    openModal();
  }

  // ========= Modal =========
  function createModal() {
    elements.backdrop = createElement('div', { className: CONFIG.modal.backdropClass });
    elements.modal = createElement('div', { className: CONFIG.modal.className, id: CONFIG.modal.id });

    elements.backdrop.addEventListener('click', (e) => {
      if (e.target === elements.backdrop) closeModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.isModalOpen) closeModal();
    });
    return elements.modal;
  }

  async function openModal() {
    if (state.isModalOpen) return;

    const ctx = resolveItemContext();
    if (!ctx) {
      alert("Missing item context. Ensure #item-detail has data-shop-id, data-category-id, data-item-id. / Hakuna maelezo ya bidhaa. Hakikisha #item-detail ina data-shop-id, data-category-id, data-item-id.");
      return;
    }

    state.isModalOpen = true;
    state.currentItemId = ctx.itemId;

    if (!elements.modal) createModal();
    clearElement(elements.modal);

    const itemName = getItemName();
    const baseUnit = getBaseUnit();
    const currentUnits = state.sellingUnits.get(state.currentItemId) || [];

    const modalContent = buildModalContent(itemName, baseUnit, currentUnits);
    elements.modal.appendChild(modalContent);
    elements.backdrop.appendChild(elements.modal);
    document.body.appendChild(elements.backdrop);
    document.body.style.overflow = 'hidden';

    // Show loading state
    const loadingEl = createElement('div', { 
      className: 'text-center p-8',
      textContent: 'Loading... / Inapakia...' 
    });
    elements.modal.appendChild(loadingEl);

    // Fetch latest from Firestore and refresh
    try {
      state.loading = true;
      const units = await fetchSellingUnits(ctx);
      state.sellingUnits.set(state.currentItemId, units);
      refreshModal();
    } catch (err) {
      console.error("SellingUnits: failed to fetch units", err);
      alert("Failed to load selling units / Imeshindwa kupakia vipimo vya kuuza");
    } finally {
      state.loading = false;
    }
  }

  function closeModal() {
    if (!state.isModalOpen || !elements.backdrop) return;
    state.isModalOpen = false;
    if (elements.backdrop.parentNode) elements.backdrop.parentNode.removeChild(elements.backdrop);
    document.body.style.overflow = '';
  }

  function buildModalContent(itemName, baseUnit, sellingUnits) {
    const fragment = document.createDocumentFragment();

    const header = createElement('div', { className: 'modal-header' }, [
      createElement('h2', { className: 'modal-title', innerHTML: '📦 Selling Units <span style="font-size:14px; color:#6b7280; margin-left:8px;">Vipimo vya Kuuza</span>' }),
      createElement('button', { className: 'close-btn', textContent: '×' })
    ]);
    header.querySelector('.close-btn').addEventListener('click', closeModal);
    fragment.appendChild(header);

    const body = createElement('div', { className: 'modal-body' });

    const itemInfo = createElement('div', { className: 'item-info' }, [
      createElement('h3', { className: 'item-name', textContent: itemName }),
      createElement('p', { className: 'base-unit', innerHTML: `Base unit / Kipimo msingi: <strong>${baseUnit}</strong>` })
    ]);
    body.appendChild(itemInfo);

    const form = createForm(baseUnit);
    body.appendChild(form);

    const list = createUnitsList(sellingUnits, baseUnit);
    body.appendChild(list);

    fragment.appendChild(body);
    return fragment;
  }

  function createImageSlot(label, onFileSelected) {
    const slot = createElement('div', { className: 'image-slot' }, [
      createElement('div', { className: 'image-icon', textContent: '📷' }),
      createElement('div', { className: 'image-text', textContent: label })
    ]);

    const input = createElement('input', {
      type: 'file', accept: IMAGES.allowedTypes.join(','), style: { display: 'none' }
    });

    // Prefer camera on mobile
    input.setAttribute('capture', 'environment');

    slot.addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        validateFile(file);
      } catch (e) {
        alert(e.message);
        input.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        slot.classList.add('has-image');
        slot.innerHTML = '';
        const img = createElement('img', { className: 'image-preview', src: reader.result });
        const remove = createElement('button', { className: 'image-remove', type: 'button', textContent: '×' });
        
        // Add badge
        const badge = createElement('span', { className: 'image-badge', textContent: '✓' });
        
        remove.addEventListener('click', (ev) => {
          ev.stopPropagation();
          input.value = '';
          slot.classList.remove('has-image');
          slot.innerHTML = '';
          slot.appendChild(createElement('div', { className: 'image-icon', textContent: '📷' }));
          slot.appendChild(createElement('div', { className: 'image-text', textContent: label }));
          onFileSelected(null);
        });
        
        slot.appendChild(img);
        slot.appendChild(remove);
        slot.appendChild(badge);
        onFileSelected(file);
      };
      reader.readAsDataURL(file);
    });

    return { slot, input };
  }

  function createForm(baseUnit) {
    const form = createElement('form', { className: 'selling-unit-form' });

    const nameGroup = createElement('div', { className: 'form-group' }, [
      createElement('label', { className: 'form-label required', innerHTML: '📛 Selling Unit Name <span style="color:#6b7280; font-size:12px;">Jina la Kipimo</span>' }),
      createElement('input', { className: 'form-input', type: 'text', placeholder: 'e.g., Piece, Packet, Box / mfano: Kipande, Pakiti, Boksi', required: true }),
      createElement('small', { className: 'help-text', innerHTML: 'What customers will see / Jina ambalo wateja wataona' })
    ]);
    
    const conversionGroup = createElement('div', { className: 'form-group' }, [
      createElement('label', { className: 'form-label required', innerHTML: '🔢 Conversion Factor <span style="color:#6b7280; font-size:12px;">Kipimo cha Ubadilishaji</span>' }),
      createElement('input', { className: 'form-input', type: 'number', min: '1', step: '1', placeholder: `e.g., 12 for 12 in a ${baseUnit} / mfano: 12 kwa 12 kwenye ${baseUnit}`, required: true }),
      createElement('small', { className: 'help-text', innerHTML: `How many of this unit in 1 ${baseUnit}? / Kuna vipimo vingapi kwenye ${baseUnit} 1?` })
    ]);

    // Images section (2 required)
    const imageSection = createElement('div', { className: 'image-upload-section' }, [
      createElement('div', { className: 'form-label required', innerHTML: '🖼️ Unit Images (2 required) <span style="color:#6b7280; font-size:12px;">Picha za Kipimo (2 zinahitajika)</span>' }),
      createElement('small', { className: 'help-text', innerHTML: `Max ${bytesToMB(IMAGES.maxSize)}MB • Formats: jpg, png, webp / Ukubwa: ${bytesToMB(IMAGES.maxSize)}MB • Aina: jpg, png, webp` }),
      createElement('div', { className: 'image-grid' })
    ]);
    const grid = imageSection.querySelector('.image-grid');

    const selectedFiles = [null, null];

    const s1 = createImageSlot('Image 1 / Picha 1', (f) => { selectedFiles[0] = f; });
    const s2 = createImageSlot('Image 2 / Picha 2', (f) => { selectedFiles[1] = f; });
    grid.appendChild(s1.slot);
    grid.appendChild(s2.slot);
    grid.appendChild(s1.input);
    grid.appendChild(s2.input);

    const addButton = createElement('button', { className: 'add-btn', type: 'submit', textContent: '➕ Add Selling Unit / Ongeza Kipimo' });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const ctx = resolveItemContext();
      if (!ctx) { alert("Missing item context / Hakuna maelezo ya bidhaa"); return; }

      const nameInput = nameGroup.querySelector('input');
      const convInput = conversionGroup.querySelector('input');

      const unitName = nameInput.value.trim();
      const conversionFactor = parseFloat(convInput.value);

      if (!unitName) { nameInput.focus(); return; }
      if (!conversionFactor || conversionFactor <= 0 || !isFinite(conversionFactor)) { convInput.focus(); return; }

      // Validate two images
      if (!selectedFiles[0] || !selectedFiles[1]) {
        alert(`Please add ${IMAGES.requiredCount} images / Tafadhali ongeza picha ${IMAGES.requiredCount}`);
        return;
      }

      try {
        addButton.disabled = true;
        addButton.textContent = '💾 Saving... / Inahifadhi...';

        const created = await createSellingUnit(ctx, {
          name: unitName,
          conversionFactor,
          files: selectedFiles
        });

        const arr = state.sellingUnits.get(ctx.itemId) || [];
        arr.push(created);
        state.sellingUnits.set(ctx.itemId, arr);
        refreshModal();

        // Reset form with animation
        nameInput.value = '';
        convInput.value = '';
        
        // Reset image slots with animation
        [s1, s2].forEach((s, idx) => {
          s.input.value = '';
          selectedFiles[idx] = null;
          const slot = s.slot;
          slot.classList.remove('has-image');
          slot.innerHTML = '';
          slot.appendChild(createElement('div', { className: 'image-icon', textContent: '📷' }));
          slot.appendChild(createElement('div', { className: 'image-text', textContent: `Image ${idx + 1} / Picha ${idx + 1}` }));
        });

        // Show success message
        const successMsg = createElement('div', { 
          className: 'bg-green-100 text-green-700 p-3 rounded-lg text-center mb-4',
          textContent: '✅ Selling unit added successfully / Kipimo kimeongezwa kikamilifu'
        });
        form.parentNode.insertBefore(successMsg, form.nextSibling);
        setTimeout(() => successMsg.remove(), 3000);

        nameInput.focus();
      } catch (err) {
        console.error("SellingUnits: failed to save", err);
        alert("Failed to save selling unit / Imeshindwa kuhifadhi kipimo");
      } finally {
        addButton.disabled = false;
        addButton.textContent = '➕ Add Selling Unit / Ongeza Kipimo';
      }
    });

    form.appendChild(nameGroup);
    form.appendChild(conversionGroup);
    form.appendChild(imageSection);
    form.appendChild(addButton);
    return form;
  }

  function createUnitsList(sellingUnits, baseUnit) {
    const container = createElement('div', { className: 'units-list' });
    container.appendChild(createElement('h3', { className: 'list-title', innerHTML: 'Selling Units <span style="font-size:14px; color:#6b7280; margin-left:8px;">Vipimo vya Kuuza</span>' }));

    if (!sellingUnits || sellingUnits.length === 0) {
      container.appendChild(createElement('p', { className: 'empty-state', innerHTML: '📭 No selling units added yet / Hakuna vipimo vya kuuza bado' }));
      return container;
    }

    sellingUnits.forEach((unit, index) => {
      const img = Array.isArray(unit.images) && unit.images[0] ? unit.images[0] : null;
      const thumbSrc = (img && (img.thumb || img.url)) || '';

      const unitItem = createElement('div', { className: 'unit-item' }, [
        createElement('div', { className: 'unit-info' }, [
          thumbSrc ? 
            createElement('img', { className: 'unit-thumb', src: thumbSrc, alt: unit.name }) : 
            createElement('div', { className: 'unit-thumb', style: { background: '#eef2ff', display:'flex', alignItems:'center', justifyContent:'center', color:'#6366f1', fontSize:'16px' } }, ['📷']),
          createElement('div', {}, [
            createElement('h4', { className: 'unit-name', textContent: unit.name }),
            createElement('p', {
              className: 'unit-conversion',
              innerHTML: `1 ${unit.name} = ${unit.conversionFactor ?? unit.conversion} ${baseUnit}`
            })
          ])
        ]),
        createElement('button', { className: 'unit-remove', 'data-index': String(index), title: 'Remove / Ondoa' }, ['×'])
      ]);

      unitItem.querySelector('.unit-remove').addEventListener('click', () => removeSellingUnit(index));
      container.appendChild(unitItem);
    });

    return container;
  }

  // ========= Data ops for list =========
  async function removeSellingUnit(index) {
    const ctx = resolveItemContext();
    if (!ctx) return;

    const arr = state.sellingUnits.get(ctx.itemId) || [];
    const unit = arr[index];
    if (!unit) return;

    if (!confirm(`Remove selling unit "${unit.name}"? / Ondoa kipimo "${unit.name}"?`)) return;

    try {
      if (unit.id) await deleteSellingUnitDoc(ctx, unit.id);
      arr.splice(index, 1);
      state.sellingUnits.set(ctx.itemId, arr);
      refreshModal();
      
      // Show success message
      const successMsg = createElement('div', { 
        className: 'bg-green-100 text-green-700 p-3 rounded-lg text-center mb-4',
        textContent: '✅ Selling unit removed / Kipimo kimeondolewa'
      });
      const modalBody = elements.modal?.querySelector('.modal-body');
      if (modalBody) {
        modalBody.insertBefore(successMsg, modalBody.firstChild);
        setTimeout(() => successMsg.remove(), 2000);
      }
    } catch (err) {
      console.error("SellingUnits: failed to delete", err);
      alert("Failed to delete selling unit / Imeshindwa kuondoa kipimo");
    }
  }

  function refreshModal() {
    if (!state.isModalOpen || !state.currentItemId) return;
    clearElement(elements.modal);
    const itemName = getItemName();
    const baseUnit = getBaseUnit();
    const currentUnits = state.sellingUnits.get(state.currentItemId) || [];
    elements.modal.appendChild(buildModalContent(itemName, baseUnit, currentUnits));
  }

  // ========= Observers / Init =========
  function setupObservers() {
    document.addEventListener("item-detail:opened", () => {
      const existing = document.querySelector(CONFIG.selectors.itemDetail);
      if (existing) injectButton(existing);
    });

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          const itemDetail = node.matches?.(CONFIG.selectors.itemDetail)
            ? node : node.querySelector?.(CONFIG.selectors.itemDetail);
          if (itemDetail) injectButton(itemDetail);
        }
      }
      const existing = document.querySelector(CONFIG.selectors.itemDetail);
      if (existing && !existing.querySelector(`#${CONFIG.button.id}`)) injectButton(existing);
    });

    observer.observe(document.body, { childList: true, subtree: true });
    state.observers.push(observer);
  }

  function cleanup() {
    state.observers.forEach(o => o.disconnect());
    state.observers = [];
    if (elements.button) {
      const clone = elements.button.cloneNode(true);
      elements.button.parentNode?.replaceChild(clone, elements.button);
      elements.button = null;
    }
    closeModal();
    const styles = document.getElementById('selling-units-styles');
    if (styles) styles.parentNode?.removeChild(styles);
  }

  function init() {
    try {
      cleanup();
      injectStyles();

      const existing = document.querySelector(CONFIG.selectors.itemDetail);
      if (existing) injectButton(existing);

      setupObservers();
      console.log('Selling Units manager initialized (Firestore + Cloudinary, 2 required images)');
    } catch (err) {
      console.error('Failed to initialize Selling Units manager:', err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.sellingUnitsCleanup = cleanup;

})();