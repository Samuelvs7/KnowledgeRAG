import re
import time
from typing import Any


class IntentClassifier:
    """Context-aware Intent Classifier for StockQuery AI Platform."""

    GREETINGS = {
        "hi", "hello", "hey", "good morning", "good afternoon", "good evening",
        "greetings", "howdy", "sup", "yo"
    }

    PLEASANTRIES = {
        "thank you", "thanks", "thank you so much", "thx", "bye", "goodbye",
        "see you", "awesome", "great", "nice", "cool", "ok", "okay"
    }

    IDENTITY_HELP = {
        "who are you", "what are you", "what can you do", "what do you do",
        "help", "how can you help", "capabilities", "features", "your name"
    }

    FOLLOW_UP_PATTERNS = [
        r"^(how many|how much|what is|which ones|show more|tell me more|details|any more|where are|who is|can you show)\b",
        r"^(are there|is there|what about|how about|and|then|also)\b",
        r"\b(left|remaining|available|those|them|it|these|this|that|their)\b"
    ]

    INVENTORY_KEYWORDS = {
        "inventory", "product", "products", "stock", "quantity", "laptop", "laptops",
        "low stock", "out of stock", "reorder", "restock", "item", "items", "category",
        "categories", "price", "skus", "units", "count"
    }

    ANALYTICS_KEYWORDS = {
        "analytics", "report", "reports", "revenue", "sales", "metrics", "kpi",
        "dashboard", "performance", "trend", "trends", "summary", "stats", "chart"
    }

    PURCHASE_ORDER_KEYWORDS = {
        "purchase order", "purchase orders", "po", "pos", "buying", "order",
        "orders", "procurement", "purchase history"
    }

    SUPPLIER_KEYWORDS = {
        "supplier", "suppliers", "vendor", "vendors", "manufacturer", "manufacturers"
    }

    WAREHOUSE_KEYWORDS = {
        "warehouse", "warehouses", "location", "facility", "storage", "depot"
    }

    FORECAST_KEYWORDS = {
        "forecast", "forecasting", "predict", "prediction", "demand", "next month",
        "future stock", "expected"
    }

    NAVIGATION_KEYWORDS = {
        "go to", "open page", "navigate", "show screen", "open settings", "view documents"
    }

    @classmethod
    def classify(cls, query: str, history: list[dict[str, Any]] | None = None) -> dict[str, Any]:
        start = time.perf_counter()
        cleaned = query.strip().lower()
        cleaned_alpha = re.sub(r"[^\w\s]", "", cleaned)

        # 1. Exact or simple general chat checks
        if cleaned_alpha in cls.GREETINGS or any(cleaned_alpha.startswith(g + " ") for g in cls.GREETINGS if len(g) > 2):
            # Check if it's mixed with inventory intent (e.g. "Hello, show low stock products")
            if not any(k in cleaned for k in cls.INVENTORY_KEYWORDS | cls.ANALYTICS_KEYWORDS | cls.PURCHASE_ORDER_KEYWORDS | cls.SUPPLIER_KEYWORDS | cls.WAREHOUSE_KEYWORDS | cls.FORECAST_KEYWORDS):
                elapsed_ms = max(1, int((time.perf_counter() - start) * 1000))
                return {
                    "intent": "general_chat",
                    "confidence": 0.98,
                    "reason": "Greeting message",
                    "requires_retrieval": False,
                    "requires_tools": False,
                    "classification_time_ms": elapsed_ms,
                }

        if cleaned_alpha in cls.PLEASANTRIES:
            elapsed_ms = max(1, int((time.perf_counter() - start) * 1000))
            return {
                "intent": "general_chat",
                "confidence": 0.99,
                "reason": "Pleasantry or thank you message",
                "requires_retrieval": False,
                "requires_tools": False,
                "classification_time_ms": elapsed_ms,
            }

        if any(h in cleaned for h in cls.IDENTITY_HELP):
            elapsed_ms = max(1, int((time.perf_counter() - start) * 1000))
            return {
                "intent": "general_chat",
                "confidence": 0.96,
                "reason": "Identity/capabilities query",
                "requires_retrieval": False,
                "requires_tools": False,
                "classification_time_ms": elapsed_ms,
            }

        # 2. Check explicit domain keywords
        if any(k in cleaned for k in cls.FORECAST_KEYWORDS):
            elapsed_ms = max(1, int((time.perf_counter() - start) * 1000))
            return {
                "intent": "forecast_query",
                "confidence": 0.95,
                "reason": "Forecast/prediction query",
                "requires_retrieval": True,
                "requires_tools": True,
                "classification_time_ms": elapsed_ms,
            }

        if any(k in cleaned for k in cls.PURCHASE_ORDER_KEYWORDS):
            elapsed_ms = max(1, int((time.perf_counter() - start) * 1000))
            return {
                "intent": "purchase_order_query",
                "confidence": 0.95,
                "reason": "Purchase order query",
                "requires_retrieval": True,
                "requires_tools": True,
                "classification_time_ms": elapsed_ms,
            }

        if any(k in cleaned for k in cls.SUPPLIER_KEYWORDS):
            elapsed_ms = max(1, int((time.perf_counter() - start) * 1000))
            return {
                "intent": "supplier_query",
                "confidence": 0.95,
                "reason": "Supplier query",
                "requires_retrieval": True,
                "requires_tools": True,
                "classification_time_ms": elapsed_ms,
            }

        if any(k in cleaned for k in cls.WAREHOUSE_KEYWORDS):
            elapsed_ms = max(1, int((time.perf_counter() - start) * 1000))
            return {
                "intent": "warehouse_query",
                "confidence": 0.95,
                "reason": "Warehouse query",
                "requires_retrieval": True,
                "requires_tools": True,
                "classification_time_ms": elapsed_ms,
            }

        if any(k in cleaned for k in cls.ANALYTICS_KEYWORDS):
            elapsed_ms = max(1, int((time.perf_counter() - start) * 1000))
            return {
                "intent": "analytics_query",
                "confidence": 0.94,
                "reason": "Analytics query",
                "requires_retrieval": True,
                "requires_tools": True,
                "classification_time_ms": elapsed_ms,
            }

        if any(k in cleaned for k in cls.INVENTORY_KEYWORDS):
            elapsed_ms = max(1, int((time.perf_counter() - start) * 1000))
            return {
                "intent": "inventory_query",
                "confidence": 0.95,
                "reason": "Inventory/product query",
                "requires_retrieval": True,
                "requires_tools": True,
                "classification_time_ms": elapsed_ms,
            }

        if any(k in cleaned for k in cls.NAVIGATION_KEYWORDS):
            elapsed_ms = max(1, int((time.perf_counter() - start) * 1000))
            return {
                "intent": "navigation",
                "confidence": 0.90,
                "reason": "Navigation UI command",
                "requires_retrieval": False,
                "requires_tools": False,
                "classification_time_ms": elapsed_ms,
            }

        # 3. Context-aware check for ambiguous follow-up questions
        is_follow_up = any(re.search(pat, cleaned) for pat in cls.FOLLOW_UP_PATTERNS)
        if is_follow_up and history:
            # Look at previous assistant/user messages
            recent_texts = " ".join([h.get("content", "").lower() for h in history[-4:]])
            if any(k in recent_texts for k in cls.INVENTORY_KEYWORDS | cls.PURCHASE_ORDER_KEYWORDS | cls.SUPPLIER_KEYWORDS):
                elapsed_ms = max(1, int((time.perf_counter() - start) * 1000))
                return {
                    "intent": "inventory_query",
                    "confidence": 0.92,
                    "reason": "Follow-up question derived from conversation history context",
                    "requires_retrieval": True,
                    "requires_tools": True,
                    "classification_time_ms": elapsed_ms,
                }

        # Default fallback for short conversational phrases vs standard queries
        if len(cleaned.split()) <= 2 and not is_follow_up:
            elapsed_ms = max(1, int((time.perf_counter() - start) * 1000))
            return {
                "intent": "general_chat",
                "confidence": 0.85,
                "reason": "Short conversational phrase",
                "requires_retrieval": False,
                "requires_tools": False,
                "classification_time_ms": elapsed_ms,
            }

        elapsed_ms = max(1, int((time.perf_counter() - start) * 1000))
        return {
            "intent": "inventory_query",
            "confidence": 0.88,
            "reason": "Standard document or inventory query",
            "requires_retrieval": True,
            "requires_tools": True,
            "classification_time_ms": elapsed_ms,
        }
