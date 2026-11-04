import qrcode from 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/+esm';
export function qrSvg(text) {
  const q = qrcode(0, 'M');
  q.addData(text); q.make();
  return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
}
