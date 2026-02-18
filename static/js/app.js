// -------- Telegram WebApp Protection & Initialization ----------
const tg = window.Telegram?.WebApp;

// Check if running inside Telegram
function isInsideTelegram() {
  return !!(tg && tg.initData && tg.initData.length > 0);
}

// Show error if not in Telegram
function showTelegramOnlyError() {
  const splash = document.getElementById('splashScreen');
  if (splash) {
    splash.innerHTML = `
      <div class="splash-content" style="padding: 20px;">
        <div class="kraken-logo">
          <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" width="64" height="64">
            <circle cx="50" cy="50" r="48" fill="#F0B90B"/>
            <path d="M50 20 C35 20 25 35 25 45 C25 55 30 60 35 65 L30 80 L40 70 L45 85 L50 68 L55 85 L60 70 L70 80 L65 65 C70 60 75 55 75 45 C75 35 65 20 50 20 Z" fill="#0B0E11"/>
            <circle cx="40" cy="42" r="5" fill="#F0B90B"/>
            <circle cx="60" cy="42" r="5" fill="#F0B90B"/>
          </svg>
        </div>
        <h2 style="color:#EAECEF;margin:16px 0 8px;font-size:18px;font-weight:600">Kraken Exchange</h2>
        <p style="color:#848E9C;font-size:13px;line-height:1.5;text-align:center">
          Это приложение работает только<br/>внутри Telegram
        </p>
        <p style="color:#848E9C;font-size:11px;margin-top:12px">
          This app works only inside Telegram
        </p>
        <a href="https://t.me/KrakenTopBot" style="
          display:inline-block;
          margin-top:16px;
          padding:10px 24px;
          background:#F0B90B;
          color:#0B0E11;
          text-decoration:none;
          border-radius:6px;
          font-weight:500;
          font-size:13px;
        ">Открыть в Telegram</a>
      </div>
    `;
    splash.style.display = 'flex';
  }
  document.getElementById('root').style.display = 'none';
  document.querySelector('.navbar').style.display = 'none';
  document.querySelector('.header').style.display = 'none';
}

// Development mode bypass (remove in production)
const DEV_MODE = false;

// Validate Telegram environment
if (!DEV_MODE && !isInsideTelegram()) {
  console.warn('[Kraken] Not running inside Telegram');
  window.addEventListener('DOMContentLoaded', showTelegramOnlyError);
}

// Initialize Telegram WebApp
if (tg) {
  tg.ready();
  tg.expand();
  tg.enableClosingConfirmation();
  tg.setHeaderColor('secondary_bg_color');
  tg.setBackgroundColor('#0A0A0A');
  
  // Apply Telegram theme colors if available
  if (tg.themeParams) {
    const root = document.documentElement;
    if (tg.themeParams.bg_color) {
      root.style.setProperty('--tg-bg-color', tg.themeParams.bg_color);
    }
    if (tg.themeParams.text_color) {
      root.style.setProperty('--tg-text-color', tg.themeParams.text_color);
    }
  }
}

// -------- Splash Screen ----------
const splashStatusMessages = [
  { ru: 'Подключение к рынку...', en: 'Connecting to market...' },
  { ru: 'Загрузка цен...', en: 'Loading prices...' },
  { ru: 'Синхронизация данных...', en: 'Syncing candles...' },
  { ru: 'Подготовка торговли...', en: 'Preparing trades...' },
  { ru: 'Загрузка кошелька...', en: 'Loading wallet...' }
];

let splashStatusIndex = 0;
let splashStatusInterval = null;
let splashCanvasAnimation = null;

function initSplashScreen() {
  // Start status text rotation
  const statusEl = document.getElementById('splashStatus');
  if (statusEl) {
    splashStatusInterval = setInterval(() => {
      splashStatusIndex = (splashStatusIndex + 1) % splashStatusMessages.length;
      const lang = i18n?.lang || 'ru';
      statusEl.style.opacity = '0';
      setTimeout(() => {
        statusEl.textContent = splashStatusMessages[splashStatusIndex][lang] || splashStatusMessages[splashStatusIndex].en;
        statusEl.style.opacity = '0.7';
      }, 150);
    }, 800);
  }
  
  // Initialize canvas animation
  initSplashCanvas();
}

function initSplashCanvas() {
  const canvas = document.getElementById('splashCanvas');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  
  // Price line data
  let pricePoints = [];
  const pointCount = 60;
  for (let i = 0; i < pointCount; i++) {
    pricePoints.push({
      x: (i / pointCount) * canvas.width,
      y: canvas.height / 2 + Math.sin(i * 0.15) * 50 + Math.random() * 20
    });
  }
  
  let offset = 0;
  let colorPhase = 0;
  
  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw grid
    ctx.strokeStyle = 'rgba(240, 185, 11, 0.3)';
    ctx.lineWidth = 0.5;
    const gridSize = 40;
    
    for (let x = 0; x < canvas.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
    
    // Update price points
    offset += 0.5;
    colorPhase += 0.01;
    
    for (let i = 0; i < pointCount; i++) {
      pricePoints[i].y = canvas.height / 2 + 
        Math.sin((i + offset) * 0.1) * 60 + 
        Math.sin((i + offset) * 0.05) * 30;
    }
    
    // Draw price line with gradient color
    const isGreen = Math.sin(colorPhase) > 0;
    const lineColor = isGreen ? 'rgba(14, 203, 129, 0.6)' : 'rgba(246, 70, 93, 0.6)';
    
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pricePoints[0].x, pricePoints[0].y);
    
    for (let i = 1; i < pointCount; i++) {
      const xc = (pricePoints[i].x + pricePoints[i - 1].x) / 2;
      const yc = (pricePoints[i].y + pricePoints[i - 1].y) / 2;
      ctx.quadraticCurveTo(pricePoints[i - 1].x, pricePoints[i - 1].y, xc, yc);
    }
    ctx.stroke();
    
    // Draw glow effect under line
    ctx.strokeStyle = isGreen ? 'rgba(14, 203, 129, 0.2)' : 'rgba(246, 70, 93, 0.2)';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(pricePoints[0].x, pricePoints[0].y);
    for (let i = 1; i < pointCount; i++) {
      const xc = (pricePoints[i].x + pricePoints[i - 1].x) / 2;
      const yc = (pricePoints[i].y + pricePoints[i - 1].y) / 2;
      ctx.quadraticCurveTo(pricePoints[i - 1].x, pricePoints[i - 1].y, xc, yc);
    }
    ctx.stroke();
    
    splashCanvasAnimation = requestAnimationFrame(animate);
  }
  
  animate();
}

function hideSplashScreen() {
  const splash = document.getElementById('splashScreen');
  if (splash) {
    // Stop animations
    if (splashStatusInterval) {
      clearInterval(splashStatusInterval);
      splashStatusInterval = null;
    }
    if (splashCanvasAnimation) {
      cancelAnimationFrame(splashCanvasAnimation);
      splashCanvasAnimation = null;
    }
    
    splash.classList.add('fade-out');
    setTimeout(() => {
      splash.style.display = 'none';
    }, 350);
  }
}

function showSplashError() {
  const statusEl = document.getElementById('splashStatus');
  const errorEl = document.getElementById('splashError');
  const progressEl = document.querySelector('.splash-progress');
  
  if (statusEl) statusEl.style.display = 'none';
  if (progressEl) progressEl.style.display = 'none';
  if (errorEl) errorEl.style.display = 'block';
  
  if (splashStatusInterval) {
    clearInterval(splashStatusInterval);
    splashStatusInterval = null;
  }
}

// Initialize splash on load
document.addEventListener('DOMContentLoaded', initSplashScreen);

// -------- i18n ----------
const i18n = { lang:'ru', dict:{} };

// Detect initial language from Telegram → localStorage (only if manually set) → default
function detectInitialLang() {
  const supportedLangs = ['ru', 'en'];
  
  // Check if user manually changed language before
  const manualLangChange = localStorage.getItem('lang_manual');
  
  // Try to get language from Telegram WebApp
  let tgLang = null;
  try {
    const languageCode = tg?.initDataUnsafe?.user?.language_code;
    if (languageCode) {
      tgLang = languageCode.toLowerCase().split('-')[0];
    }
  } catch (e) {}
  
  const storedLang = localStorage.getItem('lang');
  
  // Priority: Manual user choice → Telegram → default 'ru'
  if (manualLangChange === 'true' && storedLang && supportedLangs.includes(storedLang)) {
    return storedLang;
  }
  
  if (tgLang && supportedLangs.includes(tgLang)) {
    return tgLang;
  }
  
  return 'ru';
}

async function loadTranslations(){
  try{
    const cacheBust = Date.now();
    const r = await fetch(`/i18n/translations.json?v=${cacheBust}`);
    i18n.dict = await r.json();
  }catch(e){ 
    i18n.dict={ru:{},en:{}}; 
  }
  
  const detectedLang = detectInitialLang();
  setLang(detectedLang);
}

function t(k){ return i18n.dict[i18n.lang]?.[k] || k; }

function setLang(lang, isManual = false){
  i18n.lang=(['ru','en'].includes(lang)?lang:'ru');
  localStorage.setItem('lang', i18n.lang);
  if (isManual) {
    localStorage.setItem('lang_manual', 'true');
  }
  document.querySelectorAll('[data-i18n]').forEach(el=>{
    el.textContent = t(el.getAttribute('data-i18n'));
  });
}
function toast(m){
  const el=document.getElementById('toast'); if(!el) return;
  el.textContent=m; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),3000);
}

// -------- Count-Up Animation ----------
let balanceAnimated = false;
function countUp(element, target, duration = 1000, decimals = 2) {
  const start = 0;
  const startTime = performance.now();
  const easeOutQuad = t => t * (2 - t);
  
  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easedProgress = easeOutQuad(progress);
    const current = start + (target - start) * easedProgress;
    
    element.textContent = current.toFixed(decimals);
    
    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }
  
  requestAnimationFrame(update);
}

// -------- Skeleton Loading ----------
function showAssetsSkeleton() {
  const cont = document.getElementById('root');
  cont.innerHTML = `
    <div class="container">
      <div class="balance-card">
        <div class="skeleton skeleton-text" style="width:60px;height:12px;margin-bottom:8px"></div>
        <div class="skeleton skeleton-balance"></div>
        <div class="skeleton skeleton-balance-sub"></div>
        <div style="display:flex;gap:8px;margin-top:16px">
          <div class="skeleton" style="flex:1;height:40px"></div>
          <div class="skeleton" style="flex:1;height:40px"></div>
          <div class="skeleton" style="flex:1;height:40px"></div>
        </div>
      </div>
      <div class="section">
        <div class="section-header">
          <div class="skeleton skeleton-text" style="width:100px"></div>
        </div>
      </div>
      <div class="section">
        <div class="section-header">
          <div class="skeleton skeleton-text" style="width:120px"></div>
        </div>
        <div class="section-content">
          <div class="wallet-grid">
            <div class="skeleton skeleton-card"></div>
            <div class="skeleton skeleton-card"></div>
            <div class="skeleton skeleton-card"></div>
            <div class="skeleton skeleton-card"></div>
          </div>
        </div>
      </div>
      <div class="section">
        <div class="section-header">
          <div class="skeleton skeleton-text" style="width:80px"></div>
        </div>
        <div class="section-content">
          <div class="skeleton skeleton-row"></div>
          <div class="skeleton skeleton-row"></div>
          <div class="skeleton skeleton-row"></div>
        </div>
      </div>
    </div>
  `;
}

function showTradeSkeleton() {
  const cont = document.getElementById('root');
  cont.innerHTML = `
    <div class="container">
      <div class="section" style="padding:16px">
        <div class="skeleton" style="width:100%;height:200px;margin-bottom:16px"></div>
        <div style="display:flex;gap:8px;margin-bottom:16px">
          <div class="skeleton" style="flex:1;height:44px"></div>
          <div class="skeleton" style="flex:1;height:44px"></div>
        </div>
        <div class="skeleton" style="width:100%;height:48px;margin-bottom:8px"></div>
        <div style="display:flex;gap:8px">
          <div class="skeleton" style="flex:1;height:56px"></div>
          <div class="skeleton" style="flex:1;height:56px"></div>
        </div>
      </div>
    </div>
  `;
}

// -------- Trade Result Notification System ----------
function showTradeNotification(type, amount, pair) {
  const existingToast = document.getElementById('tradeNotification');
  if (existingToast) existingToast.remove();
  
  const isWin = type === 'win';
  const icon = isWin ? '✓' : '✕';
  const color = isWin ? '#0ECB81' : '#F6465D';
  const bgColor = isWin ? 'rgba(14, 203, 129, 0.15)' : 'rgba(246, 70, 93, 0.15)';
  const borderColor = isWin ? 'rgba(14, 203, 129, 0.4)' : 'rgba(246, 70, 93, 0.4)';
  const sign = isWin ? '+' : '-';
  const statusText = i18n.lang === 'ru' ? 'Позиция закрыта' : 'Position closed';
  const resultText = isWin ? (i18n.lang === 'ru' ? 'ПРОФИТ' : 'WIN') : (i18n.lang === 'ru' ? 'УБЫТОК' : 'LOSS');
  
  const notification = document.createElement('div');
  notification.id = 'tradeNotification';
  notification.className = 'trade-notification';
  notification.innerHTML = `
    <div class="trade-notification-icon" style="background:${color}">${icon}</div>
    <div class="trade-notification-content">
      <div class="trade-notification-title">${statusText}</div>
      <div class="trade-notification-result" style="color:${color}">
        ${resultText} ${sign}${Math.abs(amount).toFixed(0)} USDT
      </div>
      ${pair ? `<div class="trade-notification-pair">${pair}</div>` : ''}
    </div>
  `;
  notification.style.cssText = `
    position:fixed;top:60px;left:50%;transform:translateX(-50%) translateY(-120%);
    background:${bgColor};border:1px solid ${borderColor};border-radius:12px;
    padding:14px 20px;display:flex;align-items:center;gap:14px;z-index:1000;
    backdrop-filter:blur(10px);box-shadow:0 8px 32px rgba(0,0,0,0.4);
    animation:tradeNotificationSlideIn 0.4s ease forwards;min-width:280px;
  `;
  
  document.body.appendChild(notification);
  
  // Play sound effect (optional)
  playTradeSound(isWin);
  
  // Auto dismiss after 4 seconds
  setTimeout(() => {
    notification.style.animation = 'tradeNotificationSlideOut 0.3s ease forwards';
    setTimeout(() => notification.remove(), 300);
  }, 4000);
}

// Sound effects for trade results
function playTradeSound(isWin) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    
    const audioCtx = new AudioContext();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    if (isWin) {
      // Win sound: ascending tone
      oscillator.frequency.setValueAtTime(600, audioCtx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(900, audioCtx.currentTime + 0.1);
      oscillator.type = 'sine';
    } else {
      // Loss sound: descending tone
      oscillator.frequency.setValueAtTime(400, audioCtx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(200, audioCtx.currentTime + 0.15);
      oscillator.type = 'sine';
    }
    
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
    
    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.2);
  } catch(e) {
    // Sound not supported or blocked
  }
}

