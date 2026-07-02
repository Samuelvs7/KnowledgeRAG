import pytest
from services.plugin_manager import PluginManager
from services.agents.registry import AgentRegistry

def test_plugin_discovery():
    PluginManager.discover_plugins()
    agents = PluginManager.list_plugins()
    assert len(agents) > 0

    assert "document_rag" in [a["id"] for a in agents]
    # Scaffolds should also be discovered!
    assert "stock" in [a["id"] for a in agents]
    assert "code" in [a["id"] for a in agents]
    assert "sql" in [a["id"] for a in agents]
    assert "research" in [a["id"] for a in agents]
