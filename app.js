const COOKIE_NAME = 'yt_channels';
const MAX_SLOTS = 9;

const gridEl = document.getElementById('grid');
const channelsListEl = document.getElementById('channels-list');
const addBtn = document.getElementById('add-channel');
const shareBtn = document.getElementById('share-link');

let channelData = loadChannelsFromCookie();
let gridSlots = [];
let players = {}; // idx -> YT.Player

// --- Load from query ---
(function loadFromQuery() {
    const p = new URLSearchParams(location.search);
    if (!p.has('list')) return;
    try {
        const arr = JSON.parse(atob(p.get('list')));
        if (Array.isArray(arr)) channelData = arr;
        saveChannelsToCookie();
    } catch (e) { console.warn(e); }
    history.replaceState({}, document.title, location.pathname);
})();

// --- Cookies ---
function saveChannelsToCookie() {
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(JSON.stringify(channelData))};path=/;max-age=${365 * 24 * 3600}`;
}
function loadChannelsFromCookie() {
    try {
        const c = document.cookie.split(';').find(c => c.trim().startsWith(COOKIE_NAME + '='));
        if (!c) return [];
        return JSON.parse(decodeURIComponent(c.split('=')[1]));
    } catch { return []; }
}

// --- Utils ---
function extractYouTubeId(url) {
    if (!url) return null;
    const s = url.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
    let m = s.match(/[?&]v=([a-zA-Z0-9_-]{11})/); if (m) return m[1];
    m = s.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/); if (m) return m[1];
    m = s.match(/\/embed\/([a-zA-Z0-9_-]{11})/); if (m) return m[1];
    m = s.match(/([a-zA-Z0-9_-]{11})$/); if (m) return m[1];
    return null;
}

// --- Sidebar ---
function renderSidebar() {
    channelsListEl.innerHTML = '';
    channelData.forEach((c, i) => {
        const item = document.createElement('div');
        item.className = 'channel-item'; item.draggable = true;
        item.dataset.index = i;

        const img = document.createElement('img'); img.className = 'thumb';
        img.src = c.thumb || `https://i.ytimg.com/vi/${c.id}/hqdefault.jpg`; img.alt = c.title;

        const info = document.createElement('div'); info.className = 'channel-info';
        info.innerHTML = `<div class="name">${c.title || c.id}</div><div class="meta">${c.raw || ''}</div>`;

        const actions = document.createElement('div'); actions.className = 'item-actions';
        const toGrid = document.createElement('button'); toGrid.textContent = '▶'; toGrid.className = 'icon-btn';
        toGrid.title = 'Adicionar ao grid'; toGrid.onclick = () => addToGrid(c.id);
        const remove = document.createElement('button'); remove.textContent = '🗑️'; remove.className = 'icon-btn';
        remove.title = 'Remover canal';
        remove.onclick = () => {
            if (!confirm('Remover este canal?')) return;
            channelData.splice(i, 1);
            gridSlots = gridSlots.filter(g => g.vid !== c.id);
            cleanupPlayers(); renderGrid(); renderSidebar(); saveChannelsToCookie();
        };
        actions.appendChild(toGrid); actions.appendChild(remove);

        item.appendChild(img); item.appendChild(info); item.appendChild(actions);
        channelsListEl.appendChild(item);

        item.addEventListener('dragstart', ev => ev.dataTransfer.setData('text/plain', i));
    });
}

// --- Grid ---
function decideGridClass(n) {
    if (n === 1) return 'cols-1';
    if (n === 2) return 'cols-2';
    if (n === 3 || n === 4) return 'cols-4';
    if (n === 5 || n === 6) return 'cols-5';
    return 'cols-6';
}

function renderGrid() {
    gridEl.className = 'grid ' + decideGridClass(gridSlots.length);
    gridSlots.forEach((slot, idx) => {
        let el = document.querySelector(`.slot[data-slot="${idx}"]`);
        if (!el) {
            el = document.createElement('div'); el.className = 'slot'; el.dataset.slot = idx;
            const label = document.createElement('div'); label.className = 'label'; label.textContent = slot.title || slot.vid;
            const wrap = document.createElement('div'); wrap.className = 'player-wrap';
            const playerDiv = document.createElement('div'); playerDiv.id = `player_${idx}`;
            wrap.appendChild(playerDiv); el.appendChild(label); el.appendChild(wrap);

            const controls = document.createElement('div'); controls.className = 'controls';
            const playBtn = document.createElement('button'); playBtn.textContent = '▶'; playBtn.className = 'play-btn';
            playBtn.onclick = () => togglePlay(idx);
            const muteBtn = document.createElement('button'); muteBtn.textContent = '🔈';
            muteBtn.onclick = () => toggleMute(idx);
            const vol = document.createElement('input'); vol.type = 'range'; vol.min = 0; vol.max = 100; vol.value = 100;
            vol.className = 'slider'; vol.oninput = e => setVolume(idx, Number(e.target.value));
            const removeBtn = document.createElement('button'); removeBtn.textContent = 'Remover';
            removeBtn.onclick = () => { gridSlots.splice(idx, 1); cleanupPlayers(); renderGrid(); };
            controls.append(playBtn, muteBtn, vol, removeBtn); el.appendChild(controls);

            gridEl.appendChild(el);
        } else {
            el.querySelector('.label').textContent = slot.title || slot.vid;
        }
    });
    ensureYouTubeApiReady().then(initPlayersForGrid);
}

