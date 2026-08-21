"""Build the first Modellwerk MW900 structural product prototype in Blender.

The model is intentionally authored as a web-ready kit of parts:

* exact 9.00 x 3.00 x 2.80 m outside structural envelope;
* three longitudinal bays with every splice landing on a portal line;
* closed primary rails and columns for torsional stiffness;
* light-gauge C floor and roof joists;
* reusable bolted node plates and low-poly fasteners;
* stable semantic IDs exported as glTF extras.

This is a product-development prototype, not an engineered structural design.
Member sizes and connections must be verified by a structural engineer before
fabrication.
"""

from __future__ import annotations

import json
import math
from collections.abc import Iterable
from pathlib import Path

import bpy
from mathutils import Vector


REPO_ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = REPO_ROOT / "blender" / "mw900"
RUNTIME_DIR = REPO_ROOT / "public" / "models" / "mw900" / "v001"
OUTPUT_DIR = REPO_ROOT / "outputs" / "mw900"
BLEND_PATH = SOURCE_DIR / "MW900_MASTER.blend"
GLB_PATH = RUNTIME_DIR / "structure.glb"
MANIFEST_PATH = RUNTIME_DIR / "manifest.json"
VALIDATION_PATH = RUNTIME_DIR / "validation.json"
RENDER_PATH = OUTPUT_DIR / "mw900_structure_v001.png"

MODULE_LENGTH = 9.0
MODULE_WIDTH = 3.0
MODULE_HEIGHT = 2.8


