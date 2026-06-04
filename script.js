// --- Core Engine Framework Scope ---
let scene, camera, renderer;
let playerGroup, playerCube, weaponTurret, playerMat;
let gridHelper;

let gameStarted = false;
let isGameOver = false;
let currentLevel = 1;
let score = 0;
let targetKills = 10;
let playerLives = 3;
let activePetColor = 0x00ff88;

let enemiesArray = [];
let projectilesArray = [];
let particlesArray = [];
let decorationCubes = [];

let lastFireTime = 0;
const fireCooldown = 140; 
let isFiringPressed = false;

const cameraOffset = new THREE.Vector3(0, 11.0, 8.5);
let moveVector = { x: 0, z: 0 };
const keysPressed = {
    w: false, a: false, s: false, d: false,
    W: false, A: false, S: false, D: false,
    ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false
};

let joystickActive = false;
let joystickStartPos = { x: 0, y: 0 };
const joystickMaxRange = 40; 

// ADVANCED WEB AUDIO NODES (Guarantees browser playback compatibility)
let audioCtx = null;
let musicGainNode = null;
let musicEnabled = true;
let sfxEnabled = true;
let audioSequenceTimer = null;

const STAGE_CONFIGS = [
    { gridColor: 0x00ff88, fogColor: 0x020206, enemyShape: 'box', speedBonus: 0.0 },
    { gridColor: 0x00ffff, fogColor: 0x01050a, enemyShape: 'pyramid', speedBonus: 0.012 },
    { gridColor: 0xff00ff, fogColor: 0x06010a, enemyShape: 'sphere', speedBonus: 0.022 },
    { gridColor: 0xffff00, fogColor: 0x080601, enemyShape: 'box', speedBonus: 0.032 },
    { gridColor: 0xff3300, fogColor: 0x0c0101, enemyShape: 'pyramid', speedBonus: 0.045 }
];

initEngine();
setupSkinSelectors();
loadHighScore();
buildMenuDecorations();
setupSystemInteractions();
animateLoop();

function initEngine() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(STAGE_CONFIGS[0].fogColor);
    scene.fog = new THREE.FogExp2(STAGE_CONFIGS[0].fogColor, 0.042);

    camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    document.body.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.85);
    directionalLight.position.set(10, 20, 10);
    scene.add(directionalLight);

    playerGroup = new THREE.Group();
    const bodyGeo = new THREE.BoxGeometry(1, 1, 1);
    playerMat = new THREE.MeshStandardMaterial({ color: activePetColor, roughness: 0.1, metalness: 0.1 });
    playerCube = new THREE.Mesh(bodyGeo, playerMat);
    playerCube.position.y = 0.5;
    playerGroup.add(playerCube);

    const turretGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.6, 8);
    const turretMat = new THREE.MeshStandardMaterial({ color: 0x1d2430, metalness: 0.8, roughness: 0.2 });
    weaponTurret = new THREE.Mesh(turretGeo, turretMat);
    weaponTurret.rotation.x = Math.PI / 2;
    weaponTurret.position.set(0, 0.55, -0.45);
    playerGroup.add(weaponTurret);

    scene.add(playerGroup);

    buildLevelGrid(STAGE_CONFIGS[0].gridColor);
    setupInputs();
    window.addEventListener('resize', onWindowResize);
}

function buildMenuDecorations() {
    const geo = new THREE.BoxGeometry(1.5, 1.5, 1.5);
    for(let i=0; i<15; i++) {
        const mat = new THREE.MeshStandardMaterial({ color: Math.random() > 0.5 ? 0x00ff88 : 0xff0055, wireframe: true });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set((Math.random()-0.5)*35, Math.random()*8, (Math.random()-0.5)*35);
        scene.add(mesh);
        decorationCubes.push(mesh);
    }
}

