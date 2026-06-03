// ============================================================================
// 1. GAME DATA STATE MANAGEMENT
// ============================================================================
let currentLevel = 1;
const maxLevels = 30;
let score = 0;
let playerHealth = 100;
let playerLives = 3; 
let isGameOver = false;
let gameStarted = false; 
let selectedPetColor = 0x00ff88; 

// Entities Pools
let enemiesArray = [];
let projectilesArray = [];
let blocksObstaclesArray = []; // Stores physical 3D map blocks
let enemySpawnTimer = null;

function getLevelSettings(level) {
    let speed, spawnRate, targetKills, bg, grid, blockCount;
    if (level === 1) {
        targetKills = 10; spawnRate = 600; speed = 0.08;
        bg = 0x030206; grid = 0xff0055; blockCount = 8; // 8 blocks on level 1
    } else if (level === 2) {
        targetKills = 15; spawnRate = 1800; speed = 0.03;
        bg = 0x050b14; grid = 0x00ff88; blockCount = 15; // More blocks on level 2
    } else {
        targetKills = 15 + (level * 2);
        spawnRate = Math.max(1600 - (level * 45), 300);
        speed = 0.03 + (level * 0.003);
        bg = level % 2 === 0 ? 0x0b0514 : 0x050a0a; 
        grid = level % 3 === 0 ? 0x9900ff : 0x00ffff;
        blockCount = 15 + level; 
    }
    return { targetScore: targetKills, spawnInterval: spawnRate, enemySpeed: speed, backgroundColor: bg, gridColor: grid, maxBlocks: blockCount };
}

let activeSettings = getLevelSettings(currentLevel);

// ============================================================================
// 2. THREE.JS FOUNDATION
// ============================================================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05050a);
scene.fog = new THREE.FogExp2(0x05050a, 0.03);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
const canvas = document.getElementById('gameCanvas');
const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(20, 40, 20);
scene.add(dirLight);

let gridHelper = new THREE.GridHelper(500, 100, 0x00ff88, 0x111122);
scene.add(gridHelper);

// ============================================================================
// 3. PLAYER ENTITY GENERATION
// ============================================================================
const playerGroup = new THREE.Group();
const bodyGeo = new THREE.BoxGeometry(1, 1.2, 1);
const bodyMat = new THREE.MeshStandardMaterial({ color: selectedPetColor, roughness: 0.1 });
const playerMesh = new THREE.Mesh(bodyGeo, bodyMat);
playerMesh.position.y = 0.6;
playerGroup.add(playerMesh);

const visorGeo = new THREE.BoxGeometry(0.8, 0.2, 0.2);
const visorMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const visor = new THREE.Mesh(visorGeo, visorMat);
visor.position.set(0, 0.8, -0.51);
playerGroup.add(visor);

scene.add(playerGroup);
const cameraOffset = new THREE.Vector3(0, 7, 9);

// ============================================================================
// 4. MAP BLOCK GENERATOR ENGINE (Obstacles Layer)
// ============================================================================
function generateObstacleBlocks() {
    // Clear out old block instances from previous runs
    blocksObstaclesArray.forEach(b => scene.remove(b.mesh));
    blocksObstaclesArray = [];

    const blockMaterial = new THREE.MeshStandardMaterial({ color: 0x444455, roughness: 0.5, metalness: 0.2 });

    for (let i = 0; i < activeSettings.maxBlocks; i++) {
        // Generate varying block shapes (tall walls, wide cubes)
        const w = 2 + Math.random() * 4;
        const h = 2 + Math.random() * 5;
        const d = 2 + Math.random() * 4;
        const geo = new THREE.BoxGeometry(w, h, d);
        const mesh = new THREE.Mesh(geo, blockMaterial);

        // Place them within the active gameplay map boundaries, far from origin spawn
        let posX, posZ;
        do {
            posX = (Math.random() - 0.5) * 80;
            posZ = (Math.random() - 0.5) * 80;
        } while (Math.abs(posX) < 8 && Math.abs(posZ) < 8); // Never trap player on startup spawning coordinates

        mesh.position.set(posX, h / 2, posZ);
        scene.add(mesh);

        // Map dimensions to calculation metrics for bounding configurations
        blocksObstaclesArray.push({
            mesh: mesh,
            minX: posX - w/2, maxX: posX + w/2,
            minZ: posZ - d/2, maxZ: posZ + d/2
        });
    }
}

