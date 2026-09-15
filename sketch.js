const W = 900;
// 只裁去底部 120 像素留白，楼体坐标和宽高比例不变。
const H = 1080;
const CITY_BASE_Y = 900;
const INK = "#0B0B0E";
const PAPER = "#F5F0CE";
const FALLING_SHAPES = ["cross", "snowflake"];
const ANIMATION_STEP = 1 / 60;
const DROP_MERGE_SECONDS = 0.55;

// 隔湖视角，沿用用户照片的取景范围；来源和取舍见 references/shenzhen-skyline-sources.md。
// 横纵使用同一比例，保留真实楼体宽高关系。roof 为从左到右的楼顶折线。
const SKYLINE_SCALE = W / 1106;
const BUILDING_SPECS = [
  { id: "west-podium", x: -18, w: 138, top: 650, depth: 0,
    roof: [[0, 7], [0.19, 7], [0.19, 0], [0.7, 4], [0.7, 10], [1, 10]] },
  { id: "west-rear", x: 184, w: 91, top: 551, depth: 0,
    roof: [[0, 3], [0.8, 0], [1, 7]], seam: 0.8 },
  { id: "west-ribbed", x: 107, w: 82, top: 557, depth: 1,
    roof: [[0, 4], [0.53, 0], [1, 5]], detail: "vertical", seam: 0.76 },
  { id: "west-low-front", x: 49, w: 175, top: 691, depth: 2,
    roof: [[0, 5], [0.38, 5], [0.38, 0], [0.81, 0], [0.81, 10], [1, 10]] },
  { id: "west-link", x: 346, w: 91, top: 542, depth: 0,
    roof: [[0, 13], [0.33, 13], [0.33, 0], [0.74, 0], [0.74, 8], [1, 8]] },
  { id: "diagrid-high", x: 317, w: 81, top: 503, depth: 1,
    roof: [[0, 5], [0.4, 0], [0.82, 3], [1, 10]], detail: "diagrid", seam: 0.82,
    shoulders: { at: 36, left: 0.1, right: 0.94 } },
  { id: "diagrid-low", x: 271, w: 73, top: 602, depth: 2,
    roof: [[0, 6], [0.45, 0], [0.83, 3], [1, 9]], detail: "diagrid", seam: 0.83,
    shoulders: { at: 28, left: 0.14, right: 0.88 } },
  { id: "bamboo-left-slab", x: 423, w: 103, top: 504, depth: 2,
    roof: [[0, 7], [0.57, 0], [0.73, 1], [1, 15]], seam: 0.65 },
  { id: "bamboo-rear", x: 521, w: 44, top: 535, depth: 0,
    roof: [[0, 12], [0.3, 12], [0.3, 0], [0.7, 0], [0.7, 10], [1, 10]] },
  { id: "spring-bamboo", x: 538, w: 136, top: 35, depth: 1, style: "springBamboo" },
  { id: "east-link", x: 675, w: 74, top: 588, depth: 0,
    roof: [[0, 13], [0.17, 13], [0.17, 0], [0.64, 0], [0.64, 20], [1, 20]] },
  { id: "andaz", x: 748, w: 92, top: 329, depth: 1,
    roof: [[0, 9], [0.58, 0], [0.76, 2], [1, 17]], seam: 0.62 },
  { id: "east-grid-rear", x: 837, w: 107, top: 566, depth: 0,
    roof: [[0, 0], [0.17, 0], [0.17, 11], [0.75, 11], [0.75, 6], [1, 6]] },
  { id: "east-grid-front", x: 854, w: 80, top: 579, depth: 2,
    roof: [[0, 0], [0.84, 0], [0.84, 5], [1, 5]], detail: "frame", seam: 0.82 },
  { id: "east-small", x: 947, w: 40, top: 677, depth: 1,
    roof: [[0, 6], [0.3, 6], [0.3, 0], [0.8, 0], [0.8, 9], [1, 9]] },
  { id: "east-roof", x: 987, w: 32, top: 589, depth: 0,
    roof: [[0, 7], [0.24, 7], [0.24, 0], [0.7, 0], [0.7, 5], [1, 5]] },
  { id: "east-slim", x: 1022, w: 36, top: 608, depth: 0,
    roof: [[0, 5], [0.23, 0], [0.82, 0], [1, 7]] },
  { id: "east-low", x: 1008, w: 79, top: 665, depth: 1,
    roof: [[0, 8], [0.2, 8], [0.2, 0], [0.65, 0], [0.65, 6], [1, 6]] },
  { id: "east-edge", x: 1070, w: 65, top: 666, depth: 1,
    roof: [[0, 9], [0.14, 9], [0.14, 0], [0.59, 0], [0.59, 4], [1, 4]] },
  { id: "waterfront-podium", x: 649, w: 120, top: 727, depth: 2,
    roof: [[0, 8], [0.23, 8], [0.23, 0], [0.7, 0], [0.7, 4], [1, 4]], noWindows: true },
  { id: "sports-roof", x: 916, w: 227, top: 716, depth: 2, style: "sportsRoof", noWindows: true },
].map((spec) => Object.assign({}, spec, {
  x: spec.x * SKYLINE_SCALE,
  w: spec.w * SKYLINE_SCALE,
  top: CITY_BASE_Y + (spec.top - 770) * SKYLINE_SCALE,
}));