function setupSystemInteractions() {
    document.getElementById('play-btn').addEventListener('click', () => {
        initializeSystemBoot();
    });

    const gearBtn = document.getElementById('settings-gear-btn');
    const settingsModal = document.getElementById('settings-modal-overlay');
    const closeSettings = document.getElementById('close-settings-btn');

    gearBtn.addEventListener('click', () => { settingsModal.style.display = 'flex'; });
    closeSettings.addEventListener('click', () => { settingsModal.style.display = 'none'; });

    const bgmToggle = document.getElementById('toggle-bgm-btn');
    const sfxToggle = document.getElementById('toggle-sfx-btn');

    bgmToggle.addEventListener('click', () => {
        musicEnabled = !musicEnabled;
        if(musicEnabled) {
            bgmToggle.classList.add('active'); bgmToggle.innerText = "ON";
            if(musicGainNode) musicGainNode.gain.setValueAtTime(0.12, audioCtx.currentTime);
        } else {
            bgmToggle.classList.remove('active'); bgmToggle.innerText = "OFF";
            if(musicGainNode) musicGainNode.gain.setValueAtTime(0, audioCtx.currentTime);
        }
    });

    sfxToggle.addEventListener('click', () => {
        sfxEnabled = !sfxEnabled;
        if(sfxEnabled) { sfxToggle.classList.add('active'); sfxToggle.innerText = "ON"; }
        else { sfxToggle.classList.remove('active'); sfxToggle.innerText = "OFF"; }
    });
}

function initializeSystemBoot() {
    if (navigator.userAgent.match(/Android|iPhone|iPad|iPod/i)) {
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().then(() => {
                if (screen.orientation && screen.orientation.lock) { screen.orientation.lock('landscape').catch(() => {}); }
            }).catch(() => {});
        }
    }

    // ACTIVATE SOUND TRACK ARCHITECTURE ON USER TOUCH INTERACTION GESTURE
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        musicGainNode = audioCtx.createGain();
        musicGainNode.gain.setValueAtTime(musicEnabled ? 0.12 : 0, audioCtx.currentTime);
        musicGainNode.connect(audioCtx.destination);
        runArcadeAudioEngine(); // Start the melodic tracker sequence
    }

    document.getElementById('play-btn').style.display = 'none';
    const loaderContainer = document.getElementById('boot-loader-container');
    const loaderBar = document.getElementById('boot-loader-bar');
    loaderContainer.style.display = 'flex';

    let pct = 0;
    const interval = setInterval(() => {
        pct += 5;
        loaderBar.style.width = pct + '%';
        if (pct >= 100) {
            clearInterval(interval);
            setTimeout(() => {
                loaderContainer.style.display = 'none';
                document.getElementById('play-btn').style.display = 'inline-block';
                startGameApp();
            }, 100);
        }
    }, 25);
}

// --- FULL CHIPTUNE TRACK STEPPER RUNTIME SYSTEM ---
function runArcadeAudioEngine() {
    let step = 0;
    // Upbeat classic cyber melody array note tracking maps
    const bassline = [110, 110, 130, 130, 146, 146, 164, 164]; 
    const melody = [220, 261, 293, 329, 392, 329, 293, 261];

    audioSequenceTimer = setInterval(() => {
        if (!musicEnabled || !audioCtx) return;
        const now = audioCtx.currentTime;

        // 1. Play continuous bass kick rhythm
        const bassOsc = audioCtx.createOscillator();
        const bassGain = audioCtx.createGain();
        bassOsc.type = 'triangle';
        bassOsc.frequency.setValueAtTime(bassline[step % bassline.length], now);
        bassGain.gain.setValueAtTime(0.2, now);
        bassGain.gain.linearRampToValueAtTime(0, now + 0.18);
        bassOsc.connect(bassGain);
        bassGain.connect(musicGainNode);
        bassOsc.start(now); bassOsc.stop(now + 0.2);

        // 2. Play rapid syncopated arcade lead melody bars
        if (step % 2 === 0) {
            const leadOsc = audioCtx.createOscillator();
            const leadGain = audioCtx.createGain();
            leadOsc.type = 'square';
            leadOsc.frequency.setValueAtTime(melody[(step + 2) % melody.length], now);
            leadGain.gain.setValueAtTime(0.06, now);
            leadGain.gain.linearRampToValueAtTime(0, now + 0.25);
            leadOsc.connect(leadGain);
            leadGain.connect(musicGainNode);
            leadOsc.start(now); leadOsc.stop(now + 0.28);
        }

        step++;
    }, 220); // Steady energetic 136BPM tempo rhythm pace
}

function playSoundFX(type) {
    if (!audioCtx || !sfxEnabled) return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.connect(gainNode); gainNode.connect(audioCtx.destination);

    if (type === 'laser') {
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.08);
        gainNode.gain.setValueAtTime(0.06, now); gainNode.gain.linearRampToValueAtTime(0, now + 0.08);
        osc.start(now); osc.stop(now + 0.08);
    } else if (type === 'explosion') {
        osc.type = 'triangle'; osc.frequency.setValueAtTime(160, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.15);
        gainNode.gain.setValueAtTime(0.12, now); gainNode.gain.linearRampToValueAtTime(0, now + 0.15);
        osc.start(now); osc.stop(now + 0.15);
    } else if (type === 'damage') {
        osc.type = 'square'; osc.frequency.setValueAtTime(100, now);
        gainNode.gain.setValueAtTime(0.18, now); gainNode.gain.linearRampToValueAtTime(0, now + 0.12);
        osc.start(now); osc.stop(now + 0.12);
    }
}

