const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
test('正式配乐为选定原录音，触发点位于曲内，页面不加载旧编曲', () => {
  const root = path.resolve(__dirname,'..');
  const sandbox = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(root,'assets/jrpg-track.js'),'utf8'),sandbox);
  const {cityScore:score, cityMusicTrack:track} = sandbox;
  const original = fs.readFileSync(path.join(root,'assets/jrpg-piano.mp3'));
  assert.deepEqual(Buffer.from(track.base64,'base64'),original);
  assert.equal(crypto.createHash('sha256').update(original).digest('hex'),
    '87a99f62e901b8365f1b868cd53bc015d2bf9f887e4c8a89a4fad11a36a62c16');
  assert.equal(track.duration,score.duration);
  assert.ok(score.visuals.length > 15 && score.visuals.length < 70);
  assert.ok(score.visuals.every((n,i) => n.at >= 0 && n.at < score.duration && (!i || n.at-score.visuals[i-1].at >= .32)));
  const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert.ok(html.includes('./assets/jrpg-track.js'));
  assert.ok(!html.includes('./score.js') && !html.includes('./assets/music-track.js'));
});
