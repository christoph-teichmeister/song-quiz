// How to play: one source for the start page, the phone sheet and the pre-game screen.
export const RULES = [
  { icon: '👥', title: 'Two teams', text: 'Join Team A or Team B. In every song one person per team stands at the front with the buzzer, and the front-person changes each song.' },
  { icon: '🎵', title: 'Listen and buzz', text: 'A song plays. If the front-person knows it, they buzz on their phone and the music stops.' },
  { icon: '🗣️', title: 'Say it out loud', text: 'Call the title and the artist. A random judge from the audience sees the answer and taps what was right: 1 point for the title, 1 for the artist.' },
  { icon: '🚫', title: 'Wrong answer', text: 'That team is locked for this song. The music goes on and the other team may buzz.' },
  { icon: '🏆', title: 'Win it', text: 'After the last song the team with the most points wins. Everyone gets their own stats at the end.' },
];
export const MODE_RULE = {
  normal: null,
  intro: { icon: '⏱️', title: 'Mode: Intro only', text: 'Every song stops after 5 seconds. If nobody buzzes in time, nobody scores. Be quick.' },
  speed: { icon: '⚡', title: 'Mode: Speed', text: 'Buzz within the first 5 seconds and the points for that answer count double.' },
};
export const rulesFor = (mode) => [...RULES, ...(MODE_RULE[mode] ? [MODE_RULE[mode]] : [])];
