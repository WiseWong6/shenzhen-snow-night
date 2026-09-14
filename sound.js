// 钢琴使用随页面打包的录音单音，八音盒与环境声原生合成；不访问麦克风。
// 交互启动与平滑音量控制参考：
// https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices
(() => {
  const button = document.getElementById("sound-toggle");
  const label = document.getElementById("sound-label");
  if (!button || !label) return;
  const score = globalThis.cityScore;
  const caption = document.getElementById("music-caption");
  const sectionLabel = document.getElementById("music-section");
  const volumeControl = document.getElementById("volume-control");
  const volumeSlider = document.getElementById("music-volume");
  const volumeLabel = document.getElementById("volume-value");
  const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
  const voices = new Set();
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  let context = null;
  let master = null;
  let reverb = null;
  let noiseBuffer = null;
  let enabled = false;
  let wanted = false;
  let revision = 0;
  let suspendTimer = null;
  let lastChimeAt = -Infinity;
  let songStartedAt = null;
  let musicSession = 0;
  let scoreIndex = 0;
  let scoreCycle = 0;
  let musicTimer = null;
  let musicVolume = 0.5;
  let pianoSamples = [];

  function updateButton(message) {
    label.textContent = message || (score
      ? (enabled ? "停止配乐" : "播放配乐")
      : (enabled ? "声音已开" : "开启声音"));
    button.setAttribute("aria-pressed", String(enabled));
    button.setAttribute("aria-label", score ? (wanted ? "停止配乐" : "播放配乐") : (wanted ? "关闭声音" : "开启声音"));
    if (caption && score) caption.hidden = !enabled;
    if (volumeControl && score) volumeControl.hidden = !enabled;
  }

  function smoothGain(value, seconds) {
    if (!context || !master || context.state === "closed") return;
    const now = context.currentTime;
    const current = master.gain.value;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(current, now);
    master.gain.setTargetAtTime(value, now, seconds);
  }

  function createNoise(seconds, channels = 1, decay = false) {
    const length = Math.ceil(context.sampleRate * seconds);
    const buffer = context.createBuffer(channels, length, context.sampleRate);
    // 独立的随机序列，开关声音不改变画面的落点和节奏。
    let seed = 7319;
    for (let channel = 0; channel < channels; channel++) {
      const data = buffer.getChannelData(channel);
      let previous = 0;
      for (let i = 0; i < length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const white = seed / 2147483648 - 1;
        previous = previous * 0.68 + white * 0.32;
        const envelope = decay ? Math.exp(-i / length * 7) * Math.min(1, i / 160) : 1;
        data[i] = previous * envelope;
      }
      // 接缝缓慢归零，循环环境声没有硬切和爆音。
      const edge = Math.min(Math.floor(context.sampleRate * 0.04), Math.floor(length / 2));
      for (let i = 0; i < edge; i++) {
        const fade = 0.5 - 0.5 * Math.cos(Math.PI * i / edge);
        data[i] *= fade;
        data[length - 1 - i] *= fade;
      }
    }
    return buffer;
  }

  function initialize() {
    if (context && context.state !== "closed") return;
    context = new AudioContext();
    pianoSamples = [];
    master = context.createGain();
    master.gain.value = 0;
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -16;
    limiter.knee.value = 12;
    limiter.ratio.value = 4;
    limiter.attack.value = 0.01;
    limiter.release.value = 0.25;
    master.connect(limiter);
    limiter.connect(context.destination);

    noiseBuffer = createNoise(8);
    reverb = context.createConvolver();
    reverb.buffer = createNoise(1.8, 2, true);
    const wet = context.createGain();
    wet.gain.value = 0.16;
    reverb.connect(wet);
    wet.connect(master);

    const wind = context.createBufferSource();
    wind.buffer = noiseBuffer;
    wind.loop = true;
    const highpass = context.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 180;
    const lowpass = context.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 1150;
    lowpass.Q.value = 0.5;
    const breath = context.createGain();
    // 风声只作背景衬托，降低底声和起伏，不改变配乐音量。
    breath.gain.value = 0.032;
    const drift = context.createOscillator();
    drift.frequency.value = 0.055;
    const driftAmount = context.createGain();
    driftAmount.gain.value = 0.006;
    wind.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(breath);
    breath.connect(master);
    drift.connect(driftAmount);
    driftAmount.connect(breath.gain);
    wind.start();
    drift.start();
    lastChimeAt = -Infinity;
  }

  function makePanner(position) {
    // 不支持左右声像的旧浏览器仍可播放，不影响动画。
    const panner = context.createStereoPanner ? context.createStereoPanner() : context.createGain();
    if (panner.pan) panner.pan.value = clamp(position, -0.7, 0.7);
    panner.connect(master);
    return panner;
  }

  function trackVoice(sources, nodes) {
    let remaining = sources.length;
    const voice = {
      dispose(stop = false) {
        if (!voices.delete(voice)) return;
        sources.forEach(source => {
          source.onended = null;
          if (stop) {
            try { source.stop(); } catch { /* 已结束的声源无需再次停止。 */ }
          }
        });
        nodes.forEach(node => node.disconnect());
      },
    };
    voices.add(voice);
    sources.forEach(source => {
      source.onended = () => { if (--remaining === 0) voice.dispose(); };
    });
  }

  function stopVoices() {
    for (const voice of [...voices]) voice.dispose(true);
  }

  function canPlay() {
    return enabled && !document.hidden && context?.state === "running" && voices.size < (score ? 32 : 6);
  }

  function windowLight(x, y, kind) {
    // 配乐模式的落点已经写进旋律，不再叠加另一套随机音符。
    if (score && songStartedAt !== null) return;
    if (!canPlay()) return;
    const now = context.currentTime;
    if (now - lastChimeAt < 0.2) return;
    lastChimeAt = now;
    const notes = [261.63, 293.66, 329.63, 392, 440, 523.25];
    const pitch = notes[Math.round((1 - clamp(y, 0, 1)) * (notes.length - 1))];
    const panner = makePanner((clamp(x, 0, 1) * 2 - 1) * 0.65);
    panner.connect(reverb);
    const partials = kind === "cross" ? [1, 2, 3] : [1, 2.002, 3.004];
    const sources = [];
    const nodes = [panner];
    partials.forEach((ratio, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.value = pitch * ratio;
      const envelope = context.createGain();
      const duration = [2.25, 1.35, 0.8][index];
      envelope.gain.setValueAtTime(0, now);
      envelope.gain.linearRampToValueAtTime([0.09, 0.023, 0.006][index], now + 0.055);
      envelope.gain.exponentialRampToValueAtTime(0.00001, now + duration);
      oscillator.connect(envelope);
      envelope.connect(panner);
      sources.push(oscillator);
      nodes.push(oscillator, envelope);
      oscillator.start(now);
      oscillator.stop(now + duration + 0.05);
    });
    trackVoice(sources, nodes);
  }

  function playScoreNote(note, at) {
    if (!canPlay()) return;
    if (note.voice === "piano" && pianoSamples.length) {
      playPianoSample(note, at);
      return;
    }
    const bell = note.voice === "musicbox";
    const response = note.role === "response";
    const bass = note.role === "bass";
    const frequency = 440 * 2 ** ((note.midi - 69) / 12);
    const panner = makePanner(note.pan);
    // 主旋律靠前、回应稍远；只改变空间比例，不添加延迟的重复音符。
    const reverbSend = context.createGain();
    reverbSend.gain.value = bell ? (response ? 1.15 : 0.38) : (bass ? 0.2 : 0.65);
    panner.connect(reverbSend);
    reverbSend.connect(reverb);
    const sources = [];
    const nodes = [panner, reverbSend];
    // 八音盒的三层分别是温润主体、簧片质感、短促触音。
    // 高频先退去，主体也有明确收尾，长音不会变成持续的嗡声。
    const ratios = bell ? [1, 2.004, 4.008] : [1, 2.002, 3.006, 4.012];
    const levels = bell ? [0.072, 0.02, 0.0048] : [0.096, 0.025, 0.007, 0.002];
    // 回应的轻重主要由乐谱力度决定，此处只轻收一点，不重复大幅压低。
    const voiceLevel = response ? 0.9 : bass ? 0.9 : 1;
    const bodyDuration = bell
      ? clamp(note.length * 0.35 + 1.2, 1.7, 2.45) * (response ? 0.9 : 1)
      : clamp(note.length + (bass ? 0.7 : 0.5), 0.95, bass ? 3.2 : 2.4);
    ratios.forEach((ratio, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency * ratio;
      const envelope = context.createGain();
      // 越高的音区越收敛触音，避免八音盒高音刺耳。
      const trebleSoftening = index === 0 ? 1 : clamp(1 - (note.midi - 76) * 0.035, 0.55, 1);
      const peak = levels[index] * note.velocity * voiceLevel * trebleSoftening;
      const attack = bell ? [0.009, 0.006, 0.004][index] : (bass ? 0.018 : 0.011);
      const duration = bell
        ? [bodyDuration, 0.82, 0.23][index]
        : bodyDuration / (1 + index * 0.7);
      const shoulder = bell ? [0.13, 0.075, 0.035][index] : Math.min(0.2, duration * 0.2);
      const shoulderLevel = bell ? [0.62, 0.36, 0.18][index] : (bass ? 0.48 : 0.42);
      envelope.gain.setValueAtTime(0, at);
      envelope.gain.linearRampToValueAtTime(peak, at + attack);
      envelope.gain.exponentialRampToValueAtTime(peak * shoulderLevel, at + shoulder);
      envelope.gain.exponentialRampToValueAtTime(0.00001, at + duration);
      oscillator.connect(envelope);
      envelope.connect(panner);
      sources.push(oscillator);
      nodes.push(oscillator, envelope);
      oscillator.start(at);
      oscillator.stop(at + duration + 0.03);
    });
    trackVoice(sources, nodes);
  }

  function playPianoSample(note, at) {
    const sample = pianoSamples.reduce((nearest, candidate) =>
      Math.abs(candidate.midi - note.midi) < Math.abs(nearest.midi - note.midi) ? candidate : nearest);
    const source = context.createBufferSource();
    source.buffer = sample.buffer;
    source.playbackRate.value = 2 ** ((note.midi - sample.midi) / 12);
    const bass = note.role === "bass";
    const melody = note.role === "melody";
    // 保留琴槌、琴弦和自然衰减；轻弹时更柔和，不靠正弦波假装钢琴。
    const tone = context.createBiquadFilter();
    tone.type = "lowpass";
    tone.Q.value = 0.5;
    tone.frequency.value = bass ? 1900 : (melody ? 3000 : 2300) + note.velocity * 1800;
    const envelope = context.createGain();
    const gain = 0.1 * note.velocity ** 1.1 / Math.max(0.02, sample.peak);
    const release = bass ? 1.2 : melody ? 1 : 0.65;
    const duration = Math.min(sample.buffer.duration / source.playbackRate.value, note.length + release);
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(gain, at + 0.004);
    envelope.gain.setValueAtTime(gain, at + Math.min(note.length, duration * 0.65));
    envelope.gain.exponentialRampToValueAtTime(0.00001, at + duration);
    const panner = makePanner(note.pan);
    const room = context.createGain();
    room.gain.value = bass ? 0.2 : melody ? 0.48 : 0.4;
    panner.connect(room);
    room.connect(reverb);
    source.connect(tone);
    tone.connect(envelope);
    envelope.connect(panner);
    source.start(at);
    source.stop(at + duration + 0.03);
    trackVoice([source], [source, tone, envelope, panner, room]);
  }

  function transport() {
    if (!score || !enabled || document.hidden || context?.state !== "running" || songStartedAt === null) return null;
    let audibleTime = context.currentTime;
    // 用扬声器实际输出的时钟校正画面，兼容没有该接口的浏览器。
    const stamp = context.getOutputTimestamp?.();
    if (stamp?.contextTime > 0 && stamp.performanceTime > 0 && globalThis.performance) {
      const estimate = stamp.contextTime + (performance.now() - stamp.performanceTime) / 1000;
      if (Number.isFinite(estimate)) audibleTime = clamp(estimate, context.currentTime - 0.5, context.currentTime);
    }
    return { session: musicSession, time: audibleTime - songStartedAt };
  }

  function scheduleMusic() {
    if (!score || songStartedAt === null || !enabled || context?.state !== "running" || document.hidden) return;
    const now = context.currentTime;
    // 提前排入声音时钟；定时器只负责补充，不直接决定音符响起的时刻。
    // https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Advanced_techniques
    const currentCycle = Math.max(0, Math.floor((now - songStartedAt) / score.duration));
    if (currentCycle > scoreCycle) { scoreCycle = currentCycle; scoreIndex = 0; }
    while (true) {
      const note = score.events[scoreIndex];
      const at = songStartedAt + scoreCycle * score.duration + note.at;
      if (at > now + 0.18) break;
      // 页面或设备卡顿后丢弃已错过的音符，不一次性补响。
      if (at >= now - 0.025) playScoreNote(note, Math.max(at, now));
      if (++scoreIndex === score.events.length) { scoreIndex = 0; scoreCycle++; }
    }
    const position = transport();
    const bar = Math.max(0, position?.time || 0) % score.duration / (score.beatSeconds * 4);
    const section = score.sections.find(part => bar >= part.fromBar && bar < part.toBar);
    if (sectionLabel && section && sectionLabel.textContent !== section.name) sectionLabel.textContent = section.name;
  }

  function stopMusic() {
    if (musicTimer !== null) clearInterval(musicTimer);
    musicTimer = null;
    songStartedAt = null;
  }

  function startMusic() {
    if (!score) return;
    stopMusic();
    stopVoices();
    songStartedAt = context.currentTime + 0.12;
    musicSession++;
    scoreIndex = scoreCycle = 0;
    scheduleMusic();
    musicTimer = setInterval(scheduleMusic, 25);
  }

  function meteor({ duration, entry, exit }) {
    if (!canPlay()) return;
    // 等流星真正进入画面才响；声像按画面从右移向左。
    const start = context.currentTime + duration * entry;
    const length = duration * (exit - entry);
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 0.55;
    filter.frequency.setValueAtTime(1450, start);
    filter.frequency.exponentialRampToValueAtTime(650, start + length);
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0, context.currentTime);
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(0.13, start + length * 0.35);
    envelope.gain.exponentialRampToValueAtTime(0.00001, start + length);
    const panner = makePanner(0.7);
    if (panner.pan) {
      panner.pan.setValueAtTime(0.7, start);
      panner.pan.linearRampToValueAtTime(-0.7, start + length);
    }
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(panner);
    source.start(start);
    source.stop(start + length + 0.05);
    trackVoice([source], [source, filter, envelope, panner]);
  }

  async function setEnabled(value) {
    wanted = value;
    const ticket = ++revision;
    clearTimeout(suspendTimer);
    if (!value) {
      enabled = false;
      stopMusic();
      updateButton();
      smoothGain(0, 0.035);
      suspendTimer = setTimeout(() => {
        if (ticket !== revision || wanted || !context) return;
        stopVoices();
        context.suspend().catch(() => {});
      }, 220);
      return;
    }
    updateButton("正在开启");
    try {
      initialize();
      const startingContext = context;
      await startingContext.resume();
      if (ticket === revision && wanted && !document.hidden && score && globalThis.cityPiano) {
        updateButton("准备琴音");
        const prepared = await globalThis.cityPiano.prepare(startingContext);
        if (ticket === revision && context === startingContext) pianoSamples = prepared;
      }
      if (ticket !== revision || !wanted || document.hidden) {
        if (!wanted && context) context.suspend().catch(() => {});
        return;
      }
      if (context.state !== "running") throw new Error("声音暂未启动");
      enabled = true;
      startMusic();
      // 第一颗旋律音在 0.12 秒响起前就到正常音量，不再被长淡入吞掉。
      smoothGain(score ? musicVolume : 0.42, score ? 0.035 : 0.3);
      updateButton();
    } catch {
      if (ticket !== revision) return;
      wanted = false;
      enabled = false;
      stopMusic();
      smoothGain(0, 0.035);
      stopVoices();
      // 启动失败后销毁未完成的声音连接，下次点击重新建立。
      if (context) context.close().catch(() => {});
      context = null;
      updateButton("重试声音");
    }
  }

  globalThis.cityAudio = { windowLight, meteor, transport };
  if (!AudioContext) {
    button.disabled = true;
    updateButton("声音不可用");
    button.setAttribute("aria-label", "当前浏览器不支持声音");
    return;
  }
  button.addEventListener("click", event => {
    event.stopPropagation();
    void setEnabled(!wanted);
  });
  volumeSlider?.addEventListener("input", () => {
    const value = Number(volumeSlider.value);
    if (!Number.isFinite(value)) return;
    musicVolume = clamp(value / 100, 0, 1);
    if (volumeLabel) volumeLabel.textContent = `${Math.round(musicVolume * 100)}%`;
    // 只调整音量，不重启曲子；短暂渐变避免拖动时产生爆音。
    if (enabled) smoothGain(musicVolume, 0.045);
  });
  for (const name of ["mousedown", "touchstart"]) {
    button.addEventListener(name, event => event.stopPropagation(), { passive: true });
    volumeControl?.addEventListener(name, event => event.stopPropagation(), { passive: true });
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) void setEnabled(false);
  });
  globalThis.addEventListener("pagehide", () => {
    revision++;
    enabled = wanted = false;
    clearTimeout(suspendTimer);
    stopMusic();
    stopVoices();
    if (context) context.close().catch(() => {});
    context = null;
    pianoSamples = [];
    updateButton();
  });
})();
