import { pages, agentPrompt } from '../../handbook/catalog.js';

const page = pages.find((p) => p.slug === document.body.dataset.topic);
const root = document.documentElement;
const appearance = document.querySelector('#appearance');
function applyAppearance(value) {
  if (value === 'system') delete root.dataset.theme;
  else root.dataset.theme = value;
  appearance.value = value;
  try {
    localStorage.setItem('manifold.handbook.appearance', value);
  } catch {
    /* Theme works without storage. */
  }
  window.dispatchEvent(new Event('manifold-theme'));
}
let saved = 'system';
try {
  saved = localStorage.getItem('manifold.handbook.appearance') ?? saved;
} catch {
  /* Use system. */
}
applyAppearance(['system', 'light', 'dark'].includes(saved) ? saved : 'system');
appearance.addEventListener('change', () => applyAppearance(appearance.value));
document.querySelector('.chapters-toggle').addEventListener('click', (event) => {
  const expanded = event.currentTarget.getAttribute('aria-expanded') !== 'true';
  event.currentTarget.setAttribute('aria-expanded', expanded);
  document.querySelector('#chapters').classList.toggle('open', expanded);
});
document.querySelector('#topic-search').addEventListener('input', (event) => {
  const query = event.target.value.trim().toLowerCase();
  for (const item of document.querySelectorAll('.chapter-group li'))
    item.hidden = !item.textContent.toLowerCase().includes(query);
  for (const group of document.querySelectorAll('.chapter-group'))
    group.hidden = !group.querySelector('li:not([hidden])');
  document.querySelector('#no-topics').hidden = Boolean(
    document.querySelector('.chapter-group:not([hidden])'),
  );
});
const prompt = document.querySelector('#agent-prompt');
prompt.value = agentPrompt(page, location.origin, document.body.dataset.edition);
document.querySelector('#ask-agent').addEventListener('click', (event) => {
  const panel = document.querySelector('#agent-help');
  panel.hidden = !panel.hidden;
  event.currentTarget.setAttribute('aria-expanded', !panel.hidden);
  if (!panel.hidden) prompt.focus({ preventScroll: true });
});
document.querySelector('#copy-prompt').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(prompt.value);
    document.querySelector('#copy-status').textContent = 'Copied. Paste it into your agent.';
  } catch {
    prompt.focus();
    prompt.select();
    document.querySelector('#copy-status').textContent =
      'Copy the selected prompt with your keyboard.';
  }
});
if (page.example) {
  import('./audio-example.js')
    .then(({ mountAudioExample }) =>
      mountAudioExample(document.querySelector('[data-example]'), page.example),
    )
    .catch((error) => {
      document.querySelector('[data-example-status]').textContent =
        `Example could not load: ${error.message}`;
      document.querySelector('[data-action=audio]').textContent = 'Audio unavailable';
    });
}
for (const pre of document.querySelectorAll('pre.shiki')) {
  const wrapper = document.createElement('div');
  wrapper.className = 'code-block';
  pre.before(wrapper);
  wrapper.append(pre);
  const copy = document.createElement('button');
  copy.textContent = 'Copy code';
  copy.className = 'copy-code';
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(pre.querySelector('code').textContent);
      copy.textContent = 'Copied';
      setTimeout(() => {
        copy.textContent = 'Copy code';
      }, 1500);
    } catch {
      const range = document.createRange();
      range.selectNodeContents(pre.querySelector('code'));
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      copy.textContent = 'Selected — copy with keyboard';
    }
  });
  wrapper.append(copy);
}
