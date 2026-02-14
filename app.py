from flask import Flask, render_template, request, jsonify
import requests
import firebase_admin
from firebase_admin import credentials, firestore
import numpy as np
import time
import math
from sklearn.metrics.pairwise import cosine_similarity
import random
from datetime import datetime, timedelta
import uuid
import json
import threading
import atexit

# ======================================================
# APP INIT
# ======================================================
app = Flask(__name__)

# ======================================================
# FIREBASE CONFIG
# ======================================================
cred = credentials.Certificate("serviceAccountKey.json")
firebase_admin.initialize_app(cred)
db = firestore.client()

# ======================================================
# ITEM CACHE (NO VECTORIZATION, JUST ITEM DATA)
# ======================================================
item_cache = {
    "items": [],  # All items with their metadata
    "shops": [],  # Organized by shop for optimization
    "last_updated": None,
    "total_items": 0,
    "is_initialized": False  # Track initialization status
}

def refresh_item_cache():
    """Build cache from Firebase - NO VECTORIZATION, just item metadata"""
    start = time.time()
    print("\n[INFO] Refreshing item cache from Firebase...")

    shops_result = []
    all_items_flat = []

    try:
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
                    
                    # Basic item info - NO EMBEDDINGS
                    item_info = {
                        "item_id": item_id,
                        "shop_id": shop_id,
                        "shop_name": shop_data.get("name", ""),
                        "category_id": cat_id,
                        "category_name": cat_data.get("name", ""),
                        "name": item_data.get("name", ""),
                        "description": item_data.get("description", ""),
                        "thumbnail": item_data.get("images", [None])[0] if item_data.get("images") else None,
                        "sell_price": float(item_data.get("sellPrice", 0) or 0),
                        "buy_price": float(item_data.get("buyPrice", 0) or 0),
                        "stock": float(item_data.get("stock", 0) or 0),
                        "base_unit": item_data.get("baseUnit", "unit"),
                        "created_at": item_data.get("createdAt"),
                        "updated_at": item_data.get("updatedAt"),
                        "tags": item_data.get("tags", []),
                        "sku": item_data.get("sku", ""),
                        "barcode": item_data.get("barcode", ""),
                        "brand": item_data.get("brand", ""),
                        "supplier": item_data.get("supplier", "")
                    }
                    
                    # Get batches if they exist
                    batches = item_data.get("batches", [])
                    processed_batches = []
                    for batch in batches:
                        processed_batches.append({
                            "batch_id": batch.get("id", f"batch_{int(time.time()*1000)}"),
                            "batch_name": batch.get("batchName", batch.get("batch_name", "Batch")),
                            "quantity": float(batch.get("quantity", 0)),
                            "unit": batch.get("unit", "unit"),
                            "buy_price": float(batch.get("buyPrice", 0) or batch.get("buy_price", 0)),
                            "sell_price": float(batch.get("sellPrice", 0) or batch.get("sell_price", 0)),
                            "expiry_date": batch.get("expiryDate", ""),
                            "timestamp": batch.get("timestamp", 0)
                        })
                    
                    item_info["batches"] = processed_batches
                    item_info["has_batches"] = len(processed_batches) > 0
                    
                    # Get selling units
                    selling_units = []
                    try:
                        sell_units_ref = db.collection("Shops").document(shop_id) \
                            .collection("categories").document(cat_id) \
                            .collection("items").document(item_id) \
                            .collection("sellUnits")
                        
                        for sell_unit_doc in sell_units_ref.stream():
                            sell_unit_data = sell_unit_doc.to_dict()
                            selling_units.append({
                                "sell_unit_id": sell_unit_doc.id,
                                "name": sell_unit_data.get("name", ""),
                                "conversion_factor": float(sell_unit_data.get("conversionFactor", 1.0)),
                                "sell_price": float(sell_unit_data.get("sellPrice", 0.0)),
                                "images": sell_unit_data.get("images", []),
                                "is_base_unit": sell_unit_data.get("isBaseUnit", False),
                                "batch_links": sell_unit_data.get("batchLinks", [])
                            })
                    except Exception as e:
                        print(f"Warning: Could not fetch selling units for {item_id}: {e}")
                    
                    item_info["selling_units"] = selling_units
                    item_info["has_selling_units"] = len(selling_units) > 0
                    
                    # Add to both structures
                    category_entry["items"].append(item_info)
                    all_items_flat.append(item_info)

                if category_entry["items"]:
                    shop_entry["categories"].append(category_entry)

            if shop_entry["categories"]:
                shops_result.append(shop_entry)

        # Update cache
        item_cache["items"] = all_items_flat
        item_cache["shops"] = shops_result
        item_cache["total_items"] = len(all_items_flat)
        item_cache["last_updated"] = time.time()
        item_cache["is_initialized"] = True

        print(f"\n[READY] Cached {item_cache['total_items']} items from {len(shops_result)} shops")
        print(f"[TIME] Cache refresh took {round((time.time()-start)*1000,2)}ms")
        
        return shops_result
        
    except Exception as e:
        print(f"❌ ERROR refreshing cache: {e}")
        item_cache["is_initialized"] = False
        return []

