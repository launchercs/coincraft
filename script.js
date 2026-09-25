// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
    SERVER_HOST: 'coincraft.funserver.top',
    SERVER_PORT: 25565,
    SERVER_HOST: '5.9.41.143',
    SERVER_PORT: 34507,
    THEME_KEY: 'coincraft-theme',
    SOCIAL_LINKS: {
        discord: 'https://discord.gg/5mBRcRU9w',
        telegram: '',
        instagram: '',
        youtube: '',
        twitter: '',
        robika: 'https://rubika.ir/coinscraft'
    }
};

// ============================================
// SERVER STATUS SYSTEM
// ============================================
const STATUS_CONFIG = {
    REFRESH_INTERVAL: 30000,
    RETRY_DELAY: 3000,
    MAX_RETRIES: 2,
    PING_TIMEOUT: 8000,
    APIS: [
        {
            name: 'mcsrvstat',
            buildUrl: (host, port) => `https://api.mcsrvstat.us/3/${host}:${port}`,
            parse: (data, host, port) => ({
                online: data.online === true,
                players: { online: data.players?.online || 0, max: data.players?.max || 0 },
                motd: { clean: data.motd?.clean || [data.motd?.raw || 'CoinCraft Network'] },
                version: data.version || '1.20',
                host: data.hostname || host,
                port: data.port || port
            })
        },
        {
            name: 'mcstatus.io',
            buildUrl: (host, port) => `https://api.mcstatus.io/v2/status/java/${host}:${port}`,
            parse: (data, host, port) => ({
                online: data.online === true,
                players: { online: data.players?.online || 0, max: data.players?.max || 0 },
                motd: { clean: [data.motd?.clean || data.motd?.raw || 'CoinCraft Network'] },
                version: data.version?.name_clean || data.version?.name || '1.20',
                host: data.host || host,
                port: data.port || port
            })
        }
    ],
    CURRENT_API_INDEX: 0
};

let statusState = {
    isOnline: false,
    playerCount: 0,
    maxPlayers: 0,
    motd: '',
    version: '',
    host: CONFIG.SERVER_HOST,
    port: CONFIG.SERVER_PORT,
    lastUpdate: null,
    isRefreshing: false,
    errorCount: 0,
    activeApi: ''
};

let statusInterval = null;
let retryTimeout = null;
let visibilityHandlerAttached = false;

// ============================================
// FETCH SERVER STATUS
// ============================================
async function fetchServerStatus() {
    if (statusState.isRefreshing) return;
    statusState.isRefreshing = true;

    const statusEl = document.getElementById('server-status');
    const dot = document.getElementById('status-dot');
    const countEl = document.getElementById('player-count');

    if (!statusEl && !countEl && !dot) {
        statusState.isRefreshing = false;
        return;
    }

    try {
        if (statusEl) {
            statusEl.textContent = 'در حال بررسی...';
            statusEl.className = 'checking-text';
        }
        if (dot) dot.className = 'status-dot checking';
        if (countEl) {
            countEl.textContent = '⏳ در حال بررسی';
            countEl.style.color = '#f1c40f';
        }

        let data = null;
        const startIndex = STATUS_CONFIG.CURRENT_API_INDEX;

        for (let i = 0; i < STATUS_CONFIG.APIS.length; i++) {
            const index = (startIndex + i) % STATUS_CONFIG.APIS.length;
            const api = STATUS_CONFIG.APIS[index];

            try {
                const url = api.buildUrl(CONFIG.SERVER_HOST, CONFIG.SERVER_PORT);
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), STATUS_CONFIG.PING_TIMEOUT);

                const response = await fetch(url, {
                    signal: controller.signal,
                    headers: { 'Accept': 'application/json' }
                });
                clearTimeout(timeoutId);

                if (!response.ok) throw new Error(`HTTP ${response.status}`);

                const rawData = await response.json();
                const parsed = api.parse(rawData, CONFIG.SERVER_HOST, CONFIG.SERVER_PORT);

                if (parsed && typeof parsed.online === 'boolean') {
                    data = parsed;
                    STATUS_CONFIG.CURRENT_API_INDEX = index;
                    statusState.activeApi = api.name;
                    break;
                }
            } catch (err) {
                console.warn(`API ${api.name} failed:`, err.message);
                continue;
            }
        }

        if (data) {
            processServerData(data, statusEl, dot, countEl);
            statusState.errorCount = 0;
        } else {
            throw new Error('All APIs failed');
        }

    } catch (error) {
        console.error('Status fetch error:', error);
        statusState.errorCount++;

        if (statusState.errorCount <= STATUS_CONFIG.MAX_RETRIES) {
            const delay = STATUS_CONFIG.RETRY_DELAY * statusState.errorCount;
            clearTimeout(retryTimeout);
            retryTimeout = setTimeout(() => fetchServerStatus(), delay);
        } else {
            if (statusEl) {
                statusEl.textContent = 'آفلاین';
                statusEl.className = 'offline-text';
            }
            if (dot) dot.className = 'status-dot offline';
            if (countEl) {
                countEl.textContent = '⛔ سرور آفلاین';
                countEl.style.color = '#e74c3c';
            }
        }
    } finally {
        statusState.isRefreshing = false;
        statusState.lastUpdate = new Date();
    }
}