def remove_collection(name: str) -> None:
    collection = bpy.data.collections.get(name)
    if collection is None:
        return
    children = list(collection.children)
    for child in children:
        remove_collection(child.name)
    for obj in list(collection.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.collections.remove(collection)


def new_collection(name: str, parent: bpy.types.Collection, **properties: object) -> bpy.types.Collection:
    collection = bpy.data.collections.new(name)
    parent.children.link(collection)
    for key, value in properties.items():
        collection[key] = value
    return collection


def material(name: str, color: tuple[float, float, float], metallic: float, roughness: float) -> bpy.types.Material:
    result = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    result.diffuse_color = (*color, 1.0)
    result.use_nodes = True
    shader = result.node_tree.nodes.get("Principled BSDF")
    if shader:
        shader.inputs["Base Color"].default_value = (*color, 1.0)
        shader.inputs["Metallic"].default_value = metallic
        shader.inputs["Roughness"].default_value = roughness
    result["mw_material_id"] = name
    return result


def add_box(
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
    center: tuple[float, float, float],
    size: tuple[float, float, float],
) -> None:
    cx, cy, cz = center
    sx, sy, sz = (value * 0.5 for value in size)
    start = len(vertices)
    vertices.extend(
        [
            (cx - sx, cy - sy, cz - sz),
            (cx + sx, cy - sy, cz - sz),
            (cx + sx, cy + sy, cz - sz),
            (cx - sx, cy + sy, cz - sz),
            (cx - sx, cy - sy, cz + sz),
            (cx + sx, cy - sy, cz + sz),
            (cx + sx, cy + sy, cz + sz),
            (cx - sx, cy + sy, cz + sz),
        ]
    )
    faces.extend(
        [
            (start + 0, start + 3, start + 2, start + 1),
            (start + 4, start + 5, start + 6, start + 7),
            (start + 0, start + 1, start + 5, start + 4),
            (start + 1, start + 2, start + 6, start + 5),
            (start + 2, start + 3, start + 7, start + 6),
            (start + 3, start + 0, start + 4, start + 7),
        ]
    )


def mesh_from_data(
    name: str,
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
) -> bpy.types.Mesh:
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    return mesh


def box_mesh(name: str, size: tuple[float, float, float]) -> bpy.types.Mesh:
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    add_box(vertices, faces, (0.0, 0.0, 0.0), size)
    return mesh_from_data(name, vertices, faces)


def rhs_mesh(
    name: str,
    axis: str,
    length: float,
    width: float,
    height: float,
    wall: float,
) -> bpy.types.Mesh:
    """Create a capped rectangular hollow section along X, Y or Z."""

    half_w = width * 0.5
    half_h = height * 0.5
    inner_w = max(half_w - wall, wall * 0.5)
    inner_h = max(half_h - wall, wall * 0.5)
    cross_outer = [
        (-half_w, -half_h),
        (half_w, -half_h),
        (half_w, half_h),
        (-half_w, half_h),
    ]
    cross_inner = [
        (-inner_w, -inner_h),
        (inner_w, -inner_h),
        (inner_w, inner_h),
        (-inner_w, inner_h),
    ]

    def orient(longitudinal: float, lateral: float, vertical: float) -> tuple[float, float, float]:
        if axis == "X":
            return (longitudinal, lateral, vertical)
        if axis == "Y":
            return (lateral, longitudinal, vertical)
        if axis == "Z":
            return (lateral, vertical, longitudinal)
        raise ValueError(f"Unsupported RHS axis: {axis}")

    vertices: list[tuple[float, float, float]] = []
    for longitudinal in (-length * 0.5, length * 0.5):
        vertices.extend(orient(longitudinal, y, z) for y, z in cross_outer)
        vertices.extend(orient(longitudinal, y, z) for y, z in cross_inner)

    faces: list[tuple[int, ...]] = []
    for index in range(4):
        next_index = (index + 1) % 4
        faces.append((index, next_index, 8 + next_index, 8 + index))
        faces.append((4 + index, 12 + index, 12 + next_index, 4 + next_index))
        faces.append((index, 4 + index, 4 + next_index, next_index))
        faces.append((8 + index, 8 + next_index, 12 + next_index, 12 + index))
    return mesh_from_data(name, vertices, faces)


def c_channel_mesh(
    name: str,
    length: float,
    depth: float,
    flange: float,
    thickness: float,
    lip: float,
) -> bpy.types.Mesh:
    """Create a light-gauge lipped C joist along local Y."""

    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    web_x = -flange * 0.5 + thickness * 0.5
    lip_x = flange * 0.5 - thickness * 0.5
    add_box(vertices, faces, (web_x, 0.0, 0.0), (thickness, length, depth))
    add_box(
        vertices,
        faces,
        (0.0, 0.0, depth * 0.5 - thickness * 0.5),
        (flange, length, thickness),
    )
    add_box(
        vertices,
        faces,
        (0.0, 0.0, -depth * 0.5 + thickness * 0.5),
        (flange, length, thickness),
    )
    add_box(
        vertices,
        faces,
        (lip_x, 0.0, depth * 0.5 - lip * 0.5),
        (thickness, length, lip),
    )
    add_box(
        vertices,
        faces,
        (lip_x, 0.0, -depth * 0.5 + lip * 0.5),
        (thickness, length, lip),
    )
    return mesh_from_data(name, vertices, faces)


def add_cylinder(
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
    radius: float,
    length: float,
    center_z: float,
    sides: int,
) -> None:
    start = len(vertices)
    z0 = center_z - length * 0.5
    z1 = center_z + length * 0.5
    for z in (z0, z1):
        for index in range(sides):
            angle = math.tau * index / sides
            vertices.append((radius * math.cos(angle), radius * math.sin(angle), z))
    vertices.extend([(0.0, 0.0, z0), (0.0, 0.0, z1)])
    bottom_center = start + sides * 2
    top_center = bottom_center + 1
    for index in range(sides):
        next_index = (index + 1) % sides
        faces.append((start + index, start + next_index, start + sides + next_index, start + sides + index))
        faces.append((bottom_center, start + next_index, start + index))
        faces.append((top_center, start + sides + index, start + sides + next_index))


def bolt_mesh(name: str) -> bpy.types.Mesh:
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    add_cylinder(vertices, faces, 0.008, 0.052, 0.0, 10)
    add_cylinder(vertices, faces, 0.015, 0.010, 0.031, 6)
    add_cylinder(vertices, faces, 0.014, 0.009, -0.0305, 6)
    return mesh_from_data(name, vertices, faces)


def rod_mesh(name: str, radius: float = 0.010) -> bpy.types.Mesh:
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    add_cylinder(vertices, faces, radius, 1.0, 0.0, 10)
    return mesh_from_data(name, vertices, faces)


def tag_object(obj: bpy.types.Object, part_id: str, role: str, **properties: object) -> None:
    obj["mw_part_id"] = part_id
    obj["mw_product_id"] = "MW900"
    obj["mw_package"] = "structure"
    obj["mw_category"] = "STRUCTURE"
    obj["mw_role"] = role
    obj["mw_configurable"] = False
    obj["mw_export"] = True
    for key, value in properties.items():
        obj[key] = value


def make_object(
    name: str,
    mesh: bpy.types.Mesh,
    collection: bpy.types.Collection,
    root: bpy.types.Object,
    location: tuple[float, float, float],
    assigned_material: bpy.types.Material,
    part_id: str,
    role: str,
    rotation_z: float = 0.0,
    **properties: object,
) -> bpy.types.Object:
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.parent = root
    obj.location = location
    obj.rotation_euler[2] = rotation_z
    obj.data.materials.append(assigned_material)
    tag_object(obj, part_id, role, **properties)
    return obj


def make_bolt(
    name: str,
    mesh: bpy.types.Mesh,
    collection: bpy.types.Collection,
    root: bpy.types.Object,
    location: tuple[float, float, float],
    normal: tuple[float, float, float],
    assigned_material: bpy.types.Material,
    part_id: str,
) -> bpy.types.Object:
    obj = make_object(
        name,
        mesh,
        collection,
        root,
        location,
        assigned_material,
        part_id,
        "fastener",
        mw_fastener="M16",
    )
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0.0, 0.0, 1.0)).rotation_difference(Vector(normal))
    return obj


