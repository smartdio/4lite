# From Memory to Campus: The Making of *The School I Remember*

[简体中文](project-development-story.md) · English

Recorded: August 22, 2026  
Coverage: From the first idea to the version current at the time of writing  
Format: A browser-based 3D campus experience built with Three.js

## Preface

This project did not begin with a complete set of architectural drawings or a finished game design document. It began with a personal memory of an old school.

That memory held a front gate, a courtyard, classroom buildings, a playground, an older classroom block, a toilet building, teachers’ quarters, and a great banyan tree. It retained the colours of the buildings, the rough sequence of doors and windows, the turn inside the toilet entrance, the way a raised terrace met the dormitory and the tree roots, and the desks, blackboards, chalk, and old textbooks inside the classrooms. But none of this arrived as a single, complete account. It was scattered across a memory painting, sketches drawn over time, a small number of historical photographs, dimensional estimates, and details that resurfaced during development.

From the outset, then, this was never a conventional exercise in “modelling from a picture.” It was closer to a form of spatial research conducted by a person and an AI agent together. The person supplied memory, judgement, and feeling. The agent organised fragmented evidence into material that could be discussed, translated uncertain relationships into drawings and parameters, implemented confirmed decisions as a 3D scene, and returned the browser experience to the person for another round of looking and correction.

The campus gradually took shape through that exchange.

## 1. The Original Idea

The initial aim was to reconstruct an early-1980s primary school in Guangdong, China, inside a web browser. It would not be a building model viewed only from a distance, but a place one could enter: players would pass through the school gate, cross the central passage in Building 1, and emerge onto the playground behind it. They could walk along corridors, enter classrooms, climb stairs, and inspect doors, windows, desks, blackboards, and wall posters.

The project also needed to preserve more than the shapes of buildings. It sought a particular atmosphere of memory: a bright, quiet, almost empty campus near noon in midsummer; faded walls, old roof tiles, timber doors, and weathered concrete; strong sunlight with open, breathable shadows; leaves and tree shadows moving slowly, as if time had paused somewhere in childhood.

That created two goals from the beginning.

The first was reconstruction. The relationships between buildings, the number of doors and windows, the direction of corridors, the position of stairs, changes in ground level, and the placement of trees should correspond as closely as possible to first-hand memory.

The second was expression. The scene could not feel like a cold architectural survey, but neither could it become a sinister ruin. It needed to be warm, hand-painted, and slightly faded, while remaining bright and alive.

Those goals continued to guide the entire project. The space needed evidence; the art needed emotion. Emotion could not conceal a spatial error, and accuracy could not be allowed to drain the scene of memory.

## 2. Why the Painting Did Not Become the 3D Scene

The earliest image of the school was an illustrated aerial view drawn from memory. It communicated the buildings, trees, and open spaces well, and it captured the atmosphere of the place. It was not, however, a survey drawing.

Its perspective bent. Important objects were deliberately enlarged. Visible façades could be turned for the sake of the composition. Tree canopies concealed the space behind them, and the absence of a feature from the painting did not prove that it had never existed. From this image alone, there was no reliable way to infer building depth, classroom count, stair direction, rear openings, or the true dimensions of the campus.

An early experiment attempted to generate a Three.js environment quickly from the illustration, but the result was soon discarded. The problem was not that it failed to produce something recognisably school-like. The problem was that it hardened a large number of unsupported assumptions all at once. The more complete the image looked, the easier it became to mistake those dimensions and relationships for confirmed facts.

The project therefore adopted an important rule: never generate the entire campus from a single image, never reverse-engineer precise dimensions from an artistic illustration, and never treat an unverified early prototype as evidence for later work.

The painting remained useful, but its role changed. It became a reference for mood, architectural character, and adjacency—not a substitute for plans, measurements, or first-hand confirmation.

## 3. Organising the Memory Before Modelling

The first formal development task was not to write Three.js code. It was to build an evidence system.

The agent archived the user’s campus plan, sketches of the teaching buildings, toilet, teachers’ quarters, old classrooms, doors, windows, and railings, together with the available historical photographs. Every important source received a written note separating four kinds of information:

- what the user had explicitly stated;
- what could be observed directly in the image;
- what the agent had inferred from the material;
- what remained unknown.

To prevent an inference from quietly turning into a fact, the project introduced four confidence levels: A, B, C, and D.

- **A** meant explicitly confirmed by a first-hand witness, supported by a clear dimension, or corroborated by several sources.
- **B** meant strongly supported but still missing a dimension or another view.
- **C** meant a working candidate adopted so that a first version could be built.
- **D** meant that the evidence was insufficient and the detail should remain unknown.

This system proved extremely useful. A 3D scene cannot exist without dimensions, so some gaps had to be filled with working values. As long as a value remained marked C, however, a newly recovered memory could lead to a targeted change instead of forcing the entire structure to be rebuilt.

The evidence system also changed the conversation between the person and the agent. Instead of replying only with “I understand,” the agent wrote testable statements. A note might say, for example: the toilet has no windows; users first enter through a shared opening in the centre of the front elevation, walk left or right along the inside of parallel screen walls, and then turn through separate doorways at either end. If any part was wrong, the user could correct a specific relationship.

Only after the written relationship was broadly correct would the agent turn it into a clean SVG plan, elevation, or structural diagram.

## 4. From a Relationship Map to a Metre-Based Plan

The project did not begin by trying to determine the exact length of every building. It first established the topology of the campus: what stood beside what, and where movement was possible.

The first stable element was a main spatial axis. Entering through the gate on the south side, a visitor crossed the front court and faced Building 1, a two-storey U-shaped teaching block. A central passage led through the building to the main playground. Building 2, a three-storey teaching block, stood at the far side. To the east were the toilet, sandpit, old classrooms, activity yard, teachers’ quarters, and the higher ground around the great banyan tree.

Several relationships with campus-wide consequences were then confirmed:

- Building 1 was a two-storey U-shaped structure whose central passage connected the front and rear courts.
- Building 2 had three storeys, a central stair, and classrooms arranged along continuous external corridors.
- The toilet and sandpit stood on lower ground.
- The old classrooms, the activity yard in front of them, and the teachers’ quarters shared one continuous raised terrace.
- Part of that terrace rose into an earthen mound in front of the quarters, where the banyan grew.
- The edge of the terrace was a natural earth slope, not a collection of isolated concrete plinths.

