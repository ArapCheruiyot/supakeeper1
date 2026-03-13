#Isolation
import sys; print(f"PYTHON VERSION: {sys.version}"); print(f"PYTHON PATH: {sys.executable}")
from flask import Flask, render_template, request, jsonify
import os
import requests
import firebase_admin
#Isolation

from flask import Flask, render_template, request, jsonify
import os
import requests
import firebase_admin
from firebase_admin import credentials, firestore
import numpy as np
import time
import base64
import math
import random 
from datetime import datetime, timedelta
import uuid
import json
import ssl
import socket
import threading
from collections import defaultdict

# ======================================================
# APP INIT - THIS MUST COME FIRST!
# ======================================================
app = Flask(__name__)

import tracemalloc
tracemalloc.start()

# Optional: Add this endpoint to check memory
@app.route("/debug/memory")
def debug_memory():
    current, peak = tracemalloc.get_traced_memory()
    return jsonify({
        "current_mb": current / 10**6,
        "peak_mb": peak / 10**6
    })

# ======================================================
# SSL/TLS OPTIMIZATIONS - NOW AFTER app IS DEFINED
# ======================================================
# Patch SSL to be more resilient
ssl._create_default_https_context = ssl._create_unverified_context

# Increase socket timeout for mobile networks
socket.setdefaulttimeout(30)

# Force HTTP/1.1 for better compatibility
app.config['PREFERRED_URL_SCHEME'] = 'https'

# ======================================================
# FIREBASE CONFIG
# ======================================================
def get_firebase_client():
    if not firebase_admin._apps:
        firebase_key_base64 = os.environ.get("FIREBASE_KEY")
        if not firebase_key_base64:
            raise RuntimeError("FIREBASE_KEY environment variable not set")
        decoded_key = base64.b64decode(firebase_key_base64).decode("utf-8")
        cred = credentials.Certificate(json.loads(decoded_key))
        firebase_admin.initialize_app(cred)
    return firestore.client()

# Initialize later
db = None

# ======================================================
# LOAD MODEL - DISABLED (embeddings not needed)
# ======================================================
model = None
print("[INFO] Embeddings disabled - model not loaded")