function startGameApp() {
    document.getElementById('start-menu').style.opacity = '0';
    document.getElementById('start-menu').style.visibility = 'hidden';
    
    enemiesArray.forEach(e => scene.remove(e));
    projectilesArray.forEach(p => scene.remove(p.mesh));
    enemiesArray = []; projectilesArray = [];
    decorationCubes.forEach(c => scene.remove(c));
    decorationCubes = [];

    gameStarted = true; isGameOver = false;
    score = 0; currentLevel = 1; targetKills = 10; playerLives = 3;
    
    playerGroup.position.set(0, 0, 0);
    applyStageEnvironment(0);
    updateInterfaceLayout();
    spawnEnemyWave();
}

function applyStageEnvironment(cfgIdx) {
    const cfg = STAGE_CONFIGS[cfgIdx % STAGE_CONFIGS.length];
    buildLevelGrid(cfg.gridColor);
    scene.background.setHex(cfg.fogColor);
    scene.fog.color.setHex(cfg.fogColor);
}

function buildLevelGrid(hexColor) {
    if (gridHelper) scene.remove(gridHelper);
    gridHelper = new THREE.GridHelper(90, 90, hexColor, 0x121724);
    scene.add(gridHelper);
}

function setupInputs() {
    window.addEventListener('keydown', (e) => {
        if (e.key in keysPressed) keysPressed[e.key] = true;
        if (e.key === ' ' || e.key === 'Spacebar') isFiringPressed = true;
    });
    window.addEventListener('keyup', (e) => {
        if (e.key in keysPressed) keysPressed[e.key] = false;
        if (e.key === ' ' || e.key === 'Spacebar') isFiringPressed = false;
    });

    const joyZone = document.getElementById('joystick-zone');
    const joyStick = document.getElementById('joystick-stick');
    const fireButton = document.getElementById('fire-btn');

    joyZone.addEventListener('touchstart', (e) => {
        joystickActive = true;
        const rect = joyZone.getBoundingClientRect();
        joystickStartPos = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
        if (!joystickActive) return;
        let t = null;
        for (let i = 0; i < e.touches.length; i++) {
            if (e.touches[i].clientX < window.innerWidth / 2) { t = e.touches[i]; break; }
        }
        if (!t) return;

        const dx = t.clientX - joystickStartPos.x;
        const dz = t.clientY - joystickStartPos.y;
        const dist = Math.sqrt(dx * dx + dz * dz);
        let limit = Math.min(dist, joystickMaxRange);
        let angle = Math.atan2(dz, dx);
        
        const fx = Math.cos(angle) * limit;
        const fz = Math.sin(angle) * limit;
        joyStick.style.transform = `translate(${fx}px, ${fz}px)`;

        moveVector.x = fx / joystickMaxRange;
        moveVector.z = fz / joystickMaxRange;
    }, { passive: true });

    window.addEventListener('touchend', (e) => {
        let leftActive = false;
        for (let i = 0; i < e.touches.length; i++) {
            if (e.touches[i].clientX < window.innerWidth / 2) leftActive = true;
        }
        if (!leftActive && joystickActive) {
            joystickActive = false;
            moveVector = { x: 0, z: 0 };
            joyStick.style.transform = `translate(0px, 0px)`;
        }
    }, { passive: true });

    fireButton.addEventListener('touchstart', (e) => { e.preventDefault(); isFiringPressed = true; });
    window.addEventListener('touchend', (e) => { if (isFiringPressed && e.touches.length === 0) isFiringPressed = false; });
}

function processKeyboardVectors() {
    if (joystickActive) return;
    let dx = 0, dz = 0;
    if (keysPressed.a || keysPressed.A || keysPressed.ArrowLeft) dx -= 1;
    if (keysPressed.d || keysPressed.D || keysPressed.ArrowRight) dx += 1;
    if (keysPressed.w || keysPressed.W || keysPressed.ArrowUp) dz -= 1;
    if (keysPressed.s || keysPressed.S || keysPressed.ArrowDown) dz += 1;
    if (dx !== 0 && dz !== 0) { dx *= 0.7071; dz *= 0.7071; }
    moveVector.x = dx; moveVector.z = dz;
}

