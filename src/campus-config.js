// 校园灰盒的唯一空间数据源。单位均为米。
// confidence: A=确认，A-=亲历估算，B=资料推导，C=工作候选。
export const CAMPUS = {
  woodenSpaceShuttle: {
    url: '/assets/models/wooden-space-shuttle/wooden-space-shuttle-v01.glb',
    classroom: 'b2-room-3-floor-1',
    height: .40, deskOffset: [0, 0], confidence: 'C',
    // User-confirmed white gloss paint and iron-wire stand; dimensions are working values.
  },
  meta: {
    version: 'macro-graybox-v0.1',
    orientation: '校门方向暂记为南，真实方位待确认',
    coordinateNote: '大门中心为 (0, 0)，北为 -Z，东为 +X',
  },
  world: {
    bounds: { width: 90, depth: 64, confidence: 'C' },
    // 北面操场的东界与教师宿舍 GLB 的东侧外缘（X≈32.6m）齐平。
    boundary: [
      [-43.8, -59], [4.2, -59], [4.2, -61.5], [10.18, -61.5],
      [10.18, -69.67], [30.6, -69.67], [32.6, -67.67], [32.6, -48.68], [32.6, -43],
      [31.7, -41.3], [31.7, -25.7], [27, -25.7],
      [27, -11.5], [22.1, -11.5], [22.1, 0], [5, 0],
      [5, 0], [-5, 0], [-28.8, 0], [-28.8, -24.8], [-43.8, -24.8],
    ],
    gate: {
      center: [-2.5, 0], width: 4, walkExitBlocked: true, confidence: 'A-',
      ironGate: {
        height: 2.15, bottomGap: 0.06, centerGap: 0.06,
        depth: 0.06, frame: 0.07, bar: 0.028,
        topBandBottom: 1.56, confidence: 'C',
      },
    },
    wall: {
      height: 2.2, thickness: 0.28, confidence: 'C',
      // 用户确认滑梯周边三段连续围墙（含弹弓场马尾松南侧内墙）统一加高至3m。
      heightOverrides: [
        { from: [31.7, -25.7], to: [27, -25.7], height: 3, confidence: 'A' },
        { from: [27, -25.7], to: [27, -11.5], height: 3, confidence: 'A' },
        { from: [27, -11.5], to: [22.1, -11.5], height: 3, confidence: 'A' },
      ],
      // 二号教学楼北立面后方不设围墙；校园地面仍沿原边界延伸。
      removedSegments: [
        { from: [-43.8, -59], to: [4.2, -59], confidence: 'A' },
        { from: [32.6, -67.67], to: [32.6, -48.68], confidence: 'A' },
      ],
      // 二号楼西端接西侧外围墙，东端接厕所西墙；北侧中段保持敞开。
      additionalSegments: [
        { from: [-43.8, -59], to: [-40.85, -59], confidence: 'A' },
        { from: [1.09, -59], to: [2.34, -59], confidence: 'A' },
      ],
    },
    groundY: 0,
  },
  terrain: {
    platformHeight: 0.5,
    groundZones: {
      // 一号楼前院以压实泥地为底；水泥从中央门洞穿过楼体，再铺满楼后主操场。
      // 门洞内部铺装扩到两侧 25cm 地台的内缘，避免通道墙脚旁露出泥地。
      portalConcrete: [
        [-5.51, -15.7], [0.51, -15.7], [0.51, -23.19], [-5.51, -23.19],
      ],
      mainConcrete: [
        // 东界贴到高台顶缘下方，让低处水泥面压住60°坡脚，不再露出一圈平泥地。
        [-45.5, -48.68], [10.5, -48.68], [10.5, -48.18], [21.2, -48.18],
        [23.2, -44.3], [24.97, -42.98],
        [24.97, -33.05], [21.5, -25.7], [19.8, -23.19], [-30.6, -23.19],
        [-30.6, -24.8], [-45.5, -24.8],
      ],
      // 厕所与沙池共用低地水泥面：西接二号教学楼东端，东抵高台砌边。
      serviceConcrete: [
        [1.05, -61.45], [10.25, -61.45], [10.3, -48.4], [1.05, -48.4],
      ],
    },
    eastHighland: {
      id: 'east-continuous-highland',
      // 旧教室、器械场、宿舍与滑梯共用一块连续顶面；点位按顺时针一一对应外围坡脚。
      core: [
        [10.7, -69.3], [31.15, -69.3], [31.45, -61.5], [31.4, -51],
        [31.3, -48.7], [31.35, -46], [31.7, -43], [31.7, -25.7],
        [27, -25.7], [27, -11.5], [21.5, -11.5], [21.5, -25.7],
        [24.97, -33.05], [24.97, -42.98], [23.2, -44.3], [21.2, -48.2],
        [10.5, -48.2], [10.4, -57],
      ],
      concreteRoad: {
        width: 2.4,
        points: [
          // 取消连接斜坡后，道路从完整位于高台顶面的控制点开始。
          [27.2, -46.2], [29.5, -49.5], [30.2, -54.5],
          [30.2, -59.7], [30, -64.6],
        ],
      },
      flatZones: [
        { id: 'old-classroom-pad', center: [19.8, -64.42], size: [18.2, 8.5] },
        { id: 'activity-pad', center: [21.73, -53.925], size: [21.1, 11.49] },
        { id: 'dormitory-pad', center: [28.92, -36.58], size: [6.4, 13.6] },
        { id: 'slide-pad', center: [26.18, -18.1], size: [5, 7.8] },
      ],
      // 高台边缘保留约60°的窄泥坡；坡脚按高差计算，不再沿旧控制点大面积外扩。
      slopeAngleDeg: 60,
      retainingEdge: {
        enabled: false,
        blockLength: 0.82,
        joint: 0.02,
        thickness: 0.34,
        height: 0.46,
        courses: 2,
        outwardOffset: 0.2,
        damageSeed: 1987,
      },
      slopeSubdivisions: 5,
      surfaceSeed: 1982,
    },
  },
  buildings: {
    building1: {
      label: '1号教学楼', confidence: 'A/B', floors: 2, floorHeight: 3.1,
      raised: 0.4, wall: 0.24, roofOverhang: 0.5, insulationInset: 1,
      slabThickness: 0.16,
      // 南侧走廊保留 0.22m 挑边；东西与北侧结构柱外缘约在墙中心线外 0.34m，
      // 其承托地台／楼板外放 0.42m，给柱脚留下约 8cm 可见边缘。
      plinthOverhang: 0.45, slabEdgeOverhang: 0.22, structuralSlabEdgeOverhang: 0.42, corridorTopEdge: [0.2, 0.2],
      wingEntry: { width: 1.5, steps: 2 },
      frameColumn: [0.45, 0.45], frameBeam: [0.25, 0.3],
      main: { center: [-2.5, -18.7], size: [43.96, 8.98] },
      wings: {
        west: { center: [-20.25, -9.47], size: [8.5, 12.48] },
        east: { center: [15.25, -9.47], size: [8.5, 12.48] },
      },
      corridor: 1.5, classroom: [9, 7], centralBay: 7, centralOpening: 5,
      centralRoomWindow: { offset: 2.05, width: 1.4 },
      centralPortal: { width: 5.6, openingWidth: 4.2, clearHeight: 2.45, projection: 0.24 },
      openings: {
        door: { openingWidth: 1, height: 2.55, leafWidth: 0.92, leafHeight: 2.08 },
        window: { sill: 0.7, height: 1.85, corridorWidth: 1.6, rearWidth: 1.5 },
      },
      flowerBed: { width: 0.6, height: 0.4, rimHeight: 0.08, rimThickness: 0.1, cornerRadius: 0.12, foundationGap: 0.02 },
      chamfer: 0.75,
    },
    building2: {
      label: '2号教学楼', confidence: 'A/B', floors: 3, floorHeight: 3.1,
      raised: 0.3, wall: 0.24, roofOverhang: 0.3, insulationInset: 1,
      center: [-19.88, -53.42], size: [41.94, 9.48], corridor: 2,
      classroom: [9, 7], stairBay: 4.5,
      slabThickness: 0.16, foundationSouthExtension: 0.3,
      stair: { flights: 2, risersPerFlight: 10, tread: 0.28, width: 2.25, gap: 0, landingDepth: 1.5 },
      // 二号楼复用一号楼同款木门：0.92m门扇＋固定亮窗，总门洞高2.55m。
      openings: { door: [0.92, 2.08], doorOpeningWidth: 1, doorTransom: 0.47, window: [1.5, 1.55], sill: 0.9, windowTransom: 0.32 },
      railing: { height: 1.05, frontWidth: 0.1, clearGap: 0.2, depth: 0.2 },
      frameColumn: [0.48, 0.42], frameBeam: [0.24, 0.28],
    },
    oldClassroom: {
      label: '旧教室', confidence: 'C', floors: 1, eaveHeight: 2.7,
      center: [19.8, -64.42], size: [17.13, 7.52], platformY: 0.5,
    },
    toilet: {
      label: '厕所', confidence: 'A-', floors: 1, eaveHeight: 2.7,
      center: [5.34, -58.67], size: [6, 4.8], platformY: 0, entranceWidth: 1,
    },
    dormitory: {
      label: '教师宿舍', confidence: 'A-/C', floors: 2, floorHeight: 2.8,
      center: [28.92, -36.58], size: [5.5, 12.8], platformY: 0.5,
      // GLB 自带低矮地台；只埋入15cm，让地台在连续高地上露出一小截。
      corridor: 1.2, roofOverhang: 0.3, assetEmbed: 0.15,
      exteriorStair: { width: 1, run: 3.6, steps: 18, slabThickness: 0.14, parapetHeight: 1.02, parapetThickness: 0.14 },
    },
  },
  facilities: {
    dodgeball: {
      // Approved game entrance, not a measurement of the historical playground.
      confidence: 'gameplay-working-value',
      entry: {center: [-13.5, -34], size: [10, 6], surfaceY: 0.012, interactionDistance: 2.5, eyeHeight: 1.6, proxyLayer: 12},
      game: {matchSeconds: 180, holdSeconds: 5, chargeSeconds: 0.65, aiServeSeconds: 3},
    },
    sandpit: {
      center: [5.18, -51.67], size: [6, 6], rimWidth: 0.2, sandInset: 0.025,
      placementY: 0.01, assetUrl: '/assets/models/sandpit/sandpit-recessed-game-v01.glb?v=7',
      confidence: 'C',
      // 2026-09-01 补充回忆确认“沙池有两根竖立铁管”，最终明确两管
      // 插在沙池南侧左右两个水泥边框角上。不补横杆或推断用途。
      uprightIronPipes: {
        count: 2, lateralOffset: 2.9, longitudinalOffset: 2.9,
        baseY: 0, height: 2.05, radius: 0.04, radialSegments: 12,
        confidence: 'A/C',
      },
    },
    longJump: {
      // 跳远踏板与玩法参数均为游戏工作值，不代表历史实测尺寸。
      confidence: 'gameplay-working-value',
      boardCenter: [5.18, -48.49], boardSize: [1.2, 0.035, 0.28], boardTopY: 0.025,
      interactionSandCenter: [5.18, -51.67], interactionSandSize: [5.55, 5.55],
      direction: [0, -1], interactionDistance: 2.5, proximityRadius: 0.72,
      crouchEyeY: 1.05, aimingFocusY: 0.5, landingEyeHeight: 0.88,
      // 结果镜头退到成绩线北侧，兼顾落点线、距离字牌与周围沙池，不做近距离特写。
      resultViewEyeHeight: 0.92, resultViewBackOffset: 1.35, entryDurationMs: 600,
      chargeSeconds: 1.6, minTurnsPerSecond: 0.7, maxTurnsPerSecond: 1.25,
      minDistance: 0.55, maxDistance: 2.2, overrunMinDistance: 0.45, overrunMaxDistance: 0.8,
      landingPauseMs: 250, turnDurationMs: 700, resultDurationMs: 1500,
    },
    jacksGame: {
      // 抓石子场地、子王材质、石子数量与玩法时限均为可替换的游戏工作值，
      // 不代表校园历史实测或已确认的广东地方规则。
      confidence: 'gameplay-working-value',
      // 用户已确认放在一号楼南侧围院东边两棵马尾松中偏南的一棵树下；
      // 相对树心 [6.2,-6.0] 向院心偏移约0.9m以避开树干碰撞，精确落点仍为工作坐标。
      center: [5.3, -6.0], floorY: 0, interactionRadius: 0.42, interactionDistance: 2.5, proxyLayer: 10,
      stoneCount: 6, stoneRadius: 0.035, kingRadius: 0.055, kingRestOffset: [0.25, 0.05],
      scatterLayout: [[-.24,-.10],[-.09,.16],[.08,-.18],[.20,.11],[-.27,.20],[.29,-.04]],
      playRadius: 0.38, disturbRadius: 0.075,
      cameraEyeY: 0.72, cameraSouthOffset: 1.02, entryDurationMs: 520, scatterDurationMs: 460,
      tossHeight: 0.48, tossFlightMs: 2200, gatherTimeoutMs: 1800, catchTimeoutMs: 1600,
      aimMoveThreshold: 0.035, catchRadius: 0.10,
      feedbackDurationMs: 420, failureDurationMs: 720, roundPauseMs: 760,
    },
    hopscotch: {
      // 场地、八／九格形与玩法参数均为可替换的游戏工作值；目前没有亲历资料可确认具体位置或地方规则。
      // 用户指定放在一号楼前操场西侧两棵马尾松之间、略偏南，长轴东西向；西端与西翼教学楼保留空隙。
      confidence: 'gameplay-working-value',center: [-14.0, -8.1],rotationY: 90,surfaceY: 0.006,
      cellWidth: 0.72,cellDepth: 0.78,footMargin: 0.11,tileRadius: 0.085,tileHeight: 0.025,
      interactionDistance: 2.5,proxyLayer: 8,proxySize: [2.25,6.8],proxyOffsetZ: 2.15,
      eyeHeight: 1.18,
      textureBounds: [-.92,.92,-.55,4.55],
      layouts: [
        {
          id: 'connected-a',candidate: 'hand-drawn-connected-v02',topology: 'connected-shared-lines',
          textureUrl: '/assets/textures/hopscotch/hopscotch-chalk-grid-connected-candidate-v02.webp?v=1',textureSize: [2048,1024],
          cells: [
            {id:1,row:0,x:0,z:0},{id:2,row:1,x:0,z:.82},
            {id:3,row:2,x:-.39,z:1.64},{id:4,row:2,x:.39,z:1.64},
            {id:5,row:3,x:0,z:2.46},{id:6,row:4,x:-.39,z:3.28},
            {id:7,row:4,x:.39,z:3.28},{id:8,row:5,x:0,z:4.10},
          ],
        },
        {
          id: 'fan-nine-b',candidate: 'hand-drawn-fan-nine-v06',topology: 'connected-stem-with-five-cell-fan',
          textureUrl: '/assets/textures/hopscotch/hopscotch-chalk-grid-fan-nine-candidate-v06.webp?v=1',textureSize: [2048,1024],
          cells: [
            {id:1,row:0,x:0,z:0,polygon:[[-.36,-.41],[.36,-.41],[.36,.41],[-.36,.41]]},
            {id:2,row:1,x:-.39,z:.82,polygon:[[-.75,.41],[0,.41],[0,1.23],[-.75,1.23]]},
            {id:3,row:1,x:.39,z:.82,polygon:[[0,.41],[.75,.41],[.75,1.23],[0,1.23]]},
            {id:4,row:2,x:0,z:1.64,polygon:[[-.36,1.23],[.36,1.23],[.36,2.05],[-.36,2.05]]},
            {id:5,row:3,x:-.48,z:2.40,polygon:[[-1.05,2.05],[0,2.05],[0,2.72],[-.96,2.72]]},
            {id:6,row:3,x:.48,z:2.40,polygon:[[0,2.05],[1.05,2.05],[.96,2.72],[0,2.72]]},
            {id:7,row:4,x:-.38,z:2.96,polygon:[[-.96,2.72],[0,2.72],[0,3.23],[-.73,3.23]]},
            {id:8,row:4,x:.38,z:2.96,polygon:[[0,2.72],[.96,2.72],[.73,3.23],[0,3.23]]},
            {id:9,row:5,x:0,z:3.48,polygon:[[-.73,3.23],[.73,3.23],[.54,3.47],[.32,3.62],[0,3.70],[-.32,3.62],[-.54,3.47]]},
          ],
        },
      ],
      throwPhysics: {
        fixedStep: 1/120,maxSubsteps: 8,gravity: 9.81,chargeSeconds: .65,
        minSpeed: 1.15,maxSpeed: 9.2,powerScaleMin: .82,powerScaleMax: 1.03,upwardSpeed: 1.25,
        restitution: .12,tangentRetention: .48,slideDamping: 4.8,
        settleSpeed: .16,maxAge: 2.6,judgementDurationMs: 120,
      },
      look: {mouseSensitivity: .0022,touchSensitivity: .004,yawLimitDegrees: 30,pitchMinDegrees: -72,pitchMaxDegrees: -14},
      motion: {
        crouchMs: 100,airSingleMs: 260,airDoubleMs: 300,landMs: 130,
        crouchDepth: .07,arcSingle: .22,arcDouble: .16,landDip: .05,
        singleRollDegrees: 1.2,doubleRollDegrees: .3,turnMs: 320,pickupMs: 360,resetMs: 450,
      },
    },
    shuttlecock: {
      // 用户确认场地位于二号教学楼前、从东边数第二棵樟树 camphor-field-03 的东侧；
      // 当前距树心约3.6m，精确净距与程序化毽子尺寸仍为可替换的游戏工作值。
      confidence: 'user-relative-placement/gameplay-working-value',center: [-8.2, -42.3],groundY: 0,
      featherTextureUrl: '/assets/textures/shuttlecock/old-chicken-feather-cutout-v01.png',
      // 用户指定五根鲜艳染色羽毛，并取消额外加粗根部；颜色与尺寸仍是可替换视觉工作值。
      featherColors: [0xef3f32,0xf2c62d,0x318ed0,0x35ad62,0xd84f9a],featherWidth: .135,featherHeight: .39,
      featherRootRadius: .009,featherSplay: .16,featherTwist: .01,clothRadius: .052,weightTopRadius: .043,weightBottomRadius: .049,
      interactionDistance: 2.5,eyeHeight: 1.45,cameraSouthOffset: 2.7,lookHeight: .58,
      fixedStep: 1/120,maxSubsteps: 8,readyHeight: .46,
      // 鸡毛的阻力令下降比上升更慢；左右脚各带少量反向横移，形成可读的交替弧线。
      riseGravity: 8.6,fallGravity: 6.4,horizontalDrag: .55,
      kickMinY: .24,kickMaxY: .86,maxRisingKickVelocity: .65,kickVelocity: 4.35,kickVelocityGain: .02,
      footOffset: .16,kickReach: .42,footArcVelocity: .28,centeringStrength: 1.2,driftStep: .025,outRadius: 1.7,
      // 半透明圆柱是当前可踢空间的程序化工作值，会跟随下一只脚和玩家补位移动。
      safeZoneOpacity: .13,safeZoneActiveOpacity: .25,
      heightGuideMax: 1.7,shadowFadeHeight: 1.6,shadowNearRadius: .11,shadowFarRadius: .34,shadowAspect: .72,
      shadowNearOpacity: .58,shadowFarOpacity: .13,
      playerRange: 1.05,playerSpeed: 1.75,pointerMoveScale: .0035,dragMoveScale: .0045,
      storageKey: '4lite.shuttlecock.best.v1',
    },
    activity: {
      center: [21.73, -54.175], size: [21.1, 10.99], y: 0.52, confidence: 'C',
      // 北侧沙池西边对齐旧教室西边，北边紧贴旧教室南墙。
      upperSand: {
        center: [17.235, -58.16], size: [12, 5], alignment: 'west-edge-and-north-edge-to-old-classroom',
        rimWidth: 0.16, recessDepth: 0.105,
        assetUrl: '/assets/models/activity-sand/activity-sand-north-12x5-v02.glb?v=4',placementY: 0.5,
      },
      // 南侧沙池东西向居于两棵活动场南侧树之间，并向南靠近活动场边缘。
      lowerSand: {
        center: [17.9, -50.18], size: [7, 3], alignment: 'between-south-casuarinas-near-south-edge',
        rimWidth: 0.15, recessDepth: 0.115,
        assetUrl: '/assets/models/activity-sand/activity-sand-south-7x3-v02.glb?v=4',placementY: 0.5,
      },
      // 复用南侧沙池并旋转90°；世界占地3×7m，西边和南边贴齐活动场西南角。
      southwestSand: {
        center: [12.68, -52.18], size: [3, 7], alignment: 'activity-southwest-corner',
        rimWidth: 0.15, recessDepth: 0.115, rotationY: 90,
        assetUrl: '/assets/models/activity-sand/activity-sand-south-7x3-v02.glb?v=4',placementY: 0.5,
      },
      parallelBars: {
        count: 6,
        // 六组沿东西方向排成一列；每组两根杠的长边朝南北。
        center: [17.235, -58.16], spacingX: 1.85,
        // 高度按北沙池平均沙面至杠面约1.40m计算。
        railLength: 2, railGap: 0.56, railY: 1.79,
        pipeRadius: 0.035, postInset: 0.3, postBottomY: 0.31,
        material: 'gray-black-steel', confidence: 'B',
      },
      highLowBar: {
        // 沿西南角3×7m沙池的南北长边布置；北段高杠、南段低杠，共用中间立柱。
        center: [12.68, -52.18], highSpan: 2.1, lowSpan: 2,
        highHeight: 2, lowHeight: 1.6,
        pipeRadius: 0.035, braceRadius: 0.03,
        braceSpread: 0.72, braceJoinHeight: 0.92,
        postBottomY: 0.31, sandSurfaceY: 0.385,
        material: 'gray-black-steel', confidence: 'B',
      },
      monkeyBars: {
        // 南侧7×3m沙池内东西向布置：西端低、东端高，顶部连续倾斜。
        center: [17.9, -50.18], length: 4.8, width: 1.05,
        lowHeight: 1.7, highHeight: 2.1, lowSide: 'west', slopeFraction: 0.5,
        topRungCount: 9, endLadderRungCount: 4,
        railRadius: 0.03, rungRadius: 0.026,
        postBottomY: 0.31, sandSurfaceY: 0.385,
        material: 'gray-black-steel', confidence: 'B',
      },
    },
    pingPong: {
      confidence: 'A',
      // 六张统一使用优化后的标准 GLB，通过镜像与180°旋转打散重复感。
      assetCount: 6,
      assetUrl: '/assets/models/ping-pong-table/ping-pong-table-game-optimized-v01.glb?v=1',
      assetTargetWidth: 1.35,
      // 六张沿西侧场地等距布置；相邻台面之间保留 1m 净距。
      centers: [
        // 北为 -Z、南为 +Z；本组已整体向南移动2m、向东移动1m。
        [-40.5, -40.525], [-40.5, -38.175], [-40.5, -35.825],
        [-40.5, -33.475], [-40.5, -31.125], [-40.5, -28.775],
      ],
      // 1980 年代小学砌筑式球台：比现代标准球台略小。
      topSize: [2.4, 1.35],
      surfaceHeight: 0.7,
      topThickness: 0.12,
      netHeight: 0.155,
      netThickness: 0.05,
      support: { size: [0.28, 0.58, 0.88], offset: 0.62 },
      game: {
        paddleAssetUrl: '/assets/models/ping-pong-paddle/ping-pong-paddle-game-v01.glb?v=7',
        // 正式GLB按1.35m短边标定后的实际世界包围盒。小游戏必须与可见模型
        // 对齐，不能使用上方仍作为历史工作值保留的2.40m台面长度。
        tableSize: [2.077, 1.35],
        surfaceY: 0.628,
        netTopY: 0.715,
        ballRadius: 0.02,
        // 线性RGB；只作用于GLB内的胶面遮罩，木柄与木背不染色。
        rubberColours: [
          { id: 'faded-red', baseLinear: [0.13, 0.002, 0.001], wornLinear: [0.37, 0.03, 0.014] },
          { id: 'worn-black', baseLinear: [0.008, 0.009, 0.007], wornLinear: [0.11, 0.105, 0.085] },
          { id: 'deep-blue', baseLinear: [0.005, 0.018, 0.075], wornLinear: [0.025, 0.09, 0.27] },
        ],
        playerSide: 'east-positive-x',
        // 专用机位拉近并略微提高俯视角，让桌面成为画面的视觉主体。
        playerStationOffset: 0.95,
        cameraEyeY: 1.62,
        cameraTargetY: 0.68,
        cameraVerticalFov: 50,
        cameraMinHorizontalFov: 60,
        cameraMaxPortraitVerticalFov: 88,
        // 玩法调试阶段保持比赛机位完全固定。即时跟随的球拍不再驱动镜头
        // 横移或转头，避免快速鼠标输入被放大成漂浮、晃动感。
        cameraFollow: { positionLateral: 0, targetLateral: 0, smoothing: 7.5 },
        paddleRange: { lateral: 0.56, minY: 0.73, maxY: 1.28, forwardMin: -0.38, forwardMax: 0.18 },
        paddleInputSensitivity: { horizontal: 0.0036, depth: 0.0030 },
        playerPaddleHeight: 0.29,
        playerPaddlePlaneOffset: 0.20,
        aiPaddlePlaneOffset: 0.12,
        serve: {
          tossAirTimeBase: 0.68,
          tossAirTimeVariation: 0.05,
          touchTossAirTimeBase: 0.82,
          touchTossAirTimeVariation: 0.06,
          // 发球准备时，球拍位于画面左侧则左高右低、球置于拍右侧；
          // 位于画面右侧时镜像反转。
          readyPaddleTiltDeg: 12,
          readyBallOffset: { forward: 0.12, vertical: 0.075, lateral: 0.09 },
          tossPaddleRunupGap: 0.10,
          tossReleaseSafetyMargin: 0.025,
          contactRadius: 0.145,
          contactDepth: 0.09,
          minSwingSpeed: 0.55,
          maxSwingSpeed: 5.4,
          swingSpeedScale: 0.5,
          forwardSpeedMin: 2.7,
          forwardSpeedMax: 4.3,
          maxLateralAngleDeg: 34,
          // 电脑发球需让第二落点进入玩家球拍可达区；不能复用玩家发球的
          // 慢速近网轨迹，否则球会在玩家拍面之前完成第三跳。
          aiFirstBounceDepth: 0.23,
          aiFlightTime: 0.20,
        },
        physics: {
          fixedStep: 1 / 240, maxSubsteps: 16, gravity: 9.81, tossGravity: 6.5,
          airDrag: 0.09, tableRestitution: 0.88, maxBallSpeed: 11.5,
          // 限制落台后的最高上弹速度，避免球跳出玩家容易判断和触达的高度。
          maxBounceUpwardSpeed: 2.8,
          serveFlightTime: 0.46, rallyFlightTime: 0.64,
          outMarginX: 1.05, outMarginZ: 0.82,
        },
        paddleContactRadius: { player: 0.12, ai: 0.105 },
        playerContactDepth: 0.22,
        rallySwing: {
          directionMemorySeconds: 0.26,
          lateralDisplacementForFull: 0.20,
          lateralTargetOffset: 0.60,
          smashFlightTimeScale: 0.68,
          smashTargetDepth: 0.72,
          smashMaxUpwardSpeed: 0.9,
        },
        ai: {
          reactionMin: 0.18, reactionMax: 0.28,
          lateralSpeed: 2.8, verticalSpeed: 2.3,
          forwardSpeed: 3.4, shortBallForwardReach: 0.90, shortBallInterceptLead: 0.45,
          shortBallContactDepth: 0.18,
          matchMissRate: 0.14, practiceMissRate: 0.04,
        },
        rules: { targetScore: 7, serveInterval: 2, deuceAt: 6, winBy: 2 },
      },
    },
    building2Planters: {
      confidence: 'B',
      // 二号楼正面朝南（+Z）。保留原有两座，并增加东西端各一座、
      // 中央楼梯开口左右各一座；最西侧花基中心对齐最西教室正面中柱，
      // 最东侧花基外边与教学楼东边缘齐平。
      centers: [
        [-36.11, -47.18],
        [-28.38, -47.18],
        [-23.38, -47.18],
        [-16.38, -47.18],
        [-11.38, -47.18],
        [-0.16, -47.18],
      ],
      size: [2.5, 0.5, 0.5],
      stairClearance: 1,
    },
    slideReserve: {
      // 北移 3m；东缘距 X=27m 围墙内侧约 3cm。Y 比首次落位下沉 5cm。
      center: [26.18, -18.1], size: [4, 7], y: 0.49, confidence: 'C',
      assetUrl: '/assets/models/concrete-slide/concrete-slide-game-optimized-v01.glb?v=2',
      // 按用户确认的 2m 总高等比缩放；缩小后继续补移到东墙内侧，不拉伸模型。
      assetTargetHeight: 2,
      rotationY: 0,
    },
    slingshotCorner: {
      confidence: 'C',
      // Gate B 工作值：位于滑梯北端、西侧通道尽头，射向朝北侧围墙角，
      // 不跨越滑梯、操场、窗户或正常南北通行线。实机确认前不视为历史实测坐标。
      surfaceY: 0.5,
      // 默认站在十米线；五米线用于近距离练习。两条距离均从积木靶位向南量取。
      shootingOrigin: [23.006, -23.140],
      shootingTarget: [23.45, -13.15],
      firingLines: [
        { id: '5m', distance: 5, center: [23.228, -18.145], width: 1.35, depth: 0.04, rotationY: 0.0444, chalkLabel: '5' },
        { id: '10m', distance: 10, center: [23.006, -23.140], width: 1.35, depth: 0.04, rotationY: 0.0444, chalkLabel: '10' },
      ],
      treePlacementId: 'casuarina-slide-corner-01',
      treeCenter: [24.72, -12.78],
      stonePlatform: {
        // 东端与积木位置保持不变，向西加长 0.60m，为两把弹弓留出边缘台面。
        center: [23.12, -13.08],
        topSize: [2.22, 0.14, 0.62],
        topY: 0.86,
        supports: [
          { center: [22.36, -13.08], size: [0.42, 0.31, 0.52] },
          { center: [23.86, -13.08], size: [0.44, 0.35, 0.56] },
        ],
      },
      branch: {
        start: [24.67, 3.18, -12.82],
        end: [22.72, 2.88, -13.02],
        radius: 0.055,
      },
      hangingTargets: [
        { id: 'red-flat-bar', anchor: [23.02, 2.93, -12.99], center: [23.02, 2.02, -12.99], shape: 'block', size: [0.04, 0.10, 0.035], rotationZ: 0.10, color: 0xa94f3d },
        { id: 'yellow-flat-bar', anchor: [23.50, 3.00, -12.94], center: [23.50, 2.26, -12.94], shape: 'block', size: [0.04, 0.09, 0.035], rotationZ: -0.08, color: 0xb58a3c },
        { id: 'blue-flat-bar', anchor: [22.70, 2.87, -13.02], center: [22.70, 1.72, -13.02], shape: 'block', size: [0.035, 0.11, 0.04], rotationZ: 0.06, color: 0x4c7180 },
      ],
      looseBlocks: [
        { center: [22.92, 0.91, -12.95], size: [0.04, 0.10, 0.035], rotationY: -0.24, color: 0x6f8a55 },
        { center: [23.16, 0.915, -12.97], size: [0.035, 0.11, 0.04], rotationY: 0.16, color: 0xb58a3c },
        { center: [23.41, 0.905, -12.96], size: [0.04, 0.09, 0.035], rotationY: -0.08, color: 0xa94f3d },
        { center: [23.66, 0.91, -12.95], size: [0.035, 0.10, 0.04], rotationY: 0.27, color: 0x4c7180 },
        { center: [23.90, 0.90, -12.97], size: [0.04, 0.08, 0.035], rotationY: -0.19, color: 0x6f8a55 },
        { center: [23.02, 0.905, -13.16], size: [0.04, 0.09, 0.035], rotationY: 0.31, color: 0xa94f3d },
        { center: [23.46, 0.915, -13.17], size: [0.035, 0.11, 0.04], rotationY: -0.22, color: 0xb58a3c },
        { center: [23.86, 0.91, -13.15], size: [0.04, 0.10, 0.035], rotationY: 0.12, color: 0x4c7180 },
      ],
      slingshots: [
        // 两把弹弓放在石板凳西端边缘，避开中央积木靶面和弹丸通道，不落地。
        {
          id: 'wood', url: '/assets/models/slingshot/wood-slingshot-game-optimized-v01.glb?v=1', targetLength: 0.19,
          center: [22.15, 0.866, -12.86], rotation: [0, 0, 1.5708],
          interactionProxySize: [0.23, 0.12, 0.25], interactionProxyOffset: [0, 0.06, 0],
        },
        {
          id: 'wire', url: '/assets/models/slingshot/wire-slingshot-game-optimized-v01.glb?v=1', targetLength: 0.18,
          center: [22.15, 0.866, -13.30], rotation: [0, -0.14, 0],
          interactionProxySize: [0.18, 0.09, 0.23], interactionProxyOffset: [0, 0.045, 0],
        },
      ],
      game: {
        confidence: 'C', interactionDistance: 2.8, proxyLayer: 8,
        defaultSlingshot: 'wood', defaultDistance: 10,
        eyeHeight: 1.45, targetHeight: 1.68, aimingFov: 38,
        // 水平转头总范围 120°：以靶道中心为基准左右各 60°。
        aimYawDegrees: 60, aimPitchMinDegrees: -35, aimPitchMaxDegrees: 28,
        // 触屏在画面任意非弹兜位置拖动瞄准；弹兜按实际投影外扩少量触摸容差后才可蓄力。
        touchAimSensitivity: 0.0038, touchPouchPaddingPx: 12, touchPouchMinRadiusPx: 28,
        fixedStep: 1/120, maxSubsteps: 8, gravity: 9.81,
        projectileRadius: 0.0125, projectilePoolSize: 6, projectileLifetime: 3.2,
        projectileMaxBounces: 3, projectileRestitution: 0.42, projectileGroundFriction: 0.72, projectileMinBounceSpeed: 1.15,
        projectileBounceDirectionDegrees: 14, projectileBounceVerticalVariation: 0.16,
        safeLaneHalfWidth: 1.15, safeLaneBackMargin: 1.2, safeLaneEndMargin: 0.65,
        hangingDampingX: 0.55, hangingDampingZ: 0.62,
        elastic: {
          maxPull: 0.13, chargeSeconds: 1.2, maxHoldSteadySeconds: 0.7,
          tremorRampSeconds: 1.5, chargeSwayRampSeconds: 0.45,
          spring: 360, damping: 6, settleDamping: 20, settleAfterSeconds: 0.27,
          forwardHoldSeconds: 0.075,
          forkDipAttack: 0.06, forkDipDuration: 0.34, maxForkDip: 0.024, maxForkPitchDegrees: 7,
          pouchCenterAttack: 0.085, pouchCenterHold: 0.19, pouchDropDuration: 0.42,
        },
        profiles: {
          wood: {
            label: '木叉弹弓', minLaunchSpeed: 7.2, maxLaunchSpeed: 22,
            chargeSwayDegrees: 0.42, maxTremorDegrees: 1.65,
          },
          wire: {
            label: '铁丝弹弓', minLaunchSpeed: 5.8, maxLaunchSpeed: 17.2,
            chargeSwayDegrees: 0.20, maxTremorDegrees: 0.92,
          },
        },
        held: {
          // 射击时叉体、皮兜与弹丸起点必须沿相机中心线对齐；只保留垂直持握偏移。
          position: [0, -0.205, -0.43],
          wood: {
            modelRotation: [0, 0, 0],
            leftAnchor: [-0.050, 0.178, 0.012], rightAnchor: [0.050, 0.178, 0.012],
            leftBindingCenter: [-0.041, 0.178, 0.010], rightBindingCenter: [0.041, 0.178, 0.010], bindingTiltDegrees: 18,
            restPouchCenter: [0, 0.086, 0.028], pouchSize: [0.046, 0.026, 0.004],
            anchorEmbed: 0.008, bindingRadius: 0.0070, restBandSag: 0.017, pouchCupDepth: 0.0052, drawPouchY: 0.116,
            visualPullScale: 0.62, drawBandWidthScale: 0.78,
          },
          wire: {
            modelRotation: [1.5708, 0, 0],
            // 铁丝叉接点从过度内收位置回调，并再向外微调 3 mm；绑扎与胶条同步。
            leftAnchor: [-0.032, 0.173, 0.008], rightAnchor: [0.032, 0.173, 0.008],
            leftBindingCenter: [-0.032, 0.173, 0.007], rightBindingCenter: [0.032, 0.173, 0.007], bindingTiltDegrees: 13,
            restPouchCenter: [0, 0.083, 0.025], pouchSize: [0.043, 0.024, 0.004],
            anchorEmbed: 0.007, bindingRadius: 0.0040, restBandSag: 0.015, pouchCupDepth: 0.0046, drawPouchY: 0.090,
            visualPullScale: 0.62, drawBandWidthScale: 0.78,
          },
        },
      },
    },
    banyan: {
      center: [22.22, -36.8], y: 0, targetHeight: 8,
      collisionRadius: 0.84, confidence: 'A-/C',
      // 场景内只使用这一棵高细节榕树；全程保持已确认的完整模型，避免可见的LOD跳变。
      assetUrl: '/assets/models/banyan-tree/banyan-tree-scene-optimized.glb?v=2',
    },
    playgroundTrees: {
      confidence: 'B/C',
      assets: {
        casuarina: '/assets/models/playground-trees/casuarina-tree-game-v11.glb?v=4',
        camphor: '/assets/models/playground-trees/camphor-tree-game-v11.glb?v=2',
        bauhinia: '/assets/models/playground-trees/bauhinia-tree-game-v11.glb?v=2',
      },
      // 根据手绘示意图布置。rotationY 使用角度，避免同类树朝向完全一致。
      placements: [
        // 一号楼北侧六棵马尾松。
        { id: 'casuarina-b1-north-01', species: 'casuarina', center: [-21.5, -26.3], height: 8.0, rotationY: 13 },
        { id: 'casuarina-b1-north-02', species: 'casuarina', center: [-15.0, -26.0], height: 8.0, rotationY: 71 },
        { id: 'casuarina-b1-north-03', species: 'casuarina', center: [-8.5, -26.35], height: 8.0, rotationY: 139 },
        { id: 'casuarina-b1-north-04', species: 'casuarina', center: [3.0, -26.05], height: 8.0, rotationY: 47 },
        { id: 'casuarina-b1-north-05', species: 'casuarina', center: [9.5, -26.4], height: 8.0, rotationY: 112 },
        { id: 'casuarina-b1-north-06', species: 'casuarina', center: [16.5, -26.1], height: 8.0, rotationY: 173 },
        // 旧教室前方活动场地的南端两棵马尾松。
        { id: 'casuarina-activity-south-01', species: 'casuarina', center: [13.8, -47.2], height: 8.0, rotationY: 32 },
        // 天梯东侧这棵向西移1.5m，落在天梯南边的主水泥地上。
        { id: 'casuarina-activity-south-02', species: 'casuarina', center: [20.5, -47.2], height: 8.0, rotationY: 128 },
        // 教师宿舍南北端各一棵马尾松；坐标为按建筑外缘与高台范围避让后的工作值。
        { id: 'casuarina-dormitory-north-01', species: 'casuarina', center: [29.0, -44.6], height: 8.0, rotationY: 84 },
        { id: 'casuarina-dormitory-south-01', species: 'casuarina', center: [29.0, -28.5], height: 8.0, rotationY: 156 },
        // 弹弓自然游乐角：滑梯北端靠墙角的一棵较矮马尾松；位置为 Gate B 工作值。
        { id: 'casuarina-slide-corner-01', species: 'casuarina', center: [24.72, -12.78], height: 6.8, rotationY: 204 },
        // 旧教室东侧水泥路外缘的一棵马尾松；具体净距仍为工作值。
        { id: 'casuarina-old-classroom-east-01', species: 'casuarina', center: [31.5, -64.4], height: 8.0, rotationY: 23 },
        // 一号楼前院，两翼朝中间各两棵马尾松。
        { id: 'casuarina-b1-front-west-01', species: 'casuarina', center: [-11.2, -5.9], height: 8.0, rotationY: 58 },
        { id: 'casuarina-b1-front-west-02', species: 'casuarina', center: [-11.1, -11.6], height: 8.0, rotationY: 151 },
        { id: 'casuarina-b1-front-east-01', species: 'casuarina', center: [6.2, -6.0], height: 8.0, rotationY: 101 },
        { id: 'casuarina-b1-front-east-02', species: 'casuarina', center: [6.1, -11.7], height: 8.0, rotationY: 19 },
        // 主操场横向四棵樟树；整体向南移动 0.5 米。
        { id: 'camphor-field-01', species: 'camphor', center: [-36.8, -42.2], height: 6.30, rotationY: 24 },
        { id: 'camphor-field-02', species: 'camphor', center: [-23.6, -42.6], height: 6.75, rotationY: 93 },
        { id: 'camphor-field-03', species: 'camphor', center: [-11.8, -42.3], height: 6.45, rotationY: 167 },
        { id: 'camphor-field-04', species: 'camphor', center: [-0.2, -42.8], height: 6.85, rotationY: 51 },
        // 乒乓球台东侧三棵较矮的羊蹄甲。
        { id: 'bauhinia-pingpong-01', species: 'bauhinia', center: [-31.8, -41.2], height: 4.65, rotationY: 17 },
        { id: 'bauhinia-pingpong-02', species: 'bauhinia', center: [-31.5, -36.1], height: 5.05, rotationY: 122 },
        { id: 'bauhinia-pingpong-03', species: 'bauhinia', center: [-31.2, -30.0], height: 4.80, rotationY: 211 },
      ],
    },
    b1NorthGraniteBenches: {
      confidence: 'A/B',
      // 一号楼北侧最西两棵马尾松之间一条，东边三棵之间两条；
      // 每条板凳均位于对应相邻树的中点。
      centers: [[-18.25, -26.15], [6.25, -26.225], [13.0, -26.25]],
      seatSize: [2, 0.12, 0.4],
      totalHeight: 0.4,
      legSize: [0.12, 0.28, 0.32],
      legOffsets: [-0.72, 0, 0.72],
    },
    b1NorthBambooClimb: {
      confidence: 'A/C',
      // 一号楼北侧办公室后方，从西往东第2、3棵马尾松之间。位置关系来自亲历者记忆；
      // 横管与竹竿尺寸均为当前工作值，待真实运行画面复核。
      treeCenters: [[-15.0, -26.0], [-8.5, -26.35]],
      crossbarHeight: 4,
      crossbarRadius: 0.035,
      treeClearance: 0.44,
      bambooHeight: 5,
      bambooRadius: 0.04,
      bambooSpacing: 1.05,
      nodeSpacing: 0.46,
      game: {
        interactionDistance: 2.5,
        cameraNorthOffset: 0.44,
        initialEyeY: 1.45,
        finishEyeY: 4.65,
        lookAheadY: 0.65,
        topFocusBelow: 0.35,
        chargeSeconds: 1,
        perfectRatio: 0.96,
        maxRise: 0.3,
        riseDurationMs: 320,
        slideDurationMs: 1150,
        failureDelayMs: 450,
        cursorSpeed: 1.7,
        headYawRadians: 0.34,
        headPitchRadians: 0.16,
        headRollRadians: 0.12,
        arrowCenterX: 0.36,
        arrowCenterY: -0.04,
        arrowHalfWidth: 0.13,
        arrowHalfHeight: 0.38,
      },
    },
    octopusHandheld: {
      id: 'octopus-oc22-01',
      confidence: 'A/C',
      modelType: 'photoreal-layered-oc22-v2',
      assetUrl: '/assets/handheld/octopus/octopus-oc22-photoreal-base-v02.png?v=1',
      assets: {
        deviceBaseUrl: '/assets/handheld/octopus/octopus-oc22-photoreal-base-v04.png?v=1',
        sceneCompositeUrl: '/assets/handheld/octopus/octopus-oc22-photoreal-base-v02.png?v=1',
        lcdAtlasUrl: '/assets/handheld/octopus/octopus-lcd-segment-atlas-v04.png?v=1',
        lcdManifestUrl: '/assets/handheld/octopus/octopus-lcd-segments-v03.json?v=1',
        semanticLayoutUrl: '/assets/handheld/octopus/octopus-lcd-semantic-layout-v05.json?v=1',
      },
      imageSize: [1659, 948],
      lcdRectNormalized: [484 / 1659, 262 / 948, 668 / 1659, 425 / 948],
      lcdSegmentScale: 0.94,
      lcdSegmentOffset: [30 / 1659, 0],
      lcdLayoutVersion: 'manual-color-v06-mode-indicators',
      buttonsNormalized: {
        left: { center: [280.5 / 1659, 639.5 / 948], size: [98 / 1659, 97 / 948], shape: 'circle' },
        right: { center: [1369.8 / 1659, 640 / 948], size: [98 / 1659, 96 / 948], shape: 'circle' },
        gameA: { center: [1349 / 1659, 169 / 948], size: [71 / 1659, 38 / 948], shape: 'rect' },
        gameB: { center: [1349 / 1659, 263 / 948], size: [71 / 1659, 38 / 948], shape: 'rect' },
        time: { center: [1349 / 1659, 357 / 948], size: [71 / 1659, 38 / 948], shape: 'rect' },
      },
      workingSize: [0.114, 0.064, 0.010],
      interactionDistance: 2.5,
      proxyLayer: 8,
      placement: {
        classroom: 'b2-room-3-floor-1',
        deskId: 'b2-room-3-floor-1-row-5-column-2-student-desk',
        cubby: 'right',
        localZ: -0.08,
        tiltDegrees: -8,
      },
      game: {
        scorePerTreasure: 1,
        returnBonus: 3,
        gameOverMisses: 3,
        clearMissesAt: [200, 500],
        gameATickMs: 700,
        gameBTickMs: 520,
        // 每100分回到本模式的初始速度；周期内每20分提升一档。
        speedStagePoints: 20,
        speedCyclePoints: 100,
        speedTables: {
          gameA: [700, 650, 600, 550, 500],
          gameB: [520, 475, 430, 390, 350],
        },
        caughtDurationMs: 900,
        gameOverDurationMs: 1350,
        pickupFrameMs: 130,
        boatCargoFrameMs: 180,
        clock24Hour: true,
        alarmEnabled: false,
      },
    },
    fireHandheld: {
      id: 'fire-fr27-01',
      confidence: 'A/C',
      modelType: 'photoreal-layered-fr27-v1',
      assets: {
        deviceBaseUrl: '/assets/handheld/fire/fire-fr27-photoreal-base-v02.png?v=1',
        lcdAtlasUrl: '/assets/handheld/fire/fire-lcd-segment-atlas-v01.png?v=1',
        lcdManifestUrl: '/assets/handheld/fire/fire-lcd-segments-v01.json?v=1',
        semanticLayoutUrl: '/assets/handheld/fire/fire-lcd-semantic-layout-v02.json?v=1',
      },
      imageSize: [1672, 941],
      lcdRectNormalized: [474 / 1672, 258 / 941, 716 / 1672, 453 / 941],
      lcdLayoutVersion: 'fire-manual-ownership-v06',
      buttonsNormalized: {
        left: { center: [245 / 1672, 675 / 941], size: [112 / 1672, 112 / 941], shape: 'circle' },
        right: { center: [1415 / 1672, 675 / 941], size: [112 / 1672, 112 / 941], shape: 'circle' },
        gameA: { center: [1379 / 1672, 160 / 941], size: [82 / 1672, 52 / 941], shape: 'rect' },
        gameB: { center: [1379 / 1672, 258 / 941], size: [82 / 1672, 52 / 941], shape: 'rect' },
        time: { center: [1379 / 1672, 365 / 941], size: [82 / 1672, 52 / 941], shape: 'rect' },
      },
      workingSize: [0.124, 0.070, 0.010],
      interactionDistance: 2.5,
      proxyLayer: 8,
      placement: {
        classroom: 'b2-room-1-floor-2',
        deskId: 'b2-room-1-floor-2-row-5-column-2-student-desk',
        cubby: 'left',
        localZ: -0.08,
        tiltDegrees: -8,
      },
      game: {
        gameOverMisses: 3,
        clearMissesAt: [200, 500],
        gameATickMs: 720,
        gameBTickMs: 540,
        speedStagePoints: 20,
        speedCyclePoints: 100,
        speedTables: {
          gameA: [720, 665, 610, 555, 500],
          gameB: [540, 495, 450, 405, 360],
        },
        missDurationMs: 850,
        gameOverDurationMs: 1400,
      },
    },
    rubiksCube: {
      id: 'classroom-rubiks-cubes-v1',
      seed: 'classroom-rubiks-cubes-v1',
      confidence: 'C',
      textureUrl: '/assets/textures/rubiks-cube/rubiks-sticker-wear-atlas-v01.webp?v=1',
      textureSize: [768, 768],
      textureTemplates: 9,
      workingSize: 0.057,
      interactionDistance: 2.5,
      proxyLayer: 8,
      // Gate B 先接入一层单只原型；二、三层实例待实际操作与画面确认后扩展。
      cubes: [{
        id: 'b2-floor-1-rubiks-cube-01',
        classroom: 'b2-room-1-floor-1',
        deskId: 'b2-room-1-floor-1-row-4-column-2-student-desk',
        local: [-0.28, 0.04],
        rotationDegrees: 12,
        scrambleMoves: 8,
      }],
    },
    flag: {
      // 由上一工作点整体向西1.5m、向北1m。
      center: [-5.15, -47.18],
      lower: { size: [1.6, 1.4], height: 0.4 },
      upper: { size: [1.2, 0.7], height: 0.4 },
      pole: { radius: 0.06, height: 7 },
      game: {
        interactionDistance: 2.5,
        proxyLayer: 11,
        flagSize: [1.44, 0.96],
        flagFarEdgeDrop: 0.14,
        lowTopY: 2.15,
        highTopY: 7.52,
        ropeBottomY: 1.12,
        ropeLoopRadius: 0.034,
        pulleyY: 7.58,
        ropeSouthOffset: 0.105,
        cameraLateralOffset: -0.15,
        cameraSouthOffset: 1.05,
        cameraEyeY: 2.18,
        cameraFov: 68,
        cameraHighFov: 32,
        cameraPortraitFov: 110,
        cameraPortraitHighFov: 55,
        entryDurationMs: 550,
        regripDurationMs: 180,
        ropeHitRadius: 64,
        ropeTouchHitRadius: 48,
        cancelDropDurationMs: 600,
        strokePixels: 140,
        strokeProgress: 0.15,
      },
      confidence: 'A-',
    },
    basketballHoop: {
      confidence: 'A-',
      assetUrl: '/assets/models/basketball-hoop/basketball-hoop-game-optimized-v01.glb?v=6',
      // 位于天梯南侧主水泥地，紧挨从东往西数的第二棵马尾松 [13.8,-47.2]；模型正面由 -Z 旋转至校园南侧 +Z。
      center: [15.1, -45.4],
      // 主水泥地可见面为 Y=0.006；GLB 足板最低点约为局部 Y=0.0015。
      surfaceY: 0.0045,
      rotationY: 180,
      forward: [0, 1],
      rimHeight: 2.75,
      rimInnerDiameter: 0.50,
      rimTubeRadius: 0.018,
      rimMountCollision: false,
      rimCenterLocal: [0, 2.75, -2.081],
      boardSize: [1.8, 1.05, 0.04],
      boardCenterLocal: [0, 3.125, -1.706],
      baseSize: [1.75, 0.08, 1.336],
      facing: 'south-positive-z',
      court: {
        width: 10, length: 13, baselineForward: 0.82,
        laneWidth: 3.6, freeThrowDistance: 5.8,
        threePointRadius: 6.25, centerCircleRadius: 1.8, paintWidth: 0.045,
      },
    },
    basketballs: {
      // 三只球集中放在朝南篮球架前下方的主水泥地；刷新页面后复位到这些位置。
      confidence: 'B',
      assetUrl: '/assets/models/basketball/basketball-game-optimized-v01.glb?v=1',
      diameter: 0.24,
      radius: 0.12,
      surfaceY: 0,
      placements: [
        { id: 'hoop-basketball-01', center: [14.45, -42.75], rotationY: 18 },
        { id: 'hoop-basketball-02', center: [15.10, -42.55], rotationY: 103 },
        { id: 'hoop-basketball-03', center: [15.75, -42.72], rotationY: 227 },
      ],
      persistence: 'reset-on-campus-entry-or-refresh',
      interaction: {
        pickupDistance: 2.5, kickDistance: 1.6,
        chargeMinSeconds: 0.15,
        chargeMaxSecondsNear: 3.0, chargeMaxSecondsFar: 1.5,
        chargeNearDistance: 0.75, chargeFarDistance: 6.25,
        chargeDecisionRatio: 0.62,
        throwSpeedMin: 5.5, throwSpeedMax: 12,
        throwUpwardBias: 0.8, kickSpeed: 7, kickUpwardSpeed: 1.8,
        resetKey: 'KeyR', kickKey: 'KeyF',
        worldBounds: [-45, 35, -70, 10],
        shotAssist: {
          enabled: true, maxDistance: 14, minAimDot: 0.78,
          fitRadius: 1.35, maxVelocityCorrection: 0.34, targetFrontOffset: 0.10,
        },
        scoreTolerance: 0.05, rimCollisionRadiusScale: 0.88,
      },
    },
  },
  player: {
    // 40cm直径接近侧身穿过课桌、讲台等室内窄缝时的有效占位；原64cm
    // 直径会让视觉上约45cm的通道完全不可通过。
    eyeHeight: 1.48, radius: 0.20, maxStep: 0.35, speed: 4.2, sprint: 7.2,
    spawn: [-2.5, 1.62, -2.6],
    // 首次进入从校园东南侧空中沿柔和曲线飘落到校门出生点；这些轨迹点只
    // 控制镜头演出，不参与玩家碰撞、地面采样或后续行走坐标。
    arrival: {
      durationMs: 1500,
      start: [15.5, 17.5, 13],
      control1: [13.5, 16.2, 7.5],
      control2: [2.5, 6.4, .4],
      lookStart: [-4, 1.8, -31],
      lookEnd: [-2.5, 1.62, -14],
      confidence: 'C',
    },
    // 整个校园的东侧活动界限：以教师宿舍西立面为南北直线，线东侧均不可进入。
    eastWalkLimit: { x: 26.17, reference: 'campus-east-activity-limit-aligned-to-teacher-dormitory-west-facade', confidence: 'A' },
    aerial: { position: [54, 59, 50], target: [-3, 0, -31] },
  },
}

export const WORKING_VALUES = [
  ['校园外包', '90 × 64 m', 'C'],
  ['1号楼', '43.96 m 主楼；层高 3.10 m', 'A/B'],
  ['2号楼', '41.94 × 9.48 m；层高 3.10 m', 'A/B'],
  ['旧教室', '26 × 7.5 m', 'C'],
  ['厕所', '6 × 4 m', 'A-'],
  ['教师宿舍', '12.8 × 5.5 m', 'A-/C'],
  ['东侧高台', '高 0.50 m；边界为工作值', 'A-/C'],
]
