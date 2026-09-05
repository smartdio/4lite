import { DODGEBALL_MOTION } from './motion.js';

const clamp01 = value => Math.max(0, Math.min(1, value));
const smooth = value => { const t = clamp01(value); return t * t * (3 - 2 * t); };
const mix = (from, to, weight) => from + (to - from) * weight;

/**
 * Original block-built pupils for the dodgeball composition study.
 * Dimensions are art proportions, not measurements of historical pupils.
 * All pieces share a unit box; each pupil is drawn in eight material batches.
 * The source pivots remain available for a later pose study. After rotating a
 * pivot, call pupil.userData.updatePose() to refresh the instance matrices.
 */
export function createDodgeballPlayers({ THREE, palette }) {
  const players = new THREE.Group();
  players.name = 'dodgeball-sample-pupils';
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);

  const definitions = [
    {
      id: 'blue-thrower', role: 'thrower', team: 'blue',
      position: [-12, 0, 11], yaw: Math.PI * 0.35,
      lean: [0.04, 0, -0.075], hair: 'short', expression: 'confident',
      feet: [[-0.35, 0.13, 0.35], [0.34, 0.13, -0.23]],
      knees: [[-0.34, 0.50, 0.15], [0.35, 0.51, -0.20]],
      arms: [
        { elbow: [-0.63, 0.12, 0.42], hand: [-0.52, 0.19, 1.05] },
        { elbow: [0.77, -0.29, -0.18], hand: [0.73, -0.59, 0.16] },
      ],
    },
    {
      id: 'blue-receiver', role: 'receiver', team: 'blue',
      position: [12, 0, 11], yaw: -Math.PI * 0.36,
      lean: [0.04, 0, 0.035], hair: 'short-parted', expression: 'focused',
      feet: [[-0.39, 0.13, 0.13], [0.39, 0.13, -0.03]],
      knees: [[-0.40, 0.49, 0.23], [0.40, 0.49, 0.13]],
      arms: [
        { elbow: [-0.73, -0.06, 0.38], hand: [-0.49, 0.16, 0.83] },
        { elbow: [0.73, -0.06, 0.38], hand: [0.49, 0.16, 0.83] },
      ],
    },
    {
      id: 'red-dodger-left', role: 'dodger', team: 'red',
      position: [-3.5, 0, 9.7], yaw: -0.25,
      lean: [0.10, -0.06, 0.27], hair: 'short', expression: 'surprised',
      feet: [[-0.55, 0.13, 0.08], [0.40, 0.13, -0.05]],
      knees: [[-0.37, 0.49, 0.15], [0.38, 0.51, 0.06]],
      arms: [
        { elbow: [-0.82, 0.19, 0.03], hand: [-0.94, 0.49, 0.25] },
        { elbow: [0.66, -0.25, 0.20], hand: [0.81, -0.43, 0.59] },
      ],
    },
    {
      id: 'red-dodger-right', role: 'dodger', team: 'red',
      position: [3.6, 0, 13], yaw: 0.38,
      lean: [0.04, 0.10, -0.24], hair: 'braids', expression: 'determined',
      feet: [[-0.40, 0.13, -0.11], [0.57, 0.13, 0.14]],
      knees: [[-0.43, 0.47, 0.12], [0.39, 0.48, 0.19]],
      arms: [
        { elbow: [-0.72, -0.19, 0.14], hand: [-0.86, 0.01, 0.51] },
        { elbow: [0.76, 0.10, -0.03], hand: [0.94, 0.38, 0.16] },
      ],
    },
  ];

  function createPlayer(definition) {
    const pupil = new THREE.Group();
    pupil.name = definition.id;
    pupil.position.fromArray(definition.position);
    pupil.rotation.y = definition.yaw;
    const rig = new THREE.Group();
    rig.name = 'pose-pivots';
    pupil.add(rig);
    const pieces = [];
    const joints = {};
    const links = {};
    const shirt = palette[definition.team];
    const shorts = palette[`${definition.team}Dark`];

    function pivot(parent, name, position, rotation) {
      const node = new THREE.Group();
      node.name = name;
      node.position.fromArray(position);
      if (rotation) node.rotation.set(...rotation);
      parent.add(node);
      joints[name] = node;
      return node;
    }

    function block(parent, material, size, position, rotation, name = 'block') {
      const part = new THREE.Object3D();
      part.name = name;
      part.position.fromArray(position);
      part.scale.fromArray(size);
      if (rotation) part.rotation.set(...rotation);
      parent.add(part);
      pieces.push({ part, material });
      return part;
    }

    function link(parent, name, from, to, width, depth, material) {
      const start = new THREE.Vector3(...from);
      const delta = new THREE.Vector3(...to).sub(start);
      const joint = pivot(parent, name, from);
      joint.quaternion.setFromUnitVectors(up, delta.clone().normalize());
      const segment = block(joint, material, [width, delta.length(), depth], [0, delta.length() / 2, 0]);
      links[name] = { joint, segment };
      return joint;
    }

    // Foot centers are deliberately independent of the leaning upper body.
    // Every sole begins exactly at y = 0, including the wide dodging stances.
    definition.feet.forEach((foot, side) => {
      const sign = side === 0 ? -1 : 1;
      const knee = definition.knees[side];
      const hip = [sign * 0.24, 0.94, 0];
      const ankle = [foot[0], 0.24, foot[2] - 0.055];
      link(rig, `${side}-thigh`, hip, knee, 0.32, 0.33, shorts);
      link(rig, `${side}-shin`, knee, ankle, 0.245, 0.25, palette.skin);
      joints[`${side}-sock`] = block(rig, palette.white, [0.265, 0.16, 0.28], [ankle[0], 0.265, ankle[2]]);
      const shoePivot = pivot(rig, `${side}-foot`, foot, [0, sign * 0.07, 0]);
      block(shoePivot, palette.shoe, [0.39, 0.08, 0.64], [0, -0.09, 0.025]);
      block(shoePivot, palette.white, [0.36, 0.17, 0.61], [0, 0.025, 0.035]);
      block(shoePivot, palette.shoe, [0.31, 0.02, 0.25], [0, 0.119, -0.045]);
      block(shoePivot, palette.white, [0.23, 0.025, 0.035], [0, 0.136, -0.03]);
    });

    const spine = pivot(rig, 'spine', [0, 0.92, 0], definition.lean);
    block(spine, shorts, [0.75, 0.27, 0.49], [0, 0.015, 0]);
    block(spine, shirt, [0.87, 0.77, 0.49], [0, 0.49, 0]);
    block(spine, shirt, [0.77, 0.14, 0.50], [0, 0.09, 0]);
    block(spine, palette.skin, [0.28, 0.18, 0.27], [0, 0.955, 0]);
    // Simple everyday cotton clothes: white collar, one plain chest pocket.
    block(spine, palette.white, [0.20, 0.12, 0.055], [-0.12, 0.83, 0.261], [0, 0, -0.21]);
    block(spine, palette.white, [0.20, 0.12, 0.055], [0.12, 0.83, 0.261], [0, 0, 0.21]);
    block(spine, shorts, [0.21, 0.18, 0.025], [-0.20, 0.54, 0.256]);
    block(spine, shirt, [0.18, 0.145, 0.028], [-0.20, 0.545, 0.274]);

    const head = pivot(spine, 'head', [0, 1.285, 0.015], [0, definition.role === 'dodger' ? -0.16 : 0, 0]);
    block(head, palette.skin, [0.91, 0.76, 0.74], [0, 0, 0]);
    block(head, palette.skinShade, [0.69, 0.10, 0.63], [0, -0.35, -0.015]);
    // Broad eye whites and heavy brows evoke expressive retro school brawlers.
    // Every facial mark is shallow geometry, using the existing color batches.
    const surprised = definition.expression === 'surprised';
    const eyeHeight = surprised ? 0.25 : 0.225;
    const browAngle = surprised ? -0.22 : definition.expression === 'confident' ? 0.22 : 0.13;
    const gaze = definition.role === 'dodger' ? -0.032 : 0;
    [-1, 1].forEach((sign) => {
      block(head, palette.skin, [0.13, 0.23, 0.24], [sign * 0.475, -0.02, -0.005]);
      block(head, palette.skinShade, [0.022, 0.10, 0.10], [sign * 0.547, -0.015, 0.029]);
      block(head, palette.white, [0.26, eyeHeight, 0.028], [sign * 0.22, 0.015, 0.387], undefined, `eye-white-${sign}`);
      block(head, palette.dark, [0.095, surprised ? 0.155 : 0.17, 0.018], [sign * 0.22 + gaze, 0.02, 0.409], undefined, `pupil-${sign}`);
      block(head, palette.hair, [0.27, 0.025, 0.019], [sign * 0.22, 0.015 + eyeHeight / 2, 0.409]);
      block(head, palette.hair, [0.25, 0.017, 0.019], [sign * 0.22, 0.015 - eyeHeight / 2, 0.409]);
      block(head, palette.hair, [0.285, 0.066, 0.032], [sign * 0.22, surprised ? 0.218 : 0.188, 0.423], [0, 0, sign * browAngle], `brow-${sign}`);
    });
    // A shallower nose keeps the far eye readable in the throwers' 3/4 views.
    block(head, palette.skinShade, [0.105, 0.10, 0.046], [0, -0.08, 0.395]);
    block(head, palette.skin, [0.09, 0.075, 0.042], [-0.007, -0.07, 0.418]);
    if (definition.expression === 'confident') {
      block(head, palette.dark, [0.22, 0.072, 0.026], [0.018, -0.235, 0.386], [0, 0, 0.06]);
      block(head, palette.white, [0.168, 0.030, 0.018], [0.018, -0.219, 0.409], [0, 0, 0.06]);
    } else if (surprised) {
      block(head, palette.dark, [0.13, 0.115, 0.026], [0, -0.247, 0.386]);
      block(head, palette.white, [0.10, 0.024, 0.018], [0, -0.207, 0.409]);
    } else {
      block(head, palette.dark, [0.17, 0.035, 0.026], [0, -0.235, 0.386], [0, 0, definition.expression === 'determined' ? -0.10 : 0]);
    }
    block(head, palette.hair, [0.98, 0.19, 0.81], [0, 0.405, -0.018]);
    block(head, palette.hair, [0.88, 0.10, 0.72], [-0.025, 0.535, -0.05]);
    block(head, palette.hair, [0.97, 0.36, 0.15], [0, 0.175, -0.345]);
    block(head, palette.hair, [0.15, 0.30, 0.62], [-0.421, 0.18, -0.035]);
    block(head, palette.hair, [0.15, 0.24, 0.62], [0.421, 0.21, -0.035]);
    // Leave a visible strip of forehead between the fringe and raised brows.
    if (definition.hair === 'short-parted') {
      block(head, palette.hair, [0.57, 0.14, 0.09], [-0.195, 0.40, 0.36], [0, 0, -0.07]);
      block(head, palette.hair, [0.22, 0.12, 0.10], [0.35, 0.38, 0.36]);
    } else if (definition.hair === 'braids') {
      block(head, palette.hair, [0.89, 0.10, 0.085], [0, 0.35, 0.375]);
      [-1, 1].forEach((sign) => {
        const braid = pivot(head, `braid-${sign}`, [sign * 0.55, 0.05, -0.24], [0.1, 0, sign * 0.25]);
        block(braid, palette.hair, [0.22, 0.43, 0.23], [0, -0.12, 0]);
        block(braid, palette.hair, [0.17, 0.18, 0.18], [0.015 * sign, -0.39, 0]);
        block(braid, palette.white, [0.245, 0.07, 0.25], [0, 0.055, 0]);
      });
    } else {
      block(head, palette.hair, [0.67, 0.14, 0.09], [-0.11, 0.365, 0.365]);
      block(head, palette.hair, [0.19, 0.11, 0.09], [0.31, 0.37, 0.365]);
    }

    definition.arms.forEach(({ elbow, hand }, side) => {
      const sign = side === 0 ? -1 : 1;
      const shoulder = [sign * 0.47, 0, 0];
      const armRoot = pivot(spine, `${side}-arm`, [0, 0.76, 0]);
      const sleeveEnd = shoulder.map((value, index) => value + (elbow[index] - value) * 0.60);
      link(armRoot, `${side}-sleeve`, shoulder, sleeveEnd, 0.35, 0.36, palette.white);
      link(armRoot, `${side}-upper-arm`, sleeveEnd, elbow, 0.265, 0.275, palette.skin);
      link(armRoot, `${side}-forearm`, elbow, hand, 0.255, 0.27, palette.skin);
      const palm = pivot(armRoot, `${side}-hand`, hand);
      if (definition.role === 'receiver') {
        palm.rotation.z = sign * -0.22;
        block(palm, palette.skin, [0.29, 0.31, 0.16], [0, 0.04, 0]);
        block(palm, palette.skinShade, [0.055, 0.18, 0.022], [-sign * 0.09, 0.055, 0.092]);
        block(palm, palette.skin, [0.105, 0.14, 0.17], [-sign * 0.155, -0.035, 0.015], [0, 0, sign * 0.3]);
      } else {
        block(palm, palette.skin, [0.28, 0.25, 0.25], [0, 0, 0]);
        block(palm, palette.skin, [0.095, 0.12, 0.16], [-sign * 0.15, -0.01, 0.025]);
      }
    });

    const byMaterial = new Map();
    for (const entry of pieces) {
      if (!byMaterial.has(entry.material)) byMaterial.set(entry.material, []);
      byMaterial.get(entry.material).push(entry.part);
    }
    const batches = [];
    for (const [material, parts] of byMaterial) {
      const mesh = new THREE.InstancedMesh(boxGeometry, material, parts.length);
      mesh.name = `${definition.id}-${material.name || batches.length}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // Four game characters are always part of the full scene. Avoid
      // recomputing every instance's bounds in the animation hot path.
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      pupil.add(mesh);
      batches.push({ mesh, parts });
    }
    const inverse = new THREE.Matrix4();
    const matrix = new THREE.Matrix4();
    function updatePose(refreshBounds = true) {
      pupil.updateMatrixWorld(true);
      inverse.copy(pupil.matrixWorld).invert();
      for (const { mesh, parts } of batches) {
        parts.forEach((part, index) => {
          matrix.multiplyMatrices(inverse, part.matrixWorld);
          mesh.setMatrixAt(index, matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (refreshBounds) {
          mesh.computeBoundingBox();
          mesh.computeBoundingSphere();
        }
      }
    }
    const linkStart = new THREE.Vector3(), linkDelta = new THREE.Vector3();
    function positionLink(name, from, to) {
      const { joint, segment } = links[name];
      linkStart.fromArray(from); linkDelta.fromArray(to).sub(linkStart);
      const length = Math.max(.001, linkDelta.length());
      joint.position.copy(linkStart);
      joint.quaternion.setFromUnitVectors(up, linkDelta.multiplyScalar(1 / length));
      segment.scale.y = length; segment.position.y = length / 2;
    }
    function setArm(side, elbow, hand) {
      const sign = side === 0 ? -1 : 1;
      const shoulder = [sign * .47, 0, 0];
      const sleeve = shoulder.map((value, index) => value + (elbow[index] - value) * .60);
      positionLink(`${side}-sleeve`, shoulder, sleeve);
      positionLink(`${side}-upper-arm`, sleeve, elbow);
      positionLink(`${side}-forearm`, elbow, hand);
      joints[`${side}-hand`].position.fromArray(hand);
    }
    const anchorOtherHand = new THREE.Vector3();
    const fixedReleaseHand = new THREE.Vector3();
    const inverseSpineRotation = new THREE.Quaternion();
    let ballAnchorMode = null;
    // The caller owns `target`; neither reading this attachment nor animating
    // a catch creates render resources or new temporary Three.js objects.
    function getBallAnchor(target, forceClasp = false) {
      if (!forceClasp && !ballAnchorMode) return null;
      joints['1-hand'].getWorldPosition(target);
      if (forceClasp || ballAnchorMode !== 'charge') {
        joints['0-hand'].getWorldPosition(anchorOtherHand);
        target.add(anchorOtherHand).multiplyScalar(.5);
      }
      return target;
    }
    function applyState(player, state = {}) {
      const elapsed = Number(state.elapsed) || 0;
      const actionTime = Math.max(0, Number(player.actionTime) || 0);
      const action = player.action || 'idle';
      const moving = Math.hypot(player.vx || 0, player.vz || 0);
      const rawRun = THREE.MathUtils.clamp(moving / 3.5, 0, 1);
      const beat = elapsed * (8 + moving * .6) + (player.id || 0) * .7;
      const jumping = (player.y || 0) > .08 || action === 'jump';
      const out = player.alive === false || action === 'out' || action === 'hit';
      const charge = THREE.MathUtils.clamp(Number(state.charge) || 0, 0, 1);
      const ownsBall = state.ball?.ownerId === player.id;
      const charging = action === 'charge' || action === 'charging' || (ownsBall && charge > 0);
      const throwing = action === 'throw' || action === 'throwing';
      const caught = action === 'caught' && actionTime < DODGEBALL_MOTION.catchSeconds;
      const throwRecover = smooth((actionTime - .29) / (DODGEBALL_MOTION.throwSeconds - .29));
      const throwWeight = throwing ? 1 - throwRecover : 0;
      const throwPunch = 1 - Math.pow(1 - clamp01(actionTime / .11), 3);
      const catchGather = smooth(actionTime / DODGEBALL_MOTION.catchGatherSeconds);
      const catchRecover = smooth((actionTime - DODGEBALL_MOTION.catchHoldUntil) /
        (DODGEBALL_MOTION.catchSeconds - DODGEBALL_MOTION.catchHoldUntil));
      const catchWeight = caught ? 1 - catchRecover : 0;
      const run = rawRun * (1 - Math.max(throwWeight, catchWeight, charging ? .8 : 0));
      const catching = action === 'catch' || action === 'catching' ||
        (player.role === 'attack' && !ownsBall && state.phase === 'flight');
      const switching = state.phase === 'switching' || action === 'switch';
      ballAnchorMode = caught ? 'caught' : charging ? 'charge' : ownsBall ? 'held' : null;
      // A dismissed pupil briefly recoils, then leaves the live scene; this is
      // a game-state transition and never a distance/quality model selection.
      pupil.visible = !out || actionTime < .9;
      pupil.position.set(player.x || 0, Math.max(0, player.y || 0), player.z || 0);
      pupil.rotation.set(0, Number.isFinite(player.yaw) ? player.yaw : definition.yaw, 0);
      rig.position.y = moving > .1 && !jumping ? Math.abs(Math.sin(beat)) * .045 * run : 0;
      rig.rotation.set(0, 0, 0);
      const recoil = out ? Math.sin(Math.min(1, actionTime / .65) * Math.PI / 2) : 0;
      let crouch = charging ? .10 * charge : jumping ? .04 : out ? .30 * recoil : 0;
      crouch = mix(crouch, .10 * throwPunch, throwWeight);
      crouch = mix(crouch, .10 * catchGather, catchWeight);
      spine.position.set(0, .92 - crouch, 0);
      spine.rotation.set(.03 + run * .10 - recoil * .35, 0,
        out ? -.30 * recoil : -THREE.MathUtils.clamp((player.vx || 0) * .025, -.11, .11));
      if (charging) spine.rotation.set(-.14 * charge, -.16 * charge, -.035 * charge);
      spine.rotation.x = mix(spine.rotation.x, .03 + .39 * throwPunch, throwWeight);
      spine.rotation.y = mix(spine.rotation.y, .12 * throwPunch, throwWeight);
      spine.rotation.z *= 1 - Math.max(throwWeight, catchWeight);
      spine.rotation.x = mix(spine.rotation.x, .08 - .14 * catchGather, catchWeight);
      spine.rotation.y *= 1 - catchWeight;
      // A small glance toward the front camera keeps the approved broad eyes
      // readable while the body still faces the real throw/catch direction.
      const headTurn = THREE.MathUtils.clamp(-pupil.rotation.y * .23, -.40, .40);
      head.rotation.set(-.13 * throwPunch * throwWeight + .035 * catchGather * catchWeight,
        headTurn, out ? .12 * recoil : 0);
      // Keep the ball at the existing gameplay release point during charge.
      // Only the elbow/torso/stance wind up; releasing a short click never adds
      // a hidden wind-up delay or teleports the ball out of a rear hand.
      if (charging || (throwing && throwWeight > 0)) {
        const aimOrigin = charging && state.aim?.ownerId === player.id ? state.aim.origin : null;
        if (aimOrigin) {
          pupil.updateWorldMatrix(true, false);
          fixedReleaseHand.set(aimOrigin.x, aimOrigin.y, aimOrigin.z)
            .applyMatrix4(inverse.copy(pupil.matrixWorld).invert()).sub(rig.position);
        } else {
          // Fallback art-space reference for standalone pose studies; live
          // held-ball states supply the simulation-owned origin above.
          fixedReleaseHand.set(0, 2.05 / 1.2, .72 / 1.2);
        }
        fixedReleaseHand.sub(spine.position)
          .applyQuaternion(inverseSpineRotation.copy(spine.quaternion).invert());
        fixedReleaseHand.y -= .76;
      }
      for (let side = 0; side < 2; side++) {
        const sign = side === 0 ? -1 : 1;
        const stride = Math.sin(beat + side * Math.PI) * .42 * run;
        const lift = jumping ? .16 : Math.max(0, Math.cos(beat + side * Math.PI)) * .14 * run;
        const foot = [sign * (out ? .47 : .33), .13 + lift,
          stride + (charging ? -sign * .28 * charge : 0)];
        const knee = [sign * .30, .50 - crouch * .45 + lift * .45, stride * .4 + (jumping ? .28 : .08)];
        let footPitch = jumping ? .16 : 0;
        if (throwWeight > 0) {
          // Right-handed throw: left sole plants forward, right knee bends
          // and its foot lifts behind the body. Foot lift also covers the
          // tilted sole's corners so the shoe cannot penetrate the ground.
          const rear = side === 1;
          foot[1] = mix(foot[1], .13 + (rear ? .23 * throwPunch : 0), throwWeight);
          foot[2] = mix(foot[2], (rear ? -.64 : .40) * throwPunch, throwWeight);
          knee[1] = mix(knee[1], rear ? .50 + .11 * throwPunch : .50 - .08 * throwPunch, throwWeight);
          knee[2] = mix(knee[2], rear ? -.26 * throwPunch : .08 + .22 * throwPunch, throwWeight);
          footPitch = mix(footPitch, rear ? .28 * throwPunch : 0, throwWeight);
        }
        if (catchWeight > 0) {
          foot[0] = mix(foot[0], sign * .36, catchWeight);
          foot[1] = mix(foot[1], .13, catchWeight);
          foot[2] = mix(foot[2], sign * .10, catchWeight);
          knee[1] = mix(knee[1], .50 - .07 * catchGather, catchWeight);
          knee[2] = mix(knee[2], .12 + sign * .05, catchWeight);
          footPitch *= 1 - catchWeight;
        }
        const ankle = [foot[0], foot[1] + .11, foot[2] - .055];
        positionLink(`${side}-thigh`, [sign * .24, .94 - crouch, 0], knee);
        positionLink(`${side}-shin`, knee, ankle);
        joints[`${side}-foot`].position.fromArray(foot);
        joints[`${side}-foot`].rotation.set(footPitch, sign * .07, 0);
        joints[`${side}-sock`].position.set(ankle[0], ankle[1] + .025, ankle[2]);
        const armSwing = -stride * .7;
        let elbow = [sign * .66, -.30, armSwing];
        let hand = [sign * .66, -.64, armSwing + .10];
        if (ownsBall && !throwing && !charging) {
          elbow = [sign * .59, -.13, .24]; hand = [sign * .22, .028, .61];
        }
        if (catching) {
          const reach = action === 'catch' || action === 'catching' ? smooth(actionTime / .055) : 1;
          elbow = [sign * .70, mix(-.12, .08, reach), mix(.28, .48, reach)];
          hand = [sign * mix(.30, .43, reach), mix(.06, .20, reach), mix(.65, 1.02, reach)];
        }
        if (charging) {
          elbow = side === 1 ? [.70 + charge * .08, .03 + charge * .29, .20 - charge * .34]
            : [-.61, -.10, .28];
          hand = side === 1 ? fixedReleaseHand.toArray()
            : [-.27, fixedReleaseHand.y - .07, fixedReleaseHand.z - .05];
        }
        if (jumping && !throwing && !charging && !catching) {
          elbow = [sign * .72, .11, .10]; hand = [sign * .76, .42, .20];
        }
        if (throwWeight > 0) {
          const throwElbow = side === 1 ? [.57, mix(.04, -.08, throwPunch), mix(.25, .60, throwPunch)]
            : [-.71, -.18, mix(.10, -.34, throwPunch)];
          const throwHand = side === 1 ? [mix(fixedReleaseHand.x, .12, throwPunch),
            mix(fixedReleaseHand.y, -.22, throwPunch), mix(fixedReleaseHand.z, 1.08, throwPunch)]
            : [-.74, -.50, mix(.08, -.55, throwPunch)];
          for (let axis = 0; axis < 3; axis++) {
            elbow[axis] = mix(elbow[axis], throwElbow[axis], throwWeight);
            hand[axis] = mix(hand[axis], throwHand[axis], throwWeight);
          }
        }
        if (catchWeight > 0) {
          // Reach together, absorb the impact into a chest-height cradle,
          // then keep every joint fixed for the shared readable catch hold.
          const catchElbow = [sign * mix(.70, .57, catchGather), mix(.08, -.19, catchGather),
            mix(.48, .24, catchGather)];
          const catchHand = [sign * mix(.43, .25, catchGather), mix(.20, .06, catchGather),
            mix(1.02, .63, catchGather)];
          for (let axis = 0; axis < 3; axis++) {
            elbow[axis] = mix(elbow[axis], catchElbow[axis], catchWeight);
            hand[axis] = mix(hand[axis], catchHand[axis], catchWeight);
          }
        }
        if (out) {
          elbow = [sign * .77, .12, -.05]; hand = [sign * .91, .30 + recoil * .16, .19];
        }
        if (switching && !moving) {
          elbow = [sign * .65, -.24, .13]; hand = [sign * .61, -.49, .28];
        }
        setArm(side, elbow, hand);
      }
      updatePose(false);
    }
    pupil.userData = {
      id: definition.id,
      role: definition.role,
      team: definition.team,
      expression: definition.expression,
      joints,
      updatePose,
      applyState,
      getBallAnchor,
      primitiveCount: pieces.length,
      materialBatches: batches.length,
    };
    updatePose();
    return pupil;
  }

  for (const definition of definitions) players.add(createPlayer(definition));
  players.userData.players = definitions.map(({ id, role, team, position }) => ({
    id, role, team, position: [...position],
  }));
  players.userData.sharedGeometry = boxGeometry;
  return players;
}
