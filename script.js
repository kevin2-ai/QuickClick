const canvas = document.getElementById("game");
const startBtn = document.getElementById("startBtn");
const fullscreenBtn = document.getElementById("fullscreenBtn");
const scoreEl = document.getElementById("score");
const bestScoreEl = document.getElementById("bestScore");
const messageEl = document.getElementById("message");
const gameWrap = document.querySelector(".game-wrap");
const leaderboardListEl = document.getElementById("leaderboardList");

if (typeof THREE === "undefined") {
  messageEl.textContent = "Three.js ne se charge pas. Lance via un serveur local ou verifie Internet.";
  throw new Error("Three.js unavailable");
}

const initialSpeedTilesPerSecond = 4;
const foodSpawnRadius = 15;
const foodCount = 2;
const enemySnakeCount = 13;
const humanCount = 4;
const iaNamePool = [
  "Ari", "Nox", "Lio", "Milo", "Sora", "Tess", "Nina", "Jade", "Omar", "Rex",
  "Iris", "Noa", "Zed", "Luna", "Vik", "Kira", "Eli", "Yara", "Gus", "Mina",
  "Axel", "Nova", "Liam", "Nero", "Kimo", "Tara", "Rina", "Moe", "Loki", "Zia"
];

const directions = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x6d7c4a);
scene.fog = new THREE.Fog(0x6d7c4a, 35, 130);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 4000);
const cameraOffset = new THREE.Vector3(0, 26, 20);
const cameraLook = new THREE.Vector3(0, 0, 0);

const ambient = new THREE.AmbientLight(0xffffff, 0.75);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xffffff, 0.9);
sun.position.set(30, 40, 18);
sun.castShadow = true;
sun.shadow.mapSize.width = 2048;
sun.shadow.mapSize.height = 2048;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 180;
sun.shadow.camera.left = -70;
sun.shadow.camera.right = 70;
sun.shadow.camera.top = 70;
sun.shadow.camera.bottom = -70;
scene.add(sun);

function createGroundTexture() {
  const size = 256;
  const cvs = document.createElement("canvas");
  cvs.width = size;
  cvs.height = size;
  const g = cvs.getContext("2d");

  g.fillStyle = "#6f8350";
  g.fillRect(0, 0, size, size);

  for (let i = 0; i < 1700; i += 1) {
    const x = Math.floor(Math.random() * size);
    const y = Math.floor(Math.random() * size);
    const r = Math.random();
    g.fillStyle = r > 0.8 ? "rgba(95,74,47,0.22)" : "rgba(120,150,86,0.22)";
    g.fillRect(x, y, 2, 2);
  }

  const tex = new THREE.CanvasTexture(cvs);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(60, 60);
  return tex;
}

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(4000, 4000, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0x687b44, roughness: 1, map: createGroundTexture() })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(4000, 400, 0x77895c, 0x77895c);
grid.material.transparent = true;
grid.material.opacity = 0.07;
scene.add(grid);

function createSnakeStripeTexture(main, stripe) {
  const cvs = document.createElement("canvas");
  cvs.width = 64;
  cvs.height = 64;
  const g = cvs.getContext("2d");
  g.fillStyle = main;
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = stripe;
  g.lineWidth = 8;
  for (let y = -20; y < 84; y += 20) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(64, y + 16);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(cvs);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  return tex;
}

const playerHeadMaterial = new THREE.MeshStandardMaterial({
  color: 0x3ac360,
  roughness: 0.65,
  map: createSnakeStripeTexture("#35b456", "#a6db45"),
});
const playerBodyMaterial = new THREE.MeshStandardMaterial({
  color: 0x35b456,
  roughness: 0.8,
  map: createSnakeStripeTexture("#35b456", "#a6db45"),
});
const enemyHeadMaterial = new THREE.MeshStandardMaterial({
  color: 0xc23e3e,
  roughness: 0.8,
  map: createSnakeStripeTexture("#af3030", "#ef8f8f"),
});
const enemyBodyMaterial = new THREE.MeshStandardMaterial({
  color: 0xaf3030,
  roughness: 0.85,
  map: createSnakeStripeTexture("#af3030", "#ef8f8f"),
});

