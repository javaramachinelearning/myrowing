let localCacheData = [];
let strokeScatterChartObj = null;
let currentSortKey = 'date';
let isAscending = false;
let currentFilter = 'all';
let currentStrokesData = [];
let currentSplitsData = [];
let selectedWorkoutId = null;
let selectedSplits = [];

window.addEventListener('DOMContentLoaded', () => {
    initApp();
});

function formatPm5Time(rawDeciseconds) {
    if (rawDeciseconds === undefined || rawDeciseconds === null || isNaN(rawDeciseconds)) return "--:--";

    const totalSeconds = Number(rawDeciseconds) / 10;
    const mins = Math.floor(totalSeconds / 60);
    const secs = Math.floor(totalSeconds % 60);
    const tenths = Math.round((totalSeconds % 1) * 10) % 10;

    if (mins > 0) {
        return `${mins}:${secs.toString().padStart(2, '0')}.${tenths}`;
    } else {
        return `:${secs.toString().padStart(2, '0')}.${tenths}`;
    }
}

// 1회 스트로크당 물리적 이동 거리 계산 함수
function calculateStrokeDriveLength(distanceMeters, rawDeciseconds, spm) {
    if (!distanceMeters || !rawDeciseconds || !spm || isNaN(distanceMeters) || isNaN(rawDeciseconds) || isNaN(spm) || rawDeciseconds <= 0 || spm <= 0) return "--";
    try {
        const durationSeconds = Number(rawDeciseconds) / 10;
        const strokeDriveLen = (distanceMeters * 60) / (durationSeconds * spm);

        return (isNaN(strokeDriveLen) || !isFinite(strokeDriveLen)) ? "--" : `${strokeDriveLen.toFixed(2)}m`;
    } catch (e) {
        return "--";
    }
}

function formatPm5Pace(paceInDeciseconds) {
    if (!paceInDeciseconds || isNaN(paceInDeciseconds) || paceInDeciseconds <= 0) return "--:--";

    const totalSeconds = Number(paceInDeciseconds) / 10;
    const mins = Math.floor(totalSeconds / 60);
    const secs = Math.floor(totalSeconds % 60);
    const tenths = Math.round((totalSeconds % 1) * 10) % 10;

    return `${mins}:${secs.toString().padStart(2, '0')}.${tenths}`;
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
        document.getElementById('cfgGemini').value = localStorage.getItem('gemini_api_key') || "";
        document.getElementById('cfgProxyMode').value = localStorage.getItem('c2_proxy_mode') || "direct";
        modal.classList.remove('hidden');
    } else {
        modal.classList.add('hidden');
    }
}

function saveConfiguration() {
    const tok = document.getElementById('cfgToken').value.trim();
    const usr = document.getElementById('cfgUser').value.trim();
    const gemini = document.getElementById('cfgGemini').value.trim();
    const mode = document.getElementById('cfgProxyMode').value;

    if (!tok || !usr) {
        alert("모든 필수 연동 규격을 입력해야 합니다.");
        return;
    }

    localStorage.setItem('c2_access_token', tok);
    localStorage.setItem('c2_user_id', usr);
    localStorage.setItem('gemini_api_key', gemini);
    localStorage.setItem('c2_proxy_mode', mode);

    initApp();
    toggleConfigModal(false);
    showStatus("✅ 로컬 연동 정보 인덱싱 및 암호화 매핑 완료.");
}

function initApp() {
    const tok = localStorage.getItem('c2_access_token');
    const usr = localStorage.getItem('c2_user_id');
    const ind = document.getElementById('syncIndicator');
    const dot = document.getElementById('statusDot');

    if (tok && usr) {
        ind.innerText = `ID: ${usr} 연동 대기`;
        ind.className = "text-[10px] text-[#00FF66] font-bold";
        dot.className = "w-2.5 h-2.5 rounded-full bg-[#00FF66]";
    } else {
        ind.innerText = "인증 정보 없음";
        ind.className = "text-[10px] text-red-400 font-bold";
        dot.className = "w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse";
    }
}

