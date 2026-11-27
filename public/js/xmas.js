// Christmas gimmick: while the admin switches config/xmas on, the TV and the phones show falling snow and a string of lights.
export function xmas(D, r) {
  let cv = null, raf = 0, flakes = [];
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stop = () => { cancelAnimationFrame(raf); raf = 0; cv?.remove(); cv = null; };
  const start = () => {
    if (cv || calm) return;
    cv = Object.assign(document.createElement('canvas'), { id: 'snow' }); document.body.append(cv);
    const c = cv.getContext('2d'), size = () => { cv.width = innerWidth; cv.height = innerHeight; };
    size(); addEventListener('resize', size);
    flakes = Array.from({ length: innerWidth > 900 ? 90 : 45 }, () => ({ x: Math.random() * innerWidth, y: Math.random() * innerHeight, r: 1.5 + Math.random() * 3, v: 0.4 + Math.random() * 1.1, p: Math.random() * 6 }));
    const tick = (t) => {
      c.clearRect(0, 0, cv.width, cv.height); c.fillStyle = '#fff';
      for (const f of flakes) {
        f.y += f.v; f.x += Math.sin(t / 1500 + f.p) * 0.4;
        if (f.y > cv.height + 5) { f.y = -5; f.x = Math.random() * cv.width; }
        c.globalAlpha = 0.45 + f.r / 8; c.beginPath(); c.arc(f.x, f.y, f.r, 0, 7); c.fill();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  };
  D.onValue(r('config/xmas'), (s) => { const on = !!s.val(); document.documentElement.classList.toggle('xmas', on); on ? start() : stop(); });
}