def initialize_cache():
    """Initialize cache before first request"""
    print("[INIT] Preloading item cache from Firebase...")
    refresh_item_cache()
    
    # Set up listener for ALL items
    print("[INIT] Setting up Firestore listeners...")
    try:
        db.collection_group("items").on_snapshot(on_item_change)
        print("[READY] Listeners active - cache will update on any item changes")
    except Exception as e:
        print(f"⚠️ Could not set up listeners: {e}")
        # Set up a periodic refresh as fallback
        def periodic_refresh():
            while True:
                time.sleep(300)  # Refresh every 5 minutes
                print("[PERIODIC] Refreshing cache...")
                refresh_item_cache()
        
        thread = threading.Thread(target=periodic_refresh, daemon=True)
        thread.start()
        print("[FALLBACK] Periodic cache refresh started (every 5 minutes)")

def on_item_change(col_snapshot, changes, read_time):
    """Listener for ANY item changes - refreshes cache"""
    print("[LISTENER] Items changed in Firebase → refreshing cache")
    refresh_item_cache()

# ======================================================
# PLANS CONFIG
# ======================================================
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
# BEFORE FIRST REQUEST - GUARANTEES CACHE IS READY
# ======================================================
@app.before_first_request
def before_first_request():
    """Initialize cache before handling any requests"""
    print("[GUARD] Before first request - ensuring cache is initialized")
    if not item_cache["is_initialized"]:
        initialize_cache()
    else:
        print("[GUARD] Cache already initialized")

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
    # Calculate annual discounts
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

@app.route("/admin")
def admin():
    return render_template("admindashboard.html")

