import pytest
from services.memory import ConversationService, MemoryService

def test_conversation_alias():
    assert MemoryService == ConversationService
