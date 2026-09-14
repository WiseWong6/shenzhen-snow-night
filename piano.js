/* Salamander 原声钢琴。采样署名和许可见 assets/PIANO-LICENSE.md。 */
(() => {
  const prepared = new WeakMap();

  function decodeBase64(encoded) {
    const raw = globalThis.atob(encoded);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
    return bytes.buffer;
  }

  function prepare(context) {
    if (!context || typeof context.decodeAudioData !== "function") {
      return Promise.reject(new Error("当前环境无法解码原声钢琴采样。"));
    }
    if (prepared.has(context)) return prepared.get(context);

    const pending = (async () => {
      const samples = globalThis.cityPianoSamples;
      if (!Array.isArray(samples) || samples.length !== 9) {
        throw new Error("原声钢琴采样文件未完整加载。请检查 assets/piano-samples.js。");
      }
      const result = await Promise.all(samples.map(async sample => {
        const decoded = await context.decodeAudioData(decodeBase64(sample.base64));
        let peak = 0;
        for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
          const values = decoded.getChannelData(channel);
          for (let frame = 0; frame < values.length; frame += 1) {
            peak = Math.max(peak, Math.abs(values[frame]));
          }
        }
        if (!Number.isFinite(peak) || peak <= 0 || decoded.length < 1) {
          throw new Error(`钢琴采样 ${sample.file} 没有有效音频。`);
        }

        // 只移除起音前极轻的静音，最多 0.15 秒；保留 1 毫秒缓冲。
        // 不改变录音本身的响度、动态、音色或尾音。
        const limit = Math.min(decoded.length - 1, Math.floor(decoded.sampleRate * 0.15));
        let firstSound = limit;
        const threshold = peak * 0.0025;
        for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
          const values = decoded.getChannelData(channel);
          for (let frame = 0; frame < firstSound; frame += 1) {
            if (Math.abs(values[frame]) > threshold) {
              firstSound = frame;
              break;
            }
          }
        }
        const start = Math.max(0, firstSound - Math.ceil(decoded.sampleRate * 0.001));
        let buffer = decoded;
        if (start > 0) {
          buffer = context.createBuffer(decoded.numberOfChannels,
            decoded.length - start, decoded.sampleRate);
          for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
            buffer.getChannelData(channel).set(decoded.getChannelData(channel).subarray(start));
          }
        }
        return { midi: sample.midi, buffer, peak };
      }));
      return result.sort((a, b) => a.midi - b.midi);
    })();

    prepared.set(context, pending);
    // 失败不缓存、不退回合成音色，调用方可以显示错误并让用户重试。
    pending.catch(() => {
      if (prepared.get(context) === pending) prepared.delete(context);
    });
    return pending;
  }

  globalThis.cityPiano = { prepare };
})();