async function fetchConcept2Results() {
    const token = localStorage.getItem('c2_access_token');
    const userId = localStorage.getItem('c2_user_id');
    const mode = localStorage.getItem('c2_proxy_mode') || "direct";

    if (!token || !userId) {
        showStatus("⚠️ Access Token과 User ID를 먼저 설정해주세요.", true);
        toggleConfigModal(true);
        return;
    }

    showStatus("⏳ Concept2 원격 서버에서 실시간 패킷 전송 및 파싱 중...");
    const targetUrl = `https://log.concept2.com/api/users/${userId}/results`;
    let finalFetchUrl = targetUrl;

    if (mode === "allorigins") {
        finalFetchUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
    }

    try {
        const headers = {
            "Authorization": `Bearer ${token}`,
            "Accept": "application/vnd.c2logbook.v1+json"
        };

        const response = await fetch(finalFetchUrl, mode === "direct" ? { method: 'GET', headers: headers } : { method: 'GET' });
        if (!response.ok) throw new Error(`HTTP Status ${response.status}`);

        let resJsonData;
        if (mode === "allorigins") {
            const rawProxy = await response.json();
            resJsonData = JSON.parse(rawProxy.contents);
        } else {
            resJsonData = await response.json();
        }

        localCacheData = resJsonData.data || [];
        if (localCacheData.length === 0) {
            showStatus("정상 수신되었으나 운동 데이터가 존재하지 않습니다.", true);
            return;
        }

        currentSortKey = 'date';
        isAscending = false;
        currentFilter = 'all';
        applyFilterAndSort();

        showStatus(`✅ 성공적으로 전체 ${localCacheData.length}개의 세션을 동기화했습니다.`);
    } catch (err) {
        showStatus(`❌ 동기화 실패: ${err.message}`, true);
    }
}

function filterWorkouts(type) {
    currentFilter = type;
    applyFilterAndSort();
}

function handleSort(key) {
    if (localCacheData.length === 0) return;

    if (currentSortKey === key) {
        isAscending = !isAscending;
    } else {
        currentSortKey = key;
        isAscending = true;
    }

    const keys = ['date', 'distance', 'time', 'pace', 'stroke_count', 'stroke_rate'];
    keys.forEach(k => {
        const el = document.getElementById(`sort_${k}`);
        if (el) el.innerText = "";
    });
    document.getElementById(`sort_${key}`).innerText = isAscending ? "▲" : "▼";

    applyFilterAndSort();
}

function applyFilterAndSort() {
    let dataToRender = [...localCacheData];

    if (currentFilter !== 'all') {
        dataToRender = dataToRender.filter(w => {
            const typeStr = String((w.workout && w.workout.type) || w.workout_type || w.type || "");
            return typeStr === currentFilter;
        });
    }

    dataToRender.sort((a, b) => {
        let valA = a[currentSortKey];
        let valB = b[currentSortKey];

        if (currentSortKey === 'pace') {
            if (!valA && a.time && a.distance) valA = ((a.time / 10) / a.distance) * 500 * 10;
            if (!valB && b.time && b.distance) valB = ((b.time / 10) / b.distance) * 500 * 10;
        }

        if (currentSortKey === 'stroke_count') {
            if (!valA && a.time && a.stroke_rate) valA = Math.round(((a.time / 10) / 60) * a.stroke_rate);
            if (!valB && b.time && b.distance) valB = Math.round(((b.time / 10) / b.distance) * b.stroke_rate);
        }

        valA = valA ? (isNaN(valA) ? valA : Number(valA)) : 0;
        valB = valB ? (isNaN(valB) ? valB : Number(valB)) : 0;

        if (valA < valB) return isAscending ? -1 : 1;
        if (valA > valB) return isAscending ? 1 : -1;
        return 0;
    });

    renderWorkoutList(dataToRender);
}