# ======================================================
# UPDATED OPTIMIZATION ROUTE - NOW USING CACHE FROM FIREBASE
# ======================================================
@app.route("/item-optimization", methods=["GET"])
def item_optimization():
    """
    OPTIMIZATION ROUTE - Now gets data directly from Firebase cache
    No vectorization involved, just item metadata for optimization
    """
    try:
        # Check if cache is initialized
        if not item_cache["is_initialized"]:
            return jsonify({
                "status": "error",
                "message": "Cache not initialized yet",
                "retry": True
            }), 503  # Service Unavailable
        
        # Get query parameters for filtering
        shop_id = request.args.get("shop_id")
        category_id = request.args.get("category_id")
        min_stock = request.args.get("min_stock", type=float)
        max_stock = request.args.get("max_stock", type=float)
        
        # Start with all items from cache
        items_to_optimize = item_cache["items"]
        
        # Apply filters if provided
        if shop_id:
            items_to_optimize = [i for i in items_to_optimize if i["shop_id"] == shop_id]
        
        if category_id:
            items_to_optimize = [i for i in items_to_optimize if i["category_id"] == category_id]
        
        if min_stock is not None:
            items_to_optimize = [i for i in items_to_optimize if i["stock"] >= min_stock]
        
        if max_stock is not None:
            items_to_optimize = [i for i in items_to_optimize if i["stock"] <= max_stock]
        
        # Calculate statistics
        total_items = len(items_to_optimize)
        total_stock_value = sum(i["stock"] * i["buy_price"] for i in items_to_optimize)
        avg_price = sum(i["sell_price"] for i in items_to_optimize) / total_items if total_items > 0 else 0
        
        # Items that need optimization (low stock, expiring soon, etc.)
        needs_attention = []
        for item in items_to_optimize:
            issues = []
            
            # Check stock level
            if item["stock"] < 10:
                issues.append({"type": "low_stock", "message": f"Low stock: {item['stock']} units"})
            
            # Check for expiring batches
            if item.get("batches"):
                for batch in item["batches"]:
                    if batch.get("expiry_date"):
                        # Check if expiring in next 30 days
                        try:
                            expiry = datetime.strptime(batch["expiry_date"], "%Y-%m-%d")
                            days_to_expiry = (expiry - datetime.now()).days
                            if 0 < days_to_expiry < 30:
                                issues.append({
                                    "type": "expiring_soon", 
                                    "message": f"Batch '{batch['batch_name']}' expires in {days_to_expiry} days"
                                })
                        except:
                            pass
            
            if issues:
                needs_attention.append({
                    "item": item,
                    "issues": issues
                })
        
        # Group by shop for organization
        shops_optimization = []
        for shop in item_cache["shops"]:
            if shop_id and shop["shop_id"] != shop_id:
                continue
                
            shop_items = []
            for category in shop["categories"]:
                for item in category["items"]:
                    if item in items_to_optimize:
                        shop_items.append(item)
            
            if shop_items:
                shops_optimization.append({
                    "shop_id": shop["shop_id"],
                    "shop_name": shop["shop_name"],
                    "items": shop_items,
                    "item_count": len(shop_items)
                })
        
        return jsonify({
            "status": "success",
            "source": "firebase_cache",  # Indicates we're using cache, not vectorization
            "last_cache_update": item_cache["last_updated"],
            "filters_applied": {
                "shop_id": shop_id,
                "category_id": category_id,
                "min_stock": min_stock,
                "max_stock": max_stock
            },
            "statistics": {
                "total_items": total_items,
                "total_stock_value": round(total_stock_value, 2),
                "average_sell_price": round(avg_price, 2),
                "items_needing_attention": len(needs_attention)
            },
            "items_needing_attention": needs_attention[:10],  # Top 10 issues
            "shops": shops_optimization,
            "all_items": items_to_optimize  # All filtered items for full optimization
        })
        
    except Exception as e:
        print(f"🔥 item-optimization error: {e}")
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

# ======================================================
# CACHE STATUS ENDPOINT
# ======================================================
@app.route("/cache-status", methods=["GET"])
def cache_status():
    """Check the current cache status"""
    return jsonify({
        "cache_initialized": item_cache["is_initialized"],
        "total_items": item_cache["total_items"],
        "total_shops": len(item_cache["shops"]),
        "last_updated": item_cache["last_updated"],
        "cache_age_seconds": time.time() - item_cache["last_updated"] if item_cache["last_updated"] else None,
        "source": "firebase_direct"
    })