// [距尖顶的高度比例, 半宽占最大半宽的比例]：顶部弧肩、中下部近直立、柱脚微收。
const BAMBOO_PROFILE = [
  [0, 0], [0.015, 0.06], [0.05, 0.19], [0.1, 0.35],
  [0.16, 0.5], [0.24, 0.66], [0.34, 0.8], [0.46, 0.9],
  [0.62, 0.97], [0.8, 1], [0.93, 1], [1, 0.965],
];

let buildings = [];
let windows = [];
let drops = [];
let snow = [];
let grainLayer;
let fogLayer;
let sceneTime = 0;
let animationRemainder = 0;
let nextDropAt = 0;
let nextSnowAt = 0;
let nextFogAt = 0;
let nextMeteorAt = 0;
let shootingStar = null;
let previousDropKind = null;
let musicTransport = null;
const musicDropEvents = new Map();

function setup() {
  const canvas = createCanvas(W, H);
  canvas.parent("canvas-wrap");
  pixelDensity(1);
  frameRate(60);
  randomSeed(24);
  noiseSeed(24);

  makeCity();
  makeGrain();
  fogLayer = createGraphics(180, 160);
  fogLayer.pixelDensity(1);

  for (let i = 0; i < 96; i++) {
    snow.push(createSnowflake(true));
  }

  for (let i = 0; i < 4; i++) {
    const drop = createDrop();
    if (!drop) continue;
    drop.fallAge = drop.cruiseDuration * random(0.25, 0.78);
    drops.push(drop);
  }
  updateFallingDrops(0);
  nextDropAt = random(0.9, 1.8);
  nextSnowAt = random(0.2, 0.5);
  nextMeteorAt = random(3.5, 6.5);
}

function makeCity() {
  windows = [];
  buildings = BUILDING_SPECS.map((spec) => Object.assign({}, spec, {
    outline: makeBuildingOutline(spec), windows: [], lastDropAt: -Infinity,
  })).sort((a, b) => a.depth - b.depth);

  buildings.forEach((building, buildingIndex) => {
    if (building.noWindows) return;
    const cols = max(1, floor((building.w - 14) / 17));
    const rows = floor((CITY_BASE_Y - building.top - 24) / 27);
    const gapX = (building.w - 14) / cols;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const code = (row * 7 + col * 11 + buildingIndex * 13) % 23;
        if (code === 0 || code === 8 || code === 19) continue;
        const win = {
          x: building.x + 7 + (col + 0.5) * gapX + random(-0.7, 0.7),
          y: building.top + 24 + row * 27,
          w: random(2.2, 3.6),
          h: random(5, 8),
          light: code === 4 ? random(0.18, 0.3) : 0,
          flash: 0,
          depth: building.depth,
          buildingId: building.id,
          reserved: false,
          illumination: null,
        };
        win.baseLight = win.light;
        win.x -= win.w / 2;
        if (!windowFitsBuilding(win, building)) continue;
        if (buildings.slice(buildingIndex + 1).some((front) => windowTouchesBuilding(win, front))) continue;
        building.windows.push(win);
        windows.push(win);
      }
    }
  });
}

function makeBuildingOutline(building) {
  const { x, w, top } = building;
  const base = CITY_BASE_Y;
  if (building.style === "springBamboo") {
    const right = [];
    for (let i = 0; i <= 100; i++) {
      const y = top + (base - top) * i / 100;
      right.push({ x: x + w / 2 + springBambooHalfWidth(building, y), y });
    }
    return right.concat(right.slice(1).reverse().map((point) => ({ x: 2 * x + w - point.x, y: point.y })));
  }
  if (building.style === "sportsRoof") {
    const roof = [];
    for (let i = 0; i <= 48; i++) {
      const t = i / 48;
      const rise = 19 * sin(PI * t) + 7 * sin(3 * PI * t);
      roof.push({ x: x + w * t, y: top + (26 - rise) * SKYLINE_SCALE });
    }
    return roof.concat([{ x: x + w, y: base }, { x, y: base }]);
  }

  const roof = building.roof.map(([px, py]) => ({ x: x + w * px, y: top + py * SKYLINE_SCALE }));
  if (!building.shoulders) return roof.concat([{ x: x + w, y: base }, { x, y: base }]);
  const { at, left, right } = building.shoulders;
  const shoulderY = top + at * SKYLINE_SCALE;
  return roof.concat([
    { x: x + w, y: shoulderY }, { x: x + w * right, y: shoulderY },
    { x: x + w * right, y: base }, { x: x + w * left, y: base },
    { x: x + w * left, y: shoulderY }, { x, y: shoulderY },
  ]);
}