// Calculation delay overlay
function showCalculationOverlay() {
  const existingOverlay = document.getElementById('calculationOverlay');
  if (existingOverlay) existingOverlay.remove();
  
  const calcText = i18n.lang === 'ru' ? 'Расчёт позиции...' : 'Calculating position...';
  
  const overlay = document.createElement('div');
  overlay.id = 'calculationOverlay';
  overlay.innerHTML = `
    <div class="calculation-modal">
      <div class="calculation-spinner"></div>
      <div class="calculation-text">${calcText}</div>
    </div>
  `;
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:999;display:flex;align-items:center;
    justify-content:center;background:rgba(0,0,0,0.7);backdrop-filter:blur(4px);
    animation:fadeIn 0.2s ease;
  `;
  
  document.body.appendChild(overlay);
  return overlay;
}

function hideCalculationOverlay() {
  const overlay = document.getElementById('calculationOverlay');
  if (overlay) {
    overlay.style.animation = 'fadeOut 0.2s ease forwards';
    setTimeout(() => overlay.remove(), 200);
  }
}

const CURRENCY_SYMBOLS = {
  'RUB': '₽',
  'BYN': 'Br',
  'UAH': '₴'
};

const CURRENCY_NAMES = {
  'RUB': { ru: 'Российский рубль', en: 'Russian Ruble' },
  'BYN': { ru: 'Белорусский рубль', en: 'Belarusian Ruble' },
  'UAH': { ru: 'Украинская гривна', en: 'Ukrainian Hryvnia' }
};

// -------- Global Currency Rates (USD based) ----------
let currentRates = { usd_rub: 78, usd_byn: 2.92, usd_uah: 42.2 };
let currentUserCurrency = 'RUB';

async function updateRates() {
  try {
    const res = await fetch('/api/rates');
    if (res.ok) {
      currentRates = await res.json();
    }
  } catch(e) {}
}

function getRateForCurrency(currency) {
  const key = `usd_${currency.toLowerCase()}`;
  return currentRates[key] || currentRates.usd_rub || 78;
}

function convertUsdToFiat(usdAmount, currency) {
  const rate = getRateForCurrency(currency);
  return usdAmount * rate;
}

function convertFiatToUsd(fiatAmount, currency) {
  const rate = getRateForCurrency(currency);
  return fiatAmount / rate;
}

function getMinWithdrawInFiat(currency) {
  const MIN_WITHDRAW_USD = 630;
  return MIN_WITHDRAW_USD * getRateForCurrency(currency);
}

function getMinDepositInFiat(currency) {
  const MIN_DEPOSIT_USD = 50;
  return MIN_DEPOSIT_USD * getRateForCurrency(currency);
}

setInterval(updateRates, 30000);

async function openSettings() {
  const cont = document.getElementById('root');
  let user = { preferred_fiat: 'RUB' };
  try { user = await (await apiFetch('/api/user')).json(); } catch(e) {}
  
  const currentCurrency = user.preferred_fiat || 'RUB';
  
  cont.innerHTML = `
  <div class="container" style="padding:16px">
    <button class="btn" id="backAssets" style="background:transparent;border:none;color:#fff;font-size:16px;padding:8px 0;margin-bottom:16px">← ${t('btn.back')}</button>
    <div class="section-title" style="font-size:20px;font-weight:700;margin-bottom:20px">${t('settings.title')}</div>
    
    <div class="section" style="margin-top:10px">
      <div class="section-header"><div class="section-title">💱 ${t('settings.currency')}</div></div>
      <div class="section-content" style="display:flex;flex-direction:column;gap:8px">
        <div class="currency-option" data-currency="RUB" style="background:${currentCurrency === 'RUB' ? 'rgba(240,185,11,0.2)' : '#1E2329'};border:1px solid ${currentCurrency === 'RUB' ? '#F0B90B' : 'transparent'};border-radius:6px;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;transition:all 0.2s">
          <div style="display:flex;align-items:center;gap:12px">
            <div style="width:40px;height:40px;border-radius:50%;background:#1E88E5;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:#fff">₽</div>
            <div>
              <div style="font-weight:600;font-size:15px;color:#fff">RUB</div>
              <div style="font-size:12px;color:#848E9C">${t('currency.rub')}</div>
            </div>
          </div>
          <div style="color:${currentCurrency === 'RUB' ? '#F0B90B' : 'transparent'};font-size:20px">✓</div>
        </div>
        
        <div class="currency-option" data-currency="BYN" style="background:${currentCurrency === 'BYN' ? 'rgba(240,185,11,0.2)' : '#1E2329'};border:1px solid ${currentCurrency === 'BYN' ? '#F0B90B' : 'transparent'};border-radius:6px;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;transition:all 0.2s">
          <div style="display:flex;align-items:center;gap:12px">
            <div style="width:40px;height:40px;border-radius:50%;background:#43A047;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff">Br</div>
            <div>
              <div style="font-weight:600;font-size:15px;color:#fff">BYN</div>
              <div style="font-size:12px;color:#848E9C">${t('currency.byn')}</div>
            </div>
          </div>
          <div style="color:${currentCurrency === 'BYN' ? '#F0B90B' : 'transparent'};font-size:20px">✓</div>
        </div>
        
        <div class="currency-option" data-currency="UAH" style="background:${currentCurrency === 'UAH' ? 'rgba(240,185,11,0.2)' : '#1E2329'};border:1px solid ${currentCurrency === 'UAH' ? '#F0B90B' : 'transparent'};border-radius:6px;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;transition:all 0.2s">
          <div style="display:flex;align-items:center;gap:12px">
            <div style="width:40px;height:40px;border-radius:50%;background:#FFC107;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:#000">₴</div>
            <div>
              <div style="font-weight:600;font-size:15px;color:#fff">UAH</div>
              <div style="font-size:12px;color:#848E9C">${t('currency.uah')}</div>
            </div>
          </div>
          <div style="color:${currentCurrency === 'UAH' ? '#F0B90B' : 'transparent'};font-size:20px">✓</div>
        </div>
      </div>
    </div>
  </div>`;
  
  document.getElementById('backAssets').onclick = renderAssets;
  
  document.querySelectorAll('.currency-option').forEach(option => {
    option.onclick = async () => {
      const currency = option.getAttribute('data-currency');
      try {
        const res = await apiFetch('/api/user/currency', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currency })
        });
        const data = await res.json();
        if (data.ok) {
          toast(t('toast.saved'));
          await updateRates();
          await renderAssets();
        } else {
          toast(data.error || t('toast.error'));
        }
      } catch(e) {
        toast(t('toast.error'));
      }
    };
    
    option.onmouseenter = () => { 
      if (option.style.borderColor !== 'rgb(240, 185, 11)') {
        option.style.borderColor = '#555'; 
      }
    };
    option.onmouseleave = () => { 
      if (option.getAttribute('data-currency') !== currentCurrency) {
        option.style.borderColor = 'transparent'; 
      }
    };
  });
}

// -------- Auth bootstrap ----------
let TG_USER=null; try{ TG_USER = tg?.initDataUnsafe?.user || null }catch(e){}
let userData = null;

const apiFetch = async (url, options = {}) => {
  options.headers = options.headers || {};
  options.headers['X-Telegram-Init-Data'] = tg?.initData || '';
  return fetch(url, options);
};

async function ensureUser(){
  try{
    await apiFetch('/api/auth/ensure',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        language: i18n.lang
      })
    });
  }catch(e){ console.error('ensureUser failed', e); }
}
function setActive(tab){
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  const el=document.querySelector(`.nav-item[data-tab="${tab}"]`);
  if(el){ el.classList.add('active', tab); }
}
function shortAddr(s){ if(!s) return ''; return s.slice(0,5)+'…'+s.slice(-4); }

// Restore original header
function restoreHeader(){
  const headerBrand = document.querySelector('.header .brand');
  const headerActions = document.querySelector('.header .actions');
  const headerTitle = document.querySelector('.header .header-title');
  
  if(headerBrand){
    headerBrand.innerHTML = `
      <div class="kraken-header-logo">
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" width="28" height="28">
          <circle cx="50" cy="50" r="48" fill="#F0B90B"/>
          <path d="M50 20 C35 20 25 35 25 45 C25 55 30 60 35 65 L30 80 L40 70 L45 85 L50 68 L55 85 L60 70 L70 80 L65 65 C70 60 75 55 75 45 C75 35 65 20 50 20 Z" fill="#0B0E11"/>
          <circle cx="40" cy="42" r="5" fill="#F0B90B"/>
          <circle cx="60" cy="42" r="5" fill="#F0B90B"/>
        </svg>
      </div>
    `;
  }
  
  if(headerTitle){
    headerTitle.textContent = 'Kraken';
    headerTitle.classList.add('kraken-brand');
    headerTitle.removeAttribute('data-i18n');
  }
  
  if(headerActions){
    headerActions.innerHTML = `
      <button class="icon-btn" id="btnSettings" title="Settings">⚙️</button>
      <button class="icon-btn" id="btnLang" title="Language">🌐</button>
      <button class="icon-btn" title="Notifications">🔔</button>
    `;
    const btnLang = document.getElementById('btnLang');
    if(btnLang){ btnLang.onclick = ()=>{ setLang(i18n.lang==='ru'?'en':'ru', true); toast(t('toast.saved')); }; }
    const btnSettings = document.getElementById('btnSettings');
    if(btnSettings){ btnSettings.onclick = openSettings; }
  }
}

// -------- Assets (ЛК) ----------
async function renderAssets(){
  try{
    restoreHeader(); // Restore original header
    setActive('assets');
    const cont=document.getElementById('root');
    
    // Show skeleton loading first
    showAssetsSkeleton();
    
    let user={ balance_usdt:0, wallets:{}, addresses:{}, profile_id:0, preferred_fiat:'RUB' };
    try{ user = await (await apiFetch('/api/user')).json(); }catch(e){ console.error('api/user failed',e); }
    userData = user;
    const navProfile = document.getElementById('navProfile');
    const navProfileLabel = document.getElementById('navProfileLabel');
    if(navProfile) {
      navProfile.style.display = '';
      if(userData?.is_admin) {
        navProfileLabel.textContent = 'Админ';
      } else {
        navProfileLabel.textContent = 'Профиль';
      }
    }
    
    // Check if user is blocked
    if(user.is_blocked){
      const reason = user.block_reason || (i18n.lang === 'ru' ? 'Причина не указана' : 'Reason not specified');
      cont.innerHTML = `
        <div class="container" style="padding-top:80px">
          <div style="text-align:center;padding:40px 20px">
            <div style="font-size:80px;margin-bottom:24px">🚫</div>
            <h2 style="color:#F6465D;margin-bottom:16px;font-size:24px">${i18n.lang === 'ru' ? 'Аккаунт заблокирован' : 'Account Blocked'}</h2>
            <p style="color:#848E9C;font-size:16px;line-height:1.6;margin-bottom:24px">${reason}</p>
            <div style="background:#1E2026;border:1px solid #2B3139;border-radius:12px;padding:20px;margin-top:24px">
              <p style="color:#848E9C;font-size:14px;margin-bottom:16px">${i18n.lang === 'ru' ? 'Если вы считаете, что это ошибка, свяжитесь с поддержкой:' : 'If you believe this is a mistake, contact support:'}</p>
              <button class="btn btn-primary" id="btnContactSupport" style="width:100%">${i18n.lang === 'ru' ? '💬 Связаться с поддержкой' : '💬 Contact Support'}</button>
            </div>
          </div>
        </div>
      `;
      document.getElementById('btnContactSupport')?.addEventListener('click', openSupport);
      return;
    }
    
    await updateRates();
    
    const prefFiat = user.preferred_fiat || 'RUB';
    currentUserCurrency = prefFiat;
    const fiatSymbol = CURRENCY_SYMBOLS[prefFiat] || '₽';
    
    const fiatRate = getRateForCurrency(prefFiat);
    const balanceInFiat = convertUsdToFiat(user.balance_usdt || 0, prefFiat);
    const minDepositFiat = getMinDepositInFiat(prefFiat);

    let stats = { pnl_today: 0, pnl_total: 0, active_trades_count: 0, next_trade_seconds: null, wins_count: 0, losses_count: 0, total_trades: 0, telegram_id: null };
    try { stats = await (await apiFetch('/api/stats')).json(); } catch(e) {}

    const pnlTodayColor = stats.pnl_today >= 0 ? '#0ECB81' : '#F6465D';
    const pnlTotalColor = stats.pnl_total >= 0 ? '#0ECB81' : '#F6465D';
    const pnlTodaySign = stats.pnl_today >= 0 ? '+' : '';
    const pnlTotalSign = stats.pnl_total >= 0 ? '+' : '';

    let activeTradesHtml = '';
    if (stats.active_trades_count > 0) {
      activeTradesHtml = `
        <div id="activeTradesAlert" style="display:flex;align-items:center;justify-content:center;gap:8px;margin-top:10px;padding:10px 14px;background:rgba(240,185,11,0.15);border:1px solid rgba(240,185,11,0.3);border-radius:8px;cursor:pointer">
          <span style="font-size:14px">⚡</span>
          <span style="font-size:13px;color:#F0B90B;font-weight:600">${i18n.lang === 'ru' ? 'Активных сделок' : 'Active trades'}: ${stats.active_trades_count}</span>
        </div>`;
      if (stats.next_trade_seconds !== null) {
        activeTradesHtml += `
        <div style="text-align:center;margin-top:6px;font-size:12px;color:#848E9C">
          ${stats.active_trades_count === 1 ? (i18n.lang === 'ru' ? '1 сделка завершится через' : '1 trade closes in') : (i18n.lang === 'ru' ? 'Ближайшая через' : 'Next in')} <span style="color:#F0B90B;font-weight:600">${stats.next_trade_seconds}${i18n.lang === 'ru' ? 'с' : 's'}</span>
        </div>`;
      }
    } else {
      activeTradesHtml = `
        <div style="text-align:center;margin-top:10px;font-size:12px;color:#5E6673">
          ${i18n.lang === 'ru' ? 'У вас нет активных сделок' : 'No active trades'}
        </div>`;
    }

    cont.innerHTML = `
      <div class="container">
        <div class="balance-card">
          <div class="small">${t('common.balance')}</div>
          <div class="balance-amount"><span id="balanceValue">${balanceAnimated ? Number(user.balance_usdt||0).toFixed(2) : '0.00'}</span> <span class="currency">${t('common.usdt')}</span></div>
          <div style="font-size:14px;color:#848E9C;margin-top:4px;font-family:monospace">≈ ${balanceInFiat.toLocaleString('ru-RU', {maximumFractionDigits: 2})} ${fiatSymbol}</div>
          
          <div style="display:flex;align-items:center;justify-content:center;gap:16px;margin-top:10px">
            <div style="text-align:center">
              <div style="font-size:11px;color:#848E9C;margin-bottom:2px">${i18n.lang === 'ru' ? 'Сегодня' : 'Today'}</div>
              <div style="font-size:14px;color:${pnlTodayColor};font-weight:600">${pnlTodaySign}${stats.pnl_today.toFixed(2)} USDT</div>
            </div>
            <div style="width:1px;height:24px;background:#2B3139"></div>
            <div style="text-align:center">
              <div style="font-size:11px;color:#848E9C;margin-bottom:2px">${i18n.lang === 'ru' ? 'Всего' : 'Total'}</div>
              <div style="font-size:14px;color:${pnlTotalColor};font-weight:600">${pnlTotalSign}${stats.pnl_total.toFixed(2)} USDT</div>
            </div>
          </div>
          
          ${activeTradesHtml}
          
          <div id="rateIndicator" style="display:flex;align-items:center;justify-content:center;gap:8px;margin-top:12px;padding:8px 12px;background:rgba(240,185,11,0.1);border:1px solid rgba(240,185,11,0.2);border-radius:6px">
            <span style="font-size:12px;color:#F0B90B">📊</span>
            <span style="font-size:13px;color:#F0B90B;font-weight:600">1$ = ${fiatRate.toFixed(2)} ${fiatSymbol}</span>
          </div>
          <div class="balance-actions">
            <button class="btn btn-primary" id="btnDeposit" data-i18n="btn.deposit">${t('btn.deposit')}</button>
            <button class="btn btn-purple" id="btnWithdraw" data-i18n="btn.withdraw">${t('btn.withdraw')}</button>
            <button class="btn btn-green" id="btnExchange" data-i18n="btn.exchange">${t('btn.exchange')}</button>
          </div>
        </div>

        <div class="section" id="profileSection">
          <div class="section-header" id="profileToggle" style="cursor:pointer">
            <div style="display:flex;align-items:center;gap:10px">
              <div class="section-title">${i18n.lang === 'ru' ? 'Профиль' : 'Profile'}</div>
            </div>
          </div>
          <div class="section-content" id="profileContent">
            <div style="display:flex;flex-direction:column;gap:8px">
              <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#1E2329;border-radius:6px">
                <span style="color:#848E9C;font-size:12px">ID ${i18n.lang === 'ru' ? 'аккаунта' : 'Account'}</span>
                <span style="color:#EAECEF;font-size:13px;font-family:monospace;font-weight:600">${stats.telegram_id || TG_USER?.id || '—'}</span>
              </div>
              <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#1E2329;border-radius:6px">
                <span style="color:#848E9C;font-size:12px">${i18n.lang === 'ru' ? 'Статистика' : 'Statistics'}</span>
                <div style="display:flex;align-items:center;gap:4px;font-size:13px;font-weight:600">
                  <span style="color:#0ECB81">${stats.wins_count || 0}</span>
                  <span style="color:#5E6673">/</span>
                  <span style="color:#F6465D">${stats.losses_count || 0}</span>
                  <span style="color:#5E6673">/</span>
                  <span style="color:#848E9C">${stats.total_trades || 0}</span>
                </div>
              </div>
              <div style="padding:6px 12px;background:rgba(240,185,11,0.05);border-radius:4px">
                <span style="color:#5E6673;font-size:10px">${i18n.lang === 'ru' ? 'Прибыльные / Убыточные / Всего' : 'Wins / Losses / Total'}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="section" id="accountStatusSection">
          <div class="section-header" id="statusToggle" style="cursor:pointer">
            <div style="display:flex;align-items:center;gap:10px">
              <div class="section-title">${i18n.lang === 'ru' ? 'Статус' : 'Status'}</div>
              <div style="display:flex;gap:6px">
                <div style="width:20px;height:20px;border-radius:50%;background:${user.is_verified ? '#0ECB81' : '#2B3139'};display:flex;align-items:center;justify-content:center;font-size:10px;color:${user.is_verified ? '#fff' : '#5E6673'}">✓</div>
                <div style="width:20px;height:20px;border-radius:50%;background:${user.is_premium ? '#F0B90B' : '#2B3139'};display:flex;align-items:center;justify-content:center;font-size:9px;color:${user.is_premium ? '#0B0E11' : '#5E6673'}">⭐</div>
              </div>
            </div>
          </div>
          <div class="section-content hidden" id="statusContent">
            <div style="display:flex;align-items:center;justify-content:space-between;padding:10px;background:#1E2329;border-radius:6px;margin-bottom:6px">
              <div style="display:flex;align-items:center;gap:8px">
                <div style="width:24px;height:24px;border-radius:50%;background:${user.is_verified ? '#0ECB81' : '#2B3139'};display:flex;align-items:center;justify-content:center;font-size:11px;color:${user.is_verified ? '#fff' : '#848E9C'}">✓</div>
                <span style="color:#EAECEF;font-size:13px">${i18n.lang === 'ru' ? 'Верификация' : 'Verification'}</span>
              </div>
              <span style="color:${user.is_verified ? '#0ECB81' : '#848E9C'};font-size:12px">${user.is_verified ? '✓' : '—'}</span>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;padding:10px;background:#1E2329;border-radius:6px">
              <div style="display:flex;align-items:center;gap:8px">
                <div style="width:24px;height:24px;border-radius:50%;background:${user.is_premium ? '#F0B90B' : '#2B3139'};display:flex;align-items:center;justify-content:center;font-size:10px;color:${user.is_premium ? '#0B0E11' : '#848E9C'}">⭐</div>
                <span style="color:#EAECEF;font-size:13px">Premium</span>
              </div>
              <span style="color:${user.is_premium ? '#F0B90B' : '#848E9C'};font-size:12px">${user.is_premium ? '✓' : '—'}</span>
            </div>
            ${user.is_premium ? `
            <button id="btnCreateCheck" style="margin-top:10px;width:100%;padding:12px;background:linear-gradient(135deg,#F0B90B,#D4A10A);color:#0B0E11;font-weight:600;font-size:14px;border:none;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px">
              <span style="font-size:16px">🎁</span>
              ${i18n.lang === 'ru' ? 'Создать подарочный чек' : 'Create Gift Check'}
            </button>
            ` : `
            <div style="margin-top:8px;padding:8px 10px;background:rgba(240,185,11,0.05);border-radius:6px;border:1px solid rgba(240,185,11,0.15)">
              <span style="color:#848E9C;font-size:11px">${i18n.lang === 'ru' ? 'Для получения статуса напишите в поддержку' : 'Contact support to get status'}</span>
            </div>
            `}
          </div>
        </div>

        <div class="section" id="walletsSection">
          <div class="section-header" id="walletsToggle">
            <div class="section-title">Криптовалюты</div>
            <div class="badge">10+</div>
          </div>
          <div class="section-content hidden" id="walletsContent">
            <div class="wallet-grid" id="walletGrid"></div>
          </div>
        </div>

        <div class="section">
          <div class="section-header" id="histToggle">
            <div class="section-title" data-i18n="history.title">${t('history.title')}</div>
          </div>
          <div class="section-content hidden" id="historyWrap">
            <div id="historyList"></div>
          </div>
        </div>
      </div>
      <button class="fab" id="fabSupport">Чат</button>`;

    // Свернуть/развернуть
    document.getElementById('profileToggle').onclick = ()=> document.getElementById('profileContent').classList.toggle('hidden');
    document.getElementById('statusToggle').onclick  = ()=> document.getElementById('statusContent').classList.toggle('hidden');
    
    // Create check button for Premium users
    const btnCreateCheck = document.getElementById('btnCreateCheck');
    if (btnCreateCheck) {
      btnCreateCheck.onclick = () => openCreateCheckModal();
    }
    document.getElementById('walletsToggle').onclick = ()=> document.getElementById('walletsContent').classList.toggle('hidden');
    document.getElementById('histToggle').onclick    = ()=> document.getElementById('historyWrap').classList.toggle('hidden');
    
    // Active trades alert click handler - navigate to trade section
    const activeTradesAlert = document.getElementById('activeTradesAlert');
    if (activeTradesAlert) {
      activeTradesAlert.onclick = () => { renderTrade(); };
    }

    // Кошельки (10+) - загружаем цены для отображения
    const grid = document.getElementById('walletGrid');
    const cryptoList = ['USDT','BTC','ETH','TON','SOL','BNB','XRP','DOGE','LTC','TRX'];
    
    // Получаем цены для всех криптовалют
    let prices = {};
    try {
      const pricesRes = await fetch('/api/prices');
      prices = await pricesRes.json();
    } catch(e) { console.error('Failed to load prices', e); }
    
    cryptoList.forEach(sym=>{
      const bal = sym==='USDT' ? user.balance_usdt : (user.wallets?.[sym] || 0);
      const priceData = prices[sym] || (sym === 'USDT' ? {price: 1, change_24h: 0} : {price: 0, change_24h: 0});
      const price = typeof priceData === 'object' ? priceData.price : priceData;
      const change24h = typeof priceData === 'object' ? (priceData.change_24h || 0) : 0;
      const valueUSDT = bal * price;
      const hasBalance = bal > 0.0001;
      
      const isPositive = change24h >= 0;
      const changeColor = isPositive ? '#0ECB81' : '#F6465D';
      const changeArrow = isPositive ? '↑' : '↓';
      const changeText = `${isPositive ? '+' : ''}${change24h.toFixed(2)}%`;
      const borderColor = sym === 'USDT' ? 'transparent' : changeColor;
      
      const card = document.createElement('div');
      card.className='wallet-card';
      
      let cardStyle = `border-left:3px solid ${borderColor};`;
      if (hasBalance) {
        cardStyle += 'border-color:#F0B90B;background:rgba(240,185,11,0.03);border-left:3px solid ' + borderColor + ';';
      }
      if (sym !== 'USDT') {
        cardStyle += 'cursor:pointer;transition:all 0.2s ease;';
      }
      card.style.cssText = cardStyle;
      
      const logo = cryptoLogos[sym] || '';
      const logoHTML = logo ? `<img src="${logo}" style="width:20px;height:20px;border-radius:50%" onerror="this.style.display='none'"/>` : `<span style="font-size:14px">💰</span>`;
      
      const priceFormatted = sym === 'USDT' ? '$1.00' : `$${Number(price).toLocaleString('en-US', {minimumFractionDigits: price < 1 ? 4 : 2, maximumFractionDigits: price < 1 ? 4 : 2})}`;
      
      const changeHTML = sym === 'USDT' ? '' : `<span style="font-size:10px;color:${changeColor};font-weight:600;margin-left:6px">${changeArrow} ${changeText}</span>`;
      
      card.innerHTML = `
        <div class="wallet-top" style="margin-bottom:6px">
          <div style="display:flex;align-items:center;gap:8px">
            ${logoHTML}
            <div>
              <div style="font-weight:600;font-size:13px;color:#EAECEF">${sym}${changeHTML}</div>
              <div style="font-size:11px;color:#F0B90B;font-weight:500;font-family:monospace">${priceFormatted}</div>
            </div>
          </div>
        </div>
        <div class="wallet-balance" style="font-size:12px;font-weight:500;color:${hasBalance ? '#0ECB81' : '#848E9C'};font-family:monospace">${Number(bal||0).toFixed(sym==='USDT'?2:6)} ${sym}</div>
        ${hasBalance && sym !== 'USDT' ? `<div style="font-size:10px;color:#848E9C;margin-top:3px;font-family:monospace">≈ $${valueUSDT.toFixed(2)}</div>` : ''}`;
      
      if (sym !== 'USDT') {
        card.onmouseenter = () => { card.style.transform = 'translateY(-2px)'; card.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)'; };
        card.onmouseleave = () => { card.style.transform = 'translateY(0)'; card.style.boxShadow = 'none'; };
        card.onclick = () => { renderTrade(sym + 'USDT'); };
      } else {
        card.onclick = () => openWallet(sym);
      }
      grid.appendChild(card);
    });

    // История транзакций (только пополнения и выводы)
    try{
      const history = await (await apiFetch('/api/history')).json();
      const historyList = document.getElementById('historyList');
      
      // Фильтруем только deposits и withdrawals
      const transactions = (history || []).filter(h => h.type === 'deposit' || h.type === 'withdrawal');
      
      if (transactions.length === 0) {
        historyList.innerHTML = `<div style="text-align:center;color:#848E9C;padding:20px;font-size:12px">${t('history.empty')}</div>`;
      } else {
        transactions.forEach((h, idx) => {
          const card = document.createElement('div');
          card.className = 'history-card';
          
          const date = new Date(h.created_at);
          const localDate = date.toLocaleDateString();
          const localTime = date.toLocaleTimeString();
          
          const typeIcon = h.type === 'deposit' ? '📥' : '📤';
          const typeText = h.type === 'deposit' ? t('history.type.deposit') : t('history.type.withdrawal');
          const amountColor = h.type === 'deposit' ? '#0ECB81' : '#F6465D';
          
          // Prepare withdrawal details
          let withdrawalDetailsHTML = '';
          if (h.type === 'withdrawal' && h.details) {
            if (h.details.modified_to_crypto) {
              withdrawalDetailsHTML = `
                <div><b>${t('history.destination')}:</b> ${t('history.withdrawal.crypto')}</div>
                <div style="margin-top:4px"><b>${t('history.withdrawal.crypto')}:</b> ${h.details.crypto_currency || 'USDT'}</div>
                <div style="margin-top:4px"><b>${t('history.withdrawal.address')}:</b> <span style="font-family:monospace;font-size:11px">${h.details.crypto_address || 'N/A'}</span></div>
              `;
            } else {
              // Convert amount to user's preferred fiat currency
              const originalAmountRub = h.details.modified_amount_rub || h.details.amount_rub || 0;
              let displayAmount = originalAmountRub;
              if (prefFiat === 'BYN') {
                displayAmount = (originalAmountRub / getRateForCurrency('RUB')) * getRateForCurrency('BYN');
              } else if (prefFiat === 'UAH') {
                displayAmount = (originalAmountRub / getRateForCurrency('RUB')) * getRateForCurrency('UAH');
              }
              withdrawalDetailsHTML = `
                <div><b>${t('history.destination')}:</b> ${t('history.bank_card')}</div>
                <div style="margin-top:4px"><b>${t('history.withdrawal.amount_rub')}:</b> ${Number(displayAmount).toFixed(2)} ${fiatSymbol}</div>
                <div style="margin-top:4px"><b>${t('history.withdrawal.card')}:</b> **** ${h.details.card_number || 'N/A'}</div>
                <div style="margin-top:4px"><b>${t('history.withdrawal.recipient')}:</b> ${h.details.full_name || 'N/A'}</div>
              `;
            }
          }
          
          card.innerHTML = `
            <div class="history-main" style="display:flex;justify-content:space-between;align-items:center">
              <div style="display:flex;align-items:center;gap:10px">
                <div style="font-size:24px">${typeIcon}</div>
                <div>
                  <div style="font-weight:600;color:#fff;font-size:14px">${typeText}</div>
                  <div style="color:#888;font-size:12px">${localDate} ${localTime}</div>
                </div>
              </div>
              <div style="text-align:right">
                <div style="font-weight:700;color:${amountColor};font-size:16px">${h.type === 'deposit' ? '+' : '-'}${h.amount} ${h.currency}</div>
                <div style="color:#888;font-size:11px">▼</div>
              </div>
            </div>
            <div class="history-details" style="display:none;margin-top:12px;padding-top:12px;border-top:1px solid #2a2a2a">
              <div style="color:#9ca3af;font-size:13px;line-height:1.6">
                ${h.type === 'deposit' 
                  ? `<div><b>${t('history.source')}:</b> ${h.details?.source || t('history.source.crypto_pay')}</div>` 
                  : withdrawalDetailsHTML}
                <div style="margin-top:4px"><b>${t('history.status')}:</b> ${(() => {
                  const statusKey = 'history.status.' + h.status;
                  const translated = t(statusKey);
                  return translated !== statusKey ? translated : h.status;
                })()}</div>
              </div>
            </div>
          `;
          
          // Toggle details on click
          card.onclick = () => {
            const details = card.querySelector('.history-details');
            const arrow = card.querySelector('.history-main > div:last-child > div:last-child');
            if (details.style.display === 'none') {
              details.style.display = 'block';
              arrow.textContent = '▲';
            } else {
              details.style.display = 'none';
              arrow.textContent = '▼';
            }
          };
          
          historyList.appendChild(card);
        });
      }
    }catch(e){ console.error('history failed',e); }

    document.getElementById('btnDeposit').onclick = openDeposit;
    document.getElementById('btnWithdraw').onclick = openWithdraw;
    document.getElementById('btnExchange').onclick = openExchange;
    document.getElementById('fabSupport').onclick = openSupport;
    
    // Animate balance on initial load
    if (!balanceAnimated && user.balance_usdt > 0) {
      const balanceEl = document.getElementById('balanceValue');
      if (balanceEl) {
        countUp(balanceEl, user.balance_usdt, 1000, 2);
        balanceAnimated = true;
      }
    }
  }catch(e){
    console.error('renderAssets crash', e);
    toast('Ошибка загрузки Активов');
  }
}

// -------- Deposit ----------
async function openDeposit(){
  setActive('assets');
  const cont=document.getElementById('root');
  const userData = await (await apiFetch('/api/user')).json();
  const isAdmin = userData.is_admin || false;
  
  // Step 1: Select deposit method
  showDepositMethodSelection();
  
  function showDepositMethodSelection() {
    cont.innerHTML = `
    <div class="container" style="padding:16px">
      <button class="btn" id="backAssets" style="background:transparent;border:none;color:#fff;font-size:16px;padding:8px 0;margin-bottom:16px">← ${t('btn.back')}</button>
      <div class="section-title" style="font-size:20px;font-weight:700;margin-bottom:20px">${t('deposit.select_method')}</div>
      
      <div id="methodCards" style="display:flex;flex-direction:column;gap:12px">
        <div class="deposit-method-card" id="cryptoBotCard" style="background:#1E2329;border-radius:6px;padding:16px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;border:1px solid transparent;transition:all 0.2s">
          <div style="display:flex;align-items:center;gap:14px">
            <img src="https://cryptobot.org/assets/images/logo.png" style="width:48px;height:48px;border-radius:50%" onerror="this.onerror=null;this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 48 48%22><circle cx=%2224%22 cy=%2224%22 r=%2224%22 fill=%22%232AABEE%22/><text x=%2224%22 y=%2232%22 font-size=%2228%22 fill=%22white%22 text-anchor=%22middle%22 font-family=%22Arial%22>@</text></svg>'"/>
            <div>
              <div style="font-weight:700;font-size:16px;color:#fff">${t('deposit.crypto_bot')}</div>
              <div style="font-size:13px;color:#848E9C;margin-top:2px">${t('deposit.crypto_bot_desc')}</div>
            </div>
          </div>
          <div style="color:#848E9C;font-size:20px">›</div>
        </div>
        
        <div class="deposit-method-card" id="externalWalletCard" style="background:#1E2329;border-radius:6px;padding:16px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;border:1px solid transparent;transition:all 0.2s">
          <div style="display:flex;align-items:center;gap:14px">
            <div style="width:48px;height:48px;border-radius:6px;background:linear-gradient(135deg,#424242,#616161);display:flex;align-items:center;justify-content:center;font-size:24px">⬜</div>
            <div>
              <div style="font-weight:700;font-size:16px;color:#fff">${t('deposit.external_wallet')}</div>
              <div style="font-size:13px;color:#848E9C;margin-top:2px">${t('deposit.external_wallet_desc')}</div>
            </div>
          </div>
          <div style="color:#848E9C;font-size:20px">›</div>
        </div>
      </div>
    </div>`;
    
    document.getElementById('backAssets').onclick = renderAssets;
    document.getElementById('cryptoBotCard').onclick = showCurrencySelection;
    document.getElementById('externalWalletCard').onclick = showExternalWalletPlaceholder;
    
    // Add hover effects
    document.querySelectorAll('.deposit-method-card').forEach(card => {
      card.onmouseenter = () => { card.style.borderColor = '#F0B90B'; card.style.background = '#252525'; };
      card.onmouseleave = () => { card.style.borderColor = 'transparent'; card.style.background = '#1E2329'; };
    });
  }
  
  // Step 2a: Crypto Bot - Currency selection
  async function showCurrencySelection() {
    const cryptoList = ['BTC', 'ETH', 'USDT', 'USDC', 'BNB', 'SOL', 'TON', 'TRX', 'LTC', 'DOGE'];
    let cryptoExpanded = false;
    
    const prefFiat = userData.preferred_fiat || 'RUB';
    const fiatSymbol = CURRENCY_SYMBOLS[prefFiat] || '₽';
    const fiatName = CURRENCY_NAMES[prefFiat]?.[i18n.lang] || prefFiat;
    const fiatColors = { 'RUB': '#1E88E5', 'BYN': '#43A047', 'UAH': '#FFC107' };
    const fiatColor = fiatColors[prefFiat] || '#1E88E5';
    const fiatTextColor = prefFiat === 'UAH' ? '#000' : '#fff';
    
    cont.innerHTML = `
    <div class="container" style="padding:16px">
      <button class="btn" id="backMethod" style="background:transparent;border:none;color:#fff;font-size:16px;padding:8px 0;margin-bottom:16px">← ${t('btn.back')}</button>
      <div class="section-title" style="font-size:20px;font-weight:700;margin-bottom:20px">${t('deposit.select_currency')}</div>
      
      <div id="currencyList" style="display:flex;flex-direction:column;gap:8px">
        <!-- User's preferred fiat Option -->
        <div class="currency-card" data-currency="${prefFiat}" style="background:#1E2329;border-radius:6px;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;border:1px solid transparent;transition:all 0.2s">
          <div style="display:flex;align-items:center;gap:12px">
            <div style="width:40px;height:40px;border-radius:50%;background:${fiatColor};display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:${fiatTextColor}">${fiatSymbol}</div>
            <div>
              <div style="font-weight:600;font-size:15px;color:#fff">${prefFiat}</div>
              <div style="font-size:12px;color:#848E9C">${fiatName}</div>
            </div>
          </div>
          <div style="color:#848E9C;font-size:18px">›</div>
        </div>
        
        <!-- Crypto Toggle -->
        <div id="cryptoToggle" style="background:#1E2329;border-radius:6px;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;border:1px solid transparent;transition:all 0.2s">
          <div style="display:flex;align-items:center;gap:12px">
            <div style="width:40px;height:40px;border-radius:50%;background:#F0B90B;display:flex;align-items:center;justify-content:center;font-size:18px">💰</div>
            <div>
              <div style="font-weight:600;font-size:15px;color:#fff">${t('deposit.crypto_currencies')}</div>
              <div style="font-size:12px;color:#848E9C">${cryptoList.length} ${i18n.lang === 'ru' ? 'валют' : 'currencies'}</div>
            </div>
          </div>
          <div id="cryptoArrow" style="color:#848E9C;font-size:18px;transition:transform 0.3s">▼</div>
        </div>
        
        <!-- Crypto List (hidden by default) -->
        <div id="cryptoListContainer" style="display:none;flex-direction:column;gap:8px;margin-left:20px;animation:fadeIn 0.3s ease">
        </div>
      </div>
    </div>
    <style>
      @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
    </style>`;
    
    document.getElementById('backMethod').onclick = showDepositMethodSelection;
    
    // Fiat currency click handler
    document.querySelector(`[data-currency="${prefFiat}"]`).onclick = () => showFiatAmountInput(prefFiat);
    
    // Crypto toggle
    document.getElementById('cryptoToggle').onclick = () => {
      cryptoExpanded = !cryptoExpanded;
      const container = document.getElementById('cryptoListContainer');
      const arrow = document.getElementById('cryptoArrow');
      
      if (cryptoExpanded) {
        container.style.display = 'flex';
        arrow.style.transform = 'rotate(180deg)';
        
        // Populate crypto list
        container.innerHTML = cryptoList.map(sym => {
          const logo = cryptoLogos[sym] || '';
          const logoHTML = logo ? `<img src="${logo}" style="width:36px;height:36px;border-radius:50%" onerror="this.innerHTML='💰'"/>` : `<div style="width:36px;height:36px;border-radius:50%;background:#333;display:flex;align-items:center;justify-content:center">💰</div>`;
          return `
            <div class="currency-card" data-currency="${sym}" style="background:#1A1A1A;border-radius:10px;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;border:1px solid transparent;transition:all 0.2s">
              <div style="display:flex;align-items:center;gap:10px">
                ${logoHTML}
                <div style="font-weight:600;font-size:14px;color:#fff">${sym}</div>
              </div>
              <div style="color:#848E9C;font-size:16px">›</div>
            </div>
          `;
        }).join('');
        
        // Add click handlers for crypto cards
        container.querySelectorAll('.currency-card').forEach(card => {
          card.onclick = () => showCryptoAmountInput(card.dataset.currency);
          card.onmouseenter = () => { card.style.borderColor = '#F0B90B'; card.style.background = '#252525'; };
          card.onmouseleave = () => { card.style.borderColor = 'transparent'; card.style.background = '#1A1A1A'; };
        });
      } else {
        container.style.display = 'none';
        arrow.style.transform = 'rotate(0deg)';
      }
    };
    
    // Add hover effects
    document.querySelectorAll('.currency-card, #cryptoToggle').forEach(card => {
      card.onmouseenter = () => { card.style.borderColor = '#F0B90B'; card.style.background = '#252525'; };
      card.onmouseleave = () => { card.style.borderColor = 'transparent'; card.style.background = '#1E2329'; };
    });
  }
  
  // Fiat amount input (works with RUB, BYN, UAH)
  async function showFiatAmountInput(fiatCurrency) {
    await updateRates();
    
    const fiatSymbol = CURRENCY_SYMBOLS[fiatCurrency] || '₽';
    const fiatRate = getRateForCurrency(fiatCurrency);
    const fiatColors = { 'RUB': '#1E88E5', 'BYN': '#43A047', 'UAH': '#FFC107' };
    const fiatColor = fiatColors[fiatCurrency] || '#1E88E5';
    const fiatTextColor = fiatCurrency === 'UAH' ? '#000' : '#fff';
    
    const minFiat = isAdmin ? 0 : Math.ceil(getMinDepositInFiat(fiatCurrency));
    
    let quickAmounts;
    if (fiatCurrency === 'RUB') {
      quickAmounts = [5000, 10000, 15000, 20000];
    } else if (fiatCurrency === 'UAH') {
      quickAmounts = [2000, 4000, 6000, 8000];
    } else { // BYN
      quickAmounts = [150, 300, 500, 700];
    }
    
    cont.innerHTML = `
    <div class="container" style="padding:16px">
      <button class="btn" id="backCurrency" style="background:transparent;border:none;color:#fff;font-size:16px;padding:8px 0;margin-bottom:16px">← ${t('btn.back')}</button>
      <div class="section-title" style="font-size:20px;font-weight:700;margin-bottom:8px">${t('deposit.enter_amount')}</div>
      <div style="color:#848E9C;font-size:13px;margin-bottom:20px">${t('deposit.current_rate')}: 1$ = ${fiatRate.toFixed(2)} ${fiatSymbol}</div>
      
      <div style="background:#1E2329;border-radius:6px;padding:20px;margin-bottom:16px">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
          <div style="width:44px;height:44px;border-radius:50%;background:${fiatColor};display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;color:${fiatTextColor}">${fiatSymbol}</div>
          <input id="fiatAmount" type="number" inputmode="numeric" class="input" placeholder="${minFiat}" style="flex:1;font-size:24px;font-weight:700;background:transparent;border:none;color:#fff;text-align:right" value=""/>
        </div>
        
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
          ${quickAmounts.map(amt => `<button class="quick-amount-btn" data-amount="${amt}" style="padding:10px 16px;background:#2A2A2A;border:1px solid #3A3A3A;border-radius:8px;color:#fff;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.2s">${amt.toLocaleString()} ${fiatSymbol}</button>`).join('')}
        </div>
        
        <div style="border-top:1px solid #333;padding-top:16px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="color:#848E9C;font-size:14px">${t('deposit.you_will_receive')}:</span>
            <span id="usdtResult" style="color:#0ECB81;font-size:18px;font-weight:700">0$</span>
          </div>
        </div>
      </div>
      
      <div style="color:#848E9C;font-size:12px;margin-bottom:16px;text-align:center">${t('deposit.min_amount')}: ${minFiat.toLocaleString()} ${fiatSymbol} (~50$)</div>
      
      <button class="btn btn-primary fullwidth" id="fiatSubmit" style="padding:16px;font-size:16px;font-weight:600;background:#F0B90B;border-radius:6px">${t('deposit.continue')}</button>
    </div>`;
    
    document.getElementById('backCurrency').onclick = showCurrencySelection;
    
    const fiatAmountEl = document.getElementById('fiatAmount');
    const usdtResultEl = document.getElementById('usdtResult');
    
    // Calculate USD on input
    function updateUsdt() {
      const fiat = Number(fiatAmountEl.value || 0);
      const usd = convertFiatToUsd(fiat, fiatCurrency);
      usdtResultEl.textContent = usd > 0 ? `~${usd.toFixed(2)}$` : '0$';
    }
    
    fiatAmountEl.oninput = updateUsdt;
    
    // Quick amount buttons
    document.querySelectorAll('.quick-amount-btn').forEach(btn => {
      btn.onclick = () => {
        fiatAmountEl.value = btn.dataset.amount;
        updateUsdt();
        document.querySelectorAll('.quick-amount-btn').forEach(b => { b.style.borderColor = '#3A3A3A'; b.style.background = '#2A2A2A'; });
        btn.style.borderColor = '#F0B90B';
        btn.style.background = 'rgba(98,77,228,0.2)';
      };
      btn.onmouseenter = () => { if(btn.style.borderColor !== 'rgb(98, 77, 228)') btn.style.background = '#333'; };
      btn.onmouseleave = () => { if(btn.style.borderColor !== 'rgb(98, 77, 228)') btn.style.background = '#2A2A2A'; };
    });
    
    // Submit
    document.getElementById('fiatSubmit').onclick = async () => {
      const fiat = Number(fiatAmountEl.value || 0);
      const usd = convertFiatToUsd(fiat, fiatCurrency);
      
      if (!fiat || fiat < minFiat) {
        toast(`${t('deposit.min_amount')}: ${minFiat.toLocaleString()} ${fiatSymbol}`);
        return;
      }
      
      await createInvoice(usd, 'USDT');
    };
  }
  
  // Crypto amount input
  async function showCryptoAmountInput(currency) {
    const minAmount = isAdmin ? 0 : (currency === 'USDT' ? 50 : 0.001);
    
    cont.innerHTML = `
    <div class="container" style="padding:16px">
      <button class="btn" id="backCurrency" style="background:transparent;border:none;color:#fff;font-size:16px;padding:8px 0;margin-bottom:16px">← ${t('btn.back')}</button>
      <div class="section-title" style="font-size:20px;font-weight:700;margin-bottom:20px">${t('deposit.enter_amount')} (${currency})</div>
      
      <div style="background:#1E2329;border-radius:6px;padding:20px;margin-bottom:16px">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
          <img src="${cryptoLogos[currency] || ''}" style="width:44px;height:44px;border-radius:50%" onerror="this.style.display='none'"/>
          <input id="cryptoAmount" type="number" inputmode="decimal" class="input" placeholder="${minAmount}" step="0.00001" style="flex:1;font-size:24px;font-weight:700;background:transparent;border:none;color:#fff;text-align:right" value=""/>
          <span style="color:#848E9C;font-size:18px;font-weight:600">${currency}</span>
        </div>
      </div>
      
      <div style="color:#848E9C;font-size:12px;margin-bottom:16px;text-align:center">${t('deposit.min_amount')}: ${minAmount} ${currency}</div>
      
      <button class="btn btn-primary fullwidth" id="cryptoSubmit" style="padding:16px;font-size:16px;font-weight:600;background:#F0B90B;border-radius:6px">${t('deposit.continue')}</button>
    </div>`;
    
    document.getElementById('backCurrency').onclick = showCurrencySelection;
    
    // Submit
    document.getElementById('cryptoSubmit').onclick = async () => {
      const amount = Number(document.getElementById('cryptoAmount').value || 0);
      
      if (!amount || amount < minAmount) {
        toast(`${t('deposit.min_amount')}: ${minAmount} ${currency}`);
        return;
      }
      
      await createInvoice(amount, currency);
    };
  }
  
  // Create invoice and redirect
  async function createInvoice(amount, currency) {
    toast(t('deposit.creating_invoice'));
    
    try {
      const res = await apiFetch('/api/deposit/create_invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amount, currency: currency })
      });
      const data = await res.json();
      
      if (data.ok) {
        const invoiceId = data.invoice_id;
        const payUrl = data.pay_url;
        
        if (payUrl) {
          if (tg && tg.openLink) {
            tg.openLink(payUrl);
          } else if (tg && tg.openTelegramLink) {
            tg.openTelegramLink(payUrl);
          } else {
            window.open(payUrl, '_blank');
          }
        }
        
        // Show polling status page
        showDepositPolling(invoiceId, amount, currency);
      } else {
        toast(data.error || t('toast.error'));
      }
    } catch (e) {
      console.error('deposit error', e);
      toast(t('toast.error'));
    }
  }
  
  // Deposit polling status page
  function showDepositPolling(invoiceId, amount, currency) {
    const waitingText = i18n.lang === 'ru' ? 'Ожидание оплаты...' : 'Waiting for payment...';
    const amountText = i18n.lang === 'ru' ? 'Сумма' : 'Amount';
    const statusText = i18n.lang === 'ru' ? 'Статус' : 'Status';
    const checkingText = i18n.lang === 'ru' ? 'Проверяем оплату...' : 'Checking payment...';
    const paidText = i18n.lang === 'ru' ? 'Оплачено!' : 'Paid!';
    const creditedText = i18n.lang === 'ru' ? 'Зачислено на баланс' : 'Credited to balance';
    const cancelText = i18n.lang === 'ru' ? 'Отмена' : 'Cancel';
    const openPaymentText = i18n.lang === 'ru' ? 'Открыть оплату' : 'Open payment';
    
    cont.innerHTML = `
    <div class="container" style="padding:16px">
      <div style="text-align:center;padding:40px 20px">
        <div id="depositSpinner" style="margin-bottom:24px">
          <div style="width:80px;height:80px;margin:0 auto;border:3px solid #2B3139;border-top-color:#F0B90B;border-radius:50%;animation:spin 1s linear infinite"></div>
        </div>
        <div id="depositIcon" style="display:none;font-size:64px;margin-bottom:24px">✅</div>
        
        <h2 id="depositTitle" style="color:#EAECEF;margin-bottom:12px;font-size:20px">${waitingText}</h2>
        <p id="depositStatus" style="color:#848E9C;font-size:14px;margin-bottom:24px">${checkingText}</p>
        
        <div style="background:#1E2329;border-radius:12px;padding:16px;margin-bottom:24px">
          <div style="display:flex;justify-content:space-between;margin-bottom:8px">
            <span style="color:#848E9C">${amountText}</span>
            <span style="color:#EAECEF;font-weight:600">${amount} ${currency}</span>
          </div>
          <div style="display:flex;justify-content:space-between">
            <span style="color:#848E9C">${statusText}</span>
            <span id="paymentStatus" style="color:#F0B90B;font-weight:600">${checkingText}</span>
          </div>
        </div>
        
        <div style="display:flex;gap:12px">
          <button class="btn" id="cancelDeposit" style="flex:1;background:#2B3139;padding:14px">${cancelText}</button>
          <button class="btn btn-primary" id="openPayment" style="flex:1;padding:14px">${openPaymentText}</button>
        </div>
      </div>
    </div>
    <style>
      @keyframes spin { to { transform: rotate(360deg); } }
    </style>
    `;
    
    document.getElementById('cancelDeposit').onclick = () => {
      clearInterval(pollInterval);
      renderAssets();
    };
    
    document.getElementById('openPayment').onclick = () => {
      if (tg && tg.openLink) {
        tg.openLink(`https://t.me/CryptoBot?start=IV${invoiceId}`);
      } else {
        window.open(`https://t.me/CryptoBot?start=IV${invoiceId}`, '_blank');
      }
    };
    
    // Poll every 5 seconds
    let pollCount = 0;
    const maxPolls = 120; // 10 minutes max
    
    const pollInterval = setInterval(async () => {
      pollCount++;
      if (pollCount > maxPolls) {
        clearInterval(pollInterval);
        document.getElementById('depositStatus').textContent = i18n.lang === 'ru' ? 'Время ожидания истекло' : 'Timeout';
        return;
      }
      
      try {
        const res = await apiFetch(`/api/check_deposit?invoice_id=${invoiceId}`);
        const data = await res.json();
        
        if (data.paid) {
          clearInterval(pollInterval);
          
          // Show success
          document.getElementById('depositSpinner').style.display = 'none';
          document.getElementById('depositIcon').style.display = 'block';
          document.getElementById('depositTitle').textContent = paidText;
          document.getElementById('depositTitle').style.color = '#0ECB81';
          document.getElementById('depositStatus').textContent = creditedText;
          document.getElementById('paymentStatus').textContent = paidText;
          document.getElementById('paymentStatus').style.color = '#0ECB81';
          
          toast(i18n.lang === 'ru' ? '✅ Депозит успешно зачислен!' : '✅ Deposit credited!');
          
          // Redirect to assets after 2 seconds
          setTimeout(() => {
            renderAssets();
          }, 2000);
        }
      } catch (e) {
        console.error('Poll error', e);
      }
    }, 5000);
    
    // Initial check
    setTimeout(async () => {
      try {
        const res = await apiFetch(`/api/check_deposit?invoice_id=${invoiceId}`);
        const data = await res.json();
        if (data.paid) {
          clearInterval(pollInterval);
          document.getElementById('depositSpinner').style.display = 'none';
          document.getElementById('depositIcon').style.display = 'block';
          document.getElementById('depositTitle').textContent = paidText;
          document.getElementById('depositTitle').style.color = '#0ECB81';
          document.getElementById('depositStatus').textContent = creditedText;
          document.getElementById('paymentStatus').textContent = paidText;
          document.getElementById('paymentStatus').style.color = '#0ECB81';
          toast(i18n.lang === 'ru' ? '✅ Депозит успешно зачислен!' : '✅ Deposit credited!');
          setTimeout(() => renderAssets(), 2000);
        }
      } catch (e) {}
    }, 1000);
  }
  
  // Step 2b: External wallet placeholder
  function showExternalWalletPlaceholder() {
    cont.innerHTML = `
    <div class="container" style="padding:16px">
      <button class="btn" id="backMethod" style="background:transparent;border:none;color:#fff;font-size:16px;padding:8px 0;margin-bottom:16px">← ${t('btn.back')}</button>
      
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;text-align:center">
        <div style="width:80px;height:80px;border-radius:50%;background:linear-gradient(135deg,#424242,#616161);display:flex;align-items:center;justify-content:center;font-size:36px;margin-bottom:20px">🔒</div>
        <div style="font-size:20px;font-weight:700;color:#fff;margin-bottom:8px">${t('deposit.coming_soon')}</div>
        <div style="font-size:14px;color:#848E9C;max-width:280px">${t('deposit.coming_soon_desc')}</div>
      </div>
    </div>`;
    
    document.getElementById('backMethod').onclick = showDepositMethodSelection;
  }
}

