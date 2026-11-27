// How to play: one source for the start page, the phone sheet and the pre-game screen (texts in i18n.js).
import { t } from './i18n.js';
import { T } from './game.js';
const COLOR = { teams: '#52d1ff', listen: '#ff4f8b', say: '#ffb347', judge: '#b9a2ff', wrong: '#ff8fb3', win: '#5ee6a0' };
export const PICTO = { teams: 'teams', listen: 'buzz', say: 'say', judge: 'judge', wrong: 'wrong', win: 'win' }; // rule key -> picture in pictos.js
const rule = (icon, k) => ({ icon, key: k, color: COLOR[k], title: t('r.' + k), text: t('r.' + k + '.t', { n: T.answer / 1000 }) }); // {n}: the speaking time, from the game's own constant
export const RULES = () => [rule('👥', 'teams'), rule('🎵', 'listen'), rule('🗣️', 'say'), rule('⚖️', 'judge'), rule('🚫', 'wrong'), rule('🏆', 'win')];
export const MODE_RULE = (mode) => ({ intro: rule('⏱️', 'intro'), speed: rule('⚡', 'speed') }[mode] || null);
export const rulesFor = (mode) => [...RULES(), ...(MODE_RULE(mode) ? [MODE_RULE(mode)] : [])];
