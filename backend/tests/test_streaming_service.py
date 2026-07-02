import pytest
import asyncio
from services.streaming import StreamingService
from models.schemas import Diagnostics

@pytest.mark.asyncio
async def test_streaming_sse_format():
    event = StreamingService.format_sse("test", {"key": "value"})
    assert event == 'event: test\ndata: {"key": "value"}\n\n'

@pytest.mark.asyncio
async def test_stream_with_diagnostics():
    async def mock_gen():
        yield "hello "
        yield "world"
        
    diag = Diagnostics()
    stream = StreamingService.stream_with_diagnostics(mock_gen(), diag, "s1")
    
    events = [e async for e in stream]
    assert len(events) == 4
    assert "event: context" in events[0]
    assert "event: delta" in events[1]
    assert "event: delta" in events[2]
    assert "event: done" in events[3]