Once those relationships were stable, the campus began to change from an illustration into a place that could be traversed.

Scale calibration started with objects people tend to remember more reliably. A standard classroom was treated as roughly 9 by 7 metres, a corridor as about 1.5 to 2 metres wide, and a teaching floor as about 3.1 metres high. Familiar dimensions for doors, windows, stair treads, table-tennis tables, and sports areas helped infer the remaining proportions.

One Three.js world unit was defined as one metre. Important dimensions, coordinates, terrain outlines, and asset paths were centralised in `src/campus-config.js`. When the user said “this tree is too tall,” “the terrace should sit farther east,” or “this corridor is too wide,” the agent could adjust a coherent parameter set rather than make disconnected guesses in different models.

## 5. Grayboxing: Walking Through the Memory

Once the two-dimensional relationships were established, the project moved into grayboxing.

A graybox is not a finished art model. It uses simple colours and basic geometry to establish walls, slabs, roofs, openings, corridors, stairs, terraces, boundary walls, and ground. Its purpose is to prove the space before detailed materials and attractive trees make errors harder to see.

The agent built the graybox directly in the target Three.js scene rather than constructing a sealed campus model in Blender first. Building dimensions, player collision, first-person sightlines, and the final runtime environment therefore shared one coordinate system from the start.

Most of the regular structure in Buildings 1 and 2 was generated in code. Central parameters drove walls, floor slabs, beams, classroom openings, and railings. Finished floor levels, slab thickness, sill heights, lintels, and stair treads could be adjusted consistently across storeys.

Graybox review happened from two main viewpoints. Aerial views checked the overall layout, distances between buildings, terrain boundaries, and tree placement. First-person views exposed issues that drawings hid: whether Building 1 felt oppressive from the gate, whether the central passage was wide enough, whether a corridor felt natural, whether the player could cross a step, whether a stair trapped the collision body, and whether windowsills and blackboards sat at plausible heights from inside a classroom.

Many of the most consequential problems appeared only while walking.

At one point, the doors and windows in Building 1 seemed embedded in the floor slabs. The models were not at fault. The slabs had been generated upward from the finished floor plane, stealing height from the room. Regenerating them downward from that plane restored the intended relationship between door thresholds, sills, and ceiling height.

Stairs and railings produced similar lessons. A railing could look correct but still allow the player through if its collision had no vertical extent. A height system based on a single ground plane could not carry the player to an upper floor. The agent eventually established a shared surface-sampling system for treads, flights, landings, and stacked slabs, then added collision to railings, stair half-walls, and exposed edges.

Grayboxing gave the project a crucial new capability. The user no longer had to remember only by looking at an image; they could judge the memory by walking through the space.

## 6. How Sketches Mediated the Collaboration

Hand-drawn sketches became one of the project’s most important working languages.

They did not need to resemble professional architectural drawings. Many were quick diagrams showing a door-and-window sequence, the direction of a stair, the turn inside the toilet entrance, the edge of a terrace, or the position of a tree. The agent’s job was not to copy every line as if it were exact, but to extract structural relationships and state clearly what the drawing still could not determine.

A typical sketch passed through the following cycle:

1. The original was saved and numbered.
2. The agent wrote down the user’s explanation and the visible information in the drawing.
3. Confirmed facts were separated from interpretations of the lines.
4. Missing dimensions, unseen elevations, and unresolved construction questions were listed.
5. The agent drew a clean plan, elevation, or structural diagram.
6. The user confirmed or corrected it.
7. The agent converted the result into Three.js parameters or Blender constraints.
8. Once the first browser version existed, the user judged it again in context.

The old classroom block is a good example. Early shorthand in a sketch was initially read as a “door–window–door” rhythm for each classroom. The user later recalled that each room actually had a door at either end and three consecutive windows between them: “door–window–window–window–door.” The agent retired the old interpretation and updated the source notes, plan and elevation rules, concept art, and final GLB. Across the two rooms, the front elevation became four doors and six windows.

It sounds like a small change, but it illustrates an essential rule: a sketch is not a construction drawing frozen forever, and seeing a model can recover new memory. When the user makes a new, explicit judgement, the entire evidence chain must be updated; a temporary patch to the model is not enough.

The toilet sketch carried a different kind of information. What the user remembered most clearly was not the number of roof tiles but the route taken by a person entering: through a shared front opening, along one side of parallel screen walls, then around the end into the men’s or women’s doorway. The building had no windows, and a continuous ventilation gap ran between wall tops and roof. The agent therefore concentrated on entrance topology, the windowless elevations, and ventilation rather than inventing an inaccessible interior.

The sketch of the teachers’ quarters clarified a relationship between architecture and terrain. It showed a two-storey building facing west, with an external stair to the south, but also established that the quarters, old classrooms, and activity yard belonged to the same continuous terrace. That insight changed not only one building, but the generation of the whole eastern landscape.

## 7. From Reference to Concept Art to GLB

Only after spatial relationships and dimensions had been confirmed did the project begin producing formal assets with distinctive silhouettes.

This did not mean turning a reference image into a complete 3D campus. Concept art was used within explicit structural constraints to settle the appearance of a single building or object. The toilet, teachers’ quarters, and old classrooms all followed this path: sketches and scene captures informed a concept image; the user selected or revised it; then a Blender source model and game-ready GLB were produced.

Concept art answered “what should it look like?” Structural documents answered “what relationships must it satisfy?” Blender combined the two into an asset with the correct metre scale, normals, UVs, origin, and hierarchy.

Before a formal GLB entered the runtime, the agent checked:

- whether the units were metres;
- whether the orientation matched the campus coordinate system;
- whether the origin made placement predictable;
- whether the pivots of doors, windows, and other moving parts sat on the correct axes;
- whether normals and transparent materials behaved correctly;
- whether the close-range silhouette matched the approved concept;
- whether the mesh or textures needed optimisation;
- whether the visual geometry should be separated from simpler collision proxies.

A timber door demonstrated why these checks mattered. The first door leaf could rotate, but its pivot did not coincide with the hinge, so opening it introduced an unnatural translation. The root pivot was moved to the hinge axis in Blender, and the child mesh received a compensating offset. The door remained in exactly the same position when closed and rotated naturally when opened.

