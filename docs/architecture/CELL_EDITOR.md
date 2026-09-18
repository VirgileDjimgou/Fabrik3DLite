# Visual cell editor

The simulator includes a visual cell editor MVP for constructing and adjusting robotic cells from the equipment catalog, separate from execution mode.

## Editor mode vs execution mode

The app shell (`App.vue`) exposes an explicit `Run` / `Edit cell` toggle. Switching to edit mode unmounts the running 3D scene, so editing can never mutate an active scenario without an explicit mode transition. The editor is a top-down 2D plan view (X right, Z forward) — deterministic, WebGL-free, and separate from the 3D execution view.

## Data model

`src/editor/cellEditorModel.ts` (`CellEditorModel`) is a framework-independent editor core:

- placements (`EditorPlacement`: kind, definitionId, x/z, rotation, width/depth, robot reach),
- selection,
- grid-snapped `move`/`rotate` with numeric entry,
- `add`/`remove`/`reset` (reload the built-in template),
- snapshot-based undo/redo history,
- an explicit mode guard: mutations are rejected outside editing mode,
- `toCellDefinition()` exports an equipment-SDK `CellDefinition`.

The catalog (`src/editor/catalog.ts`) provides robot, CNC, conveyor, pallet-station, and safety-zone entries with documented plan-view bounds. Robot reach comes from the catalog safety model.

## Reference template

`src/editor/referenceCell.ts` converts the existing single-conveyor cell into editor placements; `Reset to reference` reloads it. Because a pallet station legitimately sits on a conveyor, that stacking pair is allowed while every other geometric overlap is flagged invalid.

## Snapping and overlap

- `src/editor/snapping.ts` snaps distances (default 0.1 m) and angles (default 15°).
- `src/editor/overlap.ts` computes AABB footprints and reports overlapping pairs, distinguishing invalid overlaps (clearly shown in red with an `INVALID` indicator) from the supported pallet-on-conveyor stacking. Invalid placements cannot be mistaken for a valid simulation.

## UI

- `CellEditor.vue` — plan canvas (equipment bounds, robot reach circles, frames/axes, selection, invalid highlighting), toolbar (undo/redo/reset/snap), and an invalid-overlap counter.
- `EditorCatalogPanel.vue` — insert buttons from the catalog.
- `EditorPropertyPanel.vue` — numeric X/Z/rotation entry, size/reach metadata, delete, and an explicit invalid-placement warning.

A WebGL-free harness (`/?view=cell-editor`) renders the same editor for deterministic Playwright flows and visual regression at desktop, laptop, and wide touch-panel sizes.

## Tests

- Unit tests for editor commands, selection, snapping, undo/redo, and mode guarding (`cellEditorModel.test.ts`).
- Geometry tests for placement transforms and overlap detection (`overlap.test.ts`, `snapping.test.ts`).
- Component tests for the property panel and catalog insertion (`EditorPropertyPanel.test.ts`, `EditorCatalogPanel.test.ts`, `CellEditor.test.ts`).
- Playwright flow for creating and modifying a cell, invalid-overlap feedback, and recreating the reference cell (`e2e/cell-editor.spec.ts`).
- Visual regression at three target sizes (`e2e/cell-editor-visual.spec.ts`).