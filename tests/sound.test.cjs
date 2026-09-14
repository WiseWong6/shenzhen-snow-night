// 检查合成音效的调用、开关和资源回收；不代替浏览器实际试听。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'sound.js'), 'utf8');

test('原创乐谱有完整段落、留白与收束，十字只占少数，速度分层', () => {
  const { score } = loadSound({ withScore: true });
  assert.equal(score.bpm, 72);
  assert.equal(score.bars, 32);
  assert.ok(Math.abs(score.duration - 106.6666667) < 1e-6);
  assert.equal(score.sections.length, 4);
  assert.equal(new Set(score.events.map(note => note.id)).size, score.events.length);
  assert.ok(score.events.every(note => Number.isFinite(note.midi) && note.midi >= 35 && note.midi <= 81 &&
    note.at >= 0 && note.at < score.duration && note.length > 0 && note.velocity > 0 && note.velocity <= 1));
  assert.ok(score.events.every((note, i) => i === 0 || note.at >= score.events[i - 1].at));
  const crosses = score.visuals.filter(note => note.visual.kind === 'cross');
  assert.ok(crosses.length / score.visuals.length < 0.18);
  assert.ok(score.visuals.every((note, i) => note.visual.kind !== 'cross' || score.visuals[i - 1]?.visual.kind !== 'cross'));
  assert.equal(new Set(score.visuals.map(note => note.visual.flight)).size, 3);
  assert.ok(Math.abs(score.visuals[0].midi - score.visuals.at(-1).midi) <= 7, '循环接缝不突然跳跨整个音区');
});

test('开场第一拍直接进入原声钢琴主题，首秒已有旋律且不被音量淡入吞掉', async () => {
  const sound = loadSound({ withScore: true, sampled: true });
  const melody = sound.score.visuals;
  assert.equal(melody[0].at, 0);
  assert.equal(melody[0].voice, 'piano');
  assert.ok(melody[0].velocity >= 0.8);
  assert.ok(melody.filter(note => note.at < 1).length >= 2);
  assert.ok(melody.filter(note => note.at < 3).length >= 4);
  assert.ok(sound.score.events.some(note => note.at < 1 && note.role === 'arpeggio'));
  await sound.click();
  const ctx = sound.instances[0];
  const opening = ctx.nodes.find(node => node.kind === 'source' && node.buffer?.sampledMidi !== undefined &&
    Math.abs(node.buffer.sampledMidi + 12 * Math.log2(node.playbackRate.value) - melody[0].midi) < 1e-8);
  assert.ok(opening && opening.startedAt <= 0.15);
  const fade = ctx.nodes[0].gain.events.at(-1).values;
  const gainAtFirstNote = fade[0] * (1 - Math.exp(-(opening.startedAt - fade[1]) / fade[2]));
  assert.ok(gainAtFirstNote >= fade[0] * 0.95);
});

test('钢琴主奏和低音持续连贯，八音盒只少量回应，不填满每个空隙', () => {
  const { score } = loadSound({ withScore: true });
  const barLength = score.beatSeconds * 4;
  const byBar = bar => score.events.filter(note => Math.floor((note.at + 1e-8) / barLength) === bar);
  for (let bar = 0; bar < 32; bar++) {
    const notes = byBar(bar);
    const lead = notes.filter(note => note.role === 'melody');
    const response = notes.filter(note => note.role === 'response');
    assert.ok(lead.length >= 4 && lead.length <= 5);
    assert.ok(response.length <= 1);
    assert.equal(notes.filter(note => note.role === 'arpeggio').length, 4);
    assert.equal(notes.filter(note => note.role === 'bass').length, 1);
    assert.ok(lead.every(note => note.voice === 'piano' && note.visual));
    assert.ok(notes.filter(note => note.role !== 'melody').every(note => !note.visual));
    assert.ok(response.every(note => note.velocity <= 0.18 && note.velocity < Math.min(...lead.map(note => note.velocity)) * 0.5));
    assert.ok(response.every(note => lead.every(main => Math.abs(main.at - note.at) > 0.1)));
  }
  const pulse = score.visuals.map(note => note.at).concat(score.duration);
  const intervals = pulse.slice(1).map((time, i) => time - pulse[i]);
  assert.ok(Math.max(...intervals) <= score.beatSeconds * 1.5 + 1e-8, '主旋律不突然出现两三拍长的空洞');
  assert.equal(score.events.filter(note => note.role === 'response').length, 16);
  const flights = score.visuals.map(note => note.visual.flight);
  assert.ok(Math.max(...flights) / Math.min(...flights) <= 1.21, '落物不因段落切换突然减速');
  const velocities = score.sections.map(section => section.velocity);
  assert.ok(Math.max(...velocities) / Math.min(...velocities) < 1.1);
});

