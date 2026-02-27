// Consolidated script starts here
// JavaScript: consolidated and cleaned

// Initialize Particles.js (non-blocking)
if (typeof particlesJS === 'function') {
    particlesJS('particles-js', {
        particles: {
            number: { value: 60, density: { enable: true, value_area: 800 } },
            color: { value: '#37b6ff' },
            shape: { type: 'circle' },
            opacity: { value: 0.5, random: true },
            size: { value: 3, random: true },
            line_linked: { enable: true, distance: 140, color: '#37b6ff', opacity: 0.35, width: 1 },
            move: { enable: true, speed: 1.8, direction: 'none', random: true, straight: false, out_mode: 'out' }
        },
        interactivity: {
            detect_on: 'canvas',
            events: { onhover: { enable: true, mode: 'repulse' }, onclick: { enable: true, mode: 'push' } },
            modes: { repulse: { distance: 100, duration: 0.4 }, push: { particles_nb: 4 } }
        },
        retina_detect: true
    });
}

// small helpers
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

// Typewriter effect
function typeWriter(element, text, speed = 80) {
    if (!element) return;
    let i = 0;
    element.textContent = '';
    const t = setInterval(() => {
        element.textContent += text.charAt(i);
        i++;
        if (i >= text.length) clearInterval(t);
    }, speed);
}

// Smooth scrolling for same-page anchors
$$('a[href^="#"]').forEach(anchor => anchor.addEventListener('click', function (e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}));

// Mobile nav toggle
const navToggle = $('.nav-toggle');
const navMenu = $('.nav-menu');
if (navToggle && navMenu) {
    navToggle.addEventListener('click', () => {
        navMenu.classList.toggle('active');
        navToggle.classList.toggle('active');
    });
}

// Intersection Observer for subtle entrance animations
const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('animate-in'); });
}, { threshold: 0.1 });
document.querySelectorAll('section').forEach(s => observer.observe(s));

// DOM elements
const videoElement = document.getElementById('video');
const canvasElement = document.getElementById('output');
const canvasCtx = canvasElement.getContext('2d');
const statusElement = document.getElementById('status');
const alertSound = document.getElementById('alertSound');

const angleRange = document.getElementById('angleRange');
const angleValueLabel = document.getElementById('angleValue');
const framesRange = document.getElementById('framesRange');
const framesValueLabel = document.getElementById('framesValue');
const calibrateBtn = document.getElementById('calibrateBtn');
const sessionTimeEl = document.getElementById('sessionTime');
const goodPctEl = document.getElementById('goodPct');
const badPctEl = document.getElementById('badPct');