function processServerData(data, statusEl, dot, countEl) {
    if (data.online === true) {
        statusState.isOnline = true;
        statusState.playerCount = data.players?.online || 0;
        statusState.maxPlayers = data.players?.max || 0;
        statusState.motd = Array.isArray(data.motd?.clean)
            ? (data.motd.clean[0] || 'CoinCraft Network')
            : (data.motd?.clean || 'CoinCraft Network');
        statusState.version = data.version || '1.20';
        statusState.host = data.host || CONFIG.SERVER_HOST;
        statusState.port = data.port || CONFIG.SERVER_PORT;

        if (statusEl) {
            statusEl.textContent = 'آنلاین';
            statusEl.className = 'online-text';
        }
        if (dot) dot.className = 'status-dot online';
        if (countEl) {
            countEl.textContent = `👥 ${statusState.playerCount.toLocaleString('fa-IR')} نفر`;
            countEl.style.color = '#2ecc71';
        }

        const badge = document.querySelector('.hero-badge');
        if (badge && statusState.motd) {
            const firstLine = String(statusState.motd).split('\n')[0];
            badge.textContent = `⚡ ${firstLine}`;
            badge.classList.add('has-motd');
        }
    } else {
        statusState.isOnline = false;
        statusState.playerCount = 0;

        if (statusEl) {
            statusEl.textContent = 'آفلاین';
            statusEl.className = 'offline-text';
        }
        if (dot) dot.className = 'status-dot offline';
        if (countEl) {
            countEl.textContent = '⛔ سرور آفلاین';
            countEl.style.color = '#e74c3c';
        }
    }
}

function startStatusRefresh() {
    const statusEl = document.getElementById('server-status');
    const countEl = document.getElementById('player-count');
    if (!statusEl && !countEl) return;

    if (statusInterval) {
        clearInterval(statusInterval);
        statusInterval = null;
    }

    fetchServerStatus();

    statusInterval = setInterval(() => {
        if (!document.hidden) fetchServerStatus();
    }, STATUS_CONFIG.REFRESH_INTERVAL);

    if (!visibilityHandlerAttached) {
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) fetchServerStatus();
        });
        visibilityHandlerAttached = true;
    }
}

// ============================================
// DOM HELPERS
// ============================================
function $(id) { return document.getElementById(id); }
function $all(sel, parent = document) { return parent.querySelectorAll(sel); }

const toast = document.getElementById('toast');
let toastTimeout = null;

function showToast(msg, duration = 3000) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.remove('show'), duration);
}

// ============================================
// LOADING SCREEN
// ============================================
function hideLoadingScreen() {
    const loader = $('loading-screen');
    if (loader) {
        setTimeout(() => loader.classList.add('hidden'), 600);
    }
}

// ============================================
// PRICE FORMAT
// ============================================
function formatPrice(amount) {
    return new Intl.NumberFormat('fa-IR').format(amount);
}

function formatFullPrice(toman) {
    const rial = toman * 10;
    return `
        <div class="price-container">
            <div class="price-toman">💰 ${formatPrice(toman)} تومان</div>
            <div class="price-rial">${formatPrice(rial)} ریال</div>
        </div>
    `;
}

// ============================================
// COLOR UTILS
// ============================================
function isHexColor(color) {
    return typeof color === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color);
}

function shadeColor(color, percent) {
    if (!isHexColor(color)) return color || '#000000';
    let hex = color.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const num = parseInt(hex, 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.max(0, Math.min(255, (num >> 16) + amt));
    const G = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + amt));
    const B = Math.max(0, Math.min(255, (num & 0x0000FF) + amt));
    return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
}

function hexToRgba(color, alpha = 1) {
    if (!isHexColor(color)) return `rgba(255, 215, 0, ${alpha})`;
    let h = color.replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const num = parseInt(h, 16);
    const R = num >> 16;
    const G = (num >> 8) & 0x00FF;
    const B = num & 0x0000FF;
    return `rgba(${R}, ${G}, ${B}, ${alpha})`;
}

// ============================================
// COPY IP
// ============================================
function copyIP(ip = CONFIG.SERVER_HOST) {
    if (!ip) return;
    const cleanIp = String(ip).trim();

    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(cleanIp)
            .then(() => showToast('✅ IP سرور کپی شد!'))
            .catch(() => fallbackCopy(cleanIp));
    } else {
        fallbackCopy(cleanIp);
    }
}

function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
        document.execCommand('copy');
        showToast('✅ IP سرور کپی شد!');
    } catch (_) {
        showToast('❌ کپی نشد. لطفاً دستی کپی کن.');
    }
    document.body.removeChild(ta);
}

function setupCopyButtons() {
    $all('.btn-copy').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            copyIP(CONFIG.SERVER_HOST);
        });
    });
}

// ============================================
// THEME TOGGLE
// ============================================
function setupThemeToggle() {
    const btn = $('theme-toggle');
    if (!btn) return;

    const savedTheme = localStorage.getItem(CONFIG.THEME_KEY);
    if (savedTheme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        btn.textContent = '☀️';
    } else {
        document.documentElement.removeAttribute('data-theme');
        btn.textContent = '🌙';
    }

    btn.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        if (current === 'light') {
            document.documentElement.removeAttribute('data-theme');
            btn.textContent = '🌙';
            localStorage.setItem(CONFIG.THEME_KEY, 'dark');
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
            btn.textContent = '☀️';
            localStorage.setItem(CONFIG.THEME_KEY, 'light');
        }
    });
}

// ============================================
// MOBILE MENU
// ============================================
function setupMobileMenu() {
    const hamburger = $('hamburger');
    const nav = $('navbar');
    if (!hamburger || !nav) return;

    hamburger.addEventListener('click', () => {
        nav.classList.toggle('open');
        hamburger.classList.toggle('active');
        document.body.classList.toggle('menu-open');
    });

    $all('a', nav).forEach(link => {
        link.addEventListener('click', () => {
            nav.classList.remove('open');
            hamburger.classList.remove('active');
            document.body.classList.remove('menu-open');
        });
    });

    document.addEventListener('click', (e) => {
        if (nav.classList.contains('open') && !nav.contains(e.target) && !hamburger.contains(e.target)) {
            nav.classList.remove('open');
            hamburger.classList.remove('active');
            document.body.classList.remove('menu-open');
        }
    });
}

