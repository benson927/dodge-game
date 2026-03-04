const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d', { alpha: false }); // 優化效能

const UI = {
    score: document.getElementById('score'),
    highScore: document.getElementById('highScore'),
    finalScore: document.getElementById('finalScore'),
    startScreen: document.getElementById('startScreen'),
    gameOverScreen: document.getElementById('gameOverScreen'),
    startBtn: document.getElementById('startBtn'),
    restartBtn: document.getElementById('restartBtn'),
    shieldStatus: document.getElementById('status-shield'),
    timeStatus: document.getElementById('status-time'),
    timeBar: document.getElementById('timeWarpBar')
};

// 遊戲狀態管理器
const GameState = {
    animationId: null,
    frames: 0,
    score: 0,
    highScore: localStorage.getItem('neonDodgeHS') || 0,
    active: false,
    difficulty: 1,
    timeWarpActive: false,
    timeWarpTimer: 0,
    baseScrollSpeed: 0.5
};

UI.highScore.textContent = GameState.highScore;

// 物件陣列
let player;
let meteors = [];
let particles = [];
let powerups = [];
let stars = [[], [], []]; // 視差背景層：遠、中、近

// 鍵盤狀態
const keys = { w: 0, a: 0, s: 0, d: 0 };

window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (keys[k] !== undefined) keys[k] = true;
});
window.addEventListener('keyup', e => {
    const k = e.key.toLowerCase();
    if (keys[k] !== undefined) keys[k] = false;
});


// --- CLASSES ---

class Player {
    constructor() {
        this.radius = 16;
        this.x = canvas.width / 2;
        this.y = canvas.height - 120;
        this.targetX = this.x;
        this.targetY = this.y;
        this.color = '#00f0ff';
        this.speed = 7;
        this.hasShield = false;
        this.shieldRadius = this.radius * 1.8;
        this.shieldAngle = 0;
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);

        // 繪製本體
        ctx.beginPath();
        ctx.moveTo(0, -this.radius * 1.2);
        ctx.lineTo(this.radius, this.radius);
        ctx.lineTo(this.radius * 0.4, this.radius * 0.6);
        ctx.lineTo(-this.radius * 0.4, this.radius * 0.6);
        ctx.lineTo(-this.radius, this.radius);
        ctx.closePath();

        // 漸層填充
        const grad = ctx.createLinearGradient(0, -this.radius, 0, this.radius);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.4, this.color);
        grad.addColorStop(1, '#005080');

        ctx.fillStyle = grad;
        ctx.shadowBlur = 20;
        ctx.shadowColor = this.color;
        ctx.fill();

        // 核心發光
        ctx.beginPath();
        ctx.arc(0, 0, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();

        // 繪製護盾特效
        if (this.hasShield) {
            this.shieldAngle += 0.05;
            ctx.rotate(this.shieldAngle);
            ctx.beginPath();
            ctx.arc(0, 0, this.shieldRadius, 0, Math.PI * 2);
            ctx.strokeStyle = `hsla(190, 100%, 50%, ${0.5 + Math.sin(GameState.frames * 0.1) * 0.2})`;
            ctx.lineWidth = 3;
            // 虛線護盾感
            ctx.setLineDash([15, 10]);
            ctx.stroke();
            ctx.setLineDash([]);

            // 護盾內側微光
            ctx.beginPath();
            ctx.arc(0, 0, this.shieldRadius - 2, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0, 240, 255, 0.1)';
            ctx.fill();
        }

        ctx.restore();
    }

    update() {
        // 鍵盤移動
        if (keys.w) this.y -= this.speed;
        if (keys.s) this.y += this.speed;
        if (keys.a) this.x -= this.speed;
        if (keys.d) this.x += this.speed;

        // 邊界限制
        this.x = Math.max(this.radius, Math.min(canvas.width - this.radius, this.x));
        this.y = Math.max(this.radius, Math.min(canvas.height - this.radius, this.y));

        // 引擎尾焰
        if (GameState.frames % 2 === 0) {
            produceParticles(
                this.x + (Math.random() - 0.5) * 10, this.y + this.radius,
                Math.random() * 3 + 1, '#00f0ff',
                { x: (Math.random() - 0.5) * 0.5, y: Math.random() * 2 + 3 }, 0.04, false
            );
        }
        this.draw();
    }
}

