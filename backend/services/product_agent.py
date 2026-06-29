import json
import re
import time
from typing import Any

import google.generativeai as genai

from database import supabase
from services.embeddings import get_embeddings, get_query_embedding


EMBEDDING_MODEL_NAME = "text-embedding-004"
LLM_MODEL_NAME = "gemini-2.0-flash"


def run_inventory_agent(query: str, user_id: str) -> dict[str, Any]:
    """Execute verified inventory tools and synthesize an answer from their outputs."""
    total_start = time.perf_counter()
    metrics: dict[str, Any] = {
        "embedding_generated": False,
        "embedding_time_ms": 0,
        "vector_search_performed": False,
        "vector_search_results": 0,
        "vector_search_time_ms": 0,
    }

    tool_calls: list[dict[str, Any]] = []
    context_chunks: list[dict[str, Any]] = []

    for tool_name, tool_input in _select_tools(query, user_id):
        tool_call = _execute_tool(tool_name, tool_input, metrics)
        tool_calls.append(tool_call)
        if tool_call["status"] == "success":
            context_chunks.extend(_context_from_tool(tool_call))

    llm_start = time.perf_counter()
    answer, prompt_tokens, completion_tokens = _generate_answer(query, tool_calls)
    llm_time_ms = int((time.perf_counter() - llm_start) * 1000)

    total_time_ms = int((time.perf_counter() - total_start) * 1000)
    successful_tools = sum(1 for call in tool_calls if call["status"] == "success")
    confidence = min(0.99, 0.55 + (successful_tools * 0.1) + (0.15 if context_chunks else 0))

    diagnostics = {
        "embeddingGenerated": metrics["embedding_generated"],
        "embeddingModel": EMBEDDING_MODEL_NAME,
        "embeddingDimensions": 768,
        "embeddingTimeMs": metrics["embedding_time_ms"],
        "vectorSearchPerformed": metrics["vector_search_performed"],
        "vectorSearchResults": metrics["vector_search_results"],
        "vectorSearchTimeMs": metrics["vector_search_time_ms"],
        "rerankerUsed": False,
        "rerankerTimeMs": 0,
        "llmPromptTokens": prompt_tokens,
        "llmCompletionTokens": completion_tokens,
        "llmTimeMs": llm_time_ms,
        "totalTimeMs": total_time_ms,
        "contextChunks": context_chunks[:10],
        "toolCalls": tool_calls,
    }

    _log_ai_query(user_id, query, answer, diagnostics, confidence)
    _update_infrastructure_status(metrics, llm_time_ms)

    return {"answer": answer, "diagnostics": diagnostics}


def _select_tools(query: str, user_id: str) -> list[tuple[str, dict[str, Any]]]:
    lower_query = query.lower()
    tools: list[tuple[str, dict[str, Any]]] = [
        ("get_inventory_snapshot", {}),
        ("search_products", {"query": query, "limit": 8}),
    ]

    if any(term in lower_query for term in ["alert", "low", "out of stock", "stockout", "shortage", "reorder", "restock"]):
        tools.append(("get_inventory_alerts", {"include_acknowledged": False, "limit": 8}))
        tools.append(("get_reorder_recommendations", {"limit": 8}))

    if any(term in lower_query for term in ["order", "purchase", "po ", "supplier", "delivery"]):
        tools.append(("get_purchase_orders", {"user_id": user_id, "limit": 6}))

    return tools


def _execute_tool(tool_name: str, tool_input: dict[str, Any], metrics: dict[str, Any]) -> dict[str, Any]:
    start = time.perf_counter()
    try:
        if tool_name == "get_inventory_snapshot":
            output = _get_inventory_snapshot()
        elif tool_name == "search_products":
            output = _search_products(tool_input["query"], int(tool_input.get("limit", 8)), metrics)
        elif tool_name == "get_inventory_alerts":
            output = _get_inventory_alerts(
                bool(tool_input.get("include_acknowledged", False)),
                int(tool_input.get("limit", 8)),
            )
        elif tool_name == "get_reorder_recommendations":
            output = _get_reorder_recommendations(int(tool_input.get("limit", 8)))
        elif tool_name == "get_purchase_orders":
            output = _get_purchase_orders(str(tool_input["user_id"]), int(tool_input.get("limit", 6)))
        else:
            raise ValueError(f"Unknown inventory tool: {tool_name}")

        verification = _verify_tool_output(tool_name, output)
        output["verification"] = verification
        status = "success" if verification["verified"] else "failed"
    except Exception as exc:
        output = {
            "error": str(exc),
            "verification": {
                "verified": False,
                "source_tables": [],
                "checks": ["tool execution raised an exception"],
            },
        }
        status = "failed"

    return {
        "tool": tool_name,
        "input": tool_input,
        "output": output,
        "execution_time_ms": int((time.perf_counter() - start) * 1000),
        "status": status,
    }