// ============================================
// PARTICLES
// ============================================
function createParticles() {
    const container = $('particles');
    if (!container) return;
    container.innerHTML = '';
    const count = 50;
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        const size = 2 + Math.random() * 4;
        p.style.width = size + 'px';
        p.style.height = size + 'px';
        p.style.left = Math.random() * 100 + '%';
        p.style.animationDuration = 12 + Math.random() * 20 + 's';
        p.style.animationDelay = Math.random() * 20 + 's';
        p.style.opacity = 0.2 + Math.random() * 0.5;
        fragment.appendChild(p);
    }
    container.appendChild(fragment);
}

// ============================================
// SCROLL ANIMATIONS
// ============================================
let scrollObserver = null;

function setupScrollAnimations() {
    const elements = $all('.animate-on-scroll:not(.visible)');
    if (!elements.length) return;

    if ('IntersectionObserver' in window) {
        if (!scrollObserver) {
            scrollObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('visible');
                        scrollObserver.unobserve(entry.target);
                    }
                });
            }, { threshold: 0.15 });
        }
        elements.forEach(el => scrollObserver.observe(el));
    } else {
        elements.forEach(el => el.classList.add('visible'));
    }
}

// ============================================
// BACK TO TOP
// ============================================
function setupBackToTop() {
    const btn = $('back-to-top');
    if (!btn) return;

    window.addEventListener('scroll', () => {
        btn.classList.toggle('visible', window.scrollY > 400);
    }, { passive: true });

    btn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

// ============================================
// EVENT NOTIFICATION
// ============================================
function setupEventNotification() {
    const notif = $('event-notification');
    const closeBtn = $('event-close');
    if (!notif || !closeBtn) return;

    const events = [
        '',
        ''
    ];

    setTimeout(() => {
        const randomEvent = events[Math.floor(Math.random() * events.length)];
        const textEl = notif.querySelector('.event-text');
        if (textEl) textEl.textContent = randomEvent;
        notif.classList.remove('hidden');
    }, 10000);

    closeBtn.addEventListener('click', () => notif.classList.add('hidden'));
}

// ============================================
// MODAL HELPERS
// ============================================
function openModal(modal) {
    if (!modal) return;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove('active');
    setTimeout(() => {
        if (!document.querySelector('.modal.active')) {
            document.body.style.overflow = '';
        }
    }, 50);
}

function setupModalClose(modal) {
    if (!modal) return;
    $all('.modal-close', modal).forEach(btn => {
        btn.addEventListener('click', () => closeModal(modal));
    });
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal(modal);
    });
}

// ============================================
// START PLAYING MODAL
// ============================================
function setupStartPlaying() {
    const modal = $('start-modal');
    if (!modal) return;

    $all('#start-playing-btn, #cta-start-btn').forEach(btn => {
        btn.addEventListener('click', () => openModal(modal));
    });

    setupModalClose(modal);

    const modalCopyBtn = $('modal-copy-btn');
    if (modalCopyBtn) {
        modalCopyBtn.addEventListener('click', () => copyIP(CONFIG.SERVER_HOST));
    }
}

// ============================================
// TIER LABELS (مشترک با ranks.html)
// ============================================
const TIER_LABELS = {
    'bronze': '🥉 پایه', 'silver': '🥈 نقره‌ای', 'gold': '🥇 طلایی',
    'diamond': '💎 الماس', 'premium': '⭐ ویژه', 'premium-plus': '🌟 ویژه+',
    'legend': '⚡ افسانه', 'king': '🦁 پادشاه', 'night-king': '❄️ شب‌زده',
    'special': '🪙 CoinCraft', 'special-plus': '💠 CoinCraft+', 'special-pro': '🔱 CoinCraft++'
};

function getTierLabel(tier) {
    return TIER_LABELS[tier] || '⭐ رنک';
}

// ============================================
// RANKS DATA (منبع اصلی مشترک)
// ============================================
const ranksData = [
    { name: 'VIP', icon: '🥉', color: '#2ecc71', priceToman: 25000, features: ['دسترسی به سرور', 'پشتیبانی اولویت‌دار', 'رنگ نام سبز'], popular: false, inStock: true, tier: 'bronze' },
    { name: 'VIP+', icon: '🥈', color: '#3498db', priceToman: 50000, features: ['همه امکانات VIP', 'تغییر نام', 'رنگ نام آبی', 'دسترسی به شاپ ویژه'], popular: false, inStock: true, tier: 'silver' },
    { name: 'VIP++', icon: '🥇', color: '#f39c12', priceToman: 80000, features: ['همه امکانات VIP+', 'رنگ نام طلایی', 'فلای', 'کیت روزانه'], popular: false, inStock: true, tier: 'gold' },
    { name: 'MVP', icon: '💎', color: '#9b59b6', priceToman: 100000, features: ['همه امکانات VIP++', 'رنگ نام بنفش', 'دسترسی به Event‌ها', 'تغییر نام نامحدود'], popular: false, inStock: true, tier: 'diamond' },
    { name: 'MVP+', icon: '👑', color: '#e67e22', priceToman: 175000, features: ['همه امکانات MVP', 'رنگ نام نارنجی', 'کیت‌های ویژه', 'دسترسی به بتا', 'پشتیبانی ۲۴/۷'], popular: true, inStock: true, tier: 'premium' },
    { name: 'MVP++', icon: '🌟', color: '#f1c40f', priceToman: 250000, features: ['همه امکانات MVP+', 'رنگ نام طلایی-نارنجی', 'دسترسی به تمام مپ‌ها', 'اولویت در صف', 'هدیه ماهانه'], popular: false, inStock: true, tier: 'premium-plus' },
    { name: 'LEGEND', icon: '⚡', color: '#8e44ad', priceToman: 350000, features: ['همه امکانات MVP++', 'رنگ نام بنفش-طلایی', 'دسترسی به سرورهای اختصاصی', 'کیت افسانه‌ای', 'نشان ویژه'], popular: false, inStock: true, tier: 'legend' },
    { name: 'KING', icon: '🦁', color: '#e74c3c', priceToman: 500000, features: ['همه امکانات LEGEND', 'رنگ نام قرمز-طلایی', 'دسترسی به پادشاهی', 'کیت پادشاه', 'اخطار ویژه'], popular: false, inStock: true, tier: 'king' },
    { name: 'NIGHT KING', icon: '❄️', color: '#00b4d8', priceToman: 750000, features: ['همه امکانات KING', 'رنگ نام یخی', 'دسترسی به قلمرو شب', 'کیت شب‌زده', 'تاثیرات بصری ویژه'], popular: false, inStock: true, tier: 'night-king' },
    { name: 'COINCRAFT', icon: '🪙', color: '#ffd700', priceToman: 1000000, features: ['همه امکانات NIGHT KING', 'رنگ نام طلایی خاص', 'دسترسی به همه چیز', 'کیت CoinCraft', 'تگ اختصاصی', 'پشتیبانی VIP'], popular: false, inStock: true, tier: 'special' },
    { name: 'COINCRAFT+', icon: '💠', color: '#00ff88', priceToman: 1500000, features: ['همه امکانات COINCRAFT', 'رنگ نام زمردی', 'دسترسی به بتا خصوصی', 'کیت الماس', 'دوستان ویژه', 'تخفیف فروشگاه'], popular: false, inStock: true, tier: 'special-plus' },
    { name: 'COINCRAFT++', icon: '🔱', color: '#ff6b6b', priceToman: 2500000, features: ['همه امکانات COINCRAFT+', 'رنگ نام قرمز-طلایی', 'دسترسی به همه چیز +', 'کیت افسانه‌ای', 'نشان طلایی', 'مدیریت سرور'], popular: false, inStock: false, tier: 'special-pro' },
];