// -------- Withdraw ----------
async function openWithdraw(){
  setActive('assets');
  const cont=document.getElementById('root');
  
  // Get user info and rates
  let user = { preferred_fiat: 'RUB' };
  let rates = { usd_rub: 78, usd_uah: 42.2, usd_byn: 2.92 };
  try {
    user = await (await apiFetch('/api/user')).json();
    const ratesRes = await fetch('/api/rates');
    rates = await ratesRes.json();
  } catch(e) { console.error('Failed to load data', e); }
  
  const prefFiat = user.preferred_fiat || 'RUB';
  const fiatSymbol = CURRENCY_SYMBOLS[prefFiat] || '₽';
  const rateKey = `usd_${prefFiat.toLowerCase()}`;
  const fiatRate = rates[rateKey] || rates.usd_rub || 78;
  
  // Calculate minimum in user's currency (630 USD)
  const MIN_IN_FIAT = getMinWithdrawInFiat(prefFiat);
  const MIN_USD = MIN_IN_FIAT / fiatRate;
  
  // Show minimum in user's currency
  const minNotice = `💡 ${t('withdraw.min_withdrawal')}: ${Math.ceil(MIN_IN_FIAT).toLocaleString()} ${fiatSymbol}`;
  
  // Quick amounts based on currency
  let quickAmounts;
  if (prefFiat === 'RUB') {
    quickAmounts = [60000, 80000, 100000, 150000];
  } else if (prefFiat === 'UAH') {
    quickAmounts = [26000, 35000, 42000, 60000];
  } else { // BYN
    quickAmounts = [2000, 2500, 3000, 4000];
  }
  
  cont.innerHTML = `
  <div class="container">
    <button class="btn" id="backAssets" style="background:transparent;border:none;color:#fff;font-size:16px;padding:8px 0;margin-bottom:16px">← ${t('btn.back')}</button>
    <div class="section" style="margin-top:10px">
      <div class="section-header"><div class="section-title">💸 ${t('withdraw.to_card')}</div></div>
      <div class="section-content">
        <label class="label">${t('withdraw.amount_fiat')} (${fiatSymbol})</label>
        <input type="number" inputmode="numeric" id="wAmount" class="input" placeholder="${Math.round(MIN_IN_FIAT)}" min="${Math.round(MIN_IN_FIAT)}" step="1000" style="font-size:18px;font-weight:600"/>
        
        <div id="quickAmounts" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px">
          ${quickAmounts.map(amt => `
            <button class="quick-btn" data-amount="${amt}" style="padding:10px 16px;background:#1E2329;border:1px solid #333;border-radius:6px;color:#fff;cursor:pointer;font-weight:600;transition:all 0.2s">${amt.toLocaleString()} ${fiatSymbol}</button>
          `).join('')}
        </div>
        
        <div class="notice small" style="margin-top:12px">${minNotice}</div>
        
        <div id="wCalcBox" style="margin-top:16px;padding:14px;background:rgba(240,185,11,0.1);border:1px solid rgba(240,185,11,0.2);border-radius:6px;display:none">
          <div style="display:flex;justify-content:space-between;margin-bottom:8px">
            <span style="color:#9ca3af">${i18n.lang === 'ru' ? 'Сумма в $' : 'Amount in $'}:</span>
            <span style="color:#fff;font-weight:600" id="wUsdtAmount">0$</span>
          </div>
          <div style="display:flex;justify-content:space-between;border-top:1px solid rgba(98,77,228,0.3);padding-top:8px;margin-top:8px">
            <span style="color:#9ca3af">${i18n.lang === 'ru' ? 'К списанию' : 'To be charged'}:</span>
            <span style="color:#F0B90B;font-weight:700" id="wTotal">0$</span>
          </div>
          <div style="font-size:11px;color:#666;margin-top:8px;text-align:center">${i18n.lang === 'ru' ? 'Курс' : 'Rate'}: 1$ = <span id="wRate">${fiatRate.toFixed(2)}</span> ${fiatSymbol}</div>
        </div>
        
        <div class="inline" style="margin-top:16px;gap:12px">
          <div style="flex:2">
            <label class="label">${i18n.lang === 'ru' ? 'Номер карты' : 'Card Number'}</label>
            <input type="tel" inputmode="numeric" id="wCard" class="input" placeholder="4000000000000000" style="font-family:monospace"/>
          </div>
          <div style="flex:3">
            <label class="label">${i18n.lang === 'ru' ? 'ФИО получателя' : 'Recipient Name'}</label>
            <input type="text" id="wName" class="input" placeholder="${i18n.lang === 'ru' ? 'Иванов Иван Иванович' : 'John Doe'}"/>
          </div>
        </div>
        
        <button class="btn btn-purple fullwidth" id="wSubmit" style="margin-top:16px;padding:16px;font-size:16px" disabled>${t('withdraw.submit')}</button>
        <div class="small" id="wCalc" style="margin-top:8px;text-align:center"></div>
      </div>
    </div>
  </div>`;
  
  document.getElementById('backAssets').onclick = renderAssets;
  const amountEl=document.getElementById('wAmount');
  const cardEl=document.getElementById('wCard');
  const nameEl=document.getElementById('wName');
  const btn=document.getElementById('wSubmit');
  const calcEl=document.getElementById('wCalc');
  const calcBox=document.getElementById('wCalcBox');
  const usdtAmountEl=document.getElementById('wUsdtAmount');
  const feeEl=document.getElementById('wFee');
  const totalEl=document.getElementById('wTotal');
  
  const MIN_WITHDRAW = MIN_IN_FIAT;
  const FEE_PERCENT = 0;
  
  // Быстрые кнопки
  document.querySelectorAll('.quick-btn').forEach(btn => {
    btn.onclick = () => {
      amountEl.value = btn.getAttribute('data-amount');
      document.querySelectorAll('.quick-btn').forEach(b => {
        b.style.borderColor = '#333';
        b.style.background = '#1E1E1E';
      });
      btn.style.borderColor = '#F0B90B';
      btn.style.background = 'rgba(98,77,228,0.2)';
      recalc();
    };
    btn.onmouseenter = () => { if(btn.style.borderColor !== 'rgb(98, 77, 228)') btn.style.borderColor = '#555'; };
    btn.onmouseleave = () => { if(btn.style.borderColor !== 'rgb(98, 77, 228)') btn.style.borderColor = '#333'; };
  });
  
  async function recalc(){
    const a = Number(amountEl.value||0);
    const card = (cardEl.value||'').replace(/\s+/g,'');
    const name = (nameEl.value||'').trim();
    
    btn.disabled = !(a >= MIN_WITHDRAW && card.length >= 13 && name.length >= 3);
    
    if(a > 0 && a < MIN_WITHDRAW){
      const minDisplay = `${Math.ceil(MIN_WITHDRAW).toLocaleString('ru-RU')} ${fiatSymbol}`;
      calcEl.innerHTML = `<span style="color:#F6465D;font-weight:bold;">❌ ${i18n.lang === 'ru' ? 'Минимум' : 'Minimum'}: ${minDisplay}</span>`;
      amountEl.style.borderColor = '#F6465D';
      calcBox.style.display = 'none';
    } else if(a >= MIN_WITHDRAW){
      amountEl.style.borderColor = '#F0B90B';
      calcEl.textContent = '';
      calcBox.style.display = 'block';
      
      const usdtAmount = a / fiatRate;
      const fee = usdtAmount * (FEE_PERCENT / 100);
      const total = usdtAmount + fee;
      
      usdtAmountEl.textContent = `${usdtAmount.toFixed(2)}$`;
      totalEl.textContent = `${total.toFixed(2)}$`;
    } else { 
      amountEl.style.borderColor = '';
      calcEl.textContent = '';
      calcBox.style.display = 'none';
    }
  }
  
  amountEl.oninput = recalc;
  cardEl.oninput = recalc;
  nameEl.oninput = recalc;
  recalc();
  
  btn.onclick = async () => {
    const payload = {
      amount_rub: Number(amountEl.value||0),
      card_number: (cardEl.value||'').replace(/\s+/g,''),
      full_name: (nameEl.value||'').trim()
    };
    
    if(!payload.card_number || payload.card_number.length < 13) {
      toast('Введите корректный номер карты');
      return;
    }
    
    if(!payload.full_name || payload.full_name.length < 3) {
      toast('Введите ФИО получателя');
      return;
    }
    
    try{
      const res = await apiFetch('/api/withdraw',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      const data = await res.json();
      if(data.ok){ toast('✅ Заявка отправлена!'); renderAssets(); } else toast(data.error||t('toast.error'));
    }catch(e){ toast(t('toast.error')); }
  };
}

// -------- Exchange ----------
async function openExchange(){
  setActive('assets');
  const cont=document.getElementById('root');
  
  // Get user data and rates
  let user = { balance_usdt: 0, balance_rub: 0, wallets: {}, preferred_fiat: 'RUB' };
  await updateRates();
  try { 
    user = await (await apiFetch('/api/user')).json();
  } catch(e) {}
  
  const prefFiat = user.preferred_fiat || 'RUB';
  const fiatSymbol = CURRENCY_SYMBOLS[prefFiat] || '₽';
  const fiatRate = getRateForCurrency(prefFiat);
  
  const allOptions = [prefFiat,'USDT','BTC','ETH','TON','SOL','BNB','XRP','DOGE','LTC','TRX'];
  const cryptoOptions = ['USDT','BTC','ETH','TON','SOL','BNB','XRP','DOGE','LTC','TRX'];
  const fiatDisplay = `${fiatSymbol} ${prefFiat}`;
  const fromOptions = allOptions.map(c => `<option value="${c}"${c === 'USDT' ? ' selected' : ''}>${c === prefFiat ? fiatDisplay : c}</option>`).join('');
  const toOptions = allOptions.filter(c => c !== 'USDT').map(c => `<option value="${c}"${c === prefFiat ? ' selected' : ''}>${c === prefFiat ? fiatDisplay : c}</option>`).join('');
  
  cont.innerHTML = `
  <div class="container">
    <button class="btn" id="backAssets" style="background:transparent;border:none;color:#fff;font-size:16px;padding:8px 0;margin-bottom:16px">← ${t('btn.back')}</button>
    <div class="section" style="margin-top:10px">
      <div class="section-header"><div class="section-title">🔄 Обмен валют</div></div>
      <div class="section-content">
        <div style="background:rgba(240,185,11,0.1);border:1px solid rgba(240,185,11,0.2);border-radius:6px;padding:14px;margin-bottom:16px">
          <div style="font-size:12px;color:#9ca3af;margin-bottom:4px">Доступный баланс</div>
          <div id="exAvailBalance" style="font-size:20px;font-weight:700;color:#0ECB81">${Number(user.balance_usdt||0).toFixed(2)} USDT</div>
        </div>
        
        <div class="inline" style="gap:8px;align-items:flex-end">
          <div style="flex:1">
            <label class="label">Отдаю</label>
            <select id="exFrom" style="width:100%;padding:12px;border-radius:6px;border:1px solid #333;background:#1E2329;color:#fff;font-size:15px">${fromOptions}</select>
          </div>
          <button id="exSwap" style="padding:12px;background:#F0B90B;border:none;border-radius:6px;color:#fff;font-size:18px;cursor:pointer;margin-bottom:0;min-width:48px" title="Поменять местами">⇄</button>
          <div style="flex:1">
            <label class="label">Получаю</label>
            <select id="exTo" style="width:100%;padding:12px;border-radius:6px;border:1px solid #333;background:#1E2329;color:#fff;font-size:15px">${toOptions}</select>
          </div>
        </div>
        
        <div style="margin-top:16px">
          <label class="label">Сумма</label>
          <div style="display:flex;gap:8px">
            <input type="number" inputmode="decimal" id="exAmount" class="input" placeholder="0.00" style="flex:1;font-size:18px"/>
            <button id="exMax" style="padding:10px 16px;background:rgba(240,185,11,0.15);border:1px solid rgba(240,185,11,0.3);border-radius:6px;color:#F0B90B;font-weight:600;cursor:pointer">MAX</button>
          </div>
        </div>
        
        <div id="exQuote" style="min-height:24px;margin-top:12px;padding:14px;background:rgba(0,200,83,0.1);border-radius:6px;text-align:center;font-weight:600;color:#0ECB81;display:none"></div>
        
        <div id="exRateInfo" style="margin-top:12px;padding:10px;background:#1E2329;border-radius:6px;text-align:center;font-size:12px;color:#9ca3af;display:none">
          <span id="exRateText">${i18n.lang === 'ru' ? 'Курс' : 'Rate'}: 1$ = ${fiatRate.toFixed(2)} ${fiatSymbol}</span> • ${i18n.lang === 'ru' ? 'Комиссия' : 'Fee'} 2%
        </div>
        
        <button class="btn btn-green fullwidth" id="exSubmit" style="margin-top:16px;padding:16px;font-size:16px;border-radius:6px">🔄 Обменять</button>
      </div>
    </div>
  </div>`;
  
  document.getElementById('backAssets').onclick = renderAssets;
  const fromEl=document.getElementById('exFrom'), toEl=document.getElementById('exTo'), amtEl=document.getElementById('exAmount'), qEl=document.getElementById('exQuote');
  const balEl=document.getElementById('exAvailBalance');
  const rateInfoEl=document.getElementById('exRateInfo');
  const rateTextEl=document.getElementById('exRateText');
  
  // Check if user's fiat currency is involved in exchange
  function isFiatExchange() {
    return fromEl.value === prefFiat || toEl.value === prefFiat;
  }
  
  // Update available balance when currency changes
  function updateBalance() {
    const sym = fromEl.value;
    let bal, decimals, suffix;
    if (sym === prefFiat) {
      bal = user.balance_rub || 0;
      decimals = 2;
      suffix = fiatSymbol;
    } else if (sym === 'USDT') {
      bal = user.balance_usdt || 0;
      decimals = 2;
      suffix = 'USDT';
    } else {
      bal = user.wallets?.[sym] || 0;
      decimals = 6;
      suffix = sym;
    }
    balEl.textContent = `${Number(bal||0).toFixed(decimals)} ${suffix}`;
  }
  
  // Update "to" select based on "from" selection
  function updateToOptions() {
    const fromVal = fromEl.value;
    const currentTo = toEl.value;
    let newToVal = currentTo;
    
    // If same currency selected, auto-switch
    if (fromVal === currentTo) {
      if (fromVal === prefFiat) newToVal = 'USDT';
      else if (fromVal === 'USDT') newToVal = prefFiat;
      else newToVal = 'USDT';
    }
    
    // If fiat is selected, only allow USDT as target
    let availableOptions;
    if (fromVal === prefFiat) {
      availableOptions = ['USDT'];
    } else if (fromVal === 'USDT') {
      availableOptions = [prefFiat, ...cryptoOptions.filter(c => c !== 'USDT')];
    } else {
      availableOptions = ['USDT', ...cryptoOptions.filter(c => c !== 'USDT' && c !== fromVal)];
    }
    
    toEl.innerHTML = availableOptions
      .map(c => `<option value="${c}"${c === newToVal ? ' selected' : ''}>${c === prefFiat ? fiatDisplay : c}</option>`)
      .join('');
    
    // Show rate info for fiat exchanges
    if (isFiatExchange()) {
      rateInfoEl.style.display = 'block';
      rateTextEl.textContent = `${i18n.lang === 'ru' ? 'Курс' : 'Rate'}: 1$ = ${fiatRate.toFixed(2)} ${fiatSymbol}`;
    } else {
      rateInfoEl.style.display = 'none';
    }
  }
  
  // Swap button
  document.getElementById('exSwap').onclick = () => {
    const fromVal = fromEl.value;
    const toVal = toEl.value;
    
    // Rebuild from options
    fromEl.innerHTML = allOptions
      .map(c => `<option value="${c}"${c === toVal ? ' selected' : ''}>${c === prefFiat ? fiatDisplay : c}</option>`)
      .join('');
    
    updateToOptions();
    toEl.value = fromVal;
    updateBalance();
    amtEl.value = '';
    qEl.style.display = 'none';
  };
  
  // Max button
  document.getElementById('exMax').onclick = () => {
    const sym = fromEl.value;
    let bal;
    if (sym === prefFiat) bal = user.balance_rub || 0;
    else if (sym === 'USDT') bal = user.balance_usdt || 0;
    else bal = user.wallets?.[sym] || 0;
    amtEl.value = Number(bal||0).toFixed(sym === prefFiat || sym === 'USDT' ? 2 : 6);
    quote();
  };
  
  // Initialize
  updateToOptions();
  updateBalance();
  
  function validateSame(){ 
    if(fromEl.value===toEl.value){ 
      qEl.textContent='Нельзя выбрать одинаковую валюту'; 
      qEl.style.display='block';
      qEl.style.background='rgba(239,68,68,0.1)';
      qEl.style.color='#ef4444';
      return false;
    } 
    qEl.style.display='none';
    return true; 
  }
  fromEl.onchange = () => { updateToOptions(); updateBalance(); validateSame(); quote(); };
  toEl.onchange = () => { validateSame(); quote(); };
  let lastQuote = null;
  
  async function quote(){
    if(!validateSame()) return;
    const a=Number(amtEl.value||0); 
    if(a<=0){ 
      qEl.style.display='none'; 
      lastQuote=null; 
      return; 
    }
    try{
      let r;
      if (isFiatExchange()) {
        r = await (await fetch(`/api/exchange/rub/quote?from=${fromEl.value}&to=${toEl.value}&amount=${a}`)).json();
      } else {
        r = await (await fetch(`/api/exchange/quote?from=${fromEl.value}&to=${toEl.value}&amount=${a}`)).json();
      }
      lastQuote = r;
      const toSym = toEl.value;
      const toDecimals = toSym === prefFiat ? 2 : (toSym === 'USDT' ? 2 : 6);
      const toSuffix = toSym === prefFiat ? fiatSymbol : toSym;
      qEl.innerHTML = `${i18n.lang === 'ru' ? 'Вы получите' : 'You receive'}: <span style="font-size:18px;font-weight:700">${Number(r.amount_to||0).toFixed(toDecimals)} ${toSuffix}</span>`;
      qEl.style.display='block';
      qEl.style.background='rgba(0,200,83,0.1)';
      qEl.style.color='#0ECB81';
    }catch(e){ 
      qEl.style.display='none'; 
      lastQuote=null; 
    }
  }
  amtEl.oninput=quote;
  document.getElementById('exSubmit').onclick = async ()=>{
    if(!validateSame()) return;
    const amount = Number(amtEl.value||0);
    if(amount <= 0) { toast('Введите сумму'); return; }
    
    try{
      let res, data;
      
      if (isFiatExchange()) {
        // Use fiat exchange API
        const payload = {
          from_currency: fromEl.value,
          to_currency: toEl.value,
          amount: amount
        };
        res = await apiFetch('/api/exchange/rub', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)});
      } else {
        // Use crypto exchange API
        const payload = {
          from: fromEl.value,
          to: toEl.value,
          amount: amount,
          expected_amount_to: lastQuote?.amount_to
        };
        res = await apiFetch('/api/exchange',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)});
      }
      
      data = await res.json();
      if(data.ok){ 
        toast('✅ Обмен выполнен'); 
        lastQuote = null;
        renderAssets(); 
      } else {
        toast(data.error||t('toast.error'));
        if(data.error && data.error.includes('Курс изменился')){
          setTimeout(() => quote(), 500);
        }
      }
    }catch(e){ 
      console.error('Exchange error:', e);
      toast(t('toast.error')); 
    }
  };
}