# ======================================================
# SEARCH INDEX - NEW! Lightning fast in-memory search
# ======================================================
class SearchIndex:
    """High-performance search index for instant product lookup"""
    
    def __init__(self):
        self.word_index = defaultdict(list)  # word -> list of items
        self.prefix_index = defaultdict(set)  # prefix -> set of item keys
        self.items_by_id = {}  # item_key -> full item data
        self.last_built = None
        self.total_items = 0
        self.total_selling_units = 0
        
    def _generate_item_key(self, item, category, shop, is_selling_unit=False, sell_unit=None):
        """Generate unique key for item or selling unit"""
        if is_selling_unit and sell_unit:
            return f"su_{shop['shop_id']}_{item['item_id']}_{sell_unit['sell_unit_id']}"
        return f"item_{shop['shop_id']}_{item['item_id']}"
    
    def _add_to_index(self, text, score, item_key, item_data):
        """Add text to search index with score"""
        if not text:
            return
            
        words = text.lower().split()
        for word in words:
            # Add to word index with score
            self.word_index[word].append({
                "key": item_key,
                "score": score,
                "data": item_data
            })
            
            # Add prefixes for partial matching
            for i in range(1, len(word) + 1):
                prefix = word[:i]
                self.prefix_index[prefix].add(item_key)
    
    def build(self, shops_data):
        """Build search index from cache data"""
        start = time.time()
        print("\n🔨 BUILDING SEARCH INDEX...")
        
        # Clear existing index
        self.word_index.clear()
        self.prefix_index.clear()
        self.items_by_id.clear()
        
        item_count = 0
        su_count = 0
        
        for shop in shops_data:
            shop_id = shop["shop_id"]
            shop_name = shop["shop_name"]
            
            for category in shop.get("categories", []):
                category_id = category["category_id"]
                category_name = category["category_name"]
                
                for item in category.get("items", []):
                    item_count += 1
                    
                    # Create base item data structure
                    base_item_data = {
                        "type": "main_item",
                        "item_id": item["item_id"],
                        "main_item_id": item["item_id"],
                        "category_id": category_id,
                        "category_name": category_name,
                        "name": item["name"],
                        "display_name": item["name"],
                        "thumbnail": item.get("thumbnail"),
                        "sell_price": item.get("sell_price", 0),
                        "base_unit": item.get("base_unit", "unit"),
                        "batches": item.get("batches", []),
                        "has_batches": item.get("has_batches", False),
                        "shop_id": shop_id,
                        "shop_name": shop_name,
                        "category": category,
                        "original_item": item
                    }
                    
                    # Generate item key
                    item_key = self._generate_item_key(item, category, shop)
                    self.items_by_id[item_key] = base_item_data
                    
                    # Index item name (high score)
                    self._add_to_index(item["name"], 100, item_key, base_item_data)
                    
                    # Index selling units
                    for su in item.get("selling_units", []):
                        su_count += 1
                        su_key = self._generate_item_key(item, category, shop, True, su)
                        
                        su_data = {
                            "type": "selling_unit",
                            "item_id": item["item_id"],
                            "main_item_id": item["item_id"],
                            "sell_unit_id": su["sell_unit_id"],
                            "category_id": category_id,
                            "category_name": category_name,
                            "name": su.get("name", ""),
                            "display_name": su.get("name", ""),
                            "thumbnail": su.get("thumbnail") or item.get("thumbnail"),
                            "price": su.get("sell_price", 0),
                            "conversion_factor": su.get("conversion_factor", 1),
                            "batch_links": su.get("batch_links", []),
                            "has_batch_links": su.get("has_batch_links", False),
                            "total_units_available": su.get("total_units_available", 0),
                            "shop_id": shop_id,
                            "shop_name": shop_name,
                            "category": category,
                            "original_item": item,
                            "original_su": su,
                            "batches": item.get("batches", [])  # Reference parent batches
                        }
                        
                        self.items_by_id[su_key] = su_data
                        
                        # Index selling unit name (higher score than parent)
                        su_name = su.get("name", "")
                        if su_name:
                            self._add_to_index(su_name, 95, su_key, su_data)
        
        self.total_items = item_count
        self.total_selling_units = su_count
        self.last_built = time.time()
        
        print(f"✅ SEARCH INDEX BUILT in {time.time()-start:.2f}s")
        print(f"   • {item_count} main items indexed")
        print(f"   • {su_count} selling units indexed")
        print(f"   • {len(self.word_index)} unique keywords")
        print(f"   • {len(self.prefix_index)} prefixes available")
    
    def search(self, query, shop_id=None, limit=50):
        """Fast search using index - O(1) lookup!"""
        if not query or len(query) < 2:
            return []
        
        query = query.lower().strip()
        start_time = time.time()
        
        # Direct word matches (highest relevance)
        direct_matches = []
        if query in self.word_index:
            for match in self.word_index[query]:
                item_data = match["data"]
                # Filter by shop if needed
                if shop_id and item_data.get("shop_id") != shop_id:
                    continue
                direct_matches.append({
                    "score": match["score"],
                    "data": item_data,
                    "match_type": "exact_word"
                })
        
        # Prefix matches (for partial typing)
        prefix_matches = []
        if query in self.prefix_index:
            for item_key in self.prefix_index[query]:
                if item_key in self.items_by_id:
                    item_data = self.items_by_id[item_key]
                    if shop_id and item_data.get("shop_id") != shop_id:
                        continue
                    # Lower score for prefix matches
                    prefix_matches.append({
                        "score": 70,
                        "data": item_data,
                        "match_type": "prefix"
                    })
        
        # Combine and deduplicate
        seen_keys = set()
        combined = []
        
        for match in direct_matches + prefix_matches:
            key = match["data"].get("sell_unit_id") or match["data"].get("item_id")
            if key not in seen_keys:
                seen_keys.add(key)
                combined.append(match)
        
        # Sort by score descending
        combined.sort(key=lambda x: x["score"], reverse=True)
        
        # Convert to response format
        results = []
        for match in combined[:limit]:
            item_data = match["data"]
            
            if item_data["type"] == "main_item":
                # Format main item with batch info
                result_item = self._format_main_item(item_data, match)
            else:
                # Format selling unit
                result_item = self._format_selling_unit(item_data, match)
            
            results.append(result_item)
        
        search_time = (time.time() - start_time) * 1000
        print(f"⚡ Index search: '{query}' found {len(results)} items in {search_time:.1f}ms")
        
        return results
    
    def _format_main_item(self, item_data, match):
        """Format main item for response"""
        item = item_data["original_item"]
        batches = item.get("batches", [])
        
        # Find best batch
        best_batch = None
        if batches:
            # Sort by timestamp (FIFO)
            sorted_batches = sorted(batches, key=lambda b: b.get("timestamp", 0))
            for batch in sorted_batches:
                if batch.get("quantity", 0) >= 0.999999:
                    best_batch = batch
                    break
            if not best_batch and sorted_batches:
                best_batch = sorted_batches[0]
        
        if best_batch:
            batch_qty = float(best_batch.get("quantity", 0))
            batch_status = "active_healthy" if batch_qty > 3 else "active_low_stock" if batch_qty >= 1 else "exhausted"
            
            return {
                "type": "main_item",
                "item_id": item_data["item_id"],
                "main_item_id": item_data["item_id"],
                "category_id": item_data["category_id"],
                "category_name": item_data["category_name"],
                "name": item_data["name"],
                "display_name": item_data["name"],
                "thumbnail": item_data["thumbnail"],
                "batch_status": batch_status,
                "batch_id": best_batch.get("batch_id"),
                "batch_name": best_batch.get("batch_name", "Batch"),
                "batch_remaining": batch_qty,
                "real_available": batch_qty,
                "price": round(float(best_batch.get("sell_price", 0)), 2),
                "base_unit": best_batch.get("unit", item_data["base_unit"]),
                "can_fulfill": batch_qty >= 0.999999,
                "unit_type": "base",
                "search_score": match["score"],
                "next_batch_available": False,  # Simplify for now
                "debug": {
                    "match_type": match["match_type"],
                    "query_used": query if 'query' in locals() else "",
                    "search_method": "index"
                }
            }
        
        # Fallback if no batch
        return {
            "type": "main_item",
            "item_id": item_data["item_id"],
            "main_item_id": item_data["item_id"],
            "category_id": item_data["category_id"],
            "category_name": item_data["category_name"],
            "name": item_data["name"],
            "display_name": item_data["name"],
            "thumbnail": item_data["thumbnail"],
            "batch_status": "no_batches",
            "batch_id": None,
            "batch_remaining": 0,
            "real_available": 0,
            "price": 0,
            "can_fulfill": False,
            "unit_type": "base",
            "search_score": match["score"],
            "debug": {
                "match_type": match["match_type"],
                "search_method": "index"
            }
        }
    
    def _format_selling_unit(self, item_data, match):
        """Format selling unit for response"""
        su = item_data["original_su"]
        batches = item_data["batches"]
        conversion = float(item_data["conversion_factor"])
        
        # Calculate available units from batches
        available_units = 0
        best_batch = None
        if batches:
            sorted_batches = sorted(batches, key=lambda b: b.get("timestamp", 0))
            for batch in sorted_batches:
                batch_qty = float(batch.get("quantity", 0))
                if batch_qty > 0:
                    available_units += batch_qty * conversion
                    if not best_batch:
                        best_batch = batch
        
        batch_status = "active_healthy" if available_units > 10 else "active_low_stock" if available_units >= 1 else "out_of_stock"
        
        # Calculate price per unit
        unit_price = 0
        if best_batch and conversion > 0:
            unit_price = float(best_batch.get("sell_price", 0)) / conversion
        
        return {
            "type": "selling_unit",
            "item_id": item_data["item_id"],
            "main_item_id": item_data["item_id"],
            "sell_unit_id": item_data["sell_unit_id"],
            "category_id": item_data["category_id"],
            "category_name": item_data["category_name"],
            "name": su.get("name", ""),
            "display_name": su.get("name", ""),
            "parent_item_name": item_data["original_item"]["name"],
            "thumbnail": item_data["thumbnail"],
            "batch_status": batch_status,
            "batch_id": best_batch.get("batch_id") if best_batch else None,
            "batch_name": best_batch.get("batch_name", "Batch") if best_batch else None,
            "real_available_units": available_units,
            "price": round(unit_price, 4),
            "available_stock": available_units,
            "conversion_factor": conversion,
            "base_unit": best_batch.get("unit", "unit") if best_batch else "unit",
            "can_fulfill": available_units > 0.000001,
            "has_batch_links": item_data["has_batch_links"],
            "unit_type": "selling_unit",
            "search_score": match["score"],
            "matched_by": match["match_type"],
            "debug": {
                "match_type": match["match_type"],
                "search_method": "index",
                "batch_available_units": available_units,
                "conversion_applied": conversion
            }
        }