function processWeaponAimTracking() {
    if (enemiesArray.length === 0) {
        if (moveVector.x !== 0 || moveVector.z !== 0) weaponTurret.rotation.z = Math.atan2(moveVector.x, moveVector.z) + Math.PI;
        return;
    }
    let target = null, minDist = Infinity;
    for (let i = 0; i < enemiesArray.length; i++) {
        const d = playerGroup.position.distanceTo(enemiesArray[i].position);
        if (d < minDist) { minDist = d; target = enemiesArray[i]; }
    }
    if (target) {
        const rel = target.position.clone();
        playerGroup.worldToLocal(rel);
        weaponTurret.rotation.z = Math.atan2(rel.x, rel.z) + Math.PI;
    }
}

function fireProjectile() {
    if (isGameOver || !gameStarted) return;
    const now = Date.now();
    if (now - lastFireTime < fireCooldown) return;
    lastFireTime = now;

    playSoundFX('laser');
    const geo = new THREE.CylinderGeometry(0.05, 0.05, 0.5, 6);
    const mat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.copy(playerGroup.position).y = 0.55;

    const dir = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), weaponTurret.rotation.z).normalize().multiplyScalar(0.75);
    mesh.lookAt(playerGroup.position.clone().add(dir).add(new THREE.Vector3(0,0.55,0)));

    scene.add(mesh);
    projectilesArray.push({ mesh: mesh, velocity: dir, life: 75 });
}