test('点缀的八音盒触音先收、主体后收，音量轻且不堆叠长嗡声', async () => {
  const sound = loadSound({ withScore: true, sampled: true });
  await sound.click();
  const ctx = sound.instances[0];
  const describeVoice = note => {
    const frequency = 440 * 2 ** ((note.midi - 69) / 12);
    const oscillator = ctx.nodes.find(node => node.kind === 'oscillator' &&
      Math.abs(node.frequency.value - frequency) < 1e-8 && Math.abs(node.startedAt - (0.12 + note.at)) < 1e-8);
    assert.ok(oscillator);
    const envelope = oscillator.connections[0];
    const panner = envelope.connections[0];
    return {
      peak: envelope.gain.events.find(event => event.type === 'linear').values[0],
      send: panner.connections.find(node => node !== ctx.nodes[0]).gain.value,
      sources: ctx.nodes.filter(node => node.kind === 'oscillator' && node.connections[0]?.connections[0] === panner)
        .sort((a, b) => a.frequency.value - b.frequency.value),
    };
  };
  const note = sound.score.events.find(note => note.role === 'response');
  for (let i = 0; i < Math.ceil((note.at + 0.15) / 0.025); i++) sound.tick(0.025);
  const answer = describeVoice(note);
  assert.equal(answer.sources.length, 3);
  const durations = answer.sources.map(node => node.stoppedAt - node.startedAt - 0.03);
  assert.ok(durations[0] >= 1.5 && durations[0] <= 2.21);
  assert.ok(durations[1] < 0.9 && durations[2] < 0.25);
  assert.ok(answer.send > 1);
  assert.ok(answer.peak < 0.072 * 0.18);
});

test('配乐连续两轮严格按谱排音，没有重复窗灯音，声源及时回收', async () => {
  const sound = loadSound({ withScore: true, sampled: true });
  assert.equal(sound.audio.transport(), null);
  assert.equal(sound.instances.length, 0);
  await sound.click();
  const ctx = sound.instances[0];
  assert.equal(sound.label.textContent, '停止配乐');
  assert.equal(sound.caption.hidden, false);
  assert.equal(sound.intervals.size, 1);
  const count = ctx.nodes.length;
  sound.audio.windowLight(0.5, 0.5, 'snowflake');
  assert.equal(ctx.nodes.length, count);
  const duration = sound.score.duration * 2;
  for (let i = 0; i < Math.ceil(duration / 0.025); i++) {
    sound.tick(0.025);
    if (i % 100 === 0) assert.ok(ctx.nodes.filter(node =>
      (node.kind === 'oscillator' || node.kind === 'source') && !node.disconnected).length < 60);
  }
  const expected = [];
  for (let cycle = 0; cycle < 3; cycle++) {
    for (const note of sound.score.events) {
      const at = 0.12 + cycle * sound.score.duration + note.at;
      if (at > ctx.currentTime + 0.18) continue;
      for (let partial = 0; partial < (note.voice === 'piano' ? 1 : 3); partial++) expected.push(at);
    }
  }
  const actual = ctx.nodes.filter(node => node.stoppedAt !== undefined &&
    (node.kind === 'oscillator' || node.buffer?.sampledMidi !== undefined)).map(node => node.startedAt);
  assert.equal(actual.length, expected.length);
  actual.forEach((at, i) => assert.ok(Math.abs(at - expected[i]) < 1e-9));
  await sound.click();
  assert.equal(sound.audio.transport(), null);
  assert.equal(sound.intervals.size, 0);
  assert.equal(sound.caption.hidden, true);
  sound.flushTimers();
  assert.ok(ctx.nodes.filter(node => node.kind === 'panner').every(node => node.disconnected));
  await sound.click();
  assert.equal(sound.audio.transport().session, 2);
  assert.ok(Math.abs(sound.audio.transport().time + 0.12) < 1e-9);
  sound.host.emit('pagehide');
  assert.equal(sound.intervals.size, 0);
});

