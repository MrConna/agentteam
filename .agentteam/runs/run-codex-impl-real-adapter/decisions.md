# Decisions

- Preserve simulated adapter execution as the default path for existing API calls.
- Require an explicit request body provider for real CLI-backed execution.
- Keep real execution disabled by default unless an environment flag is set.
- Split real adapter support into small modules instead of growing `server/adapter.ts`.
- Treat dry-run and disabled real execution as blocked imports because no real diff or validation can be trusted yet.