class Meteor {
    constructor() {
        this.radius = Math.random() * 25 + 15;
        this.x = Math.random() * (canvas.width - this.radius * 2) + this.radius;
        this.y = -this.radius * 2;

        const speedBase = (Math.random() * 2 + 3) * (1 + GameState.difficulty * 0.1);
        this.baseVelocity = {
            x: (Math.random() - 0.5) * 2,
            y: speedBase
        };
        this.velocity = { ...this.baseVelocity };

        this.color = `hsl(${Math.random() * 30 - 15}, 100%, 60%)`; // 偏紅紫的火光
        this.vertices = Math.floor(Math.random() * 4) + 6;
        this.angle = 0;
        this.rotationSpeed = (Math.random() - 0.5) * 0.05;
        this.offsets = Array.from({ length: this.vertices }, () => Math.random() * 0.3 + 0.7);
    }

    update() {
        // 時間減速道具效果
        const timeFactor = GameState.timeWarpActive ? 0.3 : 1;
        this.x += this.velocity.x * timeFactor;
        this.y += this.velocity.y * timeFactor;
        this.angle += this.rotationSpeed * timeFactor;

        // 隕石燃燒軌跡
        if (GameState.frames % (GameState.timeWarpActive ? 10 : 3) === 0) {
            produceParticles(this.x, this.y, Math.random() * 4 + 2, this.color, { x: 0, y: -1 }, 0.03, true);
        }

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.beginPath();
        for (let i = 0; i < this.vertices; i++) {
            const a = (i * 2 * Math.PI) / this.vertices;
            const r = this.radius * this.offsets[i];
            i === 0 ? ctx.moveTo(r * Math.cos(a), r * Math.sin(a)) : ctx.lineTo(r * Math.cos(a), r * Math.sin(a));
        }
        ctx.closePath();

        // 隕石本體材質
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius);
        grad.addColorStop(0, '#3a1010');
        grad.addColorStop(1, '#0a0000');
        ctx.fillStyle = grad;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2;
        ctx.shadowBlur = 15;
        ctx.shadowColor = this.color;
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }
}

class PowerUp {
    constructor(type) {
        this.radius = 12;
        this.x = Math.random() * (canvas.width - 40) + 20;
        this.y = -20;
        this.type = type; // 'shield', 'time', 'bomb'
        this.velocity = { x: Math.sin(GameState.frames * 0.1) * 1, y: 2 };
        this.angle = 0;

        const styleMap = {
            'shield': { color: '#00f0ff', symbol: '⛨' },
            'time': { color: '#b026ff', symbol: '⌚' },
            'bomb': { color: '#fcee0a', symbol: '⚠' }
        };
        this.style = styleMap[type];
    }

    update() {
        const timeFactor = GameState.timeWarpActive ? 0.5 : 1;
        this.y += this.velocity.y * timeFactor;
        this.x += Math.sin(this.y * 0.02) * 1.5; // S型漂浮
        this.angle += 0.02;

        ctx.save();
        ctx.translate(this.x, this.y);

        const glowPhase = (Math.sin(GameState.frames * 0.1) + 1) / 2;

        // 光暈圈
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * (1.2 + glowPhase * 0.3), 0, Math.PI * 2);
        ctx.fillStyle = this.style.color;
        ctx.globalAlpha = 0.2 + glowPhase * 0.2;
        ctx.fill();
        ctx.globalAlpha = 1;

        // 主體
        ctx.rotate(this.angle);
        ctx.beginPath();
        ctx.rect(-this.radius, -this.radius, this.radius * 2, this.radius * 2);
        ctx.strokeStyle = this.style.color;
        ctx.lineWidth = 2;
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.style.color;
        ctx.stroke();

        // 圖示
        ctx.rotate(-this.angle);
        ctx.fillStyle = '#fff';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.style.symbol, 0, 0);

        ctx.restore();
    }
}

class Particle {
    constructor(x, y, radius, color, velocity, fadeRate, isSmoke) {
        this.x = x; this.y = y; this.radius = radius;
        this.color = color; this.velocity = velocity;
        this.alpha = 1; this.fadeRate = fadeRate; this.isSmoke = isSmoke;
    }
    update() {
        this.x += this.velocity.x;
        this.y += this.velocity.y;
        this.alpha -= this.fadeRate;
        if (this.isSmoke) this.radius += 0.5;

        ctx.save();
        ctx.globalAlpha = Math.max(0, this.alpha);
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.shadowBlur = this.isSmoke ? 0 : 5;
        ctx.shadowColor = this.color;
        ctx.fill();
        ctx.restore();
    }
}