function spawnEnemy() {
    if (isGameOver || !gameStarted) return;
    const cfg = STAGE_CONFIGS[(currentLevel - 1) % STAGE_CONFIGS.length];
    
    let geo;
    if (cfg.enemyShape === 'pyramid') geo = new THREE.ConeGeometry(0.5, 1.0, 4);
    else if (cfg.enemyShape === 'sphere') geo = new THREE.SphereGeometry(0.48, 8, 8);
    else geo = new THREE.BoxGeometry(0.85, 0.85, 0.85);

    const mat = new THREE.MeshStandardMaterial({ color: cfg.gridColor, metalness: 0.2, roughness: 0.3 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = 0.45;

    const rad = Math.random() * Math.PI * 2;
    mesh.position.x = playerGroup.position.x + Math.cos(rad) * 25;
    mesh.position.z = playerGroup.position.z + Math.sin(rad) * 25;

    scene.add(mesh);
    enemiesArray.push(mesh);
}

function spawnEnemyWave() {
    const count = 5 + (currentLevel * 2);
    for (let i = 0; i < count; i++) spawnEnemy();
}

function updateGamePhysics() {
    processKeyboardVectors();

    if (moveVector.x !== 0 || moveVector.z !== 0) {
        playerGroup.position.x += moveVector.x * 0.16;
        playerGroup.position.z += moveVector.z * 0.16;
        playerGroup.rotation.y = Math.atan2(-moveVector.x, -moveVector.z);
        playerCube.position.y = 0.5 + Math.sin(Date.now() * 0.015) * 0.08;
    } else {
        playerCube.position.y = 0.5;
    }

    if (isFiringPressed) fireProjectile();

    for (let i = projectilesArray.length - 1; i >= 0; i--) {
        const p = projectilesArray[i]; p.mesh.position.add(p.velocity); p.life--;
        if (p.life <= 0) { scene.remove(p.mesh); projectilesArray.splice(i, 1); }
    }

    const currentCfg = STAGE_CONFIGS[(currentLevel - 1) % STAGE_CONFIGS.length];
    const baseSpeed = 0.045 + currentCfg.speedBonus;

    for (let i = enemiesArray.length - 1; i >= 0; i--) {
        const enemy = enemiesArray[i];
        const heading = new THREE.Vector3().subVectors(playerGroup.position, enemy.position);
        heading.y = 0; heading.normalize();
        enemy.position.addScaledVector(heading, baseSpeed);
        enemy.rotation.y += 0.02;

        if (enemy.position.distanceTo(playerGroup.position) < 0.95) {
            scene.remove(enemy); enemiesArray.splice(i, 1);
            playerLives--; playSoundFX('damage');
            updateInterfaceLayout();
            if (playerLives <= 0) runGameOverState();
            continue;
        }

        for (let j = projectilesArray.length - 1; j >= 0; j--) {
            const b = projectilesArray[j];
            if (b.mesh.position.distanceTo(enemy.position) < 0.75) {
                createExplosionFX(enemy.position, enemy.material.color.getHex());
                playSoundFX('explosion');
                scene.remove(enemy); enemiesArray.splice(i, 1);
                scene.remove(b.mesh); projectilesArray.splice(j, 1);
                score++; updateInterfaceLayout();
                if (score >= targetKills) advanceGameLevel();
                break;
            }
        }
    }
    if (enemiesArray.length < (3 + currentLevel) && !isGameOver) spawnEnemy();
}

function advanceGameLevel() {
    currentLevel++; score = 0; targetKills = 10 + (currentLevel * 4);
    applyStageEnvironment(currentLevel - 1);
    updateInterfaceLayout(); 
    spawnEnemyWave();
}

function runGameOverState() {
    isGameOver = true; gameStarted = false; isFiringPressed = false;
    saveHighScore();

    enemiesArray.forEach(e => scene.remove(e));
    projectilesArray.forEach(p => scene.remove(p.mesh));
    enemiesArray = []; projectilesArray = [];

    const titleNode = document.getElementById('menu-title');
    titleNode.innerText = "MISSION FAILED";
    titleNode.classList.add('game-over-active');
    
    document.getElementById('menu-subtitle').innerText = "CORE INTEGRITY FAILURE DETECTED";
    document.getElementById('skin-section').style.display = 'none'; 
    
    const savedHi = localStorage.getItem('cyber_arcade_hi_lvl') || 1;
    document.getElementById('menu-high-score').innerHTML = `OUTCOME: LEVEL ${currentLevel}<br><span style="color:#ffff00">RECORD: LEVEL ${savedHi}</span>`;
    
    document.getElementById('play-btn').innerText = "TRY AGAIN";
    document.getElementById('start-menu').style.visibility = 'visible';
    document.getElementById('start-menu').style.opacity = '1';
}

function loadHighScore() {
    const saved = localStorage.getItem('cyber_arcade_hi_lvl') || 1;
    document.getElementById('high-score-val').innerText = saved;
}

function saveHighScore() {
    const saved = parseInt(localStorage.getItem('cyber_arcade_hi_lvl') || 1);
    if (currentLevel > saved) localStorage.setItem('cyber_arcade_hi_lvl', currentLevel);
}

function setupSkinSelectors() {
    const palOptions = document.querySelectorAll('.colorOption');
    palOptions.forEach(box => {
        box.addEventListener('click', (e) => {
            palOptions.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            const selectedHex = parseInt(e.target.getAttribute('data-color'));
            activePetColor = selectedHex;
            if (playerMat) playerMat.color.setHex(selectedHex);
        });
    });
}

function createExplosionFX(position, colorHex) {
    const pCount = 12;
    const geo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
    const mat = new THREE.MeshBasicMaterial({ color: colorHex });
    for (let i = 0; i < pCount; i++) {
        const mesh = new THREE.Mesh(geo, mat); mesh.position.copy(position);
        const vel = new THREE.Vector3((Math.random()-0.5)*0.25, Math.random()*0.2, (Math.random()-0.5)*0.25);
        scene.add(mesh); particlesArray.push({ mesh: mesh, velocity: vel, life: 35 });
    }
}

function updateParticles() {
    for (let i = particlesArray.length - 1; i >= 0; i--) {
        const p = particlesArray[i]; p.mesh.position.add(p.velocity); p.velocity.y -= 0.005; p.life--; p.mesh.scale.multiplyScalar(0.95);
        if (p.life <= 0) { scene.remove(p.mesh); particlesArray.splice(i, 1); }
    }
}

function updateInterfaceLayout() {
    document.getElementById('level-num').innerText = currentLevel;
    document.getElementById('score-num').innerText = score;
    document.getElementById('target-num').innerText = targetKills;
    let livesStr = "";
    for (let i = 0; i < playerLives; i++) livesStr += "❤️";
    document.getElementById('lives-display').innerText = livesStr || "💥 DETONATED";
    document.getElementById('progress-bar').style.width = `${Math.min((score / targetKills) * 100, 100)}%`;
}

function animateLoop() {
    requestAnimationFrame(animateLoop);
    if (gameStarted && !isGameOver) { updateGamePhysics(); processWeaponAimTracking(); }
    updateParticles();
    
    if (!gameStarted) {
        decorationCubes.forEach(c => { c.rotation.x += 0.005; c.rotation.y += 0.01; });
    }

    if (playerGroup) {
        camera.position.copy(playerGroup.position).add(cameraOffset);
        camera.lookAt(playerGroup.position.clone().add(new THREE.Vector3(0, -0.8, 0)));
    }
    renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}