// ============================================
// ساخت خودکار محصولات رنک از ranksData
// ============================================
function buildRankProductsFromRanks() {
    return ranksData.map((rank, index) => ({
        id: 1000 + index,
        name: `رنک ${rank.name}`,
        icon: rank.icon,
        desc: rank.features[0] + (rank.features[1] ? ' • ' + rank.features[1] : ''),
        priceToman: rank.priceToman,
        category: 'ranks',
        inStock: rank.inStock,
        rankTier: rank.tier,
        rankColor: rank.color,
        isRankProduct: true,
        features: rank.features.slice()
    }));
}

// ============================================
// SHOP PRODUCTS (رنک‌ها + بقیه)
// ============================================
const otherShopProducts = [
    { id: 6, name: '۱۰۰۰ سکه', icon: '💰', desc: 'شارژ کیف پول - ۱۰۰۰ سکه', priceToman: 10000, category: 'coins', inStock: true },
    { id: 7, name: '۵۰۰۰ سکه', icon: '💰', desc: 'شارژ کیف پول - ۵۰۰۰ سکه', priceToman: 45000, category: 'coins', inStock: true },
    { id: 8, name: '۱۰۰۰۰ سکه', icon: '💰', desc: 'شارژ کیف پول - ۱۰۰۰۰ سکه', priceToman: 80000, category: 'coins', inStock: true },
    { id: 9, name: '۵۰۰۰۰ سکه', icon: '💰', desc: 'شارژ کیف پول - ۵۰۰۰۰ سکه + هدیه', priceToman: 350000, category: 'coins', inStock: true },
    { id: 10, name: '۱۰۰۰۰۰ سکه', icon: '💰', desc: 'شارژ کیف پول - ۱۰۰۰۰۰ سکه + هدیه ویژه', priceToman: 650000, category: 'coins', inStock: false },

];

const shopProducts = [
    ...buildRankProductsFromRanks(),
    ...otherShopProducts
];

const categoryLabels = {
    'ranks': '👑 رنک',
    'coins': '💰 سکه',
    'points': '⭐ امتیاز',
    'keys': '🔑 کلید',
    'crates': '🎁 کرِیت',
    'cosmetics': '✨ کازمتیک'
};

function getCategoryLabel(category) {
    return categoryLabels[category] || '📦 سایر';
}

// ============================================
// SHOP RENDERING — رنگ‌بندی دقیقاً مثل ranks.html
// ============================================
let currentShopFilter = 'all';

function renderShopProducts(filter = 'all', search = '') {
    const grid = $('products-grid');
    if (!grid) return;

    let filtered = shopProducts;
    if (filter !== 'all') filtered = filtered.filter(p => p.category === filter);
    if (search.trim()) {
        const q = search.trim().toLowerCase();
        filtered = filtered.filter(p =>
            p.name.toLowerCase().includes(q) ||
            p.desc.toLowerCase().includes(q) ||
            p.category.toLowerCase().includes(q)
        );
    }

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div style="grid-column:1/-1;text-align:center;padding:60px 20px;">
                <div style="font-size:4rem;margin-bottom:16px;">🔍</div>
                <p style="color:var(--text-muted);font-size:1.1rem;">محصولی یافت نشد.</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = filtered.map(p => {
        const hasRank = !!p.isRankProduct;
        const rankColor = p.rankColor;
        const rankTier = p.rankTier;

        const cardClasses = [
            'product-card',
            !p.inStock ? 'out-of-stock-product' : '',
            hasRank ? 'rank-styled-product' : ''
        ].filter(Boolean).join(' ');

        // Badge: دقیقاً مثل ranks.html
        const badge = hasRank
            ? `<div class="product-tier-badge rank-tier-${rankTier}">${getTierLabel(rankTier)}</div>`
            : `<div class="product-category-badge">${getCategoryLabel(p.category)}</div>`;

        // نام رنک با رنگ اختصاصی (مثل ranks.html)
        const nameStyle = hasRank ? `style="color: ${rankColor}"` : '';

        // اگر رنک ناموجود است، کلاس اضافه کن
        const rankOutClass = (hasRank && !p.inStock) ? 'rank-out-of-stock' : '';

        return `
        <div class="${cardClasses} ${rankOutClass}"
             data-id="${p.id}"
             data-category="${p.category}">
            ${badge}
            <div class="product-icon">${p.icon}</div>
            <h4 ${nameStyle}>${p.name}</h4>
            <p class="product-desc">${p.desc}</p>
            ${formatFullPrice(p.priceToman)}
            <p class="product-status ${p.inStock ? 'in-stock' : 'out-of-stock'}">
                ${p.inStock ? '✅ موجود' : '⛔ ناموجود'}
            </p>
            <button class="btn btn-primary btn-sm shop-buy"
                    data-id="${p.id}"
                    ${!p.inStock ? 'disabled' : ''}>
                ${p.inStock ? '🛒 خرید' : '⛔ ناموجود'}
            </button>
        </div>
    `}).join('');

    $all('.shop-buy', grid).forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = parseInt(btn.dataset.id, 10);
            const product = shopProducts.find(p => p.id === id);
            if (!product) return;
            if (product.inStock) {
                showToast(`🛒 ${product.name} به سبد خرید اضافه شد!`);
            } else {
                showToast(`❌ ${product.name} در حال حاضر موجود نیست.`);
            }
        });
    });

    setupScrollAnimations();
}