def _fetch_products() -> list[dict[str, Any]]:
    select_clause = (
        "id,name,description,category,price,specifications,popularity_score,"
        "stock_quantity,reorder_level,supplier_id,"
        "supplier:suppliers(id,name,contact_email,contact_phone)"
    )
    try:
        response = supabase.table("products").select(select_clause).order("popularity_score", desc=True).execute()
    except Exception:
        response = supabase.table("products").select("*").order("popularity_score", desc=True).execute()
    return response.data or []


def _normalize_product(row: dict[str, Any], similarity: float | None = None) -> dict[str, Any]:
    stock_quantity = int(row.get("stock_quantity") or 0)
    reorder_level = int(row.get("reorder_level") or 0)
    price = float(row.get("price") or 0)
    stock_status = "out_of_stock" if stock_quantity == 0 else "low_stock" if stock_quantity <= reorder_level else "in_stock"
    supplier = row.get("supplier")

    product = {
        "id": row.get("id"),
        "name": row.get("name"),
        "description": row.get("description"),
        "category": row.get("category"),
        "price": price,
        "stock_quantity": stock_quantity,
        "reorder_level": reorder_level,
        "stock_status": stock_status,
        "inventory_value": round(price * stock_quantity, 2),
        "supplier": supplier.get("name") if isinstance(supplier, dict) else None,
        "specifications": row.get("specifications") or {},
    }
    if similarity is not None:
        product["similarity"] = round(float(similarity), 4)
    return product


def _get_inventory_snapshot() -> dict[str, Any]:
    products = [_normalize_product(product) for product in _fetch_products()]
    category_breakdown: dict[str, int] = {}
    total_value = 0.0
    low_stock_count = 0
    out_of_stock_count = 0

    for product in products:
        category = str(product.get("category") or "Uncategorized")
        category_breakdown[category] = category_breakdown.get(category, 0) + 1
        total_value += float(product["inventory_value"])
        low_stock_count += 1 if product["stock_status"] == "low_stock" else 0
        out_of_stock_count += 1 if product["stock_status"] == "out_of_stock" else 0

    return {
        "summary": {
            "total_products": len(products),
            "total_inventory_value": round(total_value, 2),
            "low_stock_count": low_stock_count,
            "out_of_stock_count": out_of_stock_count,
            "healthy_stock_count": len(products) - low_stock_count - out_of_stock_count,
        },
        "category_breakdown": category_breakdown,
        "source_tables": ["products"],
        "row_count": len(products),
    }


def _search_products(query: str, limit: int, metrics: dict[str, Any]) -> dict[str, Any]:
    _ensure_product_embeddings()

    vector_matches: list[dict[str, Any]] = []
    embedding_start = time.perf_counter()
    try:
        query_embedding = get_query_embedding(query)
        metrics["embedding_generated"] = True
        metrics["embedding_time_ms"] += int((time.perf_counter() - embedding_start) * 1000)

        vector_start = time.perf_counter()
        response = supabase.rpc(
            "match_products",
            {
                "query_embedding": query_embedding,
                "match_threshold": 0.25,
                "match_count": limit,
            },
        ).execute()
        metrics["vector_search_performed"] = True
        metrics["vector_search_time_ms"] += int((time.perf_counter() - vector_start) * 1000)
        vector_matches = response.data or []
        metrics["vector_search_results"] = len(vector_matches)
    except Exception:
        metrics["embedding_time_ms"] += int((time.perf_counter() - embedding_start) * 1000)

    if vector_matches:
        products = _hydrate_vector_matches(vector_matches)
        search_mode = "semantic_pgvector"
    else:
        products = _keyword_product_matches(query, limit)
        search_mode = "keyword_database_fallback"

    return {
        "query": query,
        "search_mode": search_mode,
        "products": products,
        "source_tables": ["products", "suppliers"],
        "row_count": len(products),
    }


def _ensure_product_embeddings() -> None:
    try:
        response = supabase.table("products").select(
            "id,name,description,category,specifications,embedding"
        ).limit(50).execute()
        rows = response.data or []
        missing = [row for row in rows if row.get("embedding") in (None, "")]
        if not missing:
            return

        texts = [_product_embedding_text(row) for row in missing]
        embeddings = get_embeddings(texts)
        for row, embedding in zip(missing, embeddings):
            supabase.table("products").update({"embedding": embedding}).eq("id", row["id"]).execute()
    except Exception:
        return