const segmentGeometry = new THREE.SphereGeometry(0.44, 14, 12);
const headGeometry = new THREE.SphereGeometry(0.5, 16, 14);

let snake;
let direction;
let nextDirection;
let foods;
let enemySnakes;
let score;
let loop;
let isRunning = false;
let speedTilesPerSecond;
let foodEatenCount;
let tickIntervalMs = 1000 / initialSpeedTilesPerSecond;
let lastLogicUpdateTime = performance.now();
let previousSnake = [];
let previousEnemyBodies = [];
let playerName = "";
let enemyIdCounter = 0;
let humans = [];
let audioCtx;
let audioEnabled = false;
let lastFrameTime = performance.now();

const playerGroup = new THREE.Group();
scene.add(playerGroup);
let playerMeshes = [];

const enemyGroups = new Map();
let frogGroups = [];
const humanGroup = new THREE.Group();
scene.add(humanGroup);

const cameraTarget = new THREE.Vector3(0, 0, 0);

let bestScore = Number(localStorage.getItem("snakeBestScore") || 0);
bestScoreEl.textContent = bestScore;

function samePosition(a, b) {
  return a.x === b.x && a.y === b.y;
}

function cloneBody(body) {
  return body.map((part) => ({ x: part.x, y: part.y }));
}

function ensurePlayerName() {
  if (playerName) {
    return true;
  }

  const input = window.prompt("Donne un nom a ton serpent :");
  if (input === null) {
    messageEl.textContent = "Saisie annulee. Clique sur Demarrer pour recommencer.";
    return false;
  }

  playerName = input.trim() || "Joueur";
  return true;
}

function updateLeaderboard() {
  const entries = [
    { name: playerName || "Joueur", size: snake.length, isPlayer: true },
    ...enemySnakes.map((enemy) => ({ name: enemy.name, size: enemy.body.length, isPlayer: false })),
  ].sort((a, b) => b.size - a.size);

  leaderboardListEl.innerHTML = entries
    .map((entry, index) => {
      const crown = index === 0 ? " ♛" : "";
      const label = entry.isPlayer ? entry.name + " (Toi)" : entry.name;
      return "<li>" + label + " - " + entry.size + crown + "</li>";
    })
    .join("");
}

function initAudio() {
  if (audioEnabled) {
    return;
  }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) {
    return;
  }
  audioCtx = new Ctx();
  audioEnabled = true;
}

function playTone(freq, duration, type, volume) {
  if (!audioEnabled || !audioCtx) {
    return;
  }
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type || "sine";
  osc.frequency.value = freq;
  gain.gain.value = volume || 0.03;
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + duration);
}

function playEatSound() {
  playTone(560, 0.08, "triangle", 0.04);
}

function playCrashSound() {
  playTone(120, 0.2, "sawtooth", 0.06);
}

function playStompSound() {
  playTone(170, 0.11, "square", 0.05);
}

function randomEnemyDirection() {
  return directions[Math.floor(Math.random() * directions.length)];
}

function randomEnemyLength() {
  return 3 + Math.floor(Math.random() * 4);
}

function getRandomEnemyNames(count) {
  const names = [];
  const used = new Set();

  while (names.length < count) {
    const base = iaNamePool[Math.floor(Math.random() * iaNamePool.length)];
    let candidate = base;

    if (used.has(candidate)) {
      candidate = base + "-" + (1 + Math.floor(Math.random() * 99));
    }
    if (used.has(candidate)) {
      continue;
    }

    used.add(candidate);
    names.push(candidate);
  }

  return names;
}

function isReverseDir(next, current) {
  return next.x === -current.x && next.y === -current.y;
}