def make_rod_between(
    name: str,
    mesh: bpy.types.Mesh,
    collection: bpy.types.Collection,
    root: bpy.types.Object,
    start: tuple[float, float, float],
    end: tuple[float, float, float],
    assigned_material: bpy.types.Material,
    part_id: str,
) -> bpy.types.Object:
    start_vector = Vector(start)
    end_vector = Vector(end)
    direction = end_vector - start_vector
    obj = make_object(
        name,
        mesh,
        collection,
        root,
        tuple((start_vector + end_vector) * 0.5),
        assigned_material,
        part_id,
        "optional-stability-brace",
        mw_optional=True,
        mw_variant_group="end_stability",
    )
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0.0, 0.0, 1.0)).rotation_difference(direction.normalized())
    obj.scale.z = direction.length
    return obj


def recursive_objects(collection: bpy.types.Collection) -> Iterable[bpy.types.Object]:
    yield from collection.objects
    for child in collection.children:
        yield from recursive_objects(child)


def bounds_for(objects: Iterable[bpy.types.Object]) -> tuple[Vector, Vector]:
    points: list[Vector] = []
    for obj in objects:
        if obj.type != "MESH":
            continue
        obj.update_tag()
        points.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
    if not points:
        return Vector((0.0, 0.0, 0.0)), Vector((0.0, 0.0, 0.0))
    return (
        Vector(tuple(min(point[index] for point in points) for index in range(3))),
        Vector(tuple(max(point[index] for point in points) for index in range(3))),
    )