function springBambooHalfWidth(building, y) {
  const progress = constrain((y - building.top) / (CITY_BASE_Y - building.top), 0, 1);
  for (let i = 1; i < BAMBOO_PROFILE.length; i++) {
    const [p1, width1] = BAMBOO_PROFILE[i];
    if (progress > p1) continue;
    const [p0, width0] = BAMBOO_PROFILE[i - 1];
    // 单调三次插值，使取样点之间平滑衔接且不会鼓出轮廓。
    const before = BAMBOO_PROFILE[max(0, i - 2)];
    const after = BAMBOO_PROFILE[min(BAMBOO_PROFILE.length - 1, i + 1)];
    const slope = (width1 - width0) / (p1 - p0);
    const previousSlope = i > 1 ? (width0 - before[1]) / (p0 - before[0]) : slope;
    const nextSlope = i + 1 < BAMBOO_PROFILE.length ? (after[1] - width1) / (after[0] - p1) : slope;
    const tangent = (a, b) => a * b <= 0 ? 0 : 2 * a * b / (a + b);
    const t = (progress - p0) / (p1 - p0);
    const width = (2 * t ** 3 - 3 * t ** 2 + 1) * width0 +
      (t ** 3 - 2 * t ** 2 + t) * (p1 - p0) * tangent(previousSlope, slope) +
      (-2 * t ** 3 + 3 * t ** 2) * width1 +
      (t ** 3 - t ** 2) * (p1 - p0) * tangent(slope, nextSlope);
    return building.w * 0.5 * width;
  }
  return building.w * 0.5 * BAMBOO_PROFILE[BAMBOO_PROFILE.length - 1][1];
}

function buildingBoundsAtY(building, y) {
  const intersections = [];
  const points = building.outline;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
      intersections.push(a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y));
    }
  }
  if (intersections.length < 2) return null;
  return { left: min(...intersections), right: max(...intersections) };
}

function windowFitsBuilding(win, building) {
  for (let offset = 0; offset <= Math.ceil(win.h); offset++) {
    const bounds = buildingBoundsAtY(building, win.y + min(offset, win.h));
    if (!bounds || win.x < bounds.left + 3 || win.x + win.w > bounds.right - 3) return false;
  }
  return true;
}

function windowTouchesBuilding(win, building) {
  for (let offset = 0; offset <= Math.ceil(win.h); offset++) {
    const bounds = buildingBoundsAtY(building, win.y + min(offset, win.h));
    if (bounds && win.x + win.w > bounds.left && win.x < bounds.right) return true;
  }
  return false;
}


function makeGrain() {
  grainLayer = createGraphics(W, H);
  grainLayer.pixelDensity(1);
  grainLayer.loadPixels();
  for (let i = 0; i < grainLayer.pixels.length; i += 4) {
    const value = random() < 0.5 ? 255 : 0;
    const alpha = random(3, 13);
    grainLayer.pixels[i] = value;
    grainLayer.pixels[i + 1] = value;
    grainLayer.pixels[i + 2] = value;
    grainLayer.pixels[i + 3] = alpha;
  }
  grainLayer.updatePixels();
}

function draw() {
  advanceAnimation(deltaTime / 1000);
  drawSky();
  drawShootingStars();
  drawFog();
  drawSnow(false);
  drawCity();
  drawFallingDrops();
  drawSnow(true);
  drawGrain();
}

// 所有可见动画共用秒钟和固定步长；切回后台页面时不补发一大批落物。
function advanceAnimation(elapsedSeconds) {
  if (!Number.isFinite(elapsedSeconds)) return;
  syncMusicDrops();
  animationRemainder += constrain(elapsedSeconds, 0, 0.1);
  while (animationRemainder + 1e-9 >= ANIMATION_STEP) {
    animationRemainder = max(0, animationRemainder - ANIMATION_STEP);
    sceneTime += ANIMATION_STEP;
    updateFallingDrops(ANIMATION_STEP);
    updateWindows();
    updateSnow(ANIMATION_STEP);
    updateShootingStar();
    if (!musicTransport && sceneTime >= nextDropAt) {
      const drop = createDrop();
      if (drop) drops.push(drop);
      nextDropAt = sceneTime + random(0.85, 1.2) * lerp(2.25, 1.05, snowfallStrength());
    }
  }
  if (musicTransport) {
    updateFallingDrops(0, true);
    updateWindows();
  }
}

function syncMusicDrops() {
  const transport = globalThis.cityScore && globalThis.cityAudio && globalThis.cityAudio.transport
    ? globalThis.cityAudio.transport() : null;
  if ((transport ? transport.session : null) !== (musicTransport ? musicTransport.session : null)) {
    // 开关配乐时让旧落物轻轻隐去，既不突然清屏，也不留下抢拍的落点。
    for (const drop of drops) {
      if (drop.phase === "retiring") continue;
      drop.phase = "retiring";
      drop.retireAge = 0;
      drop.retireOpacity = drop.opacity;
      drop.retireTrailOpacity = drop.trailOpacity;
      drop.music = null;
    }
    musicDropEvents.clear();
    nextDropAt = sceneTime + 1;
  }
  musicTransport = transport;
  if (!transport || transport.time < 0) return;
  const score = globalThis.cityScore;
  const cycleDuration = transport.duration == null ? score.duration : transport.duration;
  const cycle = Math.floor(transport.time / cycleDuration);
  for (const [key, landedAt] of musicDropEvents) {
    if (landedAt < transport.time - 1) musicDropEvents.delete(key);
  }
  // 下一轮的首句需要提前落下，循环接缝才不会让音符先响、雪花后到。
  for (let lap = Math.max(0, cycle - 1); lap <= cycle + 1; lap++) {
    for (const note of score.visuals) {
      const landedAt = lap * cycleDuration + note.at;
      // 开场便有旋律：首批雪花已在半空，不把完整飞行挤进不足一秒。
      const startedAt = landedAt - note.visual.flight;
      if (transport.time < startedAt || transport.time > landedAt + DROP_MERGE_SECONDS) continue;
      const key = `${lap}:${note.id}`;
      if (musicDropEvents.has(key)) continue;
      musicDropEvents.set(key, landedAt);
      const target = chooseMusicTarget(note.visual.x);
      const drop = createDrop(target, 150, note.visual);
      if (!drop) continue;
      const flight = Math.max(0.1, landedAt - startedAt);
      drop.speed = (drop.landingY - drop.startY + drop.approachDistance) / flight;
      drop.cruiseDuration = (drop.landingY - drop.startY - drop.approachDistance) / drop.speed;
      drop.approachDuration = drop.approachDistance * 2 / drop.speed;
      drop.music = { startedAt, landedAt, rotation: drop.rotation, key };
      drops.push(drop);
    }
  }
}