function isPositionBlocked(pos) {
  const blockedByPlayer = snake.some((part) => samePosition(part, pos));
  if (blockedByPlayer) {
    return true;
  }
  const blockedByEnemy = enemySnakes.some((enemy) => enemy.body.some((part) => samePosition(part, pos)));
  if (blockedByEnemy) {
    return true;
  }
  return foods.some((food) => samePosition(food, pos));
}

function randomFoodPosition(existingFoods = []) {
  const head = snake[0];
  let pos;
  do {
    pos = {
      x: head.x + Math.floor(Math.random() * (foodSpawnRadius * 2 + 1)) - foodSpawnRadius,
      y: head.y + Math.floor(Math.random() * (foodSpawnRadius * 2 + 1)) - foodSpawnRadius,
    };
  } while (
    isPositionBlocked(pos) ||
    existingFoods.some((item) => samePosition(item, pos))
  );
  return pos;
}

function createEnemySnake(name, existingEnemies = []) {
  const head = snake[0];
  const spawnRadius = foodSpawnRadius + 6;

  for (let attempt = 0; attempt < 180; attempt += 1) {
    const enemyDirection = randomEnemyDirection();
    const enemyLength = randomEnemyLength();
    const enemyHead = {
      x: head.x + Math.floor(Math.random() * (spawnRadius * 2 + 1)) - spawnRadius,
      y: head.y + Math.floor(Math.random() * (spawnRadius * 2 + 1)) - spawnRadius,
    };

    const body = [];
    for (let i = 0; i < enemyLength; i += 1) {
      body.push({
        x: enemyHead.x - enemyDirection.x * i,
        y: enemyHead.y - enemyDirection.y * i,
      });
    }

    const overlapsPlayer = body.some((part) => snake.some((playerPart) => samePosition(playerPart, part)));
    const overlapsFood = body.some((part) => foods.some((food) => samePosition(food, part)));
    const overlapsEnemy = body.some((part) =>
      existingEnemies.some((enemy) => enemy.body.some((enemyPart) => samePosition(enemyPart, part)))
    );

    if (!overlapsPlayer && !overlapsFood && !overlapsEnemy) {
      return {
        id: ++enemyIdCounter,
        name,
        body,
        direction: { x: enemyDirection.x, y: enemyDirection.y },
      };
    }
  }

  return {
    id: ++enemyIdCounter,
    name,
    body: [
      { x: head.x + 8, y: head.y + 8 },
      { x: head.x + 7, y: head.y + 8 },
      { x: head.x + 6, y: head.y + 8 },
    ],
    direction: { x: 1, y: 0 },
  };
}

function keepFoodsNearPlayer() {
  const head = snake[0];
  for (let i = 0; i < foods.length; i += 1) {
    const dx = foods[i].x - head.x;
    const dy = foods[i].y - head.y;
    if (Math.abs(dx) > foodSpawnRadius || Math.abs(dy) > foodSpawnRadius) {
      const others = foods.filter((_, index) => index !== i);
      foods[i] = randomFoodPosition(others);
    }
  }
}

function placeFrogNear(pos) {
  if (!foods.some((food) => samePosition(food, pos))) {
    foods.push({ x: pos.x, y: pos.y });
    return;
  }

  for (let radius = 1; radius <= 4; radius += 1) {
    for (let k = 0; k < 10; k += 1) {
      const candidate = {
        x: pos.x + Math.floor(Math.random() * (radius * 2 + 1)) - radius,
        y: pos.y + Math.floor(Math.random() * (radius * 2 + 1)) - radius,
      };
      if (!foods.some((food) => samePosition(food, candidate))) {
        foods.push(candidate);
        return;
      }
    }
  }
}

function decomposeSnakeToFrogs(body) {
  for (let i = 0; i < body.length; i += 1) {
    placeFrogNear(body[i]);
  }
}