test('配乐卡顿不补响历史音符，隐藏后停止，输出延迟能校正画面时间', async () => {
  const sound = loadSound({ withScore: true });
  await sound.click();
  const ctx = sound.instances[0];
  sound.tick(30);
  assert.equal(sound.sectionLabel.textContent, '窗灯');
  const newNotes = ctx.nodes.filter(node => node.kind === 'oscillator' && node.startedAt > 0.2);
  assert.ok(newNotes.every(node => node.startedAt >= 30 && node.startedAt <= 30.18));
  sound.context.performance = { now: () => 1000 };
  ctx.getOutputTimestamp = () => ({ contextTime: 29.8, performanceTime: 990 });
  assert.ok(Math.abs(sound.audio.transport().time - 29.69) < 1e-9);
  sound.document.hidden = true;
  sound.document.emit('visibilitychange');
  assert.equal(sound.intervals.size, 0);
  assert.equal(sound.audio.transport(), null);
  sound.flushTimers();
  sound.document.hidden = false;
  sound.document.emit('visibilitychange');
  assert.equal(sound.intervals.size, 0);
});

test('原声钢琴按乐谱时间触发，近邻移调不过量，播放完回收录音声源', async () => {
  const sound = loadSound({ withScore: true, sampled: true });
  await sound.click();
  const ctx = sound.instances[0];
  assert.equal(sound.button.attributes['aria-pressed'], 'true');
  assert.equal(sound.pianoPrepareCalls, 1);
  for (let i = 0; i < 240; i++) sound.tick(0.025);
  const sources = ctx.nodes.filter(node => node.kind === 'source' && node.buffer?.sampledMidi !== undefined);
  const expected = sound.score.events.filter(note => note.voice === 'piano' && 0.12 + note.at <= ctx.currentTime + 0.18);
  assert.equal(sources.length, expected.length);
  sources.forEach((source, i) => {
    const playedMidi = source.buffer.sampledMidi + 12 * Math.log2(source.playbackRate.value);
    assert.ok(Math.abs(playedMidi - expected[i].midi) < 1e-8);
    assert.ok(Math.abs(source.startedAt - 0.12 - expected[i].at) < 1e-8);
    assert.ok(Math.abs(source.buffer.sampledMidi - expected[i].midi) <= 3);
    assert.ok(source.stoppedAt - source.startedAt < 5);
  });
  await sound.click();
  sound.flushTimers();
  assert.ok(sources.every(source => source.disconnected));
});

test('琴音准备期间取消不会突然开播，解码失败可重新尝试', async () => {
  const delayed = loadSound({ withScore: true, sampled: true, deferPiano: true });
  await delayed.click();
  assert.equal(delayed.label.textContent, '准备琴音');
  assert.equal(delayed.audio.transport(), null);
  await delayed.click();
  delayed.flushTimers();
  await delayed.releasePiano();
  assert.equal(delayed.audio.transport(), null);
  assert.equal(delayed.intervals.size, 0);
  assert.equal(delayed.instances[0].state, 'suspended');
  const retry = loadSound({ withScore: true, sampled: true, rejectPianoOnce: true });
  await retry.click();
  assert.equal(retry.label.textContent, '重试声音');
  assert.equal(retry.instances[0].state, 'closed');
  await retry.click();
  assert.equal(retry.button.attributes['aria-pressed'], 'true');
  assert.equal(retry.instances.length, 2);
});

test('配乐默认略微提高音量，滑杆平滑调节且不重启曲子，关闭重开保留音量', async () => {
  const sound = loadSound({ withScore: true });
  assert.equal(sound.volumeControl.hidden, true);
  await sound.click();
  const master = sound.instances[0].nodes[0];
  assert.equal(master.gain.events.at(-1).values[0], 0.5);
  assert.equal(sound.volumeControl.hidden, false);
  const before = sound.audio.transport();
  sound.volumeSlider.value = '68';
  sound.volumeSlider.emit('input');
  assert.equal(sound.volumeLabel.textContent, '68%');
  assert.equal(master.gain.events.at(-1).values[0], 0.68);
  assert.deepEqual(sound.audio.transport(), before);
  assert.equal(sound.intervals.size, 1);
  sound.volumeSlider.value = '0';
  sound.volumeSlider.emit('input');
  assert.equal(master.gain.events.at(-1).values[0], 0);
  assert.ok(sound.audio.transport());
  sound.volumeSlider.value = '68';
  sound.volumeSlider.emit('input');
  await sound.click();
  assert.equal(sound.volumeControl.hidden, true);
  sound.flushTimers();
  await sound.click();
  assert.equal(master.gain.events.at(-1).values[0], 0.68);
  assert.equal(sound.volumeControl.emit('mousedown').stopped, true);
  assert.equal(sound.volumeControl.emit('touchstart').stopped, true);
});