# Initialize search index
search_index = SearchIndex()

# ======================================================
# FULL SHOP CACHE (STRICTLY PER SHOP) - UPDATED WITH BATCH TRACKING
# ======================================================
embedding_cache_full = {
    "shops": [],
    "last_updated": None,
    "total_shops": 0
}

# ======================================================
# DEBOUNCING FOR CACHE REFRESHES (ADDED TO PREVENT MULTIPLE REFRESHES)
# ======================================================
import threading
import time

_last_refresh_time = 0
_refresh_timer = None
REFRESH_COOLDOWN = 30  # Minimum seconds between refreshes
REFRESH_DELAY = 2      # Wait 2 seconds for multiple changes



def refresh_full_item_cache():
    """OPTIMIZED: Batches Firestore reads for 10x faster performance"""
    start = time.time()
    print("\n[INFO] Refreshing FULL shop cache (OPTIMIZED)...")

    shops_result = []
    
    # Get all shops at once
    for shop_doc in db.collection("Shops").stream():
        shop_id = shop_doc.id
        shop_data = shop_doc.to_dict()
        shop_entry = {
            "shop_id": shop_id,
            "shop_name": shop_data.get("name", ""),
            "categories": []
        }

        # Get all categories for this shop at once
        categories = list(shop_doc.reference.collection("categories").stream())
        
        for cat_doc in categories:
            cat_data = cat_doc.to_dict()
            cat_id = cat_doc.id
            category_entry = {
                "category_id": cat_id,
                "category_name": cat_data.get("name", ""),
                "items": []
            }

            # Get all items for this category at once
            items = list(cat_doc.reference.collection("items").stream())
            
            for item_doc in items:
                item_data = item_doc.to_dict()
                item_id = item_doc.id

                # Process batches
                batches = item_data.get("batches", [])
                processed_batches = []
                for batch in batches:
                    processed_batches.append({
                        "batch_id": batch.get("id", f"batch_{int(time.time()*1000)}"),
                        "quantity": float(batch.get("quantity", 0)),
                        "unit": batch.get("unit", "unit"),
                        "buy_price": float(batch.get("buyPrice", 0) or batch.get("buy_price", 0)),
                        "sell_price": float(batch.get("sellPrice", 0) or batch.get("sell_price", 0)),
                        "timestamp": batch.get("timestamp", 0),
                        "batch_name": batch.get("batchName", batch.get("batch_name", "Batch")),
                    })

                # Get selling units for this item (ONE query)
                selling_units = []
                try:
                    sell_units_ref = db.collection("Shops").document(shop_id) \
                        .collection("categories").document(cat_id) \
                        .collection("items").document(item_id) \
                        .collection("sellUnits")
                    
                    sell_units_docs = list(sell_units_ref.stream())
                    
                    for sell_unit_doc in sell_units_docs:
                        su_data = sell_unit_doc.to_dict()
                        selling_units.append({
                            "sell_unit_id": sell_unit_doc.id,
                            "name": su_data.get("name", ""),
                            "conversion_factor": float(su_data.get("conversionFactor", 1.0)),
                            "sell_price": float(su_data.get("sellPrice", 0.0)),
                            "images": su_data.get("images", []),
                            "thumbnail": su_data.get("images", [None])[0] if su_data.get("images") else None,
                            "batch_links": su_data.get("batchLinks", []),
                        })
                except Exception:
                    pass  # Silently fail - no need to print

                # Calculate stock
                total_stock_from_batches = sum(batch.get("quantity", 0) for batch in batches)
                main_stock = float(item_data.get("stock", 0) or 0)
                effective_stock = total_stock_from_batches if total_stock_from_batches > 0 else main_stock

                category_entry["items"].append({
                    "item_id": item_id,
                    "name": item_data.get("name", ""),
                    "thumbnail": item_data.get("images", [None])[0],
                    "sell_price": float(item_data.get("sellPrice", 0) or 0),
                    "buy_price": float(item_data.get("buyPrice", 0) or 0),
                    "stock": effective_stock,
                    "base_unit": item_data.get("baseUnit", "unit"),
                    "selling_units": selling_units,
                    "category_id": cat_id,
                    "category_name": category_entry["category_name"],
                    "batches": processed_batches,
                    "has_batches": len(processed_batches) > 0,
                })

            if category_entry["items"]:
                shop_entry["categories"].append(category_entry)

        if shop_entry["categories"]:
            shops_result.append(shop_entry)

    embedding_cache_full["shops"] = shops_result
    embedding_cache_full["total_shops"] = len(shops_result)
    embedding_cache_full["last_updated"] = time.time()

    # Cache statistics (minimal)
    total_main_items = sum(len(c["items"]) for s in shops_result for c in s["categories"])
    total_selling_units = sum(len(i.get("selling_units", [])) for s in shops_result for c in s["categories"] for i in c["items"])
    total_batches = sum(len(i.get("batches", [])) for s in shops_result for c in s["categories"] for i in c["items"])

    elapsed = round((time.time()-start)*1000, 2)
    print(f"[READY] Cached {len(shops_result)} shops, {total_main_items} items, {total_selling_units} selling units, {total_batches} batches")
    print(f"[TIME] Cache refresh took {elapsed}ms (OPTIMIZED)")
    
    return shops_result






