"""Create a deterministic Fabrik3D equipment-asset package from Blender.

Run with Blender 4.x or later:
  blender --background --python tools/blender/create_equipment_asset_template.py -- --id demo-conveyor --category conveyor --output ./asset-output

The script generates a deliberately simple placeholder GLB and manifest.
Replace the placeholder geometry with production geometry, preserve the named
semantic empties, generate LODs/collision proxies, then calculate real hashes
before packaging. It is an authoring helper; Fabrik3D never requires Blender
at runtime.
"""

import argparse
import hashlib
import json
import os
import sys

import bpy


def arguments():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description="Create a Fabrik3D GLB equipment asset template")
    parser.add_argument("--id", required=True, help="Stable asset id, e.g. generic-conveyor-v1")
    parser.add_argument("--category", required=True, choices=["robot", "machine", "conveyor", "pallet-station", "tool", "sensor", "safety-device"])
    parser.add_argument("--output", required=True, help="Empty or existing package output directory")
    return parser.parse_args(argv)


def sha256(path):
    with open(path, "rb") as file:
        return hashlib.sha256(file.read()).hexdigest()


def add_semantic_empty(root, name):
    empty = bpy.data.objects.new(name, None)
    empty.empty_display_type = "ARROWS"
    empty.parent = root
    bpy.context.collection.objects.link(empty)
    return empty


def main():
    args = arguments()
    os.makedirs(args.output, exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.length_unit = "METERS"
    scene.unit_settings.scale_length = 1.0

    root = bpy.data.objects.new("equipment-root", None)
    bpy.context.collection.objects.link(root)

    # Placeholder only: production mesh work happens after this template step.
    bpy.ops.mesh.primitive_cube_add(location=(0.0, 0.5, 0.0))
    body = bpy.context.active_object
    body.name = "visual:placeholder-body"
    body.scale = (0.5, 0.5, 0.5)
    body.parent = root

    add_semantic_empty(root, "anchor:material.in")
    add_semantic_empty(root, "anchor:material.out")
    add_semantic_empty(root, "sensor:infeed")
    add_semantic_empty(root, "motor:main")

    model_path = os.path.join(args.output, "model.glb")
    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    body.select_set(True)
    for child in root.children:
        child.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(filepath=model_path, export_format="GLB", use_selection=True, export_apply=True)

    model_hash = sha256(model_path)
    manifest = {
        "schemaVersion": "1.0",
        "id": args.id,
        "equipmentDefinitionId": args.id,
        "category": args.category,
        "version": "0.1.0",
        "coordinateSystem": {"units": "meters", "upAxis": "Y", "handedness": "right", "origin": "equipment-base"},
        "boundsMeters": {"x": 1.0, "y": 1.0, "z": 1.0},
        "visual": {"glb": {"path": "model.glb", "sha256": model_hash}, "lods": []},
        "collision": {"id": "replace-with-runtime-proxy", "kind": "box"},
        "semanticNodes": [
            {"id": "anchor:material.in", "kind": "anchor"},
            {"id": "anchor:material.out", "kind": "anchor"},
            {"id": "sensor:infeed", "kind": "sensor"},
            {"id": "motor:main", "kind": "motor"},
        ],
        "anchors": [
            {"id": "anchor:material.in", "transform": {"frameId": "equipment-base", "position": {"x": -0.5, "y": 0.5, "z": 0.0}, "rotation": {"x": 0.0, "y": 0.0, "z": 0.0}}},
            {"id": "anchor:material.out", "transform": {"frameId": "equipment-base", "position": {"x": 0.5, "y": 0.5, "z": 0.0}, "rotation": {"x": 0.0, "y": 0.0, "z": 0.0}}},
        ],
        "materials": ["placeholder"],
        "license": {"name": "Replace with the asset's actual license"},
        "integrity": {"path": "model.glb", "sha256": model_hash},
    }
    with open(os.path.join(args.output, "equipment.asset.json"), "w", encoding="utf-8") as file:
        json.dump(manifest, file, indent=2)
        file.write("\n")
    print("Created Fabrik3D equipment asset template: " + args.output)


if __name__ == "__main__":
    main()
