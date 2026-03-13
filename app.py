#Isolation
import sys; print(f"PYTHON VERSION: {sys.version}"); print(f"PYTHON PATH: {sys.executable}")

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
import psutil  # Make sure this is in requirements.txt

# ======================================================
# APP INIT
# ======================================================
app = Flask(__name__)

# ======================================================
# SSL/TLS OPTIMIZATIONS
# ======================================================
ssl._create_default_https_context = ssl._create_unverified_context
socket.setdefaulttimeout(30)
app.config['PREFERRED_URL_SCHEME'] = 'https'

# ======================================================
# MEMORY LOGGING FUNCTION (Moved BEFORE refresh function)
# ======================================================
def log_memory(step=""):
    """Log current memory usage"""
    try:
        process = psutil.Process(os.getpid())
        memory_mb = process.memory_info().rss / (1024 * 1024)
        print(f"📊 Memory [{step}]: {memory_mb:.2f} MB")
        
        if memory_mb > 400:
            print(f"⚠️ WARNING: Memory high ({memory_mb:.2f} MB) - approaching Render limit!")
    except:
        pass  # Silently fail if psutil not available

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

db = None

# ======================================================
# SEARCH INDEX (keep your existing SearchIndex class)
# ======================================================
# ... (keep your SearchIndex class exactly as is) ...

# ======================================================
# CACHE AND REFRESH FUNCTION (Only ONE version!)
# ======================================================
embedding_cache_full = {
    "shops": [],
    "last_updated": None,
    "total_shops": 0
}

# Debouncing variables
_last_refresh_time = 0
_refresh_timer = None
REFRESH_COOLDOWN = 30
REFRESH_DELAY = 2