# ======================================================
# DEBOUNCED CACHE REFRESH FUNCTION
# ======================================================
def debounced_refresh_cache():
    """Debounced cache refresh to prevent multiple refreshes"""
    global _last_refresh_time, _refresh_timer
    
    def do_refresh():
        global _last_refresh_time
        current_time = time.time()
        
        # Check if we've refreshed too recently
        if current_time - _last_refresh_time < REFRESH_COOLDOWN:
            print(f"⏱️ Cache refresh skipped - last refresh was {round(current_time - _last_refresh_time, 1)}s ago")
            return
        
        print("[LISTENER] Changes detected → refreshing FULL cache (debounced)")
        refresh_full_item_cache()
        _last_refresh_time = time.time()
    
    # Cancel any pending refresh
    if _refresh_timer:
        _refresh_timer.cancel()
    
    # Schedule new refresh with delay
    _refresh_timer = threading.Timer(REFRESH_DELAY, do_refresh)
    _refresh_timer.start()






def on_full_item_snapshot(col_snapshot, changes, read_time):
    """Listener for changes to main items - DEBOUNCED"""
    print("[LISTENER] Main items changed → scheduling cache refresh")
    debounced_refresh_cache()


def on_selling_units_snapshot(col_snapshot, changes, read_time):
    """Listener for changes to selling units - DEBOUNCED"""
    print("[LISTENER] Selling units changed → scheduling cache refresh")
    debounced_refresh_cache()


# ======================================================
# BATCH-AWARE FIFO HELPER FUNCTIONS
# ======================================================

def find_item_in_cache(shop_id, item_id):
    """Find item in cache by shop_id and item_id"""
    for shop in embedding_cache_full["shops"]:
        if shop["shop_id"] == shop_id:
            for category in shop["categories"]:
                for item in category["items"]:
                    if item["item_id"] == item_id:
                        return item
    return None

def find_selling_unit_in_cache(shop_id, item_id, sell_unit_id):
    """Find selling unit in cache"""
    item = find_item_in_cache(shop_id, item_id)
    if item:
        for sell_unit in item.get("selling_units", []):
            if sell_unit.get("sell_unit_id") == sell_unit_id:
                return sell_unit
    return None

def allocate_main_item_fifo(batches, requested_quantity):
    """
    Allocate quantity from batches using FIFO for main items
    """
    if not batches:
        return {"success": False, "error": "No batches available"}
    
    sorted_batches = sorted(batches, key=lambda x: x.get("timestamp", 0))
    
    allocation = []
    remaining = requested_quantity
    total_price = 0
    
    for batch in sorted_batches:
        if remaining <= 0:
            break
        
        available = batch.get("remaining_quantity", 0)
        if available > 0:
            take = min(available, remaining)
            batch_price = batch.get("sell_price", 0)
            
            allocation.append({
                "batch_id": batch["batch_id"],
                "batch_name": batch.get("batch_name", "Batch"),
                "quantity": take,
                "price": batch_price,
                "unit": batch.get("unit", "unit"),
                "batch_info": batch
            })
            
            total_price += take * batch_price
            remaining -= take
    
    if remaining > 0:
        return {"success": False, "error": f"Insufficient stock. Only {requested_quantity - remaining} available"}
    
    return {"success": True, "allocation": allocation, "total_price": total_price}