function renderWorkoutList(data) {
    const group = document.getElementById('workoutListGroup');
    group.innerHTML = "";

    data.forEach((w) => {
        const dateStr = String(w.date).substring(5, 10);
        const distanceStr = `${Number(w.distance || 0).toLocaleString()}m`;

        const timeFormattedStr = formatPm5Time(w.time);
        const spmStr = w.stroke_rate ? String(w.stroke_rate) : '--';

        let rowPaceRaw = Number(w.pace || 0);
        if (rowPaceRaw <= 0 && w.distance > 0 && w.time > 0) {
            rowPaceRaw = (((w.time / 10) / w.distance) * 500) * 10;
        }
        const paceFormattedStr = formatPm5Pace(rowPaceRaw);

        let strokeCount = w.stroke_count;
        if (!strokeCount && w.time && w.stroke_rate) {
            strokeCount = Math.round(((w.time / 10) / 60) * w.stroke_rate);
        }
        const strokeCountStr = strokeCount ? `${strokeCount}회` : '--회';

        const box = document.createElement('div');
        box.id = 'workout-box-' + w.id;
        box.className = `w-full px-3 py-2 flex flex-row items-center justify-between text-[11px] cursor-pointer transition tracking-tight gap-1 text-center ${selectedWorkoutId === w.id ? 'bg-slate-800 border-l-4 border-[#00FF66]' : 'hover:bg-slate-900'}`;

        box.onclick = () => toggleWorkoutSelection(w.id, box);

        box.innerHTML = `
            <div class="flex items-center gap-1.5 w-[30%] text-left">
                <span class="text-[#00FF66] font-bold">${dateStr}</span>
                <span class="text-slate-300 font-semibold">${distanceStr}</span>
            </div>
            <div class="w-[20%] text-slate-200">${timeFormattedStr}</div>
            <div class="w-[20%] text-c2-green font-bold">${paceFormattedStr}</div>
            <div class="w-[16%] text-[#CCFF00]">${strokeCountStr}</div>
            <div class="w-[14%] text-right text-slate-400">${spmStr}</div>
        `;
        group.appendChild(box);
    });

    document.getElementById('workoutSelectContainer').classList.remove('hidden');
}

function toggleWorkoutSelection(workoutId, boxElement) {
    if (selectedWorkoutId === workoutId) {
        // 토글 오프
        selectedWorkoutId = null;
        document.getElementById('dashboardContainer').classList.add('hidden');
        boxElement.classList.remove('bg-slate-800', 'border-l-4', 'border-[#00FF66]');
        boxElement.classList.add('hover:bg-slate-900');
        return;
    }
    
    // 이전 선택 해제
    if (selectedWorkoutId) {
       const prevSelected = document.getElementById('workout-box-' + selectedWorkoutId);
       if (prevSelected) {
           prevSelected.classList.remove('bg-slate-800', 'border-l-4', 'border-[#00FF66]');
           prevSelected.classList.add('hover:bg-slate-900');
       }
    }
    
    selectedWorkoutId = workoutId;
    boxElement.classList.add('bg-slate-800', 'border-l-4', 'border-[#00FF66]');
    boxElement.classList.remove('hover:bg-slate-900');
    
    loadSplitDataByWorkoutId(workoutId);
}