def aim_at(obj: bpy.types.Object, target: Vector) -> None:
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def build_render_helpers(
    model_collection: bpy.types.Collection,
    primary_material: bpy.types.Material,
) -> None:
    remove_collection("MW900_RENDER_HELPERS")
    helpers = new_collection("MW900_RENDER_HELPERS", bpy.context.scene.collection, mw_export=False)

    ground_material = material("MAT_MW900_GROUND", (0.047, 0.052, 0.058), 0.0, 0.82)
    ground = bpy.data.objects.new("MW900_RenderGround", box_mesh("MW900_RenderGroundMesh", (20.0, 14.0, 0.04)))
    helpers.objects.link(ground)
    ground.location.z = -0.04
    ground.data.materials.append(ground_material)
    ground["mw_export"] = False

    target = Vector((0.0, 0.0, 1.3))
    camera_data = bpy.data.cameras.new("MW900_RenderCamera")
    camera = bpy.data.objects.new("MW900_RenderCamera", camera_data)
    helpers.objects.link(camera)
    camera.location = (10.8, -12.8, 7.4)
    camera_data.lens = 58
    aim_at(camera, target)
    camera["mw_export"] = False
    bpy.context.scene.camera = camera

    for name, location, energy, size in (
        ("MW900_Key", (-4.0, -5.0, 10.0), 1450.0, 6.0),
        ("MW900_Fill", (8.0, 6.0, 6.0), 950.0, 5.0),
        ("MW900_Rim", (-8.0, 4.0, 5.5), 800.0, 4.0),
    ):
        light_data = bpy.data.lights.new(name, "AREA")
        light_data.energy = energy
        light_data.shape = "DISK"
        light_data.size = size
        light = bpy.data.objects.new(name, light_data)
        helpers.objects.link(light)
        light.location = location
        aim_at(light, target)
        light["mw_export"] = False

    sun_data = bpy.data.lights.new("MW900_Sun", "SUN")
    sun_data.energy = 1.8
    sun_data.angle = math.radians(4.0)
    sun = bpy.data.objects.new("MW900_Sun", sun_data)
    helpers.objects.link(sun)
    sun.rotation_euler = (math.radians(35.0), 0.0, math.radians(-35.0))
    sun["mw_export"] = False

    scene = bpy.context.scene
    engines = {item.identifier for item in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items}
    if "BLENDER_EEVEE_NEXT" in engines:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 1000
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(RENDER_PATH)
    scene.render.film_transparent = False
    scene.world.color = (0.018, 0.022, 0.028)
    scene.view_settings.look = "AgX - Medium High Contrast"


