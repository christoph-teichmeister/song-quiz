// How to play: one source for the start page, the phone sheet and the pre-game screen (texts in i18n.js).
import { t } from './i18n.js';
const rule = (icon, k) => ({ icon, title: t('r.' + k), text: t('r.' + k + '.t') });
export const RULES = () => [rule('👥', 'teams'), rule('🎵', 'listen'), rule('🗣️', 'say'), rule('🚫', 'wrong'), rule('🏆', 'win')];
export const MODE_RULE = (mode) => ({ intro: rule('⏱️', 'intro'), speed: rule('⚡', 'speed') }[mode] || null);
export const rulesFor = (mode) => [...RULES(), ...(MODE_RULE(mode) ? [MODE_RULE(mode)] : [])];
