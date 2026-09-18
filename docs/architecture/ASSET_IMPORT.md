# Asset package import

`AssetPackageImporter` accepts only an in-memory package manifest plus package-relative file bytes. It validates the manifest, package paths, required members and SHA-256 integrity before admitting a version into its local import catalog. Duplicate `id@version` packages and malformed packages are isolated with actionable diagnostics.

Imported packages are explicitly visual-only (`simulationReady: false`). They cannot gain simulation behavior from mesh geometry: a runtime adapter must be registered independently at the server/catalog boundary before an asset participates in a workflow.

Authoring path: generate generic geometry in Blender → export metre/Y-up GLB → create manifest and LOD → include license + SHA-256 files → validate → import → assign a runtime adapter if the equipment needs behavior. Existing procedural assets remain fallbacks throughout this process.