// 視差星星背景
function initStars() {
    stars = [[], [], []];
    const counts = [50, 30, 15]; // 後景, 中景, 前景
    const speeds = [0.2, 0.6, 1.2];
    const sizes = [1, 1.5, 2.5];

    counts.forEach((count, layer) => {
        for (let i = 0; i < count; i++) {
            stars[layer].push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                size: sizes[layer],
                speed: speeds[layer],
                color: Math.random() > 0.8 ? '#00f0ff' : (Math.random() > 0.8 ? '#b026ff' : '#ffffff')
            });
        }
    });
}

function updateStars() {
    const warpFactor = GameState.timeWarpActive ? 0.2 : 1;
    stars.forEach((layer, idx) => {
        layer.forEach(star => {
            star.y += (star.speed + GameState.baseScrollSpeed * (idx + 1) * 0.2) * warpFactor;
            if (star.y > canvas.height) {
                star.y = 0;
                star.x = Math.random() * canvas.width;
            }
            ctx.fillStyle = star.color;
            ctx.globalAlpha = idx === 0 ? 0.3 : (idx === 1 ? 0.6 : 1);
            if (layer === 2 && Math.random() > 0.95) ctx.globalAlpha = 0.2; // 前景閃爍
            ctx.beginPath();
            ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
            ctx.shadowBlur = idx === 2 ? 5 : 0;
            ctx.shadowColor = star.color;
            ctx.fill();
        });
    });
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
}


// --- 核心邏輯 ---

function produceParticles(x, y, r, c, v, fade, smoke) {
    if (particles.length < 300) { // 限制數量避免卡頓
        particles.push(new Particle(x, y, r, c, v, fade, smoke));
    }
}

function createExplosion(x, y, c1, c2, big = false) {
    const count = big ? 60 : 30;
    const power = big ? 12 : 6;
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * power;
        const color = Math.random() > 0.5 ? c1 : (c2 || '#ffffff');
        produceParticles(x, y, Math.random() * 3 + 2, color,
            { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed }, 0.02, false);
    }
}

// 螢幕震動特效 (簡單版，透過位移ctx)
let shakeAmount = 0;

function spawnLogic() {
    // 隕石生成
    const rate = Math.max(15, 50 - GameState.difficulty * 2);
    if (GameState.frames % Math.floor(rate) === 0) {
        meteors.push(new Meteor());
    }

    // 道具生成 (較低機率)
    if (GameState.frames > 300 && GameState.frames % 300 === 0) {
        if (Math.random() < 0.6) {
            const types = ['shield', 'time', 'bomb'];
            // 如果已經有護盾，降低護盾掉落率
            let type = types[Math.floor(Math.random() * types.length)];
            if (type === 'shield' && player.hasShield) type = 'bomb';
            powerups.push(new PowerUp(type));
        }
    }
}

function handlePowerupCollect(type) {
    if (type === 'shield') {
        player.hasShield = true;
        UI.shieldStatus.classList.remove('hidden');
    } else if (type === 'time') {
        GameState.timeWarpActive = true;
        GameState.timeWarpTimer = 600; // 10秒 (60fps)
        UI.timeStatus.classList.remove('hidden');
    } else if (type === 'bomb') {
        // 全畫面清空爆炸
        shakeAmount = 20;
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        meteors.forEach(m => createExplosion(m.x, m.y, m.color, '#fcee0a'));
        meteors = [];
        GameState.score += 50; // 炸彈額外加分
    }
}

function circleCollide(a, b, margin = 0) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy) < (a.radius + b.radius - margin);
}

function handleGameOver() {
    GameState.active = false;
    cancelAnimationFrame(GameState.animationId);

    // 大爆炸
    createExplosion(player.x, player.y, '#00f0ff', '#ff007f', true);
    canvas.style.cursor = 'default';

    function deathAnim() {
        ctx.fillStyle = 'rgba(3, 3, 10, 0.4)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        updateStars();

        let aliveParticles = 0;
        particles.forEach((p, i) => {
            if (p.alpha > 0) {
                p.update();
                aliveParticles++;
            }
        });

        if (aliveParticles > 0) {
            requestAnimationFrame(deathAnim);
        } else {
            if (GameState.score > GameState.highScore) {
                GameState.highScore = GameState.score;
                localStorage.setItem('neonDodgeHS', GameState.highScore);
                UI.highScore.textContent = GameState.highScore;
            }
            UI.finalScore.textContent = GameState.score;
            UI.gameOverScreen.classList.remove('hidden');
        }
    }
    deathAnim();
}