// -------- Wallet detail ----------
async function openWallet(sym){
  const cont=document.getElementById('root');
  const user = await (await apiFetch('/api/user')).json();
  const bal = user.wallets?.[sym] ?? (sym==='USDT'? user.balance_usdt: 0);
  cont.innerHTML = `
  <div class="container">
    <button class="btn" id="backAssets">← Назад</button>
    <div class="balance-card" style="margin-top:10px">
      <div class="small">${sym} ${t('common.balance')}</div>
      <div class="balance-amount">${Number(bal||0).toFixed(6)} <span class="currency">${sym}</span></div>
      <div class="balance-actions">
        <button class="btn btn-primary" id="wDep">${t('btn.deposit')}</button>
        <button class="btn btn-green" id="wEx">${t('btn.exchange')}</button>
      </div>
    </div>
    <div class="section">
      <div class="section-header" id="whToggle"><div class="section-title">${t('history.title')} (${sym})</div></div>
      <div class="section-content hidden" id="walletHist"></div>
    </div>
  </div>`;
  document.getElementById('backAssets').onclick = renderAssets;
  document.getElementById('wDep').onclick = openDeposit;
  document.getElementById('wEx').onclick = openExchange;
  document.getElementById('whToggle').onclick = ()=> document.getElementById('walletHist').classList.toggle('hidden');
  
  // Add Create Check button for admin (USDT wallet only)
  const isAdmin = userData?.is_admin === true;
  if (isAdmin && sym === 'USDT') {
    const checkBtn = document.createElement('button');
    checkBtn.className = 'btn btn-secondary';
    checkBtn.textContent = '🎁 Создать чек';
    checkBtn.style.marginTop = '10px';
    checkBtn.onclick = createCheck;
    document.querySelector('.balance-card').appendChild(checkBtn);
  }
  const h = await (await apiFetch('/api/history?symbol='+encodeURIComponent(sym))).json();
  const wrap = document.getElementById('walletHist'); const ul=document.createElement('div');
  (h||[]).forEach(x=>{ const row=document.createElement('div'); row.className='small'; row.textContent = `${x.type} • ${x.amount} ${x.currency} • ${new Date(x.created_at).toLocaleString()}`; ul.appendChild(row); });
  wrap.appendChild(ul);
}

// -------- Trade ----------
// Crypto logos mapping (using cryptocurrency-icons CDN)
const cryptoLogos = {
  'BTC': 'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/btc.svg',
  'ETH': 'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/eth.svg',
  'SOL': 'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/sol.svg',
  'ADA': 'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/ada.svg',
  'DOT': 'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/dot.svg',
  'LINK': 'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/link.svg',
  'MATIC': 'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/matic.svg',
  'AVAX': 'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/avax.svg',
  'XRP': 'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/xrp.svg',
  'DOGE': 'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/doge.svg',
  'SHIB': 'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/shib.svg',
  'UNI': 'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/uni.svg',
  'LTC': 'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/ltc.svg',
  'BCH': 'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/bch.svg',
  'TRX': 'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/trx.svg'
};