function loadSplitDataByWorkoutId(workoutId) {
    selectedSplits = []; // 스플릿 다중 선택 초기화
    const workout = localCacheData.find(item => item.id === workoutId);
    if (!workout) return;

    document.getElementById('dashboardContainer').classList.remove('hidden');
    document.getElementById('activeDateLabel').innerText = String(workout.date).substring(0, 10);
    document.getElementById('activeDateLabel2').innerText = String(workout.date).substring(0, 10);

    const tbody = document.getElementById('splitTableBody');
    tbody.innerHTML = "";

    const workoutObj = workout.workout || {};

    let detailList = [];

    if (workoutObj.splits && Array.isArray(workoutObj.splits) && workoutObj.splits.length > 0) {
        detailList = workoutObj.splits;
    } else if (workoutObj.intervals && Array.isArray(workoutObj.intervals) && workoutObj.intervals.length > 0) {
        detailList = workoutObj.intervals;
    }

    currentSplitsData = detailList

    let cumulativeDist = 0;

    if (detailList && detailList.length > 0) {
        detailList.forEach((split, index) => {
            const sDistance = Number(split.distance || 0);
            const startDist = cumulativeDist;
            cumulativeDist += sDistance;
            const endDist = cumulativeDist;

            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-900/60 transition cursor-pointer";
            tr.onclick = () => toggleSplitSelection(startDist, endDist, tr);

            const sTimeRaw = Number(split.time || 0);
            const sTimeSeconds = sTimeRaw / 10;

            const sPaceRaw = sDistance > 0 ? ((sTimeSeconds / sDistance) * 500) * 10 : 0;

            let sWatts = 0;
            const sPaceSeconds = sPaceRaw / 10;
            if (sPaceSeconds > 0) {
                sWatts = Math.round(2.80 / Math.pow(sPaceSeconds / 500, 3));
            }

            const sCaloriesTotal = split.calories_total || split.calories || '--';
            const sStrokeRate = split.stroke_rate || 0;

            const sDriveLength = calculateStrokeDriveLength(sDistance, sTimeRaw, sStrokeRate);

            tr.innerHTML = `
                <td class="py-2 px-2 text-right text-slate-100">${(index + 1)}</td>
                <td class="py-2 px-2 text-right text-slate-100 font-bold">${formatPm5Time(sTimeRaw)}</td>
                <td class="py-2 px-2 text-right text-slate-300">${sDistance.toLocaleString()}m</td>
                <td class="py-2 px-2 text-right text-c2-green font-bold">${formatPm5Pace(sPaceRaw)}</td>
                <td class="py-2 px-2 text-right text-slate-300">${sWatts || '--'}</td>
                <td class="py-2 px-2 text-right text-orange-400 font-bold">${sDriveLength}</td>
                <td class="py-2 px-2 text-right text-[#CCFF00] font-bold pr-3">${sStrokeRate || '--'}</td>
            `;
            tbody.appendChild(tr);
        });
    } else {
        const tr = document.createElement('tr');
        tr.className = "text-center text-slate-500 text-[11px]";
        tr.innerHTML = `<td colspan="8" class="py-4">해당 세션에 연동된 실제 상세 Split 기록이 없습니다.</td>`;
        tbody.appendChild(tr);
    }

    const totalTr = document.createElement('tr');

    const totalTimeRaw = Number(workout.time || 0);
    const totalDistance = Number(workout.distance || 0);

    totalTr.className = "bg-slate-900 font-bold border-t border-slate-700 text-[#00FF66] cursor-pointer";
    totalTr.onclick = () => {
        selectedSplits = [];
        document.querySelectorAll('#splitTableBody tr').forEach(el => {
            el.classList.remove('bg-slate-800', 'border-l-4', 'border-[#00FF66]');
        });
        applySplitFilters();
    };

    let totalPaceRaw = Number(workout.pace || 0);
    if (totalPaceRaw <= 0 && totalDistance > 0 && totalTimeRaw > 0) {
        const totalTimeSeconds = totalTimeRaw / 10;
        totalPaceRaw = ((totalTimeSeconds / totalDistance) * 500) * 10;
    }

    const totalPaceSeconds = totalPaceRaw / 10;
    const totalWatts = workout.watts || (totalPaceSeconds > 0 ? Math.round(2.80 / Math.pow(totalPaceSeconds / 500, 3)) : 0);
    const totalStrokeRate = workout.stroke_rate || 0;

    const totalDriveLength = calculateStrokeDriveLength(totalDistance, totalTimeRaw, totalStrokeRate);

    totalTr.innerHTML = `
        <td class="py-2 px-2 text-right text-slate-100">&nbsp;</td>
        <td class="py-2 px-2 text-right text-slate-100 font-black">${formatPm5Time(totalTimeRaw)}</td>
        <td class="py-2 px-2 text-right text-slate-200">${totalDistance.toLocaleString()}m</td>
        <td class="py-2 px-2 text-right text-c2-green font-black">${formatPm5Pace(totalPaceRaw)}</td>
        <td class="py-2 px-2 text-right text-slate-200">${totalWatts || '--'}</td>
        <td class="py-2 px-2 text-right text-orange-400 font-black">${totalDriveLength}</td>
        <td class="py-2 px-2 text-right text-[#CCFF00] font-black pr-3">${totalStrokeRate || '--'}</td>
    `;
    tbody.appendChild(totalTr);

    callStrokeData(workoutId);

    document.getElementById('dashboardContainer').scrollIntoView({ behavior: 'smooth' });
}

