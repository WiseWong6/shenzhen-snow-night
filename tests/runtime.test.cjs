const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
function events() {
  const listeners = new Map();
  return { addEventListener(name, fn) { listeners.set(name, (listeners.get(name) || []).concat(fn)); },
    emit(name, event = {}) { (listeners.get(name) || []).forEach(fn => fn(event)); } };
}
function loadPage() {
  const frames = new Map(), canvases = [], children = [];
  let frameId = 0, calls = 0;
  const numeric = (...values) => {
    for (const value of values) if (typeof value === 'number') assert.ok(Number.isFinite(value));
    calls++;
  };
  const makeContext = () => {
    const ctx = { globalAlpha: 1, shadowBlur: 0, shadowColor: 'transparent', lineWidth: 1,
      globalCompositeOperation: 'source-over', fillStyle: '#fff', strokeStyle: '#000', lineCap: 'round' };
    const stack = [];
    const keys = Object.keys(ctx);
    Object.assign(ctx, {
      save() { stack.push(keys.map(key => ctx[key])); },
      restore() { assert.ok(stack.length); const saved = stack.pop(); keys.forEach((key,i) => { ctx[key] = saved[i]; }); },
      createImageData(w,h) { return {data:new Uint8ClampedArray(w*h*4)}; },
      createLinearGradient(...args) { numeric(...args); return {addColorStop:numeric}; },
      createRadialGradient(...args) { numeric(...args); return {addColorStop:numeric}; },
    });
    ['setTransform','beginPath','closePath','moveTo','lineTo','quadraticCurveTo','rect','arc','fill','stroke','clip',
      'fillRect','drawImage','putImageData','translate','rotate','scale'].forEach(key => { ctx[key] = numeric; });
    return ctx;
  };
  const wrap = { appendChild(node) { children.push(node); } };
  const button = Object.assign(events(), {setAttribute() {}});
  const document = Object.assign(events(), {hidden:false,
    getElementById: id => id === 'canvas-wrap' ? wrap : id === 'sound-toggle' ? button : null,
    createElement(tag) {
      if (tag !== 'canvas') return {style:{},textContent:''};
      const ctx = makeContext();
      const canvas = Object.assign(events(), {getContext:()=>ctx,
        getBoundingClientRect:()=>({left:10,top:20,width:450,height:540})});
      canvases.push(canvas); return canvas;
    } });
  const host = events();
  const sandbox = {document, ...host, atob, PointerEvent: function(){},
    requestAnimationFrame(fn) { frames.set(++frameId,fn); return frameId; },
    cancelAnimationFrame(id) { frames.delete(id); },
  };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
  const scripts = [...html.matchAll(/<script src="\.\/([^"]+)"/g)].map(match=>match[1]);
  scripts.forEach(file=>vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context));
  document.emit('DOMContentLoaded');
  assert.equal(children.filter(node=>node.textContent).length,0,'初始化不进入报错降级');
  return {context,canvases,document,host,frames,children,
    get calls(){return calls;},
    frame(time) { const [id,fn] = frames.entries().next().value; frames.delete(id); fn(time); },
    run:code=>vm.runInContext(code,context)};
}

test('按真实页面加载顺序初始化并绘制，二维本地能力足够，无缺失函数',()=>{
  const page = loadPage();
  assert.equal(page.canvases.length,3);
  assert.equal(page.children.length,1);
  assert.equal(page.canvases[0].width,900);
  assert.equal(page.canvases[0].height,1080);
  for(let i=0;i<180;i++) page.frame(i*1000/60);
  assert.ok(page.calls>10000);
  assert.equal(page.frames.size,1);
  assert.ok(page.run('sceneTime')>2.8);
  assert.ok(page.run('windows.length')>100);
});

test('后台停止绘图，回到前台不补算隐藏期间；触摸按显示比例换算坐标',()=>{
  const page = loadPage(); page.frame(0); page.frame(17);
  page.document.hidden = true; page.document.emit('visibilitychange');
  assert.equal(page.frames.size,0);
  const before = page.run('sceneTime');
  page.document.hidden = false; page.document.emit('visibilitychange'); page.frame(300000);
  assert.ok(page.run('sceneTime')-before<.02);
  page.canvases[0].emit('pointerdown',{clientX:235,clientY:290,target:{}});
  assert.equal(page.context.mouseX,450); assert.equal(page.context.mouseY,540);
  page.host.emit('pagehide'); assert.equal(page.frames.size,0);
  page.host.emit('pageshow'); assert.equal(page.frames.size,1);
});

test('噪声和随机数固定种子可重现，绘图状态与透明度恢复',()=>{
  const page=loadPage();
  page.run('randomSeed(24); noiseSeed(24);');
  const first=page.run('[random(),noise(.1,.3,.7),noise(1.2,3.4,.2)]');
  page.run('randomSeed(24); noiseSeed(24);');
  assert.deepEqual(page.run('[random(),noise(.1,.3,.7),noise(1.2,3.4,.2)]'),first);
  page.run('push(); noFill(); noStroke(); tint(255,22); drawingContext.globalAlpha=.2; pop();');
  assert.equal(page.context.drawingContext.globalAlpha,1);
});
