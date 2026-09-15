// 运行：node --test tests/animation.test.cjs
// 用轻量绘图替身检查时间、状态和参数，不代替真实浏览器的观感验收。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');

const source = fs.readFileSync(path.join(__dirname, '..', 'sketch.js'), 'utf8');
const style = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');

function loadScene({ fullSetup = false, withScore = false } = {}) {
  let seed = 24;
  const stack = [];
  const gradients = [];
  const numeric = (...values) => {
    for (const value of values) {
      if (typeof value === 'number') assert.ok(Number.isFinite(value), '绘图参数必须是有限数值');
    }
  };
  const gradient = (...values) => {
    numeric(...values);
    const stops = [];
    gradients.push(stops);
    return {
      addColorStop(offset, color) {
        assert.ok(Number.isFinite(offset) && offset >= 0 && offset <= 1, '渐变位置必须在有效范围内');
        const rgba = /^rgba\((.*)\)$/i.exec(color);
        if (rgba) {
          const channels = rgba[1].split(',').map(Number);
          assert.equal(channels.length, 4, '透明颜色须包含四个数值');
          assert.ok(channels.every(Number.isFinite), '颜色参数不能出现无效数值');
          assert.ok(channels[3] >= 0 && channels[3] <= 1, '渐变透明度须在零到一之间');
        }
        stops.push({ offset, color });
      },
    };
  };
  const paintKeys = ['globalAlpha', 'filter', 'shadowBlur', 'shadowColor', 'shadowOffsetX',
    'shadowOffsetY', 'globalCompositeOperation', 'strokeStyle', 'fillStyle', 'lineWidth', 'lineCap'];
  const ctx = {
    globalAlpha: 1,
    filter: 'none',
    shadowBlur: 0,
    shadowColor: 'rgba(0, 0, 0, 0)',
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    globalCompositeOperation: 'source-over',
    strokeStyle: '#000000',
    fillStyle: '#000000',
    lineWidth: 1,
    lineCap: 'butt',
    save() { stack.push(Object.fromEntries(paintKeys.map(key => [key, this[key]]))); },
    restore() { assert.ok(stack.length, '画布状态不能多次恢复'); Object.assign(this, stack.pop()); },
    createLinearGradient: gradient,
    createRadialGradient: gradient,
  };
  for (const method of ['beginPath', 'closePath', 'moveTo', 'lineTo', 'fill', 'stroke', 'clip', 'fillRect']) {
    ctx[method] = numeric;
  }
  const sandbox = {
    Math: Object.create(Math), Number, assert, drawingContext: ctx, deltaTime: 1000 / 60,
    PI: Math.PI, TWO_PI: Math.PI * 2, HALF_PI: Math.PI / 2, ROUND: 'round',
    min: Math.min, max: Math.max, floor: Math.floor, pow: Math.pow, sqrt: Math.sqrt,
    sin: Math.sin, cos: Math.cos, atan2: Math.atan2,
    constrain: (x, low, high) => Math.max(low, Math.min(high, x)),
    lerp: (a, b, t) => a + (b - a) * t,
    dist: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1),
    randomSeed(value) { seed = value >>> 0; },
    random(a, b) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const value = seed / 4294967296;
      if (Array.isArray(a)) return a[Math.floor(value * a.length)];
      if (a === undefined) return value;
      return b === undefined ? value * a : a + value * (b - a);
    },
    // 连续、确定的噪声替身，仅测试透明度范围和绘图调用。
    noise: (x, y = 0, z = 0) => 0.5 + Math.sin(x * 1.8 + Math.sin(y) + z) * 0.2,
    noiseSeed() {}, pixelDensity() {}, frameRate() {},
    createCanvas: (width, height) => ({ parent() { assert.equal(width / height, 5 / 6); } }),
    createGraphics: (width, height) => ({
      width, height, pixels: new Uint8ClampedArray(width * height * 4),
      pixelDensity() {}, loadPixels() {}, updatePixels() {},
    }),
    push: () => ctx.save(), pop: () => ctx.restore(),
  };
  for (const method of ['fill', 'noFill', 'stroke', 'noStroke', 'strokeWeight', 'strokeCap',
    'rect', 'circle', 'line', 'translate', 'rotate', 'scale', 'beginShape', 'vertex', 'endShape',
    'image', 'tint', 'noTint']) sandbox[method] = numeric;
  const context = vm.createContext(sandbox);
  if (withScore) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'assets/jrpg-track.js'), 'utf8'), context);
  vm.runInContext(source, context);
  if (!fullSetup) vm.runInContext('makeGrain = () => {};', context);
  vm.runInContext('setup();', context);
  return {
    run: (code) => vm.runInContext(code, context),
    snapshot: (code) => JSON.parse(vm.runInContext(`JSON.stringify(${code})`, context)),
    paintState: () => Object.fromEntries(paintKeys.map(key => [key, ctx[key]])),
    context, stack, ctx, gradients,
  };
}

