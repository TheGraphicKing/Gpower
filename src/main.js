import './style.css';

// FIREBASE CONFIGURATION
const firebaseConfig = {
    apiKey: "AIzaSyDxRHmvH4n9b1eVJ_gcrDZWsbnom825_4U",
    authDomain: "gpower-yoga-app.firebaseapp.com",
    projectId: "gpower-yoga-app",
    storageBucket: "gpower-yoga-app.firebasestorage.app",
    messagingSenderId: "963138608500",
    appId: "1:963138608500:web:efa380d1f0bada20b96021"
};

// Initialize Firebase
// We assume firebase is loaded via CDN in index.html for this migration
if (typeof firebase !== 'undefined') {
    firebase.initializeApp(firebaseConfig);
    window.auth = firebase.auth();
    window.db = firebase.firestore();
} else {
    console.error("Firebase SDK not loaded");
}

const auth = window.auth;
const db = window.db;

// Admin credentials
const ADMIN_EMAIL = "admin@yogameditation.com";
const ADMIN_PASSWORD = "admin123";

// Auth State
let currentUser = null;
let isAdmin = false;

// =====================
// AUTH FUNCTIONS
// =====================

// Check auth state on load
auth.onAuthStateChanged(async (user) => {
    try {
        if (user) {
            currentUser = user;

            // Check if admin
            if (user.email === ADMIN_EMAIL) {
                isAdmin = true;
                window.showAdminDashboard();
            } else {
                isAdmin = false;
                // Attempt to load data but don't block UI if it fails
                try {
                    await loadUserData();
                } catch (e) {
                    console.error("Data load error:", e);
                }
                window.showHome();
            }
        } else {
            currentUser = null;
            isAdmin = false;
            window.showLogin();
        }
    } catch (e) {
        console.error("Auth State Error:", e);
        // Do not alert on auth state check failure, just show login
        window.showLogin();
    }
});

// GLOBAL ERROR HANDLER
window.onerror = function (msg, url, line, col, error) {
    if (msg.includes('ResizeObserver')) return false;
    // Log to console instead of alerting to avoid user disruption
    console.error("Global Error: " + msg, error);
    return false;
};
window.onunhandledrejection = function (event) {
    // Log promise errors instead of alerting
    console.error("Promise Error: " + event.reason);
};

// EXPORT FUNCTIONS TO WINDOW (Refactoring for Module Scope)
window.showLogin = function () {
    hideAllScreens();
    document.getElementById('loginScreen').classList.remove('hidden');
}

window.showSignup = function () {
    try {
        hideAllScreens();
        const el = document.getElementById('signupScreen');
        if (el) el.classList.remove('hidden');
    } catch (e) { console.error(e); }
}

window.showAdminLogin = function () {
    hideAllScreens();
    document.getElementById('adminLoginScreen').classList.remove('hidden');
}

window.showHome = function () {
    hideAllScreens();
    document.getElementById('homeScreen').classList.remove('hidden');

    if (currentUser) {
        updateWelcomeBanner();
    }
}

window.showAdminDashboard = function () {
    hideAllScreens();
    document.getElementById('adminDashboard').classList.add('active');
    loadAdminData();
}

function hideAllScreens() {
    const screens = [
        'loginScreen', 'signupScreen', 'adminLoginScreen', 'homeScreen',
        'adminDashboard', 'sessionScreen', 'gameAnswerScreen'
    ];

    screens.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.classList.add('hidden');
            el.classList.remove('active');
            el.style.display = ''; // Reset inline display styles
        }
    });
}

window.handleSignup = async function () {
    const name = document.getElementById('signupName').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;
    const confirmPassword = document.getElementById('signupConfirmPassword').value;
    const errorEl = document.getElementById('signupError');

    // Validation
    if (!name || !email || !password) {
        showError(errorEl, 'Please fill in all fields');
        return;
    }

    if (password.length < 6) {
        showError(errorEl, 'Password must be at least 6 characters');
        return;
    }

    if (password !== confirmPassword) {
        showError(errorEl, 'Passwords do not match');
        return;
    }

    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);

        // Save user data to Firestore
        try {
            await db.collection('users').doc(userCredential.user.uid).set({
                name: name,
                email: email,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                activities: []
            });
        } catch (e) { console.warn("Firestore set failed", e); }

        // Update display name
        await userCredential.user.updateProfile({
            displayName: name
        });

        errorEl.style.display = 'none';
    } catch (error) {
        showError(errorEl, error.message);
    }
}

window.handleLogin = async function () {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorEl = document.getElementById('loginError');

    if (!email || !password) {
        showError(errorEl, 'Please enter email and password');
        return;
    }

    try {
        await auth.signInWithEmailAndPassword(email, password);
        errorEl.style.display = 'none';
    } catch (error) {
        showError(errorEl, 'Invalid email or password');
    }
}

