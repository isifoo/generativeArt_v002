// NODE BOARD (v3.0.1): a chart of every node, built or wished for, that Gerry and Claude both write in.
// Rows are edited here. "Link file" connects the board to docs/NODE_BOARD.json on this computer (File System Access, Chrome / Edge): every edit is written to that file,
// and Claude reads the same file when answering. Without a linked file the board is kept in the browser and can be exported / imported.
const STATUS = [['idea', 'Idea'], ['wanted', 'Gerry wants it'], ['planned', 'Planned'], ['built', 'Built'], ['fix', 'Needs a fix'], ['dropped', 'Dropped']];
const FAMS = ['Source', 'Image', 'Distort', 'Composite', 'Time', 'Colour', 'Line', 'Path', 'Draw', 'Output', 'Other'];
const KEY = 'v3.board.v1';
const idb = (mode, fn) => new Promise((res, rej) => {
  const r = indexedDB.open('v3files', 1); r.onupgradeneeded = () => r.result.createObjectStore('h');
  r.onsuccess = () => { const t = r.result.transaction('h', mode), q = fn(t.objectStore('h')); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); };
  r.onerror = () => rej(r.error);
});

export function createBoard(root) {
  let data = { v: 1, rows: [] }, handle = null, filter = 'all', saveT = 0, note = '';
  const lsGet = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
  const lsSet = () => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* blocked */ } };
  root.innerHTML = `<div class="bd-bar">
  <b>Node board</b><span class="bd-file note"></span>
  <button type="button" data-a="add">+ Add a node idea</button>
  <button type="button" data-a="link" title="Choose docs/NODE_BOARD.json so Claude reads the same chart">Link file</button>
  <button type="button" data-a="reload" title="Read the file again (Claude may have changed it)">Reload from file</button>
  <button type="button" data-a="export">Export</button><button type="button" data-a="import">Import</button><input type="file" accept=".json,application/json" hidden>
  <button type="button" data-a="close" class="bd-x">Close</button></div>
<div class="bd-chips"></div><div class="bd-wrap"><table class="bd-t"><thead><tr><th>Node</th><th>Family</th><th>Takes in</th><th>Gives out</th><th>What it does</th><th>Status</th><th>By</th><th>Notes (Gerry and Claude)</th><th></th></tr></thead><tbody></tbody></table></div>
<p class="note bd-help">Write what you want in plain words. Claude reads this chart (file docs/NODE_BOARD.json) at every answer, answers in the Notes column, and sets the status. Status Needs a fix = something built does not work.</p>`;
  const $ = (s) => root.querySelector(s), tbody = $('tbody'), fileEl = $('.bd-file');
  const uid = () => 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const stamp = () => new Date().toISOString().slice(0, 16).replace('T', ' ');

  function setNote(t) { note = t; fileEl.textContent = (handle ? 'Linked: ' + handle.name + (t ? ' · ' + t : '') : 'Not linked (kept in this browser)' + (t ? ' · ' + t : '')); }
  async function granted(ask) {
    if (!handle) return false;
    try { if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') return true; if (ask && (await handle.requestPermission({ mode: 'readwrite' })) === 'granted') return true; } catch { /* no permission API */ }
    return false;
  }
  async function writeFile() {
    if (!(await granted(false))) { setNote('click Link file / Reload to allow writing'); return; }
    try { const w = await handle.createWritable(); await w.write(JSON.stringify(data, null, 1)); await w.close(); setNote('saved ' + new Date().toLocaleTimeString()); } catch (e) { setNote('save failed: ' + e.message); }
  }
  function changed() { data.updated = stamp(); lsSet(); clearTimeout(saveT); saveT = setTimeout(writeFile, 500); }
  async function readFile(ask) {
    if (!(await granted(ask))) return false;
    try { const o = JSON.parse(await (await handle.getFile()).text()); if (o && Array.isArray(o.rows)) { data = o; lsSet(); render(); setNote('read ' + new Date().toLocaleTimeString()); return true; } } catch (e) { setNote('read failed: ' + e.message); }
    return false;
  }

  function render() {
    const counts = {}; for (const r of data.rows) counts[r.status] = (counts[r.status] || 0) + 1;
    $('.bd-chips').innerHTML = [['all', 'All'], ...STATUS].map(([k, l]) => `<button type="button" data-f="${k}" class="${filter === k ? 'on' : ''}">${l}${k === 'all' ? ' ' + data.rows.length : counts[k] ? ' ' + counts[k] : ''}</button>`).join('');
    tbody.textContent = '';
    for (const r of data.rows) {
      if (filter !== 'all' && r.status !== filter) continue;
      const tr = document.createElement('tr'); tr.dataset.id = r.id; tr.className = 'st-' + r.status;
      const inp = (k, ph) => `<input data-k="${k}" value="" placeholder="${ph || ''}">`, ta = (k) => `<textarea data-k="${k}" rows="2"></textarea>`;
      tr.innerHTML = `<td>${inp('name', 'Name')}</td><td><select data-k="family">${FAMS.map((f) => `<option>${f}</option>`).join('')}</select></td><td>${inp('ins')}</td><td>${inp('outs')}</td><td>${ta('does')}</td>
        <td><select data-k="status">${STATUS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></td><td><select data-k="by"><option>Gerry</option><option>Claude</option></select></td><td>${ta('notes')}</td><td><button type="button" data-a="del" title="Remove this row">x</button></td>`;
      for (const el of tr.querySelectorAll('[data-k]')) el.value = r[el.dataset.k] ?? '';
      tbody.append(tr);
    }
  }
  root.addEventListener('input', (e) => { const el = e.target.closest('[data-k]'); if (!el) return; const r = data.rows.find((x) => x.id === el.closest('tr').dataset.id); if (r) { r[el.dataset.k] = el.value; changed(); if (el.dataset.k === 'status') el.closest('tr').className = 'st-' + el.value; } });
  root.addEventListener('click', async (e) => {
    const f = e.target.closest('[data-f]'); if (f) { filter = f.dataset.f; render(); return; }
    const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a;
    if (a === 'add') { data.rows.unshift({ id: uid(), name: '', family: 'Image', ins: '', outs: 'Image', does: '', status: 'wanted', by: 'Gerry', notes: '' }); filter = 'all'; render(); changed(); tbody.querySelector('input')?.focus(); }
    else if (a === 'del') { const id = b.closest('tr').dataset.id; data.rows = data.rows.filter((x) => x.id !== id); render(); changed(); }
    else if (a === 'link') {
      if (!window.showOpenFilePicker) { setNote('this browser cannot link a file (use Chrome or Edge); use Export / Import'); return; }
      try { [handle] = await window.showOpenFilePicker({ types: [{ description: 'Node board', accept: { 'application/json': ['.json'] } }] }); await idb('readwrite', (s) => s.put(handle, 'board')); setNote(''); if (!(await readFile(true))) await writeFile(); } catch { /* cancelled */ }
    }
    else if (a === 'reload') { if (handle) { if (!(await readFile(true))) setNote('could not read: allow access'); } else setNote('no file linked'); }
    else if (a === 'export') { const u = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' })), l = document.createElement('a'); l.href = u; l.download = 'NODE_BOARD.json'; l.click(); setTimeout(() => URL.revokeObjectURL(u), 2000); }
    else if (a === 'import') $('input[type=file]').click();
    else if (a === 'close') root.hidden = true;
  });
  $('input[type=file]').addEventListener('change', async (e) => { const f = e.target.files[0]; if (!f) return; try { const o = JSON.parse(await f.text()); if (Array.isArray(o.rows)) { data = o; lsSet(); render(); changed(); } } catch { setNote('not a board file'); } e.target.value = ''; });

  (async () => {                                                  // start: the linked file if allowed, else the browser copy, else the shipped docs/NODE_BOARD.json
    try { handle = await idb('readonly', (s) => s.get('board')); } catch { handle = null; }
    setNote('');
    if (handle && (await readFile(false))) return;
    const saved = lsGet(); if (saved && Array.isArray(saved.rows)) { data = saved; if (handle) setNote('click Reload from file to read the linked file'); }
    else { try { data = await (await fetch('docs/NODE_BOARD.json', { cache: 'no-store' })).json(); } catch { /* empty board */ } }
    render();
  })();
  return { open() { root.hidden = false; }, toggle() { root.hidden = !root.hidden; } };
}