function setupShopFilters() {
    const grid = $('products-grid');
    if (!grid) return;

    const searchInput = $('search-shop');
    const filterBtns = $all('#filter-buttons .filter-btn');

    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentShopFilter = btn.dataset.filter;
            renderShopProducts(currentShopFilter, searchInput?.value || '');
        });
    });

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            renderShopProducts(currentShopFilter, searchInput.value);
        });
    }

    renderShopProducts('all', '');
}

// ============================================
// SHOP MODAL
// ============================================
function setupShopModal() {
    const modal = $('shop-modal');
    const grid = $('products-grid');
    if (!modal || !grid) return;

    let currentProduct = null;

    grid.addEventListener('click', (e) => {
        const card = e.target.closest('.product-card');
        if (!card || e.target.closest('.shop-buy')) return;

        const id = parseInt(card.dataset.id, 10);
        const product = shopProducts.find(p => p.id === id);
        if (!product) return;

        currentProduct = product;
        const hasRank = !!product.isRankProduct;
        const rankColor = product.rankColor;

        $('shop-modal-icon').textContent = product.icon;
        $('shop-modal-name').textContent = product.name;
        $('shop-modal-category').textContent = getCategoryLabel(product.category);
        $('shop-modal-price').innerHTML = formatFullPrice(product.priceToman);
        $('shop-modal-desc').textContent = product.desc;

        const statusEl = $('shop-modal-status');
        statusEl.textContent = product.inStock ? 'موجود ✅' : 'ناموجود ❌';
        statusEl.className = product.inStock ? 'in-stock' : 'out-of-stock';

        // لیست امکانات رنک (فقط برای رنک‌ها) - مثل ranks.html
        const detailsEl = $('shop-modal-details');
        let featuresBlock = detailsEl.querySelector('.shop-modal-features-block');
        if (featuresBlock) featuresBlock.remove();

        if (hasRank && product.features) {
            featuresBlock = document.createElement('div');
            featuresBlock.className = 'shop-modal-features-block';
            featuresBlock.innerHTML = `
                <p><strong>✨ امکانات رنک:</strong></p>
                <ul class="rank-features">${product.features.map(f => `<li>✨ ${f}</li>`).join('')}</ul>
            `;
            const lastP = detailsEl.querySelector('p:last-child');
            if (lastP) lastP.after(featuresBlock);
            else detailsEl.appendChild(featuresBlock);
        }

        // رنگ نام رنک در مودال (مثل ranks.html)
        const titleEl = $('shop-modal-title');
        titleEl.style.color = hasRank ? rankColor : '';

        const buyBtn = $('shop-modal-buy');
        buyBtn.textContent = product.inStock ? '🛒 خرید محصول' : '⛔ ناموجود';
        buyBtn.disabled = !product.inStock;

        openModal(modal);
    });

    setupModalClose(modal);
    $('shop-modal-close')?.addEventListener('click', () => closeModal(modal));

    $('shop-modal-buy')?.addEventListener('click', () => {
        if (currentProduct) {
            if (currentProduct.inStock) {
                closeModal(modal);
                showToast(`🛒 ${currentProduct.name} به سبد خرید اضافه شد!`);
            } else {
                showToast(`❌ ${currentProduct.name} در حال حاضر موجود نیست.`);
            }
        }
    });
}

// ============================================
// RANKS RENDERING (ranks.html)
// ============================================
function renderRanks(search = '') {
    const grid = $('ranks-grid');
    if (!grid) return;

    let filtered = ranksData;
    if (search.trim()) {
        const q = search.trim().toLowerCase();
        filtered = filtered.filter(r =>
            r.name.toLowerCase().includes(q) ||
            r.features.some(f => f.toLowerCase().includes(q))
        );
    }

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div style="grid-column:1/-1;text-align:center;padding:60px 20px;">
                <div style="font-size:4rem;margin-bottom:16px;">🔍</div>
                <p style="color:var(--text-muted);font-size:1.1rem;">رنکی یافت نشد.</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = filtered.map(r => {
        const realIndex = ranksData.indexOf(r);
        return `
        <div class="rank-card ${r.popular ? 'popular' : ''} ${!r.inStock ? 'out-of-stock-rank' : ''} animate-on-scroll"
             data-index="${realIndex}"
             data-tier="${r.tier}">
            <div class="rank-tier-badge rank-tier-${r.tier}">${getTierLabel(r.tier)}</div>
            <div class="rank-name" style="color:${r.color}">
                <span class="rank-icon">${r.icon}</span>
                ${r.name}
            </div>
            ${formatFullPrice(r.priceToman)}
            <ul class="rank-features">${r.features.map(f => `<li>✨ ${f}</li>`).join('')}</ul>
            <div class="rank-status ${r.inStock ? 'in-stock' : 'out-of-stock'}">
                ${r.inStock ? '✅ موجود' : '⛔ ناموجود'}
            </div>
            <button class="btn btn-primary btn-sm rank-buy"
                    data-index="${realIndex}"
                    ${!r.inStock ? 'disabled' : ''}>
                ${r.inStock ? '🛒 خرید رنک' : '⛔ ناموجود'}
            </button>
        </div>
    `}).join('');

    $all('.rank-buy', grid).forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const index = parseInt(btn.dataset.index, 10);
            const rank = ranksData[index];
            if (!rank) return;
            if (rank.inStock) {
                showToast(`👑 رنک ${rank.name} به سبد خرید اضافه شد!`);
            } else {
                showToast(`❌ رنک ${rank.name} در حال حاضر موجود نیست.`);
            }
        });
    });

    setupScrollAnimations();
}

