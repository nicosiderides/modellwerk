"""Reimport an MW900 GLB and validate its runtime contract in Blender."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def mesh_bounds(objects: list[bpy.types.Object]) -> tuple[Vector, Vector]:
    points = [
        obj.matrix_world @ Vector(corner)
        for obj in objects
        if obj.type == "MESH"
        for corner in obj.bound_box
    ]
    return (
        Vector(tuple(min(point[index] for point in points) for index in range(3))),
        Vector(tuple(max(point[index] for point in points) for index in range(3))),
    )


def main() -> None:
    separator = sys.argv.index("--")
    glb_path = Path(sys.argv[separator + 1]).resolve()
    report_path = Path(sys.argv[separator + 2]).resolve()

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(glb_path))
    bpy.context.view_layer.update()

    objects = list(bpy.context.scene.objects)
    meshes = [obj for obj in objects if obj.type == "MESH"]
    minimum, maximum = mesh_bounds(meshes)
    size = maximum - minimum
    for obj in meshes:
        obj.data.calc_loop_triangles()
    triangles = sum(len(obj.data.loop_triangles) for obj in meshes)

    part_ids = [str(obj.get("mw_part_id", "")) for obj in objects]
    assembly_ids = {
        str(obj.get("mw_assembly_id"))
        for obj in meshes
        if obj.get("mw_assembly_id")
    }
    versions = {str(obj.get("mw_version", "")) for obj in objects}
    expected = (9.0, 3.0, 2.8)
    maximum_dimension_error = max(abs(size[index] - expected[index]) for index in range(3))

    report = {
        "valid": (
            len(meshes) == 216
            and len(part_ids) == len(set(part_ids))
            and all(part_ids)
            and len(assembly_ids) == 16
            and versions == {"v002"}
            and maximum_dimension_error <= 0.0001
        ),
        "file": glb_path.name,
        "objectsIncludingRoot": len(objects),
        "meshObjects": len(meshes),
        "triangles": triangles,
        "connectionAssemblies": len(assembly_ids),
        "versions": sorted(versions),
        "boundsMeters": {
            "min": [round(value, 6) for value in minimum],
            "max": [round(value, 6) for value in maximum],
            "size": [round(value, 6) for value in size],
        },
        "maximumDimensionErrorMm": round(maximum_dimension_error * 1000.0, 6),
        "checks": {
            "expectedMeshCount": len(meshes) == 216,
            "semanticExtrasOnEveryObject": all(part_ids),
            "uniquePartIds": len(part_ids) == len(set(part_ids)),
            "connectionAssemblies": len(assembly_ids) == 16,
            "versionExtras": versions == {"v002"},
            "dimensionsWithin0_1mm": maximum_dimension_error <= 0.0001,
        },
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print("MW900_ROUNDTRIP_RESULT " + json.dumps(report))


if __name__ == "__main__":
    main()