def allocate_selling_unit_fifo(batch_links, requested_units, conversion_factor):
    """
    Allocate selling units from batch links using FIFO
    """
    if not batch_links:
        return {"success": False, "error": "No batch links available"}
    
    sorted_links = sorted(batch_links, key=lambda x: x.get("batchTimestamp", 0))
    
    allocation = []
    remaining_units = requested_units
    total_price = 0
    
    for link in sorted_links:
        if remaining_units <= 0:
            break
        
        available_units = link.get("maxUnitsAvailable", 0) - link.get("allocatedUnits", 0)
        if available_units > 0:
            take_units = min(available_units, remaining_units)
            price_per_unit = link.get("pricePerUnit", 0)
            
            take_main_units = take_units / conversion_factor
            
            allocation.append({
                "batch_id": link.get("batchId"),
                "units_taken": take_units,
                "main_units_taken": take_main_units,
                "price_per_unit": price_per_unit,
                "total_for_batch": take_units * price_per_unit
            })
            
            total_price += take_units * price_per_unit
            remaining_units -= take_units
    
    if remaining_units > 0:
        return {"success": False, "error": f"Insufficient units. Only {requested_units - remaining_units} available"}
    
    return {"success": True, "allocation": allocation, "total_price": total_price}

# PLANS
PLANS_CONFIG = {
    "SOLO": {
        "id": "SOLO",
        "name": "Solo",
        "staff_limit": 0,
        "price_kes": 0,
        "description": "Perfect for individual entrepreneurs",
        "features": [
            {"text": "1 seat only (owner)", "included": True},
            {"text": "Up to 50 items", "included": True},
            {"text": "Basic stock tracking", "included": True},
            {"text": "Mobile app access", "included": True},
            {"text": "No concurrent staff access", "included": False},
            {"text": "No priority support", "included": False}
        ],
        "button_text": "Start Free Forever",
        "button_class": "btn-free",
        "best_for": "Perfect for individual entrepreneurs"
    },
    "BASIC": {
        "id": "BASIC",
        "name": "Basic",
        "staff_limit": 5,
        "price_kes": 250,
        "description": "Small business with employees",
        "features": [
            {"text": "Up to 5 concurrent seats", "included": True},
            {"text": "Up to 200 items", "included": True},
            {"text": "Basic staff access", "included": True},
            {"text": "Stock alerts", "included": True},
            {"text": "WhatsApp support", "included": True},
            {"text": "Data backup", "included": True}
        ],
        "button_text": "Pay via M-Pesa",
        "button_class": "btn-primary",
        "best_for": "Best for: Family shops & startups"
    },
    "TEAM": {
        "id": "TEAM",
        "name": "Team",
        "staff_limit": 10,
        "price_kes": 500,
        "description": "Growing business with team",
        "features": [
            {"text": "3-5 concurrent seats", "included": True},
            {"text": "Up to 500 items", "included": True},
            {"text": "Multiple staff roles (RBAC)", "included": True},
            {"text": "Sales reports & analytics", "included": True},
            {"text": "Data export (CSV/Excel)", "included": True},
            {"text": "Priority WhatsApp support", "included": True}
        ],
        "button_text": "Pay via M-Pesa",
        "button_class": "btn-primary btn-featured",
        "best_for": "Best value for growing businesses",
        "featured": True
    },
    "BUSINESS": {
        "id": "BUSINESS",
        "name": "Business",
        "staff_limit": 20,
        "price_kes": 1000,
        "description": "Multiple counters/locations",
        "features": [
            {"text": "6-10 concurrent seats", "included": True},
            {"text": "Unlimited items", "included": True},
            {"text": "Advanced analytics dashboard", "included": True},
            {"text": "Multi-location support", "included": True},
            {"text": "Custom categories", "included": True},
            {"text": "24/7 phone support", "included": True}
        ],
        "button_text": "Pay via M-Pesa",
        "button_class": "btn-primary",
        "best_for": "For established businesses"
    },
    "ENTERPRISE": {
        "id": "ENTERPRISE",
        "name": "Enterprise",
        "staff_limit": 50,
        "price_kes": 3000,
        "description": "Supermarkets & large operations",
        "features": [
            {"text": "11-20+ concurrent seats", "included": True},
            {"text": "Unlimited everything", "included": True},
            {"text": "API access", "included": True},
            {"text": "Dedicated account manager", "included": True},
            {"text": "Custom feature requests", "included": True},
            {"text": "On-site training available", "included": True}
        ],
        "button_text": "Contact Us",
        "button_class": "btn-enterprise",
        "best_for": "Custom solutions available"
    }
}

# ======================================================
# ROUTES
# ======================================================
@app.route("/")
def home():
    return render_template(
        "home.html",
        title="Superkeeper - Inventory POS for Small Businesses",
        meta_desc="Mobile-first POS and inventory for small businesses. Start free, upgrade as you grow.",
        active_page="home"
    )

@app.route("/features")
def features():
    return render_template(
        "features.html",
        title="Features - Superkeeper",
        meta_desc="Everything you need, nothing you don't. Mobile-first POS, staff control, alerts, and more.",
        active_page="features"
    )

