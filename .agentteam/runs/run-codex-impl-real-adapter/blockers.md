# Blockers

No implementation blockers.

Real CLI execution is intentionally guarded by `AGENTTEAM_REAL_ADAPTER_ENABLED=1`; without that flag, explicit real provider requests are imported as blocked runs.