test('配乐落物按声音时间定位，刷新快慢和单次卡顿都不累积错拍', () => {
  for (const rate of [30, 60, 120]) {
    const scene = loadScene({ withScore: true });
    scene.run(`
      let audioTime = 0;
      let enabled = true;
      const arrivals = [];
      globalThis.cityAudio = {
        transport: () => enabled ? { session: 1, time: audioTime } : null,
        windowLight: () => arrivals.push(audioTime), meteor: () => {},
      };
      for (let frame = 0; frame <= ${rate * 10}; frame++) {
        audioTime = frame / ${rate};
        advanceAnimation(1 / ${rate});
        for (const drop of drops.filter(drop => drop.music)) {
          const age = audioTime - drop.music.startedAt;
          const expectedY = age < drop.cruiseDuration ? drop.startY + drop.speed * age :
            drop.landingY - 40 * (1 - constrain((age - drop.cruiseDuration) / drop.approachDuration, 0, 1)) ** 2;
          assert.ok(Math.abs(drop.y - expectedY) < 1e-7);
        }
      }
      const expected = cityScore.visuals.filter(note => note.at <= 10);
      assert.equal(arrivals.length, expected.length);
      arrivals.forEach((time, i) => assert.ok(time - expected[i].at >= -1e-8 && time - expected[i].at <= 1 / ${rate} + 1e-8));
      audioTime = 11.2;
      advanceAnimation(1.2);
      for (const drop of drops.filter(drop => drop.music && drop.phase === 'falling')) {
        assert.ok(Math.abs(drop.fallAge - (audioTime - drop.music.startedAt)) < 1e-8);
      }
      enabled = false;
      advanceAnimation(1 / 60);
      assert.ok(drops.every(drop => !drop.music));
      for (let i = 0; i < 24; i++) advanceAnimation(1 / 60);
      assert.equal(windows.filter(win => win.reserved).length, 0);
      for (let i = 0; i < 90; i++) advanceAnimation(1 / 60);
      assert.ok(drops.length > 0 && drops.every(drop => !drop.music));
    `);
  }
});

test('配乐跨越循环提前发出雪花，落点一音一次，数量与占用始终受控', () => {
  const scene = loadScene({ withScore: true });
  scene.run(`
    let audioTime = 0;
    const arrivals = [];
    globalThis.cityAudio = {
      transport: () => ({ session: 1, time: audioTime }),
      windowLight: () => arrivals.push(audioTime), meteor: () => {},
    };
    let preparedNextLoop = false;
    for (let frame = 0; frame <= Math.ceil(cityScore.duration * 2 * 30); frame++) {
      audioTime = frame / 30;
      advanceAnimation(1 / 30);
      assert.ok(drops.length < 16);
      assert.ok(musicDropEvents.size < 20);
      assert.equal(windows.filter(win => win.reserved).length, drops.length);
      if (audioTime < cityScore.duration && drops.some(drop => drop.music?.landedAt > cityScore.duration)) preparedNextLoop = true;
    }
    assert.equal(preparedNextLoop, true);
    const expectedCount = cityScore.visuals.length * 2 + cityScore.visuals.filter(note =>
      note.at <= audioTime - cityScore.duration * 2 + 1e-8).length;
    assert.equal(arrivals.length, expectedCount);
    arrivals.forEach((time, i) => {
      const expected = Math.floor(i / cityScore.visuals.length) * cityScore.duration + cityScore.visuals[i % cityScore.visuals.length].at;
      assert.ok(time - expected >= -1e-8 && time - expected < 1 / 30 + 1e-8);
    });
    draw();
  `);
  assert.equal(scene.stack.length, 0);
});