async function renderTrade(){
  restoreHeader(); // Restore original header
  setActive('trade');
  const cont=document.getElementById('root');
  cont.innerHTML = `
  <div class="container">
    <div class="section">
      <div class="section-header"><div class="section-title" id="pairsTitle">📊 ${i18n.lang==='en'?'Trading Pairs':'Торговые пары'}</div></div>
      <div class="section-content" id="pairList"></div>
    </div>
  </div>`;
  const pairs=["BTC/USDT","ETH/USDT","SOL/USDT","ADA/USDT","DOT/USDT","LINK/USDT","MATIC/USDT","AVAX/USDT","XRP/USDT","DOGE/USDT","SHIB/USDT","UNI/USDT","LTC/USDT","BCH/USDT","TRX/USDT"];
  const wrap=document.getElementById('pairList');
  
  // Fetch tickers with prices and 24h change
  let tickers = {};
  try {
    const res = await apiFetch('/api/tickers');
    if (res.ok) {
      tickers = await res.json();
    }
  } catch (e) {}
  
  // Full crypto names
  const cryptoNames = {
    'BTC': 'Bitcoin', 'ETH': 'Ethereum', 'SOL': 'Solana', 'ADA': 'Cardano',
    'DOT': 'Polkadot', 'LINK': 'Chainlink', 'MATIC': 'Polygon', 'AVAX': 'Avalanche',
    'XRP': 'Ripple', 'DOGE': 'Dogecoin', 'SHIB': 'Shiba Inu', 'UNI': 'Uniswap',
    'LTC': 'Litecoin', 'BCH': 'Bitcoin Cash', 'TRX': 'Tron'
  };
  
  pairs.forEach(p => {
    const symbol = p.split('/')[0];
    const logo = cryptoLogos[symbol] || '';
    const name = cryptoNames[symbol] || symbol;
    const ticker = tickers[symbol] || { price: 0, change_24h: 0 };
    const price = ticker.price || 0;
    const change = ticker.change_24h || 0;
    const changeColor = change >= 0 ? '#0ECB81' : '#F6465D';
    const changeSign = change >= 0 ? '+' : '';
    const priceFormatted = price >= 1 ? price.toFixed(2) : price.toFixed(price < 0.001 ? 6 : 4);
    
    const card = document.createElement('div');
    card.className = 'trade-pair-row';
    card.setAttribute('data-pair', p);
    card.style.cssText = 'display:flex;align-items:center;padding:16px;margin:16px 0;border:1px solid rgba(100,116,139,0.4);border-radius:6px;background:rgba(15,23,42,0.3);cursor:pointer;transition:all 0.2s';
    card.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;flex:1">
        <img src="${logo}" alt="${symbol}" style="width:38px;height:38px;border-radius:50%;background:#1E2329;padding:2px;border:1px solid rgba(240,185,11,0.2)" onerror="this.style.display='none'">
        <div style="flex:1">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-weight:600;font-size:14px;color:#fff">${symbol}/USDT</span>
            <span style="font-weight:600;font-size:14px;color:#fff">${priceFormatted}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:2px">
            <span style="font-size:11px;color:#848E9C">${name}</span>
            <span style="font-size:12px;color:${changeColor};font-weight:500">${changeSign}${change.toFixed(2)}%</span>
          </div>
        </div>
      </div>
    `;
    wrap.appendChild(card);
  });
  
  // Add click handlers
  document.querySelectorAll('.trade-pair-row').forEach(row => {
    row.onclick = () => {
      const pair = row.getAttribute('data-pair');
      if (pair) openPair(pair);
    };
  });
}

async function openPair(pair, displayName = null){
  setActive('trade');
  const cont=document.getElementById('root');
  const title = displayName || pair;
  const symbol = pair.split('/')[0];
  const logo = cryptoLogos[symbol] || '';
  
  // Модифицируем верхний header
  const headerBrand = document.querySelector('.header .brand');
  const headerActions = document.querySelector('.header .actions');
  
  headerBrand.innerHTML = `<button class="btn" id="backTrade" style="background:transparent;border:none;color:#fff;font-size:20px;padding:5px 10px">←</button>`;
  headerActions.innerHTML = `<span style="color:#fff;font-weight:600;font-size:15px;padding:6px 14px;border:1px solid #F0B90B;border-radius:6px;background:rgba(240,185,11,0.1)">${title}</span>`;
  
  cont.innerHTML = `
  <div class="container" style="padding:0">
    <!-- Кнопки таймфреймов -->
    <div id="timeframeBar" style="display:flex;gap:4px;padding:8px 10px;background:#0e1219;border-bottom:1px solid #1f2937;overflow-x:auto;scrollbar-width:none;-ms-overflow-style:none">
      <button class="tf-btn" data-tf="1" style="padding:6px 12px;background:#1f2937;border:none;border-radius:4px;color:#9ca3af;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;transition:all 0.2s">1м</button>
      <button class="tf-btn active" data-tf="5" style="padding:6px 12px;background:#8b5cf6;border:none;border-radius:4px;color:#fff;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;transition:all 0.2s">5м</button>
      <button class="tf-btn" data-tf="15" style="padding:6px 12px;background:#1f2937;border:none;border-radius:4px;color:#9ca3af;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;transition:all 0.2s">15м</button>
      <button class="tf-btn" data-tf="30" style="padding:6px 12px;background:#1f2937;border:none;border-radius:4px;color:#9ca3af;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;transition:all 0.2s">30м</button>
      <button class="tf-btn" data-tf="60" style="padding:6px 12px;background:#1f2937;border:none;border-radius:4px;color:#9ca3af;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;transition:all 0.2s">1ч</button>
      <button class="tf-btn" data-tf="240" style="padding:6px 12px;background:#1f2937;border:none;border-radius:4px;color:#9ca3af;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;transition:all 0.2s">4ч</button>
      <button class="tf-btn" data-tf="1440" style="padding:6px 12px;background:#1f2937;border:none;border-radius:4px;color:#9ca3af;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;transition:all 0.2s">1д</button>
    </div>
    
    <!-- TradingView Lightweight Chart (OKX Data) -->
    <div id="price_chart" style="height:calc(50vh - 120px);width:100%;background:#0e1219;position:relative"></div>
    
    <!-- Trade Parameters Block -->
    <div id="tradeParamsBlock" style="padding:12px 15px;background:#0e1219;border-top:1px solid #1f2937">
      <!-- Amount Input Row -->
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <span style="color:#848E9C;font-size:12px;min-width:50px">${i18n.lang === 'ru' ? 'Сумма:' : 'Amount:'}</span>
        <div style="flex:1;display:flex;align-items:center;background:#1f2937;border-radius:6px;padding:4px 8px">
          <input type="number" id="quickAmount" value="100" min="5" step="10" 
            style="flex:1;background:transparent;border:none;color:#F0B90B;font-size:16px;font-weight:700;font-family:monospace;outline:none;width:60px" />
          <span style="color:#848E9C;font-size:12px;font-weight:600">USDT</span>
        </div>
      </div>
      
      <!-- Timer Selection Row -->
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;overflow-x:auto;scrollbar-width:none">
        <span style="color:#848E9C;font-size:12px;min-width:50px">${i18n.lang === 'ru' ? 'Время:' : 'Timer:'}</span>
        <div style="display:flex;gap:4px">
          <button class="timer-btn" data-dur="30" style="padding:6px 10px;background:#1f2937;border:1px solid transparent;border-radius:4px;color:#9ca3af;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;transition:all 0.2s;font-family:monospace">30с</button>
          <button class="timer-btn active" data-dur="60" style="padding:6px 10px;background:#F0B90B;border:1px solid #F0B90B;border-radius:4px;color:#0B0E11;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;transition:all 0.2s;font-family:monospace">1м</button>
          <button class="timer-btn" data-dur="300" style="padding:6px 10px;background:#1f2937;border:1px solid transparent;border-radius:4px;color:#9ca3af;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;transition:all 0.2s;font-family:monospace">5м</button>
          <button class="timer-btn" data-dur="900" style="padding:6px 10px;background:#1f2937;border:1px solid transparent;border-radius:4px;color:#9ca3af;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;transition:all 0.2s;font-family:monospace">15м</button>
          <button class="timer-btn" data-dur="1800" style="padding:6px 10px;background:#1f2937;border:1px solid transparent;border-radius:4px;color:#9ca3af;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;transition:all 0.2s;font-family:monospace">30м</button>
        </div>
      </div>
      
      <!-- Potential Profit Display -->
      <div id="profitPreview" style="text-align:center;padding:6px 10px;background:rgba(14,203,129,0.1);border:1px solid rgba(14,203,129,0.3);border-radius:6px">
        <span style="color:#848E9C;font-size:12px">${i18n.lang === 'ru' ? 'Ставка:' : 'Stake:'} </span>
        <span id="stakeDisplay" style="color:#F0B90B;font-weight:700;font-family:monospace">100 USDT</span>
        <span style="color:#848E9C;font-size:12px"> → </span>
        <span style="color:#0ECB81;font-size:13px;font-weight:700">${i18n.lang === 'ru' ? 'Возможная прибыль:' : 'Potential profit:'} </span>
        <span id="profitDisplay" style="color:#0ECB81;font-weight:700;font-family:monospace">+70 USDT</span>
      </div>
    </div>
    
    <!-- Кнопки купить/продать -->
    <div style="padding:10px 15px;display:flex;gap:10px">
      <button class="btn btn-green" id="btnBuy" style="flex:1;font-size:15px;font-weight:700;padding:14px;border-radius:8px;transition:all 0.2s;box-shadow:0 2px 8px rgba(14,203,129,0.3);background:#0ECB81;font-family:monospace">
        <span id="btnBuyText">${t('trade.buy')}</span>
        <span id="btnBuyTimer" style="display:none;margin-left:4px"></span>
      </button>
      <button class="btn btn-red" id="btnSell" style="flex:1;font-size:15px;font-weight:700;padding:14px;border-radius:8px;transition:all 0.2s;box-shadow:0 2px 8px rgba(246,70,93,0.3);background:#F6465D;font-family:monospace">
        <span id="btnSellText">${t('trade.sell')}</span>
        <span id="btnSellTimer" style="display:none;margin-left:4px"></span>
      </button>
    </div>
    
    <!-- Список сделок -->
    <div style="padding:0 15px 15px">
      <div style="font-weight:600;font-size:16px;color:#fff;margin-bottom:12px">${t('trade.list.title')}</div>
      <div style="display:flex;gap:15px;margin-bottom:10px;border-bottom:1px solid #1f1f1f">
        <div class="trade-tab active" data-filter="active" style="padding:8px 0;color:#F0B90B;font-weight:600;border-bottom:2px solid #F0B90B;cursor:pointer;font-size:14px">${t('trade.list.active')}</div>
        <div class="trade-tab" data-filter="closed" style="padding:8px 0;color:#9ca3af;font-weight:600;cursor:pointer;font-size:14px">${t('trade.list.closed')}</div>
        <div class="trade-tab" data-filter="all" style="padding:8px 0;color:#9ca3af;font-weight:600;cursor:pointer;font-size:14px">${t('trade.list.all')}</div>
      </div>
      <div id="tradesList" style="max-height:calc(100vh - 520px);overflow-y:auto;overflow-x:hidden"></div>
    </div>
  </div>
  
  <!-- Модальное окно для ввода суммы и длительности -->
  <div id="tradeModal" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:9999;animation:fadeIn 0.3s">
    <div id="modalContent" style="position:absolute;bottom:0;left:0;right:0;background:#1a1a1a;border-radius:16px 16px 0 0;padding:20px;animation:slideUp 0.3s;max-height:80vh;overflow-y:auto">
      <!-- Заголовок -->
      <div style="text-align:center;margin-bottom:20px">
        <div style="font-size:14px;color:#9ca3af;margin-bottom:5px" id="modalSubtitle">${t('trade.modal.buying')}</div>
        <div style="font-size:32px;font-weight:700;color:#fff" id="modalTitle">BTC</div>
      </div>
      
      <!-- Поле ввода суммы -->
      <div style="margin-bottom:20px">
        <input type="number" id="modalAmount" placeholder="0" min="5" step="1" 
          style="width:100%;padding:0;background:transparent;border:none;color:#8b5cf6;font-size:48px;font-weight:700;text-align:center;outline:none" 
          value="0"/>
        <div style="text-align:center;font-size:18px;color:#fff;margin-top:5px">${t('common.usdt')}</div>
      </div>
      
      <!-- Доступный баланс -->
      <div style="text-align:center;margin-bottom:25px">
        <span style="color:#9ca3af;font-size:14px">${t('trade.modal.available')}: </span>
        <span style="color:#fff;font-weight:600" id="modalBalance">0 ${t('common.usdt')}</span>
      </div>
      
      <!-- Длительность сделки -->
      <div style="margin-bottom:25px">
        <div style="color:#9ca3af;font-size:13px;margin-bottom:10px">${t('trade.modal.duration')}</div>
        <div id="modalDurationChips" style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center">
          <div class="chip" data-dur="30" style="padding:12px 20px;font-size:15px">${t('trade.duration.30s')}</div>
          <div class="chip active" data-dur="60" style="padding:12px 20px;font-size:15px">${t('trade.duration.1m')}</div>
          <div class="chip" data-dur="300" style="padding:12px 20px;font-size:15px">${t('trade.duration.5m')}</div>
          <div class="chip" data-dur="900" style="padding:12px 20px;font-size:15px">${t('trade.duration.15m')}</div>
          <div class="chip" data-dur="1800" style="padding:12px 20px;font-size:15px">${t('trade.duration.30m')}</div>
          <div class="chip" data-dur="3600" style="padding:12px 20px;font-size:15px">${t('trade.duration.1h')}</div>
        </div>
      </div>
      
      <!-- Кнопка назад -->
      <button id="modalBack" style="width:100%;padding:16px;background:#2a2a2a;color:#fff;border:none;border-radius:8px;font-size:16px;font-weight:600;margin-bottom:10px;cursor:pointer">${t('btn.back')}</button>
      
      <!-- Кнопка подтверждения -->
      <button id="modalConfirm" style="width:100%;padding:16px;background:#F0B90B;color:#fff;border:none;border-radius:6px;font-size:16px;font-weight:600;cursor:pointer">${t('trade.buy')}</button>
    </div>
  </div>
  
  <style>
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes slideUp {
      from { transform: translateY(100%); }
      to { transform: translateY(0); }
    }
    @keyframes pulse-green {
      0%, 100% { box-shadow: 0 0 0 0 rgba(14, 203, 129, 0.7); }
      50% { box-shadow: 0 0 0 8px rgba(14, 203, 129, 0); }
    }
    @keyframes pulse-red {
      0%, 100% { box-shadow: 0 0 0 0 rgba(246, 70, 93, 0.7); }
      50% { box-shadow: 0 0 0 8px rgba(246, 70, 93, 0); }
    }
    .timer-btn:hover { border-color: #F0B90B !important; }
  </style>
  `;
  
  // Обработчик кнопки назад
  document.getElementById('backTrade').onclick = () => {
    renderTrade(); // Will restore header automatically
  };
  
  const sym=pair.replace('/','');
  
  // Timeframe mapping: minutes → string format
  const tfMap = {
    1: '1m',
    2: '2m',
    5: '5m',
    10: '10m',
    15: '15m',
    30: '30m',
    60: '1h',
    240: '4h',
    1440: '1d'
  };
  
  // Timeframe state (candle interval in minutes)
  let selectedTimeframe = 5; // Default: 5 minutes
  
  // Duration state (trade duration)
  let selectedDuration = 60;
  let selectedSide = 'buy';
  
  // Modal elements
  const tradeModal = document.getElementById('tradeModal');
  const modalTitle = document.getElementById('modalTitle');
  const modalSubtitle = document.getElementById('modalSubtitle');
  const modalAmount = document.getElementById('modalAmount');
  const modalBalance = document.getElementById('modalBalance');
  const modalConfirm = document.getElementById('modalConfirm');
  const modalBack = document.getElementById('modalBack');
  
  // Load user balance
  async function loadUserBalance() {
    try {
      const res = await apiFetch('/api/user');
      const user = await res.json();
      modalBalance.textContent = `${parseFloat(user.balance_usdt || 0).toFixed(2)} ${t('common.usdt')}`;
    } catch (e) {
      console.error('Failed to load balance:', e);
    }
  }
  
  // Open modal
  function openTradeModal(side) {
    selectedSide = side;
    const coinName = pair.split('/')[0];
    
    if (side === 'buy') {
      modalSubtitle.textContent = t('trade.modal.buying');
      modalTitle.textContent = coinName;
      modalConfirm.textContent = t('trade.buy');
      modalConfirm.style.background = '#0ECB81';
    } else {
      modalSubtitle.textContent = t('trade.modal.selling');
      modalTitle.textContent = coinName;
      modalConfirm.textContent = t('trade.sell');
      modalConfirm.style.background = '#F6465D';
    }
    
    // Use amount from quick input
    const quickAmt = document.getElementById('quickAmount');
    modalAmount.value = quickAmt ? quickAmt.value : '100';
    
    loadUserBalance();
    tradeModal.style.display = 'block';
    
    // Focus on amount input
    setTimeout(() => modalAmount.focus(), 300);
  }
  
  // Close modal
  function closeTradeModal() {
    tradeModal.style.display = 'none';
  }
  
  // Modal duration chips logic
  document.querySelectorAll('#modalDurationChips .chip').forEach(chip => {
    chip.onclick = () => {
      document.querySelectorAll('#modalDurationChips .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      selectedDuration = parseInt(chip.getAttribute('data-dur'));
    };
  });
  
  // Timer buttons logic (quick selection above BUY/SELL)
  const timerBtns = document.querySelectorAll('.timer-btn');
  timerBtns.forEach(btn => {
    btn.onclick = () => {
      timerBtns.forEach(b => {
        b.style.background = '#1f2937';
        b.style.border = '1px solid transparent';
        b.style.color = '#9ca3af';
        b.classList.remove('active');
      });
      btn.style.background = '#F0B90B';
      btn.style.border = '1px solid #F0B90B';
      btn.style.color = '#0B0E11';
      btn.classList.add('active');
      selectedDuration = parseInt(btn.getAttribute('data-dur'));
      
      // Sync with modal chips
      document.querySelectorAll('#modalDurationChips .chip').forEach(c => {
        c.classList.remove('active');
        if (parseInt(c.getAttribute('data-dur')) === selectedDuration) {
          c.classList.add('active');
        }
      });
    };
  });
  
  // Quick amount input and profit calculation
  const quickAmountInput = document.getElementById('quickAmount');
  const stakeDisplay = document.getElementById('stakeDisplay');
  const profitDisplay = document.getElementById('profitDisplay');
  const PAYOUT_RATE = 0.70; // 70% payout
  
  function updateProfitDisplay() {
    const amount = parseFloat(quickAmountInput.value) || 0;
    stakeDisplay.textContent = amount + ' USDT';
    const profit = amount * PAYOUT_RATE;
    profitDisplay.textContent = '+' + profit.toFixed(2) + ' USDT';
  }
  
  quickAmountInput.oninput = updateProfitDisplay;
  quickAmountInput.onchange = updateProfitDisplay;
  
  // Track active trades for this pair to update buttons
  let activeTradeForPair = null;
  let buttonTimerInterval = null;
  
  // Update BUY/SELL buttons based on active trades
  async function updateButtonsWithActiveTrades() {
    try {
      const res = await apiFetch('/api/trade/active');
      if (!res.ok) return;
      const tradesData = await res.json();
      const activeTrades = Array.isArray(tradesData) ? tradesData : (tradesData.trades || []);
      
      // Find active trade for current pair
      const pairNormalized = pair.replace('-', '').replace('/', '');
      const tradeForPair = activeTrades.find(t => 
        t.pair.replace('-', '').replace('/', '') === pairNormalized && 
        (t.is_active || t.status === 'active')
      );
      
      const btnBuy = document.getElementById('btnBuy');
      const btnSell = document.getElementById('btnSell');
      const btnBuyText = document.getElementById('btnBuyText');
      const btnSellText = document.getElementById('btnSellText');
      const btnBuyTimer = document.getElementById('btnBuyTimer');
      const btnSellTimer = document.getElementById('btnSellTimer');
      
      if (!btnBuy || !btnSell) return;
      
      if (tradeForPair) {
        activeTradeForPair = tradeForPair;
        const timeLeft = tradeForPair.time_left_sec || 0;
        const mins = Math.floor(timeLeft / 60);
        const secs = timeLeft % 60;
        const timerText = `(${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')})`;
        
        if (tradeForPair.side === 'buy') {
          btnBuyText.textContent = t('trade.buy');
          btnBuyTimer.textContent = timerText;
          btnBuyTimer.style.display = 'inline';
          btnBuy.style.background = 'linear-gradient(135deg, #0ECB81, #0BA069)';
          btnBuy.style.animation = 'pulse-green 1.5s infinite';
          
          btnSellText.textContent = t('trade.sell');
          btnSellTimer.style.display = 'none';
          btnSell.style.background = '#F6465D';
          btnSell.style.animation = 'none';
          btnSell.style.opacity = '0.5';
        } else {
          btnSellText.textContent = t('trade.sell');
          btnSellTimer.textContent = timerText;
          btnSellTimer.style.display = 'inline';
          btnSell.style.background = 'linear-gradient(135deg, #F6465D, #D43850)';
          btnSell.style.animation = 'pulse-red 1.5s infinite';
          
          btnBuyText.textContent = t('trade.buy');
          btnBuyTimer.style.display = 'none';
          btnBuy.style.background = '#0ECB81';
          btnBuy.style.animation = 'none';
          btnBuy.style.opacity = '0.5';
        }
      } else {
        activeTradeForPair = null;
        btnBuyText.textContent = t('trade.buy');
        btnBuyTimer.style.display = 'none';
        btnBuy.style.background = '#0ECB81';
        btnBuy.style.animation = 'none';
        btnBuy.style.opacity = '1';
        
        btnSellText.textContent = t('trade.sell');
        btnSellTimer.style.display = 'none';
        btnSell.style.background = '#F6465D';
        btnSell.style.animation = 'none';
        btnSell.style.opacity = '1';
      }
    } catch (e) {
      console.error('Failed to update buttons:', e);
    }
  }
  
  // Initial update and interval
  updateButtonsWithActiveTrades();
  buttonTimerInterval = setInterval(updateButtonsWithActiveTrades, 1000);
  
  // Modal buttons
  modalBack.onclick = closeTradeModal;
  modalConfirm.onclick = () => {
    const amount = parseFloat(modalAmount.value);
    if (!amount || amount < 5) {
      alert(t('trade.modal.min_amount'));
      return;
    }
    closeTradeModal();
    placeOrder(pair, selectedSide, selectedDuration, amount);
  };
  
  // Initialize TradingView Lightweight Charts with OKX data
  const chartContainer = document.getElementById('price_chart');
  
  // Create chart
  const chart = LightweightCharts.createChart(chartContainer, {
    width: chartContainer.clientWidth,
    height: chartContainer.clientHeight,
    layout: {
      background: { color: '#0e1219' },
      textColor: '#9ca3af',
    },
    grid: {
      vertLines: { color: '#1a1a1a' },
      horzLines: { color: '#1a1a1a' },
    },
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Normal,
    },
    rightPriceScale: {
      borderColor: '#2a2a2a',
    },
    timeScale: {
      borderColor: '#2a2a2a',
      timeVisible: true,
      secondsVisible: false,
    },
  });

  // Create candlestick series
  const candleSeries = chart.addCandlestickSeries({
    upColor: '#0ECB81',
    downColor: '#F6465D',
    borderUpColor: '#0ECB81',
    borderDownColor: '#F6465D',
    wickUpColor: '#0ECB81',
    wickDownColor: '#F6465D',
  });

  let entryPriceLines = [];

  let activeTradeMarkers = [];
  let isFirstChartLoad = true;
  let userInteracting = false;

  // Track user interaction with chart
  chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
    userInteracting = true;
    setTimeout(() => { userInteracting = false; }, 5000); // Reset after 5s of no interaction
  });

  // Load and update chart data
  async function loadChartData() {
    try {
      const tf = tfMap[selectedTimeframe];
      const res = await apiFetch(`/api/candles?symbol=${sym}&tf=${tf}&limit=100`);
      const candles = await res.json();
      
      if (!candles || candles.length === 0) {
        chartContainer.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#9ca3af">Нет данных</div>';
        return;
      }

      // Convert OKX candles to TradingView format
      const candleData = candles.map(c => ({
        time: Math.floor(new Date(c.t).getTime() / 1000), // Unix timestamp in seconds
        open: c.o,
        high: c.h,
        low: c.l,
        close: c.c,
      }));

      candleSeries.setData(candleData);

      const candleTimes = candleData.map(c => c.time).sort((a, b) => a - b);

      function parseUTC(isoStr) {
        if (!isoStr) return 0;
        const s = isoStr.endsWith('Z') ? isoStr : isoStr + 'Z';
        return Math.floor(new Date(s).getTime() / 1000);
      }

      function snapToCandle(ts) {
        if (candleTimes.length === 0) return ts;
        let best = candleTimes[0];
        for (let i = candleTimes.length - 1; i >= 0; i--) {
          if (candleTimes[i] <= ts) { best = candleTimes[i]; break; }
        }
        return best;
      }

      try {
        const tradesRes = await apiFetch('/api/trade/active');
        if (!tradesRes.ok) throw new Error('API error');
        const tradesData = await tradesRes.json();
        const activeTrades = Array.isArray(tradesData) ? tradesData : (tradesData.trades || []);

        const pairNormalized = pair.replace('-', '').replace('/', '');
        const tradesForPair = activeTrades.filter(t =>
          t.pair.replace('-', '').replace('/', '') === pairNormalized
        );

        const markers = tradesForPair.map(t => {
          const rawTime = parseUTC(t.entry_time);
          const snappedTime = snapToCandle(rawTime);
          const color = t.side === 'buy' ? '#0ECB81' : '#F6465D';
          return {
            time: snappedTime,
            position: t.side === 'buy' ? 'belowBar' : 'aboveBar',
            color: color,
            shape: t.side === 'buy' ? 'arrowUp' : 'arrowDown',
            text: `${t.amount_usdt} USDT`,
          };
        });

        entryPriceLines.forEach(line => {
          try { candleSeries.removePriceLine(line); } catch(e) {}
        });
        entryPriceLines = [];

        tradesForPair.forEach(t => {
          const entryPrice = parseFloat(t.entry_price || t.start_price);
          if (!entryPrice) return;
          const lineColor = t.side === 'buy' ? '#0ECB81' : '#F6465D';
          const arrow = t.side === 'buy' ? '▲' : '▼';
          const labelText = `${arrow} ${t.amount_usdt} USDT @ $${entryPrice.toLocaleString('en-US', {maximumFractionDigits: 2})}`;
          const priceLine = candleSeries.createPriceLine({
            price: entryPrice,
            color: lineColor,
            lineWidth: 2,
            lineStyle: LightweightCharts.LineStyle.Dashed,
            axisLabelVisible: true,
            title: labelText,
          });
          entryPriceLines.push(priceLine);
        });

        let closedMarkers = [];
        try {
          const closedRes = await apiFetch(`/api/trades?status=closed&limit=10`);
          if (closedRes.ok) {
            const closedData = await closedRes.json();
            const closedTrades = closedData.trades || [];
            const closedForPair = closedTrades.filter(ct =>
              ct.pair.replace('-', '').replace('/', '') === pairNormalized
            );
            closedMarkers = closedForPair.map(ct => {
              const rawClose = parseUTC(ct.closed_at || ct.opened_at);
              const snappedClose = snapToCandle(rawClose);
              const isWin = ct.result === 'win';
              const color = isWin ? '#0ECB81' : '#F6465D';
              const sign = isWin ? '+' : '-';
              const amount = isWin ? (ct.payout || 0) : (ct.amount_usdt || 0);
              const label = isWin ? 'WIN' : 'LOSS';
              return {
                time: snappedClose,
                position: isWin ? 'aboveBar' : 'belowBar',
                color: color,
                shape: 'circle',
                text: `${label} ${sign}${Math.abs(amount).toFixed(0)}`,
              };
            });
          }
        } catch(e) {}

        const allMarkers = [...markers, ...closedMarkers].sort((a, b) => a.time - b.time);
        candleSeries.setMarkers(allMarkers);
        activeTradeMarkers = allMarkers;
      } catch (e) {
        console.error('Failed to load active trades:', e);
      }

      // Auto-fit content only on first load or when user is not interacting
      if (isFirstChartLoad) {
        chart.timeScale().fitContent();
        isFirstChartLoad = false;
      }

    } catch (e) {
      console.error('Chart load failed', e);
    }
  }

  // Handle window resize
  window.addEventListener('resize', () => {
    chart.applyOptions({
      width: chartContainer.clientWidth,
      height: chartContainer.clientHeight,
    });
  });

  window._loadChartData = loadChartData;

  loadChartData();
  const chartRefreshTimer = setInterval(loadChartData, 3000);
  
  // Timeframe buttons handler
  document.querySelectorAll('.tf-btn').forEach(btn => {
    btn.onclick = () => {
      // Update selected timeframe
      selectedTimeframe = parseInt(btn.getAttribute('data-tf'));
      
      // Update button styles
      document.querySelectorAll('.tf-btn').forEach(b => {
        b.style.background = '#1f2937';
        b.style.color = '#9ca3af';
        b.classList.remove('active');
      });
      btn.style.background = '#8b5cf6';
      btn.style.color = '#fff';
      btn.classList.add('active');
      
      // Reset chart state and reload with new timeframe
      isFirstChartLoad = true;
      loadChartData();
    };
  });
  
  // Buy/Sell buttons open modal
  const btnBuy = document.getElementById('btnBuy');
  const btnSell = document.getElementById('btnSell');
  
  btnBuy.onclick = () => openTradeModal('buy');
  btnSell.onclick = () => openTradeModal('sell');
  
  // Tabs logic
  let currentFilter = 'active';
  document.querySelectorAll('.trade-tab').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('.trade-tab').forEach(t => {
        t.classList.remove('active');
        t.style.color = '#9ca3af';
        t.style.borderBottom = 'none';
      });
      tab.classList.add('active');
      tab.style.color = '#624DE4';
      tab.style.borderBottom = '2px solid #624DE4';
      currentFilter = tab.getAttribute('data-filter');
      loadTradesList(currentFilter, pair);
    };
  });
  
  // Store previous trades to prevent flickering
  let previousTradesData = null;
  
  // Load trades list using new API with filtering
  async function loadTradesList(filter = 'active', currentPair = null) {
    try {
      // Use new /api/trades endpoint with status filter
      const statusParam = filter === 'all' ? '' : `?status=${filter}`;
      const res = await apiFetch(`/api/trades${statusParam}`);
      if (!res.ok) throw new Error('API error');
      const data = await res.json();
      let trades = data.trades || [];
      
      // Filter by current pair if specified (optional)
      const filtered = currentPair 
        ? trades.filter(t => t.pair === currentPair)
        : trades;
      
      const listDiv = document.getElementById('tradesList');
      if (!listDiv) return; // Element not on page (user navigated away)
      
      // Check if data changed to prevent flickering
      const currentDataHash = JSON.stringify(filtered.map(t => ({ id: t.id, status: t.status, result: t.result, time_left: t.time_left_sec })));
      if (currentDataHash === previousTradesData && listDiv.innerHTML !== '') {
        return; // No changes, skip update
      }
      previousTradesData = currentDataHash;
      
      if (!filtered || filtered.length === 0) {
        listDiv.innerHTML = `<div style="text-align:center;color:#9ca3af;padding:20px;font-size:13px">${t('trade.list.empty')}</div>`;
        return;
      }
      
      listDiv.innerHTML = filtered.map(trade => {
        const isBuy = trade.side === 'buy';
        const sideText = isBuy ? t('trade.side.buy') : t('trade.side.sell');
        const sideColor = isBuy ? '#0ECB81' : '#F6465D';
        const sideIcon = isBuy ? '↑' : '↓';
        const isActive = trade.is_active || trade.status === 'active';
        
        // Format prices (without $ for cleaner look)
        const openPriceNum = trade.start_price ? Number(trade.start_price).toLocaleString('en-US', {maximumFractionDigits: 2}) : '-';
        const closePriceNum = trade.close_price ? Number(trade.close_price).toLocaleString('en-US', {maximumFractionDigits: 2}) : '-';
        
        // Calculate result text and color
        let resultText = '';
        let resultColor = '#9ca3af';
        let statusBadge = '';
        let progressBarHtml = '';
        
        if (isActive) {
          // Active trade with timer and progress bar
          const timeLeft = trade.time_left_sec || 0;
          const totalDuration = trade.duration_sec || 60;
          const mins = Math.floor(timeLeft / 60);
          const secs = timeLeft % 60;
          resultText = `${mins}:${secs.toString().padStart(2, '0')}`;
          
          // Calculate progress percentage (remaining time)
          const progressPercent = Math.max(0, Math.min(100, (timeLeft / totalDuration) * 100));
          const progressColor = timeLeft <= 10 ? '#0ECB81' : '#F0B90B';
          resultColor = timeLeft <= 10 ? '#0ECB81' : '#F0B90B';
          
          statusBadge = `<span style="background:${resultColor}20;color:${resultColor};padding:3px 8px;border-radius:4px;font-size:11px;font-weight:700;letter-spacing:0.5px">${t('trade.status.active')}</span>`;
          
          // Progress bar HTML
          progressBarHtml = `
            <div style="margin-top:6px;width:100%">
              <div style="background:#2B3139;border-radius:2px;height:4px;overflow:hidden">
                <div style="background:${progressColor};height:100%;width:${progressPercent}%;border-radius:2px;transition:width 1s linear,background 0.3s"></div>
              </div>
            </div>`;
        } else if (trade.result === 'win') {
          const profit = trade.payout || trade.amount_usdt * 0.8;
          resultText = `+${profit.toFixed(0)} USDT`;
          resultColor = '#0ECB81';
          statusBadge = `<span style="background:#0ECB8130;color:#0ECB81;padding:4px 10px;border-radius:4px;font-size:12px;font-weight:700;letter-spacing:0.5px">${t('trade.status.win')}</span>`;
        } else if (trade.result === 'loss') {
          resultText = `-${(trade.amount_usdt || 0).toFixed(0)} USDT`;
          resultColor = '#F6465D';
          statusBadge = `<span style="background:#F6465D30;color:#F6465D;padding:4px 10px;border-radius:4px;font-size:12px;font-weight:700;letter-spacing:0.5px">${t('trade.status.loss')}</span>`;
        } else {
          resultText = `-${(trade.amount_usdt || 0).toFixed(0)} USDT`;
          resultColor = '#F6465D';
        }
        
        const tradeDate = new Date(trade.opened_at);
        const timeStr = tradeDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) + 
                       ' ' + tradeDate.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
        
        // Active trade card
        if (isActive) {
          return `
            <div style="background:#0e1219;border-radius:10px;margin-bottom:10px;border-left:4px solid ${sideColor};overflow:hidden">
              <div style="padding:14px 16px">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
                  <div>
                    <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
                      <span style="font-weight:700;font-size:15px;color:#fff">${trade.pair}</span>
                      <span style="font-size:14px;color:${sideColor}">${sideIcon}</span>
                    </div>
                    <div style="font-size:11px;color:#848E9C">${t('trade.position_opened')}</div>
                  </div>
                  ${statusBadge}
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center">
                  <div>
                    <div style="font-size:12px;color:${sideColor};font-weight:600;margin-bottom:2px">${sideText}</div>
                    <div style="font-size:13px;color:#EAECEF;font-family:monospace">${trade.amount_usdt} USDT @ ${openPriceNum}</div>
                  </div>
                  <div style="text-align:right">
                    <div style="font-weight:700;font-size:20px;color:${resultColor};font-family:monospace">${resultText}</div>
                    <div style="font-size:10px;color:#848E9C;margin-top:2px">${timeStr}</div>
                  </div>
                </div>
                ${progressBarHtml}
              </div>
            </div>
          `;
        }
        
        // Closed trade card
        return `
          <div style="background:#0e1219;border-radius:10px;margin-bottom:10px;border-left:4px solid ${sideColor};overflow:hidden">
            <div style="padding:14px 16px">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
                <div>
                  <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
                    <span style="font-weight:700;font-size:15px;color:#fff">${trade.pair}</span>
                    <span style="font-size:14px;color:${sideColor}">${sideIcon}</span>
                  </div>
                  <div style="font-size:11px;color:#848E9C">${t('trade.position_closed')}</div>
                </div>
                ${statusBadge}
              </div>
              <div style="display:flex;justify-content:space-between;align-items:flex-end">
                <div>
                  <div style="font-size:12px;color:${sideColor};font-weight:600;margin-bottom:4px">${sideText} • ${trade.amount_usdt} USDT</div>
                  <div style="display:flex;align-items:center;gap:6px">
                    <span style="font-size:14px;color:#EAECEF;font-family:monospace;font-weight:500">${openPriceNum}</span>
                    <span style="font-size:12px;color:#848E9C">→</span>
                    <span style="font-size:14px;color:${resultColor};font-family:monospace;font-weight:500">${closePriceNum}</span>
                  </div>
                </div>
                <div style="text-align:right">
                  <div style="font-weight:700;font-size:22px;color:${resultColor};font-family:monospace">${resultText}</div>
                  <div style="font-size:10px;color:#848E9C;margin-top:2px">${timeStr}</div>
                </div>
              </div>
            </div>
          </div>
        `;
      }).join('');
      
    } catch (e) {
      console.error('Failed to load trades:', e);
      const errDiv = document.getElementById('tradesList');
      if (errDiv) errDiv.innerHTML = '<div style="text-align:center;color:#ef4444;padding:20px">Ошибка загрузки</div>';
    }
  }
  
  // Initial load
  loadTradesList('active', pair);
  
  // Auto-refresh trades list every second for smooth timer countdown
  setInterval(() => loadTradesList(currentFilter, pair), 1000);
}
async function placeOrder(pair, side, duration, amount){
  const amt = amount || 0;
  const dur = duration || 60;
  if(amt<5){ toast('Мин. ставка 5 USDT'); return; }
  try{
    const res=await apiFetch('/api/trade/order',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ pair, side, amount_usdt: amt, duration_sec: dur }) });
    const data=await res.json();
    if(!data.ok){ toast(data.error||t('toast.error')); return; }
    if (typeof window._loadChartData === 'function') window._loadChartData();
    const direction = side === 'buy' ? '⬆️ ВВЕРХ' : '⬇️ ВНИЗ';
    const orderFilledText = i18n.lang === 'ru' ? 'Ордер исполнен' : 'Order filled';
    toast(`${orderFilledText}: ${direction} ${dur >= 60 ? Math.floor(dur/60) + (i18n.lang === 'ru' ? ' мин' : ' min') : dur + (i18n.lang === 'ru' ? ' сек' : ' sec')}`);
    const id=data.order_id;
    let hasShownResult = false;
    const intv=setInterval(async ()=>{
      try{
        const st=await (await apiFetch('/api/trade/order/'+id)).json();
        if(st.status!=='active' && !hasShownResult){ 
          hasShownResult = true;
          clearInterval(intv);
          
          // Show calculation delay overlay for 1.5 seconds
          showCalculationOverlay();
          
          await new Promise(resolve => setTimeout(resolve, 1500));
          
          hideCalculationOverlay();
          
          // Show trade result notification
          const isWin = st.result === 'win';
          const resultAmount = isWin ? (st.payout || 0) : (st.amount_usdt || 0);
          showTradeNotification(st.result, resultAmount, pair);
          
          renderAssets(); 
        }
      }catch(e){}
    },3000);
  }catch(e){ toast(t('toast.error')); }
}

