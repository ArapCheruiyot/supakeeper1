// salesEmptyState.js - Lightweight product list add-on for sales overlay
console.log("🧠 Sales Empty State module loading (add-on mode)...");

(function() {
    // Cache for products
    let cachedProducts = null;
    let listVisible = false;
    let addonInitialized = false;
    let isLoading = false;

    // Styles (minimal, only for product list)
    const styles = `
        <style id="sales-addon-styles">
            #product-list-addon {
                padding: 16px;
                background: white;
                border-radius: 12px;
                margin: 16px 24px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.05);
                display: none;
                border: 1px solid #e2e8f0;
            }
            .product-list-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 12px;
                font-weight: 600;
            }
            .product-list-grid {
                display: grid;
                gap: 8px;
                max-height: 50vh;
                overflow-y: auto;
            }
            .product-list-item {
                background: #f8fafc;
                border: 1px solid #e2e8f0;
                border-radius: 8px;
                padding: 12px;
                cursor: pointer;
                transition: all 0.2s;
            }
            .product-list-item:hover {
                border-color: #22c55e;
                background: #f0fdf4;
            }
            .product-list-item .name {
                font-weight: 600;
            }
            .product-list-item .details {
                font-size: 13px;
                color: #64748b;
                margin-top: 4px;
            }
            .view-products-btn {
                background: rgba(34,197,94,0.1);
                border: 1px solid rgba(34,197,94,0.3);
                color: #22c55e;
                padding: 8px 16px;
                border-radius: 30px;
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                gap: 6px;
                margin: 8px 0 4px 0;
                white-space: nowrap;
                transition: all 0.2s;
            }
            .view-products-btn:hover {
                background: rgba(34,197,94,0.2);
            }
            .view-products-btn.loading {
                opacity: 0.7;
                cursor: wait;
                pointer-events: none;
            }
            .loading-spinner-small {
                display: inline-block;
                width: 16px;
                height: 16px;
                border: 2px solid #e2e8f0;
                border-top-color: #22c55e;
                border-radius: 50%;
                animation: spin 0.8s linear infinite;
                margin-right: 8px;
            }
            @keyframes spin {
                to { transform: rotate(360deg); }
            }
            .product-list-loading {
                text-align: center;
                padding: 30px;
                color: #64748b;
            }
            .button-row {
                display: flex;
                justify-content: flex-end;
                width: 100%;
            }
        </style>
    `;

    // Inject styles once
    if (!document.getElementById('sales-addon-styles')) {
        document.head.insertAdjacentHTML('beforeend', styles);
    }

    // Function to fetch products (cached)
    async function fetchProducts() {
        if (cachedProducts) return cachedProducts;
        try {
            const shopId = localStorage.getItem('activeShopId');
            if (!shopId) return [];
            const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js");
            const { db } = await import("./firebase-config.js");
            const products = [];
            const categoriesSnap = await getDocs(collection(db, "Shops", shopId, "categories"));
            for (const catDoc of categoriesSnap.docs) {
                const catName = catDoc.data().name;
                const itemsSnap = await getDocs(collection(db, "Shops", shopId, "categories", catDoc.id, "items"));
                itemsSnap.forEach(doc => {
                    const data = doc.data();
                    products.push({
                        name: data.name,
                        price: data.sellPrice || 0,
                        stock: data.stock || 0,
                        category: catName
                    });
                });
            }
            cachedProducts = products;
            return products;
        } catch (e) {
            console.error("Error fetching products:", e);
            return [];
        }
    }

    // Function to render product list into container
    async function renderProductList(container) {
        // Show loading state
        container.innerHTML = `<div class="product-list-loading"><div class="loading-spinner-small" style="margin:0 auto 10px;"></div><p>Loading products...</p><p style="font-size:12px;">Inapakia bidhaa...</p></div>`;
        
        const products = await fetchProducts();
        
        let html = `
            <div class="product-list-header">
                <span>📋 All Products (${products.length})</span>
                <span style="font-size:12px; color:#64748b;">Click to copy name</span>
            </div>
            <div class="product-list-grid" id="product-grid">
        `;
        products.forEach(p => {
            html += `
                <div class="product-list-item" data-name="${p.name.toLowerCase()}">
                    <div class="name">${p.name}</div>
                    <div class="details">KSh ${p.price} | Stock: ${p.stock} | 📁 ${p.category}</div>
                </div>
            `;
        });
        html += `</div>`;
        container.innerHTML = html;

        // Add click-to-copy
        container.querySelectorAll('.product-list-item').forEach(el => {
            el.addEventListener('click', () => {
                const name = el.querySelector('.name').textContent;
                navigator.clipboard.writeText(name).then(() => {
                    const toast = document.createElement('div');
                    toast.style.cssText = 'position:fixed; bottom:30px; left:50%; transform:translateX(-50%); background:#1e293b; color:white; padding:12px 24px; border-radius:50px; z-index:10000; animation:slideUp 0.3s;';
                    toast.textContent = `✓ Copied: ${name}`;
                    document.body.appendChild(toast);
                    setTimeout(() => toast.remove(), 2000);
                }).catch(() => alert(`Copy: ${name}`));
            });
        });

        // Add filter input (optional)
        const filterInput = document.createElement('input');
        filterInput.type = 'text';
        filterInput.placeholder = '🔍 Filter products...';
        filterInput.style.cssText = 'width:100%; padding:8px; margin-bottom:12px; border:2px solid #e2e8f0; border-radius:8px; box-sizing:border-box;';
        container.insertBefore(filterInput, container.firstChild);
        filterInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            container.querySelectorAll('.product-list-item').forEach(el => {
                const name = el.dataset.name || '';
                el.style.display = name.includes(term) ? '' : 'none';
            });
        });
    }

    // Function to add the product list container and button
    function setupAddon() {
        if (addonInitialized) return;
        
        const overlay = document.getElementById('sales-overlay');
        if (!overlay) return;

        // Check if container already exists
        if (document.getElementById('product-list-addon')) return;

        // Create container for product list (outside sales-results)
        const productContainer = document.createElement('div');
        productContainer.id = 'product-list-addon';
        productContainer.className = 'product-list-container';
        
        // Insert it AFTER the header but BEFORE sales-results
        const header = overlay.querySelector('div:first-child');
        if (header) {
            header.insertAdjacentElement('afterend', productContainer);
        } else {
            overlay.appendChild(productContainer);
        }

        const header = document.querySelector('#sales-overlay > div:first-child');
        if (!header) return;

        // Try to find the batch legend container by its distinct border-top style
        const legendContainer = header.querySelector('div[style*="border-top: 1px solid rgba(255,255,255,0.1)"]');
        
        let insertLocation;
        if (legendContainer) {
            // Insert after the legend container (on a new line)
            insertLocation = legendContainer.parentElement; // Usually the same as header's inner div
        } else {
            // Fallback: just use the header itself
            insertLocation = header;
        }

        // Create button
        const btn = document.createElement('button');
        btn.id = 'view-products-btn';
        btn.className = 'view-products-btn';
        btn.innerHTML = '<span>📋</span> View Products';

        // Insert button at the end of insertLocation
        const buttonWrapper = document.createElement('div');
        buttonWrapper.style.display = 'flex';
        buttonWrapper.style.justifyContent = 'flex-end';
        buttonWrapper.style.width = '100%';
        buttonWrapper.appendChild(btn);
        insertLocation.appendChild(buttonWrapper);

        btn.addEventListener('click', async () => {
            if (isLoading) return;

            const productContainer = document.getElementById('product-list-addon');
            if (!productContainer) return;

            if (productContainer.style.display === 'none' || productContainer.style.display === '') {
                if (cachedProducts) {
                    await renderProductList(productContainer);
                    productContainer.style.display = 'block';
                    btn.innerHTML = '<span>📋</span> Hide Products';
                    listVisible = true;
                } else {
                    isLoading = true;
                    btn.classList.add('loading');
                    btn.innerHTML = '<span class="loading-spinner-small" style="margin:0;"></span> Loading...';
                    
                    productContainer.innerHTML = '<div class="product-list-loading"><div class="loading-spinner-small" style="margin:0 auto 10px;"></div><p>Loading products...</p><p style="font-size:12px;">Inapakia bidhaa...</p></div>';
                    productContainer.style.display = 'block';
                    
                    await renderProductList(productContainer);
                    
                    btn.classList.remove('loading');
                    btn.innerHTML = '<span>📋</span> Hide Products';
                    isLoading = false;
                    listVisible = true;
                }
            } else {
                productContainer.style.display = 'none';
                btn.innerHTML = '<span>📋</span> View Products';
                listVisible = false;
            }
        });

        const searchInput = document.getElementById('sales-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                if (listVisible) {
                    const productContainer = document.getElementById('product-list-addon');
                    const btn = document.getElementById('view-products-btn');
                    if (productContainer) productContainer.style.display = 'none';
                    if (btn) btn.innerHTML = '<span>📋</span> View Products';
                    listVisible = false;
                }
            });
        }

        addonInitialized = true;
    }

    function init() {
        const observer = new MutationObserver(() => {
            const overlay = document.getElementById('sales-overlay');
            if (overlay && overlay.style.display === 'flex') {
                setTimeout(setupAddon, 500);
            }
        });
        observer.observe(document.body, { childList: true, subtree: true, attributes: true });

        document.addEventListener('click', (e) => {
            if (e.target.id === 'sell-btn' || e.target.closest('#sell-btn')) {
                setTimeout(setupAddon, 600);
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    console.log("🧠 Sales Empty State add-on ready");
})();
