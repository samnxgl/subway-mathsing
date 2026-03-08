// ============================================================
// MATH SURFERS - A Subway Surfers-style runner with math problems
// ============================================================

(function () {
  "use strict";

  // ===== CONSTANTS =====
  const LANE_WIDTH = 2.5;
  const LANES = [-LANE_WIDTH, 0, LANE_WIDTH];
  const GAME_SPEED_INITIAL = 0.10;
  const GAME_SPEED_MAX = 0.30;
  const GAME_SPEED_INCREASE = 0.00008;
  const JUMP_FORCE = 0.28;
  const GRAVITY = 0.012;
  const ROLL_DURATION = 40;
  const OBSTACLE_SPAWN_INTERVAL_MIN = 40;
  const OBSTACLE_SPAWN_INTERVAL_MAX = 90;
  const COIN_SPAWN_INTERVAL = 25;
  const RENDER_DISTANCE = 120;
  const MATH_TRIGGER_DISTANCE_NORMAL = 200;
  const MATH_TRIGGER_DISTANCE_FREQUENT = 100;
  const MATH_TRIGGER_DISTANCE_RARE = 400;
  const MATH_TIMER_SECONDS = 15;

  // ===== GAME STATE =====
  const state = {
    screen: "menu",
    score: 0,
    coins: 0,
    distance: 0,
    highScore: parseInt(localStorage.getItem("mathSurfersHighScore") || "0"),
    multiplier: 1,
    gameSpeed: GAME_SPEED_INITIAL,
    playerLane: 1,
    targetLane: 1,
    playerY: 0,
    playerVelocityY: 0,
    isJumping: false,
    isRolling: false,
    rollTimer: 0,
    isPaused: false,
    isGameOver: false,
    obstacles: [],
    coinObjects: [],
    sceneryObjects: [],
    obstacleTimer: 0,
    coinTimer: 0,
    lastMathDistance: 0,
    mathCorrect: 0,
    mathTotal: 0,
    mathStreak: 0,
    soundEnabled: true,
    difficulty: 2,
    mathFrequency: "normal",
    animationId: null,
    swipeStartX: 0,
    swipeStartY: 0,
    groundTiles: [],
    railTiles: [],
  };

  // ===== DIFFICULTY DESCRIPTIONS =====
  const DIFF_DESCRIPTIONS = {
    1: "Addition & subtraction up to 20",
    2: "Addition & subtraction up to 50, simple multiplication",
    3: "Multiplication & division, larger numbers",
    4: "Mixed operations, multi-step problems",
  };
  const DIFF_NAMES = { 1: "Easy", 2: "Medium", 3: "Hard", 4: "Expert" };

  // ===== AUDIO (Web Audio API) =====
  let audioCtx = null;

  function initAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
  }

  function playTone(freq, duration, type, vol) {
    if (!state.soundEnabled || !audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type || "square";
    osc.frequency.value = freq;
    gain.gain.value = vol || 0.08;
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      audioCtx.currentTime + duration
    );
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  }

  function sfxCoin() {
    playTone(880, 0.1, "square", 0.06);
    setTimeout(() => playTone(1100, 0.1, "square", 0.05), 50);
  }
  function sfxJump() {
    playTone(300, 0.15, "sine", 0.07);
  }
  function sfxCrash() {
    playTone(150, 0.3, "sawtooth", 0.1);
  }
  function sfxCorrect() {
    playTone(523, 0.1, "sine", 0.08);
    setTimeout(() => playTone(659, 0.1, "sine", 0.08), 100);
    setTimeout(() => playTone(784, 0.15, "sine", 0.08), 200);
  }
  function sfxWrong() {
    playTone(200, 0.2, "sawtooth", 0.08);
    setTimeout(() => playTone(150, 0.3, "sawtooth", 0.08), 150);
  }
  function sfxLaneSwitch() {
    playTone(440, 0.06, "sine", 0.04);
  }

  // ===== THREE.JS SETUP =====
  const canvas = document.getElementById("game-canvas");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0x87ceeb, 60, RENDER_DISTANCE);

  const camera = new THREE.PerspectiveCamera(
    65,
    window.innerWidth / window.innerHeight,
    0.1,
    RENDER_DISTANCE + 20
  );
  camera.position.set(0, 5.5, -7);
  camera.lookAt(0, 1.5, 10);

  // Lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(5, 15, -5);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 1024;
  dirLight.shadow.mapSize.height = 1024;
  dirLight.shadow.camera.near = 1;
  dirLight.shadow.camera.far = 50;
  dirLight.shadow.camera.left = -15;
  dirLight.shadow.camera.right = 15;
  dirLight.shadow.camera.top = 15;
  dirLight.shadow.camera.bottom = -15;
  scene.add(dirLight);

  // ===== MATERIALS =====
  const mat = {
    ground: new THREE.MeshLambertMaterial({ color: 0x555555 }),
    groundLine: new THREE.MeshLambertMaterial({ color: 0x666666 }),
    rail: new THREE.MeshLambertMaterial({ color: 0x888888 }),
    player: new THREE.MeshPhongMaterial({
      color: 0xff4444,
      shininess: 60,
    }),
    playerAccent: new THREE.MeshPhongMaterial({
      color: 0x2222cc,
      shininess: 60,
    }),
    playerSkin: new THREE.MeshPhongMaterial({
      color: 0xffcc99,
      shininess: 30,
    }),
    playerHair: new THREE.MeshPhongMaterial({ color: 0x332211 }),
    playerShoe: new THREE.MeshPhongMaterial({ color: 0xffffff }),
    obstacle: new THREE.MeshPhongMaterial({
      color: 0xff8800,
      shininess: 40,
    }),
    obstacleBarrier: new THREE.MeshPhongMaterial({ color: 0xffcc00 }),
    obstacleTrain: new THREE.MeshPhongMaterial({
      color: 0x3366cc,
      shininess: 50,
    }),
    obstacleTrainStripe: new THREE.MeshPhongMaterial({ color: 0xffdd00 }),
    coin: new THREE.MeshPhongMaterial({
      color: 0xffd700,
      shininess: 100,
      emissive: 0xaa8800,
      emissiveIntensity: 0.3,
    }),
    building: new THREE.MeshLambertMaterial({ color: 0x999999 }),
    buildingDark: new THREE.MeshLambertMaterial({ color: 0x777777 }),
    buildingWindow: new THREE.MeshLambertMaterial({
      color: 0xaaddff,
      emissive: 0x445566,
      emissiveIntensity: 0.2,
    }),
    grass: new THREE.MeshLambertMaterial({ color: 0x44aa44 }),
    tree: new THREE.MeshLambertMaterial({ color: 0x228822 }),
    treeTrunk: new THREE.MeshLambertMaterial({ color: 0x664422 }),
  };

  // ===== CREATE PLAYER =====
  const playerGroup = new THREE.Group();

  function createPlayer() {
    // Body (torso)
    const torso = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.9, 0.4),
      mat.player
    );
    torso.position.y = 1.25;
    torso.castShadow = true;
    playerGroup.add(torso);

    // Hoodie hood
    const hood = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.25, 0.45),
      mat.player
    );
    hood.position.set(0, 1.8, -0.05);
    playerGroup.add(hood);

    // Head
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.5, 0.45),
      mat.playerSkin
    );
    head.position.y = 2.0;
    head.castShadow = true;
    playerGroup.add(head);

    // Hair
    const hair = new THREE.Mesh(
      new THREE.BoxGeometry(0.52, 0.2, 0.47),
      mat.playerHair
    );
    hair.position.y = 2.3;
    playerGroup.add(hair);

    // Eyes
    const eyeGeo = new THREE.BoxGeometry(0.08, 0.08, 0.05);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.12, 2.05, 0.23);
    playerGroup.add(leftEye);
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.12, 2.05, 0.23);
    playerGroup.add(rightEye);

    // Arms
    const armGeo = new THREE.BoxGeometry(0.2, 0.7, 0.25);
    const leftArm = new THREE.Mesh(armGeo, mat.player);
    leftArm.position.set(-0.5, 1.2, 0);
    leftArm.castShadow = true;
    leftArm.name = "leftArm";
    playerGroup.add(leftArm);
    const rightArm = new THREE.Mesh(armGeo, mat.player);
    rightArm.position.set(0.5, 1.2, 0);
    rightArm.castShadow = true;
    rightArm.name = "rightArm";
    playerGroup.add(rightArm);

    // Legs
    const legGeo = new THREE.BoxGeometry(0.25, 0.6, 0.3);
    const leftLeg = new THREE.Mesh(legGeo, mat.playerAccent);
    leftLeg.position.set(-0.17, 0.5, 0);
    leftLeg.castShadow = true;
    leftLeg.name = "leftLeg";
    playerGroup.add(leftLeg);
    const rightLeg = new THREE.Mesh(legGeo, mat.playerAccent);
    rightLeg.position.set(0.17, 0.5, 0);
    rightLeg.castShadow = true;
    rightLeg.name = "rightLeg";
    playerGroup.add(rightLeg);

    // Shoes
    const shoeGeo = new THREE.BoxGeometry(0.28, 0.15, 0.4);
    const leftShoe = new THREE.Mesh(shoeGeo, mat.playerShoe);
    leftShoe.position.set(-0.17, 0.15, 0.05);
    leftShoe.name = "leftShoe";
    playerGroup.add(leftShoe);
    const rightShoe = new THREE.Mesh(shoeGeo, mat.playerShoe);
    rightShoe.position.set(0.17, 0.15, 0.05);
    rightShoe.name = "rightShoe";
    playerGroup.add(rightShoe);

    playerGroup.position.set(0, 0, 0);
    scene.add(playerGroup);
  }

  // ===== CREATE GROUND / TRACKS =====
  const TILE_LENGTH = 30;
  const NUM_TILES = 5;

  function createGroundTile(zOffset) {
    const group = new THREE.Group();

    // Main track
    const trackGeo = new THREE.PlaneGeometry(LANE_WIDTH * 3.2, TILE_LENGTH);
    const track = new THREE.Mesh(trackGeo, mat.ground);
    track.rotation.x = -Math.PI / 2;
    track.position.y = 0.01;
    track.receiveShadow = true;
    group.add(track);

    // Lane dividers
    for (let i = -1; i <= 1; i += 2) {
      const lineGeo = new THREE.PlaneGeometry(0.08, TILE_LENGTH);
      const line = new THREE.Mesh(lineGeo, mat.groundLine);
      line.rotation.x = -Math.PI / 2;
      line.position.set(i * (LANE_WIDTH / 2), 0.02, 0);
      group.add(line);
    }

    // Track edges
    for (let side = -1; side <= 1; side += 2) {
      const edgeGeo = new THREE.BoxGeometry(0.15, 0.15, TILE_LENGTH);
      const edge = new THREE.Mesh(edgeGeo, mat.rail);
      edge.position.set(side * (LANE_WIDTH * 1.6 + 0.1), 0.075, 0);
      group.add(edge);
    }

    // Grass on sides
    for (let side = -1; side <= 1; side += 2) {
      const grassGeo = new THREE.PlaneGeometry(20, TILE_LENGTH);
      const grass = new THREE.Mesh(grassGeo, mat.grass);
      grass.rotation.x = -Math.PI / 2;
      grass.position.set(side * 14, -0.01, 0);
      group.add(grass);
    }

    group.position.z = zOffset;
    scene.add(group);
    return group;
  }

  function initGround() {
    for (let i = 0; i < NUM_TILES; i++) {
      state.groundTiles.push(createGroundTile(i * TILE_LENGTH));
    }
  }

  function updateGround() {
    for (const tile of state.groundTiles) {
      tile.position.z -= state.gameSpeed;
      if (tile.position.z < -TILE_LENGTH) {
        tile.position.z += NUM_TILES * TILE_LENGTH;
        updateSceneryForTile(tile);
      }
    }
  }

  // ===== SCENERY =====
  function createBuilding(x, z, seed) {
    const group = new THREE.Group();
    const w = 2 + Math.random() * 3;
    const h = 4 + Math.random() * 12;
    const d = 2 + Math.random() * 3;
    const bMat = Math.random() > 0.5 ? mat.building : mat.buildingDark;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bMat);
    body.position.y = h / 2;
    body.castShadow = true;
    group.add(body);

    // Windows
    const rows = Math.floor(h / 1.5);
    const cols = Math.floor(w / 1.2);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (Math.random() > 0.4) {
          const win = new THREE.Mesh(
            new THREE.PlaneGeometry(0.4, 0.5),
            mat.buildingWindow
          );
          win.position.set(
            -w / 2 + 0.6 + c * 1.1,
            1.5 + r * 1.5,
            d / 2 + 0.01
          );
          group.add(win);
        }
      }
    }

    group.position.set(x, 0, z);
    return group;
  }

  function createTree(x, z) {
    const group = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.2, 1.5, 6),
      mat.treeTrunk
    );
    trunk.position.y = 0.75;
    group.add(trunk);

    const canopy = new THREE.Mesh(
      new THREE.ConeGeometry(1.2, 2.5, 6),
      mat.tree
    );
    canopy.position.y = 2.8;
    canopy.castShadow = true;
    group.add(canopy);

    group.position.set(x, 0, z);
    return group;
  }

  function updateSceneryForTile(tile) {
    // Remove old scenery children that are scenery
    const toRemove = [];
    tile.traverse((child) => {
      if (child.userData.isScenery) toRemove.push(child);
    });
    toRemove.forEach((obj) => {
      tile.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
    });

    // Add new scenery
    for (let side = -1; side <= 1; side += 2) {
      const baseX = side * (6 + Math.random() * 5);
      if (Math.random() > 0.3) {
        const b = createBuilding(baseX, (Math.random() - 0.5) * TILE_LENGTH);
        b.userData.isScenery = true;
        tile.add(b);
      }
      if (Math.random() > 0.5) {
        const t = createTree(
          side * (5 + Math.random() * 2),
          (Math.random() - 0.5) * TILE_LENGTH
        );
        t.userData.isScenery = true;
        tile.add(t);
      }
    }
  }

  // ===== OBSTACLES =====
  function createBarrier(lane) {
    const group = new THREE.Group();
    // Horizontal bar
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.2, 0.2),
      mat.obstacleBarrier
    );
    bar.position.y = 0.9;
    bar.castShadow = true;
    group.add(bar);
    // Posts
    for (let s = -1; s <= 1; s += 2) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 1.0, 0.12),
        mat.obstacle
      );
      post.position.set(s * 0.8, 0.5, 0);
      post.castShadow = true;
      group.add(post);
    }
    // Stripes
    for (let i = 0; i < 4; i++) {
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, 0.18, 0.22),
        i % 2 === 0 ? mat.obstacle : mat.obstacleBarrier
      );
      stripe.position.set(-0.6 + i * 0.4, 0.9, 0);
      group.add(stripe);
    }
    group.userData.type = "barrier";
    group.userData.height = 1.0;
    group.userData.canRollUnder = false;
    return group;
  }

  function createTallBarrier(lane) {
    const group = new THREE.Group();
    // Top bar - can roll under
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.25, 0.3),
      mat.obstacleBarrier
    );
    bar.position.y = 1.8;
    bar.castShadow = true;
    group.add(bar);
    // Supports
    for (let s = -1; s <= 1; s += 2) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 2.0, 0.1),
        mat.obstacle
      );
      post.position.set(s * 0.85, 1.0, 0);
      group.add(post);
    }
    group.userData.type = "tallBarrier";
    group.userData.height = 2.0;
    group.userData.canRollUnder = true;
    return group;
  }

  function createTrainObstacle(lane) {
    const group = new THREE.Group();
    const length = 6 + Math.random() * 8;
    // Train body
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 2.4, length),
      mat.obstacleTrain
    );
    body.position.y = 1.2;
    body.castShadow = true;
    group.add(body);
    // Roof
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(1.9, 0.15, length),
      mat.obstacleTrainStripe
    );
    roof.position.y = 2.45;
    group.add(roof);
    // Stripe along side
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(1.82, 0.3, length + 0.01),
      mat.obstacleTrainStripe
    );
    stripe.position.y = 1.5;
    group.add(stripe);
    // Windows
    const numWindows = Math.floor(length / 1.5);
    for (let i = 0; i < numWindows; i++) {
      for (let s = -1; s <= 1; s += 2) {
        const win = new THREE.Mesh(
          new THREE.PlaneGeometry(0.6, 0.5),
          mat.buildingWindow
        );
        win.position.set(
          s * 0.91,
          1.8,
          -length / 2 + 1 + i * (length / numWindows)
        );
        win.rotation.y = s === 1 ? 0 : Math.PI;
        group.add(win);
      }
    }
    group.userData.type = "train";
    group.userData.height = 2.5;
    group.userData.length = length;
    group.userData.canRollUnder = false;
    return group;
  }

  function spawnObstacle() {
    const lane = Math.floor(Math.random() * 3);
    const rand = Math.random();
    let obstacle;
    if (rand < 0.35) {
      obstacle = createBarrier(lane);
    } else if (rand < 0.55) {
      obstacle = createTallBarrier(lane);
    } else {
      obstacle = createTrainObstacle(lane);
    }
    obstacle.position.set(LANES[lane], 0, RENDER_DISTANCE);
    obstacle.userData.lane = lane;
    scene.add(obstacle);
    state.obstacles.push(obstacle);

    // Sometimes add a second obstacle in a different lane
    if (Math.random() > 0.5 && obstacle.userData.type !== "train") {
      let lane2 = (lane + (Math.random() > 0.5 ? 1 : 2)) % 3;
      let obs2;
      if (Math.random() > 0.5) {
        obs2 = createBarrier(lane2);
      } else {
        obs2 = createTallBarrier(lane2);
      }
      obs2.position.set(LANES[lane2], 0, RENDER_DISTANCE);
      obs2.userData.lane = lane2;
      scene.add(obs2);
      state.obstacles.push(obs2);
    }
  }

  // ===== COINS =====
  function spawnCoins() {
    const lane = Math.floor(Math.random() * 3);
    const count = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < count; i++) {
      const geo = new THREE.CylinderGeometry(0.35, 0.35, 0.08, 16);
      const coin = new THREE.Mesh(geo, mat.coin);
      coin.rotation.x = Math.PI / 2;
      coin.position.set(
        LANES[lane],
        1.2 + Math.sin(i * 0.5) * 0.3,
        RENDER_DISTANCE + i * 2
      );
      coin.castShadow = true;
      coin.userData.collected = false;
      scene.add(coin);
      state.coinObjects.push(coin);
    }
  }

  // ===== PLAYER ANIMATION =====
  let runCycle = 0;

  function animatePlayer() {
    const leftArm = playerGroup.getObjectByName("leftArm");
    const rightArm = playerGroup.getObjectByName("rightArm");
    const leftLeg = playerGroup.getObjectByName("leftLeg");
    const rightLeg = playerGroup.getObjectByName("rightLeg");
    const leftShoe = playerGroup.getObjectByName("leftShoe");
    const rightShoe = playerGroup.getObjectByName("rightShoe");

    if (state.isRolling) {
      // Rolling/sliding animation
      playerGroup.scale.set(1, 0.5, 1.2);
      playerGroup.position.y = state.playerY;
      return;
    }

    playerGroup.scale.set(1, 1, 1);

    if (state.isJumping || state.playerY > 0.1) {
      // Jumping pose - tuck
      if (leftLeg) leftLeg.position.set(-0.17, 0.6, 0.15);
      if (rightLeg) rightLeg.position.set(0.17, 0.6, 0.15);
      if (leftShoe) leftShoe.position.set(-0.17, 0.35, 0.2);
      if (rightShoe) rightShoe.position.set(0.17, 0.35, 0.2);
      if (leftArm) leftArm.position.set(-0.5, 1.4, -0.1);
      if (rightArm) rightArm.position.set(0.5, 1.4, -0.1);
    } else {
      // Running animation
      runCycle += state.gameSpeed * 3;
      const swing = Math.sin(runCycle) * 0.3;
      if (leftArm) leftArm.position.set(-0.5, 1.2, swing * 0.5);
      if (rightArm) rightArm.position.set(0.5, 1.2, -swing * 0.5);
      if (leftLeg) leftLeg.position.set(-0.17, 0.5, -swing * 0.4);
      if (rightLeg) rightLeg.position.set(0.17, 0.5, swing * 0.4);
      if (leftShoe) leftShoe.position.set(-0.17, 0.15, -swing * 0.4 + 0.05);
      if (rightShoe) rightShoe.position.set(0.17, 0.15, swing * 0.4 + 0.05);
    }

    playerGroup.position.y = state.playerY;
  }

  // ===== LANE MOVEMENT =====
  function updatePlayerPosition() {
    const targetX = LANES[state.targetLane];
    const currentX = playerGroup.position.x;
    const diff = targetX - currentX;
    playerGroup.position.x += diff * 0.2;

    // Slight tilt when changing lanes
    const tiltTarget = -diff * 0.08;
    playerGroup.rotation.z += (tiltTarget - playerGroup.rotation.z) * 0.15;

    // Jumping / gravity
    if (state.isJumping) {
      state.playerY += state.playerVelocityY;
      state.playerVelocityY -= GRAVITY;
      if (state.playerY <= 0) {
        state.playerY = 0;
        state.playerVelocityY = 0;
        state.isJumping = false;
      }
    }

    // Rolling
    if (state.isRolling) {
      state.rollTimer--;
      if (state.rollTimer <= 0) {
        state.isRolling = false;
      }
    }
  }

  // ===== COLLISION DETECTION =====
  function checkCollisions() {
    const px = playerGroup.position.x;
    const py = state.playerY;

    for (const obs of state.obstacles) {
      const dz = obs.position.z;

      // Quick Z reject - only check nearby obstacles
      if (dz > 1.5 || dz < -2) continue;

      const obsLane = obs.userData.lane;

      // Check if in same lane (generous margin)
      if (Math.abs(px - LANES[obsLane]) > 1.1) continue;

      // Z proximity check - tighter for non-trains
      if (obs.userData.type === "train") {
        const halfLen = obs.userData.length / 2;
        if (dz < -halfLen + 0.5 || dz > 1.2) continue;
      } else {
        if (dz < -0.6 || dz > 1.0) continue;
      }

      // Roll under tall barriers
      if (obs.userData.canRollUnder && state.isRolling) continue;

      // Jump over barriers and tall barriers
      if (obs.userData.type === "barrier" && py > 0.8) continue;
      if (obs.userData.type === "tallBarrier" && py > 1.5) continue;

      // Can't jump over trains (too tall)

      // Collision!
      return true;
    }
    return false;
  }

  // ===== COIN COLLECTION =====
  function checkCoinCollection() {
    const px = playerGroup.position.x;
    const py = state.playerY + 1.0;

    for (const coin of state.coinObjects) {
      if (coin.userData.collected) continue;
      const dx = Math.abs(coin.position.x - px);
      const dy = Math.abs(coin.position.y - py);
      const dz = coin.position.z;
      if (dx < 1.0 && dy < 1.2 && dz < 2 && dz > -1) {
        coin.userData.collected = true;
        coin.visible = false;
        state.coins++;
        state.score += 10 * state.multiplier;
        sfxCoin();
        updateHUD();
      }
    }
  }

  // ===== MATH PROBLEM GENERATOR =====
  function generateMathProblem(level) {
    let question, answer;

    switch (level) {
      case 1: {
        // Easy: addition & subtraction up to 20
        const op = Math.random() > 0.5 ? "+" : "-";
        let a = Math.floor(Math.random() * 15) + 3;
        let b = Math.floor(Math.random() * 10) + 1;
        if (op === "-" && b > a) [a, b] = [b, a];
        answer = op === "+" ? a + b : a - b;
        question = `${a} ${op} ${b} = ?`;
        break;
      }
      case 2: {
        // Medium: add/sub up to 50, simple multiplication
        const r = Math.random();
        if (r < 0.4) {
          const a = Math.floor(Math.random() * 40) + 5;
          const b = Math.floor(Math.random() * 25) + 1;
          answer = a + b;
          question = `${a} + ${b} = ?`;
        } else if (r < 0.75) {
          let a = Math.floor(Math.random() * 45) + 10;
          let b = Math.floor(Math.random() * 20) + 1;
          if (b > a) [a, b] = [b, a];
          answer = a - b;
          question = `${a} - ${b} = ?`;
        } else {
          const a = Math.floor(Math.random() * 8) + 2;
          const b = Math.floor(Math.random() * 8) + 2;
          answer = a * b;
          question = `${a} \u00d7 ${b} = ?`;
        }
        break;
      }
      case 3: {
        // Hard: multiplication, division, larger numbers
        const r = Math.random();
        if (r < 0.35) {
          const a = Math.floor(Math.random() * 12) + 2;
          const b = Math.floor(Math.random() * 12) + 2;
          answer = a * b;
          question = `${a} \u00d7 ${b} = ?`;
        } else if (r < 0.65) {
          const b = Math.floor(Math.random() * 10) + 2;
          const answer_ = Math.floor(Math.random() * 12) + 1;
          const a = b * answer_;
          answer = answer_;
          question = `${a} \u00f7 ${b} = ?`;
        } else {
          const a = Math.floor(Math.random() * 80) + 20;
          const b = Math.floor(Math.random() * 50) + 10;
          const op = Math.random() > 0.5 ? "+" : "-";
          if (op === "-" && b > a) {
            answer = a + b;
            question = `${a + b} - ${a} = ?`;
          } else {
            answer = op === "+" ? a + b : a - b;
            question = `${a} ${op} ${b} = ?`;
          }
        }
        break;
      }
      case 4: {
        // Expert: mixed ops, multi-step
        const r = Math.random();
        if (r < 0.3) {
          const a = Math.floor(Math.random() * 10) + 2;
          const b = Math.floor(Math.random() * 10) + 2;
          const c = Math.floor(Math.random() * 15) + 1;
          answer = a * b + c;
          question = `${a} \u00d7 ${b} + ${c} = ?`;
        } else if (r < 0.55) {
          const a = Math.floor(Math.random() * 12) + 2;
          const b = Math.floor(Math.random() * 12) + 2;
          const c = Math.floor(Math.random() * 20) + 1;
          answer = a * b - c;
          if (answer < 0) {
            answer = a * b + c;
            question = `${a} \u00d7 ${b} + ${c} = ?`;
          } else {
            question = `${a} \u00d7 ${b} - ${c} = ?`;
          }
        } else if (r < 0.75) {
          const b = Math.floor(Math.random() * 8) + 2;
          const q = Math.floor(Math.random() * 10) + 2;
          const a = b * q;
          const c = Math.floor(Math.random() * 10) + 1;
          answer = q + c;
          question = `${a} \u00f7 ${b} + ${c} = ?`;
        } else {
          // Squared
          const a = Math.floor(Math.random() * 10) + 2;
          answer = a * a;
          question = `${a}\u00b2 = ?`;
        }
        break;
      }
    }

    // Generate wrong answers
    const choices = [answer];
    while (choices.length < 4) {
      let wrong;
      const offset = Math.floor(Math.random() * 10) + 1;
      if (Math.random() > 0.5) {
        wrong = answer + offset;
      } else {
        wrong = answer - offset;
      }
      if (wrong < 0) wrong = answer + offset + Math.floor(Math.random() * 5);
      if (!choices.includes(wrong)) {
        choices.push(wrong);
      }
    }

    // Shuffle
    for (let i = choices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [choices[i], choices[j]] = [choices[j], choices[i]];
    }

    return { question, answer, choices };
  }

  // ===== MATH OVERLAY =====
  let mathTimer = null;
  let mathTimeLeft = MATH_TIMER_SECONDS;
  let currentMathProblem = null;

  function showMathOverlay() {
    state.screen = "math";
    const overlay = document.getElementById("math-overlay");
    overlay.classList.add("active");

    currentMathProblem = generateMathProblem(state.difficulty);
    document.getElementById("math-question").textContent =
      currentMathProblem.question;
    document.getElementById("math-feedback").textContent = "";
    document.getElementById("math-feedback").className = "math-feedback";

    // Streak display
    const streakEl = document.getElementById("math-streak");
    if (state.mathStreak > 1) {
      streakEl.textContent = `Streak: ${state.mathStreak} correct!`;
    } else {
      streakEl.textContent = "";
    }

    // Difficulty controls
    document.getElementById("math-level").textContent =
      DIFF_NAMES[state.difficulty];

    // Answers
    const answersDiv = document.getElementById("math-answers");
    answersDiv.innerHTML = "";
    currentMathProblem.choices.forEach((choice) => {
      const btn = document.createElement("button");
      btn.className = "math-answer-btn";
      btn.textContent = choice;
      btn.addEventListener("click", () => handleMathAnswer(choice, btn));
      answersDiv.appendChild(btn);
    });

    // Timer
    mathTimeLeft = MATH_TIMER_SECONDS;
    updateMathTimer();
    clearInterval(mathTimer);
    mathTimer = setInterval(() => {
      mathTimeLeft -= 0.1;
      updateMathTimer();
      if (mathTimeLeft <= 0) {
        clearInterval(mathTimer);
        handleMathTimeout();
      }
    }, 100);
  }

  function updateMathTimer() {
    const fill = document.getElementById("math-timer-fill");
    const pct = (mathTimeLeft / MATH_TIMER_SECONDS) * 100;
    fill.style.width = pct + "%";
    if (pct < 30) {
      fill.classList.add("warning");
    } else {
      fill.classList.remove("warning");
    }
  }

  function handleMathAnswer(choice, btn) {
    clearInterval(mathTimer);
    state.mathTotal++;
    const buttons = document.querySelectorAll(".math-answer-btn");

    if (choice === currentMathProblem.answer) {
      // Correct!
      btn.classList.add("correct");
      state.mathCorrect++;
      state.mathStreak++;
      const bonus = 50 * state.difficulty * (1 + state.mathStreak * 0.1);
      state.score += Math.round(bonus);
      state.multiplier = Math.min(
        5,
        1 + Math.floor(state.mathStreak / 2) * 0.5
      );
      document.getElementById("math-feedback").textContent =
        `Correct! +${Math.round(bonus)} points`;
      document.getElementById("math-feedback").className =
        "math-feedback correct-text";
      sfxCorrect();
    } else {
      // Wrong
      btn.classList.add("incorrect");
      state.mathStreak = 0;
      state.multiplier = Math.max(1, state.multiplier - 0.5);
      document.getElementById("math-feedback").textContent =
        `The answer was ${currentMathProblem.answer}`;
      document.getElementById("math-feedback").className =
        "math-feedback incorrect-text";
      sfxWrong();

      // Highlight correct
      buttons.forEach((b) => {
        if (parseInt(b.textContent) === currentMathProblem.answer) {
          b.classList.add("correct");
        }
      });
    }

    // Disable all buttons
    buttons.forEach((b) => (b.style.pointerEvents = "none"));

    updateHUD();

    // Continue after delay
    setTimeout(() => {
      document.getElementById("math-overlay").classList.remove("active");
      state.screen = "playing";
      state.lastMathDistance = state.distance;
    }, 1500);
  }

  function handleMathTimeout() {
    state.mathTotal++;
    state.mathStreak = 0;
    state.multiplier = Math.max(1, state.multiplier - 0.5);
    document.getElementById("math-feedback").textContent =
      `Time's up! The answer was ${currentMathProblem.answer}`;
    document.getElementById("math-feedback").className =
      "math-feedback incorrect-text";
    sfxWrong();

    const buttons = document.querySelectorAll(".math-answer-btn");
    buttons.forEach((b) => {
      b.style.pointerEvents = "none";
      if (parseInt(b.textContent) === currentMathProblem.answer) {
        b.classList.add("correct");
      }
    });

    updateHUD();

    setTimeout(() => {
      document.getElementById("math-overlay").classList.remove("active");
      state.screen = "playing";
      state.lastMathDistance = state.distance;
    }, 2000);
  }

  // ===== HUD UPDATE =====
  function updateHUD() {
    document.getElementById("hud-score").textContent = Math.floor(state.score);
    document.getElementById("hud-coins").textContent = state.coins;
    document.getElementById("hud-multiplier").textContent =
      `x${state.multiplier.toFixed(1)}`;
    document.getElementById("hud-difficulty").textContent =
      DIFF_NAMES[state.difficulty];
  }

  // ===== GAME LOOP =====
  function gameLoop() {
    if (state.screen !== "playing") {
      state.animationId = requestAnimationFrame(gameLoop);
      renderer.render(scene, camera);
      return;
    }

    if (state.isPaused) {
      state.animationId = requestAnimationFrame(gameLoop);
      renderer.render(scene, camera);
      return;
    }

    // Update game speed
    state.gameSpeed = Math.min(
      GAME_SPEED_MAX,
      state.gameSpeed + GAME_SPEED_INCREASE
    );

    // Update distance & score
    state.distance += state.gameSpeed * 2;
    state.score += state.gameSpeed * state.multiplier * 0.5;

    // Update ground
    updateGround();

    // Update player
    updatePlayerPosition();
    animatePlayer();

    // Update camera follow
    const camTargetX = playerGroup.position.x * 0.3;
    camera.position.x += (camTargetX - camera.position.x) * 0.08;
    dirLight.position.x = camera.position.x + 5;

    // Spawn obstacles
    state.obstacleTimer--;
    if (state.obstacleTimer <= 0) {
      spawnObstacle();
      state.obstacleTimer =
        OBSTACLE_SPAWN_INTERVAL_MIN +
        Math.random() *
          (OBSTACLE_SPAWN_INTERVAL_MAX - OBSTACLE_SPAWN_INTERVAL_MIN);
    }

    // Spawn coins
    state.coinTimer--;
    if (state.coinTimer <= 0) {
      spawnCoins();
      state.coinTimer = COIN_SPAWN_INTERVAL + Math.random() * 20;
    }

    // Move obstacles
    for (let i = state.obstacles.length - 1; i >= 0; i--) {
      const obs = state.obstacles[i];
      obs.position.z -= state.gameSpeed;
      if (obs.position.z < -15) {
        scene.remove(obs);
        state.obstacles.splice(i, 1);
      }
    }

    // Move & animate coins
    for (let i = state.coinObjects.length - 1; i >= 0; i--) {
      const coin = state.coinObjects[i];
      coin.position.z -= state.gameSpeed;
      coin.rotation.z += 0.05;
      if (coin.position.z < -10) {
        scene.remove(coin);
        state.coinObjects.splice(i, 1);
      }
    }

    // Collision check
    if (checkCollisions()) {
      sfxCrash();
      gameOver();
      state.animationId = requestAnimationFrame(gameLoop);
      return;
    }

    // Coin collection
    checkCoinCollection();

    // Math trigger
    const mathDist =
      state.mathFrequency === "frequent"
        ? MATH_TRIGGER_DISTANCE_FREQUENT
        : state.mathFrequency === "rare"
          ? MATH_TRIGGER_DISTANCE_RARE
          : MATH_TRIGGER_DISTANCE_NORMAL;

    if (state.distance - state.lastMathDistance >= mathDist) {
      showMathOverlay();
    }

    // Update HUD periodically
    if (Math.floor(state.distance) % 5 === 0) updateHUD();

    renderer.render(scene, camera);
    state.animationId = requestAnimationFrame(gameLoop);
  }

  // ===== GAME OVER =====
  function gameOver() {
    state.screen = "gameover";
    state.isGameOver = true;

    // Update high score
    const finalScore = Math.floor(state.score);
    if (finalScore > state.highScore) {
      state.highScore = finalScore;
      localStorage.setItem("mathSurfersHighScore", state.highScore.toString());
    }

    // Show game over screen
    document.getElementById("game-hud").classList.add("hidden");
    const goScreen = document.getElementById("gameover-screen");
    goScreen.classList.add("active");

    document.getElementById("go-score").textContent = finalScore;
    document.getElementById("go-coins").textContent = state.coins;
    document.getElementById("go-distance").textContent =
      Math.floor(state.distance) + "m";
    document.getElementById("go-math").textContent =
      `${state.mathCorrect} / ${state.mathTotal}`;
    document.getElementById("go-highscore").textContent = state.highScore;
    document.getElementById("menu-high-score").textContent = state.highScore;
  }

  // ===== START GAME =====
  function startGame() {
    // Reset state
    state.score = 0;
    state.coins = 0;
    state.distance = 0;
    state.multiplier = 1;
    state.gameSpeed = GAME_SPEED_INITIAL;
    state.playerLane = 1;
    state.targetLane = 1;
    state.playerY = 0;
    state.playerVelocityY = 0;
    state.isJumping = false;
    state.isRolling = false;
    state.rollTimer = 0;
    state.isPaused = false;
    state.isGameOver = false;
    state.obstacleTimer = 120;
    state.coinTimer = 40;
    state.lastMathDistance = 0;
    state.mathCorrect = 0;
    state.mathTotal = 0;
    state.mathStreak = 0;
    runCycle = 0;

    // Clear old objects
    state.obstacles.forEach((o) => scene.remove(o));
    state.obstacles = [];
    state.coinObjects.forEach((c) => scene.remove(c));
    state.coinObjects = [];

    // Reset player position
    playerGroup.position.set(0, 0, 0);
    playerGroup.rotation.set(0, 0, 0);
    playerGroup.scale.set(1, 1, 1);

    // Hide all screens, show HUD
    document.querySelectorAll(".screen").forEach((s) => {
      s.classList.remove("active");
    });
    document.getElementById("game-hud").classList.remove("hidden");

    state.screen = "playing";
    updateHUD();

    initAudio();
  }

  // ===== INPUT HANDLING =====
  function moveLeft() {
    if (state.targetLane > 0) {
      state.targetLane--;
      sfxLaneSwitch();
    }
  }

  function moveRight() {
    if (state.targetLane < 2) {
      state.targetLane++;
      sfxLaneSwitch();
    }
  }

  function jump() {
    if (!state.isJumping && state.playerY < 0.1 && !state.isRolling) {
      state.isJumping = true;
      state.playerVelocityY = JUMP_FORCE;
      sfxJump();
    }
  }

  function roll() {
    if (!state.isRolling && !state.isJumping) {
      state.isRolling = true;
      state.rollTimer = ROLL_DURATION;
    }
  }

  // Keyboard
  document.addEventListener("keydown", (e) => {
    if (state.screen !== "playing" || state.isPaused) return;

    switch (e.key) {
      case "ArrowLeft":
      case "a":
      case "A":
        e.preventDefault();
        moveRight();
        break;
      case "ArrowRight":
      case "d":
      case "D":
        e.preventDefault();
        moveLeft();
        break;
      case "ArrowUp":
      case "w":
      case "W":
      case " ":
        e.preventDefault();
        jump();
        break;
      case "ArrowDown":
      case "s":
      case "S":
        e.preventDefault();
        roll();
        break;
      case "Escape":
      case "p":
      case "P":
        togglePause();
        break;
    }
  });

  // Touch / Swipe
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;

  canvas.addEventListener(
    "touchstart",
    (e) => {
      if (state.screen !== "playing") return;
      const touch = e.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      touchStartTime = Date.now();
      e.preventDefault();
    },
    { passive: false }
  );

  canvas.addEventListener(
    "touchend",
    (e) => {
      if (state.screen !== "playing") return;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - touchStartX;
      const dy = touch.clientY - touchStartY;
      const dt = Date.now() - touchStartTime;

      const minSwipe = 30;

      if (dt < 300 && (Math.abs(dx) > minSwipe || Math.abs(dy) > minSwipe)) {
        if (Math.abs(dx) > Math.abs(dy)) {
          if (dx > 0) moveLeft();
          else moveRight();
        } else {
          if (dy < 0) jump();
          else roll();
        }
      }
      e.preventDefault();
    },
    { passive: false }
  );

  // ===== PAUSE =====
  function togglePause() {
    if (state.screen !== "playing" && state.screen !== "paused") return;
    state.isPaused = !state.isPaused;
    const overlay = document.getElementById("pause-overlay");
    if (state.isPaused) {
      state.screen = "paused";
      overlay.classList.add("active");
    } else {
      state.screen = "playing";
      overlay.classList.remove("active");
    }
  }

  // ===== UI EVENT LISTENERS =====

  // Main Menu
  document.getElementById("play-btn").addEventListener("click", () => {
    startGame();
    if (!state.animationId) gameLoop();
  });

  document.getElementById("settings-btn").addEventListener("click", () => {
    document.getElementById("main-menu").classList.remove("active");
    document.getElementById("settings-screen").classList.add("active");
  });

  document.getElementById("how-to-play-btn").addEventListener("click", () => {
    document.getElementById("main-menu").classList.remove("active");
    document.getElementById("how-to-play-screen").classList.add("active");
  });

  // Settings
  document.getElementById("settings-back").addEventListener("click", () => {
    document.getElementById("settings-screen").classList.remove("active");
    document.getElementById("main-menu").classList.add("active");
  });

  document.querySelectorAll(".diff-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".diff-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.difficulty = parseInt(btn.dataset.level);
      document.getElementById("diff-description").textContent =
        DIFF_DESCRIPTIONS[state.difficulty];
    });
  });

  document.querySelectorAll(".freq-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".freq-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.mathFrequency = btn.dataset.freq;
    });
  });

  document.getElementById("sound-toggle").addEventListener("click", (e) => {
    state.soundEnabled = !state.soundEnabled;
    e.target.textContent = state.soundEnabled ? "ON" : "OFF";
    e.target.classList.toggle("on", state.soundEnabled);
  });

  // How to play
  document.getElementById("howto-back").addEventListener("click", () => {
    document.getElementById("how-to-play-screen").classList.remove("active");
    document.getElementById("main-menu").classList.add("active");
  });

  // Pause
  document
    .getElementById("pause-btn")
    .addEventListener("click", togglePause);
  document.getElementById("resume-btn").addEventListener("click", togglePause);
  document
    .getElementById("pause-quit-btn")
    .addEventListener("click", () => {
      state.isPaused = false;
      state.screen = "menu";
      document.getElementById("pause-overlay").classList.remove("active");
      document.getElementById("game-hud").classList.add("hidden");
      document.getElementById("main-menu").classList.add("active");
    });

  // Game Over
  document.getElementById("retry-btn").addEventListener("click", () => {
    document.getElementById("gameover-screen").classList.remove("active");
    startGame();
  });

  document.getElementById("go-menu-btn").addEventListener("click", () => {
    document.getElementById("gameover-screen").classList.remove("active");
    document.getElementById("main-menu").classList.add("active");
    state.screen = "menu";
  });

  // Math difficulty controls (in-game)
  document.getElementById("math-easier").addEventListener("click", () => {
    if (state.difficulty > 1) {
      state.difficulty--;
      document.getElementById("math-level").textContent =
        DIFF_NAMES[state.difficulty];
      // Sync settings buttons
      document
        .querySelectorAll(".diff-btn")
        .forEach((b) =>
          b.classList.toggle(
            "active",
            parseInt(b.dataset.level) === state.difficulty
          )
        );
      document.getElementById("diff-description").textContent =
        DIFF_DESCRIPTIONS[state.difficulty];
    }
  });

  document.getElementById("math-harder").addEventListener("click", () => {
    if (state.difficulty < 4) {
      state.difficulty++;
      document.getElementById("math-level").textContent =
        DIFF_NAMES[state.difficulty];
      document
        .querySelectorAll(".diff-btn")
        .forEach((b) =>
          b.classList.toggle(
            "active",
            parseInt(b.dataset.level) === state.difficulty
          )
        );
      document.getElementById("diff-description").textContent =
        DIFF_DESCRIPTIONS[state.difficulty];
    }
  });

  // ===== RESIZE HANDLER =====
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ===== INITIALIZE =====
  document.getElementById("menu-high-score").textContent = state.highScore;
  createPlayer();
  initGround();

  // Initial scenery
  state.groundTiles.forEach((tile) => updateSceneryForTile(tile));

  // Start render loop (menu visible, game not started)
  gameLoop();
})();