test('开场雪花预先位于半空，第一拍点窗且保持正常飞行速度', () => {
  const scene = loadScene({ withScore: true });
  scene.run(`
    let audioTime = -0.12;
    let arrivals = 0;
    globalThis.cityAudio = {
      transport: () => ({ session: 1, time: audioTime }),
      windowLight: () => { arrivals++; }, meteor: () => {},
    };
    advanceAnimation(1 / 60);
    assert.equal(arrivals, 0);
    audioTime = cityScore.visuals[0].at;
    advanceAnimation(1 / 60);
    assert.equal(arrivals, 1);
    const first = drops.find(drop => drop.music?.key === '0:' + cityScore.visuals[0].id);
    assert.equal(first.phase, 'merging');
    assert.equal(first.y, first.landingY);
    const falling = drops.filter(drop => drop.music && drop.phase === 'falling');
    assert.ok(falling.some(drop => drop.y > 0));
    assert.ok(falling.length < 10);
    for (const drop of drops.filter(drop => drop.music)) {
      const note = cityScore.visuals.find(note => '0:' + note.id === drop.music.key);
      assert.ok(Math.abs(drop.cruiseDuration + drop.approachDuration - note.visual.flight) < 1e-8);
      assert.ok(drop.speed < 400);
    }
  `);
});

test('只裁底部留白，建筑比例、可见窗户和掉落物种类保留', () => {
  const scene = loadScene();
  scene.run(`
    assert.equal(H, 1080);
    assert.equal(CITY_BASE_Y, 900);
    assert.equal(windows.length, 212);
    assert.equal(FALLING_SHAPES.join(','), 'cross,snowflake');
    const bamboo = buildings.find(b => b.id === 'spring-bamboo');
    assert.ok(Math.abs(bamboo.w / (CITY_BASE_Y - bamboo.top) - 136 / 735) < 1e-10);
    for (let i = 0; i < buildings.length; i++) {
      for (const win of buildings[i].windows) {
        assert.ok(windowFitsBuilding(win, buildings[i]));
        assert.ok(!buildings.slice(i + 1).some(front => windowTouchesBuilding(win, front)));
      }
    }
  `);
  assert.match(style, /aspect-ratio:\s*5\s*\/\s*6/);
  assert.match(style, /83\.333333vh/);
});

test('视觉润色保留已提交版本的全部楼体轮廓和窗户坐标', () => {
  const scene = loadScene();
  const geometry = scene.snapshot(`({
    buildings: buildings.map(({ id, outline }) => ({ id, outline })),
    windows: windows.map(({ buildingId, x, y, w, h }) => ({ buildingId, x, y, w, h })),
  })`);
  assert.equal(geometry.buildings.length, 21);
  assert.equal(geometry.windows.length, 212);
  // 从优化前已提交的 sketch.js 计算；保留八位小数，忽略平台最末位浮点差异。
  const canonical = JSON.stringify(geometry, (_key, value) =>
    typeof value === 'number' ? Math.round(value * 1e8) / 1e8 : value);
  assert.equal(createHash('sha256').update(canonical).digest('hex'),
    '6cc7bdebf43e919fe7ace496497f53d3f6773eae02a309abb1d9f2a2e2dfbdeb');
});