function resetGame() {
  enemyIdCounter = 0;
  snake = [
    { x: 0, y: 0 },
    { x: -1, y: 0 },
    { x: -2, y: 0 },
  ];
  direction = { x: 1, y: 0 };
  nextDirection = { x: 1, y: 0 };
  score = 0;
  foodEatenCount = 0;
  foods = [];
  enemySnakes = [];

  for (let i = 0; i < foodCount; i += 1) {
    foods.push(randomFoodPosition(foods));
  }

  const names = getRandomEnemyNames(enemySnakeCount);
  for (let i = 0; i < enemySnakeCount; i += 1) {
    enemySnakes.push(createEnemySnake(names[i], enemySnakes));
  }
  resetHumans();

  scoreEl.textContent = score;
  messageEl.textContent = "Mode exploration 3D: " + enemySnakeCount + " serpents actifs.";
  cameraTarget.set(snake[0].x, 0, snake[0].y);
  updateLeaderboard();
}

function toWorld(part) {
  return new THREE.Vector3(part.x, 0.58, part.y);
}

function ensureSnakeMeshes(group, list, count, isPlayer) {
  while (list.length < count) {
    const idx = list.length;
    const isHead = idx === 0;
    const geometry = isHead ? headGeometry : segmentGeometry;
    const material = isPlayer
      ? (isHead ? playerHeadMaterial : playerBodyMaterial)
      : (isHead ? enemyHeadMaterial : enemyBodyMaterial);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    list.push(mesh);
  }

  while (list.length > count) {
    const mesh = list.pop();
    group.remove(mesh);
  }
}

function createFrogMesh() {
  const frog = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.36, 14, 10),
    new THREE.MeshStandardMaterial({ color: 0x66c84e, roughness: 0.8 })
  );
  body.scale.set(1.15, 0.8, 1);
  body.castShadow = true;
  frog.add(body);

  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
  const pupilMat = new THREE.MeshStandardMaterial({ color: 0x1e2a1e, roughness: 0.5 });

  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), eyeMat);
  eyeL.position.set(-0.12, 0.2, -0.12);
  eyeL.castShadow = true;
  frog.add(eyeL);

  const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), eyeMat);
  eyeR.position.set(0.12, 0.2, -0.12);
  eyeR.castShadow = true;
  frog.add(eyeR);

  const pupilL = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), pupilMat);
  pupilL.position.set(-0.12, 0.2, -0.2);
  frog.add(pupilL);

  const pupilR = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), pupilMat);
  pupilR.position.set(0.12, 0.2, -0.2);
  frog.add(pupilR);

  return frog;
}

function createHuman(name) {
  const group = new THREE.Group();
  group.name = name;

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3d6fb0, roughness: 0.8 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xf1cfb3, roughness: 0.9 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.7 });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.52, 6, 12), bodyMat);
  body.position.y = 0.95;
  body.castShadow = true;
  group.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), skinMat);
  head.position.y = 1.43;
  head.castShadow = true;
  group.add(head);

  const footL = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.08, 0.33), shoeMat);
  footL.position.set(-0.12, 0.06, 0.03);
  footL.castShadow = true;
  group.add(footL);

  const footR = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.08, 0.33), shoeMat);
  footR.position.set(0.12, 0.06, 0.03);
  footR.castShadow = true;
  group.add(footR);

  humanGroup.add(group);
  return {
    name,
    group,
    position: new THREE.Vector2(0, 0),
    speed: 1.2 + Math.random() * 0.8,
    stompCooldown: 0,
    stepPhase: Math.random() * Math.PI * 2,
  };
}

function clearHumans() {
  while (humanGroup.children.length > 0) {
    humanGroup.remove(humanGroup.children[0]);
  }
  humans = [];
}

function resetHumans() {
  clearHumans();
  const center = snake[0];
  for (let i = 0; i < humanCount; i += 1) {
    const human = createHuman("Humain " + (i + 1));
    human.position.set(
      center.x + (Math.random() * 2 - 1) * (foodSpawnRadius + 6),
      center.y + (Math.random() * 2 - 1) * (foodSpawnRadius + 6)
    );
    humans.push(human);
  }
}

