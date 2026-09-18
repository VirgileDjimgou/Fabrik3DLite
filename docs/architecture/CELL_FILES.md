# Cell files, persistence, and extension boundaries

Cell configurations are portable, versioned JSON documents that are deterministic and reviewable in Git. They can be imported/exported locally and persisted as named templates through the orchestrator.

## Versioned cell file schema

- **Current schema `1.0`** (`src/cell-files/schema.ts`): `{ schemaVersion, id, name, worldFrameId, equipment[] }`, where each equipment entry has `id`, `definitionId`, and a `transform` (`position`/`rotation` as `{x,y,z}` objects in meters/radians, world frame X right, Y up, Z forward).
- **Initial schema `0.9`** (legacy): supported for migration. It wrapped the id/name in a `cell` object and used `type` + array transforms.
- Supported versions are `0.9` and `1.0`; the server and client both reject anything else with a human-readable diagnostic.

## Import / export / validation / migration

- `src/cell-files/importExport.ts` serializes deterministically (fixed key order, no timestamps) and parses with migration + validation.
- `src/cell-files/migration.ts` converts `0.9 → 1.0` predictably (`type` → `definitionId`, arrays → objects, `cell` wrapper flattened).
- `src/cell-files/validation.ts` reports human-readable diagnostics for missing ids/names, duplicate equipment ids, non-finite transforms, and unknown definition references (warnings).
- The cell editor exposes Load sample, Import, Export, Validate, and Save actions. `?view=cell-editor` provides a WebGL-free harness for deterministic e2e flows.

## Sample cells

`src/cell-files/sampleCells.ts` ships deterministic samples for the compact, medium, and heavy robots (`SAMPLE_CELL_JSON`), sharing the reference single-conveyor layout so the only difference is the robot profile.

## Persistence through the orchestrator

Named cell templates are stored via `GET/POST/PUT/DELETE /api/cell-templates`. Content is validated (JSON + supported schema version) and stored verbatim. An authorization placeholder (`X-Operator-Id` header, gated by `Orchestration:RequireCellTemplateAuth`, default off) marks where real identity will plug in. Cell writes also carry the standard `X-Correlation-Id`.

## Module/package boundaries

- `src/cell-files/` — pure data: schema, migration, validation, import/export, samples. No Vue or Three.js dependencies.
- `src/editor/` — editor model and 2D plan view (depends on the equipment SDK, robot catalog, and cell-files).
- `src/equipment/` — equipment SDK (definitions, instances, transforms, registry).
- `src/robot/catalog/` and `src/safety/` — robot profiles and motion safety.
- Backend `CellTemplateService` / `CellTemplateRepository` — persistence boundary.

These boundaries exist so teams can extend equipment without converting cell files into dynamic untrusted plugins. **Cell files never execute code.**

## Adding a catalog entry: test checklist

When adding a new equipment definition or robot profile:

1. **Definition**
   - Add the `EditorCatalogEntry` in `src/editor/catalog.ts` (kind, definitionId, label, plan-view width/depth, robot reach) and/or the equipment definition in the SDK fixtures.
2. **Schema conformance**
   - Extend `src/cell-files/importExport.test.ts` with a round-trip test proving transforms and identifiers survive serialize → parse.
   - Add a sample (or extend an existing sample) and assert `validateCellFile(sample, knownDefinitionIds)` returns no errors.
3. **Validation**
   - Add a malformed case (missing definitionId / non-finite transform / unknown reference) asserting a human-readable diagnostic.
4. **Migration**
   - If the change affects the legacy `type` mapping, extend `src/cell-files/migration.test.ts` (0.9 → 1.0) accordingly.
5. **Editor**
   - Extend `CellEditor.test.ts` / `EditorCatalogPanel.test.ts` so the new entry can be inserted, selected, moved, and removed.
6. **Backend (optional, only when persistence shape changes)**
   - Extend `CellTemplateServiceTests` / `CellFileContentValidatorTests` and the contracts snapshot (`npm run contracts:generate`).
7. **Regression**
   - Run the baseline gates (client type-check/test/build, HMI, `dotnet build/test`) plus the Playwright cell-editor and cell-persistence flows.

## Non-goals

No arbitrary code loading from cell files; no collaborative multi-user editing yet.