function chooseMusicTarget(position) {
  const available = windows.filter(win => !win.reserved);
  const dark = available.filter(win => win.light < 0.4);
  const candidates = dark.length ? dark : available;
  if (!candidates.length) return null;
  // 横向呼应旋律的声像，纵向保留变化，避免一直落到同一排窗。
  candidates.sort((a, b) => Math.abs(a.x / W - position) - Math.abs(b.x / W - position));
  return random(candidates.slice(0, 7));
}

function snowfallStrength() {
  if (musicTransport) {
    const score = globalThis.cityScore;
    if (score.sections[0].from !== undefined) {
      const time = max(0, musicTransport.time) % (musicTransport.duration == null ? score.duration : musicTransport.duration);
      const index = Math.max(0, score.sections.findIndex(part => time >= part.from && time < part.to));
      const section = score.sections[index];
      return lerp(score.sections[(index + score.sections.length - 1) % score.sections.length].intensity,
        section.intensity, smoothstep(0, 1.8, time - section.from));
    }
    const bar = max(0, musicTransport.time) % score.duration / (score.beatSeconds * 4);
    const index = Math.floor(bar / 8);
    return lerp(score.sections[(index + 3) % 4].intensity, score.sections[index].intensity,
      smoothstep(0, 1.25, bar % 8));
  }
  return 0.5 + 0.3 * sin(sceneTime * 0.12 - 0.8) + 0.2 * sin(sceneTime * 0.23 + 1.7);
}

function updateShootingStar() {
  if (shootingStar && sceneTime >= shootingStar.startedAt + shootingStar.duration) {
    shootingStar = null;
    nextMeteorAt = sceneTime + random(9, 18);
  }
  if (!shootingStar && sceneTime >= nextMeteorAt) {
    shootingStar = {
      startedAt: sceneTime,
      duration: random(2.3, 2.9),
      startX: W + 180,
      startY: random(28, 175),
      travelX: -(W + 380),
      travelY: random(235, 360),
      length: random(135, 180),
    };
    if (globalThis.cityAudio) globalThis.cityAudio.meteor({
      duration: shootingStar.duration,
      entry: (shootingStar.startX - W) / -shootingStar.travelX,
      exit: shootingStar.startX / -shootingStar.travelX,
    });
  }
}

function drawShootingStars() {
  if (shootingStar) drawShootingStar(shootingStar);
}

function drawShootingStar(config) {
  const progress = constrain((sceneTime - config.startedAt) / config.duration, 0, 1);
  const visibility = smoothstep(0, 0.08, progress) * (1 - smoothstep(0.94, 1, progress));
  // 匀速穿过整个天空，仅在画外淡入淡出，尾端不减速悬停。
  const x = config.startX + config.travelX * progress;
  const y = config.startY + config.travelY * progress;
  const angle = atan2(config.travelY, config.travelX);
  const tailX = x - cos(angle) * config.length;
  const tailY = y - sin(angle) * config.length;

  const ctx = drawingContext;
  ctx.save();
  const trail = ctx.createLinearGradient(tailX, tailY, x, y);
  trail.addColorStop(0, "rgba(240,244,255,0)");
  trail.addColorStop(0.72, `rgba(240,244,255,${0.22 * visibility})`);
  trail.addColorStop(1, `rgba(255,250,215,${0.9 * visibility})`);
  ctx.strokeStyle = trail;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(tailX, tailY);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.shadowBlur = 12;
  ctx.shadowColor = "rgba(255,248,210,0.9)";
  fill(255, 249, 220, 220 * visibility);
  noStroke();
  circle(x, y, 3.5);
  ctx.restore();
}