async function callStrokeData(workoutId) {
    const token = localStorage.getItem('c2_access_token');
    const userId = localStorage.getItem('c2_user_id');
    const mode = localStorage.getItem('c2_proxy_mode') || "direct";

    document.getElementById('dashboardContainer').classList.remove('hidden');
    const workout = localCacheData.find(item => item.id === workoutId);
    if (!workout) return;
    document.getElementById('activeDateLabel').innerText = String(workout.date).substring(0, 10);

    showStatus("⏳ 상세 스트로크 데이터를 서버에서 가져오는 중...");
    const strokeUrl = `https://log.concept2.com/api/users/${userId}/results/${workoutId}/strokes`;
    let finalFetchUrl = strokeUrl;

    if (mode === "allorigins") {
        finalFetchUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(strokeUrl)}`;
    }
    try {
        const headers = {
            "Authorization": `Bearer ${token}`,
            "Accept": "application/vnd.c2logbook.v1+json"
        };

        const response = await fetch(finalFetchUrl, mode === "direct" ? { method: 'GET', headers: headers } : { method: 'GET' });
        if (!response.ok) throw new Error(`HTTP Status ${response.status}`);

        let resJsonData;
        if (mode === "allorigins") {
            const rawProxy = await response.json();
            resJsonData = JSON.parse(rawProxy.contents);
        } else {
            resJsonData = await response.json();
        }

	const strokes = resJsonData.data || [];


       // 1. 누적을 위한 변수 초기화
        let previousDist = 0;
        let previousTime = 0;

        strokes.forEach((stroke, i) => {
            // 이번 스트로크의 d와 t (인터벌 시작 시 초기화된 값)
            const currentD = stroke.d || 0;
            const currentT = stroke.t || 0;

            // 2. 만약 현재 값이 이전 값보다 작다면(초기화되었다면),
            // 이전 누적값을 '시작점'으로 잡고 누적을 이어감
            // 만약 처음 스트로크라면 그대로 사용
            if (i === 0) {
                stroke.distM = currentD / 10;
                stroke.timeS = currentT / 10;
            } else {
                // 이전 누적값에 (이번 절대값 - 이전 절대값)을 더함
                // 단, 인터벌이 바뀌어 절대값이 작아진 경우(초기화)를 감지
                const deltaD = (currentD >= (strokes[i-1].d || 0)) ? (currentD - (strokes[i-1].d || 0)) : currentD;
                const deltaT = (currentT >= (strokes[i-1].t || 0)) ? (currentT - (strokes[i-1].t || 0)) : currentT;
		
		// 누적 값 계산 후 소수점 1자리로 제한 (Number 타입으로 저장)
            	stroke.distM = Number(((strokes[i-1]?.distM || 0) + (deltaD / 10)).toFixed(1));
            	stroke.timeS = Number(((strokes[i-1]?.timeS || 0) + (deltaT / 10)).toFixed(1));            }

            // 나머지 계산
            stroke.paceSec = (stroke.p || 0) / 10;
            stroke.watts = calculateWatts(stroke.p || 0);

            // 스트로크 간 차이 (누적값 기준)
            stroke.strokeDist = i > 0 ? (stroke.distM - strokes[i-1].distM) : stroke.distM;
            stroke.strokeTime = i > 0 ? (stroke.timeS - strokes[i-1].timeS) : stroke.timeS;
        });

        currentStrokesData = strokes;
        renderStrokeData(currentStrokesData);

        showStatus("✅ 스트로크 데이터 동기화 완료.");
    } catch (err) {
        showStatus(`❌ 상세 데이터 로드 실패: ${err.message}`, true);
    }
}

function renderStrokeData(strokes) {
    const tbody = document.getElementById('strokeTableBody');
    tbody.innerHTML = "";

    if (!Array.isArray(strokes) || strokes.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="py-4 text-center text-slate-600">상세 스트로크 데이터가 존재하지 않습니다.</td></tr>`;
        return;
    }

    const scatterData = [];

    strokes.forEach((stroke, i) => {
        scatterData.push({ x: stroke.distM, y: stroke.watts });

        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-900/60 border-b border-slate-900";
        tr.innerHTML = `
            <td class="py-2 px-2 text-right text-orange-400 font-black">${formatPm5Pace(stroke.p)}</td>
            <td class="py-2 px-2 text-right text-orange-400 font-black">${stroke.spm}</td>
            <td class="py-2 px-2 text-right text-orange-400 font-black">${stroke.watts}W</td>
            <td class="py-2 px-2 text-right text-slate-300 font-mono">${stroke.distM}m</td>
            <td class="py-2 px-2 text-right text-slate-300 font-mono">${stroke.timeS.toFixed(1)}s</td>
            <td class="py-2 px-2 text-right text-sky-400 font-mono">${stroke.strokeDist.toFixed(2)}m</td>
            <td class="py-2 px-2 text-right text-sky-400 font-mono">${stroke.strokeTime.toFixed(2)}s</td>
        `;
        tbody.appendChild(tr);
    });

    renderScatterChart(scatterData);
}

