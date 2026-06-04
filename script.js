// --- Core Framework Engine Matrices ---
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

// Automatic Weapon Config Settings
let lastFireTime = 0;
const fireCooldown = 150; // Sweeter, faster firing response rate
let isFiringPressed = false;

// Widescreen High-Angle Landscape Camera Coordinate Offsets
const cameraOffset = new THREE.Vector3(0, 10.5, 8.0);
let moveVector = { x: 0, z: 0 };
const keysPressed = {
    w: false, a: false, s: false, d: false,
    W: false, A: false, S: false, D: false,
    ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false
};

// Hardcoded Native Mobile Touch Tracking Matrices
let joystickActive = false;
let joystickStartPos = { x: 0, y: 0 };
const joystickMaxRange = 40; // Extended touch bound range for landscape layouts

let audioCtx = null;

// Initialize Core Framework
initEngine();
setupSkinSelectors();
loadHighScore();
animateLoop();

function initEngine() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020206);
    scene.fog = new THREE.FogExp2(0x020206, 0.04);

    camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    document.body.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0x00ffff, 0.9);
    directionalLight.position.set(12, 25, 12);
    scene.add(directionalLight);

    // Build Composed Character Core Mesh
    playerGroup = new THREE.Group();
    
    const bodyGeo = new THREE.BoxGeometry(1, 1, 1);
    playerMat = new THREE.MeshStandardMaterial({ color: activePetColor, roughness: 0.1, metalness: 0.1 });
    playerCube = new THREE.Mesh(bodyGeo, playerMat);
    playerCube.position.y = 0.5;
    playerGroup.add(playerCube);

    const turretGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.6, 8);
    const turretMat = new THREE.MeshStandardMaterial({ color: 0x222a36, metalness: 0.8, roughness: 0.2 });
    weaponTurret = new THREE.Mesh(turretGeo, turretMat);
    weaponTurret.rotation.x = Math.PI / 2;
    weaponTurret.position.set(0, 0.55, -0.45);
    playerGroup.add(weaponTurret);

    scene.add(playerGroup);

    buildLevelGrid(0x00ff88);
    setupInputs();
    window.addEventListener('resize', onWindowResize);
}

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        startSynthLoop();
    }
}

function playSoundFX(type) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    const now = audioCtx.currentTime;

    if (type === 'laser') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.1);
        gainNode.gain.setValueAtTime(0.12, now);
        gainNode.gain.linearRampToValueAtTime(0, now + 0.1);
        osc.start(now); osc.stop(now + 0.1);
    } else if (type === 'explosion') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.2);
        gainNode.gain.setValueAtTime(0.25, now);
        gainNode.gain.linearRampToValueAtTime(0, now + 0.2);
        osc.start(now); osc.stop(now + 0.2);
    } else if (type === 'damage') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(100, now);
        gainNode.gain.setValueAtTime(0.2, now);
        gainNode.gain.linearRampToValueAtTime(0, now + 0.15);
        osc.start(now); osc.stop(now + 0.15);
    }
}

function startSynthLoop() {
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(55, audioCtx.currentTime);
    gainNode.gain.setValueAtTime(0.04, audioCtx.currentTime);
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    osc.start();
}

function createExplosionFX(position, colorHex) {
    const particleCount = 12;
    const geo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
    const mat = new THREE.MeshBasicMaterial({ color: colorHex });

    for (let i = 0; i < particleCount; i++) {
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(position);
        const velocity = new THREE.Vector3((Math.random() - 0.5) * 0.22, Math.random() * 0.18, (Math.random() - 0.5) * 0.22);
        scene.add(mesh);
        particlesArray.push({ mesh: mesh, velocity: velocity, life: 30 + Math.random() * 15 });
    }
}