function setupRankFilters() {
    const grid = $('ranks-grid');
    if (!grid) return;

    const searchInput = $('search-ranks');
    const searchBtn = $('search-ranks-btn');

    if (searchInput) {
        searchInput.addEventListener('input', () => renderRanks(searchInput.value));
    }

    if (searchBtn) {
        searchBtn.addEventListener('click', () => renderRanks(searchInput?.value || ''));
    }

    renderRanks('');
}

// ============================================
// RANK MODAL (ranks.html)
// ============================================
function setupRankModal() {
    const modal = $('rank-modal');
    const grid = $('ranks-grid');
    if (!modal || !grid) return;

    let currentRankIndex = null;

    grid.addEventListener('click', (e) => {
        const card = e.target.closest('.rank-card');
        if (!card || e.target.closest('.rank-buy')) return;

        const index = parseInt(card.dataset.index, 10);
        const rank = ranksData[index];
        if (!rank) return;

        currentRankIndex = index;
        openRankModal(rank);
    });

    function openRankModal(rank) {
        $('rank-modal-icon').textContent = rank.icon;
        $('rank-modal-name').textContent = rank.name;
        $('rank-modal-price').innerHTML = formatFullPrice(rank.priceToman);

        const statusEl = $('rank-modal-status');
        if (statusEl) {
            statusEl.textContent = rank.inStock ? 'موجود ✅' : 'ناموجود ❌';
            statusEl.className = rank.inStock ? 'in-stock' : 'out-of-stock';
        }

        const featuresEl = $('rank-modal-features');
        if (featuresEl) {
            featuresEl.innerHTML = rank.features.map(f => `<li>✨ ${f}</li>`).join('');
        }

        const buyBtn = $('rank-modal-buy');
        if (buyBtn) {
            buyBtn.textContent = rank.inStock ? '🛒 خرید رنک' : '⛔ ناموجود';
            buyBtn.disabled = !rank.inStock;
        }

        openModal(modal);
    }

    setupModalClose(modal);
    $('rank-modal-close')?.addEventListener('click', () => closeModal(modal));

    $('rank-modal-buy')?.addEventListener('click', () => {
        if (currentRankIndex !== null) {
            const rank = ranksData[currentRankIndex];
            if (rank && rank.inStock) {
                closeModal(modal);
                showToast(`👑 خرید رنک ${rank.name} به زودی فعال می‌شود!`);
            } else if (rank) {
                showToast(`❌ رنک ${rank.name} در حال حاضر موجود نیست.`);
            }
        }
    });
}

// ============================================
// POINT SHOP
// ============================================
const pointProducts = [
    { name: '۵۰۰۰ سکه', icon: '💰', priceToman: 15000, desc: 'شارژ کیف پول', inStock: true },
    { name: 'رنک VIP (۱ روزه)', icon: '👑', priceToman: 30000, desc: 'دسترسی VIP به مدت ۱ روز', inStock: true },
];

function renderPointProducts(search = '') {
    const grid = $('point-products');
    if (!grid) return;

    let filtered = pointProducts;
    if (search.trim()) {
        const q = search.trim().toLowerCase();
        filtered = filtered.filter(p =>
            p.name.toLowerCase().includes(q) ||
            p.desc.toLowerCase().includes(q)
        );
    }

    if (filtered.length === 0) {
        grid.innerHTML = `<p style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:40px 0;">محصولی یافت نشد.</p>`;
        return;
    }

    grid.innerHTML = filtered.map(p => `
        <div class="product-card animate-on-scroll">
            <div class="product-icon">${p.icon}</div>
            <h4>${p.name}</h4>
            <p class="product-desc">${p.desc}</p>
            ${formatFullPrice(p.priceToman)}
            <p class="product-status ${p.inStock ? 'in-stock' : 'out-of-stock'}">
                ${p.inStock ? 'موجود ✅' : 'ناموجود ❌'}
            </p>
            <button class="btn btn-secondary btn-sm point-buy"
                    data-name="${p.name}"
                    ${!p.inStock ? 'disabled' : ''}>
                ${p.inStock ? 'خرید' : 'ناموجود'}
            </button>
        </div>
    `).join('');

    $all('.point-buy', grid).forEach(btn => {
        btn.addEventListener('click', () => {
            if (!btn.disabled) showToast(`⭐ ${btn.dataset.name} با Point خریداری شد!`);
        });
    });

    setupScrollAnimations();
}

function setupPointSearch() {
    const searchInput = $('search-points');
    if (!searchInput) return;
    searchInput.addEventListener('input', () => renderPointProducts(searchInput.value));
    renderPointProducts('');
}