// -------- Referrals ----------
async function renderReferrals(){
  restoreHeader();
  setActive('referrals');
  const cont=document.getElementById('root');
  let ref = { referral_code:'', referral_count:0, referral_earnings:0, referrals:[] };
  try{ ref = await (await apiFetch('/api/referrals')).json(); }catch(e){ console.error('referrals failed', e); }
  
  const botUsername = 'KrakenTopBot';
  const refLink = `https://t.me/${botUsername}?start=${ref.referral_code}`;
  
  cont.innerHTML = `
  <div class="container">
    <div class="section">
      <div class="section-header"><div class="section-title">${t('referrals.title')}</div></div>
      <div class="section-content">
        <p style="color:#848E9C; font-size:14px; margin-bottom:16px;">${t('referrals.invite')}</p>
        
        <div class="balance-card" style="margin-bottom:16px;">
          <div class="small">${t('referrals.your_link')}</div>
          <div style="display:flex; align-items:center; gap:8px; margin-top:8px;">
            <input type="text" id="refLink" value="${refLink}" readonly style="flex:1; background:#2A2A2A; border:1px solid #3A3A3A; border-radius:8px; padding:10px; color:#fff; font-size:12px;"/>
            <button class="btn-primary" id="copyRef" style="padding:10px 16px; min-width:auto;">${t('referrals.copy')}</button>
          </div>
        </div>
        
        <div class="inline" style="margin-bottom:16px;">
          <div class="balance-card">
            <div class="small">${t('referrals.count')}</div>
            <div class="balance-amount">${ref.referral_count}</div>
          </div>
          <div class="balance-card">
            <div class="small">${t('referrals.earnings')}</div>
            <div class="balance-amount">${Number(ref.referral_earnings||0).toFixed(2)} <span class="currency">USDT</span></div>
          </div>
        </div>
        
        <div class="info-box" style="background:#1A1A2E; border:1px solid #F0B90B; border-radius:6px; padding:12px; margin-bottom:16px;">
          <span style="color:#F0B90B;">💰</span> <span style="color:#848E9C;">${t('referrals.bonus')}</span>
        </div>
      </div>
    </div>
    
    <div class="section" style="margin-top:12px">
      <div class="section-header"><div class="section-title">${t('referrals.list')}</div></div>
      <div class="section-content" id="refList">
        ${ref.referrals.length === 0 ? 
          `<p style="color:#848E9C; text-align:center; padding:20px;">${t('referrals.empty')}</p>` : 
          ref.referrals.map(r => `
            <div class="history-row">
              <div class="history-info">
                <div class="history-title">@${r.username}</div>
                <div class="history-date">${r.date}</div>
              </div>
            </div>
          `).join('')
        }
      </div>
    </div>
  </div>`;
  
  document.getElementById('copyRef').onclick = async () => {
    try {
      await navigator.clipboard.writeText(refLink);
      document.getElementById('copyRef').textContent = t('referrals.copied');
      setTimeout(() => { document.getElementById('copyRef').textContent = t('referrals.copy'); }, 2000);
    } catch(e) {
      document.getElementById('refLink').select();
      document.execCommand('copy');
      toast(t('referrals.copied'));
    }
  };
}
// -------- Support ----------
async function openSupport(){
  const cont=document.getElementById('root');
  cont.innerHTML = `
  <div class="chat-fullscreen">
    <div class="chat-header">
      <button class="btn-back" id="backAssets">←</button>
      <div class="chat-title">${t('support.title')}</div>
    </div>
    <div class="chat-messages" id="chat"></div>
    <div class="chat-input-container">
      <label for="file" class="btn-attach">+</label>
      <input type="file" id="file" accept="image/*" style="display:none"/>
      <input type="text" id="msg" class="chat-input" placeholder="Введите сообщение..."/>
      <button class="btn-send" id="send">→</button>
    </div>
  </div>`;
  document.getElementById('backAssets').onclick = renderAssets;
  
  async function deleteMessage(messageId) {
    if (!window.confirm('Вы уверены, что хотите удалить это сообщение?')) {
      return;
    }
    try {
      const res = await apiFetch(`/api/support/${messageId}`, { method: 'DELETE' });
      if (res.ok) {
        toast('Сообщение удалено');
        await load();
      } else {
        toast('Ошибка удаления');
      }
    } catch(e) {
      console.error('Delete failed', e);
      toast('Ошибка удаления');
    }
  }
  
  async function load(){ 
    try{ 
      // Load regular support messages
      const data=await (await apiFetch('/api/support')).json(); 
      const isAdmin = data.is_admin || false;
      const msgs = data.messages || [];
      
      // Load admin broadcast and personal messages
      const adminData = await (await apiFetch('/api/admin_messages')).json();
      const adminMsgs = adminData.messages || [];
      
      const chat=document.getElementById('chat'); 
      chat.innerHTML=''; 
      
      // Display admin messages first (if any)
      if (adminMsgs.length > 0) {
        const adminSection = document.createElement('div');
        adminSection.style.marginBottom = '20px';
        adminSection.innerHTML = '<div class="msg-label" style="text-align:center; margin: 10px 0; color: #8b5cf6; font-weight: bold;">📢 Сообщения от администратора</div>';
        chat.appendChild(adminSection);
        
        adminMsgs.forEach(m => {
          const d = document.createElement('div');
          d.className = 'msg admin';
          d.style.position = 'relative';
          const broadcastLabel = m.is_broadcast ? ' (Всем пользователям)' : '';
          d.innerHTML = `<div class="msg-label">Администратор${broadcastLabel}</div><div class="msg-text">${m.message_text}</div><div class="msg-time" style="font-size: 10px; color: #999; margin-top: 4px;">${new Date(m.created_at).toLocaleString()}</div>`;
          chat.appendChild(d);
        });
        
        // Separator
        if (msgs.length > 0) {
          const separator = document.createElement('div');
          separator.style.margin = '20px 0';
          separator.style.borderTop = '1px solid #444';
          separator.innerHTML = '<div class="msg-label" style="text-align:center; margin: 10px 0; color: #8b5cf6; font-weight: bold;">💬 Чат с поддержкой</div>';
          chat.appendChild(separator);
        }
      }
      
      // Display regular support chat messages
      msgs.forEach(m=>{ 
        const d=document.createElement('div'); 
        d.className='msg '+(m.sender==='user'?'user':'admin');
        d.style.position = 'relative';
        const label = m.sender==='user' ? 'Вы' : 'Поддержка';
        const content = m.text || (m.file_path?'[Фото]':'');
        
        const showDeleteBtn = isAdmin || m.sender === 'user';
        const deleteBtn = showDeleteBtn ? `<button class="msg-delete" data-id="${m.id}">×</button>` : '';
        
        d.innerHTML = `<div class="msg-label">${label}</div><div class="msg-text">${content}</div>${deleteBtn}`;
        
        if (showDeleteBtn) {
          d.querySelector('.msg-delete').onclick = () => deleteMessage(m.id);
        }
        
        chat.appendChild(d); 
      }); 
      chat.scrollTop=chat.scrollHeight; 
    }catch(e){ console.error('Load chat failed', e); } 
  }
  await load();
  // Auto-refresh chat every 5 seconds to see admin replies
  const refreshInterval = setInterval(load, 5000);
  
  const sendMsg = async ()=>{
    const fd=new FormData(); fd.append('text', document.getElementById('msg').value);
    const f=document.getElementById('file').files[0]; if(f) fd.append('file', f);
    const r=await apiFetch('/api/support',{method:'POST', body:fd}); const d=await r.json();
    if(d.ok){ document.getElementById('msg').value=''; document.getElementById('file').value=''; await load(); }
  };
  document.getElementById('send').onclick = sendMsg;
  document.getElementById('msg').addEventListener('keypress', (e)=>{ if(e.key==='Enter') sendMsg(); });
  
  // Cleanup on navigation
  document.getElementById('backAssets').addEventListener('click', () => clearInterval(refreshInterval));
} 
// -------- expose & bootstrap ----------
window.renderAssets=renderAssets;
window.renderTrade=renderTrade;
window.renderReferrals=renderReferrals;
window.openDeposit=openDeposit;
window.openWithdraw=openWithdraw;
window.openExchange=openExchange;
window.openSupport=openSupport;
window.openWallet=openWallet;

// Function to open create check modal for Premium users
function openCreateCheckModal() {
  const lang = i18n?.lang || 'ru';
  
  const modal = document.createElement('div');
  modal.id = 'createCheckModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  
  modal.innerHTML = `
    <div style="background:#1E2329;border-radius:16px;width:100%;max-width:360px;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,0.5)">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
        <div style="width:48px;height:48px;background:linear-gradient(135deg,#F0B90B,#D4A10A);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:24px">🎁</div>
        <div>
          <div style="color:#EAECEF;font-size:18px;font-weight:600">${lang === 'ru' ? 'Создать чек' : 'Create Check'}</div>
          <div style="color:#848E9C;font-size:12px">${lang === 'ru' ? 'Подарите USDT другу' : 'Gift USDT to a friend'}</div>
        </div>
      </div>
      
      <div style="margin-bottom:16px">
        <label style="color:#848E9C;font-size:12px;display:block;margin-bottom:6px">${lang === 'ru' ? 'Сумма USDT' : 'Amount USDT'}</label>
        <input type="number" id="checkAmountInput" placeholder="10" min="1" step="0.01" 
          style="width:100%;padding:14px;background:#0B0E11;border:1px solid #2B3139;border-radius:8px;color:#EAECEF;font-size:16px;outline:none;box-sizing:border-box" />
      </div>
      
      <div style="display:flex;gap:10px;margin-top:20px">
        <button id="checkCancelBtn" style="flex:1;padding:14px;background:#2B3139;color:#848E9C;font-size:14px;font-weight:500;border:none;border-radius:8px;cursor:pointer">
          ${lang === 'ru' ? 'Отмена' : 'Cancel'}
        </button>
        <button id="checkCreateBtn" style="flex:1;padding:14px;background:linear-gradient(135deg,#F0B90B,#D4A10A);color:#0B0E11;font-size:14px;font-weight:600;border:none;border-radius:8px;cursor:pointer">
          ${lang === 'ru' ? 'Создать' : 'Create'}
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  const input = document.getElementById('checkAmountInput');
  input.focus();
  
  document.getElementById('checkCancelBtn').onclick = () => modal.remove();
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  
  document.getElementById('checkCreateBtn').onclick = async () => {
    const amount = parseFloat(input.value);
    if (!amount || amount < 1) {
      toast(lang === 'ru' ? '❌ Минимум 1 USDT' : '❌ Minimum 1 USDT');
      return;
    }
    
    const btn = document.getElementById('checkCreateBtn');
    btn.disabled = true;
    btn.textContent = lang === 'ru' ? 'Создание...' : 'Creating...';
    
    try {
      const r = await apiFetch('/api/checks/create', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ amount: amount, expires_in_hours: 24 })
      });
      
      const d = await r.json();
      
      if (d.ok) {
        modal.remove();
        showCheckCreatedModal(d.check_link, d.amount);
        await renderAssets();
      } else {
        toast('❌ ' + (d.error || 'Error'));
        btn.disabled = false;
        btn.textContent = lang === 'ru' ? 'Создать' : 'Create';
      }
    } catch(e) {
      toast('❌ ' + e.message);
      btn.disabled = false;
      btn.textContent = lang === 'ru' ? 'Создать' : 'Create';
    }
  };
}

// Show check created success modal with link
function showCheckCreatedModal(checkLink, amount) {
  const lang = i18n?.lang || 'ru';
  
  const modal = document.createElement('div');
  modal.id = 'checkCreatedModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  
  modal.innerHTML = `
    <div style="background:#1E2329;border-radius:16px;width:100%;max-width:360px;padding:24px;text-align:center">
      <div style="width:64px;height:64px;background:linear-gradient(135deg,#0ECB81,#0AA56A);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:32px;margin:0 auto 16px">✓</div>
      
      <div style="color:#EAECEF;font-size:20px;font-weight:600;margin-bottom:8px">${lang === 'ru' ? 'Чек создан!' : 'Check Created!'}</div>
      <div style="color:#0ECB81;font-size:24px;font-weight:700;margin-bottom:16px">${amount} USDT</div>
      
      <div style="background:#0B0E11;border-radius:8px;padding:12px;margin-bottom:16px">
        <div style="color:#848E9C;font-size:11px;margin-bottom:6px">${lang === 'ru' ? 'Ссылка для активации:' : 'Activation link:'}</div>
        <div id="checkLinkText" style="color:#F0B90B;font-size:12px;word-break:break-all;font-family:monospace">${checkLink}</div>
      </div>
      
      <button id="copyCheckLinkBtn" style="width:100%;padding:14px;background:linear-gradient(135deg,#F0B90B,#D4A10A);color:#0B0E11;font-size:14px;font-weight:600;border:none;border-radius:8px;cursor:pointer;margin-bottom:10px">
        📋 ${lang === 'ru' ? 'Скопировать ссылку' : 'Copy Link'}
      </button>
      
      <button id="closeCheckModalBtn" style="width:100%;padding:12px;background:#2B3139;color:#848E9C;font-size:14px;border:none;border-radius:8px;cursor:pointer">
        ${lang === 'ru' ? 'Закрыть' : 'Close'}
      </button>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  document.getElementById('copyCheckLinkBtn').onclick = () => {
    navigator.clipboard.writeText(checkLink);
    toast(lang === 'ru' ? '✅ Ссылка скопирована!' : '✅ Link copied!');
  };
  
  document.getElementById('closeCheckModalBtn').onclick = () => modal.remove();
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
}

// Function to create check (admin only - legacy)
async function createCheck() {
  const amount = prompt("Введите сумму USDT для чека:", "100");
  if (!amount) return;
  
  const hours = prompt("Срок действия (часы):", "24");
  if (!hours) return;
  
  const r = await apiFetch(`/api/admin/check/create`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      amount_usdt: parseFloat(amount),
      expires_in_hours: parseInt(hours)
    })
  });
  
  const d = await r.json();
  if (d.ok) {
    const checkLink = d.check_link;
    navigator.clipboard.writeText(checkLink);
    toast(`✅ Чек создан!\n💰 ${d.amount_usdt} USDT\n🔗 Ссылка скопирована`);
    await renderAssets(); // Refresh balance
  } else {
    toast(d.error || 'Ошибка создания чека');
  }
}

// ========== NOTIFICATIONS SYSTEM ==========
let notificationsCache = [];

async function loadNotificationsCount() {
  try {
    const r = await apiFetch('/api/notifications/count');
    const d = await r.json();
    updateNotificationBadge(d.count || 0);
  } catch(e) {
    console.log('Failed to load notifications count:', e);
  }
}

function updateNotificationBadge(count) {
  const badge = document.getElementById('notificationBadge');
  if (badge) {
    if (count > 0) {
      badge.style.display = 'block';
      badge.textContent = count > 99 ? '99+' : count;
    } else {
      badge.style.display = 'none';
    }
  }
}