@app.route("/pricing")
def pricing():
    annual_discounts = []
    for plan_id, plan in PLANS_CONFIG.items():
        if plan["price_kes"] > 0 and plan_id != "ENTERPRISE":
            annual_price = plan["price_kes"] * 12
            discounted_price = int(annual_price * 0.8)
            savings = annual_price - discounted_price
            
            annual_discounts.append({
                "plan_name": plan["name"],
                "old_price": annual_price,
                "new_price": discounted_price,
                "savings": savings
            })
    
    return render_template(
        "pricing.html",
        title="Pricing - Superkeeper",
        meta_desc="Simple, seat-based pricing. Start free, upgrade as you grow.",
        active_page="pricing",
        plans=PLANS_CONFIG.values(),
        annual_discounts=annual_discounts,
        featured_plan="TEAM"
    )

@app.route("/testimonials")
def testimonials():
    return render_template(
        "testimonials.html",
        title="Success Stories - Superkeeper",
        meta_desc="Real results from real shops. See how Superkeeper helps small businesses.",
        active_page="testimonials"
    )

@app.route("/story")
def story():
    return render_template(
        "story.html",
        title="Our Story - Superkeeper",
        meta_desc="How Superkeeper was built for small businesses with big dreams.",
        active_page="story"
    )

@app.route("/dashboard")
def dashboard():
    return render_template("dashboard.html")

# ======================================================
# OPTIMIZED SALES SEARCH ROUTE - NOW LIGHTNING FAST! ⚡
# ======================================================
@app.route("/sales", methods=["POST"])
def sales():
    """
    OPTIMIZED SEARCH using in-memory index - 100x faster!
    """
    try:
        start_time = time.time()
        data = request.get_json() or {}
        
        # Log minimal info for debugging
        query = (data.get("query") or "").lower().strip()
        shop_id = data.get("shop_id")
        
        print(f"\n⚡ SEARCH: '{query}' for shop {shop_id}")

        # Validate input
        if not query or len(query) < 2 or not shop_id:
            return jsonify({
                "items": [],
                "meta": {
                    "error": "Invalid query or shop_id",
                    "processing_time_ms": round((time.time() - start_time) * 1000, 2)
                }
            }), 400

        # Use search index for lightning-fast results
        results = search_index.search(query, shop_id)
        
        processing_time = (time.time() - start_time) * 1000
        
        return jsonify({
            "items": results,
            "meta": {
                "shop_id": shop_id,
                "query": query,
                "results": len(results),
                "processing_time_ms": round(processing_time, 2),
                "using_index": True,
                "cache_last_updated": embedding_cache_full.get("last_updated")
            }
        }), 200

    except Exception as e:
        import traceback
        print(f"❌ SEARCH ERROR: {e}")
        traceback.print_exc()
        
        return jsonify({
            "items": [],
            "meta": {
                "error": str(e),
                "processing_time_ms": round((time.time() - start_time) * 1000, 2)
            }
        }), 500