test('落物渐隐与窗灯渐亮重叠，之后保持亮灯并平滑熄灭', () => {
  const scene = loadScene();
  scene.run(`
    drops = [];
    windows.forEach(win => { win.reserved = false; });
    const target = windows.find(win => win.baseLight === 0);
    const drop = createDrop(target, 160);
    drops.push(drop);
    drop.fallAge = drop.cruiseDuration + drop.approachDuration - 0.2;
    updateFallingDrops(0);
    let previousY = drop.y;
    let previousOpacity = 1;
    let previousLight = 0;
    let overlappingFrames = 0;
    for (let i = 0; i < 120; i++) {
      sceneTime += 1 / 120;
      updateFallingDrops(1 / 120);
      updateWindows();
      assert.ok(drop.y >= previousY && drop.y <= drop.landingY + 1e-9);
      if (drop.phase === 'falling') assert.equal(target.light, 0);
      if (drop.phase === 'merging') {
        assert.ok(drop.opacity <= previousOpacity + 1e-9);
        assert.ok(target.light >= previousLight - 1e-9);
        if (drop.opacity > 0.05 && drop.opacity < 0.95 && target.light > 0.02) overlappingFrames++;
      }
      previousY = drop.y;
      previousOpacity = drop.opacity;
      previousLight = target.light;
    }
    assert.ok(overlappingFrames > 20);
    assert.equal(drops.length, 0);
    assert.equal(target.reserved, false);
    const envelope = target.illumination;
    sceneTime = envelope.startedAt + envelope.rise + envelope.hold / 2;
    updateWindows();
    assert.equal(target.light, envelope.peak);
    sceneTime = envelope.startedAt + envelope.rise + envelope.hold + envelope.fade / 2;
    updateWindows();
    assert.ok(target.light > target.baseLight && target.light < envelope.peak);
    sceneTime += envelope.fade;
    updateWindows();
    assert.equal(target.light, target.baseLight);
    assert.equal(target.illumination, null);
  `);
});

test('常亮窗不会自行熄灭，重复点选和全部占用时安全退出', () => {
  const scene = loadScene();
  scene.run(`
    const permanent = windows.filter(win => win.baseLight > 0);
    assert.ok(permanent.length >= 5 && permanent.length < 25);
    sceneTime = 1000;
    updateWindows();
    permanent.forEach(win => assert.equal(win.light, win.baseLight));
    const target = windows.find(win => !win.reserved);
    mouseX = target.x;
    mouseY = target.y;
    const before = drops.length;
    mousePressed();
    assert.equal(drops.length, before + 1);
    assert.equal(drops[drops.length - 1].target, target);
    mousePressed();
    assert.equal(drops.length, before + 1);
    windows.forEach(win => { win.reserved = true; });
    assert.equal(chooseDropTarget(), null);
    assert.equal(createDrop(), null);
  `);
});

test('落点分配减轻对春笋的集中，保留所有有窗建筑的机会', () => {
  const scene = loadScene();
  const result = scene.snapshot(`(() => {
    windows.forEach(win => { win.reserved = false; });
    buildings.forEach(b => { b.lastDropAt = -Infinity; });
    const counts = {};
    for (let i = 0; i < 5000; i++) {
      const target = chooseDropTarget();
      counts[target.buildingId] = (counts[target.buildingId] || 0) + 1;
    }
    return { counts, litBuildings: buildings.filter(b => b.windows.length).length };
  })()`);
  assert.ok(result.counts['spring-bamboo'] / 5000 < 0.25);
  assert.equal(Object.keys(result.counts).length, result.litBuildings);
});

test('十字约占 15%，随机出现但不会连续掉落', () => {
  const scene = loadScene();
  scene.run(`
    previousDropKind = null;
    let crossCount = 0;
    let previous = null;
    for (let i = 0; i < 10000; i++) {
      const kind = chooseDropKind();
      assert.ok(FALLING_SHAPES.includes(kind));
      assert.ok(!(previous === 'cross' && kind === 'cross'));
      if (kind === 'cross') crossCount++;
      previous = kind;
    }
    assert.ok(crossCount / 10000 > 0.13 && crossCount / 10000 < 0.18);
  `);
});