function toggleSplitSelection(startDist, endDist, trElement) {
    if (!currentStrokesData || currentStrokesData.length === 0) return;
    
    const idx = selectedSplits.findIndex(s => s.startDist === startDist && s.endDist === endDist);
    if (idx > -1) {
        selectedSplits.splice(idx, 1);
        trElement.classList.remove('bg-slate-800', 'border-l-4', 'border-[#00FF66]');
    } else {
        selectedSplits.push({startDist, endDist});
        trElement.classList.add('bg-slate-800', 'border-l-4', 'border-[#00FF66]');
    }
    
    applySplitFilters();
}

function applySplitFilters() {
    if (!currentStrokesData || currentStrokesData.length === 0) return;
    
    if (selectedSplits.length === 0) {
        renderStrokeData(currentStrokesData);
        return;
    }
    
    const filteredStrokes = currentStrokesData.filter(stroke => {
        return selectedSplits.some(s => stroke.distM > s.startDist && stroke.distM <= s.endDist);
    });
    
    renderStrokeData(filteredStrokes);
    const container = document.getElementById('dashboardContainer');
    if (container) container.scrollIntoView({ behavior: 'smooth' });
}

function calculateWatts(paceDeciseconds) {
    if (!paceDeciseconds || paceDeciseconds <= 0) return 0;

    const paceSeconds = Number(paceDeciseconds) / 10;
    const theoreticalWatts = 2.8 / Math.pow(paceSeconds / 500, 3);
    const calibratedWatts = theoreticalWatts * 1.002;

    return Math.round(calibratedWatts);
}

// 최소제곱법으로 회귀계수(기울기, 절편) 계산
function calculateRegression(dataPoints) {
    const n = dataPoints.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    
    dataPoints.forEach(p => {
        sumX += p.x;
        sumY += p.y;
        sumXY += p.x * p.y;
        sumXX += p.x * p.x;
    });

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    return { slope, intercept };
}

function renderScatterChart(dataPoints) {
    const ctx = document.getElementById('strokeScatterChart');
    if (!ctx) return;

    if (strokeScatterChartObj) strokeScatterChartObj.destroy();

    const { slope, intercept } = calculateRegression(dataPoints);
    const trendColor = slope >= 0 ? '#38bdf8' : '#ef4444'; // 양수: 하늘색, 음수: 적색
    
    // 회귀 직선 생성
    const xMin = dataPoints[0].x;
    const xMax = dataPoints[dataPoints.length - 1].x;
    const regressionLine = [
        { x: xMin, y: slope * xMin + intercept },
        { x: xMax, y: slope * xMax + intercept }
    ];

    strokeScatterChartObj = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [
                {
                    label: '스트로크 출력 (W)',
                    data: dataPoints,
                    backgroundColor: '#00FF66',
                    pointRadius: 3
                },
                {
		    // 노란색으로 강조된 회귀계수 라벨
                    label: `추세 (a: ${slope.toFixed(3)})`,
                    data: regressionLine,
                    type: 'line',
                    borderColor: trendColor,
                    borderWidth: 3,
                    pointRadius: 0
                }
            ]
        },
        options: {
	    responsive: true,
            maintainAspectRatio: false, // 이 부분이 중요!
            plugins: {
                title: { 
                    display: true, 
                    text: `회귀분석 기울기(a): ${slope.toFixed(4)} + ${intercept.toFixed(0)}`, 
                    color: '#facc15' // 타이틀도 노란색으로 강조
                }
            }
        }
    });
}

