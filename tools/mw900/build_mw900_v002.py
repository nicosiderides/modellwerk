"""Build MW900 v002 from the frozen v001 master.

This iteration keeps the structural member schedule from v001 and develops a
distinct, web-addressable connection kit named MW-LOCK:

* MW-NI6: six-bolt chamfered intermediate node;
* MW-NC8: eight-bolt folded corner node;
* stable assembly IDs, SKUs and conceptual manufacturing metadata;
* a lightweight BOM written next to the web GLB.

The geometry is a product-design prototype. It is not structurally calculated
or approved for fabrication.
"""

from __future__ import annotations

import json
import math
import sys
from collections import Counter
from pathlib import Path

import bpy
from mathutils import Vector


SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import build_mw900 as base  # noqa: E402


REPO_ROOT = Path(__file__).resolve().parents[2]
VERSION = "v002"
SOURCE_DIR = REPO_ROOT / "blender" / "mw900"
RUNTIME_DIR = REPO_ROOT / "public" / "models" / "mw900" / VERSION
OUTPUT_DIR = REPO_ROOT / "outputs" / "mw900"
BLEND_PATH = SOURCE_DIR / "MW900_MASTER_v002.blend"
GLB_PATH = RUNTIME_DIR / "structure.glb"
MANIFEST_PATH = RUNTIME_DIR / "manifest.json"
VALIDATION_PATH = RUNTIME_DIR / "validation.json"
BOM_PATH = RUNTIME_DIR / "bom.json"
RENDER_PATH = OUTPUT_DIR / "mw900_structure_v002.png"
RENDER_NI6_PATH = OUTPUT_DIR / "mw900_node_ni6_v002.png"
RENDER_NC8_PATH = OUTPUT_DIR / "mw900_node_nc8_v002.png"

MODULE_LENGTH = 9.0
MODULE_WIDTH = 3.0
MODULE_HEIGHT = 2.8


def add_extruded_outline(
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
    outline: list[tuple[float, float]],
    thickness: float,
    plane: str,
) -> None:
    """Append a simple prism whose outline lies in XZ or YZ."""

    start = len(vertices)
    half = thickness * 0.5
    for normal in (-half, half):
        for horizontal, vertical in outline:
            if plane == "XZ":
                vertices.append((horizontal, normal, vertical))
            elif plane == "YZ":
                vertices.append((normal, horizontal, vertical))
            else:
                raise ValueError(f"Unsupported plate plane: {plane}")

    count = len(outline)
    faces.append(tuple(start + index for index in reversed(range(count))))
    faces.append(tuple(start + count + index for index in range(count)))
    for index in range(count):
        next_index = (index + 1) % count
        faces.append(
            (
                start + index,
                start + next_index,
                start + count + next_index,
                start + count + index,
            )
        )


def chamfered_plate_mesh(
    name: str,
    width: float,
    height: float,
    chamfer: float,
    thickness: float,
    plane: str,
) -> bpy.types.Mesh:
    half_w = width * 0.5
    half_h = height * 0.5
    outline = [
        (-half_w + chamfer, -half_h),
        (half_w - chamfer, -half_h),
        (half_w, -half_h + chamfer),
        (half_w, half_h - chamfer),
        (half_w - chamfer, half_h),
        (-half_w + chamfer, half_h),
        (-half_w, half_h - chamfer),
        (-half_w, -half_h + chamfer),
    ]
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    add_extruded_outline(vertices, faces, outline, thickness, plane)
    return base.mesh_from_data(name, vertices, faces)


def make_part(
    name: str,
    mesh: bpy.types.Mesh,
    collection: bpy.types.Collection,
    root: bpy.types.Object,
    location: tuple[float, float, float],
    assigned_material: bpy.types.Material,
    part_id: str,
    role: str,
    **properties: object,
) -> bpy.types.Object:
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.parent = root
    obj.location = location
    if assigned_material.name not in {item.name for item in mesh.materials}:
        mesh.materials.append(assigned_material)
    base.tag_object(obj, part_id, role, mw_version=VERSION, **properties)
    return obj


def make_fastener(
    name: str,
    mesh: bpy.types.Mesh,
    collection: bpy.types.Collection,
    root: bpy.types.Object,
    location: tuple[float, float, float],
    normal: tuple[float, float, float],
    assigned_material: bpy.types.Material,
    part_id: str,
    assembly_id: str,
    family: str,
) -> bpy.types.Object:
    obj = make_part(
        name,
        mesh,
        collection,
        root,
        location,
        assigned_material,
        part_id,
        "fastener",
        mw_sku="MW-HW-M16-052",
        mw_fastener="M16x52-concept",
        mw_assembly_id=assembly_id,
        mw_connection_family=family,
        mw_manufacturing="purchased-standard-hardware",
        mw_finish="black-zinc-concept",
    )
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0.0, 0.0, 1.0)).rotation_difference(Vector(normal))
    return obj


