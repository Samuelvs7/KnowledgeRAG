from types import SimpleNamespace

from services.llm import _event_text, _response_text, _usage_value


def test_response_text_reads_text_property():
    response = SimpleNamespace(text="grounded answer")

    assert _response_text(response) == "grounded answer"


def test_response_text_falls_back_to_candidate_parts():
    response = SimpleNamespace(
        candidates=[
            SimpleNamespace(
                content=SimpleNamespace(
                    parts=[
                        SimpleNamespace(text="part one "),
                        SimpleNamespace(text="part two"),
                    ]
                )
            )
        ]
    )

    assert _response_text(response) == "part one part two"


def test_event_text_reads_stream_chunk_text():
    event = SimpleNamespace(text="streamed")

    assert _event_text(event) == "streamed"


def test_usage_value_supports_objects_and_dicts():
    assert _usage_value(SimpleNamespace(prompt_token_count=12), "prompt_token_count") == 12
    assert _usage_value({"input_tokens": 9}, "prompt_token_count", "input_tokens") == 9