The concrete slide showed the distinction between a source asset and a runtime asset. Its original file was roughly 85 MB, contained about 1.5 million triangles, and used several 4096-pixel PNG textures. Shipping it directly to a browser would have imposed unnecessary download and rendering costs. The asset was reduced to roughly 30,000 triangles, converted to 1024-pixel WebP textures, quantised, and then given conservative Meshopt compression. The browser version retained the approved silhouette and real-world height of about two metres while costing far less to load and render.

## 8. Why the Banyan Tree Needed So Many Versions

The great banyan was one of the project’s most complex and frequently revised standalone assets.

It was not merely a tree. It was a spatial and emotional anchor on the east side of the campus. The trunk, main branch directions, buttress roots, aerial roots, crown height, foliage density, mound, and stone base all affected whether the scene felt right.

The tree did not emerge in a single pass. The agent first assembled an overall specification from references and oral description, then repeatedly revised the trunk skeleton, primary through tertiary branches, crown layers, leaf cards, buttress roots, aerial roots, and base in Blender. Many versions were preserved, each addressing a specific problem: the crown looked like a uniform fan; the upper trunk felt empty; foliage clumps did not sit at branch tips; the stones around the base looked like one regular ring.

The user reviewed both isolated Blender images and the tree inside the campus. A tree could look convincing on its own yet appear too tall, too heavy, obscure the buildings, or distort the perceived scale of the playground once placed in context.

The leaves created their own material problem. Transparent foliage can develop pale fringes when compression, resizing, or alpha clipping is mishandled. Raising the transparency cutoff was not enough. The solution involved the colour stored around transparent atlas edges, alpha testing, texture compression, and backlit appearance, all evaluated at both near and far distances.

Runtime LOD was also investigated. Three levels of detail, progressive loading, and failure fallback were implemented and tested. The user ultimately preferred the full tree at all distances, so runtime LOD was removed completely rather than left as dormant complexity.

Later, the banyan and a taller playground tree were both reduced to about eight metres after review in the live campus. The more detailed an asset becomes, the more important it is to judge it against the scale of the whole place.

## 9. Establishing the Art Direction

At first, the visual brief consisted of phrases such as “nostalgic,” “hand-drawn animation,” and “like a childhood memory.” The agent needed to turn those feelings into rules that could be applied and reviewed.

The final direction combined original cel-like colour blocks with soft watercolour transitions. The setting was midsummer near noon: bright sunlight, blue-green but breathable shadows, clear silhouettes for buildings and vegetation, and an overall warmth that never collapsed into an orange filter.

Several directions were explicitly rejected:

- photorealism;
- a sinister, ruined, or horror-school atmosphere;
- a heavy vintage-yellow filter;
- highly saturated plastic cartoon colours;
- direct imitation of the shots, characters, or proprietary designs of an existing animated work;
- full-screen paper grain or noise used as a shortcut for “watercolour.”

The desired animated nostalgia became a visual language specific to this project: broad forms remained legible, watercolour variation stayed low-frequency, walls were faded but not blackened with grime, sunlight was warm, shadows retained air, and old facilities felt approachable rather than frightening.

This direction was written into art and material guidelines and then used consistently for walls, timber doors, metal windows, tiled roofs, trees, and campus imagery.

## 10. Making the Wall and Ground Materials

Most of the campus shell is generated procedurally in Three.js, so its walls cannot rely on the hand-unwrapped UV layout of a standalone model. They needed a material system suited to parametric architecture.

Each building type first received a base colour. Building 1 used off-white walls with yellow structural members; Building 2 used ochre-yellow exterior walls; both used warm white for interior walls and ceilings. Four watercolour variants were then created for each surface family.

These textures were not intended to imitate photographic dirt. They contained broad colour variation, fading, water marks, and restrained ageing. The off-white walls varied through warm wheat and pale beige-brown; the ochre walls used tea and yellow-brown; the interior whites carried only a trace of cool blue-grey air. Dark grime was tightly limited because it could turn a warm old school into a threatening ruin.

The walls use continuous world-space projection in Three.js. Horizontal texture scale is controlled in metres and may repeat with mirroring; vertical alignment resets every 3.1-metre storey. A stable name hash selects one of the four variants for each wall segment, preventing adjacent areas from repeating the same pattern while also keeping the result deterministic across page loads.

The first pass of ageing was too strong, particularly on the ochre building. The fix was not to raise exposure or whiten the light. The textures themselves were mixed back toward their respective base colours. That preserved the watercolour variation while restoring the clean, warm quality of the memory.

The boundary walls and gate pillars use a different atlas approach. Two complete wall variants are combined into a WebP atlas and projected continuously along long sections with alternating mirroring. The gate pillars use a blue-grey stone atlas with four distinct faces, so each direction differs slightly and damp marks remain near the base.

The ground and terrace materials went through a similar process. Stretching a single texture over a large irregular surface produced obvious distortion; scattering many crack decals looked equally artificial. The final approach first separated concrete, earth, sand, and terrace regions, controlled their world scales and projection directions, and then added only a restrained amount of hand-drawn cracking, colour variation, and contact shading.

## 11. Materials for Standalone Models

Standalone GLBs—the toilet, quarters, old classrooms, sandpit, slide, doors, windows, and trees—use Blender UVs and texture atlases.

The usual sequence was to confirm proportion and silhouette first, unwrap the UVs, and then produce base colour, roughness, normal, or transparent foliage atlases as needed. Most of the artistic information lives in the base colour. Normal response and highlights support the volume without pursuing an aggressively realistic PBR appearance.

Different textures require different compression. Ordinary colour maps can use high-quality lossy WebP, while normal, metalness, and roughness maps cannot tolerate colour drift and therefore use lossless WebP. Foliage textures require an additional review of alpha quality around their edges.

Every candidate returned to the browser for evaluation. Blender’s material preview could not substitute for the actual scene, where Three.js lighting, shadows, colour space, fog, viewing distance, and reflected colour from surrounding buildings all affected the result.

## 12. Bringing Textbooks, Exercise Books, and Posters into the School

Once the architecture and environment were stable, the project began adding the objects that made the campus feel inhabited: corridor posters, school rules, certificates, blackboard newspapers, classroom slogans, old textbooks, exercise books, chalk boxes, and pieces of chalk.

The imagery fell into two groups.