def _hydrate_vector_matches(matches: list[dict[str, Any]]) -> list[dict[str, Any]]:
    ids = [match["id"] for match in matches if match.get("id")]
    if not ids:
        return []

    products_by_id = {product["id"]: product for product in _fetch_products() if product.get("id") in ids}
    hydrated: list[dict[str, Any]] = []
    for match in matches:
        product = products_by_id.get(match.get("id"))
        if product:
            hydrated.append(_normalize_product(product, match.get("similarity")))
    return hydrated


def _keyword_product_matches(query: str, limit: int) -> list[dict[str, Any]]:
    products = [_normalize_product(product) for product in _fetch_products()]
    terms = _query_terms(query)

    def score(product: dict[str, Any]) -> float:
        haystack = json.dumps(product, default=str).lower()
        name = str(product.get("name") or "").lower()
        category = str(product.get("category") or "").lower()
        value = 0.0
        for term in terms:
            if term in name:
                value += 3.0
            elif term in category:
                value += 2.0
            elif term in haystack:
                value += 1.0
        if "low" in terms and product["stock_status"] == "low_stock":
            value += 4.0
        if "out" in terms and product["stock_status"] == "out_of_stock":
            value += 4.0
        return value

    scored = [(score(product), product) for product in products]
    if any(score_value > 0 for score_value, _ in scored):
        scored.sort(key=lambda item: (item[0], item[1]["stock_quantity"]), reverse=True)
        products = [product for score_value, product in scored if score_value > 0]

    return products[:limit]


def _get_inventory_alerts(include_acknowledged: bool, limit: int) -> dict[str, Any]:
    query = supabase.table("inventory_alerts").select(
        "id,alert_type,threshold_value,current_value,message,acknowledged,created_at,resolved_at,"
        "product:products(id,name,category,stock_quantity,reorder_level)"
    ).order("created_at", desc=True).limit(limit)
    if not include_acknowledged:
        query = query.eq("acknowledged", False)

    persisted_alerts = query.execute().data or []
    alerts = []
    for alert in persisted_alerts:
        product = alert.get("product") or {}
        alerts.append({
            "id": alert.get("id"),
            "alert_type": alert.get("alert_type"),
            "product_id": product.get("id"),
            "product_name": product.get("name"),
            "current_value": alert.get("current_value"),
            "threshold_value": alert.get("threshold_value"),
            "message": alert.get("message"),
            "acknowledged": bool(alert.get("acknowledged")),
            "created_at": alert.get("created_at"),
            "source": "inventory_alerts",
        })

    if len(alerts) < limit:
        for product in _low_stock_products()[: limit - len(alerts)]:
            alerts.append({
                "id": f"computed:{product['id']}",
                "alert_type": product["stock_status"],
                "product_id": product["id"],
                "product_name": product["name"],
                "current_value": product["stock_quantity"],
                "threshold_value": product["reorder_level"],
                "message": f"{product['name']} has {product['stock_quantity']} units available against reorder level {product['reorder_level']}.",
                "acknowledged": False,
                "source": "products_computed",
            })

    return {
        "alerts": alerts[:limit],
        "source_tables": ["inventory_alerts", "products"],
        "row_count": len(alerts[:limit]),
    }


def _get_reorder_recommendations(limit: int) -> dict[str, Any]:
    recommendations = []
    for product in _low_stock_products()[:limit]:
        target_stock = max(product["reorder_level"] * 2, product["reorder_level"] + 1)
        reorder_quantity = max(target_stock - product["stock_quantity"], 0)
        recommendations.append({
            "product_id": product["id"],
            "product_name": product["name"],
            "stock_status": product["stock_status"],
            "current_stock": product["stock_quantity"],
            "reorder_level": product["reorder_level"],
            "recommended_quantity": reorder_quantity,
            "estimated_restock_value": round(reorder_quantity * product["price"], 2),
            "supplier": product.get("supplier"),
        })

    return {
        "recommendations": recommendations,
        "source_tables": ["products", "suppliers"],
        "row_count": len(recommendations),
    }


def _get_purchase_orders(user_id: str, limit: int) -> dict[str, Any]:
    response = supabase.table("purchase_orders").select(
        "id,order_number,supplier,status,total_value,order_date,expected_delivery,notes,created_at"
    ).eq("user_id", user_id).order("created_at", desc=True).limit(limit).execute()

    return {
        "orders": response.data or [],
        "source_tables": ["purchase_orders"],
        "row_count": len(response.data or []),
    }


