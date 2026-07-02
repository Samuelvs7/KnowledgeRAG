import importlib
import logging
import pkgutil
from pathlib import Path

from services.agents.registry import AgentRegistry

logger = logging.getLogger(__name__)

class PluginManager:
    @staticmethod
    def discover_plugins(package_name: str = "services.agents") -> None:
        try:
            package = importlib.import_module(package_name)
            package_dir = Path(package.__file__).parent
            
            for _, name, _ in pkgutil.iter_modules([str(package_dir)]):
                if name not in ("base", "registry"):
                    try:
                        importlib.import_module(f"{package_name}.{name}")
                        logger.info(f"Discovered and imported plugin: {name}")
                    except Exception:
                        logger.exception(f"Failed to load plugin: {name}")
        except Exception:
            logger.exception(f"Failed to discover plugins in {package_name}")

    @staticmethod
    def enable_plugin(name: str):
        AgentRegistry.enable_agent(name)

    @staticmethod
    def disable_plugin(name: str):
        AgentRegistry.disable_agent(name)

    @staticmethod
    def list_plugins() -> list[dict]:
        return AgentRegistry.list_agents()
