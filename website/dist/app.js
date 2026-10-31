import { signup } from './signup-config.js';
const $ = (selector) => document.querySelector(selector);
const modes = {
  captions: 'Every word. Even on mute.',
  translate: 'Your words. Another language.',
  chorus: 'A whole chat. One shared reaction.',
  chaos: 'Chat gets creative. Fiction stays labeled.'
};
const script = [
  { en: 'Chat, I have a very good feeling about this.', accent: 'very good', zh: '各位，我有预感，这次肯定行。', es: 'Chat, tengo un muy buen presentimiento.', ja: 'みんな、今回はすごくいい予感がする。', chorus: 'Chat has collectively chosen optimism.', chaos: 'Streamer has challenged gravity to a rematch.' },
  { en: 'That was absolutely part of the plan.', accent: 'absolutely', zh: '这绝对是计划的一部分。', es: 'Eso era absolutamente parte del plan.', ja: '今のは完全に計画通り。', chorus: 'Chat is politely questioning the strategy.', chaos: 'A nearby houseplant has requested a new coach.' },
  { en: 'One more try. We have got this.', accent: 'One more try.', zh: '再试一次，我们能行。', es: 'Un intento más. Podemos hacerlo.', ja: 'もう一回。私たちならできる。', chorus: 'The community is rallying for one more attempt.', chaos: 'Confidence has left orbit. Skill is catching up.' }
];
let mode = 'captions', line = 0, captionsHidden = false, paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
function render() {
  const item = script[line];
  const speech = $('#speech-caption');
  speech.replaceChildren();
  const [before, after] = item.en.split(item.accent);
  const emphasis = document.createElement('em'); emphasis.textContent = item.accent;
  speech.append(before, emphasis, after || '');
  const secondary = $('#secondary-caption');
  secondary.hidden = mode === 'captions';
  secondary.textContent = mode === 'translate' ? item[$('#demo-language').value] : item[mode] || '';
  secondary.lang = mode === 'translate' ? $('#demo-language').value : 'en';
  $('#chaos-label').hidden = mode !== 'chaos' || captionsHidden;
  $('.caption-stack').hidden = captionsHidden;
  $('#empty-caption').hidden = !captionsHidden;
  $('#scene').dataset.mode = mode;
  $('#mode-description').textContent = modes[mode];
  document.querySelectorAll('[data-mode]').forEach(button => {
    if (button.tagName !== 'BUTTON') return;
    const selected = button.dataset.mode === mode;
    button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected));
  });
}
function setMode(next) { mode = next; render(); }
$('#caption-toggle').addEventListener('click', () => {
  captionsHidden = !captionsHidden;
  $('.caption-stack').hidden = captionsHidden;
  $('#caption-toggle').setAttribute('aria-pressed', String(captionsHidden));
  $('#caption-toggle').textContent = captionsHidden ? 'Show captions ↔' : 'Hide captions ↔';
  $('.sound-tag').textContent = captionsHidden ? 'SOUND OFF · CAPTIONS OFF' : 'SOUND OFF';
  render();
});
document.querySelectorAll('button[data-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
document.querySelectorAll('[data-try]').forEach(button => button.addEventListener('click', () => {
  captionsHidden = false; $('#caption-toggle').setAttribute('aria-pressed', 'false'); $('#caption-toggle').textContent = 'Hide captions ↔'; $('.sound-tag').textContent = 'SOUND OFF'; setMode(button.dataset.try); $('#playground').scrollIntoView({block:'center'});
  $(`button[data-mode="${mode}"]`).focus({preventScroll:true});
}));
$('#demo-language').addEventListener('change', () => setMode('translate'));
function renderPause() {
  $('#pause').setAttribute('aria-pressed', String(paused));
  $('#pause').textContent = paused ? 'Play demo' : 'Pause demo';
  $('#scene').classList.toggle('paused', paused);
}
$('#pause').addEventListener('click', () => { paused = !paused; renderPause(); });
setInterval(() => { if (!paused && !document.hidden) { line = (line + 1) % script.length; render(); } }, 7000);
$('#style-button').addEventListener('click', () => {
  const classic = $('#scene').classList.toggle('classic');
  $('#style-button').textContent = classic ? 'Style: classic ↻' : 'Style: bold ↻';
  $('#style-button').setAttribute('aria-pressed', String(classic));
});
$('#chat-form').addEventListener('submit', event => {
  event.preventDefault();
  const input = $('#chat-command');
  const command = input.value.trim().toLowerCase();
  const requested = command.replace(/^!mode\s+/, '');
  const aliases = { captions:'captions', translate:'translate', chorus:'chorus', chaos:'chaos' };
  if (command.startsWith('!mode ') && Object.hasOwn(aliases, requested)) {
    setMode(aliases[requested]); $('#chat-feedback').textContent = `Demo chat → ${requested} mode. Real chat effects are streamer-controlled.`; input.value = '';
  } else {
    $('#chat-feedback').textContent = 'Try !mode captions, !mode translate, !mode chorus, or !mode chaos.';
  }
});
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
render(); renderPause(); connectSignup();