function updateParticles() {
    for (let i = particlesArray.length - 1; i >= 0; i--) {
        const p = particlesArray[i];
        p.mesh.position.add(p.velocity);
        p.velocity.y -= 0.004;
        p.life--;
        p.mesh.scale.multiplyScalar(0.94);
        if (p.life <= 0) {
            scene.remove(p.mesh);
            particlesArray.splice(i, 1);
        }
    }
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

function startGameApp() {
    initAudio();
    document.getElementById('start-menu').style.opacity = '0';
    document.getElementById('start-menu').style.visibility = 'hidden';
    
    enemiesArray.forEach(e => scene.remove(e));
    projectilesArray.forEach(p => scene.remove(p.mesh));
    enemiesArray = []; projectilesArray = [];

    gameStarted = true;
    isGameOver = false;
    score = 0; currentLevel = 1; targetKills = 10; playerLives = 3;
    
    playerGroup.position.set(0, 0, 0);
    buildLevelGrid(0x00ff88);
    updateInterfaceLayout();
    spawnEnemyWave();
}

function buildLevelGrid(hexColor) {
    if (gridHelper) scene.remove(gridHelper);
    gridHelper = new THREE.GridHelper(80, 80, hexColor, 0x111622);
    scene.add(gridHelper);
}

// --- SECURE DUAL-THUMB TOUCH EVENT HANDLING PIPELINES ---
function setupInputs() {
    // 1. Keyboard Tracking Matrix Maps
    window.addEventListener('keydown', (e) => {
        if (e.key in keysPressed) keysPressed[e.key] = true;
        if (e.key === ' ' || e.key === 'Spacebar') isFiringPressed = true;
    });
    window.addEventListener('keyup', (e) => {
        if (e.key in keysPressed) keysPressed[e.key] = false;
        if (e.key === ' ' || e.key === 'Spacebar') isFiringPressed = false;
    });

    // 2. Mobile Joystick Capture
    const joyZone = document.getElementById('joystick-zone');
    const joyStick = document.getElementById('joystick-stick');
    const fireButton = document.getElementById('fire-btn');

    joyZone.addEventListener('touchstart', (e) => {
        joystickActive = true;
        const touch = e.touches[0];
        // Lock center position coordinates instantly on start
        const rect = joyZone.getBoundingClientRect();
        joystickStartPos = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
        if (!joystickActive) return;
        
        let activeTouch = null;
        for (let i = 0; i < e.touches.length; i++) {
            if (e.touches[i].clientX < window.innerWidth / 2) {
                activeTouch = e.touches[i];
                break;
            }
        }
        if (!activeTouch) return;

        const dx = activeTouch.clientX - joystickStartPos.x;
        const dz = activeTouch.clientY - joystickStartPos.y;
        const dist = Math.sqrt(dx * dx + dz * dz);
        
        let limitRadius = Math.min(dist, joystickMaxRange);
        let theta = Math.atan2(dz, dx);
        
        const finalX = Math.cos(theta) * limitRadius;
        const finalZ = Math.sin(theta) * limitRadius;
        
        joyStick.style.transform = `translate(${finalX}px, ${finalZ}px)`;

        // Update exact direction physics engines
        moveVector.x = finalX / joystickMaxRange;
        moveVector.z = finalZ / joystickMaxRange;
    }, { passive: true });

    window.addEventListener('touchend', (e) => {
        let leftThumbStillActive = false;
        for (let i = 0; i < e.touches.length; i++) {
            if (e.touches[i].clientX < window.innerWidth / 2) leftThumbStillActive = true;
        }
        if (!leftThumbStillActive && joystickActive) {
            joystickActive = false;
            moveVector = { x: 0, z: 0 };
            joyStick.style.transform = `translate(0px, 0px)`;
        }
    }, { passive: true });

    // 3. Isolated Right Hand Fire Button Loops
    fireButton.addEventListener('touchstart', (e) => {
        e.preventDefault();
        isFiringPressed = true;
    });
    window.addEventListener('touchend', (e) => {
        if (isFiringPressed && e.touches.length === 0) isFiringPressed = false;
    });
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
        if (moveVector.x !== 0 || moveVector.z !== 0) {
            weaponTurret.rotation.z = Math.atan2(moveVector.x, moveVector.z) + Math.PI; 
        }
        return;
    }
    let targetDrone = null, minDistance = Infinity;
    for (let i = 0; i < enemiesArray.length; i++) {
        const d = playerGroup.position.distanceTo(enemiesArray[i].position);
        if (d < minDistance) { minDistance = d; targetDrone = enemiesArray[i]; }
    }
    if (targetDrone) {
        const rel = targetDrone.position.clone();
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
    const laserMesh = new THREE.Mesh(geo, mat);
    laserMesh.rotation.x = Math.PI / 2;
    laserMesh.position.copy(playerGroup.position).y = 0.55;

    const dir = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), weaponTurret.rotation.z).normalize().multiplyScalar(0.72);
    laserMesh.lookAt(playerGroup.position.clone().add(dir).add(new THREE.Vector3(0,0.55,0)));

    scene.add(laserMesh);
    projectilesArray.push({ mesh: laserMesh, velocity: dir, life: 80 });
}

