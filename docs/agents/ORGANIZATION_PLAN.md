# FolderRocket organization status

The functional grouping is implemented on reorganization-project. See [actual structure and move ledger](../architecture/REPOSITORY_STRUCTURE.md) and the [execution plan](../plans/repository-grouping-2026-11-11.md) for validation and remaining limits.

The root src/backend/desktop boundaries and public contracts are preserved. App.tsx and server.js remain composition entrypoints; runtimePaths, windowsTask and pipeErrorGuards remain at backend/services root. No extraction of route handlers, IPC or world lifecycle is part of this folder-only refactor.

Frontend owns UI/domain modules, Backend owns services/runtime/Electron, and the coordinator owns tests/docs/tooling and integration. Reviewer checks the final diff read-only. Future moves need source-backed cohesion and all consumer updates in the same block.
