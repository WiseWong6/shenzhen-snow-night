const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');

function loadPiano() {
  const context = vm.createContext({ atob });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/piano-samples.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../piano.js'), 'utf8'), context);
  return { samples: context.cityPianoSamples, piano: context.cityPiano };
}

function makeBuffer(channels, length, rate) {
  const data = Array.from({ length: channels }, () => new Float32Array(length));
  return { numberOfChannels: channels, length, sampleRate: rate, duration: length / rate,
    getChannelData: channel => data[channel] };
}

test('原声单音完整打包，校验值一致，覆盖乐谱音区无需网络请求', () => {
  const { samples } = loadPiano();
  assert.equal(samples.length, 9);
  for (const sample of samples) {
    const data = Buffer.from(sample.base64, 'base64');
    assert.equal(data.length, sample.bytes);
    assert.equal(crypto.createHash('sha256').update(data).digest('hex'), sample.sha256);
  }
  for (let midi = 43; midi <= 81; midi++) {
    assert.ok(Math.min(...samples.map(sample => Math.abs(sample.midi - midi))) <= 3);
  }
  const index = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.ok(index.indexOf('./assets/piano-samples.js') < index.indexOf('./piano.js'));
  assert.ok(index.indexOf('./piano.js') < index.indexOf('./sound.js'));
});

test('单音解码缓存按声音环境隔离，去掉起音前静音但不裁掉琴音', async () => {
  const { piano } = loadPiano();
  let calls = 0;
  const context = {
    createBuffer: makeBuffer,
    async decodeAudioData(data) {
      assert.ok(data.byteLength > 40000);
      calls++;
      const decoded = makeBuffer(2, 1000, 1000);
      decoded.getChannelData(0)[50] = 0.2;
      decoded.getChannelData(1)[45] = 0.1;
      return decoded;
    },
  };
  const first = piano.prepare(context);
  assert.equal(piano.prepare(context), first);
  const prepared = await first;
  assert.equal(calls, 9);
  assert.equal(prepared[0].buffer.length, 956);
  assert.equal(prepared[0].buffer.getChannelData(1)[1], Math.fround(0.1));
  assert.equal(prepared[0].peak, Math.fround(0.2));
  await piano.prepare(context);
  assert.equal(calls, 9);
  await piano.prepare({ ...context });
  assert.equal(calls, 18);
});

test('钢琴解码失败可重试，不将失败或空音频永久缓存', async () => {
  const { piano } = loadPiano();
  let fail = true;
  const context = {
    createBuffer: makeBuffer,
    async decodeAudioData() {
      if (fail) throw new Error('无法解码');
      const decoded = makeBuffer(1, 1000, 1000);
      decoded.getChannelData(0)[0] = 0.2;
      return decoded;
    },
  };
  await assert.rejects(piano.prepare(context));
  fail = false;
  assert.equal((await piano.prepare(context)).length, 9);
  await assert.rejects(piano.prepare({ createBuffer: makeBuffer,
    decodeAudioData: async () => makeBuffer(1, 1000, 1000) }), /没有有效音频/);
});
