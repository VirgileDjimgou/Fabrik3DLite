# S68 - PBR materials and industrial environment fidelity

## Outcome

Improve perceived industrial quality through a small shared PBR material system and coherent factory
environment while preserving measured performance and moderate asset budgets.

## Scope

- Create reusable materials for painted steel, bare steel, aluminium, rubber, industrial plastic, glass,
  safety yellow, painted floor, wood/cardboard and screen/emissive surfaces.
- Add shared 1K/2K roughness, metalness, normal/detail or label/decal atlases only where they produce a
  measured and visible benefit; record source and license.
- Improve asset edge readability and credible detail: bevels, joint housings, robot dress pack, hoses, cables,
  bolts, panels, cabinet doors, handles, floor wear, safety labels and cell identifiers.
- Standardize the five flagship cells around a coherent factory environment with industrial floor,
  pedestrian/safety-zone markings, cable trays, cabinets, work/stack lights and operator access lanes.
- Reuse textures/material instances and LOD policy to control draw calls and memory.
- Preserve the established ACES, sRGB, lighting and shadow configuration unless measured evidence justifies a
  narrowly documented change.

## Non-goals and boundaries

- No blanket texture replacement, gratuitous high-resolution maps or dramatic polygon increase.
- No new product capability, scenario family or protocol.
- Material appearance remains visual-only and never becomes collision or telemetry truth.

## Testing and validation

- Material-library consistency, texture resolution/provenance, color-space and reuse tests.
- Visual regressions for representative assets and all five flagship environments.
- Re-run the existing GPU benchmark on the reference machine and compare triangles, draw calls, texture
  memory, load time, FPS and frame p50/p95/p99 against the Revision 3 evidence.
- Run applicable asset integrity, repository policy and baseline gates.

## Acceptance criteria

1. All flagship cells use the shared material vocabulary and coherent factory environment.
2. The requested industrial details are present where they materially improve readability.
3. Texture/geometry additions remain within documented budgets and are license-safe.
4. The existing 60 FPS reference target remains satisfied on measured hardware, or the sprint stays open
   until a measured regression is resolved.
5. No performance or visual-improvement claim is made without recorded evidence.

## Evidence expected for completion

Record material/texture inventories, licenses, before/after captures and measured GPU benchmark comparisons,
including hardware/acceleration classification and all applicable quality gates.

