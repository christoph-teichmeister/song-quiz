// The painted buzzer disc (poster look, wobble at about 75% of the share image). Used on the TV start page and the phone entry page.
export const disc = () => `<svg viewBox="-12 -12 224 224" class=disc aria-hidden=true><defs><filter id=dwob x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type=fractalNoise baseFrequency=".03" numOctaves=2 seed=4 result=n /><feDisplacementMap in=SourceGraphic in2=n scale=9 xChannelSelector=R yChannelSelector=G /></filter></defs>
<g filter="url(#dwob)"><circle cx=107 cy=108 r=90 fill="#0c0616" opacity=.5 /><circle cx=100 cy=100 r=90 fill="#ff4f8b" />
<path d="M10 100 a90 90 0 0 0 145 70 a112 112 0 0 1 -145 -70z" fill="#c4306a" /><path d="M41 61 q18 -40 59 -40 q-26 18 -40 57 q-9 9 -20 -17z" fill="#ffb3cb" />
<circle cx=100 cy=100 r=72 fill=none stroke="#ffd0e0" stroke-width=3.2 stroke-dasharray="17 11" stroke-linecap=round opacity=.9 transform="rotate(-18 100 100)" />
<g fill="#f6ecd8" transform="translate(100 100) rotate(-8) scale(1.27) translate(-32 -32)"><path d="M27 18v21.5a6.2 6.2 0 1 0 3.6 5.6V28l11 2.8v9.7a6.2 6.2 0 1 0 3.6 5.6V21.2z" /></g></g></svg>`;
