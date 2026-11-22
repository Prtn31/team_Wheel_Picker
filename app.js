const savedRosters = Object.fromEntries(Object.entries(WheelPicker.SETS).map(([name, items]) => [name, [...items]]));
const pickers = Object.fromEntries(Object.entries(savedRosters).map(([name, items]) => [name, new WheelPicker.Picker(items)]));
const gameEdits = Object.fromEntries(Object.keys(savedRosters).map(name => [name, { added: new Map(), removed: new Set() }]));
let currentSet = '12OAD';
let picker = pickers[currentSet];
const canvas = document.getElementById('wheel');
const context = canvas.getContext('2d');
const spinButton = document.getElementById('spin-button');
const finalPickButton = document.getElementById('final-pick-button');
const resetButton = document.getElementById('reset-button');
const finalPickDisplay = document.getElementById('final-pick-display');
const finalPickName = document.getElementById('final-pick-name');
const resultList = document.getElementById('result-list');
const remainingCount = document.getElementById('remaining-count');
const hint = document.getElementById('wheel-hint');
const setHeading = document.getElementById('set-heading');
const setButtons = document.querySelectorAll('.set-button');
const addForm = document.getElementById('add-form');
const nameInput = document.getElementById('name-input');
const formMessage = document.getElementById('form-message');
const namesList = document.getElementById('names-list');
const namesCount = document.getElementById('names-count');
const manageSet = document.getElementById('manage-set');
const manageToggle = document.getElementById('manage-toggle');
const manageContent = document.getElementById('manage-content');
const sharedScope = document.getElementById('shared-scope');
const connectionStatus = document.getElementById('connection-status');
const winnerAnnouncement = document.getElementById('winner-announcement');
const winnerMessage = document.getElementById('winner-message');
const pickOverlay = document.getElementById('pick-overlay');
const pickName = document.getElementById('pick-name');
const pickCaption = document.getElementById('pick-caption');
const wheelColors = [
  '#f5ae56', '#a9c5b9', '#ed9985', '#a8bf89', '#f3d37e', '#a6c5d4',
  '#efba99', '#b4c9a2', '#e9c695', '#90bdb3', '#dfa695', '#c3cf9b',
  '#e9bf78', '#a1c3c6', '#d9b1a2', '#a4c4a4', '#f1c99b', '#a1b7c8',
  '#dba58c', '#bdd5bf', '#e5bfab', '#aabfa3', '#e6d096', '#a8c9cd'
];
const spinDuration = 4800;
let rotation = 0;
let spinning = false;
let spinTimer = null;
let pickOverlayTimer = null;
let saving = false;
let revision = 0;
let refreshPromise = null;

manageToggle.addEventListener('click', () => {
  const expanded = manageContent.hidden;
  manageContent.hidden = !expanded;
  manageToggle.setAttribute('aria-expanded', String(expanded));
  manageToggle.firstChild.textContent = expanded ? 'Collapse ' : 'Expand ';
  manageToggle.querySelector('span').textContent = expanded ? '⌃' : '⌄';
});

function colorFor(item) {
  // Use the full roster so a person's color stays the same as names are picked.
  const index = Math.max(wheelItems(picker.originalItems).indexOf(item), 0);
  if (index < wheelColors.length) return wheelColors[index];
  // Extra names get muted hues from red through blue, avoiding purple.
  const hue = (15 + (index - wheelColors.length) * 137.508) % 235;
  return `hsl(${hue.toFixed(3)}, 38%, 78%)`;
}

function nameKey(name) {
  return name.toLowerCase();
}

function reconcile(setName) {
  const edits = gameEdits[setName];
  const desired = savedRosters[setName].filter(item => !edits.removed.has(nameKey(item)));
  for (const [key, item] of edits.added) {
    if (!desired.some(existing => nameKey(existing) === key)) desired.push(item);
  }
  const set = pickers[setName];
  if (JSON.stringify(set.originalItems) === JSON.stringify(desired)) return false;
  for (const item of [...set.originalItems]) if (!desired.includes(item)) set.remove(item);
  for (const item of desired) if (!set.originalItems.includes(item)) set.add(item);
  set.originalItems = [...desired];
  return true;
}

function showConnection(connected) {
  sharedScope.disabled = !connected;
  if (!connected && sharedScope.checked) document.querySelector('input[name="edit-scope"][value="game"]').checked = true;
  const message = connected ? 'Shared database connected. Changes sync automatically.' : 'Shared database unavailable. Only game-only changes are available.';
  if (connectionStatus.textContent !== message) connectionStatus.textContent = message;
}

