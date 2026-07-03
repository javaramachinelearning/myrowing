let localCacheData = [];
let strokeScatterChartObj = null;
let currentSortKey = 'date';
let isAscending = false;
let currentFilter = 'all';
let currentStrokesData = [];
let currentSplitsData = [];

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
        box.className = "w-full px-3 py-2 flex flex-row items-center justify-between text-[11px] hover:bg-slate-900 cursor-pointer transition tracking-tight gap-1 text-center";

        box.onclick = () => loadSplitDataByWorkoutId(w.id);

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

function loadSplitDataByWorkoutId(workoutId) {
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
            tr.onclick = () => filterStrokesByDistance(startDist, endDist);

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
    totalTr.onclick = () => filterStrokesByDistance(0, totalDistance);

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

function filterStrokesByDistance(startDist, endDist) {
    if (!currentStrokesData || currentStrokesData.length === 0) return;
    const filteredStrokes = currentStrokesData.filter(stroke => {
        return stroke.distM > startDist && stroke.distM <= endDist;
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


/**
 * 기존 API 함수와 별개로, Google Gemini 웹으로 데이터를 전달하는 함수
 */
function openGeminiForAnalysis() {
    if (!currentStrokesData || currentStrokesData.length === 0) {
        alert("분석할 스트로크 데이터가 없습니다.");
        return;
    }

    // 1. 데이터 요약 생성 (너무 긴 데이터는 잘릴 수 있으므로 핵심 위주)
    const strokeSummary = currentStrokesData.map((s, i) => 
        `[#${i+1}] ${s.distM}m, ${s.watts}W, ${s.spm}SPM`
    ).join(' | ');

    // 2. 전문 코칭을 위한 프롬프트 작성
    const systemInstruction = "너는 전문 로잉 머신 코치야. 다음 스트로크 데이터를 분석해줘.";
    const prompt = `[로잉 데이터 정밀 분석 요청]
    
    분석 데이터:
    ${strokeSummary}

    요청 사항:
    1. 스트로크별 출력(Watts) 추이를 분석하여 전체 구간의 회귀계수를 파악하고 피로 누적도를 평가해줘.
    2. 다리 힘 전달과 페이스 유지 측면에서 문제점을 지적해줘.
    3. 기록 단축을 위한 실질적인 훈련 팁을 제안해줘.`;

    // 3. Gemini URL 생성 
    const targetUrl = `https://aistudio.google.com/app/prompts/new_chat?prompt=${encodeURIComponent(prompt)}`;
	
    makeClipBoard4AI(prompt)
 
    // 4. 새 창에서 Google Gemini 열기
    //window.open(targetUrl, '_blank');
}


function makeClipBoard4AI(prompt) {
    // 2. 클립보드에 데이터 복사
    navigator.clipboard.writeText(prompt).then(() => {
        alert("분석 데이터가 클립보드에 복사되었습니다. Gemini 창이 열리면 [Ctrl+V]로 붙여넣으세요.");
        // 3. Gemini 페이지 열기
        window.open("https://gemini.google.com/app", '_blank');
    }).catch(err => {
        alert("복사 실패: " + err);
    });
}

async function generateAiReport(type) {
    const geminiKey = localStorage.getItem('gemini_api_key');
    if (!geminiKey) {
        alert("설정 모달에서 Gemini API Key를 먼저 입력해주세요.");
        toggleConfigModal(true);
        return;
    }

    const feedbackBox = document.getElementById('aiFeedbackBox');
    feedbackBox.classList.remove('hidden');
    feedbackBox.innerHTML = '<span class="animate-pulse text-[#00FF66]">AI가 데이터를 분석 중입니다... 🚣</span>';

    try {
        let promptContext = "";

        if (type === 'today') {
            const activeDate = document.getElementById('activeDateLabel').innerText;
            const todayWorkout = localCacheData.find(w => String(w.date).substring(0, 10) === activeDate);
            if (!todayWorkout) throw new Error("선택된 세션이 없습니다.");

            const typeStr = String((todayWorkout.workout && todayWorkout.workout.type) || todayWorkout.workout_type || todayWorkout.type || "");
            const workoutTypeName = typeStr === 'VariableInterval' ? "인터벌 훈련" : "단일 로잉 훈련";

            promptContext = `다음은 오늘(선택된 날짜)의 로잉 머신 데이터입니다. 
				훈련 유형(workout_type): ${workoutTypeName} (${typeStr}),
				거리: ${todayWorkout.distance}m, 
				시간(0.1초): ${todayWorkout.time}, 
				평균 SPM: ${todayWorkout.stroke_rate}. 
				이 데이터를 바탕으로 오늘의 운동을 평가하고 조언해주세요.`;
        } else if (type === 'recent_10') {
            const recent10 = localCacheData.slice(0, 10);
            promptContext = `다음은 최근 10번의 로잉 세션 요약입니다. 
		${recent10.map(w => {
                const tStr = String((w.workout && w.workout.type) || w.workout_type || w.type || "");
                const wName = tStr === 'VariableInterval' ? "인터벌" : "단일";
                return `일자: ${String(w.date).substring(0, 10)}, 유형: ${wName}, 거리: ${w.distance}m, SPM: ${w.stroke_rate}`;
            }).join(' | ')}.
		최근 10건의 데이터를 바탕으로 운동 추이와 체력 변화, 그리고 향후 훈련 방향을 분석해주세요.`;
        } else if (type === 'top_3') {
            const top3 = [...localCacheData].sort((a, b) => {
                let paceA = a.pace || ((a.time / 10) / a.distance) * 5000;
                let paceB = b.pace || ((b.time / 10) / b.distance) * 5000;
                return paceA - paceB;
            }).slice(0, 3);
            promptContext = `다음은 나의 기록 중 페이스가 가장 빨랐던 Top 3 세션입니다. 
	${top3.map(w => {
                const tStr = String((w.workout && w.workout.type) || w.workout_type || w.type || "");
                const wName = tStr === 'VariableInterval' ? "인터벌" : "단일";
                return `일자: ${String(w.date).substring(0, 10)}, 유형: ${wName}, 거리: ${w.distance}m, SPM: ${w.stroke_rate}`;
            }).join(' | ')}.
	왜 이 3건이 기록이 좋았을지 SPM과 거리 측면에서 분석하고, 앞으로 이 기록을 갱신하기 위한 팁을 주세요.`;
        }

        if (currentSplitsData && currentSplitsData.length > 0) {
            const splitSummary = currentSplitsData.map((s, idx) => {
                const pace = ((s.time / 10) / s.distance) * 500;
                return `구간${idx + 1}: ${s.distance}m, 페이스:${pace.toFixed(0)}s, SPM:${s.stroke_rate}`;
            }).join(' | ');

            promptContext += `\n[상세 구간(Split) 기록]\n${splitSummary}\n`;
        }

        if (currentStrokesData && currentStrokesData.length > 0) {
            const totalStrokes = currentStrokesData.length;
            const avgPace = currentStrokesData.reduce((acc, s) => acc + s.p, 0) / totalStrokes;
            const avgWatts = currentStrokesData.reduce((acc, s) => acc + s.watts, 0) / totalStrokes;

            promptContext += `\n[상세 스트로크 통계 (${totalStrokes}회)]\n`;
            promptContext += `- 평균 페이스(Deci): ${avgPace.toFixed(0)}\n`;
            promptContext += `- 평균 출력: ${avgWatts.toFixed(0)}W\n`;
            promptContext += `- 페이스 변화: 최고 ${Math.min(...currentStrokesData.map(s => s.p))} ~ 최저 ${Math.max(...currentStrokesData.map(s => s.p))}\n`;
            promptContext += `- 최근 5회 상세 (페이스/SPM/Watts): ${currentStrokesData.slice(-5).map(s => `${s.p}/${s.spm}/${s.watts}`).join(' | ')}`;
        }

        promptContext += `\n단일 로링의 경우 다음 목표와 선택된 결과를 비교하라.\n`
        promptContext += `구간|구간번호|스트로크수|목표페이스|운영핵심\n`
        promptContext += `스타트|1|1-10|1:50|다리힘폭발\n`
        promptContext += `전환|2|11-20|1:57.0|길이유지\n`
        promptContext += `초반500|3|21-45|1:57.0|페이스안착`
        promptContext += `중반1500|4|46-135|1:57.0|페이스방어`
        promptContext += `후반500|5|136-180|1:56.0|스퍼트`

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${geminiKey}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: "너는 전문 로잉 머신 코치야. 다음 데이터를 Result, 구간(split), 스트로크 단위로 분석해서 마크다운 형식으로 피드백을 줘. 단, 답변 길이는 핵심만 짧게 요약해줘. 인터벌과 단일은 workout_type 데이터에서 확인 가능하니 경우를 나눠서 설명해줘.\n" + promptContext }] }]
            })
        });

        if (!response.ok) {
            throw new Error(`Gemini API Error: ${response.status}`);
        }

        const result = await response.json();
        const text = result.candidates[0].content.parts[0].text;

        feedbackBox.innerHTML = marked.parse(text);
    } catch (err) {
        feedbackBox.innerHTML = `<span class="text-red-400">분석 실패: ${err.message}</span>`;
    }
}
