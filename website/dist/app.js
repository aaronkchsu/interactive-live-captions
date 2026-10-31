import { signup } from './signup-config.js';
const $ = (selector) => document.querySelector(selector);
const modes = {
  captions: 'Every word. Even on mute.',
  translate: 'Your words. Another language.',
  chorus: 'A whole chat. One shared reaction.',
  chaos: 'Let chat get creative.'
};
const script = [
  { moment: 'Just chatting', en: 'Wait, what was I saying?', accent: 'what was I saying?', zh: '等等，我刚才说到哪儿了？', es: 'Espera, ¿qué estaba diciendo?', ja: '待って、何の話をしてたっけ？', chorus: 'Chat is still waiting for the plot.', chaos: 'Streamer has been talking about literally nothing for the past 30 minutes.' },
  { moment: 'Snack break', en: 'One sec. Banana break.', accent: 'Banana break.', zh: '等一下，吃根香蕉休息一下。', es: 'Un segundo. Pausa para comer un plátano.', ja: 'ちょっと待って。バナナ休憩。', chorus: 'Chat came for gameplay. Stayed for the banana lore.', chaos: 'Viewers are just watching a streamer literally eat a banana.' },
  { moment: 'Minecraft', en: 'Chat, it is literally just a door.', accent: 'just a door.', zh: '各位，这真的只是一扇门。', es: 'Chat, literalmente es solo una puerta.', ja: 'みんな、本当にただのドアだよ。', chorus: 'Chat has questions about this Minecraft build.', chaos: 'Streamer is being a little too scandalous about a Minecraft door.' }
];
let mode = 'chaos', line = 0, captionsHidden = false, paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
function render() {
  const item = script[line];
  $('#demo-moment').value = String(line);
  const speech = $('#speech-caption');
  speech.replaceChildren();
  const [before, after] = item.en.split(item.accent);
  const emphasis = document.createElement('em'); emphasis.textContent = item.accent;
  speech.append(before, emphasis, after || '');
  const secondary = $('#secondary-caption');
  secondary.hidden = mode === 'captions';
  secondary.textContent = mode === 'translate' ? item[$('#demo-language').value] : item[mode] || '';
  secondary.lang = mode === 'translate' ? $('#demo-language').value : 'en';
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
  render();
});
document.querySelectorAll('button[data-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
document.querySelectorAll('[data-try]').forEach(button => button.addEventListener('click', () => {
  captionsHidden = false; $('#caption-toggle').setAttribute('aria-pressed', 'false'); $('#caption-toggle').textContent = 'Hide captions ↔'; setMode(button.dataset.try); $('#playground').scrollIntoView({block:'center'});
  $(`button[data-mode="${mode}"]`).focus({preventScroll:true});
}));
$('#demo-moment').addEventListener('change', () => { line = Number($('#demo-moment').value); render(); });
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
  $('#chat-feedback').hidden = false;
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