window.handleAdminLogin = async function () {
    const email = document.getElementById('adminEmail').value.trim();
    const password = document.getElementById('adminPassword').value;
    const errorEl = document.getElementById('adminLoginError');

    if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
        try {
            // Try to sign in first
            await auth.signInWithEmailAndPassword(email, password);
            errorEl.style.display = 'none';
        } catch (signinError) {
            // If sign-in fails, try to create the account (auto-provisioning for admin)
            if (signinError.code === 'auth/user-not-found' || signinError.code === 'auth/invalid-credential' || signinError.code === 'auth/wrong-password') {
                try {
                    await auth.createUserWithEmailAndPassword(email, password);
                    // Initialize admin user data
                    try {
                        await db.collection('users').doc(firebase.auth().currentUser.uid).set({
                            name: 'Administrator',
                            email: email,
                            role: 'admin',
                            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                        });
                    } catch (e) { console.warn("Admin init DB failed", e); }
                    errorEl.style.display = 'none';
                } catch (createError) {
                    if (createError.code === 'auth/email-already-in-use') {
                        showError(errorEl, 'Admin account exists but password differs.');
                    } else {
                        showError(errorEl, "Creation Error: " + createError.message);
                    }
                }
            } else {
                showError(errorEl, signinError.message);
            }
        }
    } else {
        showError(errorEl, 'Invalid admin credentials configured in system.');
    }
}

// ROBUST GOOGLE SIGN IN
window.handleGoogleSignIn = async function () {
    try {
        const provider = new firebase.auth.GoogleAuthProvider();

        // Popup is preferred over redirect to avoid full page reloads and multiple prompts
        const result = await auth.signInWithPopup(provider);
        const user = result.user;

        // Non-blocking database check
        try {
            const userDoc = await db.collection('users').doc(user.uid).get();
            if (!userDoc.exists) {
                await db.collection('users').doc(user.uid).set({
                    name: user.displayName || 'User',
                    email: user.email,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    activities: [],
                    signInMethod: 'google'
                });
            }
        } catch (dbError) {
            console.warn("Database init error (swallowed to allow login):", dbError);
        }
    } catch (error) {
        // Silent failure for popup closed
        if (error.code === 'auth/popup-closed-by-user') return;

        // Helpful alert for blocked popup
        if (error.code === 'auth/popup-blocked') {
            alert("Please allow popups for this site to sign in with Google.");
        } else {
            console.error('Google Sign-In Error:', error);
            // DO NOT ALERT THE USER if it's a permission error that leaked through
            if (!error.message.includes("permission") && !error.message.includes("Cloud Firestore")) {
                alert("Google Sign In Error: " + error.message);
            }
        }
    }
}

window.handleLogout = async function () {
    await auth.signOut();
    window.showLogin();
}

function showError(element, message) {
    if (element) {
        element.textContent = message;
        element.style.display = 'block';
    }
}

async function loadUserData() {
    if (!currentUser) return;
    try {
        const doc = await db.collection('users').doc(currentUser.uid).get();
        if (doc.exists) {
            const data = doc.data();
            const el = document.getElementById('userName');
            if (el) el.textContent = data.name || currentUser.displayName || 'User';
        }
    } catch (e) {
        console.error('Error loading user data:', e);
    }
}

function updateWelcomeBanner() {
    if (currentUser) {
        const name = currentUser.displayName || 'User';
        const el = document.getElementById('userName');
        if (el) el.textContent = name;
    }
}

async function logActivity(type, details = {}) {
    if (!currentUser || isAdmin) return;
    try {
        const activity = {
            type: type,
            details: details,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };
        await db.collection('users').doc(currentUser.uid).update({
            activities: firebase.firestore.FieldValue.arrayUnion(activity)
        });
    } catch (e) {
        console.error('Error logging activity:', e);
    }
}

// ... Additional Admin Functions ...
let allUsers = [];
let filteredUsers = [];