test('音效与窗灯和流星各触发一次，声音按钮不生成落物', () => {
  const scene = loadScene();
  scene.run(`
    const sounds = [];
    globalThis.cityAudio = {
      windowLight: (...args) => sounds.push({ type: 'window', args }),
      meteor: (...args) => sounds.push({ type: 'meteor', args }),
    };
    const before = drops.length;
    mousePressed({ target: { closest: () => true } });
    assert.equal(drops.length, before);
    drops.forEach(drop => { drop.target.reserved = false; });
    drops = [];
    const target = windows.find(win => !win.reserved);
    const drop = createDrop(target, 160);
    drops.push(drop);
    drop.fallAge = drop.cruiseDuration + drop.approachDuration - 0.01;
    for (let i = 0; i < 90; i++) {
      sceneTime += ANIMATION_STEP;
      updateFallingDrops(ANIMATION_STEP);
    }
    assert.equal(sounds.filter(sound => sound.type === 'window').length, 1);
    assert.equal(sounds[0].args[2], drop.kind);
    nextMeteorAt = sceneTime;
    updateShootingStar();
    updateShootingStar();
    assert.equal(sounds.filter(sound => sound.type === 'meteor').length, 1);
    const meteorSound = sounds.find(sound => sound.type === 'meteor').args[0];
    assert.ok(meteorSound.entry > 0 && meteorSound.entry < meteorSound.exit && meteorSound.exit < 1);
  `);
});

test('每秒 30、60、120 次刷新得到相同的动画状态', () => {
  const snapshots = [30, 60, 120].map(rate => {
    const scene = loadScene();
    scene.run(`for (let i = 0; i < ${rate * 60}; i++) advanceAnimation(1 / ${rate});`);
    return scene.snapshot(`({ sceneTime, drops, snow, windows, shootingStar, nextDropAt, nextMeteorAt })`);
  });
  assert.deepEqual(snapshots[0], snapshots[1]);
  assert.deepEqual(snapshots[1], snapshots[2]);
});

test('连续运行五分钟：数量受控、无落点泄漏，流星单颗完整穿越且间隔变化', () => {
  const scene = loadScene();
  const result = scene.snapshot(`(() => {
    let maxDrops = 0, maxSnow = 0, minStrength = 1, maxStrength = 0;
    const meteors = [];
    let lastMeteor = null;
    for (let i = 0; i < 300 * 60; i++) {
      advanceAnimation(1 / 60);
      maxDrops = max(maxDrops, drops.length);
      maxSnow = max(maxSnow, snow.length);
      minStrength = min(minStrength, snowfallStrength());
      maxStrength = max(maxStrength, snowfallStrength());
      assert.equal(windows.filter(win => win.reserved).length, drops.length);
      assert.equal(new Set(drops.map(drop => drop.target)).size, drops.length);
      for (const drop of drops) {
        assert.ok(Number.isFinite(drop.x) && Number.isFinite(drop.y));
        assert.ok(drop.opacity >= 0 && drop.opacity <= 1);
        assert.ok(drop.trailOpacity >= 0 && drop.trailOpacity <= 1);
      }
      for (const win of windows) assert.ok(win.light >= 0 && win.light <= 1);
      if (shootingStar && shootingStar !== lastMeteor) {
        assert.ok(shootingStar.startX > W && shootingStar.travelX < 0 && shootingStar.travelY > 0);
        assert.ok(shootingStar.startX + shootingStar.travelX + shootingStar.length < 0);
        if (lastMeteor) {
          const gap = shootingStar.startedAt - lastMeteor.startedAt - lastMeteor.duration;
          assert.ok(gap >= 9 && gap <= 18.04);
        }
        meteors.push({ start: shootingStar.startedAt, duration: shootingStar.duration });
        lastMeteor = shootingStar;
      }
    }
    return { maxDrops, maxSnow, minStrength, maxStrength, meteors };
  })()`);
  assert.ok(result.maxDrops <= 32);
  assert.ok(result.maxSnow <= 180);
  assert.ok(result.minStrength >= 0 && result.maxStrength <= 1);
  assert.ok(result.maxStrength - result.minStrength > 0.7);
  assert.ok(result.meteors.length >= 12 && result.meteors.length <= 25);
  assert.ok(new Set(result.meteors.map(m => m.duration.toFixed(2))).size > 5);
});

