// 模拟声音时钟与按钮，不代替真机试听。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
function eventTarget() {
  const events = new Map();
  return {
    addEventListener(name, callback) {
      if (!events.has(name)) events.set(name, []);
      events.get(name).push(callback);
    },
    emit(name) {
      const event = { stopped: false, stopPropagation() { this.stopped = true; } };
      (events.get(name) || []).forEach(callback => callback(event));
      return event;
    },
  };
}
function loadSound(options = {}) {
  const instances = [], timers = new Map();
  let timerId = 0, decodeCalls = 0, releaseResume, releaseDecode;
  const parameter = (value = 0) => ({
    value, events: [],
    cancelScheduledValues() {},
    setValueAtTime(value) { this.value = value; },
    setTargetAtTime(...values) { assert.ok(values.every(Number.isFinite)); this.events.push(values); },
  });
  class AudioContext {
    constructor() { this.state = 'suspended'; this.currentTime = 0; this.nodes = []; this.destination = {}; instances.push(this); }
    node(kind) {
      const node = { kind, connections: [], disconnected: false,
        connect(other) { this.connections.push(other); },
        disconnect() { this.disconnected = true; },
        start(time) { this.startedAt = time; }, stop(time = 0) { this.stoppedAt = time; } };
      for (const key of ['gain','threshold','knee','ratio','attack','release']) node[key] = parameter();
      this.nodes.push(node); return node;
    }
    createGain() { return this.node('gain'); }
    createDynamicsCompressor() { return this.node('compressor'); }
    createBufferSource() { return this.node('source'); }
    async resume() {
      if (options.deferResume) { options.deferResume = false; await new Promise(resolve => { releaseResume = resolve; }); }
      if (options.rejectResume) { options.rejectResume = false; throw new Error('拒绝启动'); }
      this.state = 'running';
    }
    async suspend() { this.state = 'suspended'; }
    async close() { this.state = 'closed'; }
    async decodeAudioData(bytes) {
      decodeCalls++;
      assert.equal(bytes.byteLength, 501990);
      if (options.deferDecode) { options.deferDecode = false; await new Promise(resolve => { releaseDecode = resolve; }); }
      if (options.rejectDecode) { options.rejectDecode = false; throw new Error('解码失败'); }
      return { duration: options.short ? 1 : context.cityScore.duration + (options.padding || 0) };
    }
  }
  const button = Object.assign(eventTarget(), { attributes: {},
    setAttribute(key, value) { this.attributes[key] = value; } });
  const document = Object.assign(eventTarget(), { hidden: false,
    getElementById: id => id === 'sound-toggle' ? button : null });
  const host = eventTarget();
  const context = vm.createContext({ document, ...host, atob,
    AudioContext: options.unsupported ? undefined : AudioContext,
    setTimeout(callback) { timers.set(++timerId, callback); return timerId; },
    clearTimeout(id) { timers.delete(id); },
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'assets/jrpg-track.js'), 'utf8'), context);
  if (options.missing) context.cityMusicTrack = null;
  vm.runInContext(fs.readFileSync(path.join(root, 'sound.js'), 'utf8'), context);
  const settle = () => new Promise(resolve => setImmediate(resolve));
  return { button, document, host, instances, context, audio: context.cityAudio,
    get decodeCalls() { return decodeCalls; },
    async click() { button.emit('click'); await settle(); },
    flush() { const pending = [...timers.values()]; timers.clear(); pending.forEach(callback => callback()); },
    async releaseResume() { releaseResume(); await settle(); },
    async releaseDecode() { releaseDecode(); await settle(); },
  };
}

test('默认静音，只创建一条原曲循环；图标两态且不需要文案和滑杆', async () => {
  const sound = loadSound();
  assert.equal(sound.instances.length, 0);
  assert.equal(sound.audio.transport(), null);
  await sound.click();
  const ctx = sound.instances[0];
  const track = ctx.nodes.find(node => node.kind === 'source');
  assert.equal(sound.button.attributes['aria-pressed'], 'true');
  assert.equal(sound.button.attributes['aria-label'], '关闭配乐');
  assert.equal(track.startedAt, .12);
  assert.equal(track.loop, true);
  assert.equal(track.loopEnd, track.buffer.duration);
  assert.equal(ctx.nodes[0].gain.events.at(-1)[0], .5);
  assert.equal(ctx.nodes.length, 3, '没有环境声、混响或隐藏声部');
  sound.audio.windowLight(.5,.5,'snowflake'); sound.audio.meteor({});
  assert.equal(ctx.nodes.length, 3);
  for (const event of ['pointerdown','mousedown','touchstart']) assert.ok(sound.button.emit(event).stopped);
  const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert.doesNotMatch(html, /music-caption|sound-label|music-volume|volume-control|JRPG Piano/);
  assert.match(html, /class="sound-on"/); assert.match(html, /class="sound-off"/);
});

