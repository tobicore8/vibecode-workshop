const NAME_KEY = 'picnicPlannerName';
const TOKENS_KEY = 'picnicPlannerClaimTokens';

const id = location.pathname.replace(/^\/p\//, '').replace(/\/$/, '');

const loadingEl = document.getElementById('loading');
const notFoundEl = document.getElementById('not-found');
const viewEl = document.getElementById('picnic-view');
const nameInput = document.getElementById('your-name');
const copyLinkButton = document.getElementById('copy-link');
const countEl = document.getElementById('count');
const errorEl = document.getElementById('action-error');
const unclaimedList = document.getElementById('unclaimed');
const claimedList = document.getElementById('claimed');
const unclaimedEmpty = document.getElementById('unclaimed-empty');
const claimedEmpty = document.getElementById('claimed-empty');

// Claim tokens prove *this device* made a given claim — unlike the typed
// name, they're a secret the server only ever hands back once, to the
// claimer. Only a token match authorizes unclaiming; the name is display-only.
function loadTokens() {
  try {
    return JSON.parse(localStorage.getItem(TOKENS_KEY) || '{}');
  } catch {
    return {};
  }
}
function tokenFor(itemId) {
  return loadTokens()[`${id}:${itemId}`] || null;
}
function saveToken(itemId, token) {
  const tokens = loadTokens();
  tokens[`${id}:${itemId}`] = token;
  localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
}

nameInput.value = localStorage.getItem(NAME_KEY) || '';
nameInput.addEventListener('input', () => {
  localStorage.setItem(NAME_KEY, nameInput.value.trim());
  render(currentPicnic);
});

copyLinkButton.addEventListener('click', async () => {
  const text = location.href;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    window.prompt('Copy this link:', text);
    return;
  }
  const original = copyLinkButton.textContent;
  copyLinkButton.textContent = 'Copied';
  setTimeout(() => { copyLinkButton.textContent = original; }, 1500);
});

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = !message;
}

let currentPicnic = null;

function itemRow(item, { claimed }) {
  const li = document.createElement('li');

  const label = document.createElement('span');
  label.className = 'item-label';
  label.textContent = item.label;
  li.appendChild(label);

  const myName = nameInput.value.trim();

  if (claimed) {
    const by = document.createElement('span');
    by.className = 'claimed-by';
    by.textContent = `${item.claimedBy} is bringing this`;
    li.appendChild(by);

    if (tokenFor(item.id)) {
      const unclaim = document.createElement('button');
      unclaim.type = 'button';
      unclaim.className = 'secondary';
      unclaim.textContent = 'Unclaim';
      unclaim.addEventListener('click', () => act('unclaim', item.id));
      li.appendChild(unclaim);
    }
  } else {
    const claim = document.createElement('button');
    claim.type = 'button';
    claim.textContent = "I'll bring this";
    claim.disabled = myName.length === 0;
    claim.title = myName.length === 0 ? 'Enter your name first' : '';
    claim.addEventListener('click', () => act('claim', item.id));
    li.appendChild(claim);
  }

  return li;
}

function render(picnic) {
  currentPicnic = picnic;
  if (!picnic) return;

  document.getElementById('picnic-name').textContent = picnic.name;
  const metaParts = [picnic.date, picnic.place].filter(Boolean);
  document.getElementById('picnic-meta').textContent = metaParts.join(' · ');

  const claimed = picnic.items.filter(item => item.claimedBy);
  const unclaimed = picnic.items.filter(item => !item.claimedBy);

  countEl.textContent = `${claimed.length} of ${picnic.items.length} covered`;

  unclaimedList.replaceChildren(...unclaimed.map(item => itemRow(item, { claimed: false })));
  claimedList.replaceChildren(...claimed.map(item => itemRow(item, { claimed: true })));

  unclaimedEmpty.hidden = unclaimed.length !== 0;
  claimedEmpty.hidden = claimed.length !== 0;
}

async function act(action, itemId) {
  const name = nameInput.value.trim();
  if (action === 'claim' && !name) {
    showError('Enter your name first.');
    nameInput.focus();
    return;
  }
  showError('');
  try {
    const payload = action === 'claim'
      ? { name, claimToken: tokenFor(itemId) }
      : { claimToken: tokenFor(itemId) };
    const response = await fetch(`/api/picnics/${id}/items/${itemId}/${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => null);
    if (response.status === 409) {
      showError(body?.error || 'Someone beat you to it.');
      if (body?.picnic) render(body.picnic);
      return;
    }
    if (!response.ok) {
      showError(body?.error || 'That didn’t work. Try again.');
      return;
    }
    if (action === 'claim' && body.claimToken) saveToken(itemId, body.claimToken);
    render(body.picnic);
  } catch {
    showError('Could not reach the server. Check your connection and try again.');
  }
}

async function load() {
  try {
    const response = await fetch(`/api/picnics/${id}`);
    if (response.status === 404) {
      loadingEl.hidden = true;
      notFoundEl.hidden = false;
      return;
    }
    if (!response.ok) throw new Error('unexpected status');
    const body = await response.json();
    loadingEl.hidden = true;
    viewEl.hidden = false;
    render(body.picnic);
  } catch {
    loadingEl.hidden = true;
    notFoundEl.hidden = false;
    document.querySelector('#not-found h1').textContent = 'Couldn’t load this picnic.';
    document.querySelector('#not-found .intro').textContent = 'Check your connection and reload the page.';
  }
}

load();
