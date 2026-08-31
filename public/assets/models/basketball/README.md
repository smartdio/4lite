# Basketball runtime asset

Runtime file: `basketball-game-optimized-v01.glb`

- Source: [Basketballs by DigitalN8m4r3](https://opengameart.org/content/basketballs)
- License: CC0 1.0
- Source archive: `assets/source/models/basketball/digitaln8m4r3-basketballs-cc0-source.zip`
- Deterministic build: `scripts/blender/create_basketball.py`
- Visual diameter: 0.24 m
- Runtime physics target: analytic sphere, radius 0.12 m
- Geometry: 2,184 Blender quads / 4,368 exported triangles
- Material: one rough non-metallic PBR material
- Embedded textures: 512×512 aged classic base color and normal map
- Runtime GLB size: approximately 669 KB

The source archive's supplied GLB is intentionally not used: it contains an unrelated cube and does not bind the basketball material correctly. The project build imports the FBX mesh and its UVs, applies the approved aged orange-brown treatment, bakes the FBX axis rotation, normalizes the sphere, adds one subdivision level, and exports a clean GLB.

The three QA renders in `docs/concepts/basketball-model-qa-v01-{threequarter,front,side}.png` are orthographic renders from the same 3D asset; they are not separately generated views.