The first comprised original period-inspired works about school labour, study discipline, courtesy, and similar themes. References established the palette, printing character, and composition of the early 1980s, but the figures, actions, and final designs were newly created. Faces, wording, watermarks, and complete compositions from source images were not copied.

The second group comprised restorations of historical covers, including old Chinese-language, mathematics, and history textbooks. These could not be freely redrawn. Constrained image editing was used to restore skewed, low-resolution, or background-contaminated covers to a frontal view while preserving the original people, poses, objects, titles, volume labels, publisher text, and negative space as closely as possible. Tables, neighbouring books, perspective, and cast shadows were removed; missing edges received only minimal continuation.

The pipeline preserved several levels of each image: generation or restoration intermediates, high-resolution masters, and runtime WebP files. Python and ImageMagick scripts standardised crops, resizing, and export so that dozens of images did not acquire inconsistent dimensions or quality through manual handling.

The runtime did not place high-resolution books on every desk. A small number of representative locations were populated sparsely, giving the classrooms traces of daily life without multiplying texture and draw costs.

## 13. From a Place to Look At to a Place to Play

The first half of development concentrated on space and visual character. The second increasingly addressed first-person movement and interaction.

The complete scene now begins at the school gate by default. An opening camera descends slowly from the south-east, decelerates, and transitions into first person outside the entrance. On desktop, the same user gesture that enters the experience requests Pointer Lock, avoiding a second, disconnected click.

First-person movement involved far more than adding WASD controls. Ground sampling, stairs, steps, stacked floor slabs, openings, railings, and classroom furniture all needed collision behaviour. The player radius eventually settled at 0.20 metres: narrow enough to pass through old classroom aisles without allowing the player through walls.

Interaction rules gradually converged. An object could be used only when the player was within 2.5 metres and the ray to it was not blocked by a wall or another solid object. Doors, windows, desks, blackboards, chalk, and chalk boxes all followed the same distance logic.

Mobile interaction could not simply inherit the desktop design. An early audit found that the phone version could look around by dragging but could not move, because movement still read only the keyboard. A left virtual stick, right-side look gesture, touch-safe regions, and portrait and landscape layouts were added.

Touch interaction initially cast a ray directly from the finger, which conflicted with dragging to look. It was changed so that a tap performed the general interaction through the centre reticle. Doors, desks, and chalk therefore use one spatial aiming model on mobile rather than a collection of unrelated touch targets.

## 14. Blackboard and Chalk: Completing a Small Interaction

The blackboard began with a simple idea—let the player draw on it—but a complete implementation involved viewpoint, coordinate mapping, persistence, touch, and state ownership.

When a player approaches a teaching blackboard from the front and enters drawing mode, mouse or touch input is mapped into the board’s own two-dimensional coordinates. Strokes are rendered to a texture canvas and updated on the 3D surface. Players can draw, erase, or clear the board, and all 22 classroom blackboards keep separate content.

To preserve that content across page reloads, the project introduced a unified browser-local user-data layer with versioning and a namespace. Blackboard code no longer scattered direct `localStorage` access through the runtime, and later personal state could share the same boundary.

Chalk developed into a small state system of its own. A player can pick up a piece from the teacher’s platform, hold to charge a throw, and release it. Simplified physics lets the chalk strike floors, walls, and furniture; after landing, it can be picked up again.

An early bug made the ownership problem visible: after a piece was picked up, it appeared in the player’s hand, but its static instance remained on the platform. Display geometry, held objects, and physics objects each tracked state independently. The fix removed the matching platform instance completely on pickup. Every classroom maintains a pool of six active pieces; leaving the room resets it, while clicking the chalk box recalls all pieces at once.

The result is a complete loop: static placement, held object, flight, collision, landing, pickup, and return.

## 15. Finding the Performance Problems

As the campus grew, subjective impressions were no longer enough to diagnose performance. The project needed repeatable baselines.

Vite handled development and builds, while Playwright ran fixed scenarios in Chrome. Automation recorded build size, runtime asset counts, entry JavaScript, draw calls, triangles, texture counts, estimated GPU memory, scene-ready time, and P95 frame time. Six fixed screenshots covered the full-campus aerial view, front gate, Building 1 courtyard, main playground, old-classroom activity yard, and quarters-and-slide area.

The first complete-scene audit showed that the weak-network bottleneck was not GLB parsing but data transfer. Embedded images accounted for roughly 80 percent of the size of the 18 main GLBs. Locally the scene became ready in under a second, but under simulated 20 Mbps bandwidth and 100 ms latency, the complete load took about 17 seconds.

That measurement changed the order of optimisation. The agent did not begin by damaging silhouettes through aggressive polygon reduction. It first addressed the dominant embedded PNGs: colour textures became high-quality WebP; normals and other data maps became lossless WebP; shared concrete textures were scheduled earlier. Conservative Meshopt compression followed for buildings and the slide where appropriate.

This became a recurring principle: identify the bottleneck before choosing the tool. A large file is not necessarily a geometry problem, and low frame rate does not automatically justify reducing visual quality.

## 16. Optimisations That Did Not Become Production Features

Several technically viable experiments were ultimately rejected as production solutions.

### Banyan LOD

Three detail levels, progressive loading, and a fallback that retained a lower-detail tree if the high-detail load failed were all implemented and tested. The user preferred the full silhouette at every distance, so the project rejected runtime LOD globally at that stage. The corresponding runtime logic was removed, while the report remained as a historical record.

### KTX2 texture compression

A shared concrete texture received KTX2 candidates. UASTC performed well in GPU memory and file size, but using it for a single texture added KTX2Loader, Basis JavaScript, and WebAssembly requests to the core infrastructure. ETC1S also produced visible dark fringes at close range. KTX2 remained an experimental switch rather than the default path.

### A single-request core bundle

The project also tested packing several core assets into one request to reduce weak-network request overhead. Measurements showed more coupling without enough benefit to justify the architecture change, so production returned to independent GLBs with shared WebP resources.

These experiments were not erased as if they had never happened. Candidates, measurements, rejection reasons, and restoration steps were retained in reports and archives so that a future contributor would not repeat the same work without context.

## 17. Why the Loading Screen Had to Leave Last

During mobile and weak-network optimisation, the team considered admitting the player into an incomplete campus while the remaining models appeared in the background.