# ======================================================
# FORCE CACHE REFRESH
# ======================================================
@app.route("/refresh-cache", methods=["POST"])
def refresh_cache():
    """Manually trigger a cache refresh"""
    try:
        refresh_item_cache()
        return jsonify({
            "success": True,
            "message": "Cache refreshed successfully",
            "total_items": item_cache["total_items"],
            "last_updated": item_cache["last_updated"]
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

# ======================================================
# SEARCH ITEMS (NEW - TEXT-BASED SEARCH)
# ======================================================
@app.route("/search-items", methods=["GET"])
def search_items():
    """Simple text-based item search (replaces vector search)"""
    try:
        # Check if cache is initialized
        if not item_cache["is_initialized"]:
            return jsonify({
                "items": [],
                "count": 0,
                "error": "Cache not initialized"
            }), 503
        
        query = request.args.get("q", "").lower().strip()
        shop_id = request.args.get("shop_id")
        limit = request.args.get("limit", 20, type=int)
        
        if not query:
            return jsonify({"items": [], "count": 0})
        
        results = []
        
        for item in item_cache["items"]:
            # Skip if shop_id provided and doesn't match
            if shop_id and item["shop_id"] != shop_id:
                continue
            
            # Simple text matching
            name_match = query in item["name"].lower()
            desc_match = query in item["description"].lower() if item.get("description") else False
            sku_match = query in item["sku"].lower() if item.get("sku") else False
            brand_match = query in item["brand"].lower() if item.get("brand") else False
            tag_match = any(query in tag.lower() for tag in item.get("tags", []))
            
            if name_match or desc_match or sku_match or brand_match or tag_match:
                # Calculate simple relevance score
                score = 0
                if name_match:
                    score += 100
                    if item["name"].lower().startswith(query):
                        score += 50
                if sku_match:
                    score += 80
                if brand_match:
                    score += 60
                if tag_match:
                    score += 40
                if desc_match:
                    score += 30
                
                results.append({
                    "item": item,
                    "relevance_score": score,
                    "match_type": "name" if name_match else "other"
                })
        
        # Sort by relevance score
        results.sort(key=lambda x: x["relevance_score"], reverse=True)
        
        return jsonify({
            "items": [r["item"] for r in results[:limit]],
            "total_found": len(results),
            "returned": min(len(results), limit),
            "query": query,
            "shop_id": shop_id
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ======================================================
# COMPLETE SALE (KEPT FROM ORIGINAL)
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

            # Conversion logic
            if item_type == "selling_unit":
                base_qty = quantity / conversion_factor
                print(f"   Selling unit: {quantity} units ÷ {conversion_factor} = {base_qty} base units")
            else:
                base_qty = quantity
                print(f"   Main item: {quantity} base units")

            if batch_qty < base_qty:
                return jsonify({
                    "success": False,
                    "error": f"Insufficient stock in batch {batch_id}. Available: {batch_qty} base units, requested: {base_qty} base units"
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

            # Refresh cache after sale
            refresh_item_cache()

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
# ENSURE PLAN (KEPT FROM ORIGINAL)
# ======================================================
@app.route("/ensure-plan", methods=["POST"])
def ensure_plan():
    """
    Ensure a default plan exists for a given shop.
    Creates a 'Solo' plan only if none exists.
    """
    try:
        data = request.get_json(silent=True) or {}
        shop_id = data.get("shop_id")

        if not shop_id:
            return jsonify({
                "success": False,
                "error": "shop_id is required"
            }), 400

        plan_ref = (
            db.collection("Shops")
              .document(shop_id)
              .collection("plan")
              .document("default")
        )

        if plan_ref.get().exists:
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
        return jsonify({
            "success": False,
            "error": "Internal server error"
        }), 500

# ======================================================
# RUN SERVER - This still runs in development, but on Render,
# gunicorn will use the app object and before_first_request
# ======================================================
if __name__ == "__main__":
    # This runs in development only
    print("[DEV] Running in development mode...")
    initialize_cache()  # Initialize immediately in dev
    app.run(debug=True)
else:
    # This runs in production (gunicorn)
    print("[PROD] Running in production mode - cache will initialize on first request")
    # Don't initialize here - let before_first_request handle it
    pass