function syncFrogMeshes() {
  while (frogGroups.length < foods.length) {
    const frog = createFrogMesh();
    scene.add(frog);
    frogGroups.push(frog);
  }
  while (frogGroups.length > foods.length) {
    const frog = frogGroups.pop();
    scene.remove(frog);
  }

  for (let i = 0; i < foods.length; i += 1) {
    frogGroups[i].position.set(foods[i].x, 0.33, foods[i].y);
  }
}

function syncEnemyGroups(alpha) {
  const aliveIds = new Set(enemySnakes.map((enemy) => enemy.id));

  for (const [id, data] of enemyGroups.entries()) {
    if (!aliveIds.has(id)) {
      scene.remove(data.group);
      enemyGroups.delete(id);
    }
  }

  for (let e = 0; e < enemySnakes.length; e += 1) {
    const enemy = enemySnakes[e];
    let data = enemyGroups.get(enemy.id);

    if (!data) {
      const group = new THREE.Group();
      scene.add(group);
      data = { group, meshes: [] };
      enemyGroups.set(enemy.id, data);
    }

    ensureSnakeMeshes(data.group, data.meshes, enemy.body.length, false);

    const prevBody = previousEnemyBodies[e] || enemy.body;
    for (let i = 0; i < enemy.body.length; i += 1) {
      const curr = enemy.body[i];
      const prev = prevBody[i] || curr;

      const px = prev.x + (curr.x - prev.x) * alpha;
      const py = prev.y + (curr.y - prev.y) * alpha;

      data.meshes[i].position.set(px, 0.58, py);
      data.meshes[i].scale.set(1, 1, 1);
      if (i === 0) {
        data.meshes[i].scale.set(1.08, 1.08, 1.08);
      }
    }
  }
}

function syncPlayer(alpha) {
  ensureSnakeMeshes(playerGroup, playerMeshes, snake.length, true);

  for (let i = 0; i < snake.length; i += 1) {
    const curr = snake[i];
    const prev = previousSnake[i] || curr;
    const px = prev.x + (curr.x - prev.x) * alpha;
    const py = prev.y + (curr.y - prev.y) * alpha;

    playerMeshes[i].position.set(px, 0.58, py);
    playerMeshes[i].scale.set(1, 1, 1);
    if (i === 0) {
      playerMeshes[i].scale.set(1.12, 1.12, 1.12);
    }
  }
}

function getNearestSnakeHead(x, y) {
  let best = { x: snake[0].x, y: snake[0].y, type: "player", index: -1 };
  let bestDist = (best.x - x) ** 2 + (best.y - y) ** 2;

  for (let i = 0; i < enemySnakes.length; i += 1) {
    const head = enemySnakes[i].body[0];
    const d = (head.x - x) ** 2 + (head.y - y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = { x: head.x, y: head.y, type: "enemy", index: i };
    }
  }

  return best;
}

function updateHumans(deltaSec) {
  for (let i = 0; i < humans.length; i += 1) {
    const human = humans[i];
    const target = getNearestSnakeHead(human.position.x, human.position.y);
    const dx = target.x - human.position.x;
    const dy = target.y - human.position.y;
    const len = Math.hypot(dx, dy) || 1;

    const move = Math.min(human.speed * deltaSec, len);
    human.position.x += (dx / len) * move;
    human.position.y += (dy / len) * move;

    human.group.position.set(human.position.x, 0, human.position.y);
    human.group.lookAt(human.position.x + dx, 0.9, human.position.y + dy);

    human.stepPhase += deltaSec * 8;
    const lift = Math.abs(Math.sin(human.stepPhase)) * 0.07;
    human.group.children[2].position.y = 0.06 + lift;
    human.group.children[3].position.y = 0.06 + (0.07 - lift);

    if (human.stompCooldown > 0) {
      human.stompCooldown -= 1;
    }
  }
}

