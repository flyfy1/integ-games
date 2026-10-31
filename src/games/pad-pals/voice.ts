/** Plays the recorded lines in public/pad-pals-voice. Only one line speaks at a time; a missing file just stays silent. */
import type { Lang, SpokenKey } from './i18n';

export function createVoice() {
  const clips = new Map<string, HTMLAudioElement>();
  let current: HTMLAudioElement | undefined;
  const stop = () => { if (!current) return; current.pause(); current.currentTime = 0; current = undefined; };
  function say(lang: Lang, key: SpokenKey) {
    if (typeof Audio === 'undefined') return;
    stop();
    const id = `${lang}/${key}`;
    const clip = clips.get(id) ?? new Audio(`${import.meta.env.BASE_URL}pad-pals-voice/${id}.mp3`);
    clips.set(id, clip);
    current = clip;
    void clip.play()?.catch(() => undefined); // Blocked until the first click or key; the hint is on screen anyway.
  }
  return { say, stop };
}