async function openNotificationsModal() {
  const lang = i18n?.lang || 'ru';
  
  // Show loading modal
  const modal = document.createElement('div');
  modal.id = 'notificationsModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:9999;display:flex;flex-direction:column';
  
  modal.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;background:#1E2329;border-bottom:1px solid #2B3139">
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:20px">🔔</span>
        <span style="color:#EAECEF;font-size:16px;font-weight:600">${lang === 'ru' ? 'Уведомления' : 'Notifications'}</span>
      </div>
      <button id="closeNotificationsBtn" style="background:none;border:none;color:#848E9C;font-size:24px;cursor:pointer;padding:4px">&times;</button>
    </div>
    <div id="notificationsList" style="flex:1;overflow-y:auto;padding:12px">
      <div style="display:flex;justify-content:center;padding:40px">
        <div style="width:24px;height:24px;border:2px solid #F0B90B;border-top-color:transparent;border-radius:50%;animation:spin 1s linear infinite"></div>
      </div>
    </div>
    <div style="padding:12px 16px;background:#1E2329;border-top:1px solid #2B3139">
      <button id="markAllReadBtn" style="width:100%;padding:12px;background:#2B3139;color:#EAECEF;font-size:14px;border:none;border-radius:8px;cursor:pointer">
        ${lang === 'ru' ? '✓ Отметить все прочитанными' : '✓ Mark all as read'}
      </button>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  document.getElementById('closeNotificationsBtn').onclick = () => modal.remove();
  
  // Load notifications
  try {
    const r = await apiFetch('/api/notifications');
    const d = await r.json();
    notificationsCache = d.notifications || [];
    
    const list = document.getElementById('notificationsList');
    
    if (notificationsCache.length === 0) {
      list.innerHTML = `
        <div style="text-align:center;padding:60px 20px">
          <div style="font-size:48px;margin-bottom:16px;opacity:0.3">🔔</div>
          <div style="color:#848E9C;font-size:14px">${lang === 'ru' ? 'Нет уведомлений' : 'No notifications'}</div>
        </div>
      `;
    } else {
      list.innerHTML = notificationsCache.map(n => {
        const date = n.created_at ? new Date(n.created_at) : new Date();
        const timeAgo = formatTimeAgo(date, lang);
        
        return `
          <div style="background:${n.is_read ? '#1E2329' : '#252930'};border-radius:10px;padding:14px;margin-bottom:8px;border-left:3px solid ${n.is_read ? '#2B3139' : '#F0B90B'}">
            <div style="display:flex;align-items:flex-start;gap:10px">
              <div style="font-size:18px">${n.is_broadcast ? '📣' : '💬'}</div>
              <div style="flex:1">
                <div style="color:#EAECEF;font-size:13px;line-height:1.5;white-space:pre-wrap">${escapeHtml(n.message)}</div>
                <div style="color:#5E6673;font-size:11px;margin-top:6px">${timeAgo}</div>
              </div>
              ${!n.is_read ? '<div style="width:8px;height:8px;background:#F0B90B;border-radius:50%;flex-shrink:0;margin-top:4px"></div>' : ''}
            </div>
          </div>
        `;
      }).join('');
    }
    
    updateNotificationBadge(d.unread_count || 0);
  } catch(e) {
    document.getElementById('notificationsList').innerHTML = `
      <div style="text-align:center;padding:40px;color:#F6465D">${lang === 'ru' ? 'Ошибка загрузки' : 'Failed to load'}</div>
    `;
  }
  
  // Mark all as read
  document.getElementById('markAllReadBtn').onclick = async () => {
    try {
      await apiFetch('/api/notifications/read', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ids: []})
      });
      updateNotificationBadge(0);
      toast(lang === 'ru' ? '✓ Все уведомления прочитаны' : '✓ All marked as read');
      modal.remove();
    } catch(e) {
      toast(lang === 'ru' ? '❌ Ошибка' : '❌ Error');
    }
  };
}

function formatTimeAgo(date, lang) {
  const now = new Date();
  const diff = Math.floor((now - date) / 1000);
  
  if (diff < 60) return lang === 'ru' ? 'только что' : 'just now';
  if (diff < 3600) {
    const mins = Math.floor(diff / 60);
    return lang === 'ru' ? `${mins} мин назад` : `${mins}m ago`;
  }
  if (diff < 86400) {
    const hours = Math.floor(diff / 3600);
    return lang === 'ru' ? `${hours} ч назад` : `${hours}h ago`;
  }
  const days = Math.floor(diff / 86400);
  return lang === 'ru' ? `${days} дн назад` : `${days}d ago`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Function to activate check
async function activateCheck(checkCode) {
  const r = await apiFetch(`/api/check/activate`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ check_code: checkCode })
  });
  
  const d = await r.json();
  if (d.ok) {
    toast(`✅ Чек активирован!\n💰 +${d.amount_usdt} USDT\n📊 Баланс: ${d.new_balance} USDT`);
    await renderAssets(); // Refresh balance
  } else {
    toast(d.error || 'Ошибка активации чека');
  }
}

// -------- Profile (non-admin) ----------
async function renderProfile() {
  setActive('profile');
  const root = document.getElementById('root');
  root.innerHTML = '<div class="container" style="padding:16px"><div style="text-align:center;padding:40px 0;color:#848E9C">Загрузка...</div></div>';
  try {
    const res = await apiFetch('/api/user');
    const u = await res.json();
    root.innerHTML = `
    <div class="container" style="padding:16px">
      <div class="admin-section">
        <div class="admin-section-title">👤 Мой профиль</div>
        <div style="display:flex;flex-direction:column;gap:12px;margin-top:12px">
          <div class="stat-row"><span class="stat-label">Profile ID</span><span class="stat-value">#${u.profile_id || '—'}</span></div>
          <div class="stat-row"><span class="stat-label">Username</span><span class="stat-value">@${u.username || '—'}</span></div>
          <div class="stat-row"><span class="stat-label">Верификация</span><span class="stat-value">${u.is_verified ? '✅ Верифицирован' : '❌ Не верифицирован'}</span></div>
          <div class="stat-row"><span class="stat-label">Premium</span><span class="stat-value">${u.is_premium ? '⭐ Активен' : '—'}</span></div>
          <div class="stat-row"><span class="stat-label">Баланс</span><span class="stat-value" style="color:#F0B90B">${parseFloat(u.balance_usdt || 0).toFixed(2)} USDT</span></div>
          <div class="stat-row"><span class="stat-label">Дата регистрации</span><span class="stat-value">${u.created_at ? new Date(u.created_at).toLocaleDateString('ru-RU') : '—'}</span></div>
        </div>
      </div>
    </div>`;
  } catch(e) {
    root.innerHTML = '<div class="container" style="padding:16px"><div style="text-align:center;padding:40px 0;color:#F6465D">Ошибка загрузки профиля</div></div>';
  }
}

// -------- Admin Panel ----------
async function renderAdminPanel() {
  if (!userData?.is_admin) return renderProfile();
  setActive('profile');
  const root = document.getElementById('root');
  root.innerHTML = '<div class="container" style="padding:16px"><div style="text-align:center;padding:40px 0;color:#848E9C">Загрузка панели...</div></div>';
  let stats = { total_users: 0, active_24h: 0, deposits_today: 0, pending_withdrawals: 0 };
  try {
    const res = await apiFetch('/api/admin/dashboard');
    if (res.ok) stats = await res.json();
  } catch(e) {}
  root.innerHTML = `
  <div class="container" style="padding:16px">
    <div class="admin-breadcrumb">🛡️ Админ-панель</div>
    <div class="admin-dashboard">
      <div class="admin-stat-card">
        <div class="admin-stat-icon">👥</div>
        <div class="admin-stat-value">${stats.total_users || 0}</div>
        <div class="admin-stat-label">Всего пользователей</div>
      </div>
      <div class="admin-stat-card">
        <div class="admin-stat-icon">🟢</div>
        <div class="admin-stat-value">${stats.active_24h || 0}</div>
        <div class="admin-stat-label">Активны 24ч</div>
      </div>
      <div class="admin-stat-card">
        <div class="admin-stat-icon">💰</div>
        <div class="admin-stat-value">${stats.deposits_today || 0}</div>
        <div class="admin-stat-label">Депозиты сегодня</div>
      </div>
      <div class="admin-stat-card">
        <div class="admin-stat-icon">⏳</div>
        <div class="admin-stat-value">${stats.pending_withdrawals || 0}</div>
        <div class="admin-stat-label">Ожидают вывода</div>
      </div>
    </div>
    <div class="admin-section" style="margin-top:16px">
      <div class="admin-section-title">⚡ Быстрые действия</div>
      <div class="admin-action-grid">
        <button class="admin-action-btn" id="adminUsersBtn">
          <span class="admin-action-icon">👥</span>
          <span>Пользователи</span>
        </button>
        <button class="admin-action-btn" id="adminWithdrawalsBtn">
          <span class="admin-action-icon">💸</span>
          <span>Выводы</span>
        </button>
        <button class="admin-action-btn" id="adminBroadcastBtn">
          <span class="admin-action-icon">📢</span>
          <span>Рассылка</span>
        </button>
        <button class="admin-action-btn" id="adminLogsBtn">
          <span class="admin-action-icon">📋</span>
          <span>Логи</span>
        </button>
        <button class="admin-action-btn" id="adminLuckyBtn">
          <span class="admin-action-icon">🍀</span>
          <span>Повезёт</span>
        </button>
      </div>
    </div>
  </div>`;
  document.getElementById('adminUsersBtn').onclick = renderAdminUsers;
  document.getElementById('adminWithdrawalsBtn').onclick = renderAdminWithdrawals;
  document.getElementById('adminBroadcastBtn').onclick = renderAdminBroadcast;
  document.getElementById('adminLogsBtn').onclick = renderAdminLogs;
  document.getElementById('adminLuckyBtn').onclick = renderAdminLucky;
}

// -------- Admin Users ----------
async function renderAdminUsers(page = 1, search = '', filter = '') {
  if (!userData?.is_admin) return;
  setActive('profile');
  const root = document.getElementById('root');
  if (typeof page !== 'number') { page = 1; search = ''; filter = ''; }
  root.innerHTML = '<div class="container" style="padding:16px"><div class="admin-breadcrumb"><span class="admin-back-btn" id="adminBack">🛡️ Админ</span> › Пользователи</div><div style="text-align:center;padding:40px 0;color:#848E9C">Загрузка...</div></div>';
  document.getElementById('adminBack')?.addEventListener('click', renderAdminPanel);
  let data = { users: [], total: 0, page: 1, pages: 1 };
  try {
    const res = await apiFetch(`/api/admin/users?page=${page}&limit=20&search=${encodeURIComponent(search)}&filter=${encodeURIComponent(filter)}`);
    if (res.ok) data = await res.json();
  } catch(e) {}
  const filters = [
    { key: '', label: 'Все' },
    { key: 'premium', label: '⭐ Premium' },
    { key: 'blocked', label: '🚫 Blocked' },
    { key: 'verified', label: '✓ Verified' },
    { key: 'with_balance', label: '💰 С балансом' }
  ];
  root.innerHTML = `
  <div class="container" style="padding:16px">
    <div class="admin-breadcrumb"><span class="admin-back-btn" id="adminBack">🛡️ Админ</span> › Пользователи</div>
    <input class="admin-search" id="adminUserSearch" placeholder="Поиск по username или profile ID..." value="${search}"/>
    <div class="admin-tabs" id="adminFilterTabs">
      ${filters.map(f => `<button class="admin-tab${filter === f.key ? ' active' : ''}" data-filter="${f.key}">${f.label}</button>`).join('')}
    </div>
    <div class="admin-users-list">
      ${data.users && data.users.length > 0 ? data.users.map(u => `
        <div class="admin-user-row" data-pid="${u.profile_id}">
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;color:#EAECEF;font-size:13px">#${u.profile_id} ${u.username ? '@' + u.username : ''}</div>
            <div style="font-size:11px;color:#848E9C;margin-top:2px">${parseFloat(u.displayed_balance || u.balance_usdt || 0).toFixed(2)} USDT</div>
          </div>
          <div style="display:flex;gap:4px;align-items:center;font-size:14px">
            ${u.is_verified ? '<span title="Verified">✓</span>' : ''}
            ${u.is_premium ? '<span title="Premium">⭐</span>' : ''}
            ${u.is_blocked ? '<span title="Blocked">🚫</span>' : ''}
          </div>
        </div>
      `).join('') : '<div style="text-align:center;padding:32px 0;color:#848E9C">Пользователи не найдены</div>'}
    </div>
    ${(data.pages || 1) > 1 ? `
    <div style="display:flex;justify-content:center;gap:8px;margin-top:16px">
      ${page > 1 ? `<button class="btn btn-outline" id="adminPrevPage">← Назад</button>` : ''}
      <span style="color:#848E9C;font-size:12px;align-self:center">${page} / ${data.pages}</span>
      ${page < data.pages ? `<button class="btn btn-outline" id="adminNextPage">Далее →</button>` : ''}
    </div>` : ''}
  </div>`;
  document.getElementById('adminBack').onclick = renderAdminPanel;
  const searchInput = document.getElementById('adminUserSearch');
  let searchTimeout;
  searchInput.oninput = () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => renderAdminUsers(1, searchInput.value, filter), 400);
  };
  document.querySelectorAll('#adminFilterTabs .admin-tab').forEach(btn => {
    btn.onclick = () => renderAdminUsers(1, searchInput.value, btn.dataset.filter);
  });
  document.querySelectorAll('.admin-user-row').forEach(row => {
    row.onclick = () => renderAdminUserCard(row.dataset.pid);
  });
  document.getElementById('adminPrevPage')?.addEventListener('click', () => renderAdminUsers(page - 1, search, filter));
  document.getElementById('adminNextPage')?.addEventListener('click', () => renderAdminUsers(page + 1, search, filter));
}

// -------- Admin Lucky Mode ----------
async function renderAdminLucky(page = 1, search = '', filter = '') {
  if (!userData?.is_admin) return;
  setActive('profile');
  const root = document.getElementById('root');
  if (typeof page !== 'number') { page = 1; search = ''; filter = ''; }
  root.innerHTML = '<div class="container" style="padding:16px"><div class="admin-breadcrumb"><span class="admin-back-btn" id="adminBack">🛡️ Админ</span> › Повезёт</div><div style="text-align:center;padding:40px 0;color:#848E9C">Загрузка...</div></div>';
  document.getElementById('adminBack')?.addEventListener('click', renderAdminPanel);
  let data = { users: [], total: 0, page: 1, pages: 1 };
  try {
    const res = await apiFetch(`/api/admin/lucky/users?page=${page}&search=${encodeURIComponent(search)}&filter=${encodeURIComponent(filter)}`);
    if (res.ok) data = await res.json();
  } catch(e) {}
  const filters = [
    { key: '', label: 'Все' },
    { key: 'on', label: '🍀 Lucky ON' },
    { key: 'off', label: 'Lucky OFF' }
  ];
  root.innerHTML = `
  <div class="container" style="padding:16px">
    <div class="admin-breadcrumb"><span class="admin-back-btn" id="adminBack">🛡️ Админ</span> › Повезёт</div>
    <input class="admin-search" id="luckySearch" placeholder="Поиск по telegram_id или username..." value="${search}"/>
    <div class="admin-tabs" id="luckyFilterTabs">
      ${filters.map(f => `<button class="admin-tab${filter === f.key ? ' active' : ''}" data-filter="${f.key}">${f.label}</button>`).join('')}
    </div>
    <div class="admin-users-list">
      ${data.users && data.users.length > 0 ? data.users.map(u => `
        <div class="admin-user-row" data-pid="${u.profile_id}">
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;color:#EAECEF;font-size:13px">#${u.profile_id} ${u.username ? '@' + u.username : ''}</div>
            <div style="font-size:11px;color:#848E9C;margin-top:2px">${parseFloat(u.balance_usdt || 0).toFixed(2)} USDT</div>
          </div>
          <div style="display:flex;gap:6px;align-items:center">
            <span class="${u.lucky_mode ? 'lucky-badge-on' : 'lucky-badge-off'}">${u.lucky_mode ? 'ON' : 'OFF'}</span>
            <button class="btn btn-outline" style="padding:4px 10px;font-size:11px" data-open="${u.profile_id}">Открыть</button>
          </div>
        </div>
      `).join('') : '<div style="text-align:center;padding:32px 0;color:#848E9C">Пользователи не найдены</div>'}
    </div>
    ${(data.pages || 1) > 1 ? `
    <div style="display:flex;justify-content:center;gap:8px;margin-top:16px">
      ${page > 1 ? `<button class="btn btn-outline" id="luckyPrevPage">← Назад</button>` : ''}
      <span style="color:#848E9C;font-size:12px;align-self:center">${page} / ${data.pages}</span>
      ${page < data.pages ? `<button class="btn btn-outline" id="luckyNextPage">Далее →</button>` : ''}
    </div>` : ''}
  </div>`;
  document.getElementById('adminBack').onclick = renderAdminPanel;
  const searchInput = document.getElementById('luckySearch');
  let searchTimeout;
  searchInput.oninput = () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => renderAdminLucky(1, searchInput.value, filter), 400);
  };
  document.querySelectorAll('#luckyFilterTabs .admin-tab').forEach(btn => {
    btn.onclick = () => renderAdminLucky(1, searchInput.value, btn.dataset.filter);
  });
  document.querySelectorAll('[data-open]').forEach(btn => {
    btn.onclick = (e) => { e.stopPropagation(); renderAdminLuckyCard(btn.dataset.open); };
  });
  document.querySelectorAll('.admin-user-row').forEach(row => {
    row.onclick = () => renderAdminLuckyCard(row.dataset.pid);
  });
  document.getElementById('luckyPrevPage')?.addEventListener('click', () => renderAdminLucky(page - 1, search, filter));
  document.getElementById('luckyNextPage')?.addEventListener('click', () => renderAdminLucky(page + 1, search, filter));
}

async function renderAdminLuckyCard(profileId) {
  if (!userData?.is_admin) return;
  setActive('profile');
  const root = document.getElementById('root');
  root.innerHTML = '<div class="container" style="padding:16px"><div class="admin-breadcrumb"><span class="admin-back-btn" id="adminBack">🛡️ Админ</span> › <span class="admin-back-btn" id="luckyBack">Повезёт</span> › #' + profileId + '</div><div style="text-align:center;padding:40px 0;color:#848E9C">Загрузка...</div></div>';
  document.getElementById('adminBack')?.addEventListener('click', renderAdminPanel);
  document.getElementById('luckyBack')?.addEventListener('click', () => renderAdminLucky());
  let u = null;
  let history = [];
  try {
    const [userRes, histRes] = await Promise.all([
      apiFetch(`/api/admin/lucky/users?search=${profileId}`),
      apiFetch(`/api/admin/lucky/history/${profileId}`)
    ]);
    if (userRes.ok) {
      const ud = await userRes.json();
      u = ud.users && ud.users.length > 0 ? ud.users[0] : null;
    }
    if (histRes.ok) {
      const hd = await histRes.json();
      history = hd.history || [];
    }
  } catch(e) {}
  if (!u) {
    root.innerHTML = '<div class="container" style="padding:16px"><div class="admin-breadcrumb"><span class="admin-back-btn" id="adminBack">🛡️ Админ</span> › <span class="admin-back-btn" id="luckyBack">Повезёт</span></div><div style="text-align:center;padding:40px 0;color:#848E9C">Пользователь не найден</div></div>';
    document.getElementById('adminBack')?.addEventListener('click', renderAdminPanel);
    document.getElementById('luckyBack')?.addEventListener('click', () => renderAdminLucky());
    return;
  }
  const isOn = u.lucky_mode;
  root.innerHTML = `
  <div class="container" style="padding:16px">
    <div class="admin-breadcrumb">
      <span class="admin-back-btn" id="adminBack">🛡️ Админ</span> › 
      <span class="admin-back-btn" id="luckyBack">Повезёт</span> › #${profileId}
    </div>
    <div class="admin-user-card">
      <div class="admin-section">
        <div class="admin-section-title">📋 Информация</div>
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:10px">
          <div class="stat-row"><span class="stat-label">Telegram ID</span><span class="stat-value">${u.telegram_id || '—'}</span></div>
          <div class="stat-row"><span class="stat-label">Profile ID</span><span class="stat-value">#${u.profile_id || profileId}</span></div>
          <div class="stat-row"><span class="stat-label">Username</span><span class="stat-value">${u.username ? '@' + u.username : '—'}</span></div>
          <div class="stat-row"><span class="stat-label">Lucky</span><span class="${isOn ? 'lucky-badge-on' : 'lucky-badge-off'}">${isOn ? 'ON' : 'OFF'}</span></div>
          ${u.lucky_until ? `<div class="stat-row"><span class="stat-label">До</span><span class="stat-value">${new Date(u.lucky_until).toLocaleString('ru-RU')}</span></div>` : ''}
          ${u.lucky_max_wins != null ? `<div class="stat-row"><span class="stat-label">Макс. побед</span><span class="stat-value">${u.lucky_wins_used}/${u.lucky_max_wins}</span></div>` : ''}
        </div>
      </div>
      <div class="admin-section" style="margin-top:12px">
        <div class="admin-section-title">🍀 Управление Lucky Mode</div>
        <div style="margin-top:10px">
          <label class="label">Причина *</label>
          <textarea class="input" id="luckyReason" rows="2" placeholder="Укажите причину..." style="resize:vertical"></textarea>
        </div>
        <div style="display:flex;gap:8px;margin-top:10px">
          <div style="flex:1">
            <label class="label">До (опционально)</label>
            <input type="datetime-local" class="input" id="luckyUntil" />
          </div>
          <div style="flex:1">
            <label class="label">Макс. побед (опц.)</label>
            <input type="number" class="input" id="luckyMaxWins" min="1" placeholder="∞" />
          </div>
        </div>
        <button class="btn ${isOn ? 'btn-red' : 'btn-green'} fullwidth" style="margin-top:12px" id="luckyToggleBtn">
          ${isOn ? 'Выключить Lucky' : 'Включить Lucky'}
        </button>
      </div>
      ${history.length > 0 ? `
      <div class="admin-section" style="margin-top:12px">
        <div class="admin-section-title">📜 История изменений</div>
        <div style="margin-top:10px;display:flex;flex-direction:column;gap:6px">
          ${history.map(h => `
            <div class="admin-log-item">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <span style="font-weight:600;font-size:12px;color:${h.action === 'LUCKY_ENABLE' ? '#0ECB81' : '#F6465D'}">${h.action === 'LUCKY_ENABLE' ? '🍀 Включено' : '❌ Выключено'}</span>
                <span style="font-size:11px;color:#848E9C">${h.created_at ? new Date(h.created_at).toLocaleString('ru-RU') : '—'}</span>
              </div>
              <div style="font-size:11px;color:#848E9C;margin-top:4px">Admin: ${h.admin_id}</div>
              ${h.reason ? `<div style="font-size:11px;color:#EAECEF;margin-top:2px">Причина: ${h.reason}</div>` : ''}
              ${h.before ? `<div style="font-size:10px;color:#5E6673;margin-top:2px">До: ${h.before}</div>` : ''}
              ${h.after ? `<div style="font-size:10px;color:#5E6673">После: ${h.after}</div>` : ''}
            </div>
          `).join('')}
        </div>
      </div>` : ''}
    </div>
  </div>`;
  document.getElementById('adminBack').onclick = renderAdminPanel;
  document.getElementById('luckyBack').onclick = () => renderAdminLucky();
  document.getElementById('luckyToggleBtn').onclick = async () => {
    const reason = document.getElementById('luckyReason').value.trim();
    if (!reason) { toast('Укажите причину'); return; }
    const until = document.getElementById('luckyUntil').value || null;
    const maxWinsVal = document.getElementById('luckyMaxWins').value;
    const max_wins = maxWinsVal ? parseInt(maxWinsVal) : null;
    const enabling = !isOn;
    try {
      const res = await apiFetch('/api/admin/lucky/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_telegram_id: u.telegram_id,
          enabled: enabling,
          reason: reason,
          until: until ? new Date(until).toISOString() : null,
          max_wins: enabling ? max_wins : null
        })
      });
      const data = await res.json();
      if (data.ok) {
        toast(enabling ? 'Lucky Mode включён' : 'Lucky Mode выключен');
        renderAdminLuckyCard(profileId);
      } else {
        toast(data.error || 'Ошибка');
      }
    } catch(e) { toast('Ошибка сети'); }
  };
}