async function refreshRosters() {
  if (saving) return false;
  if (refreshPromise) return refreshPromise;
  const startedAt = revision;
  refreshPromise = (async () => {
    try {
      const response = await fetch('/api/rosters', { cache: 'no-store' });
      if (!response.ok) throw new Error('Database unavailable');
      const data = await response.json();
      if (saving || startedAt !== revision) return false;
      for (const name of Object.keys(savedRosters)) {
        if (!Array.isArray(data[name]) || !data[name].every(item => typeof item === 'string')) throw new Error('Invalid roster');
      }
      let activeChanged = false;
      let anyChanged = false;
      for (const name of Object.keys(savedRosters)) {
        savedRosters[name] = [...data[name]];
        if (reconcile(name)) {
          anyChanged = true;
          if (name === currentSet) activeChanged = true;
        }
      }
      if (activeChanged) {
        const wasSpinning = spinning;
        stopSpin();
        winnerAnnouncement.hidden = true;
        drawWheel();
        if (wasSpinning) formMessage.textContent = 'Shared names changed; the current spin was cancelled.';
      }
      showConnection(true);
      if (anyChanged) update();
      return true;
    } catch (error) {
      showConnection(false);
      return false;
    }
  })();
  try { return await refreshPromise; } finally { refreshPromise = null; }
}

