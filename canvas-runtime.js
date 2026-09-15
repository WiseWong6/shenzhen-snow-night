// 项目专用的二维绘图适配层：保留 sketch 的 p5 风格调用，不包含联网和设备接口。
// 不是完整 p5.js；噪声算法单独保存在 assets/p5-noise.js，沿用原来的云气纹理。
var globalThis = typeof globalThis === 'object' ? globalThis : window;
(() => {
  let ctx;
  let fillEnabled = true;
  let strokeEnabled = true;
  let tintAlpha = 1;
  let seed = 24;
  let shapeStarted = false;
  let frameId = null;
  let previousTime = null;
  let interval = 1000 / 60;
  const stack = [];
  const color = values => {
    if (typeof values[0] === 'string') return values[0];
    const gray = values.length < 3;
    const red = values[0], green = gray ? red : values[1], blue = gray ? red : values[2];
    const alpha = gray ? (values.length === 2 ? values[1] : 255) : (values.length > 3 ? values[3] : 255);
    return 'rgba(' + [red, green, blue, Math.max(0, Math.min(255, alpha)) / 255].join(',') + ')';
  };
  const paint = () => { if (fillEnabled) ctx.fill(); if (strokeEnabled) ctx.stroke(); };
  Object.assign(globalThis, {
    PI: Math.PI, TWO_PI: Math.PI * 2, HALF_PI: Math.PI / 2, ROUND: 'round',
    min: Math.min, max: Math.max, floor: Math.floor, pow: Math.pow, sqrt: Math.sqrt,
    sin: Math.sin, cos: Math.cos, atan2: Math.atan2,
    constrain: (value, low, high) => Math.max(low, Math.min(high, value)),
    lerp: (a, b, t) => a + (b - a) * t,
    dist: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1),
    randomSeed(value) { seed = value >>> 0; },
    random(a, b) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const value = seed / 4294967296;
      if (Array.isArray(a)) return a[Math.floor(value * a.length)];
      if (a === undefined) return value;
      if (b === undefined) return value * a;
      if (a > b) { const swap = a; a = b; b = swap; }
      return a + value * (b - a);
    },
    pixelDensity() { return 1; },
    frameRate(value) { if (value > 0) interval = 1000 / value; },
    createCanvas(width, height) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('当前浏览器无法绘制画布');
      ctx.lineCap = 'round';
      globalThis.drawingContext = ctx;
      globalThis.width = width;
      globalThis.height = height;
      const onPress = event => {
        const bounds = canvas.getBoundingClientRect();
        const point = event.touches ? event.touches[0] : event;
        globalThis.mouseX = (point.clientX - bounds.left) * width / bounds.width;
        globalThis.mouseY = (point.clientY - bounds.top) * height / bounds.height;
        if (typeof globalThis.mousePressed === 'function') globalThis.mousePressed(event);
      };
      if (globalThis.PointerEvent) canvas.addEventListener('pointerdown', onPress, { passive: true });
      else {
        let lastTouch = -Infinity;
        canvas.addEventListener('touchstart', event => { lastTouch = Date.now(); onPress(event); }, { passive: true });
        canvas.addEventListener('mousedown', event => { if (Date.now() - lastTouch > 700) onPress(event); });
      }
      return { parent(id) { document.getElementById(id).appendChild(canvas); } };
    },
    createGraphics(width, height) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('无法建立纹理画布');
      const data = context.createImageData(width, height);
      return { canvas, width, height, pixels: data.data,
        pixelDensity() { return 1; }, loadPixels() {},
        updatePixels() { context.putImageData(data, 0, 0); } };
    },
    push() { ctx.save(); stack.push([fillEnabled, strokeEnabled, tintAlpha]); },
    pop() { const state = stack.pop(); ctx.restore(); [fillEnabled, strokeEnabled, tintAlpha] = state; },
    fill(...values) { fillEnabled = true; ctx.fillStyle = color(values); },
    stroke(...values) { strokeEnabled = true; ctx.strokeStyle = color(values); },
    noFill() { fillEnabled = false; },
    noStroke() { strokeEnabled = false; },
    strokeWeight(value) { ctx.lineWidth = value; },
    strokeCap(value) { ctx.lineCap = value; },
    translate(x, y) { ctx.translate(x, y); },
    rotate(value) { ctx.rotate(value); },
    scale(x, y = x) { ctx.scale(x, y); },
    line(x1, y1, x2, y2) {
      if (!strokeEnabled) return;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    },
    rect(x, y, width, height, radius = 0) {
      ctx.beginPath();
      const r = Math.max(0, Math.min(radius, width / 2, height / 2));
      if (!r) ctx.rect(x, y, width, height);
      else {
        ctx.moveTo(x + r, y); ctx.lineTo(x + width - r, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + r);
        ctx.lineTo(x + width, y + height - r);
        ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
        ctx.lineTo(x + r, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - r);
        ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
      }
      ctx.closePath(); paint();
    },
    circle(x, y, diameter) { ctx.beginPath(); ctx.arc(x, y, Math.max(0, diameter / 2), 0, Math.PI * 2); paint(); },
    beginShape() { ctx.beginPath(); shapeStarted = false; },
    vertex(x, y) { if (shapeStarted) ctx.lineTo(x, y); else ctx.moveTo(x, y); shapeStarted = true; },
    endShape() { paint(); },
    tint(gray, alpha = 255) { tintAlpha = alpha / 255; },
    noTint() { tintAlpha = 1; },
    image(layer, x, y, width = layer.width, height = layer.height) {
      ctx.save(); ctx.globalAlpha *= tintAlpha;
      ctx.drawImage(layer.canvas, x, y, width, height); ctx.restore();
    },
  });

  function frame(now) {
    frameId = null;
    if (document.hidden) { previousTime = null; return; }
    if (previousTime === null || now - previousTime >= interval - 0.5) {
      globalThis.deltaTime = previousTime === null ? interval : Math.min(100, now - previousTime);
      previousTime = now;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      globalThis.draw();
    }
    frameId = requestAnimationFrame(frame);
  }
  function resume() {
    if (!ctx || document.hidden || frameId !== null) return;
    previousTime = null;
    frameId = requestAnimationFrame(frame);
  }
  function pause() {
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null;
    previousTime = null;
  }
  document.addEventListener('DOMContentLoaded', () => {
    try { globalThis.setup(); resume(); }
    catch (error) {
      const wrap = document.getElementById('canvas-wrap');
      const message = document.createElement('p');
      message.textContent = '当前浏览器无法显示动画，请使用较新的浏览器打开。';
      message.style.color = '#f5f0ce';
      wrap.appendChild(message);
    }
  }, { once: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); else resume(); });
  globalThis.addEventListener('pagehide', pause);
  globalThis.addEventListener('pageshow', resume);
})();