# ======================================================
# COMPLETE SALE ROUTE
# ======================================================
@app.route("/complete-sale", methods=["POST"])
def complete_sale():
    """
    COMPLETE SALE (FIXED CONVERSION LOGIC)
    """
    try:
        data = request.get_json(force=True)
        shop_id = data.get("shop_id")
        seller = data.get("seller")
        items = data.get("items", [])

        if not shop_id or not items:
            return jsonify({"success": False, "error": "Missing shop_id or items"}), 400

        updated_items = []

        print("\n🔥 COMPLETE SALE REQUEST")
        print(f"Shop ID: {shop_id} | Items: {len(items)}")

        for idx, cart_item in enumerate(items):
            print(f"\n📦 Processing item {idx + 1}")
            
            item_id = cart_item.get("item_id")
            category_id = cart_item.get("category_id")
            batch_id = cart_item.get("batch_id") or cart_item.get("batchId")
            quantity = float(cart_item.get("quantity", 0))
            unit = cart_item.get("unit", "unit")
            conversion_factor = float(cart_item.get("conversion_factor", 1))
            item_type = cart_item.get("type", "main_item")
            
            print(f"   Type: {item_type}")
            print(f"   Quantity entered: {quantity}")
            print(f"   Conversion factor: {conversion_factor}")

            if not item_id or not category_id or not batch_id or quantity <= 0:
                return jsonify({
                    "success": False,
                    "error": "Invalid sale item payload",
                    "item": cart_item
                }), 400

            # Firestore path to item
            item_ref = (
                db.collection("Shops")
                .document(shop_id)
                .collection("categories")
                .document(category_id)
                .collection("items")
                .document(item_id)
            )

            item_doc = item_ref.get()
            if not item_doc.exists:
                return jsonify({
                    "success": False,
                    "error": f"Item {item_id} not found"
                }), 404

            item_data = item_doc.to_dict()
            batches = item_data.get("batches", [])
            total_stock = float(item_data.get("stock", 0))

            # Find the target batch
            batch_index = next((i for i, b in enumerate(batches) if b.get("id") == batch_id), None)
            if batch_index is None:
                return jsonify({
                    "success": False,
                    "error": f"Batch {batch_id} not found for item {item_data.get('name')}"
                }), 404

            batch = batches[batch_index]
            batch_qty = float(batch.get("quantity", 0))

            # CRITICAL FIX: CONVERSION LOGIC
            if item_type == "selling_unit":
                base_qty = quantity / conversion_factor
                print(f"   Selling unit: {quantity} units ÷ {conversion_factor} = {base_qty} base units")
            else:
                base_qty = quantity
                print(f"   Main item: {quantity} base units")

            print(f"   Batch available: {batch_qty} base units")
            print(f"   Required to deduct: {base_qty} base units")

            if batch_qty < base_qty:
                return jsonify({
                    "success": False,
                    "error": f"Insufficient stock in batch {batch_id}. Available: {batch_qty} base units, requested: {base_qty} base units",
                    "details": {
                        "item_type": item_type,
                        "quantity_requested": quantity,
                        "conversion_factor": conversion_factor,
                        "base_units_needed": base_qty,
                        "base_units_available": batch_qty
                    }
                }), 400

            # Deduct stock
            batches[batch_index]["quantity"] = batch_qty - base_qty
            new_total_stock = total_stock - base_qty

            # Calculate price
            sell_price = float(batch.get("sellPrice", 0))
            if item_type == "selling_unit":
                unit_price = sell_price / conversion_factor
                total_price = unit_price * quantity
            else:
                total_price = sell_price * base_qty

            # Create stock transaction
            stock_txn = {
                "id": f"sale_{int(time.time() * 1000)}",
                "type": "sale",
                "item_type": item_type,
                "batchId": batch_id,
                "quantity": base_qty,
                "selling_units_quantity": quantity if item_type == "selling_unit" else None,
                "unit": unit,
                "sellPrice": sell_price,
                "unitPrice": unit_price if item_type == "selling_unit" else sell_price,
                "totalPrice": total_price,
                "timestamp": int(datetime.now().timestamp()),
                "performedBy": seller,
                "conversion_factor": conversion_factor if item_type == "selling_unit" else None
            }

            stock_transactions = item_data.get("stockTransactions", [])
            stock_transactions.append(stock_txn)

            # Update Firestore
            item_ref.update({
                "batches": batches,
                "stock": new_total_stock,
                "stockTransactions": stock_transactions,
                "lastStockUpdate": firestore.SERVER_TIMESTAMP,
                "lastTransactionId": stock_txn["id"]
            })

            exhausted = batches[batch_index]["quantity"] == 0

            updated_items.append({
                "item_id": item_id,
                "item_type": item_type,
                "batch_id": batch_id,
                "quantity_sold": quantity,
                "base_units_deducted": base_qty,
                "remaining_batch_quantity": batches[batch_index]["quantity"],
                "remaining_total_stock": new_total_stock,
                "batch_exhausted": exhausted,
                "total_price": total_price
            })

            print(f"   ✅ Deducted: {base_qty} base units from batch")
            print(f"   ✅ Remaining in batch: {batches[batch_index]['quantity']}")
            print(f"   ✅ Total price: ${total_price}")

        return jsonify({
            "success": True,
            "updated_items": updated_items,
            "message": "Sale completed successfully"
        }), 200

    except Exception as e:
        print("🔥 COMPLETE SALE ERROR:", str(e))
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500

# ======================================================
# ITEM OPTIMIZATION (UPDATED WITH BATCH INFO)
# ======================================================
@app.route("/item-optimization", methods=["GET"])
def item_optimization():
    total_batches = 0
    items_with_batches = 0
    items_without_batches = 0
    
    for shop in embedding_cache_full["shops"]:
        for category in shop["categories"]:
            for item in category["items"]:
                if item.get("has_batches"):
                    items_with_batches += 1
                    total_batches += len(item.get("batches", []))
                else:
                    items_without_batches += 1
    
    return jsonify({
        "status": "success",
        "shops": embedding_cache_full["shops"],
        "total_shops": embedding_cache_full["total_shops"],
        "last_updated": embedding_cache_full["last_updated"],
        "batch_stats": {
            "total_batches": total_batches,
            "items_with_batches": items_with_batches,
            "items_without_batches": items_without_batches,
            "percentage_with_batches": round(items_with_batches / (items_with_batches + items_without_batches) * 100, 1) if (items_with_batches + items_without_batches) > 0 else 0
        }
    })

# ======================================================
# DEBUG ENDPOINT (UPDATED WITH BATCH INFO)
# ======================================================
@app.route("/debug-cache", methods=["GET"])
def debug_cache():
    """Debug endpoint to check cache contents (updated with batch tracking)"""
    if not embedding_cache_full["shops"]:
        return jsonify({"error": "Cache empty"}), 404
    
    try:
        first_shop = embedding_cache_full["shops"][0]
        first_category = first_shop["categories"][0]
        first_item = first_category["items"][0]
        
        total_selling_units = 0
        total_batches = 0
        items_with_batches = 0
        
        for shop in embedding_cache_full["shops"]:
            for category in shop["categories"]:
                for item in category["items"]:
                    total_selling_units += len(item.get("selling_units", []))
                    total_batches += len(item.get("batches", []))
                    if item.get("has_batches"):
                        items_with_batches += 1
        
        return jsonify({
            "first_item": {
                "name": first_item["name"],
                "has_sell_price": "sell_price" in first_item or "sellPrice" in first_item,
                "sell_price_value": first_item.get("sell_price") or first_item.get("sellPrice"),
                "has_batches": first_item.get("has_batches", False),
                "batch_count": len(first_item.get("batches", [])),
                "has_selling_units": len(first_item.get("selling_units", [])) > 0,
                "selling_units_count": len(first_item.get("selling_units", []))
            },
            "cache_details": {
                "total_shops": len(embedding_cache_full["shops"]),
                "total_categories": sum(len(shop["categories"]) for shop in embedding_cache_full["shops"]),
                "total_items": sum(len(category["items"]) for shop in embedding_cache_full["shops"] for category in shop["categories"]),
                "total_selling_units": total_selling_units,
                "total_batches": total_batches,
                "items_with_batches": items_with_batches,
                "last_updated": embedding_cache_full["last_updated"]
            },
            "search_index": {
                "built_at": search_index.last_built,
                "total_items_indexed": search_index.total_items,
                "total_selling_units_indexed": search_index.total_selling_units,
                "unique_keywords": len(search_index.word_index)
            }
        })
    except (IndexError, KeyError) as e:
        return jsonify({"error": f"Cache structure issue: {str(e)}"}), 500

