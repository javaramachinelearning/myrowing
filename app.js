let localCacheData = [];
let currentSortKey = 'date';
let isAscending = false;

window.addEventListener('DOMContentLoaded', () => initApp());

// [함수: 시간 포맷팅]
function formatPm5Time(rawDeciseconds) {
    if (isNaN(rawDeciseconds)) return "--:--";
    const totalSeconds = Number(rawDeciseconds) / 10;
    const mins = Math.floor(totalSeconds / 60);
    const secs = Math.floor(totalSeconds % 60);
    const tenths = Math.round((totalSeconds % 1) * 10) % 10;
    return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}.${tenths}` : `:${secs.toString().padStart(2, '0')}.${tenths}`;
}

// [함수: 페이스 포맷팅]
function formatPm5Pace(paceInDeciseconds) {
    if (!paceInDeciseconds || isNaN(paceInDeciseconds)) return "--:--";
    const totalSeconds = Number(paceInDeciseconds) / 10;
    const mins = Math.floor(totalSeconds / 60);
    const secs = Math.floor(totalSeconds % 60);
    const tenths = Math.round((totalSeconds % 1) * 10) % 10;
    return `${mins}:${secs.toString().padStart(2, '0')}.${tenths}`;
}

// [함수: 드라이브 길이 계산]
function calculateStrokeDriveLength(distanceMeters, rawDeciseconds, spm) {
    if (!distanceMeters || !rawDeciseconds || !spm || isNaN(distanceMeters) || isNaN(rawDeciseconds) || isNaN(spm) || rawDeciseconds <= 0 || spm <= 0) return "--";
    const durationSeconds = Number(rawDeciseconds) / 10;
    const strokeDriveLen = (distanceMeters * 60) / (durationSeconds * spm);
    return isNaN(strokeDriveLen) || !isFinite(strokeDriveLen) ? "--" : `${strokeDriveLen.toFixed(2)}m`;
}

function showStatus(text, isError = false) {
    const msgBox = document.getElementById('statusMessage');
    msgBox.className = `p-4 rounded-2xl text-xs font-semibold border text-center ${isError ? 'bg-red-950/60 border-red-900 text-red-300' : 'bg-slate-900 border-slate-800 text-c2-green'}`;
    msgBox.innerText = text;
    msgBox.classList.remove('hidden');
}

function toggleConfigModal(isOpen) {
    const modal = document.getElementById('configModal');
    if (isOpen) {
        document.getElementById('cfgToken').value = localStorage.getItem('c2_access_token') || "";
        document.getElementById('cfgUser').value = localStorage.getItem('c2_user_id') || "";
        document.getElementById('cfgProxyMode').value = localStorage.getItem('c2_proxy_mode') || "direct";
        modal.classList.remove('hidden');
    } else {
        modal.classList.add('hidden');
    }
}

async function fetchConcept2Results() {
    const token = localStorage.getItem('c2_access_token');
    const userId = localStorage.getItem('c2_user_id');
    const mode = localStorage.getItem('c2_proxy_mode') || "direct";

    if(!token || !userId) {
        showStatus("⚠️ 인증 정보를 먼저 설정해주세요.", true);
        return;
    }

    showStatus("⏳ 동기화 중...");
    const targetUrl = `https://log.concept2.com/api/users/${userId}/results`;
    const finalFetchUrl = (mode === "allorigins") ? `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}` : targetUrl;

    try {
        const response = await fetch(finalFetchUrl, mode === "direct" ? { method: 'GET', headers: { "Authorization": `Bearer ${token}`, "Accept": "application/vnd.c2logbook.v1+json" } } : { method: 'GET' });
        if(!response.ok) throw new Error(`HTTP ${response.status}`);

        const res = await (mode === "allorigins" ? response.json().then(r => JSON.parse(r.contents)) : response.json());
        localCacheData = res.data || [];
        renderWorkoutList(localCacheData);
        showStatus(`✅ ${localCacheData.length}개 세션 동기화 완료.`);
    } catch (err) {
        showStatus(`❌ 실패: ${err.message}`, true);
    }
}

async function callStrokeData(workoutId) {
    const token = localStorage.getItem('c2_access_token');
    const userId = localStorage.getItem('c2_user_id');
    const mode = localStorage.getItem('c2_proxy_mode') || "direct";
    
    const strokeUrl = `https://log.concept2.com/api/users/${userId}/results/${workoutId}/strokes`;
    const finalFetchUrl = (mode === "allorigins") ? `https://api.allorigins.win/get?url=${encodeURIComponent(strokeUrl)}` : strokeUrl;

    try {
        const response = await fetch(finalFetchUrl, mode === "direct" ? { method: 'GET', headers: { "Authorization": `Bearer ${token}`, "Accept": "application/vnd.c2logbook.v1+json" } } : { method: 'GET' });
        const res = await (mode === "allorigins" ? response.json().then(r => JSON.parse(r.contents)) : response.json());
        renderStrokeData(res.data || []);
    } catch (err) {
        console.error(err);
    }
}

function renderStrokeData(strokes) {
    const tbody = document.getElementById('strokeTableBody');
    tbody.innerHTML = "";
    strokes.forEach((stroke, i) => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-900/60 border-b border-slate-900";
        tr.innerHTML = `
            <td class="py-2 px-2 text-center text-slate-500 font-mono">${i + 1}</td>
            <td class="py-2 px-2 text-right text-orange-400 font-black">${formatPm5Pace(stroke.p)}</td>
            <td class="py-2 px-2 text-right text-orange-400 font-black">${stroke.spm}</td>
            <td class="py-2 px-2 text-right text-slate-300 font-mono">${(stroke.t/10).toFixed(1)}s</td>
            <td class="py-2 px-2 text-right text-slate-300 font-mono">${(stroke.d/10).toFixed(1)}m</td>
        `;
        tbody.appendChild(tr);
    });
}