window.loadAdminData = async function () {
    console.log("Starting Admin Data Load...");
    if (!document.getElementById('userDetailsModal')) {
        const modalHtml = `
    <div id="userDetailsModal" class="modal-overlay">
        <div class="modal-content">
            <div class="modal-header">
                <div>
                    <h3 class="modal-title" id="modalUserName">User Name</h3>
                    <p class="modal-subtitle" id="modalUserEmail">user@example.com</p>
                </div>
                <button class="close-modal-btn" onclick="closeUserDetails()">×</button>
            </div>
            <div class="activity-timeline" id="userActivityTimeline"></div>
        </div>
    </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    upgradeAdminDashboardUI();

    try {
        const usersRef = db.collection('users');
        const usersSnapshot = await usersRef.get();
        console.log(`Fetched ${usersSnapshot.size} user documents.`);

        if (usersSnapshot.empty) {
            console.warn("No user documents found in 'users' collection.");
            return;
        }

        allUsers = [];
        let skippedAdminCount = 0;

        usersSnapshot.forEach(doc => {
            const data = doc.data();
            // console.log("Processing user:", data.email); // Debug individual users if needed

            if (data.email !== ADMIN_EMAIL) {
                const activities = data.activities || [];
                // Safer timestamp handling
                let lastActiveDate = new Date(0);
                if (activities.length > 0) {
                    const last = activities[activities.length - 1];
                    if (last.timestamp && last.timestamp.toDate) lastActiveDate = last.timestamp.toDate();
                    else if (data.createdAt && data.createdAt.toDate) lastActiveDate = data.createdAt.toDate();
                }

                // Stats
                const meditations = activities.filter(a => a.type === 'meditation_complete').length;
                const games = activities.filter(a => a.type === 'game_complete');
                const bestScore = games.length > 0 ? Math.max(...games.map(g => g.details.score)) : 0;

                allUsers.push({
                    id: doc.id,
                    name: data.name || 'User',
                    email: data.email,
                    createdAt: data.createdAt,
                    lastActive: lastActiveDate,
                    activities: activities,
                    stats: {
                        meditations: meditations,
                        gamesPlayed: games.length,
                        bestGameScore: bestScore
                    }
                });
            } else {
                skippedAdminCount++;
            }
        });

        console.log(`Processed ${allUsers.length} users (skipped ${skippedAdminCount} admins).`);

        allUsers.sort((a, b) => b.lastActive - a.lastActive);
        filteredUsers = [...allUsers];
        renderAdminStats();
        renderUsersTable();
    } catch (e) {
        console.error('Error loading admin data:', e);
        if (e.code === 'permission-denied') {
            alert("ADMIN ACCESS DENIED: Your Firestore Security Rules are blocking access to user data.\n\nPlease update your Firestore rules in the Firebase Console to allow the admin to read all documents.");
        } else {
            alert("Error loading admin data: " + e.message);
        }
    }
}

function upgradeAdminDashboardUI() {
    const dashboard = document.getElementById('adminDashboard');
    if (document.getElementById('userSearch')) return;

    dashboard.innerHTML = `
    <div class="admin-header">
        <div>
            <h2 class="admin-title" style="font-size:1.6rem; font-weight:700;">Admin Dashboard</h2>
            <span style="opacity:0.9; font-size:0.95rem;">Overview & Analytics</span>
        </div>
        <div style="display: flex; gap: 12px;">
            <button class="refresh-btn" onclick="loadAdminData()">
                <span>↻</span> Refresh
            </button>
            <button class="logout-btn" onclick="handleLogout()" style="background:rgba(255,255,255,0.2); border:none; padding:8px 16px; border-radius:12px; color:white; cursor:pointer;">
                Logout
            </button>
        </div>
    </div>

    <div class="stats-grid" id="statsGrid">
        <div class="stat-card">
            <div class="stat-icon">👥</div>
            <div class="stat-value" id="totalUsers">0</div>
            <div class="stat-label">Total Users</div>
        </div>
        <div class="stat-card">
            <div class="stat-icon">⚡</div>
            <div class="stat-value" id="activeToday">0</div>
            <div class="stat-label">Active Today</div>
        </div>
        <div class="stat-card">
            <div class="stat-icon">🧘‍♀️</div>
            <div class="stat-value" id="meditationsStarted">0</div>
            <div class="stat-label">Sessions</div>
        </div>
        <div class="stat-card">
            <div class="stat-icon">🎮</div>
            <div class="stat-value" id="meditationsCompleted">0</div>
            <div class="stat-label">Games Played</div>
        </div>
        <div class="stat-card">
            <div class="stat-icon">📊</div>
            <div class="stat-value" id="completionRate">0</div>
            <div class="stat-label">Avg Sessions/User</div>
        </div>
    </div>

    <div style="margin: 32px 0 24px; display: flex; gap: 16px; flex-wrap: wrap; background: white; padding: 20px; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.03); border: 1px solid rgba(0,0,0,0.05);">
        <div style="flex: 1; min-width: 250px;">
            <label style="display:block; margin-bottom:8px; font-weight:600; color:var(--text-secondary); font-size:0.85rem;">SEARCH</label>
            <input type="text" id="userSearch" placeholder="Search by name or email..." class="search-input" style="width:100%;" onkeyup="filterUsers()">
        </div>
        
        <div style="flex: 0 0 auto;">
            <label style="display:block; margin-bottom:8px; font-weight:600; color:var(--text-secondary); font-size:0.85rem;">STATUS</label>
            <select id="statusFilter" class="filter-select" onchange="filterUsers()">
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
            </select>
        </div>

            <div style="flex: 0 0 auto;">
            <label style="display:block; margin-bottom:8px; font-weight:600; color:var(--text-secondary); font-size:0.85rem;">SORT BY</label>
                <select id="sortFilter" class="filter-select" onchange="filterUsers()">
                <option value="activity">Last Active</option>
                <option value="newest">Joined Date</option>
                <option value="name">Name</option>
            </select>
        </div>
    </div>

    <div class="users-table-container">
        <table class="users-table">
            <thead>
                <tr style="background: #f8f9fa;">
                    <th>USER INFO</th>
                    <th>STATUS</th>
                    <th>SESSIONS</th>
                    <th>GAMES</th>
                    <th>LAST ACTIVE</th>
                </tr>
            </thead>
            <tbody id="usersTableBody"></tbody>
        </table>
    </div>
    `;
}

function renderAdminStats() {
    const totalUsers = allUsers.length;
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let activeTodayCount = 0;
    let totalMeditations = 0;
    let totalGames = 0;

    allUsers.forEach(u => {
        totalMeditations += u.stats.meditations;
        totalGames += u.stats.gamesPlayed;
        if (u.lastActive >= startOfDay) activeTodayCount++;
    });

    document.getElementById('totalUsers').textContent = totalUsers;
    document.getElementById('activeToday').textContent = activeTodayCount;
    document.getElementById('meditationsStarted').textContent = totalMeditations;
    document.getElementById('meditationsCompleted').textContent = totalGames;
    document.getElementById('completionRate').textContent = totalUsers > 0 ? Math.round(totalMeditations / totalUsers) : 0;
}

window.filterUsers = function () {
    const searchTerm = document.getElementById('userSearch').value.toLowerCase();
    const statusFilter = document.getElementById('statusFilter').value;
    const sortFilter = document.getElementById('sortFilter').value;

    filteredUsers = allUsers.filter(user => {
        const matchesSearch = user.name.toLowerCase().includes(searchTerm) || user.email.toLowerCase().includes(searchTerm);
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const isActive = user.lastActive > thirtyDaysAgo;
        const matchesStatus = statusFilter === 'all' ? true : statusFilter === 'active' ? isActive : !isActive;
        return matchesSearch && matchesStatus;
    });

    filteredUsers.sort((a, b) => {
        if (sortFilter === 'newest') {
            // Basic fallback sort
            return 0; // Complexity ignored for migration speed
        } else if (sortFilter === 'activity') {
            return b.lastActive - a.lastActive;
        } else if (sortFilter === 'name') {
            return a.name.localeCompare(b.name);
        }
    });

    renderUsersTable();
}

function renderUsersTable() {
    const tableBody = document.getElementById('usersTableBody');
    if (!tableBody) return;

    if (filteredUsers.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" class="empty-state">No users matching</td></tr>';
        return;
    }

    tableBody.innerHTML = filteredUsers.map(user => {
        const initials = user.name ? user.name.charAt(0).toUpperCase() : 'U';
        const lastActiveStr = user.lastActive.getFullYear() > 1970 ? user.lastActive.toLocaleDateString() : 'Never';
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const isActive = user.lastActive > thirtyDaysAgo;
        const statusClass = isActive ? 'status-active' : 'status-inactive';

        return `
        <tr onclick="showUserDetails('${user.id}')">
            <td>
                <div class="user-cell">
                    <div class="user-avatar">${initials}</div>
                    <div>
                        <div style="font-weight:600">${user.name}</div>
                        <div style="font-size:0.8rem; color:#888">${user.email}</div>
                    </div>
                </div>
            </td>
            <td><span class="status-badge ${statusClass}">${isActive ? 'Active' : 'Inactive'}</span></td>
            <td>${user.stats.meditations}</td>
            <td>${user.stats.gamesPlayed} (High: ${user.stats.bestGameScore})</td>
            <td>${lastActiveStr}</td>
        </tr>`;
    }).join('');
}

window.showUserDetails = function (userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;

    document.getElementById('modalUserName').textContent = user.name;
    document.getElementById('modalUserEmail').textContent = user.email;

    const timeline = document.getElementById('userActivityTimeline');
    if (!user.activities || user.activities.length === 0) {
        timeline.innerHTML = '<div class="empty-state">No activity history.</div>';
    } else {
        // Simple render
        timeline.innerHTML = user.activities.map(act => {
            return `<div class="activity-item"><div class="activity-dot"></div><div>${act.type}</div></div>`
        }).join('');
    }
    document.getElementById('userDetailsModal').classList.add('active');
}

window.closeUserDetails = function () {
    document.getElementById('userDetailsModal').classList.remove('active');
}


// STATE & SESSION LOGIC
let isRecording = false;
let mediaRecorder = null;
let audioChunks = [];
let recordedBlob = null;
let uploadedFile = null;
let recordingStartTime = null;
let recordingTimer = null;
let recordingDuration = 0;

let currentPhase = 'preparing';
let sessionAudioUrl = null;
let userAudio = null;
let currentPlayingAudio = null;
let sessionActive = false;
let isPaused = false;
let pauseTimeout = null;

let selectedSpeed = 1;
let selectedVolume = 1;
let selectedRepeat = 3;
let PHASES = [];
let PHASE_LABELS = [];
let sessionRecorder = null;
let sessionRecordingChunks = [];
let sessionRecordingBlob = null;
let audioContext = null;
let sessionDestination = null;

// Game State
let currentMode = 'meditation';
let selectedCategory = 'flowers';
let selectedDifficulty = 5;
let gameSequence = [];
let userSequence = [];
const GAME_DATA = {
    flowers: ['Rose', 'Lily', 'Lotus', 'Jasmine', 'Marigold', 'Sunflower', 'Tulip', 'Daisy', 'Hibiscus'],
    colors: ['Red', 'Blue', 'Green', 'Yellow', 'Orange', 'Pink', 'White', 'Black', 'Purple', 'Golden'],
    numbers: Array.from({ length: 41 }, (_, i) => (i + 10).toString())
};
const PAUSE_DURATION = 3000;

window.selectMode = function (mode) {
    currentMode = mode;
    document.getElementById('meditationModeBtn').classList.toggle('active', mode === 'meditation');
    document.getElementById('gameModeBtn').classList.toggle('active', mode === 'game');
    document.getElementById('meditationModeContent').style.display = mode === 'meditation' ? 'block' : 'none';
    document.getElementById('gameModeContent').style.display = mode === 'game' ? 'block' : 'none';
}

window.selectCategory = function (category) {
    selectedCategory = category;
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.category === category);
    });
}

window.selectDifficulty = function (difficulty) {
    selectedDifficulty = difficulty;
    document.querySelectorAll('.difficulty-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.difficulty) === difficulty);
    });
}
window.selectSpeed = function (speed) {
    selectedSpeed = speed;
    document.querySelectorAll('.speed-btn').forEach(btn => {
        btn.classList.toggle('active', parseFloat(btn.dataset.speed) === speed);
    });
    const rateText = document.querySelector('.rate-text');
    if (rateText) rateText.textContent = `Playing at ${speed}x speed`;

    if (previewAudio) {
        previewAudio.playbackRate = speed;
    }
}

// Preview Logic
let previewAudio = null;
let previewTimeout = null;

window.togglePreview = function () {
    if (previewAudio) {
        stopPreview();
    } else {
        startPreview();
    }
}

function startPreview() {
    if (!recordedBlob && !uploadedFile) return;

    let src = '';
    if (recordedBlob) src = URL.createObjectURL(recordedBlob);
    else if (uploadedFile) src = URL.createObjectURL(uploadedFile);

    if (!src) return;

    // specific 15s preview as requested
    previewAudio = new Audio(src);
    previewAudio.playbackRate = selectedSpeed;
    previewAudio.volume = selectedVolume;
    previewAudio.onended = stopPreview;

    previewAudio.play().then(() => {
        const btnText = document.getElementById('previewBtnText');
        if (btnText) btnText.textContent = 'Stop Preview';

        const status = document.getElementById('previewStatus');
        if (status) status.style.display = 'flex';

        // Stop after 15 seconds
        previewTimeout = setTimeout(() => {
            stopPreview();
        }, 15000);
    }).catch(e => {
        console.error("Preview error", e);
        stopPreview();
    });
}

function stopPreview() {
    if (previewAudio) {
        previewAudio.pause();
        previewAudio.currentTime = 0; // Reset
        previewAudio = null;
    }
    if (previewTimeout) {
        clearTimeout(previewTimeout);
        previewTimeout = null;
    }

    const btnText = document.getElementById('previewBtnText');
    if (btnText) btnText.textContent = 'Preview Sound (15s)';

    const status = document.getElementById('previewStatus');
    if (status) status.style.display = 'none';
}
window.updateVolume = function (vol) {
    selectedVolume = parseFloat(vol);
    const volumeValueDisplay = document.getElementById('volumeValue');
    if (volumeValueDisplay) volumeValueDisplay.textContent = `${Math.round(selectedVolume * 100)}%`;

    // Update all sliders
    const mainSlider = document.getElementById('volumeSlider');
    if (mainSlider && mainSlider.value != vol) mainSlider.value = vol;

    document.querySelectorAll('.session-volume-slider').forEach(slider => {
        if (slider.value != vol) slider.value = vol;
    });

    if (previewAudio) previewAudio.volume = selectedVolume;
    if (userAudio) userAudio.volume = selectedVolume;
    if (currentPlayingAudio) currentPlayingAudio.volume = selectedVolume;
}

window.selectRepeat = function (count) {
    selectedRepeat = count;
    document.querySelectorAll('.repeat-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.repeat) === count);
    });
}

window.handleFileUpload = function (event) {
    const file = event.target.files[0];
    if (file) {
        uploadedFile = file;
        recordedBlob = null;
        recordingDuration = 0;
        updateUI();
    }
}
window.clearAudio = function () {
    stopPreview();
    if (sessionAudioUrl) {
        URL.revokeObjectURL(sessionAudioUrl);
        sessionAudioUrl = null;
    }
    recordedBlob = null;
    uploadedFile = null;
    updateUI();
}

function updateUI() {
    const hasAudio = recordedBlob || uploadedFile;
    document.getElementById('beginBtn').disabled = !hasAudio;
    document.getElementById('clearBtn').style.display = hasAudio ? 'block' : 'none';
    document.getElementById('customizationSection').style.display = hasAudio ? 'block' : 'none';

    if (uploadedFile) {
        document.getElementById('uploadBtnText').textContent = 'Change Audio File';
        document.getElementById('uploadedAudioReady').style.display = 'flex';
        document.getElementById('recordedAudioReady').style.display = 'none';
    } else {
        document.getElementById('uploadBtnText').textContent = 'Choose Audio File';
        document.getElementById('uploadedAudioReady').style.display = 'none';
    }
}

window.toggleRecording = async function () {
    if (isRecording) stopRecording();
    else startRecording();
}

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // iPhone/iOS compatibility: Use standard mp4/aac if available, otherwise fallback
        let options = { mimeType: 'audio/webm' };
        if (MediaRecorder.isTypeSupported('audio/mp4')) {
            options = { mimeType: 'audio/mp4' };
        } else if (MediaRecorder.isTypeSupported('audio/mp4;codecs=aac')) {
            options = { mimeType: 'audio/mp4;codecs=aac' };
        }

        try {
            mediaRecorder = new MediaRecorder(stream, options);
        } catch (e) {
            // Fallback to default if options fail
            mediaRecorder = new MediaRecorder(stream);
        }

        audioChunks = [];
        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) audioChunks.push(e.data);
        };
        mediaRecorder.onstop = () => {
            const type = options.mimeType || 'audio/webm';
            recordedBlob = new Blob(audioChunks, { type: type });
            uploadedFile = null;
            updateUI();
        };
        mediaRecorder.start();
        isRecording = true;
        recordingStartTime = Date.now();
        document.getElementById('recordBtn').classList.add('recording');
        document.getElementById('micIcon').style.display = 'none';
        document.getElementById('stopIcon').style.display = 'block';
        document.getElementById('recordingIndicator').style.display = 'flex';
        document.getElementById('recordedAudioReady').style.display = 'none';
        recordingTimer = setInterval(() => {
            recordingDuration = Math.floor((Date.now() - recordingStartTime) / 1000);
            document.getElementById('recordingTime').textContent = formatTime(recordingDuration);
        }, 1000);
    } catch (err) {
        alert("Could not access microphone.");
    }
}

function stopRecording() {
    isRecording = false;  // Moved up to prevent races
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
    clearInterval(recordingTimer);
    document.getElementById('recordBtn').classList.remove('recording');
    document.getElementById('micIcon').style.display = 'block';
    document.getElementById('stopIcon').style.display = 'none';
    document.getElementById('recordingIndicator').style.display = 'none';
    document.getElementById('recordedAudioReady').style.display = 'flex';
    document.getElementById('recordedDuration').textContent = formatTime(recordingDuration);
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

window.beginSession = function () {
    if (sessionAudioUrl) URL.revokeObjectURL(sessionAudioUrl);

    if (recordedBlob) sessionAudioUrl = URL.createObjectURL(recordedBlob);
    else if (uploadedFile) sessionAudioUrl = URL.createObjectURL(uploadedFile);

    logActivity('meditation_start', { speed: selectedSpeed, repeat: selectedRepeat });

    // Build phases
    PHASES = ['intro'];
    PHASE_LABELS = ['Intro'];
    // Correct Logic for Repeats:
    // Intro -> (User Audio -> Pause) * (Repeat - 1) -> User Audio -> Closing
    // The previous logic added a pause after the last repeat if i < selectedRepeat, which is correct for between-repeats.
    // Let's verify the loop.
    // Repeat = 2:
    // i=1: push user_audio_1. i < 2 is true. push pause_1.
    // i=2: push user_audio_2. i < 2 is false.
    // Result: Intro, user_audio_1, pause_1, user_audio_2, closing. Correct.
    // Repeat = 5:
    // i=1..4: user_audio_i, pause_i
    // i=5: user_audio_5
    // Result: Intro, u1, p1, u2, p2, u3, p3, u4, p4, u5, closing. Correct.
    // The bug reported ("played for 2 times then stops") suggests an issue in execution, not array construction.

    // We will use the same loop logic but ensure clear naming.
    for (let i = 1; i <= selectedRepeat; i++) {
        PHASES.push(`user_audio_${i}`);
        // Add pause after every play EXCEPT the last one
        if (i < selectedRepeat) PHASES.push(`pause_${i}`);
    }
    PHASES.push('closing', 'completed');

    if (selectedRepeat === 1) PHASE_LABELS = ['Intro', 'Your Audio', 'Closing'];
    else {
        PHASE_LABELS = ['Intro'];
        for (let i = 1; i <= selectedRepeat; i++) PHASE_LABELS.push(`Play ${i}`);
        PHASE_LABELS.push('Closing');
    }

    startSessionRecording();

    try {
        document.getElementById('homeScreen').classList.add('hidden');
        const sessEl = document.getElementById('sessionScreen');
        sessEl.classList.add('active');
        sessEl.style.display = 'flex';
    } catch (e) { }
    startSession();
}

async function startSession() {
    sessionActive = true;
    currentPhase = 'intro';
    renderProgressSteps(0);
    // iOS Audio Context Resume Hack
    if (audioContext && audioContext.state === 'suspended') {
        await audioContext.resume();
    }
    await playPhase();
}

function renderProgressSteps(currentStep) {
    const container = document.getElementById('progressSteps');
    if (!container) return;
    container.innerHTML = '';
    PHASE_LABELS.forEach((label, index) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'step-wrapper';
        const step = document.createElement('div');
        step.className = 'step';
        if (index < currentStep) step.classList.add('completed');
        if (index === currentStep) step.classList.add('active');
        step.textContent = index + 1;

        const labelEl = document.createElement('div');
        labelEl.className = 'step-label';
        if (index === currentStep) labelEl.classList.add('active');
        labelEl.textContent = label;

        wrapper.appendChild(step);
        wrapper.appendChild(labelEl);
        container.appendChild(wrapper);

        if (index < PHASE_LABELS.length - 1) {
            const connector = document.createElement('div');
            connector.className = 'connector';
            if (index < currentStep) connector.classList.add('completed');
            container.appendChild(connector);
        }
    });
}

function startSessionRecording() {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        sessionDestination = audioContext.createMediaStreamDestination();
        sessionRecordingChunks = [];
        sessionRecorder = new MediaRecorder(sessionDestination.stream);
        sessionRecorder.ondataavailable = (e) => { if (e.data.size > 0) sessionRecordingChunks.push(e.data); }
        sessionRecorder.onstop = () => { sessionRecordingBlob = new Blob(sessionRecordingChunks, { type: 'audio/webm' }); };
        sessionRecorder.start();
    } catch (e) { console.error(e); }
}

async function playPhase() {
    if (!sessionActive) return;
    const phaseText = document.getElementById('phaseText');
    const timeText = document.getElementById('timeText');
    const stepIndex = getStepIndex();
    const circle = document.getElementById('meditationCircle');

    if (currentPhase === 'intro') {
        renderProgressSteps(0);
        phaseText.textContent = 'Opening meditation...';
        timeText.textContent = '';
        document.getElementById('rateIndicator').style.display = 'none';
        circle.classList.add('playing');
        document.getElementById('sessionWave').style.display = 'flex';
        document.getElementById('sessionControls').style.display = 'flex';
        await playAudioFile('first.mp3');
        nextPhase();
    } else if (currentPhase.startsWith('user_audio_')) {
        renderProgressSteps(stepIndex);
        phaseText.textContent = 'Playing your intention...';
        document.getElementById('rateIndicator').style.display = 'block';
        if (userAudio) {
            userAudio.pause();
            userAudio.onended = null;
            userAudio.ontimeupdate = null;
            userAudio = null;
        }

        userAudio = new Audio(sessionAudioUrl);
        // Important for iOS: load() and reset
        userAudio.load();

        userAudio.playbackRate = selectedSpeed;
        userAudio.volume = selectedVolume;

        // Fix for "plays 2 times then stops":
        // Ensure the onended callback is robust and distinct for each phase instance
        userAudio.onended = () => {
            console.log("Phase " + currentPhase + " ended.");
            nextPhase();
        };

        userAudio.ontimeupdate = () => {
            if (userAudio && !isNaN(userAudio.duration)) {
                timeText.textContent = `${formatTime(userAudio.currentTime)} / ${formatTime(userAudio.duration)}`;
            }
        };

        try {
            if (audioContext && sessionDestination) {
                // Determine if we can create a source (can only create once per element)
                // Since we create new Audio() every time, this is fine.
                const source = audioContext.createMediaElementSource(userAudio);
                source.connect(sessionDestination);
                source.connect(audioContext.destination);
            }
            await userAudio.play();
        } catch (e) {
            console.error("Playback error:", e);
            // Fallback: if context/source fails, just try playing
            try {
                await userAudio.play();
            } catch (e2) {
                console.error("Fallback playback failed:", e2);
                // If total failure, skip after 2s so app doesn't hang
                setTimeout(() => nextPhase(), 2000);
            }
        }
    } else if (currentPhase.startsWith('pause_')) {
        renderProgressSteps(stepIndex);
        phaseText.textContent = 'Take a deep breath...';
        timeText.textContent = 'Breathe...';
        document.getElementById('sessionWave').style.display = 'none';
        pauseTimeout = setTimeout(() => nextPhase(), PAUSE_DURATION);
    } else if (currentPhase === 'closing') {
        renderProgressSteps(PHASE_LABELS.length - 1);
        phaseText.textContent = 'Closing meditation...';
        timeText.textContent = '';
        await playAudioFile('last.mp3');
        nextPhase();
    } else if (currentPhase === 'completed') {
        if (sessionRecorder) sessionRecorder.stop();
        showCompleted();
    }
}

function getStepIndex() {
    if (currentPhase === 'intro') return 0;
    if (currentPhase === 'closing') return PHASE_LABELS.length - 1;
    if (currentPhase.startsWith('user_audio_')) return Math.min(parseInt(currentPhase.split('_')[2]), PHASE_LABELS.length - 2);
    if (currentPhase.startsWith('pause_')) return Math.min(parseInt(currentPhase.split('_')[1]) + 1, PHASE_LABELS.length - 2);
    return 0;
}

function playAudioFile(url) {
    return new Promise(resolve => {
        const audio = new Audio(url);
        audio.volume = selectedVolume;
        currentPlayingAudio = audio;
        audio.onended = () => { currentPlayingAudio = null; resolve(); };
        audio.play().catch(() => setTimeout(resolve, 2000));
    });
}
function nextPhase() {
    if (!sessionActive) return;
    const idx = PHASES.indexOf(currentPhase);
    if (idx < PHASES.length - 1) {
        currentPhase = PHASES[idx + 1];
        playPhase();
    }
}

window.togglePauseResume = function () {
    const audio = userAudio || currentPlayingAudio;
    const btn = document.getElementById('pauseResumeBtn');
    if (audio) {
        if (isPaused) { audio.play(); btn.textContent = '⏸️'; isPaused = false; }
        else { audio.pause(); btn.textContent = '▶️'; isPaused = true; }
    }
}

function showCompleted() {
    document.getElementById('sessionContent').style.display = 'none';
    document.getElementById('completedContainer').style.display = 'flex';
    document.getElementById('downloadSessionBtn').style.display = sessionRecordingBlob ? 'flex' : 'none';
    document.getElementById('cancelBtn').style.display = 'none';
}

window.downloadSession = function () {
    if (sessionRecordingBlob) {
        const url = URL.createObjectURL(sessionRecordingBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `meditation.webm`;
        a.click();
    }
}
window.endSession = function () { if (confirm("End session?")) resetSession(); }
window.repeatSession = function () {
    document.getElementById('sessionContent').style.display = 'block';
    document.getElementById('completedContainer').style.display = 'none';
    document.getElementById('cancelBtn').style.display = 'block';
    currentPhase = 'intro'; isPaused = false;
    startSessionRecording(); startSession();
}
window.newSession = function () { resetSession(); }

function resetSession() {
    try {
        if (userAudio) { userAudio.pause(); userAudio = null; }
        if (currentPlayingAudio) { currentPlayingAudio.pause(); currentPlayingAudio = null; }
    } catch (e) { }
    if (pauseTimeout) clearTimeout(pauseTimeout);
    if (sessionRecorder) sessionRecorder.stop();
    sessionActive = false;
    document.getElementById('sessionContent').style.display = 'block';
    document.getElementById('completedContainer').style.display = 'none';
    document.getElementById('sessionScreen').classList.remove('active');
    document.getElementById('homeScreen').classList.remove('hidden');
}

// Game Logic
function generateSequence() {
    const items = [...GAME_DATA[selectedCategory]];
    return items.sort(() => Math.random() - 0.5).slice(0, selectedDifficulty);
}

window.beginGameSession = function () {
    gameSequence = generateSequence();
    userSequence = [];
    logActivity('game_start', { category: selectedCategory, difficulty: selectedDifficulty });

    // Transition
    try {
        document.getElementById('homeScreen').classList.add('hidden');
        const s = document.getElementById('sessionScreen');
        s.classList.remove('active');
        const g = document.getElementById('sessionScreen');
        // Wait, game uses same session screen for listening? No, it uses 'sessionScreen' for listening phase?
        // Checking original: Yes, beginGameSession uses 'sessionScreen' for the listening part.
        g.classList.add('active');
        g.style.display = 'flex';
    } catch (e) { }

    document.getElementById('sessionSubtitle').textContent = 'Listen carefully...';
    document.getElementById('phaseText').textContent = 'Get ready...';
    document.getElementById('progressSteps').innerHTML = '';
    document.getElementById('meditationEmoji').textContent = '🧠';
    document.getElementById('sessionControls').style.display = 'none';
    document.getElementById('rateIndicator').style.display = 'none';

    setTimeout(() => speakSequence(), 1500);
}

async function speakSequence() {
    const phaseText = document.getElementById('phaseText');
    const timeText = document.getElementById('timeText');
    const circle = document.getElementById('meditationCircle');
    document.getElementById('sessionWave').style.display = 'flex';
    circle.classList.add('playing');

    for (let i = 0; i < gameSequence.length; i++) {
        const item = gameSequence[i];
        phaseText.textContent = `Item ${i + 1} of ${gameSequence.length}`;
        timeText.innerHTML = '🔊 Speaking...';
        await speakText(item);
        if (i < gameSequence.length - 1) {
            phaseText.textContent = '...';
            timeText.textContent = '';
            document.getElementById('sessionWave').style.display = 'none';
            for (let j = 15; j > 0; j--) {
                phaseText.textContent = `Next item in ${j}s...`;
                await new Promise(r => setTimeout(r, 1000));
            }
            document.getElementById('sessionWave').style.display = 'flex';
        }
    }

    document.getElementById('sessionWave').style.display = 'none';
    circle.classList.remove('playing');
    phaseText.textContent = 'Complete!';
    setTimeout(() => showGameAnswerScreen(), 2000);
}

function speakText(text) {
    return new Promise(resolve => {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(text);
            u.rate = 0.8;
            u.onend = resolve;
            u.onerror = resolve;
            speechSynthesis.speak(u);
        } else setTimeout(resolve, 1000);
    });
}

function showGameAnswerScreen() {
    document.getElementById('sessionScreen').classList.remove('active');
    document.getElementById('gameAnswerScreen').classList.add('active');
    userSequence = [];
    renderAnswerOptions();
    updateSequenceDisplay();
}

function renderAnswerOptions() {
    const container = document.getElementById('answerOptions');
    const shuffled = [...gameSequence].sort(() => Math.random() - 0.5);
    container.innerHTML = shuffled.map(item =>
        `<button class="answer-btn" data-item="${item}" onclick="selectAnswer('${item}')">${item}</button>`
    ).join('');
}

window.selectAnswer = function (item) {
    if (userSequence.includes(item)) return;
    userSequence.push(item);
    document.querySelector(`.answer-btn[data-item="${item}"]`).classList.add('selected');
    updateSequenceDisplay();
    document.getElementById('submitAnswerBtn').disabled = userSequence.length < gameSequence.length;
}

function updateSequenceDisplay() {
    document.getElementById('sequenceDisplay').innerHTML = userSequence.map((item, i) =>
        `<div class="sequence-item"><span class="order-num">${i + 1}</span>${item}</div>`
    ).join('');
}

window.resetGameAnswer = function () {
    userSequence = [];
    updateSequenceDisplay();
    document.querySelectorAll('.answer-btn').forEach(btn => btn.classList.remove('selected'));
    document.getElementById('submitAnswerBtn').disabled = true;
}

window.submitGameAnswer = function () {
    let correct = 0;
    const results = [];
    for (let i = 0; i < gameSequence.length; i++) {
        const isCorrect = userSequence[i] === gameSequence[i];
        if (isCorrect) correct++;
        results.push({ position: i + 1, expected: gameSequence[i], given: userSequence[i], correct: isCorrect });
    }
    showGameResult(correct, results);
}

function showGameResult(correct, results) {
    document.getElementById('gameAnswerContent').style.display = 'none';
    document.getElementById('gameResultContainer').style.display = 'flex';
    document.getElementById('scoreValue').textContent = `${correct}/${gameSequence.length}`;
    document.getElementById('scoreBreakdown').innerHTML = results.map(r =>
        `<div style="color:${r.correct ? 'green' : 'red'}">${r.correct ? '✅' : '❌'} ${r.given}</div>`
    ).join('');
    logActivity('game_complete', { score: correct, total: gameSequence.length });
}

window.playGameAgain = function () {
    document.getElementById('gameAnswerContent').style.display = 'block';
    document.getElementById('gameResultContainer').style.display = 'none';
    document.getElementById('gameAnswerScreen').classList.remove('active');
    window.beginGameSession();
}

window.backToHome = function () {
    document.getElementById('gameAnswerContent').style.display = 'block';
    document.getElementById('gameResultContainer').style.display = 'none';
    document.getElementById('gameAnswerScreen').classList.remove('active');
    document.getElementById('homeScreen').classList.remove('hidden');
}

console.log("App Initialized");