# ======================================================
# PLAN INITIALIZATION ROUTES
# ======================================================
@app.route("/ensure-plan", methods=["POST"])
def ensure_plan():
    """
    Ensure a default plan exists for a given shop.
    Creates a 'Solo' plan only if none exists.
    """
    try:
        if db is None:
            print("❌ Firebase not initialized - cannot ensure plan")
            return jsonify({
                "success": False,
                "error": "Database connection not available",
                "details": "Firebase not initialized - check server logs"
            }), 503

        data = request.get_json(silent=True) or {}
        shop_id = data.get("shop_id")

        if not shop_id:
            return jsonify({
                "success": False,
                "error": "shop_id is required"
            }), 400

        print(f"📝 Ensuring plan for shop: {shop_id}")

        plan_ref = (
            db.collection("Shops")
              .document(shop_id)
              .collection("plan")
              .document("default")
        )

        plan_doc = plan_ref.get()
        if plan_doc.exists:
            return jsonify({
                "success": True,
                "message": "Plan already exists for this shop."
            })

        default_plan = {
            "name": "Solo",
            "staffLimit": 0,
            "features": {
                "sell": True,
                "manageStock": True,
                "businessIntelligence": False,
                "settings": True
            },
            "createdAt": firestore.SERVER_TIMESTAMP,
            "updatedAt": firestore.SERVER_TIMESTAMP
        }

        plan_ref.set(default_plan)
        print(f"✅ Default plan initialized for shop: {shop_id}")

        return jsonify({
            "success": True,
            "message": "Default plan initialized successfully."
        })

    except Exception as e:
        print(f"🔥 ensure-plan error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            "success": False,
            "error": "Internal server error",
            "details": str(e)
        }), 500

# ======================================================
# ADMIN DASHBOARD
# ======================================================
@app.route("/admin")
def admin():
    return render_template("admindashboard.html")

# ======================================================
# TEST SELLING UNITS ENDPOINT
# ======================================================
@app.route("/test-selling-units", methods=["GET"])
def test_selling_units():
    """Test endpoint to check selling units directly in Firestore"""
    try:
        shop_id = request.args.get("shop_id")
        item_id = request.args.get("item_id")
        
        if not shop_id or not item_id:
            return jsonify({"error": "shop_id and item_id required"}), 400
        
        items_ref = db.collection("Shops").document(shop_id).collection("items").document(item_id)
        item_doc = items_ref.get()
        
        if not item_doc.exists:
            return jsonify({"error": "Item not found"}), 404
        
        item_data = item_doc.to_dict()
        
        sell_units_ref = items_ref.collection("sellUnits")
        sell_units_docs = list(sell_units_ref.stream())
        
        result = {
            "item_name": item_data.get("name"),
            "item_id": item_id,
            "sellUnits_collection_exists": True,
            "sellUnits_count": len(sell_units_docs),
            "sellUnits_details": []
        }
        
        for doc in sell_units_docs:
            data = doc.to_dict()
            result["sellUnits_details"].append({
                "id": doc.id,
                "name": data.get("name"),
                "conversionFactor": data.get("conversionFactor"),
                "sellPrice": data.get("sellPrice"),
                "has_batchLinks": "batchLinks" in data,
                "batchLinks_count": len(data.get("batchLinks", []))
            })
        
        return jsonify(result)
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ======================================================
# GOOGLE SITE VERIFICATION
# ======================================================
@app.route('/google0da523514258b2c9.html')
def google_verify():
    """Serve Google verification file"""
    from flask import send_from_directory
    return send_from_directory('.', 'google0da523514258b2c9.html')

# ======================================================
# RUN SERVER
# ======================================================
print("[INIT] Preloading FULL cache (with batch tracking)...")
try:
    db = get_firebase_client()
    refresh_full_item_cache()
    print("✅ Cache and search index initialized successfully")
except Exception as e:
    print(f"⚠️ Cache initialization error: {e}")
    print("⚠️ Continuing anyway - cache will populate on first request")

# Set up listeners for both main items AND selling units
print("[INIT] Setting up Firestore listeners...")
try:
    if db:
        db.collection_group("items").on_snapshot(on_full_item_snapshot)
        db.collection_group("sellUnits").on_snapshot(on_selling_units_snapshot)
        print("[READY] Listeners active for items and selling units")
except Exception as e:
    print(f"⚠️ Listener setup error: {e}")

# This block ONLY runs for local development
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))


    app.run(host="0.0.0.0", port=port, debug=True)