function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(name, callback) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(callback);
    },
    emit(name) {
      const event = { stopped: false, stopPropagation() { this.stopped = true; } };
      for (const callback of listeners.get(name) || []) callback(event);
      return event;
    },
  };
}

function loadSound(options = {}) {
  const instances = [];
  const timers = new Map();
  const intervals = new Map();
  let timerId = 0;
  let releaseResume;
  let releasePiano;
  let pianoPrepareCalls = 0;
  const parameter = (value = 0) => ({
    value, events: [],
    record(type, values) {
      assert.ok(values.every(Number.isFinite), '声音参数必须为有限数值');
      this.events.push({ type, values });
    },
    cancelScheduledValues(...values) { this.record('cancel', values); },
    setValueAtTime(...values) { this.record('set', values); this.value = values[0]; },
    setTargetAtTime(...values) { this.record('target', values); },
    linearRampToValueAtTime(...values) { this.record('linear', values); },
    exponentialRampToValueAtTime(...values) {
      assert.ok(values[0] > 0, '指数淡出不能以零为终点');
      this.record('exponential', values);
    },
  });
  class AudioContext {
    constructor() {
      this.state = 'suspended';
      this.currentTime = 0;
      this.sampleRate = 16000;
      this.destination = {};
      this.nodes = [];
      this.resumeCalls = 0;
      this.suspendCalls = 0;
      this.closeCalls = 0;
      instances.push(this);
    }
    node(kind) {
      const node = {
        kind, connections: [], disconnected: false,
        connect(other) { this.connections.push(other); return other; },
        disconnect() { this.disconnected = true; this.connections = []; },
        start(time = 0) { assert.ok(Number.isFinite(time)); this.startedAt = time; },
        stop(time = 0) { assert.ok(Number.isFinite(time)); this.stoppedAt = time; },
      };
      for (const name of ['gain', 'frequency', 'playbackRate', 'Q', 'threshold', 'knee', 'ratio', 'attack', 'release']) {
        node[name] = parameter(name === 'gain' ? 1 : 0);
      }
      if (kind === 'panner') node.pan = parameter();
      this.nodes.push(node);
      return node;
    }
    createGain() { return this.node('gain'); }
    createDynamicsCompressor() { return this.node('compressor'); }
    createBufferSource() { return this.node('source'); }
    createBiquadFilter() { return this.node('filter'); }
    createConvolver() { return this.node('convolver'); }
    createOscillator() { return this.node('oscillator'); }
    createStereoPanner() { return this.node('panner'); }
    createBuffer(channels, length, rate) {
      assert.ok(channels > 0 && length > 0 && rate > 0);
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { getChannelData: index => data[index], data };
    }
    async resume() {
      this.resumeCalls++;
      if (options.rejectOnce) {
        options.rejectOnce = false;
        throw new Error('模拟浏览器拒绝播放');
      }
      if (options.deferOnce) {
        options.deferOnce = false;
        await new Promise(resolve => { releaseResume = resolve; });
      }
      this.state = 'running';
    }
    async suspend() { this.suspendCalls++; this.state = 'suspended'; }
    async close() { this.closeCalls++; this.state = 'closed'; }
    advance(seconds) {
      this.currentTime += seconds;
      for (const node of this.nodes) {
        if (node.stoppedAt !== undefined && node.stoppedAt <= this.currentTime && !node.ended) {
          node.ended = true;
          node.onended?.();
        }
      }
    }
  }
  if (options.noPanner) AudioContext.prototype.createStereoPanner = undefined;
  const button = Object.assign(eventTarget(), {
    attributes: {}, disabled: false,
    setAttribute(name, value) { this.attributes[name] = value; },
  });
  const label = { textContent: '开启声音' };
  const caption = { hidden: true };
  const sectionLabel = { textContent: '初雪' };
  const volumeControl = Object.assign(eventTarget(), { hidden: true });
  const volumeSlider = Object.assign(eventTarget(), { value: '50' });
  const volumeLabel = { textContent: '50%' };
  const document = Object.assign(eventTarget(), {
    hidden: false,
    getElementById: id => ({ 'sound-toggle': button, 'sound-label': label,
      'music-caption': caption, 'music-section': sectionLabel, 'volume-control': volumeControl,
      'music-volume': volumeSlider, 'volume-value': volumeLabel })[id],
  });
  const host = eventTarget();
  const context = vm.createContext({
    document, ...host,
    AudioContext: options.unsupported ? undefined : AudioContext,
    setTimeout(callback) { const id = ++timerId; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); },
    setInterval(callback) { const id = ++timerId; intervals.set(id, callback); return id; },
    clearInterval(id) { intervals.delete(id); },
  });
  if (options.withScore) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'score.js'), 'utf8'), context);
  if (options.sampled) context.cityPiano = {
    async prepare() {
      pianoPrepareCalls++;
      if (options.deferPiano) {
        options.deferPiano = false;
        await new Promise(resolve => { releasePiano = resolve; });
      }
      if (options.rejectPianoOnce) {
        options.rejectPianoOnce = false;
        throw new Error('模拟钢琴采样解码失败');
      }
      return [42, 45, 48, 54, 60, 66, 72, 78, 81].map(midi => ({ midi, peak: 0.4,
        buffer: { duration: 6, sampledMidi: midi } }));
    },
  };
  vm.runInContext(source, context);
  return {
    button, label, document, host, instances, caption, sectionLabel, intervals, context,
    volumeControl, volumeSlider, volumeLabel,
    score: context.cityScore, audio: context.cityAudio,
    get pianoPrepareCalls() { return pianoPrepareCalls; },
    async click() { button.emit('click'); await new Promise(resolve => setImmediate(resolve)); },
    flushTimers() { for (const callback of timers.values()) callback(); timers.clear(); },
    tick(seconds) { instances[0].advance(seconds); for (const callback of intervals.values()) callback(); },
    async releaseResume() { releaseResume(); await new Promise(resolve => setImmediate(resolve)); },
    async releasePiano() { releasePiano(); await new Promise(resolve => setImmediate(resolve)); },
  };
}