def refresh_full_item_cache():
    """REVISED: Includes ALL items with BATCH tracking and selling units with batch links"""
    global search_index  # CRITICAL: Tell Python this is a global variable
    
    log_memory("before refresh")
    start = time.time()
    print("\n[INFO] Refreshing FULL shop cache (with batch tracking)...")

    shops_result = []

    # Your existing fetching code - KEEP IT EXACTLY AS IS
    for shop_doc in db.collection("Shops").stream():
        shop_id = shop_doc.id
        shop_data = shop_doc.to_dict()

        shop_entry = {
            "shop_id": shop_id,
            "shop_name": shop_data.get("name", ""),
            "categories": []
        }

        for cat_doc in shop_doc.reference.collection("categories").stream():
            cat_data = cat_doc.to_dict()
            cat_id = cat_doc.id

            category_entry = {
                "category_id": cat_id,
                "category_name": cat_data.get("name", ""),
                "items": []
            }

            for item_doc in cat_doc.reference.collection("items").stream():
                item_data = item_doc.to_dict()
                item_id = item_doc.id
                item_name = item_data.get("name", "Unnamed")

                # EMBEDDINGS FETCHING - DISABLED
                embeddings = []

                # Get batches for this item
                batches = item_data.get("batches", [])
                processed_batches = []
                for batch in batches:
                    processed_batches.append({
                        "batch_id": batch.get("id", f"batch_{int(time.time()*1000)}"),
                        "batch_name": batch.get("batchName", batch.get("batch_name", "Batch")),
                        "quantity": float(batch.get("quantity", 0)),
                        "remaining_quantity": float(batch.get("quantity", 0)),
                        "unit": batch.get("unit", "unit"),
                        "buy_price": float(batch.get("buyPrice", 0) or batch.get("buy_price", 0)),
                        "sell_price": float(batch.get("sellPrice", 0) or batch.get("sell_price", 0)),
                        "timestamp": batch.get("timestamp", 0),
                        "date": batch.get("date", ""),
                        "added_by": batch.get("addedBy", ""),
                        "selling_unit_allocations": batch.get("sellingUnitAllocations", {})
                    })

                # Get selling units for this item
                selling_units = []
                try:
                    sell_units_ref = db.collection("Shops").document(shop_id) \
                        .collection("categories").document(cat_id) \
                        .collection("items").document(item_id) \
                        .collection("sellUnits")
                    
                    sell_units_docs = list(sell_units_ref.stream())
                    
                    for sell_unit_doc in sell_units_docs:
                        sell_unit_data = sell_unit_doc.to_dict()
                        sell_unit_id = sell_unit_doc.id
                        
                        # Get batch links
                        batch_links = sell_unit_data.get("batchLinks", [])
                        total_units_available = 0
                        
                        for link in batch_links:
                            total_units_available += link.get("maxUnitsAvailable", 0) - link.get("allocatedUnits", 0)
                        
                        selling_units.append({
                            "sell_unit_id": sell_unit_doc.id,
                            "name": sell_unit_data.get("name", ""),
                            "conversion_factor": float(sell_unit_data.get("conversionFactor", 1.0)),
                            "sell_price": float(sell_unit_data.get("sellPrice", 0.0)),
                            "images": sell_unit_data.get("images", []),
                            "is_base_unit": sell_unit_data.get("isBaseUnit", False),
                            "thumbnail": sell_unit_data.get("images", [None])[0] if sell_unit_data.get("images") else None,
                            "created_at": sell_unit_data.get("createdAt"),
                            "updated_at": sell_unit_data.get("updatedAt"),
                            "batch_links": batch_links,
                            "total_units_available": total_units_available,
                            "has_batch_links": len(batch_links) > 0
                        })
                    
                except Exception as e:
                    print(f"❌ ERROR fetching selling units: {e}")

                # Calculate total stock from batches
                total_stock_from_batches = sum(batch.get("quantity", 0) for batch in batches)
                main_stock = float(item_data.get("stock", 0) or 0)
                effective_stock = total_stock_from_batches if total_stock_from_batches > 0 else main_stock
                
                category_entry["items"].append({
                    "item_id": item_doc.id,
                    "name": item_data.get("name", ""),
                    "thumbnail": item_data.get("images", [None])[0],
                    "sell_price": float(item_data.get("sellPrice", 0) or 0),
                    "buy_price": float(item_data.get("buyPrice", 0) or 0),
                    "stock": effective_stock,
                    "base_unit": item_data.get("baseUnit", "unit"),
                    "embeddings": embeddings,
                    "has_embeddings": False,
                    "selling_units": selling_units,
                    "category_id": category_entry["category_id"],
                    "category_name": category_entry["category_name"],
                    "batches": processed_batches,
                    "has_batches": len(processed_batches) > 0,
                    "total_stock_from_batches": total_stock_from_batches
                })

            if category_entry["items"]:
                shop_entry["categories"].append(category_entry)

        if shop_entry["categories"]:
            shops_result.append(shop_entry)

    embedding_cache_full["shops"] = shops_result
    embedding_cache_full["total_shops"] = len(shops_result)
    embedding_cache_full["last_updated"] = time.time()

    # ===== CRITICAL FIX: Initialize search_index if it doesn't exist =====
    if search_index is None:
        print("🔧 Initializing search index for the first time...")
        search_index = SearchIndex()  # Make sure SearchIndex class is defined above
    
    # Build search index after cache refresh
    print("🔨 Building search index...")
    search_index.build(shops_result)

    # Cache statistics
    total_main_items = 0
    total_selling_units = 0
    total_batches = 0
    for shop in shops_result:
        for category in shop["categories"]:
            total_main_items += len(category["items"])
            for item in category["items"]:
                total_selling_units += len(item.get("selling_units", []))
                total_batches += len(item.get("batches", []))

    print(f"\n[READY] Cached {len(shops_result)} shops, {total_main_items} main items, {total_selling_units} selling units, {total_batches} batches")
    
    elapsed = round((time.time()-start)*1000, 2)
    print(f"[TIME] Cache refresh took {elapsed}ms")
    log_memory("after refresh")
    
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
        
        query = (data.get("query") or "").lower().strip()
        shop_id = data.get("shop_id")
        
        print(f"\n⚡ SEARCH: '{query}' for shop {shop_id}")

        if not query or len(query) < 2 or not shop_id:
            return jsonify({
                "items": [],
                "meta": {"processing_time_ms": round((time.time() - start_time) * 1000, 2)}
            }), 400

        # CRITICAL FIX: Check if search_index exists
        global search_index
        if search_index is None:
            print("⚠️ Search index not initialized, rebuilding cache...")
            refresh_full_item_cache()
            
        # Use search index
        results = search_index.search(query, shop_id)
        
        processing_time = (time.time() - start_time) * 1000
        
        return jsonify({
            "items": results,
            "meta": {
                "shop_id": shop_id,
                "query": query,
                "results": len(results),
                "processing_time_ms": round(processing_time, 2),
                "using_index": True
            }
        }), 200

    except Exception as e:
        print(f"❌ SEARCH ERROR: {e}")
        import traceback
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

# CRITICAL FIX: Check if we're on production
IS_PRODUCTION = os.environ.get('RENDER', False) or os.environ.get('PRODUCTION', False)

if IS_PRODUCTION:
    print("[INFO] Running in production - DISABLING Firestore listeners to prevent connection exhaustion")
    print("[INFO] Cache will only refresh on server restart or via manual trigger")
else:
    # Set up listeners ONLY for local development
    print("[INIT] Setting up Firestore listeners for development...")
    try:
        if db:
            db.collection_group("items").on_snapshot(on_full_item_snapshot)
            db.collection_group("sellUnits").on_snapshot(on_selling_units_snapshot)
            print("[READY] Listeners active for items and selling units")
    except Exception as e:
        print(f"⚠️ Listener setup error: {e}")

# Add a manual refresh endpoint (for emergencies)
@app.route("/admin/refresh-cache", methods=["POST"])
def admin_refresh_cache():
    """Manually trigger cache refresh (protected endpoint)"""
    # Add simple auth check here
    refresh_full_item_cache()
    return jsonify({"success": True, "message": "Cache refreshed"})

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)