test('停止与重开复用解码，不叠加声音，百轮循环使用实际时长', async () => {
  const sound = loadSound({ padding: .025 });
  await sound.click();
  const ctx = sound.instances[0];
  const first = ctx.nodes.find(node => node.kind === 'source');
  ctx.currentTime = first.buffer.duration * 100 + .12;
  assert.equal(sound.audio.transport().duration, first.buffer.duration);
  assert.ok(Math.abs(sound.audio.transport().time - first.buffer.duration * 100) < 1e-8);
  await sound.click(); sound.flush();
  assert.equal(sound.button.attributes['aria-pressed'],'false');
  assert.equal(sound.audio.transport(),null); assert.ok(first.disconnected);
  assert.equal(ctx.state,'suspended');
  await sound.click();
  assert.equal(sound.decodeCalls,1); assert.equal(sound.audio.transport().session,2);
  assert.equal(ctx.nodes.filter(node => node.kind === 'source' && !node.disconnected).length,1);
});

test('慢启动取消后保持静音，不留下运行中的声音上下文', async () => {
  const sound = loadSound({ deferResume:true });
  await sound.click(); await sound.click(); sound.flush(); await sound.releaseResume();
  assert.equal(sound.instances[0].state,'suspended');
  assert.equal(sound.audio.transport(),null);
});

test('解码期间反复开关共用准备过程，只保留最后一次操作', async () => {
  const sound = loadSound({ deferDecode:true });
  await sound.click(); await sound.click(); await sound.click(); await sound.releaseDecode();
  assert.equal(sound.decodeCalls,1);
  assert.equal(sound.button.attributes['aria-pressed'],'true');
  assert.equal(sound.instances[0].nodes.filter(node => node.kind === 'source').length,1);
});

test('解码取消不会迟到开播，随后可直接重开', async () => {
  const sound = loadSound({ deferDecode:true });
  await sound.click(); await sound.click(); sound.flush(); await sound.releaseDecode();
  assert.equal(sound.audio.transport(),null);
  assert.equal(sound.instances[0].state,'suspended');
  await sound.click(); assert.equal(sound.decodeCalls,1); assert.ok(sound.audio.transport());
});

test('后台静音，退出销毁，回来仍由用户开启', async () => {
  const sound = loadSound(); await sound.click();
  const ctx = sound.instances[0];
  sound.document.hidden = true; sound.document.emit('visibilitychange'); sound.flush();
  assert.equal(ctx.state,'suspended'); assert.equal(sound.audio.transport(),null);
  sound.document.hidden = false; sound.document.emit('visibilitychange');
  assert.equal(sound.button.attributes['aria-pressed'],'false');
  sound.host.emit('pagehide'); assert.equal(ctx.state,'closed');
  await sound.click(); assert.equal(sound.instances.length,2); assert.ok(sound.audio.transport());
});

test('音频启动或解码失败可重试，资源错误不偷偷换曲', async () => {
  for (const key of ['rejectResume','rejectDecode']) {
    const sound = loadSound({ [key]:true }); await sound.click();
    assert.equal(sound.button.attributes['aria-pressed'],'false');
    assert.match(sound.button.attributes['aria-label'],/重试/);
    assert.equal(sound.instances[0].state,'closed');
    await sound.click(); assert.ok(sound.audio.transport());
  }
  for (const key of ['missing','short']) {
    const sound = loadSound({ [key]:true }); await sound.click();
    assert.equal(sound.audio.transport(),null);
    assert.equal(sound.instances[0].nodes.filter(node => node.kind === 'source').length,0);
  }
  const unsupported = loadSound({unsupported:true});
  assert.equal(unsupported.button.disabled,true); assert.equal(unsupported.instances.length,0);
});

test('实际输出时钟校正有界，旧浏览器无接口仍可播放', async () => {
  const sound = loadSound(); await sound.click();
  const ctx = sound.instances[0]; ctx.currentTime = 30;
  assert.equal(sound.audio.transport().time,29.88);
  sound.context.performance = {now:()=>1000};
  ctx.getOutputTimestamp = () => ({contextTime:29.8,performanceTime:990});
  assert.ok(Math.abs(sound.audio.transport().time-29.69)<1e-9);
});
