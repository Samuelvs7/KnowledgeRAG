from fastapi import APIRouter, HTTPException

from models.schemas import Diagnostics, QueryRequest, QueryResponse
from services.product_agent import run_inventory_agent


router = APIRouter(prefix="/api/products", tags=["products"])


@router.post("/query", response_model=QueryResponse)
async def query_products(req: QueryRequest):
    try:
        result = run_inventory_agent(req.query, req.user_id)
        return QueryResponse(
            answer=result["answer"],
            diagnostics=Diagnostics(**result["diagnostics"]),
        )
    except Exception as exc:
        print(f"Error querying products: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))