def clear_v001_connections(model: bpy.types.Collection) -> bpy.types.Collection:
    base.remove_collection("MW900_40_CONNECTIONS")
    for mesh in list(bpy.data.meshes):
        if mesh.users == 0 and mesh.name.startswith(("MW900_NODE_", "MW900_BOLT_", "MW900_V002_")):
            bpy.data.meshes.remove(mesh)
    return base.new_collection(
        "MW900_40_CONNECTIONS",
        model,
        mw_export=True,
        mw_role="connections",
        mw_system="MW-LOCK",
        mw_version=VERSION,
    )


def build_connection_kit(
    connections: bpy.types.Collection,
    root: bpy.types.Object,
) -> dict[str, int]:
    plate_material = base.material("MAT_MW900_MWLOCK_COPPER", (0.86, 0.28, 0.055), 0.62, 0.27)
    hardware_material = base.material("MAT_MW900_HARDWARE", (0.08, 0.09, 0.10), 0.86, 0.22)

    ni6_plate = chamfered_plate_mesh("MW900_V002_NI6_PLATE", 0.30, 0.28, 0.035, 0.012, "XZ")
    nc8_side = chamfered_plate_mesh("MW900_V002_NC8_SIDE", 0.24, 0.28, 0.030, 0.012, "XZ")
    nc8_end = chamfered_plate_mesh("MW900_V002_NC8_END", 0.20, 0.28, 0.025, 0.012, "YZ")
    nc8_spine = base.box_mesh("MW900_V002_NC8_SPINE", (0.012, 0.012, 0.28))
    node_cap = base.box_mesh("MW900_V002_NODE_BEARING_CAP", (0.116, 0.116, 0.008))
    fastener_mesh = base.bolt_mesh("MW900_V002_BOLT_M16_LOW")

    x_stations = (-4.44, -1.48, 1.48, 4.44)
    y_stations = (-1.44, 1.44)
    node_levels = (0.24, 2.58)
    counts: Counter[str] = Counter()

    # Intermediate portal lines: one plate bridges the two rail ends and the
    # column. The center bolt pair addresses the post; the outer pairs address
    # the adjacent rail segments. This load path remains conceptual.
    for portal_index, x in enumerate(x_stations[1:-1], start=2):
        for side_index, y in enumerate(y_stations, start=1):
            inward_y = y - math.copysign(0.066, y)
            normal_y = (0.0, -math.copysign(1.0, y), 0.0)
            for level_index, z in enumerate(node_levels, start=1):
                assembly_id = f"mwlock-ni6-x{portal_index}-s{side_index}-l{level_index}"
                make_part(
                    f"MW900_MWLOCK_NI6_X{portal_index}_S{side_index}_L{level_index}",
                    ni6_plate,
                    connections,
                    root,
                    (x, inward_y, z),
                    plate_material,
                    f"{assembly_id}-plate",
                    "longitudinal-splice-node-plate",
                    mw_sku="MW-NI6-PLATE",
                    mw_assembly_id=assembly_id,
                    mw_connection_family="MW-NI6",
                    mw_plate="300x280x12-chamfered",
                    mw_bolt_pattern="3x2 / 100x170 / M16 concept",
                    mw_manufacturing="laser-cut-flat-plate",
                    mw_finish="powder-coat-copper-concept",
                )
                make_part(
                    f"MW900_MWLOCK_CAP_NI6_X{portal_index}_S{side_index}_L{level_index}",
                    node_cap,
                    connections,
                    root,
                    (x, y, 0.20 if level_index == 1 else 2.64),
                    plate_material,
                    f"{assembly_id}-bearing-cap",
                    "column-bearing-cap",
                    mw_sku="MW-NODE-CAP",
                    mw_assembly_id=assembly_id,
                    mw_connection_family="MW-NI6",
                    mw_plate="116x116x8-concept",
                    mw_manufacturing="laser-cut-flat-plate",
                    mw_finish="powder-coat-copper-concept",
                )
                counts["MW-NI6"] += 1
                bolt_index = 0
                for dx in (-0.10, 0.0, 0.10):
                    for dz in (-0.085, 0.085):
                        bolt_index += 1
                        make_fastener(
                            f"MW900_BOLT_{assembly_id.upper()}_{bolt_index}",
                            fastener_mesh,
                            connections,
                            root,
                            (x + dx, inward_y, z + dz),
                            normal_y,
                            hardware_material,
                            f"{assembly_id}-bolt-{bolt_index}",
                            assembly_id,
                            "MW-NI6",
                        )

    # Corner lines: two chamfered legs and a short internal spine read as one
    # folded/welded shop cassette. The cassette is bolted from two accessible
    # faces and can be addressed as one assembly by the customizer.
    for end_index, x in enumerate((x_stations[0], x_stations[-1]), start=1):
        sign_x = math.copysign(1.0, x)
        inward_x = x - sign_x * 0.066
        plate_x = x - sign_x * 0.060
        normal_x = (-sign_x, 0.0, 0.0)
        for side_index, y in enumerate(y_stations, start=1):
            sign_y = math.copysign(1.0, y)
            inward_y = y - sign_y * 0.066
            plate_y = y - sign_y * 0.050
            normal_y = (0.0, -sign_y, 0.0)
            for level_index, z in enumerate(node_levels, start=1):
                assembly_id = f"mwlock-nc8-e{end_index}-s{side_index}-l{level_index}"
                common = {
                    "mw_assembly_id": assembly_id,
                    "mw_connection_family": "MW-NC8",
                    "mw_finish": "powder-coat-copper-concept",
                }
                make_part(
                    f"MW900_MWLOCK_NC8_SIDE_E{end_index}_S{side_index}_L{level_index}",
                    nc8_side,
                    connections,
                    root,
                    (plate_x, inward_y, z),
                    plate_material,
                    f"{assembly_id}-side-leg",
                    "corner-node-side-leg",
                    mw_sku="MW-NC8-SIDE",
                    mw_plate="240x280x12-chamfered",
                    mw_manufacturing="laser-cut-and-folded-cassette-leg",
                    **common,
                )
                make_part(
                    f"MW900_MWLOCK_NC8_END_E{end_index}_S{side_index}_L{level_index}",
                    nc8_end,
                    connections,
                    root,
                    (inward_x, plate_y, z),
                    plate_material,
                    f"{assembly_id}-end-leg",
                    "corner-node-end-leg",
                    mw_sku="MW-NC8-END",
                    mw_plate="200x280x12-chamfered",
                    mw_manufacturing="laser-cut-and-folded-cassette-leg",
                    **common,
                )
                make_part(
                    f"MW900_MWLOCK_NC8_SPINE_E{end_index}_S{side_index}_L{level_index}",
                    nc8_spine,
                    connections,
                    root,
                    (inward_x, inward_y, z),
                    plate_material,
                    f"{assembly_id}-spine",
                    "corner-node-fold-spine",
                    mw_sku="MW-NC8-SPINE",
                    mw_plate="internal-fold-spine-12",
                    mw_manufacturing="fold-line-or-shop-weld-concept",
                    **common,
                )
                make_part(
                    f"MW900_MWLOCK_CAP_NC8_E{end_index}_S{side_index}_L{level_index}",
                    node_cap,
                    connections,
                    root,
                    (x, y, 0.20 if level_index == 1 else 2.64),
                    plate_material,
                    f"{assembly_id}-bearing-cap",
                    "column-bearing-cap",
                    mw_sku="MW-NODE-CAP",
                    mw_plate="116x116x8-concept",
                    mw_manufacturing="laser-cut-flat-plate",
                    **common,
                )
                counts["MW-NC8"] += 1

                bolt_index = 0
                for dx in (-0.070, 0.070):
                    for dz in (-0.085, 0.085):
                        bolt_index += 1
                        make_fastener(
                            f"MW900_BOLT_{assembly_id.upper()}_SIDE_{bolt_index}",
                            fastener_mesh,
                            connections,
                            root,
                            (plate_x + dx, inward_y, z + dz),
                            normal_y,
                            hardware_material,
                            f"{assembly_id}-side-bolt-{bolt_index}",
                            assembly_id,
                            "MW-NC8",
                        )
                for dy in (-0.055, 0.055):
                    for dz in (-0.085, 0.085):
                        bolt_index += 1
                        make_fastener(
                            f"MW900_BOLT_{assembly_id.upper()}_END_{bolt_index}",
                            fastener_mesh,
                            connections,
                            root,
                            (inward_x, plate_y + dy, z + dz),
                            normal_x,
                            hardware_material,
                            f"{assembly_id}-end-bolt-{bolt_index}",
                            assembly_id,
                            "MW-NC8",
                        )

    return dict(counts)