function trimSnakeFromIndex(body, hitIndex) {
  if (hitIndex <= 0) {
    return body;
  }
  if (hitIndex >= body.length) {
    return body;
  }
  return body.slice(0, hitIndex);
}

function applyHumanStomps() {
  const stompRadiusSq = 0.55 * 0.55;

  for (let h = 0; h < humans.length; h += 1) {
    const human = humans[h];
    if (human.stompCooldown > 0) {
      continue;
    }

    let stomped = false;

    for (let i = 0; i < snake.length; i += 1) {
      const part = snake[i];
      const d = (part.x - human.position.x) ** 2 + (part.y - human.position.y) ** 2;
      if (d <= stompRadiusSq) {
        playStompSound();
        human.stompCooldown = 10;
        stomped = true;
        if (i === 0) {
          stopGame("Un humain a pietine ta tete.");
          return;
        }
        snake = trimSnakeFromIndex(snake, i);
        messageEl.textContent = "Un humain t'a pietine: queue reduite.";
        break;
      }
    }

    if (stomped || !isRunning) {
      continue;
    }

    for (let e = 0; e < enemySnakes.length && !stomped; e += 1) {
      const enemy = enemySnakes[e];
      for (let i = 0; i < enemy.body.length; i += 1) {
        const part = enemy.body[i];
        const d = (part.x - human.position.x) ** 2 + (part.y - human.position.y) ** 2;
        if (d <= stompRadiusSq) {
          playStompSound();
          human.stompCooldown = 10;
          stomped = true;
          if (i === 0) {
            decomposeSnakeToFrogs(enemy.body);
            enemySnakes.splice(e, 1);
          } else {
            enemy.body = trimSnakeFromIndex(enemy.body, i);
          }
          break;
        }
      }
    }
  }
}

function updateCamera(alpha) {
  const head = snake[0];
  const prev = previousSnake[0] || head;
  const hx = prev.x + (head.x - prev.x) * alpha;
  const hy = prev.y + (head.y - prev.y) * alpha;

  const target = new THREE.Vector3(hx, 0, hy);
  cameraTarget.lerp(target, 0.16);

  const desiredPos = new THREE.Vector3().copy(cameraTarget).add(cameraOffset);
  camera.position.lerp(desiredPos, 0.14);

  cameraLook.lerp(new THREE.Vector3(cameraTarget.x, 0, cameraTarget.z), 0.2);
  camera.lookAt(cameraLook);
}

function bodiesOverlap(bodyA, bodyB) {
  const occupied = new Set(bodyA.map((part) => part.x + ":" + part.y));
  return bodyB.some((part) => occupied.has(part.x + ":" + part.y));
}

function chooseEnemyDirection(enemy) {
  if (foods.length === 0) {
    return enemy.direction;
  }

  const head = enemy.body[0];
  let nearestFood = foods[0];
  let nearestDist = Math.abs(head.x - nearestFood.x) + Math.abs(head.y - nearestFood.y);

  for (let i = 1; i < foods.length; i += 1) {
    const dist = Math.abs(head.x - foods[i].x) + Math.abs(head.y - foods[i].y);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestFood = foods[i];
    }
  }

  const dx = nearestFood.x - head.x;
  const dy = nearestFood.y - head.y;

  const primary = Math.abs(dx) >= Math.abs(dy)
    ? { x: Math.sign(dx), y: 0 }
    : { x: 0, y: Math.sign(dy) };

  const secondary = Math.abs(dx) >= Math.abs(dy)
    ? { x: 0, y: Math.sign(dy) }
    : { x: Math.sign(dx), y: 0 };

  const shuffled = [...directions].sort(() => Math.random() - 0.5);
  const candidates = [primary, secondary, enemy.direction, ...shuffled];

  for (let i = 0; i < candidates.length; i += 1) {
    const next = candidates[i];
    if (next.x === 0 && next.y === 0) {
      continue;
    }
    if (isReverseDir(next, enemy.direction)) {
      continue;
    }

    const nextHead = { x: head.x + next.x, y: head.y + next.y };
    const hitsSelf = enemy.body.some((part) => samePosition(part, nextHead));
    if (!hitsSelf) {
      return next;
    }
  }

  return enemy.direction;
}