// Start / fullscreen buttons
const startBtn = document.getElementById('startBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const profileNameInput = document.getElementById('profileName');
const profileEmailInput = document.getElementById('profileEmail');
const profileSaveBtn = document.getElementById('profileSave');
const profileSignOutBtn = document.getElementById('profileSignOut');
const profileGreeting = document.getElementById('profileGreeting');
const startSessionBtn = document.getElementById('startSessionBtn');
const endSessionBtn = document.getElementById('endSessionBtn');

// State
let angleThreshold = parseFloat(angleRange?.value) || 18.3;
let badPostureFrames = 0;
let badPostureThreshold = parseInt(framesRange?.value, 10) || 3;
let cameraInstance = null; // will hold MediaPipe Camera instance
let sessionStart = null;
let totalFrames = 0;
let goodFrames = 0;
let badFrames = 0;
let neutralOffset = 0; // degrees offset measured during calibration
let sessionActive = false;
let sessionData = null; // will hold a session object when active

// Update UI from sliders
if (angleRange && angleValueLabel) {
    angleValueLabel.textContent = parseFloat(angleRange.value).toFixed(1) + '\u00b0';
    angleRange.addEventListener('input', (e) => {
        angleThreshold = parseFloat(e.target.value);
        angleValueLabel.textContent = angleThreshold.toFixed(1) + '\u00b0';
    });
}

if (framesRange && framesValueLabel) {
    framesValueLabel.textContent = framesRange.value;
    framesRange.addEventListener('input', (e) => {
        badPostureThreshold = parseInt(e.target.value, 10) || 1;
        framesValueLabel.textContent = badPostureThreshold;
    });
}

// MediaPipe Pose initialization
const pose = new Pose({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}` });
pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    enableSegmentation: false,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

// Helper: compute neck-forward angle in degrees using shoulder->ear vector
function computeNeckAngle(shoulder, ear) {
    if (!shoulder || !ear) return null;
    // Note: MediaPipe landmarks use normalized coordinates (x,y in 0..1). We only need the slope.
    const dx = ear.x - shoulder.x;
    const dy = ear.y - shoulder.y;
    // Avoid division by zero; angle relative to vertical is arctan(|dx/dy|)
    if (Math.abs(dy) < 1e-6) return 90; // almost horizontal
    const angleRad = Math.atan2(Math.abs(dx), Math.abs(dy));
    return angleRad * 180 / Math.PI; // 0 = vertical (good), larger = head forward
}

pose.onResults((results) => {
    // draw video frame
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    if (results.image) canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    if (results.poseLandmarks) {
        try {
            if (typeof drawConnectors === 'function') drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, { color: '#00FF00', lineWidth: 2 });
            if (typeof drawLandmarks === 'function') drawLandmarks(canvasCtx, results.poseLandmarks, { color: '#FF0000', lineWidth: 1 });
        } catch (e) { console.debug('draw helpers not available', e); }

        const lm = results.poseLandmarks;
        const leftShoulder = lm[11];
        const rightShoulder = lm[12];
        const leftEar = lm[7];
        const rightEar = lm[8];

        // compute angles per side, guard missing landmarks
        const leftAngle = computeNeckAngle(leftShoulder, leftEar);
        const rightAngle = computeNeckAngle(rightShoulder, rightEar);
        // pick the best available: prefer average if both present, otherwise use existent
        const avgAngle = (leftAngle != null && rightAngle != null) ? (leftAngle + rightAngle) / 2 : (leftAngle != null ? leftAngle : rightAngle);

        if (avgAngle == null) {
            statusElement.innerHTML = '<i class="fa-solid fa-user-slash"></i> No person detected. Please position yourself in view.';
            statusElement.style.color = '#ffd43b';
            badPostureFrames = 0;
        } else {
            const isBad = avgAngle > angleThreshold;
            if (isBad) {
                badPostureFrames++;
                badFrames++;
            } else {
                badPostureFrames = 0;
                goodFrames++;
            }
            totalFrames++;

            // Update status after threshold
            if (badPostureFrames > badPostureThreshold) {
                statusElement.innerText = `WARNING: Bad posture detected! Angle: ${avgAngle.toFixed(1)}°`;
                statusElement.style.color = "red";
                statusElement.style.fontFamily = "Gill Sans, sans-serif";

                // 🔊 This line triggers the sound
                (async () => {
                    try {
                        if (alertSound) {
                            // ensure audio is unmuted and has reasonable volume
                            try { alertSound.muted = false; alertSound.volume = 0.8; } catch (e) { }
                            if (alertSound.paused) {
                                const p = alertSound.play();
                                if (p && typeof p.then === 'function') {
                                    p.catch(err => console.error('alertSound.play() rejected:', err));
                                }
                            }
                            return;
                        }
                    } catch (e) {
                        console.error('alertSound.play() failed in badPosture block', e);
                    }
                    // (no fallback) only use the audio element as requested
                })();
            } else {
                statusElement.innerHTML = `<i class="fa-solid fa-check-circle"></i> Good Posture! Keep it up. (Angle: ${avgAngle.toFixed(1)}\u00b0)`;
                statusElement.style.color = '#51cf66';
            }
        }
    } else {
        statusElement.innerHTML = '<i class="fa-solid fa-user-slash"></i> No person detected. Please position yourself in view.';
        statusElement.style.color = '#ffd43b';
        badPostureFrames = 0;
    }

    // Draw angle overlay (subtle) using last computed avgAngle if present
    try {
        if (typeof avgAngle !== 'undefined' && avgAngle != null) {
            // overlay element: create once
            let overlay = document.querySelector('.canvas-angle-overlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.className = 'canvas-angle-overlay';
                overlay.setAttribute('aria-hidden', 'true');
                canvasElement.parentElement.appendChild(overlay);
            }
            const displayed = Math.max(0, (avgAngle - neutralOffset));
            overlay.textContent = `Neck Angle: ${displayed.toFixed(1)}°`;
        }
    } catch (e) { /* non-fatal */ }

    canvasCtx.restore();
});

// camera helper: create or reuse Camera instance
function ensureCameraInstance() {
    if (cameraInstance) return cameraInstance;
    if (typeof Camera === 'undefined') throw new Error('MediaPipe Camera helper not loaded');
    cameraInstance = new Camera(videoElement, {
        onFrame: async () => { await pose.send({ image: videoElement }); },
        width: 640,
        height: 480
    });
    return cameraInstance;
}

async function startCamera() {
    try {
        statusElement.innerHTML = '<i class="fa-solid fa-camera"></i> Requesting camera permission...';
        // Ensure video has a srcObject via getUserMedia (helps some browsers)
        if (!videoElement.srcObject) {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
            videoElement.srcObject = stream;
        }
        // Start the MediaPipe Camera helper
        const cam = ensureCameraInstance();
        await cam.start();
        statusElement.innerHTML = '<i class="fa-solid fa-camera"></i> Camera started. Analyzing posture...';
        // Start session timer when camera starts
        if (!sessionStart) {
            sessionStart = Date.now();
            startSessionTicker();
        }
        // (no priming) only rely on user gesture + audio element
    } catch (err) {
        console.error('Camera start failed', err);
        statusElement.innerHTML = '<i class="fa-solid fa-times-circle"></i> Could not access camera. Check permissions.';
        statusElement.style.color = '#ff6b6b';
    }
}

// Start button wiring
if (startBtn) startBtn.addEventListener('click', () => {
    // Scroll to posture section first
    const postureSection = document.getElementById('posture');
    if (postureSection) postureSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Start camera after a short delay to let scroll animation complete
    setTimeout(() => startCamera(), 400);
});

// No test sound button; audio controlled only by the <audio> tag and user interactions

// Fullscreen mode: toggle body.camera-fullscreen and adjust focus
function toggleFullscreenCamera() {
    // In-page fullscreen: toggle the CSS class only (no native fullscreen request)
    const container = document.getElementById('cameraContainer') || document.body;
    if (!document.body.classList.contains('camera-fullscreen')) {
        document.body.classList.add('camera-fullscreen');
        // move focus to camera container for keyboard-interaction accessibility
        try { container.focus && container.focus(); } catch (e) { }
    } else {
        document.body.classList.remove('camera-fullscreen');
    }
    updateCameraFsLabel();
}
if (fullscreenBtn) fullscreenBtn.addEventListener('click', () => {
    // Ensure camera is running before fullscreen
    startCamera().then(() => toggleFullscreenCamera());
});

// Camera-specific fullscreen toggle (button next to canvas)
const cameraFsBtn = document.getElementById('cameraFsBtn');
function updateCameraFsLabel() {
    const btn = cameraFsBtn;
    if (!btn) return;
    if (document.body.classList.contains('camera-fullscreen')) {
        btn.textContent = 'Exit Fullscreen';
        btn.title = 'Exit Full Screen';
    } else {
        btn.textContent = 'Full Screen';
        btn.title = 'Enter Full Screen';
    }
}

if (cameraFsBtn) {
    cameraFsBtn.addEventListener('click', async () => {
        await startCamera();
        // If not fullscreen, request it on the cameraContainer
        // Toggle in-page fullscreen class instead of native fullscreen
        if (!document.body.classList.contains('camera-fullscreen')) {
            document.body.classList.add('camera-fullscreen');
        } else {
            document.body.classList.remove('camera-fullscreen');
        }
        updateCameraFsLabel();
    });
}

// ---------- Profile (client-side, localStorage) ----------
function loadProfile() {
    try {
        const raw = localStorage.getItem('standtall_profile');
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (e) { return null; }
}

function saveProfile(name, email) {
    const p = { name: name || '', email: email || '' };
    localStorage.setItem('standtall_profile', JSON.stringify(p));
    return p;
}

function applyProfileToUI(p) {
    if (!p) {
        profileGreeting.textContent = 'Not signed in';
        profileSignOutBtn.setAttribute('aria-hidden', 'true');
        return;
    }
    profileGreeting.textContent = `Hello, ${p.name || 'User'}`;
    if (profileNameInput) profileNameInput.value = p.name || '';
    if (profileEmailInput) profileEmailInput.value = p.email || '';
    profileSignOutBtn.removeAttribute('aria-hidden');
}

// Init profile on load
document.addEventListener('DOMContentLoaded', () => {
    const p = loadProfile();
    applyProfileToUI(p);
});

if (profileSaveBtn) {
    profileSaveBtn.addEventListener('click', () => {
        const name = profileNameInput?.value?.trim() || '';
        const email = profileEmailInput?.value?.trim() || '';
        const saved = saveProfile(name, email);
        applyProfileToUI(saved);
        statusElement.textContent = 'Profile saved locally.';
        setTimeout(() => { statusElement.textContent = ''; }, 1600);
    });
}

if (profileSignOutBtn) {
    profileSignOutBtn.addEventListener('click', () => {
        localStorage.removeItem('standtall_profile');
        applyProfileToUI(null);
        statusElement.textContent = 'Signed out.';
        setTimeout(() => { statusElement.textContent = ''; }, 1200);
    });
}

// ---------- Session management ----------
function startSession() {
    if (sessionActive) return;
    // Ensure camera is running
    startCamera().then(() => {
        sessionActive = true;
        // reset session counters and capture starting timestamp
        sessionData = {
            startedAt: Date.now(),
            totalFrames: 0,
            goodFrames: 0,
            badFrames: 0,
            events: []
        };
        // hook into global counters by using the same variables
        totalFrames = 0; goodFrames = 0; badFrames = 0;
        // update UI
        startSessionBtn.disabled = true;
        endSessionBtn.disabled = false;
        statusElement.textContent = 'Session started — tracking posture.';
    });
}

function endSession() {
    if (!sessionActive) return;
    sessionActive = false;
    // finalize session data
    sessionData.endedAt = Date.now();
    sessionData.totalFrames = totalFrames;
    sessionData.goodFrames = goodFrames;
    sessionData.badFrames = badFrames;
    // compute simple analytics
    const goodPct = sessionData.totalFrames > 0 ? Math.round((sessionData.goodFrames / sessionData.totalFrames) * 100) : 0;
    const badPct = sessionData.totalFrames > 0 ? Math.round((sessionData.badFrames / sessionData.totalFrames) * 100) : 0;
    sessionData.summary = { goodPct, badPct };

    // persist session to history and show modal summary
    try { saveSessionToHistory(sessionData); } catch (e) { console.error('saveSession failed', e); }
    showSessionSummary(sessionData);

    // update UI
    startSessionBtn.disabled = false;
    endSessionBtn.disabled = true;
    statusElement.textContent = 'Session ended.';
    setTimeout(() => { statusElement.textContent = ''; }, 1400);
}

if (startSessionBtn) startSessionBtn.addEventListener('click', startSession);
if (endSessionBtn) endSessionBtn.addEventListener('click', endSession);

// Session summary modal render
function showSessionSummary(data) {
    // backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'session-modal-backdrop';
    // modal
    const modal = document.createElement('div');
    modal.className = 'session-modal';
    modal.innerHTML = `
        <h4>Session Summary</h4>
        <div class="session-summary">
            <div>Time: ${formatDuration(data.endedAt - data.startedAt)}</div>
            <div>Total frames: ${data.totalFrames}</div>
            <div>Good posture: ${data.goodFrames} (${data.summary.goodPct}%)</div>
            <div>Bad posture: ${data.badFrames} (${data.summary.badPct}%)</div>
        </div>
        <div class="session-actions">
            <button id="closeSessionSummary" class="btn-primary">Close</button>
        </div>
    `;
    document.body.appendChild(backdrop);
    document.body.appendChild(modal);
    document.getElementById('closeSessionSummary').addEventListener('click', () => {
        modal.remove(); backdrop.remove();
    });
}

function formatDuration(ms) {
    const s = Math.floor(ms / 1000);
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
}

// ---------- Session persistence and history UI ----------
function loadSessions() {
    try {
        const raw = localStorage.getItem('standtall_sessions');
        if (!raw) return [];
        return JSON.parse(raw);
    } catch (e) { return []; }
}

function saveSessionToHistory(session) {
    try {
        const arr = loadSessions();
        arr.unshift(session); // newest first
        // keep at most 50 sessions to avoid bloating storage
        const truncated = arr.slice(0, 50);
        localStorage.setItem('standtall_sessions', JSON.stringify(truncated));
        renderSessionHistory();
    } catch (e) { console.error('Failed to save session', e); }
}

function clearHistory() {
    localStorage.removeItem('standtall_sessions');
    renderSessionHistory();
}

function renderSessionHistory() {
    const list = document.getElementById('sessionList');
    const canvas = document.getElementById('historyChart');
    if (!list || !canvas) return;
    const sessions = loadSessions();
    list.innerHTML = '';
    sessions.forEach((s, idx) => {
        const li = document.createElement('li');
        const title = document.createElement('div');
        title.textContent = `${new Date(s.startedAt).toLocaleString()} (${formatDuration(s.endedAt - s.startedAt)})`;
        const meta = document.createElement('div');
        meta.textContent = `${s.summary.goodPct}% good`;
        li.appendChild(title);
        li.appendChild(meta);
        list.appendChild(li);
    });
    drawHistoryChart(canvas, sessions);
}

function drawHistoryChart(canvas, sessions) {
    const ctx = canvas.getContext('2d');
    // sizing for high-DPI
    const DPR = devicePixelRatio || 1;
    const w = canvas.width = canvas.clientWidth * DPR;
    const h = canvas.height = 240 * DPR;
    canvas.style.height = '240px';
    ctx.clearRect(0, 0, w, h);

    // background
    ctx.fillStyle = 'rgba(11,26,47,0.06)';
    ctx.fillRect(0, 0, w, h);

    if (!sessions || sessions.length === 0) {
        ctx.fillStyle = '#bfefff';
        ctx.font = `${14 * DPR}px sans-serif`;
        ctx.fillText('No sessions yet', 12 * DPR, 30 * DPR);
        return;
    }

    // prepare data: take up to 20 recent sessions (oldest->newest)
    const recent = sessions.slice(0, 20).reverse();
    const values = recent.map(s => s.summary?.goodPct || 0);

    // chart paddings
    const padL = 40 * DPR;
    const padR = 16 * DPR;
    const padT = 16 * DPR;
    const padB = 32 * DPR;

    const chartW = w - padL - padR;
    const chartH = h - padT - padB;

    // axes and gridlines
    ctx.strokeStyle = 'rgba(190,239,255,0.12)';
    ctx.lineWidth = 1 * DPR;
    ctx.beginPath();
    // y grid lines (5 steps)
    ctx.font = `${11 * DPR}px sans-serif`;
    ctx.fillStyle = '#bfefff';
    for (let i = 0; i <= 5; i++) {
        const y = padT + (chartH * i / 5);
        ctx.moveTo(padL, y);
        ctx.lineTo(w - padR, y);
        const label = `${100 - i * 20}%`;
        ctx.fillText(label, 6 * DPR, y + 4 * DPR);
    }
    ctx.stroke();

    // x axis labels (dates)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const stepX = chartW / Math.max(1, values.length - 1);

    // compute points
    const points = values.map((v, i) => {
        const x = padL + (stepX * i || 0);
        const y = padT + ((100 - v) / 100) * chartH;
        return { x, y, v, idx: i };
    });

    // smooth line using simple quadratic interpolation
    ctx.lineWidth = 2 * DPR;
    ctx.strokeStyle = '#71eaff';
    ctx.beginPath();
    points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else {
            const prev = points[i - 1];
            const cx = (prev.x + p.x) / 2;
            ctx.quadraticCurveTo(prev.x, prev.y, cx, (prev.y + p.y) / 2);
            ctx.quadraticCurveTo(cx, (prev.y + p.y) / 2, p.x, p.y);
        }
    });
    ctx.stroke();

    // draw points and x labels
    ctx.fillStyle = '#bfefff';
    points.forEach((p, i) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3 * DPR, 0, Math.PI * 2);
        ctx.fill();
        // x label (short date)
        if (i % Math.ceil(Math.max(1, points.length / 6)) === 0) {
            const s = recent[i].startedAt ? new Date(recent[i].startedAt).toLocaleDateString() : '';
            ctx.fillText(s, p.x, h - padB + 6 * DPR);
        }
    });

    // Tooltip handling: create or update tooltip element when mouse moves
    const existingTooltip = document.querySelector('.chart-tooltip');
    if (existingTooltip) existingTooltip.remove();

    // Attach one-off event listeners to canvas for hover interactivity
    canvas.onmousemove = (ev) => {
        const rect = canvas.getBoundingClientRect();
        const mx = (ev.clientX - rect.left) * DPR;
        const my = (ev.clientY - rect.top) * DPR;
        // find nearest point within threshold
        let nearest = null;
        let bestDist = 12 * DPR * 12 * DPR;
        points.forEach(pt => {
            const dx = pt.x - mx; const dy = pt.y - my; const d2 = dx * dx + dy * dy;
            if (d2 < bestDist) { bestDist = d2; nearest = pt; }
        });
        // remove old tooltip
        let tip = document.querySelector('.chart-tooltip');
        if (tip) tip.remove();
        if (nearest) {
            tip = document.createElement('div');
            tip.className = 'chart-tooltip';
            const sess = recent[nearest.idx];
            tip.textContent = `${new Date(sess.startedAt).toLocaleString()} — ${nearest.v}% good`;
            document.body.appendChild(tip);
            // position
            const left = (nearest.x / DPR) + rect.left;
            const top = (nearest.y / DPR) + rect.top;
            tip.style.left = `${left}px`;
            tip.style.top = `${top}px`;
        }
    };
    canvas.onmouseleave = () => {
        const tip = document.querySelector('.chart-tooltip'); if (tip) tip.remove();
    };
}

// Wire clear history button
const clearHistoryBtn = document.getElementById('clearHistory');
if (clearHistoryBtn) clearHistoryBtn.addEventListener('click', () => {
    if (!confirm('Clear all saved session history?')) return;
    clearHistory();
});

// Ensure history renders on load
document.addEventListener('DOMContentLoaded', () => renderSessionHistory());

// Calibrate button logic: measure neutral angle over a short window and set neutralOffset
if (calibrateBtn) {
    calibrateBtn.addEventListener('click', async () => {
        await startCamera();
        statusElement.textContent = 'Calibrating neutral posture... Please sit naturally for 3 seconds.';
        const samples = [];
        const sampleCount = 30;
        // Temporarily hook into pose.onResults by polling last frames
        const poll = setInterval(() => {
            // We cannot access internal avgAngle here directly; instead, sample from overlay text if available
            try {
                const overlay = document.querySelector('.canvas-angle-overlay');
                if (overlay) {
                    const m = overlay.textContent.match(/([0-9]+\.?[0-9]*)°/);
                    if (m) samples.push(parseFloat(m[1]));
                }
            } catch (e) { }
            if (samples.length >= sampleCount) {
                clearInterval(poll);
                const sum = samples.reduce((a, b) => a + b, 0);
                const mean = sum / samples.length;
                neutralOffset = mean;
                statusElement.textContent = `Calibrated neutral posture: ${neutralOffset.toFixed(1)}°`;
                setTimeout(() => { statusElement.textContent = 'Calibration complete.'; }, 1500);
            }
        }, 100);
    });
}

// Session ticker & stats update
function startSessionTicker() {
    const tick = () => {
        if (!sessionStart) return;
        const diff = Date.now() - sessionStart;
        const s = Math.floor(diff / 1000);
        const mm = String(Math.floor(s / 60)).padStart(2, '0');
        const ss = String(s % 60).padStart(2, '0');
        if (sessionTimeEl) sessionTimeEl.textContent = `${mm}:${ss}`;
        // stats
        const goodPct = totalFrames > 0 ? Math.round((goodFrames / totalFrames) * 100) : 0;
        const badPct = totalFrames > 0 ? Math.round((badFrames / totalFrames) * 100) : 0;
        if (goodPctEl) goodPctEl.textContent = `${goodPct}%`;
        if (badPctEl) badPctEl.textContent = `${badPct}%`;
        setTimeout(tick, 1000);
    };
    tick();
}

// Update the button label when fullscreen changes or when Esc pressed
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.body.classList.remove('camera-fullscreen');
        updateCameraFsLabel();
    }
});

// Contact form submit: POST to /contact and show result
const contactForm = document.getElementById('contactForm');
const contactStatus = document.getElementById('contactStatus');
const contactSubmit = document.getElementById('contactSubmit');
if (contactForm) {
    contactForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!contactSubmit) return;
        contactSubmit.disabled = true;
        contactStatus.textContent = 'Sending...';
        const formData = new FormData(contactForm);
        const payload = {
            name: formData.get('name'),
            email: formData.get('email'),
            message: formData.get('message')
        };
        try {
            const res = await fetch('/contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const json = await res.json();
            if (res.ok && json.ok) {
                contactStatus.style.color = '#51cf66';
                contactStatus.textContent = 'Message sent — thank you!';
                contactForm.reset();
            } else {
                contactStatus.style.color = '#ff6b6b';
                contactStatus.textContent = json.error || 'Failed to send message.';
            }
        } catch (err) {
            contactStatus.style.color = '#ff6b6b';
            contactStatus.textContent = 'Network error — could not send message.';
            console.error('Contact send error', err);
        } finally {
            contactSubmit.disabled = false;
            setTimeout(() => { contactStatus.textContent = ''; }, 5000);
        }
    });
}

// Init small UX bits on load
document.addEventListener('DOMContentLoaded', () => {
    typeWriter(document.querySelector('.hero-title'), 'Stand Tall, Live Better');
});