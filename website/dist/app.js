import { signup } from './signup-config.js';
const $ = (selector) => document.querySelector(selector);
const clips = {
  captions: { file: 'subtitles', label: 'Subtitles', description: 'Your words, on screen.', note: 'Recorded footage from our project video. Subtitles styled for the demo.' },
  commentary: { file: 'commentary', label: 'Commentary', description: 'Commentary for what happens on camera.', note: 'Recorded footage with illustrated commentary from our project video.' },
  translate: { file: 'translation', label: 'Translation', description: 'The same moment, in different languages.', note: 'Edited translation demonstration. Caption changes and chat are illustrated.' },
  voice: { file: 'voice', label: 'Voice translation', description: 'English in. Chinese audio out. Turn sound on to listen.', note: 'Recorded live through OBS. Voice translation is in beta and has a delay.' }
};
const video = $('#demo-video');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let selected = 'captions';
let wantsPlayback = !reducedMotion.matches;
let visible = false;
function playback() {
  if (wantsPlayback && visible && !document.hidden) {
    video.play().catch(() => { /* Native Play remains available if autoplay is blocked. */ });
  } else video.pause();
}
function syncControls() {
  $('#pause').textContent = video.paused ? 'Play video' : 'Pause video';
  $('#pause').setAttribute('aria-pressed', String(!video.paused));
  $('#sound').textContent = video.muted ? 'Sound on' : 'Mute';
  $('#sound').setAttribute('aria-pressed', String(!video.muted));
}
function selectClip(key) {
  if (!Object.hasOwn(clips, key)) return;
  const clip = clips[key];
  selected = key;
  video.poster = `assets/video/${clip.file}.jpg`;
  video.src = `assets/video/${clip.file}.mp4`;
  video.setAttribute('aria-label', `AuraMax Captions ${clip.label.toLowerCase()} demonstration`);
  $('#mode-description').textContent = clip.description;
  $('#demo-note').textContent = clip.note;
  $('#video-error').hidden = true;
  $('#video-fallback').href = video.src;
  document.querySelectorAll('[data-clip]').forEach(button => {
    const active = button.dataset.clip === key;
    button.classList.toggle('selected', active);
    button.setAttribute('aria-pressed', String(active));
  });
  playback();
}
$('#pause').addEventListener('click', () => {
  wantsPlayback = video.paused;
  if (wantsPlayback) video.play().catch(syncControls);
  else video.pause();
});
$('#sound').addEventListener('click', () => { video.muted = !video.muted; });
video.addEventListener('play', () => { wantsPlayback = true; syncControls(); });
video.addEventListener('pause', () => {
  if (visible && !document.hidden && !video.ended && video.readyState >= 2) wantsPlayback = false;
  syncControls();
});
video.addEventListener('volumechange', syncControls);
video.addEventListener('error', () => { $('#video-error').hidden = false; syncControls(); });
document.querySelectorAll('[data-clip]').forEach(button => button.addEventListener('click', () => selectClip(button.dataset.clip)));
document.querySelectorAll('[data-try]').forEach(button => button.addEventListener('click', () => {
  selectClip(button.dataset.try);
  $('#playground').scrollIntoView({ block: 'center', behavior: reducedMotion.matches ? 'instant' : 'smooth' });
  $(`[data-clip="${selected}"]`).focus({ preventScroll: true });
}));
new IntersectionObserver(entries => { visible = entries[0].isIntersecting; playback(); }, { threshold: 0.15 }).observe(video);
document.addEventListener('visibilitychange', playback);
reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) { wantsPlayback = false; playback(); } });
syncControls();
function connectSignup(interest = 'Captions') {
  if (!signup.formUrl) return;
  const url = new URL(signup.formUrl);
  if (url.protocol !== 'https:' || !['docs.google.com', 'forms.gle'].includes(url.hostname)) return;
  if (signup.interestField) url.searchParams.set(signup.interestField, interest);
  $('#signup-link').href = url.href;
  $('#signup-link').target = '_blank';
  $('#signup-link').rel = 'noopener';
  $('#signup-status').textContent = 'Free signup · Google Form · Private responses';
}
$('#interest').addEventListener('change', () => connectSignup($('#interest').value));
connectSignup();