test('默认静音，点击后才创建声音；反复开关复用环境声，不堆叠循环', async () => {
  const sound = loadSound();
  sound.audio.windowLight(0.5, 0.5, 'snowflake');
  assert.equal(sound.instances.length, 0);
  await sound.click();
  const ctx = sound.instances[0];
  assert.equal(sound.label.textContent, '声音已开');
  assert.equal(sound.button.attributes['aria-pressed'], 'true');
  assert.equal(ctx.state, 'running');
  assert.equal(ctx.nodes[0].gain.events.at(-1).values[0], 0.42);
  await sound.click();
  assert.equal(sound.button.attributes['aria-pressed'], 'false');
  assert.equal(ctx.nodes[0].gain.events.at(-1).values[0], 0);
  sound.flushTimers();
  assert.equal(ctx.state, 'suspended');
  await sound.click();
  assert.equal(sound.instances.length, 1);
  assert.equal(ctx.nodes.filter(node => node.kind === 'source' && node.loop).length, 1);
  assert.equal(sound.button.emit('mousedown').stopped, true);
  assert.equal(sound.button.emit('touchstart').stopped, true);
});

test('窗灯音色跟随左右落点，密集触发受限，播放结束后回收声源', async () => {
  const sound = loadSound();
  await sound.click();
  const ctx = sound.instances[0];
  const baseline = ctx.nodes.length;
  sound.audio.windowLight(0, 0.25, 'cross');
  const firstCount = ctx.nodes.length;
  sound.audio.windowLight(1, 0.5, 'snowflake');
  assert.equal(ctx.nodes.length, firstCount);
  ctx.advance(0.25);
  sound.audio.windowLight(1, 0.5, 'snowflake');
  const pans = ctx.nodes.filter(node => node.kind === 'panner');
  assert.equal(pans[0].pan.value, -0.65);
  assert.equal(pans[1].pan.value, 0.65);
  for (let i = 0; i < 5; i++) {
    ctx.advance(0.21);
    sound.audio.windowLight(0.5, 0.4, 'snowflake');
  }
  assert.equal(ctx.nodes.filter(node => node.kind === 'panner').length, 6);
  ctx.advance(4);
  assert.ok(ctx.nodes.slice(baseline).every(node => node.disconnected));
  sound.audio.windowLight(0.5, 0.5, 'snowflake');
  assert.equal(ctx.nodes.filter(node => node.kind === 'panner').length, 7);
});