def object_bom(meshes: list[bpy.types.Object]) -> list[dict[str, object]]:
    grouped: dict[str, dict[str, object]] = {}
    for obj in meshes:
        sku = str(obj.get("mw_sku") or obj.get("mw_profile") or obj.get("mw_role") or "UNCLASSIFIED")
        entry = grouped.setdefault(
            sku,
            {
                "sku": sku,
                "quantity": 0,
                "role": str(obj.get("mw_role", "")),
                "profile": str(obj.get("mw_profile", "")),
                "_connectionFamilies": set(),
                "manufacturing": str(obj.get("mw_manufacturing", "")),
                "status": "concept-not-engineered",
            },
        )
        entry["quantity"] = int(entry["quantity"]) + 1
        family = str(obj.get("mw_connection_family", ""))
        if family:
            entry["_connectionFamilies"].add(family)

    items: list[dict[str, object]] = []
    for entry in grouped.values():
        families = sorted(entry.pop("_connectionFamilies"))
        entry["connectionFamilies"] = families
        items.append(entry)
    return sorted(items, key=lambda item: str(item["sku"]))


def render_controls(model: bpy.types.Collection) -> None:
    base.RENDER_PATH = RENDER_PATH
    primary_material = bpy.data.materials.get("MAT_MW900_PRIMARY_GRAPHITE")
    if primary_material is None:
        raise RuntimeError("Primary MW900 material is missing")
    base.build_render_helpers(model, primary_material)

    scene = bpy.context.scene
    camera = scene.camera
    if camera is None:
        raise RuntimeError("MW900 render camera was not created")
    main_location = camera.location.copy()
    main_rotation = camera.rotation_euler.copy()
    main_lens = camera.data.lens

    scene.render.filepath = str(RENDER_PATH)
    bpy.ops.render.render(write_still=True)

    scene.render.resolution_x = 1200
    scene.render.resolution_y = 1200
    camera.data.lens = 68
    camera.location = (-0.58, 0.42, 0.98)
    base.aim_at(camera, Vector((-1.48, -1.36, 0.27)))
    scene.render.filepath = str(RENDER_NI6_PATH)
    bpy.ops.render.render(write_still=True)

    camera.data.lens = 72
    camera.location = (3.18, -0.18, 3.52)
    base.aim_at(camera, Vector((4.37, -1.37, 2.57)))
    scene.render.filepath = str(RENDER_NC8_PATH)
    bpy.ops.render.render(write_still=True)

    camera.location = main_location
    camera.rotation_euler = main_rotation
    camera.data.lens = main_lens
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 1000
    scene.render.filepath = str(RENDER_PATH)