function spawnEnemy() {
    if (isGameOver || !gameStarted) return;
    const geo = new THREE.BoxGeometry(0.85, 0.85, 0.85);
    let col = 0xff0055;
    if (currentLevel === 2) col = 0xff00ff;
    if (currentLevel >= 3) col = currentLevel % 2 === 0 ? 0xffff00 : 0xffaa00;

    const mat = new THREE.MeshStandardMaterial({ color: col, metalness: 0.2, roughness: 0.3 });
    const enemyMesh = new THREE.Mesh(geo, mat);
    enemyMesh.position.y = 0.42;

    const angle = Math.random() * Math.PI * 2;
    enemyMesh.position.x = playerGroup.position.x + Math.cos(angle) * 24;
    enemyMesh.position.z = playerGroup.position.z + Math.sin(angle) * 24;

    scene.add(enemyMesh);
    enemiesArray.push(enemyMesh);
}

function spawnEnemyWave() {
    const count = 5 + currentLevel;
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

    const speed = 0.045 + (currentLevel * 0.005);
    for (let i = enemiesArray.length - 1; i >= 0; i--) {
        const enemy = enemiesArray[i];
        const run = new THREE.Vector3().subVectors(playerGroup.position, enemy.position);
        run.y = 0; run.normalize();
        enemy.position.addScaledVector(run, speed);

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
    if (enemiesArray.length < 4 && !isGameOver) spawnEnemy();
}

function advanceGameLevel() {
    currentLevel++; score = 0; targetKills = 10 + (currentLevel * 3);
    const colors = [0x00ff88, 0x00ffff, 0xff00ff, 0xffff00, 0xff5500];
    buildLevelGrid(colors[currentLevel % colors.length]);
    updateInterfaceLayout(); spawnEnemyWave();
}

function runGameOverState() {
    isGameOver = true; gameStarted = false; isFiringPressed = false;
    saveHighScore();

    enemiesArray.forEach(e => scene.remove(e));
    projectilesArray.forEach(p => scene.remove(p.mesh));
    enemiesArray = []; projectilesArray = [];

    const titleNode = document.getElementById('menu-title');
    titleNode.innerText = "SYSTEM CRASH";
    titleNode.classList.add('game-over-active');
    
    document.getElementById('menu-subtitle').innerText = "CONNECTION TERMINATED // MAIN INITIALIZATION ABORTED";
    document.getElementById('skin-section').style.display = 'none'; 
    
    const savedHi = localStorage.getItem('cyber_arcade_hi_lvl') || 1;
    document.getElementById('menu-high-score').innerHTML = `CRITICAL FAILURE<br>FINAL LEVEL REACHED: ${currentLevel}<br><span style="color:#ffff00">ALL-TIME BEST LEVEL: ${savedHi}</span>`;
    
    document.getElementById('play-btn').innerText = "REBOOT MAINFRAME";
    document.getElementById('start-menu').style.visibility = 'visible';
    document.getElementById('start-menu').style.opacity = '1';
}

function updateInterfaceLayout() {
    document.getElementById('level-num').innerText = currentLevel;
    document.getElementById('score-num').innerText = score;
    document.getElementById('target-num').innerText = targetKills;
    let livesStr = "";
    for (let i = 0; i < playerLives; i++) livesStr += "❤️";
    document.getElementById('lives-display').innerText = livesStr || "💥 CRITICAL";
    document.getElementById('progress-bar').style.width = `${Math.min((score / targetKills) * 100, 100)}%`;
}

function animateLoop() {
    requestAnimationFrame(animateLoop);
    if (gameStarted && !isGameOver) { updateGamePhysics(); processWeaponAimTracking(); }
    updateParticles();
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