The user made a firm decision: the base campus must be fully preloaded, and the loading screen could close only after required models, textures, materials, collision data, and the first GPU frame were all ready. This rule prevented an unfinished campus from being exposed. It did not forbid managing already-loaded classroom detail according to the player’s location. The later classroom-level detail system still retained full preload and full close-range models; it changed only the set participating in rendering at a given moment.

Implementation revealed that awaiting application-level promises was insufficient. Images embedded in a Three.js GLB could still be decoding and uploading after the loader’s numeric progress appeared complete. A physical-resource completion barrier was therefore added, and the first GPU-rendered frame became part of the release condition.

This separated three states that had previously been easy to conflate: download complete, parse complete, and safe for the player to enter. The third became the actual entry criterion. Background music was later excluded from this barrier—music may become ready later, but the visible campus still arrives as a whole rather than assembling in fragments.

## 18. Testing, Archiving, and Rollback

As complexity increased, a change in one area could easily affect another. A shared wall material could alter two buildings. A collision adjustment could improve stairs and break doorways. Foliage compression could accelerate a distant view while creating white fringes up close.

The project therefore established several layers of validation:

- every production build checked file-size and file-count budgets;
- browser instrumentation recorded draw calls, triangles, textures, and frame time;
- Playwright compared six fixed views with a maximum pixel-difference tolerance of 0.8 percent;
- automated tests covered collision, doors and windows, touch, loading, blackboards, and chalk;
- a person continued to inspect close-range colour, transparency edges, material seams, and interaction feel in a real browser;
- high-risk changes first wrote candidates to `artifacts/` and replaced production assets only after review;
- previous runtime assets were saved under `archive/phase-*`, with reports recording parameters, hashes, sizes, and recovery instructions.

`handoff.md` also played a distinct role. It was not this narrative article but a living engineering handoff ledger. Important dimensions, materials, interactions, and performance decisions confirmed by the user were recorded there, including results that must not regress. Across many conversations, a new agent could recover the active baseline without mistaking an old experiment for the current task.

## 19. How the Human–Agent Collaboration Worked

Looking back, the person and the agent did not relate simply as client and implementer. They were co-creators with different forms of knowledge.

The person possessed things the agent could not discover independently: first-hand memory, spatial intuition, a judgement of whether something “felt like the place,” and the emotional importance of a particular tree or passage. A model might match common building standards and still feel too tall from the school gate. That judgement mattered because the project reconstructed this particular school, not a statistically average one.

The agent translated those impressions into workable intermediate forms: evidence notes, lists of unknowns, SVG drawings, metre-based parameters, Blender assets, textures, code, collision, tests, and recovery paths. When the user did not express an issue in 3D terminology, the agent proposed a testable interpretation rather than requiring them to learn the vocabulary first.

The most common loop was:

1. The person supplied a sketch, reference image, memory, or observation that something looked wrong.
2. The agent restated its understanding and separated known from unknown.
3. The agent produced the smallest version that could be judged.
4. The person confirmed or corrected it through a drawing, screenshot, or first-person experience.
5. The agent updated evidence, parameters, assets, and tests.
6. Once confirmed, the result was archived as the baseline for the next round.

This loop suited memory reconstruction better than a single exhaustive specification. Many details returned only after the person saw a first version. If the agent treated that version as final, unsupported guesses would accumulate. If the person had to remember everything before work began, the project could never have started.

What they shared was not a perfect requirements document, but a method for converging on the place.

## 20. Lessons from the Process

### 1. Make understanding reviewable before making the model

With sketches and oral recollection, the first priority is not fast generation. It is writing down the agent’s interpretation so that errors can be corrected at their cheapest point.

### 2. Uncertainty does not prevent development

A candidate dimension can be used as long as it is labelled as a candidate. A strong system does not pretend the unknowns have vanished; it keeps them replaceable.

### 3. Approve a sample before expanding a batch

One wall, one door, one tree, or one poster should establish the style before dozens are produced. A sample turns abstract taste into a concrete choice.

### 4. The final medium is the final place of judgement

Architecture cannot be judged only on a plan, a tree only in Blender, or a material only as a texture. Everything must return to the real browser under the correct light, viewing distance, neighbouring geometry, and first-person scale.

### 5. Qualitative feedback can become engineering parameters

“Too dirty” can become lower ageing contrast and a mix toward the base colour. “Too tall” can become an eight-metre scale. “Too narrow” can become a 0.20-metre player radius. “I can’t click it” can become a shared 2.5-metre interaction range. Translating one into the other is a central part of the agent’s job.

### 6. A correction must travel through the whole evidence chain

Adding three windows to the old classrooms is not only a GLB edit. The source note, plan and elevation rules, concept art, collision, screenshots, and tests should all change. Otherwise the old mistake will return in a later round.

### 7. Optimisation is not a contest of numbers

Smaller files, fewer requests, and lower triangle counts are not independent goals. They matter only when they preserve the visual, spatial, and interactive qualities the user has confirmed.

### 8. Rejected experiments deserve records

LOD, KTX2, and bundling did not become the production defaults, but each yielded a useful conclusion. Retaining those conclusions avoids paying for the same experiment twice.

### 9. A handoff document is shared long-term memory

A project spanning many conversations needs a place more durable than chat context for confirmed facts, retired approaches, failure causes, and recovery procedures. Much of this project’s continuity came from externalising that shared memory.

## 21. Turning a Basketball Prop into an Open-Ended Interaction

As the campus filled with everyday objects, the project began adding more complete sports experiences. Basketball came first.

The three basketballs began as static assets near the flag platform. Rather than accept a downloaded GLB unchanged, the agent inspected its source, removed unrelated objects, rebuilt the material assignment, and standardised the ball to a real-world diameter of about 24 centimetres. The colour became a faded warm orange-brown with no modern branding: worn, but still recognisably a ball in use.

The user later corrected the location of the hoop. It did not stand on the eastern terrace or beside the flag platform, as first assumed. It stood on the main concrete ground south of the climbing frame, near the second horsetail pine counted from east to west, with the rim facing south. The change reinforced a familiar lesson: a sports fixture could not be placed wherever empty ground happened to exist. Its relationship to a particular tree and section of concrete was itself part of the memory.

