from services.reranker import rerank_matches


def test_rerank_matches_balances_similarity_with_keyword_overlap():
    matches = [
        {"id": "high-sim", "content": "general company handbook", "similarity": 0.9},
        {"id": "relevant", "content": "vacation policy accrual details", "similarity": 0.6},
    ]

    ranked = rerank_matches(matches, "vacation policy accrual")

    assert ranked[0]["id"] == "relevant"
    assert ranked[0]["rerank_score"] > ranked[1]["rerank_score"]


def test_rerank_matches_preserves_order_when_query_has_no_terms():
    matches = [{"id": "first"}, {"id": "second"}]

    assert rerank_matches(matches, "to be or not") == matches