// ============================================
// GAMEMODES
// ============================================
const gamemodesData = [
    {
        id: 'survival',
        icon: '🌲',
        title: 'Survival',
        category: 'survival',
        description: 'یک تجربه Survival حرفه‌ای با اقتصاد پویا، شاپ پیشرفته، مأموریت‌های روزانه و امکانات اختصاصی.',
        features: [
            'اقتصاد پویا و پیشرفته',
            'شاپ اختصاصی با محصولات متنوع',
            'مأموریت‌های روزانه و هفتگی',
            'سیستم دوستان و کلن‌ها',
            'مینی‌گیم‌های جانبی',
            'سیستم رنکینگ پیشرفته',
            'پشتیبانی ۲۴/۷'
        ],
        players: 247,
        status: 'active',
        bgColor: 'linear-gradient(145deg, #1a3a1a, #0d260d)'
    }
];

let currentGamemodeFilter = 'all';

function renderGamemodes(filter = 'all', search = '') {
    const grid = $('gm-grid');
    if (!grid) return;

    let filtered = gamemodesData;
    if (filter !== 'all') filtered = filtered.filter(g => g.category === filter);
    if (search.trim()) {
        const q = search.trim().toLowerCase();
        filtered = filtered.filter(g =>
            g.title.toLowerCase().includes(q) ||
            g.description.toLowerCase().includes(q)
        );
    }

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div style="grid-column:1/-1;text-align:center;padding:60px 20px;">
                <div style="font-size:4rem;margin-bottom:16px;">🔍</div>
                <p style="color:var(--text-muted);font-size:1.1rem;">گیم‌مودی یافت نشد.</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = filtered.map(g => `
        <div class="gm-card animate-on-scroll" data-gamemode="${g.id}" data-category="${g.category}">
            <div class="gm-card-bg" style="background: ${g.bgColor};"></div>
            <div class="gm-card-content">
                <div class="gm-icon">${g.icon}</div>
                <h3>${g.title}</h3>
                <p>${g.description}</p>
                <div class="gm-meta">
                    <span class="gm-players">👥 ${g.players.toLocaleString('fa-IR')} نفر</span>
                    <span class="gm-status ${g.status === 'active' ? 'status-active' : 'status-coming'}">
                        ${g.status === 'active' ? '🟢 فعال' : '🔜 به زودی'}
                    </span>
                </div>
                <button class="btn btn-primary gm-info-btn" data-gamemode="${g.id}">
                    📋 اطلاعات بیشتر
                </button>
            </div>
        </div>
    `).join('');

    $all('.gm-info-btn', grid).forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const gm = gamemodesData.find(g => g.id === btn.dataset.gamemode);
            if (gm) openGamemodeModal(gm);
        });
    });

    $all('.gm-card', grid).forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.closest('.btn')) return;
            const gm = gamemodesData.find(g => g.id === card.dataset.gamemode);
            if (gm) openGamemodeModal(gm);
        });
    });

    setupScrollAnimations();
}

function openGamemodeModal(gamemode) {
    const modal = $('gm-modal');
    if (!modal) return;

    $('gm-modal-icon').textContent = gamemode.icon;
    $('gm-modal-title').textContent = gamemode.title;
    $('gm-modal-description').textContent = gamemode.description;
    $('gm-modal-players').textContent = gamemode.players.toLocaleString('fa-IR');

    const statusEl = $('gm-modal-status');
    if (gamemode.status === 'active') {
        statusEl.textContent = '🟢 فعال';
        statusEl.className = 'in-stock';
    } else {
        statusEl.textContent = '🔜 به زودی';
        statusEl.className = 'out-of-stock';
    }

    $('gm-modal-features-list').innerHTML = gamemode.features.map(f => `<li>✨ ${f}</li>`).join('');

    const joinBtn = $('gm-modal-join');
    if (gamemode.status === 'active') {
        joinBtn.textContent = '🎮 ورود به گیم‌مود';
        joinBtn.disabled = false;
        joinBtn.onclick = () => {
            closeModal(modal);
            showToast(`🎮 در حال ورود به ${gamemode.title} ...`);
        };
    } else {
        joinBtn.textContent = '🔜 به زودی';
        joinBtn.disabled = true;
        joinBtn.onclick = null;
    }

    openModal(modal);
}

function setupGamemodeFilters() {
    const grid = $('gm-grid');
    if (!grid) return;

    const modal = $('gm-modal');
    if (modal) {
        setupModalClose(modal);
        $('gm-modal-close')?.addEventListener('click', () => closeModal(modal));
    }

    const searchInput = $('search-gamemodes');
    const filterBtns = $all('#gm-filter-buttons .filter-btn');

    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentGamemodeFilter = btn.dataset.filter;
            renderGamemodes(currentGamemodeFilter, searchInput?.value || '');
        });
    });

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            renderGamemodes(currentGamemodeFilter, searchInput.value);
        });
    }

    renderGamemodes('all', '');
}