The final interaction did not turn basketball into a separate level. All three balls remained in the campus. Players could approach, pick one up, charge a throw, push it, or kick it. A fixed-step local physics simulation handled contact with the ground, backboard, segmented rim, and main support structure, with different bounce and rolling response on concrete and earth. A valid basket had to pass first above the rim and then downward through its plane, preventing a ball entering from below from being counted.

Dynamic shadows exposed a representative systems problem. Once the campus is fully loaded, its sun shadow map is frozen to avoid a continuous scene-wide rendering cost. If basketballs remained in that map, moving one left a permanent “ghost” shadow at its old position. Instead of reactivating live shadows across the campus, the agent built an analytic projected ellipse for each ball. Its position, scale, and opacity update from the sun direction, ball height, and actual ground height. Players gain useful depth and landing cues without making the whole school redraw shadows for three small objects.

Pickup, release, floor impact, backboard, rim, and scoring sounds completed the interaction. It remains an open-ended part of walking through the school: a player can take a few shots and then continue toward a classroom or another corner of the playground. No task has to be completed, and no long-term score is required.

## 22. Turning Six Old Tables into Table-Tennis Practice and a Match

After basketball, work moved to the six fixed masonry table-tennis tables on the west side of the campus.

Table tennis did not reuse the basketball system. Basketball is a free object in an open scene; table tennis needs a fixed camera, paddle input, serving phases, net clearance, table bounces, rally decisions, and an AI opponent. It received an independent controller and local physics model, shared by all six tables. Approaching any table lets the player choose free practice or a first-to-seven singles match. On exit, the original position, direction, and campus movement state return, and the score is not written to long-term storage.

The first version was playable but far from final. In live testing, the user noticed that the first-person camera still turned with the mouse during a match, so the paddle and the view competed for the same input. The camera was also too close to the table to see it comfortably. Pointer Lock was retained for unlimited relative mouse motion, but free look was disabled during play. The camera moved back and was ultimately fixed, leaving the mouse to control only the paddle.

More than ten rounds of adjustment followed from the feel of actual strokes. Horizontal paddle motion was aligned with screen direction. Input lag from paddle chasing was removed. Collision began testing the full swept path from the previous frame to the current one, so a fast stroke could not tunnel through the tiny ball. Serving changed from an automatic hit to a toss followed by a real paddle contact on the way down. Before the toss, the ball followed the paddle position, and stroke direction could produce an obvious cross-court serve. Regular returns no longer required an extra click: contact was enough, with the recent real stroke vector determining lateral direction, arc, and force.

The user continued to tune ball speed, toss height, mouse sensitivity, and the virtual paddle area. The virtual area does not secretly enlarge the visible model; it gives collision slightly more tolerance than the mesh so that mouse and touch control feel closer to holding a real paddle. Like the basketball, the table-tennis ball uses an analytic shadow. Above the table the shadow lands on the tabletop; once the ball travels outside it, the shadow transfers to the campus ground, helping the player read height and landing position.

The process made clear why automated tests cannot declare game feel complete. Tests can prove that the ball clears the net, bounces, scores, and responds to input. They cannot decide whether it floats, follows the hand, or produces a natural diagonal. Each observation was translated into a small input or physics variable, usually changing one main factor at a time, while regression tests protected rules established in earlier rounds.

## 23. How Phone Testing Changed Both Interaction and Performance Work

Table tennis on a phone exposed problems that did not exist on desktop.

The first touch interface used several HTML buttons and sticks. They obscured the playfield and divided “move the paddle,” “swing,” and “exit” among competing controls. The buttons were removed, the whole canvas became the paddle-control surface, and entry and exit moved to 3D controls in the scene. During a rally, the player only needs to move a finger and make the paddle meet the ball.

The serving gesture passed through two opposite designs. Initially, touch-down tossed the ball immediately. The same press had to position the paddle while also releasing the ball before the player was ready, forcing them to lift and reacquire it. After testing on a physical phone, the user requested “hold to position, release to toss.” The ball now follows the paddle while the finger is down and rises from the final position only on release. Its mobile airtime is slightly longer than on desktop, giving the player time to touch down again and control the paddle. Testing confirmed that this version felt much more natural, so it became the mobile baseline.

Longer sessions on a real phone also revealed a subtler performance issue. Walking or playing continuously produced gradually worsening stutter; standing still and letting the sounds stop allowed performance to recover. That observation narrowed the investigation from “the phone is too slow” to audio lifecycle management.

The agent introduced a shared active-channel system for sound effects. Footsteps, doors, windows, furniture, chalk, blackboards, basketball, table tennis, and interface sounds now disconnect their nodes and leave the active set when playback finishes. High-frequency impacts have per-category channel limits, and excessively dense repeats are discarded. Automated tests play each sound family and simulate bursts of basketball bounces, chalk impacts, and table-tennis contacts, verifying that the active-channel count returns to zero.

Rendering changes followed the same single-variable discipline. The project disabled the browser setting that preserved the default colour buffer every frame, reducing memory bandwidth and compositing pressure on phones. It did not simultaneously lower pixel ratio, remove ambient occlusion, change shadows, delete models, or introduce LOD. The next round of device testing could therefore evaluate that one change instead of confronting an inseparable bundle of visual and gameplay differences.

Mobile had ceased to be a reduced version of desktop. It became a primary validation environment. Touch rhythm was decided by real fingers, sustained play revealed lifecycle leaks, and measurable experiments traced those problems to their sources.

## 24. How First-Hand Scene Knowledge Led to Classroom-Level Detail Management

The classroom rendering work of August 20, 2026, is a particularly clear example of human–agent collaboration. It did not begin with the agent selecting a fashionable technique from a generic optimisation checklist. It began with a precise observation from sustained play: when the player stands near Building 1, there is no need for every desk, texture, and object inside Building 2 to participate in rendering, and vice versa. Once a player is inside one classroom, even the simplified furniture in every other room provides no useful image contribution.

This contained knowledge that code statistics alone could not provide. The campus is not a gallery in which every interior must remain simultaneously visible. It is a first-person environment whose walls and distances naturally block most rooms. The human first identified what a player could plausibly see; the agent translated that into visibility rules, spatial bounds, and switching conditions.

The stable implementation was preserved and the first experiment was developed separately. Interior render roots were initially grouped by teaching building: near or inside Building 1, full classroom detail in Building 2 did not draw, and the reverse applied near Building 2. Only after the user experienced a clear improvement in the live scene did the project continue in that direction. A theoretical draw-call reduction alone was not considered approval.