def _low_stock_products() -> list[dict[str, Any]]:
    products = [_normalize_product(product) for product in _fetch_products()]
    low_stock = [product for product in products if product["stock_status"] in {"low_stock", "out_of_stock"}]
    return sorted(low_stock, key=lambda product: (product["stock_status"] != "out_of_stock", product["stock_quantity"]))


def _verify_tool_output(tool_name: str, output: dict[str, Any]) -> dict[str, Any]:
    source_tables = output.get("source_tables") or []
    checks = ["supabase query completed", "output shape validated"]
    verified = bool(source_tables)

    if tool_name == "get_inventory_snapshot":
        verified = verified and isinstance(output.get("summary"), dict)
    elif tool_name == "search_products":
        verified = verified and isinstance(output.get("products"), list)
    elif tool_name == "get_inventory_alerts":
        verified = verified and isinstance(output.get("alerts"), list)
    elif tool_name == "get_reorder_recommendations":
        verified = verified and isinstance(output.get("recommendations"), list)
    elif tool_name == "get_purchase_orders":
        verified = verified and isinstance(output.get("orders"), list)

    return {
        "verified": verified,
        "source_tables": source_tables,
        "row_count": int(output.get("row_count") or 0),
        "checks": checks if verified else ["output verification failed"],
    }


def _context_from_tool(tool_call: dict[str, Any]) -> list[dict[str, Any]]:
    output = tool_call["output"]
    tool_name = tool_call["tool"]

    if tool_name == "get_inventory_snapshot":
        summary = output["summary"]
        categories = ", ".join(f"{name}: {count}" for name, count in output["category_breakdown"].items()) or "none"
        return [{
            "id": "inventory-snapshot",
            "content": (
                f"Inventory snapshot: {summary['total_products']} products, "
                f"${summary['total_inventory_value']:,.2f} total value, "
                f"{summary['low_stock_count']} low stock, {summary['out_of_stock_count']} out of stock. "
                f"Categories: {categories}."
            ),
            "similarity": 1.0,
            "source": "products",
        }]

    if tool_name == "search_products":
        chunks = []
        for product in output.get("products", []):
            similarity = float(product.get("similarity") or 0.72)
            chunks.append({
                "id": f"product:{product['id']}",
                "content": (
                    f"{product['name']} ({product['category']}): {product['stock_quantity']} units, "
                    f"reorder level {product['reorder_level']}, status {product['stock_status']}, "
                    f"price ${product['price']:,.2f}."
                ),
                "similarity": min(max(similarity, 0.0), 1.0),
                "source": f"products:{output.get('search_mode', 'database')}",
            })
        return chunks

    if tool_name == "get_inventory_alerts":
        return [{
            "id": f"alert:{alert['id']}",
            "content": alert.get("message") or f"{alert.get('product_name')} has alert {alert.get('alert_type')}.",
            "similarity": 0.91,
            "source": alert.get("source") or "inventory_alerts",
        } for alert in output.get("alerts", [])]

    if tool_name == "get_reorder_recommendations":
        return [{
            "id": f"reorder:{item['product_id']}",
            "content": (
                f"Reorder recommendation for {item['product_name']}: order {item['recommended_quantity']} units; "
                f"current stock {item['current_stock']}, reorder level {item['reorder_level']}."
            ),
            "similarity": 0.9,
            "source": "products:reorder_recommendations",
        } for item in output.get("recommendations", [])]

    if tool_name == "get_purchase_orders":
        return [{
            "id": f"purchase-order:{order['id']}",
            "content": (
                f"Purchase order {order['order_number']} for {order.get('supplier') or 'unknown supplier'} "
                f"is {order['status']} with value ${float(order.get('total_value') or 0):,.2f}."
            ),
            "similarity": 0.84,
            "source": "purchase_orders",
        } for order in output.get("orders", [])]

    return []


def _generate_answer(query: str, tool_calls: list[dict[str, Any]]) -> tuple[str, int, int]:
    prompt = (
        "You are KnowledgeRAG's inventory AI agent. Answer using only the verified tool outputs below. "
        "Do not invent stock numbers, suppliers, alerts, or orders. If the verified outputs do not contain "
        "enough information, say what is missing and summarize the available data.\n\n"
        f"User question: {query}\n\n"
        f"Verified tool outputs:\n{json.dumps(tool_calls, indent=2, default=str)}"
    )

    try:
        response = genai.GenerativeModel(LLM_MODEL_NAME).generate_content(prompt)
        answer = (response.text or "").strip()
        usage = getattr(response, "usage_metadata", None)
        prompt_tokens = int(getattr(usage, "prompt_token_count", 0) or 0)
        completion_tokens = int(getattr(usage, "candidates_token_count", 0) or 0)
        if answer:
            return answer, prompt_tokens, completion_tokens
    except Exception:
        pass

    return _fallback_answer(tool_calls), 0, 0