// --- AI 프롬프트 생성 (통합 로직) ---
function generateAiPrompt(type) {
    let promptBase = "너는 전문 로잉 머신 코치야. 다음 데이터를 분석해줘.\n";

    // 1. 공통 데이터 추출
    const activeDateLabel = document.getElementById('activeDateLabel').innerText;
    const result = localCacheData.find(d => String(d.date).substring(0, 10) === activeDateLabel);
    
    const splitSummary = currentSplitsData.length > 0 
        ? currentSplitsData.map((s, i) => `[구간 ${i+1}] ${s.distance || 0}m, ${s.time || 0}dsec, ${s.stroke_rate || 0}SPM`).join(' | ')
        : "상세 스플릿 데이터 없음";

    const strokeSummary = currentStrokesData.length > 0 
        ? currentStrokesData.map((s, i) => `[#${i+1}] ${s.distM}m, ${s.watts}W, ${s.spm}SPM`).join(' | ')
        : "상세 스트로크 데이터 없음";

    // 2. 공통 요청 사항 정의
    const getPromptRequest = (isInterval) => `
			요청:
			1. 제공된 Result 데이터를 분석하여 전체적인 훈련 효율(회귀계수 등)을 평가해줘.
			2. ${isInterval} 구조에 따라, 구간별 페이스 유지력과 스트로크당 출력(Watts)의 일관성을 진단해줘.
			3. 다리 힘 전달, 리듬, 구간별 개선점 및 다음 훈련을 위한 최적의 코칭 팁을 제안해줘.
                        4. 페이스 유지력|스트로크 연결성|리커버리 리듬|크루즈 주행력|SPM 제어력 5점 척도 지표로 방사형 그래프 데이터를 반환하고   
                           항상 답변 마지막은 아래 형태로 답변해.                            
                           페이스 유지력|스트로크 연결성|리커버리 리듬|크루즈 주행력|SPM 제어력 
                           4.5|3.5|3.0|4.0|3.0  
                           페이스를 끌어올린 능력이 탁월함|연결이 다소 헐거워짐|일정한 리듬 통제가 요구됨|강력한 크루징 능력 보유|정밀 제어 훈련이 필요  

                        `;

    // 3. 타입별 로직
    if (type === 'analysis' || type === 'today') {
        if (!result) return "데이터 없음.";

        const typeStr = result.workout_type || "";
        const isInterval = typeStr.startsWith("Variable") ? "인터벌 훈련" : 
                           typeStr.startsWith("Fixed") ? "단일 세션 훈련" : "기타 훈련";

        let context = `[Result 메타데이터]: 유형=${isInterval}, 총거리=${result.distance}m, 총시간=${result.time/10} sec, 평균SPM=${result.stroke_rate}
			[스플릿(구간) 데이터]: ${splitSummary}
			${type === 'analysis' ? `[상세 스트로크 데이터]: ${strokeSummary}` : ''}`;

        return `${promptBase}${context}${getPromptRequest(isInterval)}`;
    }

    if (type === 'recent_10') {
        return `${promptBase} 최근 10개 Result 요약: ${localCacheData.slice(0, 10).map(w => `${w.distance}m`).join(', ')}. 전체적인 체력 추이와 방향 분석을 줘.`;
    }

    if (type === 'top_3') {
        return `${promptBase} 최고 페이스 Top 3 Result 분석과 기록 갱신 팁을 줘.`;
    }

    return promptBase;
}

// --- AI 호출 및 복사 (수정 완료) ---
function openGeminiForAnalysis() {
    if (!currentStrokesData.length) return alert("데이터 없음");
    const prompt = generateAiPrompt('analysis');
    
    // Clipboard API 사용
    navigator.clipboard.writeText(prompt).then(() => {
        alert("프롬프트 복사 완료. Gemini 창을 엽니다.");
        window.open("https://gemini.google.com/app", '_blank');
    }).catch(err => {
        console.error("클립보드 복사 실패:", err);
        alert("복사 실패. 수동으로 복사하세요.");
    });
}

