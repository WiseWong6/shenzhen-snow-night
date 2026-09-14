// 原创器乐《雪落成灯》：固定旋律、和声与留白，不以随机音阶代替作曲。
// 节拍、音符和落物共用这份乐谱；时间单位在导出时统一换算成秒。
(() => {
  const bpm = 72;
  const beatSeconds = 60 / bpm;
  const bars = 32;
  const sections = [
    { name: "初雪", fromBar: 0, toBar: 8, intensity: 0.48, velocity: 0.84 },
    { name: "窗灯", fromBar: 8, toBar: 16, intensity: 0.52, velocity: 0.86 },
    { name: "雪光", fromBar: 16, toBar: 24, intensity: 0.6, velocity: 0.9 },
    { name: "回环", fromBar: 24, toBar: 32, intensity: 0.5, velocity: 0.85 },
  ];
  const midi = name => {
    const match = /^([A-G])(#?)(\d)$/.exec(name);
    if (!match) throw new Error(`无法识别音名：${name}`);
    return (Number(match[3]) + 1) * 12 + { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[match[1]] +
      (match[2] ? 1 : 0);
  };

  // 钢琴独奏是近处的主体，八音盒只在远处偶尔回答。
  // 每四小节以 5、5、5、4 个音构成一句，句末留一点呼吸，
  // 四段保持同一节奏骨架，不用突然减半的音符密度来制造安静。
  const melody = [
    ["F#4", "A4", "D5", "C#5", "A4"],
    ["E4", "F#4", "A4", "B4", "A4"],
    ["F#4", "A4", "B4", "D5", "C#5"],
    ["B4", "A4", "G4", "F#4"],
    ["G4", "B4", "A4", "G4", "E4"],
    ["F#4", "A4", "D5", "C#5", "A4"],
    ["B4", "A4", "G4", "F#4", "E4"],
    ["E4", "A4", "B4", "C#5"],

    ["D5", "C#5", "B4", "A4", "F#4"],
    ["E4", "A4", "B4", "C#5", "B4"],
    ["D5", "F#5", "E5", "D5", "B4"],
    ["B4", "A4", "G4", "A4"],
    ["G4", "B4", "E5", "D5", "B4"],
    ["A4", "F#4", "A4", "D5", "C#5"],
    ["B4", "D5", "B4", "A4", "G4"],
    ["A4", "B4", "C#5", "E5"],

    ["D5", "F#5", "E5", "F#5", "D5"],
    ["E5", "C#5", "B4", "A4", "E4"],
    ["F#4", "B4", "D5", "E5", "F#5"],
    ["E5", "D5", "B4", "A4"],
    ["G4", "B4", "E5", "D5", "B4"],
    ["A4", "D5", "F#5", "E5", "D5"],
    ["B4", "A4", "G4", "B4", "D5"],
    ["E5", "D5", "C#5", "A4"],

    ["F#4", "A4", "D5", "C#5", "A4"],
    ["E4", "F#4", "A4", "B4", "A4"],
    ["F#4", "A4", "B4", "D5", "C#5"],
    ["B4", "A4", "G4", "F#4"],
    ["G4", "B4", "D5", "B4", "A4"],
    ["F#4", "A4", "D5", "C#5", "A4"],
    ["B4", "A4", "G4", "F#4", "E4"],
    ["E4", "A4", "G4", "E4"],
  ];
  const harmony = [
    { bass: "D3", arp: ["F#3", "A3", "D4", "A3"] },
    { bass: "C#3", arp: ["E3", "A3", "C#4", "A3"], answer: "E5" },
    { bass: "B2", arp: ["F#3", "A3", "D4", "F#3"] },
    { bass: "G2", arp: ["D3", "G3", "B3", "D4"], answer: "D5" },
    { bass: "E3", arp: ["G3", "B3", "D4", "B3"] },
    { bass: "F#3", arp: ["A3", "D4", "E4", "A3"], answer: "F#5" },
    { bass: "G2", arp: ["D3", "A3", "B3", "D4"] },
    { bass: "A2", arp: ["E3", "A3", "B3", "C#4"], answer: "E5" },
  ];
  const accentBars = new Set([3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29]);
  const events = [];
  melody.forEach((phrase, bar) => {
    const section = sections[Math.floor(bar / 8)];
    const chord = harmony[bar % 8];
    const offsets = phrase.length === 4 ? [0, 1, 2, 3] :
      bar % 2 === 0 ? [0, 0.5, 1.5, 2.5, 3.5] : [0, 1, 1.5, 2.5, 3.5];
    // 低音每小节只落一次，给琴弦衰减留空间；左手保持在旋律下方。
    events.push({
      id: `bass-${bar}-0`, role: "bass",
      at: bar * 4 * beatSeconds, length: 2.75 * beatSeconds,
      midi: midi(chord.bass), voice: "piano", velocity: section.velocity * 0.3, pan: -0.16,
    });
    const arpOffsets = bar % 2 ? [0.1, 1.08, 2.04, 3.1] : [0.12, 1.04, 2.1, 3.08];
    chord.arp.forEach((name, index) => {
      events.push({
        id: `arpeggio-${bar}-${index}`, role: "arpeggio",
        at: (bar * 4 + arpOffsets[index]) * beatSeconds,
        length: 0.9 * beatSeconds, midi: midi(name), voice: "piano",
        velocity: section.velocity * [0.26, 0.22, 0.25, 0.2][index], pan: -0.1,
      });
    });
    // 两小节仅一颗很轻的铃音，避开主奏的落键；它不构成第二条抢耳旋律。
    if (chord.answer) {
      events.push({
        id: `response-${bar}-0`, role: "response",
        at: (bar * 4 + (phrase.length === 4 ? 2.5 : 3)) * beatSeconds,
        length: 0.52 * beatSeconds, midi: midi(chord.answer), voice: "musicbox",
        velocity: section.velocity * 0.18, pan: bar % 4 === 1 ? 0.28 : -0.28,
      });
    }
    phrase.forEach((name, index) => {
      const offset = offsets[index];
      const gap = (offsets[index + 1] ?? 4) - offset;
      const length = gap * (index === phrase.length - 1 ? 0.96 : 1.04);
      const accent = accentBars.has(bar) && index === phrase.length - 1;
      const flightBeats = accent ? 4 : index % 2 ? 4.5 : 4.8;
      const x = 0.12 + 0.76 * ((bar * 0.381966 + index * 0.236068 + 0.3) % 1);
      const pitch = midi(name);
      events.push({
        id: `melody-${bar}-${index}`, role: "melody",
        at: (bar * 4 + offset) * beatSeconds,
        length: length * beatSeconds,
        midi: pitch, voice: "piano", velocity: section.velocity * [1, 0.82, 0.94, 0.88, 0.8][index],
        // 声像遵循琴键音区，不随雪花横向跳来跳去，主奏留在听者面前。
        pan: Math.max(-0.13, Math.min(0.16, (pitch - 69) * 0.018)),
        visual: {
          kind: accent ? "cross" : "snowflake",
          size: accent ? 5.8 : index % 2 ? 7.1 : 8,
          flight: flightBeats * beatSeconds,
          brightness: index % 2 ? 0.91 : 1,
          turn: accent ? 0.16 : index % 2 ? -0.22 : 0.2,
          x,
        },
      });
    });
  });
  events.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  globalThis.cityScore = {
    title: "雪落成灯", bpm, beatSeconds, bars, beatsPerBar: 4,
    duration: bars * 4 * beatSeconds,
    sections, events, visuals: events.filter(event => event.visual),
  };
})();