function drawSky() {
  push();
  const ctx = drawingContext;
  const gradient = ctx.createLinearGradient(0, 0, 0, H);
  gradient.addColorStop(0, "#2149F2");
  gradient.addColorStop(0.3, "#173BCB");
  gradient.addColorStop(0.62, "#0D206C");
  gradient.addColorStop(0.82, "#080B1D");
  gradient.addColorStop(1, "#08090F");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);

  // 主蓝色不变，光从左上轻轻铺开，避免整片天空像一张平涂色纸。
  const glow = ctx.createRadialGradient(W * 0.28, 210, 30, W * 0.28, 210, 650);
  glow.addColorStop(0, "rgba(66,103,255,0.28)");
  glow.addColorStop(0.5, "rgba(42,78,246,0.12)");
  glow.addColorStop(1, "rgba(8,18,76,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, 820);

  const horizon = ctx.createLinearGradient(0, 540, 0, CITY_BASE_Y);
  horizon.addColorStop(0, "rgba(49,74,169,0)");
  horizon.addColorStop(0.62, "rgba(49,74,169,0.12)");
  horizon.addColorStop(1, "rgba(49,74,169,0)");
  ctx.fillStyle = horizon;
  ctx.fillRect(0, 540, W, CITY_BASE_Y - 540);

  // 暗角只作用于楼后的天空，黑色建筑和暖窗不会被压暗。
  const edge = ctx.createRadialGradient(W * 0.46, 360, 180, W * 0.46, 360, 760);
  edge.addColorStop(0, "rgba(4,9,39,0)");
  edge.addColorStop(0.55, "rgba(4,9,39,0.035)");
  edge.addColorStop(1, "rgba(4,9,39,0.32)");
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, W, H);

  noStroke();
  for (let i = 0; i < 40; i++) {
    const x = (i * 223 + 71) % W;
    const y = (i * 97 + 43) % 430;
    fill(224, 228, 204, 25 + 18 * sin(sceneTime * 0.72 + i));
    circle(x, y, i % 9 === 0 ? 2 : 1);
  }
  pop();
}

function drawFog() {
  if (sceneTime >= nextFogAt) {
    updateFogTexture();
    nextFogAt = sceneTime + 1 / 8;
  }
  const ctx = drawingContext;
  ctx.save();
  ctx.filter = "blur(8px)";
  image(fogLayer, -12, 70, W + 24, 820);
  ctx.restore();
}

function updateFogTexture() {
  // 小尺寸连续噪声配合宽窄不一的云带，留出清澈天空，不铺一层灰罩。
  fogLayer.loadPixels();
  const time = sceneTime * 0.018;
  for (let y = 0; y < fogLayer.height; y++) {
    const height = y / (fogLayer.height - 1);
    const edgeFade = pow(sin(PI * height), 1.5);
    for (let x = 0; x < fogLayer.width; x++) {
      const broad = noise(x * 0.026 + time * 0.4, y * 0.038 - time * 0.12, time);
      const detail = noise(x * 0.064 + 31, y * 0.075 - time * 0.3, time * 0.65);
      const center = 0.3 + x / fogLayer.width * 0.3 + 0.055 * sin(x * 0.025 + time * 0.3);
      const ribbon = Math.exp(-(((height - center) / 0.2) ** 2));
      const density = smoothstep(0.34, 0.7, broad * 0.76 + detail * 0.24);
      const index = (y * fogLayer.width + x) * 4;
      fogLayer.pixels[index] = 75;
      fogLayer.pixels[index + 1] = 106;
      fogLayer.pixels[index + 2] = 218;
      fogLayer.pixels[index + 3] = density * edgeFade * (8 + ribbon * 26);
    }
  }
  fogLayer.updatePixels();
}

function createSnowflake(initial = false) {
  const layer = random();
  const depth = layer < 0.62 ? random(0.12, 0.45) : layer < 0.92 ? random(0.46, 0.76) : random(0.8, 1);
  const originX = random(-16, W + 16);
  return {
    x: originX,
    originX,
    y: initial ? random(H) : random(-40, -8),
    size: lerp(0.65, 3.1, depth * depth),
    speed: lerp(15, 105, depth * depth),
    sway: random(0.4, 0.85),
    offset: random(TWO_PI),
    depth,
  };
}

function updateSnow(dt) {
  for (let i = snow.length - 1; i >= 0; i--) {
    const flake = snow[i];
    flake.y += flake.speed * dt;
    flake.x = flake.originX + sin(sceneTime * flake.sway + flake.offset) * lerp(4, 19, flake.depth) +
      sin(sceneTime * 0.13 + flake.offset) * flake.depth * 12;
    if (flake.y > H + 12) snow.splice(i, 1);
  }
  if (sceneTime >= nextSnowAt) {
    if (snow.length < 180) snow.push(createSnowflake());
    nextSnowAt = sceneTime + random(0.75, 1.25) / lerp(1.55, 3.1, snowfallStrength());
  }
}

function drawSnow(foreground) {
  push();
  noStroke();
  for (const flake of snow) {
    if ((flake.depth > 0.58) !== foreground) continue;
    const edgeFade = smoothstep(-16, 32, flake.y) * (1 - smoothstep(H - 45, H + 10, flake.y));
    const softness = smoothstep(0.8, 1, flake.depth);
    const alpha = (24 + flake.depth * 106) * edgeFade;
    const ctx = drawingContext;
    push();
    // 只让极少数最近的雪点轻微虚化，远雪仍细小，主旋律雪花仍清晰。
    if (softness > 0) ctx.filter = `blur(${(softness * 0.85).toFixed(3)}px)`;
    fill(224, 233, 249, alpha);
    circle(flake.x, flake.y, flake.size * (1 + softness * 0.16));
    pop();
  }
  pop();
}