function moveEnemy(enemy) {
  enemy.direction = chooseEnemyDirection(enemy);

  const head = enemy.body[0];
  const nextHead = {
    x: head.x + enemy.direction.x,
    y: head.y + enemy.direction.y,
  };

  enemy.body.unshift(nextHead);

  const eatenIndex = foods.findIndex((food) => samePosition(food, nextHead));
  if (eatenIndex !== -1) {
    const others = foods.filter((_, index) => index !== eatenIndex);
    foods[eatenIndex] = randomFoodPosition(others);
    playEatSound();
  } else {
    enemy.body.pop();
  }
}

function resolveEnemyBattles() {
  for (let i = 0; i < enemySnakes.length; i += 1) {
    if (!enemySnakes[i]) {
      continue;
    }

    for (let j = i + 1; j < enemySnakes.length; j += 1) {
      if (!enemySnakes[j]) {
        continue;
      }

      const first = enemySnakes[i];
      const second = enemySnakes[j];
      if (!bodiesOverlap(first.body, second.body)) {
        continue;
      }

      if (first.body.length > second.body.length) {
        decomposeSnakeToFrogs(second.body);
        enemySnakes[j] = null;
      } else if (second.body.length > first.body.length) {
        decomposeSnakeToFrogs(first.body);
        enemySnakes[i] = null;
        break;
      } else {
        decomposeSnakeToFrogs(first.body);
        decomposeSnakeToFrogs(second.body);
        enemySnakes[i] = null;
        enemySnakes[j] = null;
        break;
      }
    }
  }

  enemySnakes = enemySnakes.filter(Boolean);
}

function handlePlayerEnemyCollision() {
  const survivors = [];

  for (let i = 0; i < enemySnakes.length; i += 1) {
    const enemy = enemySnakes[i];
    const touchesEnemy = bodiesOverlap(enemy.body, snake);

    if (!touchesEnemy) {
      survivors.push(enemy);
      continue;
    }

    if (snake.length > enemy.body.length) {
      decomposeSnakeToFrogs(enemy.body);
      messageEl.textContent = enemy.name + " est decompose en grenouilles (" + enemy.body.length + ").";
      continue;
    }

    messageEl.textContent = enemy.name + " est plus grand: aucun effet.";
    survivors.push(enemy);
  }

  enemySnakes = survivors;
}

function movePlayer() {
  direction = nextDirection;
  const head = {
    x: snake[0].x + direction.x,
    y: snake[0].y + direction.y,
  };

  const hitSelf = snake.some((part) => samePosition(part, head));
  if (hitSelf) {
    stopGame("Collision avec ton propre serpent.");
    return;
  }

  snake.unshift(head);

  const eatenIndex = foods.findIndex((item) => samePosition(item, head));
  if (eatenIndex !== -1) {
    score += 10;
    foodEatenCount += 1;
    scoreEl.textContent = score;
    playEatSound();

    const others = foods.filter((_, index) => index !== eatenIndex);
    foods[eatenIndex] = randomFoodPosition(others);

    if (foodEatenCount % 10 === 0) {
      speedTilesPerSecond += 2;
      updateLoopSpeed();
    }
  } else {
    snake.pop();
  }
}

function tick() {
  previousSnake = cloneBody(snake);
  previousEnemyBodies = enemySnakes.map((enemy) => cloneBody(enemy.body));

  movePlayer();
  if (!isRunning) {
    return;
  }

  keepFoodsNearPlayer();

  enemySnakes.forEach((enemy) => {
    moveEnemy(enemy);
  });

  applyHumanStomps();
  if (!isRunning) {
    updateLeaderboard();
    return;
  }

  resolveEnemyBattles();
  handlePlayerEnemyCollision();

  updateLeaderboard();
  lastLogicUpdateTime = performance.now();
}