test('流星进画后才发声，掠响从右移到左并自动结束', async () => {
  const sound = loadSound();
  await sound.click();
  const ctx = sound.instances[0];
  ctx.currentTime = 10;
  sound.audio.meteor({ duration: 2.5, entry: 0.14, exit: 0.84 });
  const source = ctx.nodes.filter(node => node.kind === 'source' && !node.loop)[0];
  assert.equal(source.startedAt, 10.35);
  assert.ok(source.stoppedAt > 12 && source.stoppedAt < 12.3);
  const pan = ctx.nodes.find(node => node.kind === 'panner').pan;
  assert.equal(pan.events[0].values[0], 0.7);
  assert.equal(pan.events[1].values[0], -0.7);
  ctx.advance(3);
  assert.equal(source.disconnected, true);
});

test('隐藏页面自动静音且不补播事件，退出页面释放声音连接', async () => {
  const sound = loadSound();
  await sound.click();
  const ctx = sound.instances[0];
  sound.audio.windowLight(0.5, 0.5, 'cross');
  sound.document.hidden = true;
  sound.document.emit('visibilitychange');
  sound.flushTimers();
  const count = ctx.nodes.length;
  sound.audio.windowLight(0.5, 0.5, 'cross');
  assert.equal(ctx.nodes.length, count);
  assert.equal(ctx.state, 'suspended');
  sound.document.hidden = false;
  sound.document.emit('visibilitychange');
  assert.equal(sound.button.attributes['aria-pressed'], 'false');
  sound.host.emit('pagehide');
  assert.equal(ctx.state, 'closed');
});

test('启动尚未完成时关闭，不会在稍后突然播放', async () => {
  const sound = loadSound({ deferOnce: true });
  await sound.click();
  assert.equal(sound.label.textContent, '正在开启');
  await sound.click();
  sound.flushTimers();
  await sound.releaseResume();
  assert.equal(sound.instances[0].state, 'suspended');
  assert.equal(sound.button.attributes['aria-pressed'], 'false');
});

test('不支持音频时不影响页面，启动失败可以重新尝试', async () => {
  const unsupported = loadSound({ unsupported: true });
  assert.equal(unsupported.button.disabled, true);
  assert.equal(unsupported.label.textContent, '声音不可用');
  unsupported.audio.windowLight(0.5, 0.5, 'cross');
  const sound = loadSound({ rejectOnce: true });
  await sound.click();
  assert.equal(sound.label.textContent, '重试声音');
  assert.equal(sound.instances[0].state, 'closed');
  await sound.click();
  assert.equal(sound.instances.length, 2);
  assert.equal(sound.label.textContent, '声音已开');
});

test('没有左右声像功能时仍可播放，生成的环境声没有硬切接缝', async () => {
  const sound = loadSound({ noPanner: true });
  await sound.click();
  sound.audio.windowLight(0.2, 0.3, 'snowflake');
  sound.audio.meteor({ duration: 2.5, entry: 0.14, exit: 0.84 });
  const ctx = sound.instances[0];
  const wind = ctx.nodes.find(node => node.kind === 'source' && node.loop);
  const samples = wind.buffer.data[0];
  assert.equal(Math.abs(samples[0]), 0);
  assert.equal(Math.abs(samples.at(-1)), 0);
  assert.ok(samples.some(value => value !== 0));
  assert.ok(samples.every(value => Number.isFinite(value) && Math.abs(value) <= 1));
});

test('风声独立降低并减小起伏，不改变配乐默认音量', async () => {
  const sound = loadSound({ withScore: true });
  await sound.click();
  const ctx = sound.instances[0];
  const wind = ctx.nodes.find(node => node.kind === 'source' && node.loop);
  const breath = wind.connections[0].connections[0].connections[0];
  const drift = ctx.nodes.find(node => node.kind === 'oscillator' && node.frequency.value === 0.055);
  const driftAmount = drift.connections[0];
  assert.equal(breath.gain.value, 0.032);
  assert.equal(driftAmount.gain.value, 0.006);
  assert.equal(driftAmount.connections[0], breath.gain);
  assert.ok(breath.gain.value - driftAmount.gain.value > 0);
  assert.ok(breath.gain.value + driftAmount.gain.value < 0.04);
  assert.equal(ctx.nodes[0].gain.events.at(-1).values[0], 0.5);
});
