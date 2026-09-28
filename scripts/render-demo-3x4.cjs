'use strict';
// 原始 900×1080 场景等比放大 8/3，左右各裁 45 逻辑像素，输出 2160×2880。
// 直接从画布读取帧，避免网页样式再次拉伸；不修改交互页面。
// 用法：node scripts/render-demo-3x4.cjs [帧数，默认967]
const fs = require('node:fs'), path = require('node:path');
const { chromium } = require('/Users/wisewong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const FPS = 30, TOTAL = Number(process.argv[2] || 967); // 32.233s × 30 帧，与旧演示片等长
const SCALE = 8 / 3, CLICK_AT = 1.0, SOUND_LEAD = 0.12, TRACK = 24.89469387755102;
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const output = path.join(root, '交付文件', '深圳湾雪夜-3比4高清.mp4');
let encoder, browser;


(async () => {
  browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--hide-scrollbars', '--force-color-profile=srgb'],
  });
  const context = await browser.newContext({ viewport: { width: 2160, height: 2880 }, deviceScaleFactor: 1 });
  await context.addInitScript(() => { window.requestAnimationFrame = () => 0; }); // 冻结自动帧循环，帧节奏完全由采集控制
  const page = await context.newPage();
  await page.goto('file://' + path.join(root, 'index.html'));
  await page.waitForSelector('#canvas-wrap canvas', { timeout: 30000 });
  // 钉住画布为 2160×2880 CSS（等于后端像素，1:1 截图），隐藏喇叭按钮。
  await page.addStyleTag({ content: '#canvas-wrap{width:2160px!important;height:2880px!important;margin:0!important;box-shadow:none!important}#sound-toggle{display:none!important}' });
  const canvas = await page.$('#canvas-wrap canvas');

  await page.evaluate(({ S, W, H, TRACK, CLICK_AT, LEAD }) => {
    const el = document.querySelector('#canvas-wrap canvas');
    el.width = 2160; el.height = 2880;
    const ctx = globalThis.drawingContext;

    // ctx.filter 的 blur 半径是否随 CTM 缩放，各浏览器实现不一，先实测再决定是否补偿。
    const probe = document.createElement('canvas'); probe.width = probe.height = 160;
    const g = probe.getContext('2d');
    g.save(); g.scale(2, 2); g.filter = 'blur(8px)'; g.fillStyle = '#fff'; g.fillRect(40, 40, 10, 10); g.restore();
    g.save(); g.filter = 'blur(8px)'; g.fillStyle = '#fff'; g.fillRect(80, 80, 20, 20); g.restore();
    const d = g.getImageData(0, 0, 160, 160).data;
    let minA = 160, minB = 160;
    for (let y = 0; y < 160; y++) for (let x = 0; x < 160; x++) {
      const a = d[(y * 160 + x) * 4 + 3];
      if (a > 16) { if (x < 80 && y > 30 && y < 130) minA = Math.min(minA, x); if (x >= 80) minB = Math.min(minB, x); }
    }
    const filterScales = (80 - minA) > (80 - minB) * 1.5; // 缩放画布的模糊外沿明显更宽 => blur 随 CTM 缩放
    window.__filterScales = filterScales;

    const proto = Object.getPrototypeOf(ctx);
    const sb = Object.getOwnPropertyDescriptor(proto, 'shadowBlur'); // shadowBlur 规范上不随 CTM，统一 ×S 补偿
    Object.defineProperty(ctx, 'shadowBlur', { get() { return sb.get.call(ctx); }, set(v) { sb.set.call(ctx, v * S); } });
    if (!filterScales) {
      const ff = Object.getOwnPropertyDescriptor(proto, 'filter');
      Object.defineProperty(ctx, 'filter', {
        get() { return ff.get.call(ctx); },
        set(v) { ff.set.call(ctx, String(v).replace(/blur\((\d+(?:\.\d+)?)px\)/g, (_, n) => 'blur(' + (parseFloat(n) * S).toFixed(3) + 'px)')); },
      });
    }

    // 颗粒层按 4K 像素密度重建（延续 setup 后的种子随机序列，画面其余部分不受影响）。
    const big = globalThis.createGraphics(Math.round(W * S), Math.round(H * S));
    big.loadPixels();
    for (let i = 0; i < big.pixels.length; i += 4) {
      const value = globalThis.random() < 0.5 ? 255 : 0;
      const alpha = globalThis.random(3, 13);
      big.pixels[i] = value; big.pixels[i + 1] = value; big.pixels[i + 2] = value; big.pixels[i + 3] = alpha;
    }
    big.updatePixels();
    grainLayer = big; // sketch.js 顶层 let，同属全局词法环境可赋值
    drawGrain = function () { globalThis.tint(255, 88); globalThis.image(grainLayer, 0, 0, W, H); globalThis.noTint(); }; // 显式逻辑尺寸，避免用图层自身像素尺寸被再次放大

    // 虚拟配乐 transport：复刻 record-demo.cjs 在第 1 秒点击、+0.12 秒起声的真实时间线。
    window.__vt = null;
    globalThis.cityAudio.transport = () => {
      if (sceneTime < CLICK_AT) return null;
      const t = sceneTime - CLICK_AT - LEAD;
      return t < 0 ? { session: 1, time: -1, duration: TRACK } : { session: 1, time: t, duration: TRACK };
    };

    window.__step = () => {
      window.__vt = globalThis.cityAudio.transport();
      drawingContext.setTransform(S, 0, 0, S, -45 * S, 0);
      window.deltaTime = 1000 / 30; // 30fps 一帧 = 两个 60Hz 固定步
      globalThis.draw();
    };
  }, { S: SCALE, W: 900, H: 1080, TRACK, CLICK_AT, LEAD: SOUND_LEAD });

  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  encoder = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'image2pipe', '-framerate', String(FPS), '-vcodec', 'png', '-i', 'pipe:0',
    '-stream_loop', '-1', '-i', path.join(root, 'assets/jrpg-piano.mp3'),
    '-filter_complex', '[1:a]adelay=1120|1120,afade=t=out:st=' + Math.max(0,TOTAL/FPS-0.6) + ':d=0.6[a]',
    '-map', '0:v', '-map', '[a]', '-vf', 'setsar=1',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-t', String(TOTAL/FPS), '-movflags', '+faststart', output],
    { stdio: ['pipe', 'inherit', 'inherit'] });
  const finished = new Promise((resolve, reject) => {
    encoder.on('error', reject);
    encoder.on('exit', code => code === 0 ? resolve() : reject(new Error('编码失败：' + code)));
  });
  finished.catch(() => {});
  encoder.stdin.on('error', () => {});
  const t0 = Date.now();
  for (let i = 0; i < TOTAL; i++) {
    const data = await page.evaluate(() => {
      window.__step();
      const m = drawingContext.getTransform();
      if (m.a !== m.d || m.b !== 0 || m.c !== 0) throw new Error('画面缩放不一致');
      return document.querySelector('canvas').toDataURL('image/png').split(',')[1];
    });
    if (!encoder.stdin.write(Buffer.from(data, 'base64'))) await once(encoder.stdin, 'drain');
    if (i % 60 === 0 || i === TOTAL - 1) {
      const rate = (i + 1) / ((Date.now() - t0) / 1000);
      console.log(`帧 ${i + 1}/${TOTAL}，${rate.toFixed(1)} 帧/秒，预计剩余 ${((TOTAL - i - 1) / rate / 60).toFixed(1)} 分钟`);
    }
  }
  encoder.stdin.end();
  await finished;
  if (errors.length) throw new Error(errors.join('\n'));
  fs.writeFileSync(output.replace('.mp4', '-验证.json'), JSON.stringify({
    width:2160, height:2880, aspect:'3:4', source:[900,1080], cropEachSide:45,
    scaleX:SCALE, scaleY:SCALE, frames:TOTAL, fps:FPS, duration:TOTAL/FPS,
    audioDelay:1.12, audioLoop:true, pageErrors:errors
  }, null, 2));
  console.log('完成：' + output);
})().catch(e => { console.error(e); if(encoder) encoder.kill(); process.exitCode = 1; })
  .finally(async () => { if(browser) await browser.close(); });