function stopGame(reason) {
  clearInterval(loop);
  isRunning = false;
  playCrashSound();

  if (score > bestScore) {
    bestScore = score;
    localStorage.setItem("snakeBestScore", String(bestScore));
    bestScoreEl.textContent = bestScore;
  }

  messageEl.textContent = reason || ("Game over. Score: " + score + ".");
}

function updateLoopSpeed() {
  clearInterval(loop);
  tickIntervalMs = 1000 / speedTilesPerSecond;
  loop = setInterval(tick, tickIntervalMs);
}

function startGame() {
  initAudio();
  if (!ensurePlayerName()) {
    return;
  }

  resetGame();
  speedTilesPerSecond = initialSpeedTilesPerSecond;
  tickIntervalMs = 1000 / speedTilesPerSecond;
  previousSnake = cloneBody(snake);
  previousEnemyBodies = enemySnakes.map((enemy) => cloneBody(enemy.body));
  lastLogicUpdateTime = performance.now();
  isRunning = true;
  updateLeaderboard();
  updateLoopSpeed();
}

function resizeRendererForView() {
  if (document.fullscreenElement === gameWrap) {
    const width = Math.max(320, window.innerWidth - 10);
    const height = Math.max(220, window.innerHeight - 10);
    renderer.setSize(width, height, false);
  } else {
    const width = canvas.clientWidth || 560;
    const height = canvas.clientHeight || 320;
    renderer.setSize(width, height, false);
  }

  camera.aspect = canvas.width / canvas.height;
  camera.updateProjectionMatrix();
}

async function toggleFullscreen() {
  if (document.fullscreenElement === gameWrap) {
    await document.exitFullscreen();
    return;
  }
  await gameWrap.requestFullscreen();
}

function renderFrame(now) {
  const deltaSec = Math.min(0.05, Math.max(0, (now - lastFrameTime) / 1000));
  lastFrameTime = now;
  const alpha = isRunning ? Math.min(1, (now - lastLogicUpdateTime) / tickIntervalMs) : 1;

  updateHumans(deltaSec);
  updateCamera(alpha);
  syncPlayer(alpha);
  syncEnemyGroups(alpha);
  syncFrogMeshes();

  renderer.render(scene, camera);
  requestAnimationFrame(renderFrame);
}

document.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();

  if (["arrowup", "arrowdown", "arrowleft", "arrowright", "z", "q", "s", "d"].includes(key)) {
    event.preventDefault();
  }

  if (!isRunning) {
    return;
  }

  if ((key === "arrowup" || key === "z") && direction.y !== 1) {
    nextDirection = { x: 0, y: -1 };
  }
  if ((key === "arrowdown" || key === "s") && direction.y !== -1) {
    nextDirection = { x: 0, y: 1 };
  }
  if ((key === "arrowleft" || key === "q") && direction.x !== 1) {
    nextDirection = { x: -1, y: 0 };
  }
  if ((key === "arrowright" || key === "d") && direction.x !== -1) {
    nextDirection = { x: 1, y: 0 };
  }
});

startBtn.addEventListener("click", startGame);
fullscreenBtn.addEventListener("click", () => {
  toggleFullscreen().catch(() => {
    messageEl.textContent = "Le mode plein ecran est bloque par le navigateur.";
  });
});

document.addEventListener("fullscreenchange", () => {
  const isFull = document.fullscreenElement === gameWrap;
  gameWrap.classList.toggle("is-fullscreen", isFull);
  fullscreenBtn.textContent = isFull ? "Quitter plein ecran" : "Plein ecran";
  resizeRendererForView();
});

window.addEventListener("resize", resizeRendererForView);

resetGame();
resizeRendererForView();
requestAnimationFrame(renderFrame);