function animate() {
    if (!GameState.active) return;
    GameState.animationId = requestAnimationFrame(animate);
    GameState.frames++;

    // 清空背景與運動模糊處理
    ctx.fillStyle = '#03030a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 螢幕震動
    if (shakeAmount > 0) {
        ctx.save();
        const dx = (Math.random() - 0.5) * shakeAmount;
        const dy = (Math.random() - 0.5) * shakeAmount;
        ctx.translate(dx, dy);
        shakeAmount *= 0.9;
        if (shakeAmount < 0.5) shakeAmount = 0;
    }

    updateStars();

    // 超空間(Time Warp)特效濾鏡
    if (GameState.timeWarpActive) {
        GameState.timeWarpTimer--;
        ctx.fillStyle = 'rgba(176, 38, 255, 0.1)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (GameState.timeWarpTimer <= 0) {
            GameState.timeWarpActive = false;
            UI.timeStatus.classList.add('hidden');
        } else if (GameState.timeWarpTimer < 120 && GameState.frames % 10 < 5) {
            // 快結束時閃爍
            UI.timeStatus.classList.add('hidden');
        } else {
            UI.timeStatus.classList.remove('hidden');
        }
    }

    // 計分系統
    if (GameState.frames % 60 === 0) {
        GameState.score++;
        UI.score.textContent = GameState.score;
        if (GameState.score % 15 === 0) GameState.difficulty++;
        // 速度推進感
        GameState.baseScrollSpeed = Math.min(2, 0.5 + GameState.difficulty * 0.1);
    }

    spawnLogic();
    player.update();

    // 更新道具
    for (let i = powerups.length - 1; i >= 0; i--) {
        const p = powerups[i];
        p.update();
        if (circleCollide(player, p, -5)) { // 稍微擴大判定
            handlePowerupCollect(p.type);
            createExplosion(p.x, p.y, p.style.color, '#fff');
            powerups.splice(i, 1);
        } else if (p.y > canvas.height + 20) {
            powerups.splice(i, 1);
        }
    }

    // 更新隕石
    for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i];
        m.update();

        // 玩家碰撞
        let hitDist = player.hasShield ? player.shieldRadius * 0.8 : player.radius * 0.8;
        if (circleCollide(player, m, m.radius - hitDist)) {
            if (player.hasShield) {
                // 破盾
                player.hasShield = false;
                UI.shieldStatus.classList.add('hidden');
                createExplosion(player.x, player.y, '#00f0ff', '#ffffff', true);
                shakeAmount = 10;
                meteors.splice(i, 1); // 摧毀該隕石
                continue;
            } else {
                if (shakeAmount > 0) ctx.restore(); // 確保清理 ctx
                handleGameOver();
                return;
            }
        }

        if (m.y - m.radius > canvas.height) meteors.splice(i, 1);
    }

    // 更新粒子
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.alpha <= 0 ? particles.splice(i, 1) : p.update();
    }

    if (shakeAmount > 0) ctx.restore();
}

function initGame() {
    player = new Player();
    meteors = [];
    particles = [];
    powerups = [];

    GameState.frames = 0;
    GameState.score = 0;
    GameState.difficulty = 1;
    GameState.active = true;
    GameState.timeWarpActive = false;
    GameState.baseScrollSpeed = 0.5;

    UI.score.textContent = 0;
    UI.startScreen.classList.add('hidden');
    UI.gameOverScreen.classList.add('hidden');
    UI.shieldStatus.classList.add('hidden');
    UI.timeStatus.classList.add('hidden');
    shakeAmount = 0;

    initStars();
    animate();
}

UI.startBtn.addEventListener('click', initGame);
UI.restartBtn.addEventListener('click', initGame);

// 初始化封面
initStars();
ctx.fillStyle = '#03030a';
ctx.fillRect(0, 0, canvas.width, canvas.height);
updateStars();