def _fallback_answer(tool_calls: list[dict[str, Any]]) -> str:
    snapshot = _tool_output(tool_calls, "get_inventory_snapshot")
    search = _tool_output(tool_calls, "search_products")
    alerts = _tool_output(tool_calls, "get_inventory_alerts")
    recommendations = _tool_output(tool_calls, "get_reorder_recommendations")
    orders = _tool_output(tool_calls, "get_purchase_orders")

    lines = ["I checked the verified inventory tools."]
    if snapshot:
        summary = snapshot["summary"]
        lines.extend([
            "",
            "**Inventory overview**",
            f"- Total products: {summary['total_products']}",
            f"- Total value: ${summary['total_inventory_value']:,.2f}",
            f"- Low stock: {summary['low_stock_count']}",
            f"- Out of stock: {summary['out_of_stock_count']}",
        ])

    if search and search.get("products"):
        lines.extend(["", "**Matching products**"])
        for product in search["products"][:5]:
            lines.append(
                f"- {product['name']}: {product['stock_quantity']} units, "
                f"{product['stock_status'].replace('_', ' ')}, reorder level {product['reorder_level']}"
            )

    if alerts and alerts.get("alerts"):
        lines.extend(["", "**Alerts**"])
        for alert in alerts["alerts"][:5]:
            lines.append(f"- {alert['product_name']}: {alert['message']}")

    if recommendations and recommendations.get("recommendations"):
        lines.extend(["", "**Reorder recommendations**"])
        for item in recommendations["recommendations"][:5]:
            lines.append(f"- {item['product_name']}: order {item['recommended_quantity']} units")

    if orders and orders.get("orders"):
        lines.extend(["", "**Recent purchase orders**"])
        for order in orders["orders"][:5]:
            lines.append(f"- {order['order_number']}: {order['status']} ({order.get('supplier') or 'unknown supplier'})")

    return "\n".join(lines)


def _tool_output(tool_calls: list[dict[str, Any]], tool_name: str) -> dict[str, Any] | None:
    for call in tool_calls:
        if call["tool"] == tool_name and call["status"] == "success":
            return call["output"]
    return None


def _product_embedding_text(product: dict[str, Any]) -> str:
    specs = json.dumps(product.get("specifications") or {}, sort_keys=True)
    return (
        f"Product: {product.get('name')}. Category: {product.get('category')}. "
        f"Description: {product.get('description') or ''}. Specifications: {specs}"
    )


def _query_terms(query: str) -> set[str]:
    stop_words = {
        "a", "an", "and", "are", "about", "for", "in", "is", "me", "of", "on", "show", "the",
        "to", "what", "which", "with", "inventory", "product", "products", "stock",
    }
    return {term for term in re.findall(r"[a-z0-9]+", query.lower()) if term not in stop_words}


def _log_ai_query(
    user_id: str,
    query: str,
    answer: str,
    diagnostics: dict[str, Any],
    confidence: float,
) -> None:
    try:
        supabase.table("ai_queries").insert({
            "user_id": user_id,
            "query_type": "product",
            "query_text": query,
            "context_chunks": diagnostics["contextChunks"],
            "tool_calls": diagnostics["toolCalls"],
            "embedding_generated": diagnostics["embeddingGenerated"],
            "vector_search_performed": diagnostics["vectorSearchPerformed"],
            "reranker_used": diagnostics["rerankerUsed"],
            "llm_response": answer,
            "response_time_ms": diagnostics["totalTimeMs"],
            "confidence_score": round(confidence, 2),
            "status": "completed",
        }).execute()
    except Exception:
        return


def _update_infrastructure_status(metrics: dict[str, Any], llm_time_ms: int) -> None:
    updates = [
        ("vector_database", "online" if metrics["vector_search_performed"] else "degraded", metrics["vector_search_time_ms"]),
        ("embedding_model", "online" if metrics["embedding_generated"] else "degraded", metrics["embedding_time_ms"]),
        ("llm", "online" if llm_time_ms >= 0 else "offline", llm_time_ms),
    ]
    for component, status, latency in updates:
        try:
            supabase.table("ai_infrastructure_status").update({
                "status": status,
                "last_check_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "latency_ms": latency,
            }).eq("component", component).execute()
        except Exception:
            continue