// Solid Object Wall Collision Detection Formula (AABB)
function checkBlockCollisions(nextX, nextZ, radius = 0.5) {
    for (let i = 0; i < blocksObstaclesArray.length; i++) {
        const b = blocksObstaclesArray[i];
        if (nextX + radius > b.minX && nextX - radius < b.maxX &&
            nextZ + radius > b.minZ && nextZ - radius < b.maxZ) {
            return true; // Hit a wall!
        }
    }
    return false;
}

// ============================================================================
// 5. COMBAT SYSTEM UTILITIES
// ============================================================================
function spawnEnemy() {
    if (isGameOver || !gameStarted) return;
    const geo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
    const mat = new THREE.MeshStandardMaterial({ color: currentLevel === 1 ? 0xff0033 : 0xffaa00 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = 0.45;

    const angle = Math.random() * Math.PI * 2;
    const spawnRadius = 25 + Math.random() * 10;
    mesh.position.x = playerGroup.position.x + Math.cos(angle) * spawnRadius;
    mesh.position.z = playerGroup.position.z + Math.sin(angle) * spawnRadius;

    scene.add(mesh);
    enemiesArray.push(mesh);
}

function fireProjectile() {
    if (isGameOver || !gameStarted) return;
    const geo = new THREE.SphereGeometry(0.2, 8, 8);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(playerGroup.position);
    mesh.position.y = 0.7;

    const velocity = new THREE.Vector3(0, 0, -1).applyQuaternion(playerGroup.quaternion).normalize().multiplyScalar(0.45);
    scene.add(mesh);
    projectilesArray.push({ mesh: mesh, velocity: velocity, life: 100 });
}

function startSpawning() {
    if (enemySpawnTimer) clearInterval(enemySpawnTimer);
    enemySpawnTimer = setInterval(spawnEnemy, activeSettings.spawnInterval);
}

// ============================================================================
// 6. INPUT LOGIC INTERFACES
// ============================================================================
let moveDirection = { x: 0, z: 0 };
const playerBaseSpeed = 0.15;
const keys = { w: false, a: false, s: false, d: false };

window.addEventListener('keydown', (e) => {
    if (!gameStarted) {
        if (e.key === 'Enter' || e.key === ' ') startGameMission();
        return;
    }
    if(['w','ArrowUp'].includes(e.key)) keys.w = true;
    if(['s','ArrowDown'].includes(e.key)) keys.s = true;
    if(['a','ArrowLeft'].includes(e.key)) keys.a = true;
    if(['d','ArrowRight'].includes(e.key)) keys.d = true;
    if(e.key === ' ') fireProjectile();
    updateKeyboardDirection();
});

window.addEventListener('keyup', (e) => {
    if(['w','ArrowUp'].includes(e.key)) keys.w = false;
    if(['s','ArrowDown'].includes(e.key)) keys.s = false;
    if(['a','ArrowLeft'].includes(e.key)) keys.a = false;
    if(['d','ArrowRight'].includes(e.key)) keys.d = false;
    updateKeyboardDirection();
});

function updateKeyboardDirection() {
    moveDirection.x = (keys.a ? -1 : 0) + (keys.d ? 1 : 0);
    moveDirection.z = (keys.w ? -1 : 0) + (keys.s ? 1 : 0);
}

// Touch Mobile Engine Configuration
const joystickZone = document.getElementById('joystickZone');
const joystickKnob = document.getElementById('joystickKnob');
const fireButton = document.getElementById('actionButton');
let joystickActive = false;

joystickZone.addEventListener('touchstart', (e) => { if(!gameStarted) return; joystickActive = true; handleJoystickMove(e.touches[0]); });
joystickZone.addEventListener('touchmove', (e) => { if (joystickActive) handleJoystickMove(e.touches[0]); });
joystickZone.addEventListener('touchend', () => { joystickActive = false; joystickKnob.style.transform = `translate(0px, 0px)`; moveDirection = { x: 0, z: 0 }; });
fireButton.addEventListener('touchstart', (e) => { e.preventDefault(); if(gameStarted) fireProjectile(); });
fireButton.addEventListener('click', () => { if(gameStarted) fireProjectile(); });

function handleJoystickMove(touch) {
    const rect = joystickZone.getBoundingClientRect();
    const cX = rect.left + rect.width / 2; const cY = rect.top + rect.height / 2;
    let dX = touch.clientX - cX; let dY = touch.clientY - cY;
    const maxR = rect.width / 2; const dist = Math.sqrt(dX * dX + dY * dY);
    if (dist > maxR) { dX = (dX / dist) * maxR; dY = (dY / dist) * maxR; }
    joystickKnob.style.transform = `translate(${dX}px, ${dY}px)`;
    moveDirection.x = dX / maxR; moveDirection.z = dY / maxR;
}

// ============================================================================
// 7. CORE RUNTIME PHYSICS LOOPS
// ============================================================================
function updateGamePhysics() {
    // 1. Player Translation with Block Check Walls
    if (moveDirection.x !== 0 || moveDirection.z !== 0) {
        const nextX = playerGroup.position.x + moveDirection.x * playerBaseSpeed;
        const nextZ = playerGroup.position.z + moveDirection.z * playerBaseSpeed;

        // Separate coordinate check variables to allow sliding along block boundaries smoothly
        if (!checkBlockCollisions(nextX, playerGroup.position.z, 0.5)) {
            playerGroup.position.x = nextX;
        }
        if (!checkBlockCollisions(playerGroup.position.x, nextZ, 0.5)) {
            playerGroup.position.z = nextZ;
        }
        playerGroup.rotation.y = Math.atan2(moveDirection.x, moveDirection.z);
    }

    // 2. Enemies Pathfinding Loops
    for (let i = enemiesArray.length - 1; i >= 0; i--) {
        const enemy = enemiesArray[i];
        const dir = new THREE.Vector3().subVectors(playerGroup.position, enemy.position);
        dir.y = 0; dir.normalize();
        
        const nextEnemyX = enemy.position.x + dir.x * activeSettings.enemySpeed;
        const nextEnemyZ = enemy.position.z + dir.z * activeSettings.enemySpeed;

        // Enemies are also blocked by solid blocks!
        if (!checkBlockCollisions(nextEnemyX, enemy.position.z, 0.45)) enemy.position.x = nextEnemyX;
        if (!checkBlockCollisions(enemy.position.x, nextEnemyZ, 0.45)) enemy.position.z = nextEnemyZ;
        
        enemy.lookAt(playerGroup.position.x, enemy.position.y, playerGroup.position.z);

        if (enemy.position.distanceTo(playerGroup.position) < 1.0) {
            playerHealth -= 1.5; updateUI();
            if (playerHealth <= 0) handleLifeLoss();
        }
    }

    // 3. Lasers vs Enemies vs Blocks
    for (let p = projectilesArray.length - 1; p >= 0; p--) {
        const proj = projectilesArray[p];
        proj.mesh.position.add(proj.velocity);
        proj.life--;

        let hitRegistered = false;

        // Laser hits solid block check
        if (checkBlockCollisions(proj.mesh.position.x, proj.mesh.position.z, 0.1)) {
            hitRegistered = true; // Destroy bullet if it hits a wall
        }

        // Laser hits enemy check
        for (let e = enemiesArray.length - 1; e >= 0; e--) {
            const enemy = enemiesArray[e];
            if (proj.mesh.position.distanceTo(enemy.position) < 0.8) {
                scene.remove(enemy);
                enemiesArray.splice(e, 1);
                hitRegistered = true;
                score++; updateUI(); checkLevelProgression();
                break;
            }
        }

        if (hitRegistered || proj.life <= 0) {
            scene.remove(proj.mesh);
            projectilesArray.splice(p, 1);
        }
    }
}

// ============================================================================
// 8. PROGRESSION MANAGEMENT ENGINE
// ============================================================================
function handleLifeLoss() {
    playerLives--;
    if (playerLives <= 0) {
        triggerGameOver(false);
    } else {
        playerHealth = 100;
        playerGroup.position.set(0, 0, 0);
        enemiesArray.forEach(e => scene.remove(e));
        enemiesArray = [];
        updateUI();
    }
}

function checkLevelProgression() {
    if (score >= activeSettings.targetScore) {
        if (currentLevel < maxLevels) {
            currentLevel++;
            activeSettings = getLevelSettings(currentLevel);
            score = 0; playerHealth = 100; 
            
            scene.background = new THREE.Color(activeSettings.backgroundColor);
            scene.fog.color = new THREE.Color(activeSettings.backgroundColor);
            
            scene.remove(gridHelper);
            gridHelper = new THREE.GridHelper(500, 100, activeSettings.gridColor, 0x1e1e2f);
            scene.add(gridHelper);
            
            generateObstacleBlocks(); // Generate fresh barriers for the new level
            updateUI();
            startSpawning();
        } else {
            triggerGameOver(true);
        }
    }
}

function updateUI() {
    document.getElementById('levelDisplay').innerText = `LEVEL: ${currentLevel}/${maxLevels} ${currentLevel === 1 ? '(SURVIVE HARD MODE!)' : ''}`;
    document.getElementById('scoreDisplay').innerText = `KILLS: ${score} / ${activeSettings.targetScore} | LIVES: ${"❤️".repeat(playerLives)}`;
    document.getElementById('healthBar').style.width = `${Math.max(playerHealth, 0)}%`;
}

function triggerGameOver(isVictory) {
    isGameOver = true;
    clearInterval(enemySpawnTimer);
    const screen = document.getElementById('overlayScreen');
    const title = document.getElementById('screenTitle');
    const subtitle = document.getElementById('screenSubtitle');
    
    document.getElementById('restartButton').innerText = "PLAY AGAIN";
    if (isVictory) {
        title.innerText = "MASTER VICTOR 🏆";
        subtitle.innerText = "All 30 data mainframe matrices successfully stabilized!";
    } else {
        title.innerText = "DEFEATED 💀";
        subtitle.innerText = `System compromised at level Stage ${currentLevel}.`;
    }
    document.getElementById('colorPalette').classList.add('hidden'); // hide colors during game over screen
    screen.classList.remove('hidden');
}

// Interactive Skin Customizer Menu Initializer
function setupStartMenu() {
    const options = document.querySelectorAll('.colorOption');
    options.forEach(opt => {
        opt.addEventListener('click', (e) => {
            // Uncheck previous configuration style filters
            options.forEach(o => o.classList.remove('active'));
            e.target.classList.add('active');
            
            // Apply the hexadecimal selection data instantly to the player mesh color engine
            const hexColor = parseInt(e.target.getAttribute('data-color'));
            selectedPetColor = hexColor;
            bodyMat.color.setHex(hexColor);
        });
    });

    document.getElementById('restartButton').addEventListener('click', startGameMission);
}

function startGameMission() {
    gameStarted = true;
    document.getElementById('overlayScreen').classList.add('hidden');
    
    const btn = document.getElementById('restartButton');
    btn.removeEventListener('click', startGameMission);
    btn.addEventListener('click', resetEntireGame);
    
    resetEntireGame();
}

function resetEntireGame() {
    enemiesArray.forEach(e => scene.remove(e));
    projectilesArray.forEach(p => scene.remove(p.mesh));
    enemiesArray = []; projectilesArray = [];
    
    currentLevel = 1; score = 0; playerHealth = 100; playerLives = 3; isGameOver = false;
    activeSettings = getLevelSettings(currentLevel);
    
    playerGroup.position.set(0, 0, 0);
    scene.background = new THREE.Color(activeSettings.backgroundColor);
    scene.fog.color = new THREE.Color(activeSettings.backgroundColor);
    
    scene.remove(gridHelper);
    gridHelper = new THREE.GridHelper(500, 100, activeSettings.gridColor, 0x111122);
    scene.add(gridHelper);
    
    generateObstacleBlocks(); // Spawns blocks instantly
    updateUI();
    document.getElementById('colorPalette').classList.remove('hidden');
    document.getElementById('overlayScreen').classList.add('hidden');
    startSpawning();
}

// ============================================================================
// 9. ANIMATION LOOP FRAME SYNC RUNTIME
// ============================================================================
function animate() {
    requestAnimationFrame(animate);
    if (gameStarted && !isGameOver) {
        updateGamePhysics();
    }
    camera.position.copy(playerGroup.position).add(cameraOffset);
    camera.lookAt(playerGroup.position.x, playerGroup.position.y + 0.5, playerGroup.position.z);
    renderer.render(scene, camera);
}

setupStartMenu();
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});