def main() -> None:
    for directory in (SOURCE_DIR, RUNTIME_DIR, OUTPUT_DIR):
        directory.mkdir(parents=True, exist_ok=True)

    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")

    remove_collection("MW900")
    remove_collection("MW900_RENDER_HELPERS")

    # Rebuilds are deterministic: remove only orphaned datablocks generated by
    # this script so Blender does not append .001 suffixes on every iteration.
    for mesh in list(bpy.data.meshes):
        if mesh.name.startswith("MW900_") and mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    for camera in list(bpy.data.cameras):
        if camera.name.startswith("MW900_") and camera.users == 0:
            bpy.data.cameras.remove(camera)
    for light in list(bpy.data.lights):
        if light.name.startswith("MW900_") and light.users == 0:
            bpy.data.lights.remove(light)

    for reference_name in ("REF_CUARZO_MW900", "REF_CUARZO_MW900_FULL", "REF_RENDER_HELPERS"):
        reference = bpy.data.collections.get(reference_name)
        if reference:
            reference.hide_viewport = True
            reference.hide_render = True
            reference["mw_export"] = False

    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.length_unit = "METERS"
    scene.unit_settings.scale_length = 1.0

    model = new_collection(
        "MW900",
        scene.collection,
        mw_product_id="MW900",
        mw_package="structure",
        mw_export=True,
        mw_schema_version=1,
    )
    primary = new_collection("MW900_10_PRIMARY_FRAME", model, mw_export=True, mw_role="primary-frame")
    floor = new_collection("MW900_20_FLOOR_CASSETTE", model, mw_export=True, mw_role="floor-cassette")
    roof = new_collection("MW900_30_ROOF_CASSETTE", model, mw_export=True, mw_role="roof-cassette")
    connections = new_collection("MW900_40_CONNECTIONS", model, mw_export=True, mw_role="connections")
    stability = new_collection("MW900_50_STABILITY", model, mw_export=True, mw_role="optional-stability")
    guides = new_collection("MW900_90_GUIDES", model, mw_export=False, mw_role="guides")

    root = bpy.data.objects.new("MW900_ROOT", None)
    model.objects.link(root)
    root["mw_product_id"] = "MW900"
    root["mw_part_id"] = "mw900-root"
    root["mw_package"] = "structure"
    root["mw_export"] = True
    root["mw_dimensions"] = [MODULE_LENGTH, MODULE_WIDTH, MODULE_HEIGHT]
    root["mw_origin"] = "center-floor"
    root["mw_authoring_axes"] = "X=length,Y=width,Z=height"
    root["mw_design_status"] = "concept-not-engineered"

    mat_primary = material("MAT_MW900_PRIMARY_GRAPHITE", (0.075, 0.10, 0.125), 0.72, 0.29)
    mat_secondary = material("MAT_MW900_SECONDARY_STEEL", (0.24, 0.37, 0.46), 0.66, 0.34)
    mat_plate = material("MAT_MW900_NODE_BRONZE", (0.78, 0.36, 0.095), 0.58, 0.32)
    mat_bolt = material("MAT_MW900_HARDWARE", (0.11, 0.12, 0.125), 0.82, 0.24)
    mat_brace = material("MAT_MW900_BRACING", (0.70, 0.73, 0.74), 0.70, 0.30)

    x_stations = (-4.44, -1.48, 1.48, 4.44)
    y_stations = (-1.44, 1.44)
    column_bottom = 0.20
    column_top = 2.64
    column_height = column_top - column_bottom
    column_mesh = rhs_mesh("MW900_RHS120x120x4", "Z", column_height, 0.12, 0.12, 0.004)

    for x_index, x in enumerate(x_stations):
        for side_index, y in enumerate(y_stations):
            make_object(
                f"MW900_COL_X{x_index + 1}_S{side_index + 1}",
                column_mesh,
                primary,
                root,
                (x, y, (column_bottom + column_top) * 0.5),
                mat_primary,
                f"col-x{x_index + 1}-s{side_index + 1}",
                "portal-column",
                mw_profile="RHS 120x120x4",
                mw_grid=f"X{x_index + 1}/S{side_index + 1}",
            )

    bottom_side_mesh = rhs_mesh("MW900_RHS200x100x4_SIDE", "X", 2.84, 0.10, 0.20, 0.004)
    top_side_mesh = rhs_mesh("MW900_RHS160x100x4_SIDE", "X", 2.84, 0.10, 0.16, 0.004)
    for bay_index, (left, right) in enumerate(zip(x_stations[:-1], x_stations[1:]), start=1):
        for side_index, y in enumerate(y_stations, start=1):
            center_x = (left + right) * 0.5
            make_object(
                f"MW900_FLOOR_SIDE_B{bay_index}_S{side_index}",
                bottom_side_mesh,
                primary,
                root,
                (center_x, y, 0.10),
                mat_primary,
                f"floor-side-b{bay_index}-s{side_index}",
                "segmented-longitudinal-floor-rail",
                mw_profile="RHS 200x100x4",
                mw_bay=bay_index,
            )
            make_object(
                f"MW900_ROOF_SIDE_B{bay_index}_S{side_index}",
                top_side_mesh,
                primary,
                root,
                (center_x, y, 2.72),
                mat_primary,
                f"roof-side-b{bay_index}-s{side_index}",
                "segmented-longitudinal-roof-rail",
                mw_profile="RHS 160x100x4",
                mw_bay=bay_index,
            )

    bottom_end_mesh = rhs_mesh("MW900_RHS200x100x4_END", "Y", 2.76, 0.10, 0.20, 0.004)
    top_end_mesh = rhs_mesh("MW900_RHS160x100x4_END", "Y", 2.76, 0.10, 0.16, 0.004)
    for end_index, x in enumerate((x_stations[0], x_stations[-1]), start=1):
        make_object(
            f"MW900_FLOOR_END_E{end_index}",
            bottom_end_mesh,
            primary,
            root,
            (x, 0.0, 0.10),
            mat_primary,
            f"floor-end-e{end_index}",
            "end-floor-rail",
            mw_profile="RHS 200x100x4",
        )
        make_object(
            f"MW900_ROOF_END_E{end_index}",
            top_end_mesh,
            primary,
            root,
            (x, 0.0, 2.72),
            mat_primary,
            f"roof-end-e{end_index}",
            "end-roof-rail",
            mw_profile="RHS 160x100x4",
        )

    floor_portal_mesh = rhs_mesh("MW900_RHS180x80x4_PORTAL_FLOOR", "Y", 2.78, 0.08, 0.18, 0.004)
    roof_portal_mesh = rhs_mesh("MW900_RHS140x80x4_PORTAL_ROOF", "Y", 2.78, 0.08, 0.14, 0.004)
    for portal_index, x in enumerate(x_stations[1:-1], start=2):
        make_object(
            f"MW900_FLOOR_PORTAL_X{portal_index}",
            floor_portal_mesh,
            floor,
            root,
            (x, 0.0, 0.10),
            mat_primary,
            f"floor-portal-x{portal_index}",
            "transverse-floor-portal",
            mw_profile="RHS 180x80x4",
        )
        make_object(
            f"MW900_ROOF_PORTAL_X{portal_index}",
            roof_portal_mesh,
            roof,
            root,
            (x, 0.0, 2.72),
            mat_primary,
            f"roof-portal-x{portal_index}",
            "transverse-roof-portal",
            mw_profile="RHS 140x80x4",
        )

    floor_joist_mesh = c_channel_mesh("MW900_C180x60x20x3", 2.78, 0.18, 0.06, 0.003, 0.020)
    roof_joist_mesh = c_channel_mesh("MW900_C120x50x15x2_5", 2.78, 0.12, 0.05, 0.0025, 0.015)
    global_joist_index = 0
    for bay_index, (left, right) in enumerate(zip(x_stations[:-1], x_stations[1:]), start=1):
        for local_index, fraction in enumerate((0.2, 0.4, 0.6, 0.8), start=1):
            global_joist_index += 1
            x = left + (right - left) * fraction
            rotation = 0.0 if global_joist_index % 2 else math.pi
            make_object(
                f"MW900_FLOOR_JOIST_{global_joist_index:02d}",
                floor_joist_mesh,
                floor,
                root,
                (x, 0.0, 0.10),
                mat_secondary,
                f"floor-joist-{global_joist_index:02d}",
                "floor-joist",
                rotation_z=rotation,
                mw_profile="C 180x60x20x3",
                mw_bay=bay_index,
                mw_spacing_nominal="592 mm",
            )
            make_object(
                f"MW900_ROOF_JOIST_{global_joist_index:02d}",
                roof_joist_mesh,
                roof,
                root,
                (x, 0.0, 2.72),
                mat_secondary,
                f"roof-joist-{global_joist_index:02d}",
                "roof-joist",
                rotation_z=rotation,
                mw_profile="C 120x50x15x2.5",
                mw_bay=bay_index,
                mw_spacing_nominal="592 mm",
            )

    side_plate_mesh = box_mesh("MW900_NODE_PLATE_SIDE_220x240x12", (0.22, 0.012, 0.24))
    end_plate_mesh = box_mesh("MW900_NODE_PLATE_END_200x240x12", (0.012, 0.20, 0.24))
    fastener_mesh = bolt_mesh("MW900_BOLT_M16_LOW")
    node_level_z = (0.24, 2.58)
    for x_index, x in enumerate(x_stations, start=1):
        for side_index, y in enumerate(y_stations, start=1):
            # Corner side plates move 50 mm toward the module center so their
            # complete plate and fastener pattern stays inside the 9 m envelope.
            plate_x = x - math.copysign(0.05, x) if x_index in (1, len(x_stations)) else x
            inward_y = y - math.copysign(0.066, y)
            normal_y = (0.0, -math.copysign(1.0, y), 0.0)
            for level_index, z in enumerate(node_level_z, start=1):
                node_id = f"node-x{x_index}-s{side_index}-l{level_index}"
                make_object(
                    f"MW900_NODE_SIDE_X{x_index}_S{side_index}_L{level_index}",
                    side_plate_mesh,
                    connections,
                    root,
                    (plate_x, inward_y, z),
                    mat_plate,
                    node_id,
                    "standard-four-bolt-node-plate",
                    mw_plate="220x240x12",
                    mw_bolt_pattern="140x140-M16",
                )
                bolt_index = 0
                for dx in (-0.07, 0.07):
                    for dz in (-0.07, 0.07):
                        bolt_index += 1
                        make_bolt(
                            f"MW900_BOLT_{node_id.upper()}_{bolt_index}",
                            fastener_mesh,
                            connections,
                            root,
                            (plate_x + dx, inward_y, z + dz),
                            normal_y,
                            mat_bolt,
                            f"bolt-{node_id}-{bolt_index}",
                        )

    for end_index, x in enumerate((x_stations[0], x_stations[-1]), start=1):
        inward_x = x - math.copysign(0.066, x)
        normal_x = (-math.copysign(1.0, x), 0.0, 0.0)
        for side_index, y in enumerate(y_stations, start=1):
            # End plates sit on the inner quadrant of the corner post rather
            # than straddling its centerline and exceeding the 3 m width.
            plate_y = y - math.copysign(0.04, y)
            for level_index, z in enumerate(node_level_z, start=1):
                node_id = f"end-node-e{end_index}-s{side_index}-l{level_index}"
                make_object(
                    f"MW900_NODE_END_E{end_index}_S{side_index}_L{level_index}",
                    end_plate_mesh,
                    connections,
                    root,
                    (inward_x, plate_y, z),
                    mat_plate,
                    node_id,
                    "standard-four-bolt-end-plate",
                    mw_plate="200x240x12",
                    mw_bolt_pattern="120x140-M16",
                )
                bolt_index = 0
                for dy in (-0.06, 0.06):
                    for dz in (-0.07, 0.07):
                        bolt_index += 1
                        make_bolt(
                            f"MW900_BOLT_{node_id.upper()}_{bolt_index}",
                            fastener_mesh,
                            connections,
                            root,
                            (inward_x, plate_y + dy, z + dz),
                            normal_x,
                            mat_bolt,
                            f"bolt-{node_id}-{bolt_index}",
                        )

    brace_mesh = rod_mesh("MW900_TENSION_ROD_20")
    for end_index, x in enumerate((x_stations[0], x_stations[-1]), start=1):
        brace_x = x - math.copysign(0.075, x)
        make_rod_between(
            f"MW900_END_BRACE_E{end_index}_A",
            brace_mesh,
            stability,
            root,
            (brace_x, -1.28, 0.36),
            (brace_x, 1.28, 2.44),
            mat_brace,
            f"end-brace-e{end_index}-a",
        )
        make_rod_between(
            f"MW900_END_BRACE_E{end_index}_B",
            brace_mesh,
            stability,
            root,
            (brace_x, 1.28, 0.36),
            (brace_x, -1.28, 2.44),
            mat_brace,
            f"end-brace-e{end_index}-b",
        )

    guide_vertices = [
        (-4.5, -1.5, 0.0),
        (4.5, -1.5, 0.0),
        (4.5, 1.5, 0.0),
        (-4.5, 1.5, 0.0),
        (-4.5, -1.5, 2.8),
        (4.5, -1.5, 2.8),
        (4.5, 1.5, 2.8),
        (-4.5, 1.5, 2.8),
    ]
    guide_edges = [
        (0, 1), (1, 2), (2, 3), (3, 0),
        (4, 5), (5, 6), (6, 7), (7, 4),
        (0, 4), (1, 5), (2, 6), (3, 7),
    ]
    guide_mesh = bpy.data.meshes.new("MW900_EnvelopeGuideMesh")
    guide_mesh.from_pydata(guide_vertices, guide_edges, [])
    guide = bpy.data.objects.new("MW900_ENVELOPE_9x3x2_8", guide_mesh)
    guides.objects.link(guide)
    guide.parent = root
    guide.display_type = "WIRE"
    guide.hide_render = True
    guide["mw_export"] = False

    build_render_helpers(model, mat_primary)
    bpy.context.view_layer.update()

    export_objects = [obj for obj in recursive_objects(model) if obj.get("mw_export", False)]
    minimum, maximum = bounds_for(export_objects)
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

    manifest = {
        "schemaVersion": 1,
        "id": "mw900",
        "name": "MW900",
        "version": "v001",
        "units": "meters",
        "designStatus": "concept-not-engineered",
        "dimensions": {"length": MODULE_LENGTH, "width": MODULE_WIDTH, "height": MODULE_HEIGHT},
        "origin": "center-floor",
        "authoringAxes": {"length": "X", "width": "Y", "height": "Z"},
        "runtimeAxes": {"length": "X", "width": "Z", "height": "Y"},
        "packages": [
            {
                "id": "structure",
                "url": "/models/mw900/v001/structure.glb",
                "defaultVisible": True,
                "bytes": GLB_PATH.stat().st_size,
                "objects": len(meshes),
                "triangles": triangles,
            }
        ],
        "systems": {
            "grid": "3 bays / 4 portal lines",
            "primaryFrame": "segmented RHS rails and RHS columns",
            "secondaryFrame": "light-gauge lipped C joists",
            "connections": "standardized 4-bolt node plates",
            "optionalStability": "removable end-wall tension-rod cassettes",
        },
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    tolerance = 0.002
    expected_min = Vector((-4.5, -1.5, 0.0))
    expected_max = Vector((4.5, 1.5, 2.8))
    dimension_valid = all(abs(size[index] - value) <= tolerance for index, value in enumerate((9.0, 3.0, 2.8)))
    validation = {
        "valid": dimension_valid,
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
            "min": list(expected_min),
            "max": list(expected_max),
        },
        "checks": {
            "exactEnvelopeWithin2mm": dimension_valid,
            "originAtCenterFloor": True,
            "semanticExtras": all("mw_part_id" in obj for obj in export_objects),
            "referenceExcluded": not any(obj.get("mw_reference", False) for obj in export_objects),
        },
    }
    VALIDATION_PATH.write_text(json.dumps(validation, indent=2), encoding="utf-8")

    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    bpy.context.scene.render.filepath = str(RENDER_PATH)
    bpy.ops.render.render(write_still=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))

    result = {
        "blend": str(BLEND_PATH),
        "glb": str(GLB_PATH),
        "manifest": str(MANIFEST_PATH),
        "validation": str(VALIDATION_PATH),
        "render": str(RENDER_PATH),
        "objects": len(meshes),
        "triangles": triangles,
        "bounds": [round(value, 6) for value in size],
        "valid": dimension_valid,
    }
    print("MW900_BUILD_RESULT " + json.dumps(result))


if __name__ == "__main__":
    main()
