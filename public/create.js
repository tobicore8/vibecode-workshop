const MAX_ITEMS = 50;
const itemsList = document.getElementById('items');
const addItemButton = document.getElementById('add-item');
const form = document.getElementById('create-form');
const errorEl = document.getElementById('form-error');
const submitButton = document.getElementById('submit');

function addItemRow(value = '') {
  if (itemsList.children.length >= MAX_ITEMS) return;
  const li = document.createElement('li');

  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 80;
  input.placeholder = 'e.g. Cups';
  input.value = value;
  input.className = 'item-input';

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'remove-item';
  remove.setAttribute('aria-label', 'Remove item');
  remove.textContent = '×';
  remove.addEventListener('click', () => {
    li.remove();
    if (itemsList.children.length === 0) addItemRow();
  });

  li.append(input, remove);
  itemsList.appendChild(li);
  return input;
}

addItemButton.addEventListener('click', () => {
  const input = addItemRow();
  if (input) input.focus();
});

addItemRow();
addItemRow();
addItemRow();

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function clearError() {
  errorEl.hidden = true;
  errorEl.textContent = '';
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  clearError();

  const name = document.getElementById('name').value.trim();
  const date = document.getElementById('date').value;
  const time = document.getElementById('time').value;
  const place = document.getElementById('place').value.trim();
  const items = [...itemsList.querySelectorAll('.item-input')]
    .map(input => input.value.trim())
    .filter(Boolean);

  if (!name) return showError('Give the picnic a name.');
  if (items.length === 0) return showError('Add at least one thing that’s needed.');

  submitButton.disabled = true;
  try {
    const response = await fetch('/api/picnics', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, date, time, place, items }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      showError(body?.error || 'Could not create the picnic. Try again.');
      return;
    }
    location.href = `/p/${body.picnic.id}`;
  } catch {
    showError('Could not reach the server. Check your connection and try again.');
  } finally {
    submitButton.disabled = false;
  }
});
