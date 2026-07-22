"""Create a lightweight runtime GLB while preserving material slot names."""

import sys
from pathlib import Path

import bpy


def main() -> None:
    if "--" not in sys.argv:
        raise SystemExit("Expected input and output paths after --")

    args = sys.argv[sys.argv.index("--") + 1 :]
    if len(args) != 2:
        raise SystemExit("Usage: blender --background --python script.py -- input.glb output.glb")

    source = Path(args[0]).resolve()
    destination = Path(args[1]).resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))

    # Material names are semantic IDs for the configurator. Replace each imported
    # shader graph with a neutral shader so assignments survive without images.
    for material in bpy.data.materials:
        material.use_nodes = True
        nodes = material.node_tree.nodes
        nodes.clear()
        output = nodes.new("ShaderNodeOutputMaterial")
        shader = nodes.new("ShaderNodeBsdfPrincipled")
        material.node_tree.links.new(shader.outputs["BSDF"], output.inputs["Surface"])

    for image in list(bpy.data.images):
        bpy.data.images.remove(image)

    bpy.ops.export_scene.gltf(
        filepath=str(destination),
        export_format="GLB",
        export_materials="EXPORT",
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_yup=True,
    )


if __name__ == "__main__":
    main()