// ============================================
// HOME SEARCH
// ============================================
function setupSearch() {
    const searchInput = $('search-home');
    const searchBtn = $('search-home-btn');
    const resultsContainer = $('search-results');

    if (!searchInput || !resultsContainer) return;

    const searchData = [
        { title: 'عملکرد مناسب', desc: 'تجربه‌ای روان و پایدار', icon: '⚡', url: '#features', keywords: ['پینگ', 'پایین', 'عملکرد', 'مناسب', 'روان', 'پایدار'] },
        { title: 'امنیت بالا', desc: 'سیستم ضدحک و محافظت از اطلاعات', icon: '🛡️', url: '#features', keywords: ['امنیت', 'بالا', 'ضدحک', 'محافظت', 'اطلاعات'] },
        { title: 'گیم‌مودهای متنوع', desc: 'Survival', icon: '🎮', url: 'gamemodes.html', keywords: ['گیم‌مود', 'متنوع', 'survival', 'بازی'] },
        { title: 'سیستم رنکینگ', desc: 'رنک‌های اختصاصی با امکانات ویژه', icon: '👑', url: 'ranks.html', keywords: ['رنک', 'رنکینگ', 'اختصاصی', 'امکانات', 'ویژه'] },
        { title: 'Survival', desc: 'اقتصاد، شاپ، مأموریت', icon: '🌲', url: 'gamemodes.html', keywords: ['survival', 'اقتصاد', 'شاپ', 'مأموریت'] },
        { title: 'فروشگاه CoinCraft', desc: 'خرید رنک، سکه، امتیاز، کلید و...', icon: '🛒', url: 'shop.html', keywords: ['فروشگاه', 'خرید', 'رنک', 'سکه', 'امتیاز', 'کلید'] },
        { title: 'رنک‌های CoinCraft', desc: 'VIP تا COINCRAFT++', icon: '👑', url: 'ranks.html', keywords: ['رنک', 'vip', 'mvp', 'legend', 'king'] },
        { title: 'خانه', desc: 'صفحه اصلی CoinCraft', icon: '🏠', url: 'index.html', keywords: ['خانه', 'صفحه اصلی'] },
        { title: 'گیم‌مودها', desc: 'همه گیم‌مودهای سرور', icon: '🎮', url: 'gamemodes.html', keywords: ['گیم‌مود', 'بازی'] },
        { title: 'رنک‌ها', desc: 'خرید رنک و امکانات ویژه', icon: '👑', url: 'ranks.html', keywords: ['رنک', 'vip', 'mvp'] }
    ];

    function performSearch(query) {
        if (!query.trim()) {
            resultsContainer.classList.remove('active');
            return;
        }

        const q = query.trim().toLowerCase();
        const results = searchData.filter(item =>
            item.title.toLowerCase().includes(q) ||
            item.desc.toLowerCase().includes(q) ||
            item.keywords.some(k => k.toLowerCase().includes(q))
        );

        if (results.length === 0) {
            resultsContainer.innerHTML = `
                <div class="search-result-empty">
                    <span class="empty-icon">🔍</span>
                    <p>نتیجه‌ای برای "<strong>${query}</strong>" یافت نشد.</p>
                </div>
            `;
        } else {
            resultsContainer.innerHTML = results.map(item => `
                <a href="${item.url}" class="search-result-item">
                    <span class="search-result-icon">${item.icon}</span>
                    <div>
                        <div class="search-result-title">${item.title}</div>
                        <div class="search-result-desc">${item.desc}</div>
                    </div>
                </a>
            `).join('');
        }

        resultsContainer.classList.add('active');
    }

    searchBtn?.addEventListener('click', () => performSearch(searchInput.value));

    searchInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') performSearch(searchInput.value);
    });

    let searchTimeout;
    searchInput?.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => performSearch(searchInput.value), 300);
    });

    document.addEventListener('click', (e) => {
        const searchContainer = document.querySelector('.search-container');
        if (searchContainer && !searchContainer.contains(e.target)) {
            resultsContainer.classList.remove('active');
        }
    });
}

// ============================================
// SOCIAL LINKS
// ============================================
function setupSocialLinks() {
    $all('[data-social]').forEach(el => {
        const key = el.dataset.social;
        const url = CONFIG.SOCIAL_LINKS[key];

        const isValid = url && url.trim() !== '' && (url.startsWith('http://') || url.startsWith('https://'));

        if (isValid) {
            el.href = url;
            el.target = '_blank';
            el.rel = 'noopener';
            el.classList.remove('disabled');
        } else {
            el.removeAttribute('href');
            el.classList.add('disabled');
            el.title = 'لینک در حال تنظیم';
            el.addEventListener('click', (e) => e.preventDefault());
        }
    });
}

// ============================================
// 404 GLITCH TERMINAL
// ============================================
function setup404Terminal() {
    const textEl = document.getElementById('terminal-text');
    if (!textEl) return;

    const randomBtn = document.getElementById('glitch-random');

    const messages = [
        'ERROR_404: PAGE_NOT_FOUND',
        'FATAL: SIGNAL_LOST',
        'WARN: BLOCK_NOT_LOADED',
        'ERR: CHUNK_NOT_FOUND',
        'ERROR: WORLD_CORRUPTED',
        'SEARCHING... NULL_POINTER',
        '0x00000000: ACCESS_DENIED',
        'REALITY_GLITCH: PAGE_MISSING'
    ];

    let index = 0;
    const intervalId = setInterval(() => {
        if (!document.body.contains(textEl)) {
            clearInterval(intervalId);
            return;
        }
        index = (index + 1) % messages.length;
        textEl.textContent = messages[index];
    }, 3000);

    if (randomBtn) {
        randomBtn.addEventListener('click', () => {
            document.body.classList.add('glitch-burst');
            showToast('⚡ گلیچ فعال شد!', 1500);

            setTimeout(() => {
                document.body.classList.remove('glitch-burst');
            }, 800);

            textEl.textContent = messages[Math.floor(Math.random() * messages.length)];

            const errorContent = document.querySelector('.error-content');
            if (errorContent) {
                errorContent.style.transform = `translate(${Math.random() * 10 - 5}px, ${Math.random() * 10 - 5}px)`;
                setTimeout(() => {
                    errorContent.style.transform = '';
                }, 200);
            }
        });
    }
}

// ============================================
// INIT
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    hideLoadingScreen();
    setupCopyButtons();
    setupThemeToggle();
    setupMobileMenu();
    createParticles();
    setupBackToTop();
    setupEventNotification();
    setupStartPlaying();
    setupShopFilters();
    setupShopModal();
    setupRankFilters();
    setupRankModal();
    setupGamemodeFilters();
    setupPointSearch();
    setupSocialLinks();
    setupSearch();
    setup404Terminal();

    requestAnimationFrame(() => {
        setupScrollAnimations();
    });

    startStatusRefresh();

    const refreshBtn = $('refresh-status-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            refreshBtn.classList.add('spinning');
            fetchServerStatus();
            setTimeout(() => refreshBtn.classList.remove('spinning'), 2000);
        });
    }

    setTimeout(() => showToast('🚀 به CoinCraft خوش آمدی!', 2500), 800);
});