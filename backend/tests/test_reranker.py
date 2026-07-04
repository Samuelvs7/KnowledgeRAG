from unittest.mock import patch
from services.reranker import rerank_matches

class MockEncoder:
    def predict(self, pairs):
        # We know pairs[0] is 'high-sim' and pairs[1] is 'relevant' based on the input list
        # Simulate cross-encoder giving high score to the second pair
        return [0.1, 0.9]

@patch("services.reranker.get_cross_encoder")
def test_rerank_matches_with_cross_encoder(mock_get):
    mock_get.return_value = MockEncoder()
    
    matches = [
        {"id": "high-sim", "content": "general company handbook", "similarity": 0.9},
        {"id": "relevant", "content": "vacation policy accrual details", "similarity": 0.6},
    ]

    ranked = rerank_matches(matches, "vacation policy accrual")

    assert ranked[0]["id"] == "relevant"
    assert ranked[0]["rerank_score"] == 0.9
    assert ranked[1]["rerank_score"] == 0.1

@patch("services.reranker.get_cross_encoder")
def test_rerank_matches_preserves_order_fallback(mock_get):
    # If mock encoder is "mock" (e.g. failed import fallback)
    mock_get.return_value = "mock"
    matches = [{"id": "first", "similarity": 0.5}, {"id": "second", "similarity": 0.5}]

    ranked = rerank_matches(matches, "to be or not")
    assert ranked[0]["id"] == "first"
    assert ranked[1]["id"] == "second"
