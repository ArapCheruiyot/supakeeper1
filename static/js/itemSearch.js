// itemSearch.js - Dynamic search for categories and items
console.log("🔍 Item Search module loading...");

(function() {
    // Only initialize when overlay is shown
    let searchInitialized = false;
    let allItems = []; // Store all items for searching
    
    // Styles for search (injected once)
    const searchStyles = `
        <style id="item-search-styles">
            .search-container {
                padding: 12px 16px;
                background: white;
                border-bottom: 1px solid #e5e7eb;
                position: sticky;
                top: 0;
                z-index: 100;
                box-shadow: 0 2px 8px rgba(0,0,0,0.05);
            }
            
            .search-box {
                display: flex;
                align-items: center;
                background: #f3f4f6;
                border-radius: 12px;
                padding: 8px 16px;
                transition: all 0.2s;
                border: 2px solid transparent;
            }
            
            .search-box:focus-within {
                background: white;
                border-color: #22c55e;
                box-shadow: 0 4px 12px rgba(34,197,94,0.2);
            }
            
            .search-icon {
                color: #9ca3af;
                margin-right: 10px;
                font-size: 18px;
            }
            
            .search-input {
                flex: 1;
                border: none;
                background: transparent;
                font-size: 15px;
                padding: 6px 0;
                outline: none;
                font-family: inherit;
            }
            
            .search-input::placeholder {
                color: #9ca3af;
                font-style: italic;
            }
            
            .clear-search {
                color: #9ca3af;
                cursor: pointer;
                padding: 4px 8px;
                font-size: 18px;
                border-radius: 20px;
                transition: all 0.2s;
                display: none;
            }
            
            .clear-search:hover {
                background: #e5e7eb;
                color: #4b5563;
            }
            
            .search-stats {
                font-size: 12px;
                color: #6b7280;
                margin-top: 8px;
                padding-left: 8px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            
            .match-count {
                font-weight: 500;
                color: #22c55e;
            }
            
            .no-results {
                padding: 40px 20px;
                text-align: center;
                color: #9ca3af;
            }
            
            .no-results .icon {
                font-size: 48px;
                margin-bottom: 16px;
                opacity: 0.5;
            }
            
            .no-results .suggestion {
                font-size: 14px;
                margin-top: 12px;
                color: #6b7280;
                background: #f3f4f6;
                padding: 12px;
                border-radius: 10px;
            }
            
            /* Search match highlighting */
            .item.search-match {
                background: #f0fdf4;
                border-radius: 6px;
                margin: 2px 0;
                border-left: 3px solid #22c55e;
                padding-left: 8px;
            }
            
            .category-item.has-matches > .category-content .category-name {
                font-weight: 600;
                color: #22c55e;
            }
            
            /* Bilingual hint */
            .search-hint {
                font-size: 11px;
                color: #9ca3af;
            }
            
            .search-hint i {
                font-style: italic;
                margin-left: 4px;
            }
            
            /* Animation */
            @keyframes searchPulse {
                0% { box-shadow: 0 0 0 0 rgba(34,197,94,0.4); }
                70% { box-shadow: 0 0 0 6px rgba(34,197,94,0); }
                100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); }
            }
            
            .search-box.searching {
                animation: searchPulse 1.5s infinite;
            }
        </style>
    `;
    
    // Inject styles once
    if (!document.getElementById('item-search-styles')) {
        document.head.insertAdjacentHTML('beforeend', searchStyles);
    }
    
    // Function to collect all items from the DOM
    function collectAllItems() {
        const items = [];
        const categoriesList = document.getElementById('categories-list');
        if (!categoriesList) return items;
        
        // Find all item elements
        const itemElements = categoriesList.querySelectorAll('.item');
        itemElements.forEach((item, index) => {
            const itemText = item.querySelector('.item-text')?.textContent || '';
            items.push({
                element: item,
                text: itemText,
                id: `item-${index}`
            });
        });
        
        console.log(`🔍 Collected ${items.length} items for searching`);
        return items;
    }
    
    // Function to highlight matching items
    function highlightMatches(searchTerm) {
        if (!searchTerm) {
            // Remove all highlights and show everything
            document.querySelectorAll('.item.search-match').forEach(el => {
                el.classList.remove('search-match');
            });
            document.querySelectorAll('.category-item.has-matches').forEach(el => {
                el.classList.remove('has-matches');
            });
            
            // Show all categories and items
            document.querySelectorAll('.category-item, .item').forEach(el => {
                el.style.display = '';
            });
            
            // Expand all categories
            document.querySelectorAll('.children').forEach(el => {
                el.classList.add('visible');
            });
            document.querySelectorAll('.expand-icon').forEach(icon => {
                icon.innerHTML = '▼';
            });
            
            return 0;
        }
        
        const termLower = searchTerm.toLowerCase();
        let matchCount = 0;
        
        // First, hide everything
        document.querySelectorAll('.category-item, .item').forEach(el => {
            el.style.display = 'none';
        });
        
        // Find matching items
        document.querySelectorAll('.item').forEach(item => {
            const itemText = item.querySelector('.item-text')?.textContent || '';
            if (itemText.toLowerCase().includes(termLower)) {
                matchCount++;
                
                // Show this item
                item.style.display = '';
                item.classList.add('search-match');
                
                // Show and highlight all parent categories
                let parent = item.parentElement;
                while (parent) {
                    if (parent.classList && parent.classList.contains('children')) {
                        parent.style.display = '';
                        parent.classList.add('visible');
                        
                        // Find and show the parent category
                        const parentCategory = parent.closest('.category-item');
                        if (parentCategory) {
                            parentCategory.style.display = '';
                            parentCategory.classList.add('has-matches');
                            
                            // Expand this category
                            const childrenDiv = parentCategory.querySelector('.children');
                            if (childrenDiv) {
                                childrenDiv.style.display = '';
                                childrenDiv.classList.add('visible');
                            }
                            
                            // Update expand icon
                            const expandIcon = parentCategory.querySelector('.expand-icon');
                            if (expandIcon) expandIcon.innerHTML = '▼';
                        }
                    }
                    parent = parent.parentElement;
                }
            }
        });
        
        // Also check category names
        document.querySelectorAll('.category-item').forEach(category => {
            const categoryName = category.querySelector('.category-name')?.textContent || '';
            if (categoryName.toLowerCase().includes(termLower)) {
                category.style.display = '';
                category.classList.add('has-matches');
                
                // Expand this category
                const childrenDiv = category.querySelector('.children');
                if (childrenDiv) {
                    childrenDiv.style.display = '';
                    childrenDiv.classList.add('visible');
                }
                const expandIcon = category.querySelector('.expand-icon');
                if (expandIcon) expandIcon.innerHTML = '▼';
            }
        });
        
        return matchCount;
    }
    
    // Create search UI
    function createSearchUI(categoriesBtn, categoriesList) {
        // Check if search already exists
        if (document.getElementById('item-search-container')) return;
        
        const searchContainer = document.createElement('div');
        searchContainer.id = 'item-search-container';
        searchContainer.className = 'search-container';
        searchContainer.innerHTML = `
            <div class="search-box">
                <span class="search-icon">🔍</span>
                <input type="text" 
                       class="search-input" 
                       placeholder="Search items or categories... / Tafuta bidhaa au aina..."
                       id="item-search-input"
                       autocomplete="off">
                <span class="clear-search" id="clear-search">✕</span>
            </div>
            <div class="search-stats" id="search-stats">
                <span class="match-count" id="match-count"></span>
                <span class="search-hint">
                    <i>Type to search / Andika kutafuta</i>
                </span>
            </div>
        `;
        
        // Insert after categories button
        categoriesBtn.parentNode.insertBefore(searchContainer, categoriesBtn.nextSibling);
        
        // Get elements
        const searchInput = document.getElementById('item-search-input');
        const clearBtn = document.getElementById('clear-search');
        const matchCount = document.getElementById('match-count');
        
        // Perform search
        function performSearch() {
            const searchTerm = searchInput.value.trim();
            
            if (!searchTerm) {
                // Clear search
                clearBtn.style.display = 'none';
                matchCount.textContent = '';
                
                // Restore everything
                document.querySelectorAll('.item.search-match').forEach(el => {
                    el.classList.remove('search-match');
                });
                document.querySelectorAll('.category-item.has-matches').forEach(el => {
                    el.classList.remove('has-matches');
                });
                
                // Show everything
                document.querySelectorAll('.category-item, .item').forEach(el => {
                    el.style.display = '';
                });
                
                // Expand all categories
                document.querySelectorAll('.children').forEach(el => {
                    el.classList.add('visible');
                });
                document.querySelectorAll('.expand-icon').forEach(icon => {
                    icon.innerHTML = '▼';
                });
                
                return;
            }
            
            // Show clear button
            clearBtn.style.display = 'inline-block';
            
            // Perform search
            const matchCount_num = highlightMatches(searchTerm);
            
            // Update match count
            if (matchCount_num === 0) {
                matchCount.textContent = `No matches / Hakuna`;
                
                // Show a temporary message in the categories list if empty
                const hasVisibleItems = document.querySelectorAll('.item[style="display: "]').length > 0;
                if (!hasVisibleItems) {
                    // Keep the categories list as is - items are hidden but structure remains
                    console.log("No matches found");
                }
            } else {
                matchCount.textContent = `Found ${matchCount_num} match${matchCount_num !== 1 ? 'es' : ''} / ${matchCount_num} inapatikana`;
            }
        }
        
        // Event listeners
        searchInput.addEventListener('input', performSearch);
        
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                searchInput.value = '';
                performSearch();
            }
        });
        
        clearBtn.addEventListener('click', () => {
            searchInput.value = '';
            performSearch();
            searchInput.focus();
        });
        
        // Add search box animation on focus
        searchInput.addEventListener('focus', () => {
            document.querySelector('.search-box')?.classList.add('searching');
        });
        
        searchInput.addEventListener('blur', () => {
            document.querySelector('.search-box')?.classList.remove('searching');
        });
        
        console.log("🔍 Search UI created");
    }
    
    // Initialize search
    function initSearch() {
        const overlay = document.getElementById('overlay');
        const categoriesBtn = document.getElementById('categories-btn');
        const categoriesList = document.getElementById('categories-list');
        
        if (!overlay || !categoriesBtn || !categoriesList) {
            console.log("🔍 Search: Waiting for DOM elements...");
            return;
        }
        
        // Watch for overlay to open
        const openOverlayObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.target.classList && 
                    !mutation.target.classList.contains('hidden') && 
                    mutation.target.id === 'overlay') {
                    
                    console.log("🔍 Overlay opened, initializing search...");
                    
                    // Small delay to let categories load
                    setTimeout(() => {
                        if (!searchInitialized) {
                            // Collect all items for search
                            allItems = collectAllItems();
                            createSearchUI(categoriesBtn, categoriesList);
                            searchInitialized = true;
                        }
                    }, 500);
                }
                
                // When overlay closes, reset search
                if (mutation.target.classList && 
                    mutation.target.classList.contains('hidden') && 
                    mutation.target.id === 'overlay') {
                    
                    const searchInput = document.getElementById('item-search-input');
                    if (searchInput) {
                        searchInput.value = '';
                        
                        // Restore everything
                        document.querySelectorAll('.category-item, .item').forEach(el => {
                            el.style.display = '';
                        });
                        
                        // Expand all categories
                        document.querySelectorAll('.children').forEach(el => {
                            el.classList.add('visible');
                        });
                        document.querySelectorAll('.expand-icon').forEach(icon => {
                            icon.innerHTML = '▼';
                        });
                    }
                }
            });
        });
        
        openOverlayObserver.observe(overlay, { attributes: true, attributeFilter: ['class'] });
        
        // Also initialize when manage stock button is clicked
        const manageStockBtn = document.getElementById('manage-stock-btn');
        if (manageStockBtn) {
            manageStockBtn.addEventListener('click', () => {
                setTimeout(() => {
                    if (!searchInitialized) {
                        allItems = collectAllItems();
                        createSearchUI(categoriesBtn, categoriesList);
                        searchInitialized = true;
                    }
                }, 500);
            });
        }
    }
    
    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSearch);
    } else {
        initSearch();
    }
    
    // Also try again after a delay
    setTimeout(initSearch, 1000);
    setTimeout(initSearch, 3000);
    
    console.log("🔍 Item Search module ready");
})();