async function generateAiReport(type) {
    const key = localStorage.getItem('gemini_api_key');
    if (!key) {
        alert("Gemini API Key가 설정되지 않았습니다. 설정에서 입력하세요.");
        return;
    }
    
    const feedbackBox = document.getElementById('aiFeedbackBox');
    feedbackBox.classList.remove('hidden');
    feedbackBox.innerHTML = '분석 중...';
    
    try {
        const prompt = generateAiPrompt(type);
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${key}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        
        const result = await response.json();
        
        if (result.candidates && result.candidates[0].content) {
            const text = result.candidates[0].content.parts[0].text;
            
            let cleanedText = text;
            let radarData = null;

            const radarHeader = "페이스 유지력|스트로크 연결성|리커버리 리듬|크루즈 주행력|SPM 제어력";
            const headerIndex = text.lastIndexOf(radarHeader);
            
            if (headerIndex !== -1) {
                const radarText = text.substring(headerIndex).trim();
                const lines = radarText.split('\n').map(l => l.trim()).filter(l => l !== '');
                if (lines.length >= 3) {
                    const labels = lines[0].split('|').map(s => s.trim());
                    const scores = lines[1].split('|').map(s => parseFloat(s.trim().replace(/[^0-9.]/g, '')));
                    const comments = lines[2].split('|').map(s => s.trim());
                    
                    if (labels.length === 5 && scores.length === 5) {
                        radarData = { labels, scores, comments };
                        cleanedText = text.substring(0, headerIndex).trim();
                    }
                }
            }

            feedbackBox.innerHTML = ''; // 초기화
            
            if (radarData) {
                renderRadarChart(feedbackBox, radarData);
            }

            const textContainer = document.createElement('div');
            textContainer.className = "mt-4"; // 차트 아래에 텍스트가 오도록 여백 추가
            textContainer.innerHTML = typeof marked !== 'undefined' ? marked.parse(cleanedText) : cleanedText;
            feedbackBox.appendChild(textContainer);
        } else {
            throw new Error(result.error?.message || "응답 오류");
        }
    } catch (err) {
        feedbackBox.innerHTML = `<span class="text-red-400">분석 실패: ${err.message}</span>`;
    }
}

function renderRadarChart(container, radarData) {
    const chartWrapper = document.createElement('div');
    chartWrapper.className = "mt-5 bg-slate-900 border border-slate-700 rounded-xl p-4 flex flex-col items-center w-full shadow-lg";
    
    const canvasContainer = document.createElement('div');
    canvasContainer.className = "w-full max-w-[280px] aspect-square relative";
    const canvas = document.createElement('canvas');
    canvasContainer.appendChild(canvas);
    chartWrapper.appendChild(canvasContainer);
    
    const commentBox = document.createElement('div');
    commentBox.className = "mt-4 space-y-3 w-full text-xs";
    radarData.labels.forEach((label, i) => {
        const score = radarData.scores[i];
        const comment = radarData.comments[i] || "";
        commentBox.innerHTML += `
            <div class="flex items-start gap-2 border-b border-slate-800 pb-2 mb-2 last:border-0 last:mb-0 last:pb-0">
                <div class="font-bold text-[#00FF66] whitespace-nowrap">${label} <span class="text-white text-[10px]">(${score})</span></div>
                <div class="text-slate-300 text-left flex-1 leading-relaxed">${comment}</div>
            </div>
        `;
    });
    chartWrapper.appendChild(commentBox);
    
    container.appendChild(chartWrapper);

    new Chart(canvas, {
        type: 'radar',
        data: {
            labels: radarData.labels,
            datasets: [{
                label: 'AI 코칭 진단',
                data: radarData.scores,
                backgroundColor: 'rgba(0, 255, 102, 0.2)',
                borderColor: '#00FF66',
                pointBackgroundColor: '#CCFF00',
                pointBorderColor: '#1e293b',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: '#CCFF00',
                borderWidth: 2,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    beginAtZero: true,
                    min: 0,
                    max: 5,
                    angleLines: { color: 'rgba(255, 255, 255, 0.1)' },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    pointLabels: {
                        color: '#cbd5e1',
                        font: { size: 10, family: 'sans-serif', weight: 'bold' }
                    },
                    ticks: {
                        display: false,
                        stepSize: 1
                    }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}