async function editName(action, name) {
  const setName = currentSet;
  const shared = sharedScope.checked;
  const key = nameKey(name);
  if (!name || name.length > 60) throw new Error('Enter a name between 1 and 60 characters.');
  if (saving) throw new Error('Please wait for the current save to finish.');
  if (shared) {
    saving = true;
    revision++;
    try {
      const response = await fetch(`/api/rosters/${encodeURIComponent(setName)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, name })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save this change.');
      savedRosters[setName] = data.members;
      gameEdits[setName].added.delete(key);
      gameEdits[setName].removed.delete(key);
      showConnection(true);
    } finally {
      saving = false;
      revision++;
    }
  } else {
    const edits = gameEdits[setName];
    const exists = pickers[setName].originalItems.some(item => nameKey(item) === key);
    if (action === 'add' && exists) throw new Error('That name is already in this set.');
    if (action === 'add') {
      edits.removed.delete(key);
      if (!savedRosters[setName].some(item => nameKey(item) === key)) edits.added.set(key, name);
    } else {
      edits.added.delete(key);
      if (savedRosters[setName].some(item => nameKey(item) === key)) edits.removed.add(key);
    }
  }
  if (reconcile(setName) && setName === currentSet) {
    stopSpin();
    winnerAnnouncement.hidden = true;
    drawWheel();
  }
  update();
  formMessage.textContent = `${name} ${action === 'add' ? 'added to' : 'removed from'} ${setName} ${shared ? 'for everyone' : 'for this game only'}.`;
}

function hidePickOverlay() {
  window.clearTimeout(pickOverlayTimer);
  pickOverlayTimer = null;
  pickOverlay.hidden = true;
}

function showPickOverlay(result) {
  hidePickOverlay();
  pickName.textContent = result.selected;
  pickCaption.textContent = result.isFinal ? 'is the final pick!' : 'has been picked!';
  pickOverlay.hidden = false;
  pickOverlayTimer = window.setTimeout(hidePickOverlay, 4000);
}

function announcePick(result) {
  winnerMessage.textContent = result.isFinal ? `Final pick: ${result.selected}!` : `${result.selected} was picked!`;
  winnerAnnouncement.hidden = false;
  winnerAnnouncement.classList.remove('celebrate');
  void winnerAnnouncement.offsetWidth;
  winnerAnnouncement.classList.add('celebrate');
  showPickOverlay(result);
}

function stopSpin() {
  hidePickOverlay();
  window.clearTimeout(spinTimer);
  spinTimer = null;
  spinning = false;
  rotation = 0;
  canvas.style.transition = 'none';
  canvas.style.transform = 'rotate(0deg)';
}

function wheelItems(roster = picker.remaining) {
  if (currentSet !== '12OAD') return [...roster];
  const indianNames = new Set(WheelPicker.SETS['12INOAD'].map(nameKey));
  const germanNames = new Set(WheelPicker.SETS['12OAD German'].map(nameKey));
  const groups = [[], [], []];
  for (const item of roster) {
    const key = nameKey(item);
    groups[indianNames.has(key) ? 0 : germanNames.has(key) ? 1 : 2].push(item);
  }
  const items = [];
  for (let index = 0; index < Math.max(...groups.map(group => group.length)); index++) {
    for (const group of groups) if (index < group.length) items.push(group[index]);
  }
  return items;
}

function drawWheel() {
  const items = wheelItems();
  const center = canvas.width / 2;
  const radius = center - 5;
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (!items.length) {
    context.beginPath();
    context.arc(center, center, radius, 0, Math.PI * 2);
    context.fillStyle = '#e8eee1';
    context.fill();
    if (picker.picks.length) {
      context.fillStyle = '#526b53';
      context.font = 'bold 48px Georgia, serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText('ALL PICKED', center, center + radius * 0.4);
      canvas.setAttribute('aria-label', 'All names have been picked');
    } else {
      canvas.setAttribute('aria-label', 'Empty wheel; add names to get started');
    }
    return;
  }
  if (items.length === 1) {
    context.beginPath();
    context.arc(center, center, radius, 0, Math.PI * 2);
    context.fillStyle = colorFor(items[0]);
    context.fill();
    context.fillStyle = '#25352b';
    context.font = 'bold 52px Georgia, serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(items[0], center, center + radius * 0.4, radius * 1.5);
    canvas.setAttribute('aria-label', `Wheel containing ${items[0]}`);
    return;
  }
  const segment = Math.PI * 2 / items.length;
  items.forEach((item, index) => {
    const start = -Math.PI / 2 + index * segment;
    const middle = start + segment / 2;
    context.beginPath();
    context.moveTo(center, center);
    context.arc(center, center, radius, start, start + segment);
    context.closePath();
    context.fillStyle = colorFor(item);
    context.fill();
    context.strokeStyle = '#fffaf0';
    context.lineWidth = items.length > 12 ? 2 : 4;
    context.stroke();
    context.save();
    context.translate(center, center);
    context.rotate(middle);
    context.translate(radius * 0.72, 0);
    if (Math.cos(middle) < 0) context.rotate(Math.PI);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = '#25352b';
    // Scale labels down only as the number of segments increases.
    const fontSize = Math.max(8, Math.min(42, Math.floor(740 / items.length)));
    context.font = `bold ${fontSize}px Georgia, serif`;
    context.fillText(item, 0, 0, radius * 0.48);
    context.restore();
  });
  canvas.setAttribute('aria-label', `Wheel containing ${items.join(', ')}`);
}

function renderResults() {
  resultList.replaceChildren();
  if (!picker.picks.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = '<div class="empty-icon">✧</div><strong>Nothing picked yet</strong><span>Give the wheel a spin to get started.</span>';
    resultList.appendChild(empty);
    return;
  }
  picker.picks.map((item, index) => ({ item, index })).reverse().forEach(({ item, index }) => {
    const row = document.createElement('div');
    row.className = 'result-row';
    const icon = document.createElement('span');
    icon.className = 'result-icon';
    icon.style.backgroundColor = colorFor(item);
    icon.textContent = item.charAt(0);
    const text = document.createElement('span');
    text.className = 'result-text';
    const label = document.createElement('small');
    label.textContent = item === picker.finalPick ? 'THE FINAL PICK' : `PICK ${String(index + 1).padStart(2, '0')}`;
    const name = document.createElement('strong');
    name.textContent = item;
    text.append(label, name);
    const check = document.createElement('span');
    check.className = 'result-check';
    check.textContent = '✓';
    row.append(icon, text, check);
    resultList.appendChild(row);
  });
  resultList.scrollTop = 0;
}

function renderNames() {
  namesList.replaceChildren();
  namesCount.textContent = `${picker.originalItems.length} ${picker.originalItems.length === 1 ? 'name' : 'names'}`;
  manageSet.textContent = currentSet;
  if (!picker.originalItems.length) {
    const empty = document.createElement('span');
    empty.className = 'names-empty';
    empty.textContent = 'No names in this set yet.';
    namesList.appendChild(empty);
    return;
  }
  picker.originalItems.forEach(item => {
    const chip = document.createElement('span');
    chip.className = 'name-chip';
    const text = document.createElement('span');
    text.textContent = item;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '×';
    remove.setAttribute('aria-label', `Remove ${item} from ${currentSet}`);
    remove.addEventListener('click', async () => {
      try { await editName('remove', item); } catch (error) { formMessage.textContent = error.message || 'Could not update the name.'; }
    });
    chip.append(text, remove);
    namesList.appendChild(chip);
  });
}

function update() {
  const remaining = picker.remaining.length;
  const done = remaining === 0 && picker.picks.length > 0;
  remainingCount.textContent = done ? 'ALL PICKED' : `${remaining} REMAINING`;
  spinButton.hidden = remaining <= 1;
  spinButton.disabled = spinning;
  finalPickButton.hidden = remaining !== 1;
  finalPickButton.disabled = spinning;
  finalPickDisplay.hidden = !done || picker.finalPick === null;
  finalPickName.textContent = picker.finalPick === null ? '' : `${picker.finalPick} was picked!`;
  hint.textContent = done ? 'That’s a wrap! Reset this wheel to play again.' : !remaining ? 'Add names to get started.' : remaining === 1 ? 'One name left. Select Final pick to reveal them.' : spinning ? 'Round and round we go...' : 'Each name can only be picked once per set.';
  setHeading.textContent = `${currentSet} LINEUP`;
  setButtons.forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.set === currentSet));
    const count = pickers[button.dataset.set].originalItems.length;
    button.querySelector('span').textContent = `${count} ${count === 1 ? 'name' : 'names'}`;
  });
  renderResults();
  renderNames();
}

setButtons.forEach(button => button.addEventListener('click', () => {
  if (button.dataset.set === currentSet) return;
  stopSpin();
  winnerAnnouncement.hidden = true;
  currentSet = button.dataset.set;
  picker = pickers[currentSet];
  formMessage.textContent = '';
  nameInput.value = '';
  drawWheel();
  update();
}));

addForm.addEventListener('submit', async event => {
  event.preventDefault();
  const name = nameInput.value.trim();
  try {
    await editName('add', name);
    nameInput.value = '';
  } catch (error) {
    formMessage.textContent = error.message || 'Could not update the name.';
  }
});

spinButton.addEventListener('click', () => {
  if (spinning || picker.remaining.length <= 1) return;
  hidePickOverlay();
  winnerAnnouncement.hidden = true;
  // Leave the previous result visible until the next spin begins.
  canvas.style.transition = 'none';
  rotation = 0;
  canvas.style.transform = 'rotate(0deg)';
  drawWheel();
  void canvas.offsetWidth; // Apply the reset before starting a new transition.
  spinning = true;
  update();
  const items = wheelItems();
  const index = WheelPicker.randomIndex(items.length);
  const selected = items[index];
  const segment = 360 / items.length;
  // The chosen segment's center must finish beneath the pointer at twelve o'clock.
  const target = ((-(index + 0.5) * segment) % 360 + 360) % 360;
  const current = ((rotation % 360) + 360) % 360;
  rotation += 360 * 5 + ((target - current + 360) % 360);
  canvas.style.transition = `transform ${spinDuration}ms cubic-bezier(0.15, 0.7, 0.12, 1)`;
  canvas.style.transform = `rotate(${rotation}deg)`;
  spinTimer = window.setTimeout(() => {
    const result = picker.pick(picker.remaining.indexOf(selected));
    spinning = false;
    spinTimer = null;
    if (picker.remaining.length === 1) {
      canvas.style.transition = 'none';
      rotation = 0;
      canvas.style.transform = 'rotate(0deg)';
      drawWheel();
    }
    update();
    announcePick(result);
  }, spinDuration);
});

finalPickButton.addEventListener('click', () => {
  if (spinning || picker.remaining.length !== 1) return;
  hidePickOverlay();
  const result = picker.pickFinal();
  drawWheel();
  update();
  announcePick(result);
});

resetButton.addEventListener('click', async () => {
  const setName = currentSet;
  stopSpin();
  winnerAnnouncement.hidden = true;
  const connected = await refreshRosters();
  gameEdits[setName].added.clear();
  gameEdits[setName].removed.clear();
  pickers[setName] = new WheelPicker.Picker(savedRosters[setName]);
  picker = pickers[currentSet];
  if (setName === currentSet) drawWheel();
  formMessage.textContent = connected ? `${setName} reset to the saved names.` : `${setName} reset to the last available names; the database could not be reached.`;
  update();
});

drawWheel();
update();
refreshRosters();
window.setInterval(refreshRosters, 4000);