test('长时间切到后台不会快进或一次补发大量落物', () => {
  const scene = loadScene();
  scene.run(`
    const before = sceneTime;
    advanceAnimation(3600);
    assert.ok(sceneTime - before <= 0.100001);
    assert.ok(drops.length <= 5);
    const current = sceneTime;
    advanceAnimation(NaN);
    advanceAnimation(Infinity);
    advanceAnimation(-1);
    assert.equal(sceneTime, current);
  `);
});

test('完整绘图调用无异常，淡出不污染后续画面，雾层透明度受控', () => {
  const scene = loadScene({ fullSetup: true });
  scene.run(`
    for (let i = 0; i < 3; i++) draw();
    for (let i = 0; i < 6 * 60; i++) advanceAnimation(1 / 60);
    draw();
    const sample = drops[0];
    sample.opacity = 0.3;
    sample.trailOpacity = 0.2;
    drawFallingDrops();
    assert.equal(drawingContext.globalAlpha, 1);
    assert.equal(drawingContext.filter, 'none');
    let maxAlpha = 0;
    for (let i = 3; i < fogLayer.pixels.length; i += 4) {
      maxAlpha = max(maxAlpha, fogLayer.pixels[i]);
      assert.ok(fogLayer.pixels[i] <= 34);
    }
    assert.ok(maxAlpha > 0);
  `);
  assert.equal(scene.stack.length, 0);
});

test('绘图不使用随机数，也不改动落物、雪、窗灯和动画时钟', () => {
  const scene = loadScene({ fullSetup: true });
  scene.run(`
    for (let frame = 0; frame < 20 * 60; frame++) advanceAnimation(1 / 60);
    nextMeteorAt = sceneTime;
    updateShootingStar();
    random = () => assert.fail('绘图不能取随机数，否则不同刷新速度会得到不同画面');
    Math.random = random;
  `);
  const state = `({ sceneTime, animationRemainder, drops, snow, windows,
    shootingStar, nextDropAt, nextSnowAt, nextMeteorAt })`;
  for (const offset of [0, 0.22, 0.61, 1.17]) {
    scene.run(`sceneTime = 20 + ${offset};`);
    const before = scene.snapshot(state);
    scene.run(`
      drawSky();
      drawShootingStars();
      drawFog();
      drawSnow(false);
      drawCity();
      drawFallingDrops();
      drawSnow(true);
      drawGrain();
    `);
    assert.deepEqual(scene.snapshot(state), before);
    assert.equal(scene.ctx.globalAlpha, 1);
    assert.equal(scene.ctx.filter, 'none');
    assert.equal(scene.ctx.shadowBlur, 0);
    assert.equal(scene.ctx.shadowColor, 'rgba(0, 0, 0, 0)');
    assert.equal(scene.ctx.globalCompositeOperation, 'source-over');
    assert.equal(scene.stack.length, 0);
  }
  assert.ok(scene.gradients.length > 0, '绘图确实使用了经过透明度检查的渐变');
});

test('落物从可见到完全消失均恢复画布的透明度、柔光和画笔状态', () => {
  const scene = loadScene();
  const before = scene.paintState();
  for (const opacity of [1, 0.65, 0.17, 0]) {
    scene.run(`
      for (const drop of drops) {
        drop.opacity = ${opacity};
        drop.trailOpacity = ${opacity};
      }
      drawFallingDrops();
    `);
    assert.deepEqual(scene.paintState(), before);
    assert.equal(scene.stack.length, 0);
  }
});

test('雾气缓慢变化时保持透明度上限，上下边缘完整淡去', () => {
  const scene = loadScene();
  for (const time of [0, 30, 180]) {
    scene.run(`{
      sceneTime = ${time};
      updateFogTexture();
      let visibleFogPixels = 0;
      for (let y = 0; y < fogLayer.height; y++) {
        for (let x = 0; x < fogLayer.width; x++) {
          const alpha = fogLayer.pixels[(y * fogLayer.width + x) * 4 + 3];
          assert.ok(alpha <= 34, '雾层不能盖成厚重灰幕');
          if (y === 0 || y === fogLayer.height - 1) assert.equal(alpha, 0);
          if (alpha > 0) visibleFogPixels++;
        }
      }
      assert.ok(visibleFogPixels > 0, '雾层不能完全消失');
    }`);
  }
});