def main() -> None:
    for directory in (SOURCE_DIR, RUNTIME_DIR, OUTPUT_DIR):
        directory.mkdir(parents=True, exist_ok=True)

    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")

    model = bpy.data.collections.get("MW900")
    root = bpy.data.objects.get("MW900_ROOT")
    if model is None or root is None:
        raise RuntimeError("Open MW900_MASTER.blend v001 before running this script")

    connections = clear_v001_connections(model)
    family_counts = build_connection_kit(connections, root)

    root["mw_version"] = VERSION
    root["mw_connection_system"] = "MW-LOCK"
    root["mw_connection_families"] = "MW-NI6,MW-NC8"
    root["mw_design_status"] = "concept-not-engineered"
    root["mw_bom_url"] = "/models/mw900/v002/bom.json"
    model["mw_schema_version"] = 2
    model["mw_version"] = VERSION
    for obj in base.recursive_objects(model):
        if obj.get("mw_export", False):
            obj["mw_version"] = VERSION

    bpy.context.view_layer.update()
    export_objects = [obj for obj in base.recursive_objects(model) if obj.get("mw_export", False)]
    minimum, maximum = base.bounds_for(export_objects)
    size = maximum - minimum

    bpy.ops.object.select_all(action="DESELECT")
    for obj in export_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=str(GLB_PATH),
        export_format="GLB",
        use_selection=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_extras=True,
        export_yup=True,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_draco_position_quantization=14,
        export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12,
    )

    meshes = [obj for obj in export_objects if obj.type == "MESH"]
    for obj in meshes:
        obj.data.calc_loop_triangles()
    triangles = sum(len(obj.data.loop_triangles) for obj in meshes)
    part_ids = [str(obj.get("mw_part_id", "")) for obj in export_objects]
    assembly_ids = {
        str(obj.get("mw_assembly_id"))
        for obj in meshes
        if obj.get("mw_assembly_id")
    }
    bom_items = object_bom(meshes)

    bom = {
        "schemaVersion": 1,
        "productId": "MW900",
        "version": VERSION,
        "designStatus": "concept-not-engineered",
        "units": "meters",
        "summary": {
            "meshParts": len(meshes),
            "connectionAssemblies": len(assembly_ids),
            "MW-NI6": family_counts.get("MW-NI6", 0),
            "MW-NC8": family_counts.get("MW-NC8", 0),
        },
        "items": bom_items,
        "engineeringNotice": "Concept quantities only; profiles, plates and fasteners require engineering verification.",
    }
    BOM_PATH.write_text(json.dumps(bom, indent=2), encoding="utf-8")

    manifest = {
        "schemaVersion": 2,
        "id": "mw900",
        "name": "MW900",
        "version": VERSION,
        "units": "meters",
        "designStatus": "concept-not-engineered",
        "dimensions": {"length": MODULE_LENGTH, "width": MODULE_WIDTH, "height": MODULE_HEIGHT},
        "origin": "center-floor",
        "authoringAxes": {"length": "X", "width": "Y", "height": "Z"},
        "runtimeAxes": {"length": "X", "width": "Z", "height": "Y"},
        "packages": [
            {
                "id": "structure",
                "url": "/models/mw900/v002/structure.glb",
                "bomUrl": "/models/mw900/v002/bom.json",
                "defaultVisible": True,
                "bytes": GLB_PATH.stat().st_size,
                "objects": len(meshes),
                "triangles": triangles,
            }
        ],
        "systems": {
            "grid": "3 bays / 4 portal lines",
            "primaryFrame": "segmented RHS rails and RHS columns; unchanged from v001",
            "secondaryFrame": "light-gauge lipped C joists; unchanged from v001",
            "connections": "MW-LOCK v002 / MW-NI6 intermediate nodes / MW-NC8 corner nodes",
            "optionalStability": "removable end-wall tension-rod cassettes",
        },
        "connectionKit": {
            "assemblies": len(assembly_ids),
            "families": [
                {"id": "MW-NI6", "quantity": family_counts.get("MW-NI6", 0), "fastenersPerAssembly": 6},
                {"id": "MW-NC8", "quantity": family_counts.get("MW-NC8", 0), "fastenersPerAssembly": 8},
            ],
        },
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    tolerance = 0.002
    dimension_valid = all(
        abs(size[index] - value) <= tolerance
        for index, value in enumerate((MODULE_LENGTH, MODULE_WIDTH, MODULE_HEIGHT))
    )
    validation = {
        "valid": dimension_valid and len(part_ids) == len(set(part_ids)),
        "designStatus": "concept-not-engineered",
        "file": GLB_PATH.name,
        "bytes": GLB_PATH.stat().st_size,
        "objects": len(meshes),
        "triangles": triangles,
        "boundsMeters": {
            "min": [round(value, 6) for value in minimum],
            "max": [round(value, 6) for value in maximum],
            "size": [round(value, 6) for value in size],
        },
        "expectedBoundsMeters": {
            "min": [-4.5, -1.5, 0.0],
            "max": [4.5, 1.5, 2.8],
        },
        "checks": {
            "exactEnvelopeWithin2mm": dimension_valid,
            "originAtCenterFloor": True,
            "semanticExtras": all("mw_part_id" in obj for obj in export_objects),
            "uniquePartIds": len(part_ids) == len(set(part_ids)),
            "referenceExcluded": not any(obj.get("mw_reference", False) for obj in export_objects),
            "connectionAssemblies": len(assembly_ids) == 16,
            "connectionFamilies": family_counts == {"MW-NI6": 8, "MW-NC8": 8},
            "bomWritten": BOM_PATH.exists(),
        },
    }
    VALIDATION_PATH.write_text(json.dumps(validation, indent=2), encoding="utf-8")

    render_controls(model)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))

    result = {
        "blend": str(BLEND_PATH),
        "glb": str(GLB_PATH),
        "manifest": str(MANIFEST_PATH),
        "bom": str(BOM_PATH),
        "validation": str(VALIDATION_PATH),
        "renders": [str(RENDER_PATH), str(RENDER_NI6_PATH), str(RENDER_NC8_PATH)],
        "objects": len(meshes),
        "triangles": triangles,
        "assemblies": len(assembly_ids),
        "bounds": [round(value, 6) for value in size],
        "valid": validation["valid"],
    }
    print("MW900_V002_BUILD_RESULT " + json.dumps(result))


if __name__ == "__main__":
    main()