The second step reduced the granularity to individual rooms. Each classroom’s detailed wall materials, desks, platform, blackboard, fans, textbooks, posters, and other objects entered its own render group. Full content activates when the player enters or comes within about three metres of the door. It deactivates at a slightly greater distance, creating hysteresis so that minor movement around a threshold does not cause visible flicker.

From outdoors, the player still needs to perceive a rough classroom structure through doors and windows, so emptying every inactive room was inappropriate. The agent created untextured simplified student desks, then added a teacher’s desk and blackboard after review. Here the strengths of each collaborator were again distinct. The agent could generate low-cost geometry and merge it with `InstancedMesh`; the user could immediately see that the first simplified desk resembled broken furniture because its central divider was missing. The geometry was corrected rather than excused as “only LOD.”

Another rule followed. Once the player enters any classroom, all simplified desks, platforms, and blackboards in other rooms stop drawing. They return only after the player leaves the interior. The rule exploits a simple fact: from inside an enclosed classroom, the player cannot see the interiors of other rooms. It removes more draw calls without lowering the quality of the room being occupied.

The user then noticed that Building 2 appeared yellow in its simplified state and abruptly turned white at close range. The discontinuity did not reduce frame rate, but it made the optimisation visible. An untextured white interior shell was added to the simplified state so that both levels retained the same aggregate colour. Detail management must preserve visual continuity between states; a conspicuous switch can turn a performance gain into a perceptual loss.

The work also triggered an unexpected regression. After restarting the server, Meshopt-compressed GLBs for the toilet, old classrooms, quarters, banyan, and slide disappeared. The visibility system initially looked guilty, but runtime inspection showed that their root nodes had never been created. The cause was a stale Vite dependency cache referencing an old Meshopt decoder hash and returning `504 Outdated Optimize Dep`. Rebuilding the dependency cache restored the assets. These critical models were also added to the load barrier so that decoder failure could no longer be hidden behind a false “campus ready” state.

The value of this work was not merely a set of LOD rules. The person contributed a continuing judgement of genuinely visible space, acceptable switch timing, and unacceptable damage or colour popping. The agent implemented those judgements as a layered scene tree, classroom activation, distance hysteresis, instanced proxies, failure barriers, and a reversible experimental path. Performance improved through the closed loop: experience posed the right question, engineering made it measurable and safe to undo, and real play decided whether to keep it.

It also refined an earlier broad judgement about LOD. Rejecting multi-level LOD for the banyan because it damaged the silhouette did not mean every form of detail management was wrong for the project. Teaching buildings have strong occlusion and highly repeated interiors; managing detail by classroom follows the player’s sightlines far better. Optimisation should be judged for the particular object and viewing pattern, not generalised from the success or failure of one experiment.

## 25. How an Old Handheld Became a Memory Machine the Human and Agent Could Disassemble Together

The Nintendo Game & Watch *Octopus* introduced a different kind of collaboration. It began not with architectural scale but with a very specific school memory: some pupils brought a Game & Watch to school, hid it in the storage shelf beneath a desk, and played during breaks. The user wanted the player to discover one in a classroom and open a full-screen view of the actual old object they remembered—not a modern imitation.

The first technical version was functional but visually misguided. Procedural geometry formed the casing, while Canvas drawing functions recreated LCD divers, tentacles, and digits. It responded to controls and kept score, but the user quickly pointed out how far it remained from the original device. A Game & Watch is remembered not only for its rules but for the material combination of yellowed plastic, reddish-brown trim, grey-green glass, and a coloured printed scene beneath the LCD. If the machine and liquid-crystal figures are redrawn as approximate shapes, playability alone cannot recover that object memory.

The user proposed the decisive change: the front of the device should be a photorealistic image and should remain that same image during play. Apart from button feedback, most of the hardware never needs to move. The LCD is not a modern display on which arbitrary graphics are drawn. It combines a fixed printed colour background with many predefined liquid-crystal electrodes; animation is only a sequence of those fixed shapes turning on and off.

That observation overturned the original implementation and clarified the real problem. The agent rebuilt the full-screen view as an orthographic 2D composite: a photorealistic base image underneath, active LCD segments in the middle, and the glass character above. The object in the classroom retained only a thin shell for thickness and shadow. Runtime no longer moved or redrew characters. It answered one question per frame: which physical segments should be visible now?

This made the difficult work more apparent. An all-segments-on source contained divers, treasure, four tentacles, digits, life indicators, mode text, and caught poses. Some shapes touched; others belonged to one electrode despite being broken into separate islands. Pure connected-component analysis could locate pixels but could not assign meaning. A detached head, torso, and limbs might be one physical electrode. A shape that looked like part of a tentacle might actually be the leg of a struggling diver. Mathematical neatness did not produce a usable game model.

The collaborators therefore created a new intermediate language: a manually coloured ownership map. The agent converted the illuminated LCD reference into a pseudocolour image at the original coordinates, and the user edited those colours directly. The rules were simple and precise: one independently switched physical electrode receives one colour; disconnected islands belonging to that same electrode remain the same colour; shapes that need to blink separately must use different colours. The user did not need to write JSON or understand shaders and atlases. They only needed to judge, from knowledge of the object and its animation, which shapes should light together.

Several refinement rounds followed. The user removed tiny generated marks that never existed on the original display, identified two regions as noise, and rejected another numbered segment. A more important correction concerned the tentacles: the agent had assigned several shapes to them, but the user recognised the shapes as parts of a diver being caught. The user then determined that the caught body should remain complete while two pairs of legs alternated to show struggling. That became a two-frame animation with a fixed body and alternating leg groups.

The user also found a way to simplify the production pipeline. If the ownership map already described every active pixel, it could be converted directly into a unified black LCD texture; there was no reason to maintain a second black master that might drift out of alignment. The coloured map became the authoritative source of physical contours, and the agent made its interpretation deterministic. An import script checked that every enlarged block used a pure colour and normalised the map to the true LCD dimensions. Each colour produced one physical segment, retaining disconnected islands together. All segments were packed into a transparent atlas, accompanied by a manifest, numbered map, per-segment contact sheet, and representative-state sheets. Automated validation required zero overlapping pixels, zero unassigned pixels, zero out-of-bounds pixels, and zero difference when reconstructing the all-on image. The user never had to hand-crop more than seventy transparent images, and the agent could not silently reinterpret the shapes beyond the approved map.