// --- Add to grid ---
function addToGrid(vid) {
    if (gridSlots.some(g => g.vid === vid)) return alert('Já está no grid.');
    if (gridSlots.length >= MAX_SLOTS) return alert('Limite de slots atingido.');
    const c = channelData.find(c => c.id === vid);
    gridSlots.push({ vid, title: c?.title || vid });
    renderGrid(); saveChannelsToCookie();
}

// --- YouTube API ---
let ytReadyResolve; const ytReadyPromise = new Promise(res => { ytReadyResolve = res; });
function onYouTubeIframeAPIReady() { ytReadyResolve(true); }
window.onYouTubeIframeAPIReady = onYouTubeIframeAPIReady;
function ensureYouTubeApiReady() { return ytReadyPromise; }

function initPlayersForGrid() {
    gridSlots.forEach((slot, idx) => {
        const el = document.getElementById(`player_${idx}`);
        if (!el) return;
        if (players[idx]) {
            // Mantém o player sem destruir
            if (players[idx].getVideoData().video_id !== slot.vid)
                players[idx].loadVideoById(slot.vid);
        } else {
            players[idx] = new YT.Player(el.id, {
                width: '100%', height: '100%', videoId: slot.vid,
                playerVars: { autoplay: 1, controls: 1, modestbranding: 1, rel: 0, enablejsapi: 1, mute: 1 },
                events: {
                    onReady: e => { try { e.target.playVideo(); e.target.setVolume(100); updatePlayButton(idx); } catch { } },
                    onStateChange: () => updatePlayButton(idx)
                }
            });
        }
    });
}

function updatePlayButton(idx) {
    const p = players[idx]; if (!p) return;
    const btn = document.querySelector(`.slot[data-slot="${idx}"] .play-btn`);
    if (!btn) return;
    btn.textContent = p.getPlayerState() === YT.PlayerState.PLAYING ? '⏸' : '▶';
}

function togglePlay(idx) {
    const p = players[idx]; if (!p) return;
    const state = p.getPlayerState();
    if (state === YT.PlayerState.PLAYING) p.pauseVideo(); else p.playVideo();
    updatePlayButton(idx);
}

function toggleMute(idx) {
    const p = players[idx]; if (!p) return;
    const btn = document.querySelector(`.slot[data-slot="${idx}"] .controls button:nth-child(2)`);
    if (p.isMuted()) { p.unMute(); btn.textContent = '🔈'; } else { p.mute(); btn.textContent = '🔇'; }
}

function setVolume(idx, v) {
    const p = players[idx]; if (!p) return;
    const btn = document.querySelector(`.slot[data-slot="${idx}"] .controls button:nth-child(2)`);
    p.setVolume(v);
    if (v > 0) { p.unMute(); btn.textContent = '🔈'; } else { p.mute(); btn.textContent = '🔇'; }
}

function cleanupPlayers() { for (const k in players) { try { players[k].destroy(); } catch { } } players = {}; }

// --- Add channel ---
addBtn.onclick = () => {
    const url = prompt('Cole o link da live do YouTube (ou ID):'); if (!url) return;
    const id = extractYouTubeId(url); if (!id) return alert('ID inválido.');
    if (channelData.some(c => c.id === id)) return alert('Já adicionado.');
    const thumb = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    const newChannel = { id, title: '', thumb, raw: url };
    channelData.push(newChannel);

    // Usar título da live ou canal
    newChannel.title = `Live ${id}`; // opcional: pode ser buscado via API YouTube
    saveChannelsToCookie(); renderSidebar();
};

// --- Share ---
shareBtn.onclick = () => {
    const encoded = btoa(JSON.stringify(channelData));
    const u = new URL(location.href); u.searchParams.set('list', encoded);
    navigator.clipboard.writeText(u.toString()).then(() => alert('Link copiado!'));
};

// --- Dragdrop ---
gridEl.addEventListener('dragover', ev => ev.preventDefault());
gridEl.addEventListener('drop', ev => {
    ev.preventDefault();
    const idxChannel = ev.dataTransfer.getData('text/plain');
    const c = channelData[Number(idxChannel)];
    if (!c) return;
    addToGrid(c.id);
});

// --- Inicial ---
renderSidebar(); renderGrid();
