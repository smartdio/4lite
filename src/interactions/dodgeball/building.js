import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CAMPUS } from '../../campus-config.js';

/**
 * Complete, deliberately stylized second teaching building for the independent
 * composition study. Its dimensions follow the campus source of truth; it is
 * never substituted for the campus building or selected by distance/quality.
 * Local coordinates: front edge Z=0, rear edge Z=-depth, ground Y=0.
 */
export function createDodgeballBuilding({ THREE, palette }) {
  const b = CAMPUS.buildings.building2;
  const [width, depth] = b.size;
  const west = -width / 2, east = width / 2, back = -depth;
  const base = b.raised, h = b.floorHeight, t = b.wall;
  const rearWall = back + t / 2;
  const rearInner = back + t;
  const frontWall = -b.corridor - t / 2;
  const corridorInner = -b.corridor;
  const roofY = base + b.floors * h;
  const buckets = new Map();
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const transform = new THREE.Object3D();
  let boxCount = 0;

  // The same source cube is transformed and merged by shared material. Only
  // one draw per material survives, including the hundreds of railing bars.
  function box(key, x, y, z, sx, sy, sz, rotationX = 0, shearYZ = 0) {
    if (sx <= 0 || sy <= 0 || sz <= 0) return;
    transform.position.set(x, y, z);
    transform.rotation.set(rotationX, 0, 0);
    transform.scale.set(sx, sy, sz);
    transform.updateMatrix();
    if (shearYZ) transform.matrix.elements[9] = shearYZ * sz;
    const geometry = unit.clone().applyMatrix4(transform.matrix);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(geometry);
    boxCount++;
  }

  function wallWithOpenings(x0, x1, y, z, height, openings) {
    let cursor = x0;
    for (const opening of [...openings].sort((a, c) => a.x - c.x)) {
      const a = opening.x - opening.width / 2;
      const c = opening.x + opening.width / 2;
      box('wall', (cursor + a) / 2, y + height / 2, z, a - cursor, height, t);
      box('wall', opening.x, y + opening.bottom / 2, z,
        opening.width, opening.bottom, t);
      const above = height - opening.bottom - opening.height;
      box('wall', opening.x, y + height - above / 2, z,
        opening.width, above, t);
      cursor = c;
    }
    box('wall', (cursor + x1) / 2, y + height / 2, z, x1 - cursor, height, t);
  }

  function windowAt(x, floorY, z, outward) {
    const [ww, wh] = b.openings.window;
    const bottom = floorY + b.openings.sill;
    const centerY = bottom + wh / 2;
    const face = z + outward * (t / 2 + .015);
    const bar = .065;
    const transomY = bottom + wh - b.openings.windowTransom;
    box('woodDark', x, centerY, z, ww + .03, wh + .025, .12);
    box('glass', x, bottom + (wh - b.openings.windowTransom) / 2, face - outward * .045,
      ww - bar, wh - b.openings.windowTransom - bar, .035);
    box('glassLight', x, transomY + b.openings.windowTransom / 2, face - outward * .042,
      ww - bar, b.openings.windowTransom - bar, .035);
    for (const xx of [x - ww / 2, x, x + ww / 2]) {
      box('window', xx, centerY, face, bar, wh + bar, .095);
    }
    for (const yy of [bottom, transomY, bottom + wh]) {
      box('window', x, yy, face, ww + bar, bar, .095);
    }
    // A shallow horizontal sash and sill read cleanly at the wide game camera.
    box('window', x, bottom + .56, face, ww + bar, .045, .10);
    box('cream', x, bottom - .055, face + outward * .025, ww + .20, .10, .22);
  }

  function doorAt(x, floorY, z) {
    const [dw, dh] = b.openings.door;
    const openingHeight = dh + b.openings.doorTransom;
    const face = z + t / 2 + .017;
    box('woodDark', x, floorY + dh / 2, z + .035, dw + .06, dh, .10);
    box('wood', x, floorY + dh / 2, face - .045, dw - .025, dh - .04, .055);
    for (const panelY of [.53, 1.43]) {
      box('woodDark', x, floorY + panelY, face - .008, dw - .18, .70, .026);
      box('wood', x, floorY + panelY + .025, face + .009, dw - .25, .61, .020);
    }
    box('glassLight', x, floorY + dh + b.openings.doorTransom / 2, face - .036,
      dw - .06, b.openings.doorTransom - .045, .035);
    for (const xx of [x - dw / 2, x + dw / 2]) {
      box('woodDark', xx, floorY + openingHeight / 2, face, .072, openingHeight, .11);
    }
    for (const yy of [dh, openingHeight]) {
      box('woodDark', x, floorY + yy, face, dw + .07, .065, .11);
    }
    box('window', x + dw * .31, floorY + 1.02, face + .034, .08, .045, .055);
  }

  const wallXs = [west + t / 2];
  for (const clear of [b.classroom[0], b.classroom[0], b.stairBay,
    b.classroom[0], b.classroom[0]]) wallXs.push(wallXs.at(-1) + clear + t);
  const rooms = [[0, 1], [1, 2], [3, 4], [4, 5]].map(([a, c]) => ({
    start: wallXs[a] + t / 2, end: wallXs[c] - t / 2,
    center: (wallXs[a] + wallXs[c]) / 2,
  }));
  const stairRun = b.stair.risersPerFlight * b.stair.tread;
  const stairFront = rearInner + b.stair.landingDepth + stairRun;

  box('concrete', 0, (base - b.slabThickness) / 2, (back + b.foundationSouthExtension) / 2,
    width, base - b.slabThickness, depth + b.foundationSouthExtension);

  for (let floor = 0; floor < b.floors; floor++) {
    const y = base + floor * h;
    const structureH = h - b.slabThickness;
    if (floor === 0) {
      box('concrete', 0, y - b.slabThickness / 2, back / 2,
        width, b.slabThickness, depth);
    } else {
      // Leave the stair well genuinely open above the two flights.
      for (const sign of [-1, 1]) {
        const wingW = (width - b.stairBay) / 2;
        box('concrete', sign * (b.stairBay / 2 + wingW / 2), y - b.slabThickness / 2,
          back / 2, wingW, b.slabThickness, depth);
      }
      box('concrete', 0, y - b.slabThickness / 2, stairFront / 2,
        b.stairBay, b.slabThickness, -stairFront);
      box('wall', 0, y - b.slabThickness / 2, .008, width, b.slabThickness, .025);
      box('wall', 0, y - b.slabThickness / 2, back - .008, width, b.slabThickness, .025);
      for (const x of [west, east]) {
        box('wall', x, y - b.slabThickness / 2, back / 2, .025, b.slabThickness, depth);
      }
    }

    const rearOpenings = [];
    for (const room of rooms) {
      const frontOpenings = [
        ...[-3.875, 3.875].map(off => ({ x: room.center + off,
          width: b.openings.doorOpeningWidth, bottom: 0,
          height: b.openings.door[1] + b.openings.doorTransom })),
        ...[-1.15, 1.15].map(off => ({ x: room.center + off,
          width: b.openings.window[0], bottom: b.openings.sill, height: b.openings.window[1] })),
      ];
      wallWithOpenings(room.start, room.end, y, frontWall, structureH, frontOpenings);
      for (const off of [-3.875, 3.875]) doorAt(room.center + off, y, frontWall);
      for (const off of [-1.15, 1.15]) windowAt(room.center + off, y, frontWall, 1);
      for (const off of [-3.3, -1.1, 1.1, 3.3]) {
        rearOpenings.push({ x: room.center + off, width: b.openings.window[0],
          bottom: b.openings.sill, height: b.openings.window[1] });
        windowAt(room.center + off, y, rearWall, -1);
      }
      box('cream', room.center, y + structureH / 2, frontWall + t / 2 + .08,
        b.frameColumn[0], structureH, b.frameColumn[1]);
      box('cream', room.center, y + h - .23, (rearInner - .24) / 2,
        b.frameColumn[0], .14, -rearInner - .24);
    }
    wallWithOpenings(west, east, y, rearWall, structureH, rearOpenings);
    for (const x of wallXs) {
      box('wall', x, y + structureH / 2, (back + corridorInner) / 2,
        t, structureH, corridorInner - back);
      box('cream', x, y + structureH / 2, back - .06,
        b.frameColumn[0], structureH, .15);
    }
    // Warm-white finished stair walls; the south opening has no solid infill.
    for (const x of [-b.stairBay / 2, b.stairBay / 2]) {
      box('cream', x + Math.sign(-x) * .014, y + structureH / 2,
        (rearInner + corridorInner) / 2, .025, structureH, corridorInner - rearInner);
    }
    box('cream', 0, y + structureH / 2, rearInner + .015, b.stairBay, structureH, .025);
    box('cream', 0, y + h - b.slabThickness - .012, corridorInner / 2,
      width - 2 * t, .024, b.corridor);
    box('wall', 0, y + h - .22, -.12, width, .14, .24);
    for (const x of [wallXs[0], wallXs.at(-1)]) {
      box('wall', x, y + h - .22, (corridorInner - .24) / 2,
        .24, .14, b.corridor - .24);
    }
    if (floor > 0) {
      const railY = y + b.railing.height;
      box('rail', 0, railY, -.15, width - t, .115, .22);
      const count = Math.floor((width - t) / (b.railing.frontWidth + b.railing.clearGap));
      for (let i = 0; i <= count; i++) {
        const x = wallXs[0] + (wallXs.at(-1) - wallXs[0]) * i / count;
        box('rail', x, y + b.railing.height / 2, -.15,
          b.railing.frontWidth, b.railing.height, b.railing.depth);
      }
      for (const x of [wallXs[0], wallXs.at(-1)]) {
        box('rail', x, railY, (corridorInner - .15) / 2,
          .20, .115, b.corridor - .15);
        for (let i = 0; i < 7; i++) {
          box('rail', x, y + b.railing.height / 2, -.15 - i * (b.corridor - .15) / 6,
            .20, b.railing.height, .10);
        }
      }
    }
  }

  const rise = h / 2, angle = Math.atan2(rise, stairRun), laneW = b.stair.width - .15;
  function flight(x, startZ, dir, startY) {
    box('concrete', x, startY + rise / 2 - .10, startZ + dir * stairRun / 2,
      laneW, .16, Math.hypot(stairRun, rise), -dir * angle);
    for (let i = 0; i < b.stair.risersPerFlight; i++) {
      const stepTop = startY + (i + 1) * rise / b.stair.risersPerFlight;
      // At the wide south camera the first three steps are visible below the
      // continuous upper corridor. Separate pale treads from grey risers so
      // those real, partly occluded stairs remain legible at thumbnail size.
      box('cream', x, stepTop - .028,
        startZ + dir * (i + .5) * b.stair.tread, laneW, .056, b.stair.tread + .02);
      box('concrete', x, stepTop - rise / b.stair.risersPerFlight / 2,
        startZ + dir * i * b.stair.tread, laneW, rise / b.stair.risersPerFlight, .035);
    }
    const halfWallX = Math.sign(x) * .07;
    box('cream', halfWallX, startY + rise / 2 + .5, startZ + dir * stairRun / 2,
      .14, 1, stairRun, 0, dir * rise / stairRun);
    box('window', halfWallX, startY + rise / 2 + 1.03, startZ + dir * stairRun / 2,
      .18, .09, Math.hypot(stairRun, rise), -dir * angle);
  }
  for (let floor = 0; floor < b.floors - 1; floor++) {
    const y = base + floor * h;
    flight(b.stair.width / 2 + .05, stairFront, -1, y);
    flight(-b.stair.width / 2 - .05, stairFront - stairRun, 1, y + rise);
    box('concrete', 0, y + rise - .08, rearInner + b.stair.landingDepth / 2,
      b.stairBay, .16, b.stair.landingDepth);
  }
  const topY = base + (b.floors - 1) * h;
  box('cream', b.stair.width / 2, topY + .5, stairFront - .07, b.stair.width, 1, .14);
  box('concrete', b.stair.width / 2, topY + 1.03, stairFront - .07,
    b.stair.width + .12, .1, .25);

  const roofW = width + b.roofOverhang * 2, roofD = depth + b.roofOverhang * 2;
  box('concrete', 0, roofY + .10, back / 2, roofW, .20, roofD);
  box('wall', 0, roofY - .055, .02, width, .11, .055);
  const insulationW = roofW - b.insulationInset * 2;
  const insulationD = roofD - b.insulationInset * 2;
  for (let i = 0; i < 6; i++) {
    const x = -insulationW / 2 + .2 + (insulationW - .4) * i / 5;
    box('woodDark', x, roofY + .31, back / 2, .12, .22, insulationD);
  }
  // Geometry-only joints in the raised insulation layer. The cell count is a
  // visual-study working value, not a historical tile measurement. Preserve
  // the original layer's outer dimensions and highest point (roofY + .52).
  const tileCols = Math.round(insulationW / 1.35);
  const tileRows = Math.round(insulationD / 1.35);
  const cellW = insulationW / tileCols, cellD = insulationD / tileRows;
  const joint = .035;
  box('concrete', 0, roofY + .43, back / 2, insulationW, .02, insulationD);
  for (let row = 0; row < tileRows; row++) {
    for (let col = 0; col < tileCols; col++) {
      const x0 = -insulationW / 2 + col * cellW + (col === 0 ? 0 : joint / 2);
      const x1 = -insulationW / 2 + (col + 1) * cellW - (col === tileCols - 1 ? 0 : joint / 2);
      const z0 = back / 2 - insulationD / 2 + row * cellD + (row === 0 ? 0 : joint / 2);
      const z1 = back / 2 - insulationD / 2 + (row + 1) * cellD - (row === tileRows - 1 ? 0 : joint / 2);
      box('roof', (x0 + x1) / 2, roofY + .48, (z0 + z1) / 2,
        x1 - x0, .08, z1 - z0);
    }
  }

  const root = new THREE.Group();
  root.name = 'dodgeball-sample-building-2';
  for (const [key, geometries] of buckets) {
    if (!palette[key]) throw new Error(`Missing sample building material: ${key}`);
    const merged = mergeGeometries(geometries, false);
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, palette[key]);
    mesh.name = `building-2-${key}-batch`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    for (const geometry of geometries) geometry.dispose();
  }
  unit.dispose();
  root.userData = {
    source: 'CAMPUS.buildings.building2',
    representation: 'complete-geometry-style-study-no-lod',
    buildingDimensions: [width, roofY, depth],
    floorCount: b.floors,
    classroomCount: rooms.length * b.floors,
    stairs: { flightCount: (b.floors - 1) * 2, treadsPerFlight: b.stair.risersPerFlight },
    insulationTiles: { columns: tileCols, rows: tileRows, joint, dimensionsConfidence: 'visual-study-working-value' },
    materialCount: buckets.size,
    geometryPrimitiveCount: boxCount,
    drawCalls: buckets.size,
  };
  return root;
}
