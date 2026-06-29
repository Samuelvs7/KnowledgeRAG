from supabase import Client, create_client
from supabase.lib.client_options import SyncClientOptions

from config import settings

client_options = SyncClientOptions(
    auto_refresh_token=False,
    persist_session=False,
    postgrest_client_timeout=settings.supabase_timeout_seconds,
    storage_client_timeout=int(settings.storage_timeout_seconds),
    function_client_timeout=int(settings.supabase_timeout_seconds),
)

service_supabase: Client = create_client(
    settings.supabase_url,
    settings.supabase_service_role_key,
    options=client_options,
)

# Compatibility alias for the product pipeline while it migrates to the shared client.
supabase = service_supabase
