// salesEmptyState.js - Optimized product list with pagination
console.log("🧠 Sales Empty State module loading (optimized mode)...");

(function() {
    // Cache and state
    let allProducts = [];
    let displayedProducts = [];
    let listVisible = false;
    let addonInitialized = false;
    let isLoading = false;
    let isLoadingMore = false;
    let hasMore = true;
    let lastCategoryIndex = 0;
    let lastItemIndex = 0;
    let currentFilter = '';
    let categoriesCache = [];
    
    const PAGE_SIZE = 20; // Load 20 items at a time

    // Styles
    const styles = `
        <style id="sales-addon-styles">
            .product-list-container {
                padding: 16px;
                background: white;
                border-radius: 12px;
                margin: 16px 24px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.05);
                display: none;
                border: 1px solid #e2e8f0;
                max-height: 60vh;
                overflow-y: auto;
            }
            .product-list-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 8px 0;
                font-weight: 600;
                border-bottom: 1px solid #e2e8f0;
                margin-bottom: 12px;
            }
            .product-list-grid {
                display: grid;
                gap: 8px;
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
                min-width: 140px;
                justify-content: center;
            }
            .view-products-btn:hover {
                background: rgba(34,197,94,0.2);
            }
            .view-products-btn.loading {
                opacity: 0.7;
                cursor: wait;
                pointer-events: none;
                background: rgba(34,197,94,0.05);
            }
            .view-products-btn .btn-text {
                display: inline-flex;
                align-items: center;
                gap: 6px;
            }
            .loading-spinner-small {
                display: inline-block;
                width: 16px;
                height: 16px;
                border: 2px solid #e2e8f0;
                border-top-color: #22c55e;
                border-radius: 50%;
                animation: spin 0.8s linear infinite;
            }
            @keyframes spin {
                to { transform: rotate(360deg); }
            }
            .product-list-loading {
                text-align: center;
                padding: 30px;
                color: #64748b;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 10px;
            }
            .load-more-btn {
                width: 100%;
                padding: 10px;
                margin-top: 12px;
                background: #f1f5f9;
                border: 1px dashed #94a3b8;
                border-radius: 8px;
                color: #475569;
                font-size: 13px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
            }
            .load-more-btn:hover {
                background: #e2e8f0;
                border-color: #64748b;
            }
            .load-more-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
            .filter-input {
                width: 100%;
                padding: 8px;
                margin-bottom: 12px;
                border: 2px solid #e2e8f0;
                border-radius: 8px;
                box-sizing: border-box;
            }
            .product-count {
                font-size: 12px;
                color: #64748b;
                font-weight: normal;
            }
            .loading-message {
                color: #64748b;
                font-size: 14px;
                margin-top: 8px;
            }
        </style>
    `;

    // Inject styles once
    if (!document.getElementById('sales-addon-styles')) {
        document.head.insertAdjacentHTML('beforeend', styles);
    }

    // Function to fetch all categories first
    async function fetchCategories() {
        try {
            const shopId = localStorage.getItem('activeShopId');
            if (!shopId) return [];
            
            const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js");
            const { db } = await import("./firebase-config.js");
            
            const categoriesSnap = await getDocs(collection(db, "Shops", shopId, "categories"));
            const categories = [];
            
            for (const catDoc of categoriesSnap.docs) {
                categories.push({
                    id: catDoc.id,
                    name: catDoc.data().name || 'Uncategorized',
                    ref: catDoc.ref
                });
            }
            
            return categories;
        } catch (e) {
            console.error("Error fetching categories:", e);
            return [];
        }
    }

    // Function to fetch products in batches from nested structure
    async function fetchProductsBatch() {
        try {
            const shopId = localStorage.getItem('activeShopId');
            if (!shopId) return [];
            
            const { collection, getDocs, query, limit, startAfter, orderBy } = await import("https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js");
            const { db } = await import("./firebase-config.js");
            
            // If we don't have categories yet, fetch them
            if (categoriesCache.length === 0) {
                categoriesCache = await fetchCategories();
                if (categoriesCache.length === 0) return [];
            }
            
            const newProducts = [];
            let itemsNeeded = PAGE_SIZE;
            
            // Loop through categories starting from lastCategoryIndex
            for (let c = lastCategoryIndex; c < categoriesCache.length && itemsNeeded > 0; c++) {
                const category = categoriesCache[c];
                const categoryName = category.name;
                
                // Get items from this category
                const itemsRef = collection(db, "Shops", shopId, "categories", category.id, "items");
                const itemsQuery = query(itemsRef, orderBy("name"), limit(itemsNeeded));
                const itemsSnap = await getDocs(itemsQuery);
                
                for (const itemDoc of itemsSnap.docs) {
                    const data = itemDoc.data();
                    newProducts.push({
                        name: data.name || 'Unnamed',
                        price: data.sellPrice || 0,
                        stock: data.stock || 0,
                        category: categoryName
                    });
                    itemsNeeded--;
                }
                
                // If we got all items from this category, move to next category
                lastCategoryIndex = c;
            }
            
            // Check if we have more items
            hasMore = newProducts.length === PAGE_SIZE;
            
            return newProducts;
            
        } catch (e) {
            console.error("Error fetching products:", e);
            return [];
        }
    }

    // Function to load initial batch
    async function loadInitialProducts() {
        if (allProducts.length === 0) {
            isLoading = true;
            const newProducts = await fetchProductsBatch();
            allProducts = newProducts;
            displayedProducts = [...newProducts];
            isLoading = false;
        }
        return allProducts;
    }

    // Function to load more products
    async function loadMoreProducts() {
        if (isLoadingMore || !hasMore) return;
        
        isLoadingMore = true;
        const newProducts = await fetchProductsBatch();
        
        if (newProducts.length > 0) {
            allProducts = [...allProducts, ...newProducts];
            
            // Apply current filter if any
            if (currentFilter) {
                const filtered = newProducts.filter(p => 
                    p.name.toLowerCase().includes(currentFilter)
                );
                displayedProducts = [...displayedProducts, ...filtered];
            } else {
                displayedProducts = [...displayedProducts, ...newProducts];
            }
        }
        
        isLoadingMore = false;
    }

    // Function to render product list
    async function renderProductList(container) {
        await loadInitialProducts();
        
        // Create filter input
        const filterInput = document.createElement('input');
        filterInput.type = 'text';
        filterInput.placeholder = '🔍 Filter products...';
        filterInput.className = 'filter-input';
        filterInput.value = currentFilter;
        
        // Create header
        const headerDiv = document.createElement('div');
        headerDiv.className = 'product-list-header';
        headerDiv.innerHTML = `
            <span>📋 Products <span class="product-count">(${displayedProducts.length} of ${allProducts.length})</span></span>
            <span style="font-size:12px; color:#64748b;">Click to copy name</span>
        `;
        
        // Create grid
        const grid = document.createElement('div');
        grid.className = 'product-list-grid';
        
        function renderItems() {
            grid.innerHTML = '';
            displayedProducts.forEach(p => {
                const item = document.createElement('div');
                item.className = 'product-list-item';
                item.dataset.name = p.name.toLowerCase();
                item.innerHTML = `
                    <div class="name">${p.name}</div>
                    <div class="details">KSh ${p.price} | Stock: ${p.stock} | 📁 ${p.category}</div>
                `;
                
                item.addEventListener('click', () => {
                    navigator.clipboard.writeText(p.name).then(() => {
                        const toast = document.createElement('div');
                        toast.style.cssText = 'position:fixed; bottom:30px; left:50%; transform:translateX(-50%); background:#1e293b; color:white; padding:12px 24px; border-radius:50px; z-index:10000; animation:slideUp 0.3s;';
                        toast.textContent = `✓ Copied: ${p.name}`;
                        document.body.appendChild(toast);
                        setTimeout(() => toast.remove(), 2000);
                    }).catch(() => alert(`Copy: ${p.name}`));
                });
                
                grid.appendChild(item);
            });
        }
        
        renderItems();
        
        // Filter functionality
        filterInput.addEventListener('input', (e) => {
            currentFilter = e.target.value.toLowerCase();
            
            if (currentFilter === '') {
                displayedProducts = [...allProducts];
            } else {
                displayedProducts = allProducts.filter(p => 
                    p.name.toLowerCase().includes(currentFilter)
                );
            }
            
            // Update header count
            headerDiv.innerHTML = `
                <span>📋 Products <span class="product-count">(${displayedProducts.length} of ${allProducts.length})</span></span>
                <span style="font-size:12px; color:#64748b;">Click to copy name</span>
            `;
            
            renderItems();
            
            // Show load more if filtered results are less than total
            if (currentFilter === '' && hasMore) {
                if (!document.getElementById('load-more-btn')) {
                    addLoadMoreButton(container);
                }
            } else {
                const loadMoreBtn = document.getElementById('load-more-btn');
                if (loadMoreBtn) loadMoreBtn.remove();
            }
        });
        
        // Assemble
        container.innerHTML = '';
        container.appendChild(filterInput);
        container.appendChild(headerDiv);
        container.appendChild(grid);
        
        // Add load more button if needed
        if (hasMore && currentFilter === '') {
            addLoadMoreButton(container);
        }
    }
    
    function addLoadMoreButton(container) {
        const loadMoreBtn = document.createElement('button');
        loadMoreBtn.id = 'load-more-btn';
        loadMoreBtn.className = 'load-more-btn';
        loadMoreBtn.innerHTML = isLoadingMore ? 
            '<span class="loading-spinner-small"></span> Loading...' : 
            '↓ Load More Products';
        
        loadMoreBtn.addEventListener('click', async () => {
            if (isLoadingMore || !hasMore) return;
            
            loadMoreBtn.innerHTML = '<span class="loading-spinner-small"></span> Loading...';
            loadMoreBtn.disabled = true;
            
            await loadMoreProducts();
            
            // Re-render with new products
            const headerDiv = container.querySelector('.product-list-header');
            const grid = container.querySelector('.product-list-grid');
            
            if (headerDiv) {
                headerDiv.innerHTML = `
                    <span>📋 Products <span class="product-count">(${displayedProducts.length} of ${allProducts.length})</span></span>
                    <span style="font-size:12px; color:#64748b;">Click to copy name</span>
                `;
            }
            
            // Add new items to grid
            if (grid) {
                const lastBatch = allProducts.slice(-PAGE_SIZE);
                lastBatch.forEach(p => {
                    const item = document.createElement('div');
                    item.className = 'product-list-item';
                    item.dataset.name = p.name.toLowerCase();
                    item.innerHTML = `
                        <div class="name">${p.name}</div>
                        <div class="details">KSh ${p.price} | Stock: ${p.stock} | 📁 ${p.category}</div>
                    `;
                    
                    item.addEventListener('click', () => {
                        navigator.clipboard.writeText(p.name).then(() => {
                            const toast = document.createElement('div');
                            toast.style.cssText = 'position:fixed; bottom:30px; left:50%; transform:translateX(-50%); background:#1e293b; color:white; padding:12px 24px; border-radius:50px; z-index:10000; animation:slideUp 0.3s;';
                            toast.textContent = `✓ Copied: ${p.name}`;
                            document.body.appendChild(toast);
                            setTimeout(() => toast.remove(), 2000);
                        }).catch(() => alert(`Copy: ${p.name}`));
                    });
                    
                    grid.appendChild(item);
                });
            }
            
            if (hasMore) {
                loadMoreBtn.innerHTML = '↓ Load More Products';
                loadMoreBtn.disabled = false;
            } else {
                loadMoreBtn.remove();
            }
        });
        
        container.appendChild(loadMoreBtn);
    }

    // Function to setup the addon
    function setupAddon() {
        if (addonInitialized) return;
        
        const overlay = document.getElementById('sales-overlay');
        if (!overlay) return;

        if (document.getElementById('product-list-addon')) return;

        // Create container
        const productContainer = document.createElement('div');
        productContainer.id = 'product-list-addon';
        productContainer.className = 'product-list-container';
        
        // Insert after header but before results
        const header = overlay.querySelector('div:first-child');
        const results = document.getElementById('sales-results');
        
        if (header && results) {
            overlay.insertBefore(productContainer, results);
        } else {
            overlay.appendChild(productContainer);
        }

        // Add button
        const headerDiv = overlay.querySelector('div:first-child');
        if (!headerDiv) return;

        const btn = document.createElement('button');
        btn.id = 'view-products-btn';
        btn.className = 'view-products-btn';
        
        // Set initial button state
        function setButtonLoading(loading) {
            if (loading) {
                btn.classList.add('loading');
                btn.innerHTML = '<span class="btn-text"><span class="loading-spinner-small"></span> Loading...</span>';
                btn.disabled = true;
            } else {
                btn.classList.remove('loading');
                btn.innerHTML = '<span class="btn-text"><span>📋</span> View Products</span>';
                btn.disabled = false;
            }
        }
        
        setButtonLoading(false);

        const buttonWrapper = document.createElement('div');
        buttonWrapper.style.display = 'flex';
        buttonWrapper.style.justifyContent = 'flex-end';
        buttonWrapper.style.width = '100%';
        buttonWrapper.appendChild(btn);
        headerDiv.appendChild(buttonWrapper);

        btn.addEventListener('click', async () => {
            if (isLoading) return;

            const container = document.getElementById('product-list-addon');
            if (!container) return;

            if (container.style.display === 'none' || container.style.display === '') {
                // Show loading state on button
                setButtonLoading(true);
                
                // Reset pagination when opening
                allProducts = [];
                displayedProducts = [];
                lastCategoryIndex = 0;
                hasMore = true;
                categoriesCache = [];
                
                container.style.display = 'block';
                
                // Show loading message in container
                container.innerHTML = `
                    <div class="product-list-loading">
                        <div class="loading-spinner-small" style="width:32px; height:32px;"></div>
                        <p>Loading your products...</p>
                        <p style="font-size:12px;">Inapakia bidhaa zako...</p>
                    </div>
                `;
                
                await renderProductList(container);
                
                // Remove loading state
                setButtonLoading(false);
                btn.innerHTML = '<span class="btn-text"><span>📋</span> Hide Products</span>';
                listVisible = true;
            } else {
                container.style.display = 'none';
                btn.innerHTML = '<span class="btn-text"><span>📋</span> View Products</span>';
                listVisible = false;
            }
        });

        // Hide on search
        const searchInput = document.getElementById('sales-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                if (listVisible) {
                    const container = document.getElementById('product-list-addon');
                    const btn = document.getElementById('view-products-btn');
                    if (container) container.style.display = 'none';
                    if (btn) {
                        btn.innerHTML = '<span class="btn-text"><span>📋</span> View Products</span>';
                    }
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

    console.log("🧠 Sales Empty State add-on ready (optimized for nested structure)");
})();