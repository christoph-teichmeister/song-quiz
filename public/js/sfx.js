// Sounds for the TV. SFX.* are short synthesised effects that take the AudioContext (the caller checks that sound is unlocked);
// below them: the shared AudioContext, the applause recording and the end-screen / buzzer sounds.
const tone = (c, t, hz, dur, { type = 'sine', vol = .16, to = 0 } = {}) => {
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(hz, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + .02);
};
const notes = (c, hzs, gap, opts) => { const t = c.currentTime + .02; hzs.forEach((hz, i) => tone(c, t + i * gap, hz, .35, opts)); };
export const SFX = {
  tick: (c) => tone(c, c.currentTime + .01, 880, .12, { type: 'triangle' }), // countdown 3, 2, 1
  go: (c) => notes(c, [1320, 1760], .09, { type: 'triangle', vol: .2 }), // song starts
  whoosh: (c) => { // a new round: filtered noise sweeping up
    const t = c.currentTime + .01, n = c.sampleRate * .6, buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = buf; f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(3000, t + .5);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.18, t + .25); g.gain.linearRampToValueAtTime(0, t + .55);
    s.connect(f); f.connect(g); g.connect(c.destination); s.start(t);
  },
  right: (c) => notes(c, [659, 988], .11, { type: 'triangle', vol: .2 }), // one of title / artist
  both: (c) => notes(c, [523, 659, 784, 1047], .1, { type: 'triangle', vol: .2 }), // title and artist
  wrong: (c) => notes(c, [233, 175], .18, { type: 'sawtooth', vol: .1 }), // nothing right
  reveal: (c) => notes(c, [784, 1047], .14, { vol: .14 }),
  join: (c) => notes(c, [587, 880], .09, { vol: .24 }), // someone joined the lobby
  ack: (c) => tone(c, c.currentTime + .01, 1175, .14, { type: 'triangle', vol: .2 }), // a player confirmed the rules
  start: (c) => notes(c, [392, 523, 659, 784], .12, { type: 'square', vol: .08 }), // game begins
};

let AC; // Web Audio for the end-screen sounds (synthesised, no files)
export const ac = () => (AC ||= new (window.AudioContext || window.webkitAudioContext)());
export function applause() { // the real recording only (public domain)
  const a = new Audio('/sounds/applause.ogg'); a.volume = .85;
  a.play().then(() => setTimeout(() => { const f = setInterval(() => { a.volume = Math.max(0, a.volume - .08); if (a.volume <= 0) { clearInterval(f); a.pause(); } }, 150); }, 8200)).catch((e) => console.error('applause', e.message));
}
export function sadTrombone() { // wah wah wah wahhh
  const c = ac(); let t = c.currentTime + .05;
  [[233, .42], [220, .42], [208, .42], [196, 1.3]].forEach(([hz, dur], i, a) => {
    const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain(), last = i === a.length - 1;
    o.type = 'sawtooth'; o.frequency.setValueAtTime(hz, t);
    if (last) { o.frequency.linearRampToValueAtTime(hz * .94, t + dur); const v = c.createOscillator(), vg = c.createGain(); v.frequency.value = 5.5; vg.gain.value = 4; v.connect(vg); vg.connect(o.frequency); v.start(t); v.stop(t + dur); }
    f.type = 'lowpass'; f.frequency.setValueAtTime(500, t); f.frequency.linearRampToValueAtTime(1100, t + dur * .35); f.frequency.linearRampToValueAtTime(450, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.22, t + .05); g.gain.setValueAtTime(.22, t + dur - .08); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(f); f.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + .02); t += dur + .04;
  });
}
export function bzzt() { // short low buzzer: two detuned square waves through a lowpass
  const c = ac(), t = c.currentTime + .02, g = c.createGain(), f = c.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 900;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.12, t + .02); g.gain.setValueAtTime(.12, t + .26); g.gain.linearRampToValueAtTime(0, t + .3);
  [110, 116].forEach((hz) => { const o = c.createOscillator(); o.type = 'square'; o.frequency.value = hz; o.connect(f); o.start(t); o.stop(t + .32); });
  f.connect(g); g.connect(c.destination);
}