function drawCity() {
  push();
  for (const building of buildings) {
    drawBuilding(building);
    drawWindows(building.windows);
  }
  noStroke();
  fill(INK);
  rect(0, CITY_BASE_Y, W, H - CITY_BASE_Y);
  pop();
}


function smoothstep(edge0, edge1, value) {
  const amount = constrain((value - edge0) / (edge1 - edge0), 0, 1);
  return amount * amount * (3 - 2 * amount);
}

function traceBuildingOutline(ctx, building) {
  ctx.beginPath();
  building.outline.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.closePath();
}

function drawBuilding(building) {
  const { x, w, top } = building;
  const center = x + w / 2;
  const base = CITY_BASE_Y;
  push();
  const ctx = drawingContext;
  traceBuildingOutline(ctx, building);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.clip();
  noFill();
  strokeWeight(0.65);
  stroke(76, 80, 96, 34);
  const detailStrength = [0.105, 0.135, 0.15][building.depth];
  const structure = ctx.createLinearGradient(x, top, x, base);
  structure.addColorStop(0, `rgba(98,116,160,${detailStrength})`);
  structure.addColorStop(0.42, `rgba(98,116,160,${detailStrength * 0.6})`);
  structure.addColorStop(1, "rgba(98,116,160,0)");
  ctx.strokeStyle = structure;

  if (building.style === "springBamboo") {
    // 内部结构直接沿已经绘出的边线取样，始终在楼体内。
    for (let rib = -5; rib <= 5; rib++) {
      const amount = sin(rib / 6 * HALF_PI);
      beginShape();
      for (const edge of building.outline.slice(0, 101)) {
        vertex(center + (edge.x - center) * amount, edge.y);
      }
      endShape();
    }
    for (const progress of [0.34, 0.61, 0.84]) {
      const bandY = top + (base - top) * progress;
      const bounds = buildingBoundsAtY(building, bandY);
      line(bounds.left + 2, bandY, bounds.right - 2, bandY);
    }
  } else if (building.detail === "diagrid") {
    const crownBottom = top + building.shoulders.at * SKYLINE_SCALE;
    // 实拍中是盒状楼冠里的斜撑，斜撑不改变外轮廓。
    for (let rib = 0; rib < 7; rib++) {
      const ribX = x + w * rib / 6;
      line(ribX, top + 2, ribX + w * 0.19, crownBottom);
      line(ribX, top + 2, ribX - w * 0.19, crownBottom);
    }
    line(x, crownBottom - 3, x + w, crownBottom - 3);
    const left = x + w * building.shoulders.left;
    const right = x + w * building.shoulders.right;
    line(left + 3, crownBottom, left + 3, base);
    line(right - 3, crownBottom, right - 3, base);
  } else if (building.detail === "vertical") {
    for (let rib = 1; rib < 7; rib++) {
      const ribX = x + w * rib / 7;
      line(ribX, top + 6, ribX, base);
    }
  } else if (building.detail === "frame") {
    for (let col = 1; col < 4; col++) {
      line(x + w * col / 4, top + 9, x + w * col / 4, base);
    }
    for (let y = top + 21; y < base; y += 31) {
      line(x + 3, y, x + w - 3, y);
    }
  } else if (building.style === "sportsRoof") {
    for (let rib = -1; rib < 16; rib++) {
      const ribX = x + rib * w / 14;
      line(ribX, top, ribX + 28, top + 43 * SKYLINE_SCALE);
      line(ribX, top, ribX - 28, top + 43 * SKYLINE_SCALE);
    }
  }

  if (building.seam !== undefined) {
    ctx.save();
    ctx.globalAlpha *= 0.62;
    const seamX = x + w * building.seam;
    line(seamX, top, seamX, base);
    ctx.restore();
  }

  // 统一黑色楼体，仅在楼冠内侧留一丝天空反光，往下消失；不是整栋描边。
  const rim = ctx.createLinearGradient(0, top, 0, min(base, top + 105));
  rim.addColorStop(0, "rgba(114,139,200,0.22)");
  rim.addColorStop(0.35, "rgba(96,120,175,0.07)");
  rim.addColorStop(1, "rgba(96,120,175,0)");
  ctx.strokeStyle = rim;
  ctx.lineWidth = 1.25;
  traceBuildingOutline(ctx, building);
  ctx.stroke();
  pop();
}

function startWindowLight(win, startedAt, kind = "snowflake") {
  win.illumination = {
    startedAt,
    from: win.light,
    peak: max(win.light, random(0.76, 0.96)),
    rise: DROP_MERGE_SECONDS + 0.15,
    hold: random(10, 24),
    fade: random(14, 26),
  };
  if (globalThis.cityAudio) globalThis.cityAudio.windowLight(win.x / W, win.y / H, kind);
}