This was not a case of a person performing tedious work that a machine could not. Judgement was assigned to the collaborator best suited to it. A person can recognise whose leg a mark represents, whether a shape is treasure, and whether two fragments should blink together. The agent can guarantee that tens of thousands of pixels have no gaps or overlaps and propagate one approved decision through an atlas, semantic table, runtime, and test suite. The editable colour map became a shared working surface without forcing the person to learn a program data structure or allowing the agent to pretend it could infer every rule from pixels alone.

The exchange continued after the asset entered the game. The user reported that the LCD was too large, buttons were misaligned, and the playfield sat too far left. When the active play segments moved right, the already-correct `GAME A` and `GAME B` indicators needed to remain in place, so the agent separated activity and mode segments into groups with independent offsets. The user then identified missing fixed background elements: the small boat at upper left, the rope on the left, and the stern of the wreck at right. They specifically asked not to keep refining an image that had already passed through many edits. Production returned to the earliest approved high-quality source, completed all fixed-background repairs and active-LCD removal in one pass, and used only lossless cropping afterwards.

Rules were corrected through watching and play as well. The first collision table let the diver be caught by the first tentacle immediately after leaving the boat. The user spotted the implausible behaviour at once. Inspection showed that the departure position lacked explicit protection as a safe state, so the first tentacle’s branches and collision range were redefined. The unlit Game A and Game B labels came from treating them as part of the static background or omitting them from the active manifest; they were extracted at their original positions as independent, mutually exclusive LCD segments.

Sound and interface design followed the same pattern. The initial effects felt too thin, and the user asked for research into the original sound character rather than the addition of modern music. Drawing on the one-bit piezo output of early handhelds, the sound design became sequences of short square-wave pulses for movement, tentacles, treasure pickup, returning to the boat, recovery, misses, and game over, while the TIME demonstration remained silent. Top-of-screen instructions initially crowded desktop keyboard and phone touch guidance into one large, bright block. They were separated by input type and reduced to a quiet two- or three-line layout.

The exit button exposed a subtler state bug. To prevent one exit gesture from passing through into the campus canvas, the first implementation unconditionally swallowed “the next click.” If the browser did not emit the expected trailing click, that flag remained and consumed the player’s later attempt to start bamboo climbing. The user discovered the defect not in a log but by moving from one activity to another. Suppression was narrowed to a click within 750 milliseconds and near the exit button’s coordinates, and a chained regression now verifies that the player can leave the handheld and immediately begin charging a bamboo-climbing move. `Esc` and the top-right close button were also routed through the same restoration path.

The final *Octopus* is more than a playable handheld. It produced a reusable method: approve the photorealistic hardware; create a base image with active LCD removed; express electrode ownership through manual colouring; generate a monochrome atlas with zero-difference validation; let a person confirm semantics and representative animation; switch only fixed segments at runtime; and finally calibrate alignment, rules, sound, touch, and lifecycle in the real browser. The method has been documented for later devices such as *Manhole* and *Helmet*, although each will still require its own human judgement.

The work extends the project’s central idea. In the campus, the person remembers and the agent turns memory into a space that can be tested. Inside the old handheld, the person also identifies what the pixels mean, while the agent makes that meaning exact, testable, and repeatable.

## 26. Where the Project Stood

As of August 22, 2026, the project had reconstructed the main campus layout and five buildings, together with the continuous raised terrace, boundary walls, gate, playground, sandpit, sports fixtures, trees, and slide. Both teaching buildings had enterable classrooms, corridors, steps, and stairs. Major doors, windows, and standalone buildings had been replaced with production GLBs. Walls, ground, trees, and facilities shared one hand-painted watercolour direction.

Classrooms contained desks, stools, blackboards, teacher’s platforms, textbooks, exercise books, posters, certificates, chalk boxes, and chalk. Desktop and mobile players could enter through the gate and walk through the campus. They could open doors and windows, sit down, draw on all 22 teaching blackboards and preserve the drawings, pick up chalk, charge and throw it, recover it after landing, and return it to its box.

The campus included a unified set of common and interactive sounds. Basketballs supported pickup, throwing, pushing, kicking, bounce, roll, basket validation, and dynamic landing shadows. All six western table-tennis tables supported practice and first-to-seven single-player matches, with camera, serving, stroke direction, speed, and touch control refined through repeated desktop and phone play.

A Nintendo Game & Watch *Octopus* OC-22 sat in the desk shelf of a classroom in Building 2. Clicking it opened a photorealistic full-screen device supporting Game A, Game B, and TIME through keyboard, mouse, and multi-touch. Its manually confirmed fixed-segment LCD atlas supported treasure collection, returns to the boat, tentacles, collision, misses, game over, separate high scores, and period-style pulse sounds. Exiting restored the campus completely and allowed an immediate transition into activities such as bamboo climbing. Its production process had also become a reusable guide for future handhelds.

The runtime continued to preload the complete base campus and use full models at close range. Teaching interiors used classroom-level activation; from outdoors, untextured simplified desks, platforms, blackboards, and Building 2 interior shells preserved visible structure. Once a player entered any room, proxies in other rooms stopped drawing. The project had browser tests, performance budgets, visual baselines, asset archives, a local user-data layer, and unified audio lifecycle management, making it possible to add further stories, period objects, and interactions without sacrificing the confirmed work.

What remained open was mostly refinement rather than missing foundations. Some C-level dimensions could change if new memories surfaced. Sustained mobile frame rate, heat, and portrait and landscape behaviour still needed continuing device observation. More personal stories, period objects, and small games could be added over time.

## Conclusion

What makes this project distinctive is not any single use of Three.js, Blender, image generation, or automated testing. It is the way those tools were organised into a process that serves memory.

The person supplied sketches, references, recollections, and feelings. The agent organised them as evidence, drawings, parameters, models, materials, and interactions. The person entered the result and judged what did and did not feel right. The agent revised it and wrote the new decision back into the documentation and tests. The campus was not “generated” from an image in one pass. It became clearer through repeated acts of looking and correction.

In one sentence:

**The person remembers. The agent turns that memory into a space that can be tested. Then the person walks into that space and helps the agent bring it closer to the memory.**