// -------- Admin User Card ----------
async function renderAdminUserCard(profileId) {
  if (!userData?.is_admin) return;
  setActive('profile');
  const root = document.getElementById('root');
  root.innerHTML = '<div class="container" style="padding:16px"><div class="admin-breadcrumb"><span class="admin-back-btn" id="adminBack">🛡️ Админ</span> › <span class="admin-back-btn" id="adminUsersBack">Пользователи</span> › #' + profileId + '</div><div style="text-align:center;padding:40px 0;color:#848E9C">Загрузка...</div></div>';
  document.getElementById('adminBack')?.addEventListener('click', renderAdminPanel);
  document.getElementById('adminUsersBack')?.addEventListener('click', () => renderAdminUsers());
  let u = {};
  try {
    const res = await apiFetch(`/api/admin/user/${profileId}`);
    if (res.ok) u = await res.json();
  } catch(e) {}
  const transactions = u.transactions || [];
  const trades = u.trades || [];
  root.innerHTML = `
  <div class="container" style="padding:16px">
    <div class="admin-breadcrumb">
      <span class="admin-back-btn" id="adminBack">🛡️ Админ</span> › 
      <span class="admin-back-btn" id="adminUsersBack">Пользователи</span> › #${profileId}
    </div>
    <div class="admin-user-card">
      <div class="admin-section">
        <div class="admin-section-title">📋 Информация</div>
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:10px">
          <div class="stat-row"><span class="stat-label">Telegram ID</span><span class="stat-value">${u.telegram_id || '—'}</span></div>
          <div class="stat-row"><span class="stat-label">Profile ID</span><span class="stat-value">#${u.profile_id || profileId}</span></div>
          <div class="stat-row"><span class="stat-label">Username</span><span class="stat-value">@${u.username || '—'}</span></div>
          <div class="stat-row"><span class="stat-label">Дата регистрации</span><span class="stat-value">${u.created_at ? new Date(u.created_at).toLocaleDateString('ru-RU') : '—'}</span></div>
        </div>
      </div>
      <div class="admin-section" style="margin-top:12px">
        <div class="admin-section-title">⚙️ Статусы</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
          <button class="admin-status-btn ${u.is_verified ? 'active-green' : ''}" id="btnVerify">✓ ${u.is_verified ? 'Верифицирован' : 'Верифицировать'}</button>
          <button class="admin-status-btn ${u.is_premium ? 'active-gold' : ''}" id="btnPremium">⭐ ${u.is_premium ? 'Premium' : 'Дать Premium'}</button>
          <button class="admin-status-btn ${u.is_blocked ? 'active-red' : ''}" id="btnBlock">🚫 ${u.is_blocked ? 'Разблокировать' : 'Заблокировать'}</button>
        </div>
      </div>
      <div class="admin-section" style="margin-top:12px">
        <div class="admin-section-title">💰 Балансы</div>
        <div class="admin-balance-block">
          <div class="stat-row"><span class="stat-label">Реальный баланс</span><span class="stat-value" style="color:#0ECB81">${parseFloat(u.real_balance || 0).toFixed(2)} USDT</span></div>
          <div class="stat-row"><span class="stat-label">Виртуальный баланс</span><span class="stat-value" style="color:#F0B90B">${parseFloat(u.virtual_balance || 0).toFixed(2)} USDT</span></div>
          <div class="stat-row"><span class="stat-label">Отображаемый баланс</span><span class="stat-value" style="color:#EAECEF;font-weight:700">${parseFloat(u.displayed_balance || u.balance_usdt || 0).toFixed(2)} USDT</span></div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
          <button class="btn btn-outline" id="btnAddVirtual" style="flex:1">+ Виртуальный</button>
          <button class="btn btn-outline" id="btnSetVirtual" style="flex:1">= Виртуальный</button>
          <button class="btn btn-outline" id="btnAddReal" style="flex:1">+ Реальный</button>
        </div>
      </div>
      <div class="admin-section" style="margin-top:12px">
        <button class="btn btn-primary" id="btnSendMsg" style="width:100%">✉️ Отправить сообщение</button>
      </div>
      ${transactions.length > 0 ? `
      <div class="admin-section" style="margin-top:12px">
        <div class="admin-section-title">📊 Последние транзакции</div>
        <div style="margin-top:10px">
          ${transactions.slice(0, 10).map(tx => `
            <div class="admin-log-item">
              <div style="display:flex;justify-content:space-between">
                <span style="color:#EAECEF;font-weight:500">${tx.type || tx.action || '—'}</span>
                <span style="color:${(tx.amount || 0) >= 0 ? '#0ECB81' : '#F6465D'};font-family:var(--font-mono)">${(tx.amount || 0) >= 0 ? '+' : ''}${parseFloat(tx.amount || 0).toFixed(2)}</span>
              </div>
              <div style="font-size:11px;color:#848E9C;margin-top:4px">${tx.created_at ? new Date(tx.created_at).toLocaleString('ru-RU') : ''}</div>
            </div>
          `).join('')}
        </div>
      </div>` : ''}
      ${trades.length > 0 ? `
      <div class="admin-section" style="margin-top:12px">
        <div class="admin-section-title">📈 Последние сделки</div>
        <div style="margin-top:10px">
          ${trades.slice(0, 10).map(tr => `
            <div class="admin-log-item">
              <div style="display:flex;justify-content:space-between">
                <span style="color:#EAECEF">${tr.pair || '—'} ${tr.direction || ''}</span>
                <span style="color:${tr.result === 'win' ? '#0ECB81' : '#F6465D'}">${tr.result === 'win' ? '+' : '-'}${parseFloat(tr.amount || 0).toFixed(2)}</span>
              </div>
              <div style="font-size:11px;color:#848E9C;margin-top:4px">${tr.created_at ? new Date(tr.created_at).toLocaleString('ru-RU') : ''}</div>
            </div>
          `).join('')}
        </div>
      </div>` : ''}
    </div>
  </div>`;
  document.getElementById('adminBack').onclick = renderAdminPanel;
  document.getElementById('adminUsersBack').onclick = () => renderAdminUsers();
  document.getElementById('btnVerify').onclick = async () => {
    const action = u.is_verified ? 'unverify' : 'verify';
    try {
      const res = await apiFetch(`/api/admin/user/${profileId}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
      const d = await res.json();
      if (d.ok || res.ok) { toast('✅ Статус обновлён'); renderAdminUserCard(profileId); } else toast(d.error || 'Ошибка');
    } catch(e) { toast('Ошибка сети'); }
  };
  document.getElementById('btnPremium').onclick = async () => {
    const action = u.is_premium ? 'remove_premium' : 'set_premium';
    try {
      const res = await apiFetch(`/api/admin/user/${profileId}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
      const d = await res.json();
      if (d.ok || res.ok) { toast('✅ Статус обновлён'); renderAdminUserCard(profileId); } else toast(d.error || 'Ошибка');
    } catch(e) { toast('Ошибка сети'); }
  };
  document.getElementById('btnBlock').onclick = async () => {
    const action = u.is_blocked ? 'unblock' : 'block';
    let reason = '';
    if (action === 'block') { reason = prompt('Причина блокировки:'); if (reason === null) return; }
    try {
      const res = await apiFetch(`/api/admin/user/${profileId}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, reason }) });
      const d = await res.json();
      if (d.ok || res.ok) { toast('✅ Статус обновлён'); renderAdminUserCard(profileId); } else toast(d.error || 'Ошибка');
    } catch(e) { toast('Ошибка сети'); }
  };
  document.getElementById('btnAddVirtual').onclick = async () => {
    const amount = prompt('Сумма для добавления к виртуальному балансу (USDT):');
    if (!amount || isNaN(amount)) return;
    try {
      const res = await apiFetch(`/api/admin/user/${profileId}/balance`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add', amount: parseFloat(amount), type: 'virtual' }) });
      const d = await res.json();
      if (d.ok || res.ok) { toast('✅ Баланс обновлён'); renderAdminUserCard(profileId); } else toast(d.error || 'Ошибка');
    } catch(e) { toast('Ошибка сети'); }
  };
  document.getElementById('btnSetVirtual').onclick = async () => {
    const amount = prompt('Установить виртуальный баланс (USDT):');
    if (!amount || isNaN(amount)) return;
    try {
      const res = await apiFetch(`/api/admin/user/${profileId}/balance`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'set', amount: parseFloat(amount), type: 'virtual' }) });
      const d = await res.json();
      if (d.ok || res.ok) { toast('✅ Баланс обновлён'); renderAdminUserCard(profileId); } else toast(d.error || 'Ошибка');
    } catch(e) { toast('Ошибка сети'); }
  };
  document.getElementById('btnAddReal').onclick = async () => {
    const amount = prompt('Сумма для добавления к реальному балансу (USDT):');
    if (!amount || isNaN(amount)) return;
    try {
      const res = await apiFetch(`/api/admin/user/${profileId}/balance`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add', amount: parseFloat(amount), type: 'real' }) });
      const d = await res.json();
      if (d.ok || res.ok) { toast('✅ Баланс обновлён'); renderAdminUserCard(profileId); } else toast(d.error || 'Ошибка');
    } catch(e) { toast('Ошибка сети'); }
  };
  document.getElementById('btnSendMsg').onclick = async () => {
    const text = prompt('Сообщение пользователю:');
    if (!text) return;
    try {
      const res = await apiFetch(`/api/admin/user/${profileId}/message`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
      const d = await res.json();
      if (d.ok || res.ok) toast('✅ Сообщение отправлено'); else toast(d.error || 'Ошибка');
    } catch(e) { toast('Ошибка сети'); }
  };
}

// -------- Admin Withdrawals ----------
async function renderAdminWithdrawals(status = 'pending', page = 1) {
  if (!userData?.is_admin) return;
  setActive('profile');
  const root = document.getElementById('root');
  if (typeof status !== 'string') { status = 'pending'; page = 1; }
  root.innerHTML = '<div class="container" style="padding:16px"><div class="admin-breadcrumb"><span class="admin-back-btn" id="adminBack">🛡️ Админ</span> › Выводы</div><div style="text-align:center;padding:40px 0;color:#848E9C">Загрузка...</div></div>';
  document.getElementById('adminBack')?.addEventListener('click', renderAdminPanel);
  let data = { withdrawals: [], total: 0, page: 1, pages: 1 };
  try {
    const res = await apiFetch(`/api/admin/withdrawals?status=${status}&page=${page}`);
    if (res.ok) data = await res.json();
  } catch(e) {}
  const tabs = [
    { key: 'pending', label: '⏳ Ожидающие' },
    { key: 'completed', label: '✅ Завершённые' },
    { key: 'rejected', label: '❌ Отклонённые' },
    { key: 'all', label: '📋 Все' }
  ];
  const wds = data.withdrawals || data.items || [];
  root.innerHTML = `
  <div class="container" style="padding:16px">
    <div class="admin-breadcrumb"><span class="admin-back-btn" id="adminBack">🛡️ Админ</span> › Выводы</div>
    <div class="admin-tabs" id="adminWdTabs">
      ${tabs.map(t => `<button class="admin-tab${status === t.key ? ' active' : ''}" data-status="${t.key}">${t.label}</button>`).join('')}
    </div>
    <div style="margin-top:12px">
      ${wds.length > 0 ? wds.map(w => `
        <div class="admin-wd-item">
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <div>
              <div style="font-weight:600;color:#EAECEF;font-size:13px">Пользователь #${w.profile_id || w.user_id || '—'}</div>
              <div style="font-size:12px;color:#848E9C;margin-top:4px">${parseFloat(w.amount_rub || w.amount || 0).toFixed(0)} ₽ (${parseFloat(w.usdt_required || w.amount_usdt || 0).toFixed(2)} USDT)</div>
              <div style="font-size:11px;color:#848E9C;margin-top:2px">💳 ${w.card_number || '—'}</div>
              <div style="font-size:11px;color:#5E6673;margin-top:2px">${w.created_at ? new Date(w.created_at).toLocaleString('ru-RU') : ''}</div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
              <span style="font-size:11px;padding:3px 8px;border-radius:4px;background:${w.status === 'pending' ? 'rgba(240,185,11,0.15);color:#F0B90B' : w.status === 'completed' ? 'rgba(14,203,129,0.15);color:#0ECB81' : 'rgba(246,70,93,0.15);color:#F6465D'}">${w.status || '—'}</span>
              ${w.status === 'pending' ? `
                <div style="display:flex;gap:6px">
                  <button class="btn btn-green" style="padding:4px 10px;font-size:11px" data-wd-id="${w.id}" data-action="approve">✓</button>
                  <button class="btn btn-red" style="padding:4px 10px;font-size:11px" data-wd-id="${w.id}" data-action="reject">✕</button>
                </div>
              ` : ''}
            </div>
          </div>
        </div>
      `).join('') : '<div style="text-align:center;padding:32px 0;color:#848E9C">Нет записей</div>'}
    </div>
    ${(data.pages || 1) > 1 ? `
    <div style="display:flex;justify-content:center;gap:8px;margin-top:16px">
      ${page > 1 ? `<button class="btn btn-outline" id="adminWdPrev">← Назад</button>` : ''}
      <span style="color:#848E9C;font-size:12px;align-self:center">${page} / ${data.pages}</span>
      ${page < data.pages ? `<button class="btn btn-outline" id="adminWdNext">Далее →</button>` : ''}
    </div>` : ''}
  </div>`;
  document.getElementById('adminBack').onclick = renderAdminPanel;
  document.querySelectorAll('#adminWdTabs .admin-tab').forEach(btn => {
    btn.onclick = () => renderAdminWithdrawals(btn.dataset.status, 1);
  });
  document.querySelectorAll('[data-wd-id]').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.wdId;
      const action = btn.dataset.action;
      let reason = '';
      if (action === 'reject') { reason = prompt('Причина отклонения:') || ''; }
      try {
        const res = await apiFetch(`/api/admin/withdrawal/${id}/action`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, reason }) });
        const d = await res.json();
        if (d.ok || res.ok) { toast(`✅ Вывод ${action === 'approve' ? 'одобрен' : 'отклонён'}`); renderAdminWithdrawals(status, page); } else toast(d.error || 'Ошибка');
      } catch(e) { toast('Ошибка сети'); }
    };
  });
  document.getElementById('adminWdPrev')?.addEventListener('click', () => renderAdminWithdrawals(status, page - 1));
  document.getElementById('adminWdNext')?.addEventListener('click', () => renderAdminWithdrawals(status, page + 1));
}

// -------- Admin Broadcast ----------
async function renderAdminBroadcast() {
  if (!userData?.is_admin) return;
  setActive('profile');
  const root = document.getElementById('root');
  root.innerHTML = `
  <div class="container" style="padding:16px">
    <div class="admin-breadcrumb"><span class="admin-back-btn" id="adminBack">🛡️ Админ</span> › Рассылка</div>
    <div class="admin-section" style="margin-top:12px">
      <div class="admin-section-title">📢 Массовая рассылка</div>
      <div style="margin-top:12px">
        <label class="label">Сообщение</label>
        <textarea class="input" id="broadcastText" rows="5" placeholder="Введите сообщение для рассылки..." style="resize:vertical;min-height:100px"></textarea>
      </div>
      <div style="margin-top:12px">
        <label class="label">Фильтр получателей</label>
        <select class="input" id="broadcastFilter" style="cursor:pointer">
          <option value="all">Все пользователи</option>
          <option value="premium">Только Premium</option>
          <option value="verified">Только верифицированные</option>
          <option value="with_balance">С балансом > 0</option>
        </select>
      </div>
      <button class="btn btn-primary" id="broadcastSend" style="width:100%;margin-top:16px;padding:12px">📤 Отправить рассылку</button>
    </div>
  </div>`;
  document.getElementById('adminBack').onclick = renderAdminPanel;
  document.getElementById('broadcastSend').onclick = async () => {
    const text = document.getElementById('broadcastText').value.trim();
    const filter = document.getElementById('broadcastFilter').value;
    if (!text) return toast('Введите сообщение');
    if (!confirm(`Отправить рассылку (фильтр: ${filter})?\n\n${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`)) return;
    try {
      const res = await apiFetch('/api/admin/broadcast', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, filter }) });
      const d = await res.json();
      if (d.ok || res.ok) toast(`✅ Рассылка отправлена: ${d.sent || '?'} сообщений`); else toast(d.error || 'Ошибка');
    } catch(e) { toast('Ошибка сети'); }
  };
}

// -------- Admin Logs ----------
async function renderAdminLogs(page = 1) {
  if (!userData?.is_admin) return;
  setActive('profile');
  const root = document.getElementById('root');
  if (typeof page !== 'number') page = 1;
  root.innerHTML = '<div class="container" style="padding:16px"><div class="admin-breadcrumb"><span class="admin-back-btn" id="adminBack">🛡️ Админ</span> › Логи</div><div style="text-align:center;padding:40px 0;color:#848E9C">Загрузка...</div></div>';
  document.getElementById('adminBack')?.addEventListener('click', renderAdminPanel);
  let data = { logs: [], total: 0, page: 1, pages: 1 };
  try {
    const res = await apiFetch(`/api/admin/logs?page=${page}&limit=50`);
    if (res.ok) data = await res.json();
  } catch(e) {}
  const logs = data.logs || data.items || [];
  root.innerHTML = `
  <div class="container" style="padding:16px">
    <div class="admin-breadcrumb"><span class="admin-back-btn" id="adminBack">🛡️ Админ</span> › Логи</div>
    <div style="margin-top:12px">
      ${logs.length > 0 ? logs.map(log => `
        <div class="admin-log-item">
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <div>
              <div style="font-weight:600;color:#EAECEF;font-size:13px">${log.action || '—'}</div>
              <div style="font-size:11px;color:#848E9C;margin-top:2px">Админ: ${log.admin || log.admin_username || '—'} → ${log.target || log.target_user || '—'}</div>
              ${log.old_value !== undefined || log.new_value !== undefined ? `<div style="font-size:11px;color:#5E6673;margin-top:2px">${log.old_value ?? ''} → ${log.new_value ?? ''}</div>` : ''}
            </div>
            <span style="font-size:10px;color:#5E6673;white-space:nowrap">${log.created_at ? new Date(log.created_at).toLocaleString('ru-RU') : ''}</span>
          </div>
        </div>
      `).join('') : '<div style="text-align:center;padding:32px 0;color:#848E9C">Нет записей</div>'}
    </div>
    ${(data.pages || 1) > 1 ? `
    <div style="display:flex;justify-content:center;gap:8px;margin-top:16px">
      ${page > 1 ? `<button class="btn btn-outline" id="adminLogPrev">← Назад</button>` : ''}
      <span style="color:#848E9C;font-size:12px;align-self:center">${page} / ${data.pages}</span>
      ${page < data.pages ? `<button class="btn btn-outline" id="adminLogNext">Далее →</button>` : ''}
    </div>` : ''}
  </div>`;
  document.getElementById('adminBack').onclick = renderAdminPanel;
  document.getElementById('adminLogPrev')?.addEventListener('click', () => renderAdminLogs(page - 1));
  document.getElementById('adminLogNext')?.addEventListener('click', () => renderAdminLogs(page + 1));
}

window.addEventListener('DOMContentLoaded', async ()=>{
  // FORCE CLEAR old language settings (one-time migration)
  const migrationVersion = localStorage.getItem('lang_migration_v2');
  if (!migrationVersion) {
    localStorage.removeItem('lang');
    localStorage.removeItem('lang_manual');
    localStorage.setItem('lang_migration_v2', 'done');
  }
  
  await loadTranslations();
  await ensureUser();
  await renderAssets(); // Wait for initial data to load
  
  // Initialize notifications button
  const btnNotifications = document.getElementById('btnNotifications');
  if (btnNotifications) {
    btnNotifications.onclick = () => openNotificationsModal();
  }
  await loadNotificationsCount();
  
  // Check if there's a check code in URL
  const urlParams = new URLSearchParams(window.location.search);
  const checkCode = urlParams.get('check');
  if (checkCode) {
    // Show activation dialog
    setTimeout(async () => {
      const confirm = window.confirm(`У вас есть чек!\n\nАктивировать чек?\nКод: ${checkCode}`);
      if (confirm) {
        await activateCheck(checkCode);
        // Remove check from URL
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }, 1000);
  }
  
  // Hide splash screen after everything is loaded (minimum 1.2s for UX)
  setTimeout(() => {
    hideSplashScreen();
  }, 800); // Shorter delay since we already waited for renderAssets()
  
  const a=document.querySelector('.nav-item[data-tab="assets"]');
  const tradeTab=document.querySelector('.nav-item[data-tab="trade"]');
  const s=document.querySelector('.nav-item[data-tab="referrals"]');
  if(a) a.onclick = renderAssets;
  if(tradeTab) tradeTab.onclick = renderTrade;
  if(s) s.onclick = renderReferrals;
  const profileTab = document.querySelector('.nav-item[data-tab="profile"]');
  if(profileTab) profileTab.onclick = () => {
    if(userData?.is_admin) renderAdminPanel();
    else renderProfile();
  };
  const btnLang=document.getElementById('btnLang');
  if(btnLang){ btnLang.onclick = ()=>{ setLang(i18n.lang==='ru'?'en':'ru', true); toast(t('toast.saved')); }; }
});

window.createCheck = createCheck;

// -------- Pull to Refresh ----------
let currentTab = 'assets';
let pullStartY = 0;
let isPulling = false;
let isRefreshing = false;

function initPullToRefresh() {
  const indicator = document.getElementById('pullIndicator');
  const pullText = document.getElementById('pullText');
  const pullArrow = indicator?.querySelector('.pull-arrow');
  if (!indicator) return;
  
  const threshold = 80;
  
  document.addEventListener('touchstart', (e) => {
    if (isRefreshing) return;
    if (window.scrollY <= 0) {
      pullStartY = e.touches[0].clientY;
      isPulling = true;
    }
  }, { passive: true });
  
  document.addEventListener('touchmove', (e) => {
    if (!isPulling || isRefreshing) return;
    
    const pullDistance = e.touches[0].clientY - pullStartY;
    
    if (pullDistance > 0 && window.scrollY <= 0) {
      const progress = Math.min(pullDistance / threshold, 1);
      
      if (pullDistance > 20) {
        indicator.classList.add('visible');
        
        if (pullDistance >= threshold) {
          pullText.textContent = i18n.lang === 'en' ? 'Release to refresh' : 'Отпустите для обновления';
          pullArrow.classList.add('rotated');
        } else {
          pullText.textContent = i18n.lang === 'en' ? 'Pull to refresh' : 'Потяните для обновления';
          pullArrow.classList.remove('rotated');
        }
      }
    }
  }, { passive: true });
  
  document.addEventListener('touchend', async () => {
    if (!isPulling || isRefreshing) return;
    isPulling = false;
    
    const indicator = document.getElementById('pullIndicator');
    const pullText = document.getElementById('pullText');
    const pullArrow = indicator?.querySelector('.pull-arrow');
    
    if (pullArrow?.classList.contains('rotated')) {
      isRefreshing = true;
      pullText.textContent = i18n.lang === 'en' ? 'Refreshing...' : 'Обновление...';
      pullArrow.classList.remove('rotated');
      indicator.classList.add('refreshing');
      
      // Haptic feedback
      if (tg?.HapticFeedback) {
        tg.HapticFeedback.impactOccurred('medium');
      }
      
      // Refresh current tab
      try {
        const activeTab = document.querySelector('.nav-item.active');
        const tab = activeTab?.dataset?.tab || 'assets';
        
        if (tab === 'assets') await renderAssets();
        else if (tab === 'trade') await renderTrade();
        else if (tab === 'referrals') await renderReferrals();
        else if (tab === 'profile') {
          if(userData?.is_admin) await renderAdminPanel();
          else await renderProfile();
        }
        
        toast(i18n.lang === 'en' ? 'Updated!' : 'Обновлено!');
      } catch (e) {
        console.error('Refresh failed', e);
      }
      
      setTimeout(() => {
        indicator.classList.remove('visible', 'refreshing');
        isRefreshing = false;
      }, 300);
    } else {
      indicator.classList.remove('visible');
    }
  });
}

// Initialize pull-to-refresh after DOM loaded
setTimeout(initPullToRefresh, 1000);