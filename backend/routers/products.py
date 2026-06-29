from fastapi import APIRouter, Depends, HTTPException

from auth import AuthenticatedUser, get_current_user
from models.schemas import Diagnostics, QueryRequest, QueryResponse
from services.product_agent import run_inventory_agent


router = APIRouter(prefix="/api/products", tags=["products"])


@router.post("/query", response_model=QueryResponse)
async def query_products(
    req: QueryRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    try:
        result = run_inventory_agent(req.query, user.id)
        return QueryResponse(
            answer=result["answer"],
            diagnostics=Diagnostics(**result["diagnostics"]),
        )
    except Exception as exc:
        print(f"Error querying products: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))