function updateWindows() {
  for (const win of windows) {
    const light = win.illumination;
    if (!light) {
      win.light = win.baseLight;
      win.flash = 0;
      continue;
    }
    const age = max(0, sceneTime - light.startedAt);
    if (age < light.rise) {
      win.light = lerp(light.from, light.peak, smoothstep(0, light.rise, age));
    } else if (age < light.rise + light.hold) {
      win.light = light.peak;
    } else {
      const fadeAge = age - light.rise - light.hold;
      win.light = lerp(light.peak, win.baseLight, smoothstep(0, light.fade, fadeAge));
      if (fadeAge >= light.fade) win.illumination = null;
    }
    win.flash = sin(PI * constrain(age / 1.3, 0, 1)) * 0.55;
  }
}

function drawWindows(buildingWindows) {
  push();
  noStroke();
  const ctx = drawingContext;
  for (const win of buildingWindows) {
    if (win.light <= 0.002) continue;
    const depthFactor = [0.82, 0.91, 1][win.depth];
    const centerX = win.x + win.w / 2;
    const centerY = win.y + win.h / 2;
    // 用坐标给每扇窗少量固定色温差，不消耗动画的随机数，也不改变落点。
    const warmth = (Math.floor(win.x * 7 + win.y * 11) % 9) / 8;
    const radius = 8 + win.light * 6 + win.flash * 2;
    const halo = (win.light * 0.075 + win.flash * 0.13) * depthFactor;
    const intensity = pow(win.light, 0.72) * depthFactor;
    push();
    const glow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
    glow.addColorStop(0, `rgba(255,226,159,${halo})`);
    glow.addColorStop(0.35, `rgba(255,226,159,${halo * 0.35})`);
    glow.addColorStop(1, "rgba(255,226,159,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);
    // 亮度接近零时也连续淡去，不再跨过阈值突然熄灭。
    fill(255, 224 + warmth * 14, 166 + warmth * 27, 255 * intensity);
    rect(win.x, win.y, win.w, win.h, 0.6);
    // 亮芯留在窗内，窗外只保留很轻的暖晕，不给楼体罩上大光斑。
    fill(255, 249, 219 + warmth * 12, 205 * intensity);
    rect(win.x + win.w * 0.2, win.y + 0.6, win.w * 0.6, win.h * 0.5, 0.35);
    pop();
  }
  pop();
}

function chooseDropTarget() {
  const collect = (darkOnly) => buildings.map((building) => {
    const candidates = building.windows.filter((win) => !win.reserved && (!darkOnly || win.light < 0.4));
    const recentFactor = lerp(0.4, 1, constrain((sceneTime - building.lastDropAt) / 6, 0, 1));
    return { candidates, weight: sqrt(candidates.length) * recentFactor };
  }).filter((group) => group.candidates.length);
  let groups = collect(true);
  if (!groups.length) groups = collect(false);
  if (!groups.length) return null;

  // 先选楼、再选窗，弱化大楼窗户数量对掉落位置的垄断。
  let choice = random(groups.reduce((sum, group) => sum + group.weight, 0));
  for (const group of groups) {
    choice -= group.weight;
    if (choice <= 0) return random(group.candidates);
  }
  return random(groups[groups.length - 1].candidates);
}

function chooseDropKind() {
  // 雪花为主，十字少量点缀；限制连发后长期占比约为 15%。
  const crossChance = previousDropKind === "cross" ? 0 : 0.18;
  previousDropKind = random() < crossChance ? FALLING_SHAPES[0] : FALLING_SHAPES[1];
  return previousDropKind;
}

function createDrop(target = null, speed = random(115, 180), profile = null) {
  target = target || chooseDropTarget();
  if (!target || target.reserved || drops.length >= 32) return null;
  target.reserved = true;
  const building = buildings.find((item) => item.id === target.buildingId);
  if (building) building.lastDropAt = sceneTime;
  const startY = random(-100, -24);
  const landingY = target.y + target.h / 2;
  const approachDistance = 40;
  return {
    x: target.x + target.w / 2,
    y: startY,
    startY,
    landingY,
    target,
    kind: profile && profile.kind != null ? profile.kind : chooseDropKind(),
    size: profile && profile.size != null ? profile.size : random(6, 9),
    brightness: profile && profile.brightness != null ? profile.brightness : 1,
    speed,
    rotation: random(TWO_PI),
    turn: profile && profile.turn != null ? profile.turn : random(-0.6, 0.6),
    trailLength: random(130, 205),
    phase: "falling",
    fallAge: 0,
    cruiseDuration: (landingY - approachDistance - startY) / speed,
    approachDistance,
    approachDuration: approachDistance * 2 / speed,
    mergeAge: 0,
    opacity: 1,
    trailOpacity: 1,
  };
}

function updateFallingDrops(dt, musicOnly = false) {
  for (let i = drops.length - 1; i >= 0; i--) {
    const drop = drops[i];
    if (Boolean(drop.music) !== musicOnly) continue;
    if (drop.phase === "retiring") {
      drop.retireAge += dt;
      const fade = 1 - smoothstep(0, 0.35, drop.retireAge);
      drop.opacity = drop.retireOpacity * fade;
      drop.trailOpacity = drop.retireTrailOpacity * fade;
      if (fade <= 0) {
        drop.target.reserved = false;
        drops.splice(i, 1);
      }
      continue;
    }
    if (drop.music) {
      drop.fallAge = max(0, musicTransport.time - drop.music.startedAt);
      drop.mergeAge = max(0, musicTransport.time - drop.music.landedAt);
      drop.rotation = drop.music.rotation + drop.turn * Math.min(drop.fallAge, drop.music.landedAt - drop.music.startedAt);
    }
    if (drop.phase === "falling") {
      if (!drop.music) {
        drop.fallAge += dt;
        drop.rotation += drop.turn * dt;
      }
      if (drop.fallAge < drop.cruiseDuration) {
        drop.y = drop.startY + drop.speed * drop.fallAge;
      } else {
        const approach = constrain((drop.fallAge - drop.cruiseDuration) / drop.approachDuration, 0, 1);
        drop.y = drop.landingY - drop.approachDistance * (1 - approach) ** 2;
        if (approach >= 1 - 1e-9) {
          drop.phase = "merging";
          drop.mergeAge = max(0, drop.fallAge - drop.cruiseDuration - drop.approachDuration);
          startWindowLight(drop.target, sceneTime - drop.mergeAge, drop.kind);
        }
      }
    } else if (!drop.music) {
      drop.mergeAge += dt;
      drop.rotation += drop.turn * dt * drop.opacity;
    }

    if (drop.phase === "merging") {
      drop.opacity = 1 - smoothstep(0, DROP_MERGE_SECONDS, drop.mergeAge);
      drop.trailOpacity = 1 - smoothstep(0, DROP_MERGE_SECONDS * 0.72, drop.mergeAge);
      if (drop.mergeAge >= DROP_MERGE_SECONDS) {
        drop.target.reserved = false;
        drops.splice(i, 1);
      }
    }
    if (drop.music && drop.music.startedAt < 0 && drop.phase === "falling") {
      const entrance = smoothstep(0, 0.18, musicTransport.time);
      drop.opacity = entrance;
      drop.trailOpacity = entrance;
    }
  }
}

function drawFallingDrops() {
  for (const drop of drops) {
    drawDropTrail(drop);
    drawDropIcon(drop);
  }
}

function drawDropTrail(drop) {
  if (drop.trailOpacity <= 0) return;
  const topY = max(-4, drop.y - drop.trailLength);
  const endY = drop.y - drop.size - 3;
  if (endY <= topY) return;
  const ctx = drawingContext;
  ctx.save();
  const trail = ctx.createLinearGradient(drop.x, topY, drop.x, endY);
  trail.addColorStop(0, "rgba(229,236,251,0)");
  trail.addColorStop(0.3, `rgba(229,236,251,${0.05 * drop.trailOpacity})`);
  trail.addColorStop(1, `rgba(240,242,219,${0.21 * drop.trailOpacity})`);
  ctx.strokeStyle = trail;
  ctx.lineWidth = 0.85;
  ctx.beginPath();
  ctx.moveTo(drop.x, topY);
  ctx.lineTo(drop.x, endY);
  ctx.stroke();
  ctx.restore();
}

function drawDropIcon(drop) {
  if (drop.opacity <= 0) return;
  push();
  // 每片雪花自身明暗起伏，不加放射光线；不同落点错开呼吸，避免整屏同闪。
  const phase = drop.x * 0.037 + drop.landingY * 0.011;
  const shimmer = pow(0.5 + 0.5 * sin(drop.fallAge * 2.15 + phase), 4);
  drawingContext.globalAlpha *= drop.opacity * (drop.brightness == null ? 1 : drop.brightness) * (0.74 + shimmer * 0.26);
  drawingContext.shadowColor = "rgba(255,243,195,0.6)";
  drawingContext.shadowBlur = 2 + shimmer * 4;
  translate(drop.x, drop.y);
  rotate(drop.rotation);
  scale(0.84 + drop.opacity * 0.16);
  if (drop.kind === "cross") drawCross(drop.size);
  if (drop.kind === "snowflake") drawSnowCrystal(drop.size);
  pop();
}


function drawCross(size) {
  stroke(PAPER);
  strokeWeight(1.5);
  strokeCap(ROUND);
  line(-size, 0, size, 0);
  line(0, -size, 0, size);
  noStroke();
}

function drawSnowCrystal(size) {
  noFill();
  stroke(PAPER);
  strokeWeight(1.1);
  strokeCap(ROUND);
  for (let arm = 0; arm < 6; arm++) {
    push();
    rotate(arm * PI / 3);
    line(0, 0, 0, -size);
    line(0, -size * 0.58, -size * 0.25, -size * 0.78);
    line(0, -size * 0.58, size * 0.25, -size * 0.78);
    pop();
  }
  noStroke();
}


function drawGrain() {
  tint(255, 88);
  image(grainLayer, 0, 0);
  noTint();
}

function mousePressed(event) {
  if (event && event.target && event.target.closest && event.target.closest("[data-scene-control]")) return;
  if (musicTransport) return;
  let target = null;
  let nearest = 42;
  for (const win of windows) {
    const distance = dist(mouseX, mouseY, win.x, win.y);
    if (distance < nearest) {
      nearest = distance;
      target = win;
    }
  }

  if (!target || target.reserved) return;
  const drop = createDrop(target, 215);
  if (drop) drops.push(drop);
}
