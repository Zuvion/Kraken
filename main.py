
import os, json, time, hashlib, hmac, asyncio
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, List
from fastapi import FastAPI, Request, Depends, HTTPException, UploadFile, File, Form, Query, APIRouter
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
import aiohttp
from sqlalchemy import Column, Integer, String, DateTime, Float, Text, ForeignKey, JSON, Boolean, select, func, text, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import declarative_base, sessionmaker

BOT_TOKEN = os.getenv("BOT_TOKEN")
CMC_API_KEY = os.getenv("CMC_API_KEY", os.getenv("Coinmarketcap_CMC_API_KEY"))
CRYPTO_PAY_TOKEN = os.getenv("CRYPTO_PAY_TOKEN", os.getenv("CryptoBot_PAY_TOKEN"))
ADMIN_ID = int(os.getenv("ADMIN_ID")) if os.getenv("ADMIN_ID") else None

# Validate required environment variables
if not BOT_TOKEN:
    raise ValueError("BOT_TOKEN environment variable is required")
if not ADMIN_ID:
    raise ValueError("ADMIN_ID environment variable is required")
# Auto-detect HOST_BASE for different environments
_replit_domain = os.getenv("REPLIT_DEV_DOMAIN")
if _replit_domain:
    HOST_BASE = f"https://{_replit_domain}"
else:
    HOST_BASE = os.getenv("HOST_BASE", "https://rengle.site")
MIN_DEPOSIT_USDT = float(os.getenv("MIN_DEPOSIT_USDT", "50"))
import ssl
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
from fastapi.middleware.cors import CORSMiddleware

def validate_telegram_init_data(init_data_raw: str, bot_token: str) -> dict | None:
    try:
        parsed = parse_qs(init_data_raw, keep_blank_values=True)
        received_hash = parsed.pop("hash", [None])[0]
        if not received_hash:
            return None
        sorted_params = sorted(
            (k, v[0]) for k, v in parsed.items()
        )
        data_check_string = "\n".join(f"{k}={v}" for k, v in sorted_params)
        secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
        expected_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected_hash, received_hash):
            return None
        auth_date = int(parsed.get("auth_date", ["0"])[0])
        if auth_date and (time.time() - auth_date) > 86400:
            return None
        user_data = parsed.get("user", [None])[0]
        if user_data:
            return json.loads(user_data)
        return None
    except Exception:
        return None

raw_db_url = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./app.db")
print(f"[Kraken] DATABASE_URL: {raw_db_url[:50] if raw_db_url else 'NOT SET'}...")

def create_db_engine(db_url):
    """Create database engine with smart SSL detection for different hosting platforms"""
    if not db_url or db_url.startswith("sqlite"):
        return create_async_engine(db_url, pool_pre_ping=True)
    
    if db_url.startswith("postgresql://") or db_url.startswith("postgres://"):
        clean_url = db_url.replace("postgres://", "postgresql+asyncpg://", 1).replace("postgresql://", "postgresql+asyncpg://", 1)
        parsed = urlparse(clean_url)
        
        query_params = parse_qs(parsed.query)
        query_params.pop('sslmode', None)
        query_params.pop('ssl', None)
        clean_query = urlencode(query_params, doseq=True)
        clean_url = urlunparse((parsed.scheme, parsed.netloc, parsed.path, parsed.params, clean_query, parsed.fragment))
        
        hostname = parsed.hostname or ""
        
        is_railway = 'railway' in hostname.lower() or os.getenv('RAILWAY_ENVIRONMENT')
        is_internal = hostname in ('localhost', '127.0.0.1', 'postgres', 'db') or hostname.startswith('dpg-')
        is_local_dev = hostname in ('helium', 'localhost', '127.0.0.1')
        
        print(f"[Kraken] DB Host: {hostname}, Railway: {is_railway}, Internal: {is_internal}")
        
        if is_internal or is_local_dev:
            return create_async_engine(clean_url, pool_pre_ping=True, pool_size=5, max_overflow=10)
        else:
            ssl_ctx = ssl.create_default_context()
            ssl_ctx.check_hostname = False
            ssl_ctx.verify_mode = ssl.CERT_NONE
            return create_async_engine(clean_url, pool_pre_ping=True, pool_size=5, max_overflow=10, connect_args={"ssl": ssl_ctx})
    
    return create_async_engine(db_url, pool_pre_ping=True)

engine = create_db_engine(raw_db_url)
print(f"[Kraken] Database engine created successfully")

Base = declarative_base()
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

class User(Base):
    __tablename__="users"
    id=Column(Integer, primary_key=True)
    telegram_id=Column(String, unique=True, index=True)
    profile_id=Column(Integer, unique=True, index=True)
    username=Column(String)
    language=Column(String, default="ru")
    balance_usdt=Column(Float, default=0.0)  # Real balance (actual money)
    balance_rub=Column(Float, default=0.0)  # Russian Ruble balance
    virtual_balance=Column(Float, default=0.0)  # Virtual balance (only affects display, added to balance_usdt for user view)
    preferred_fiat=Column(String, default="RUB")  # Preferred fiat currency: RUB, BYN, UAH
    wallets=Column(JSON, default=dict)
    addresses=Column(JSON, default=dict)
    referral_code=Column(String, unique=True, index=True, nullable=True)  # Unique referral code
    referred_by=Column(Integer, nullable=True)  # Profile ID of referrer
    referral_earnings=Column(Float, default=0.0)  # Total earnings from referrals
    referral_count=Column(Integer, default=0)  # Number of referred users
    is_verified=Column(Boolean, default=False)  # Account verified status
    is_premium=Column(Boolean, default=False)  # Premium subscription status
    is_blocked=Column(Boolean, default=False)  # Account blocked status
    block_reason=Column(Text, nullable=True)  # Reason for blocking
    lucky_mode=Column(Boolean, default=False)
    lucky_until=Column(DateTime, nullable=True)
    lucky_max_wins=Column(Integer, nullable=True)
    lucky_wins_used=Column(Integer, default=0)
    created_at=Column(DateTime, default=datetime.utcnow)

class Transaction(Base):
    __tablename__="transactions"
    id=Column(Integer, primary_key=True)
    user_id=Column(Integer, ForeignKey("users.id"))
    type=Column(String)
    amount=Column(Float)
    currency=Column(String)
    details=Column(JSON, default=dict)
    status=Column(String, default="done")
    created_at=Column(DateTime, default=datetime.utcnow)

class Withdrawal(Base):
    __tablename__="withdrawals"
    id=Column(Integer, primary_key=True)
    user_id=Column(Integer, ForeignKey("users.id"))
    telegram_id=Column(String)  # User's Telegram ID for admin panel
    amount_rub=Column(Float)  # Original requested amount in RUB
    usdt_required=Column(Float)  # USDT amount needed (with fees)
    card_number=Column(String)  # Original card number (last 4 digits visible)
    card_hash=Column(String)  # SHA-256 hash of card number
    full_name=Column(String)  # Cardholder full name
    status=Column(String, default="pending")  # pending, processing, completed, cancelled, modified
    
    # Admin modification fields
    modified_by_admin=Column(Boolean, default=False)
    modified_amount_rub=Column(Float, nullable=True)  # Modified amount if changed
    modified_to_crypto=Column(Boolean, default=False)  # True if admin changed to crypto withdrawal
    crypto_currency=Column(String, nullable=True)  # e.g., 'USDT', 'BTC', 'ETH'
    crypto_address=Column(String, nullable=True)  # Crypto wallet address if modified
    admin_notes=Column(Text, nullable=True)  # Admin notes/comments
    
    created_at=Column(DateTime, default=datetime.utcnow)
    updated_at=Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    completed_at=Column(DateTime, nullable=True)

class Trade(Base):
    __tablename__="trades"
    id=Column(Integer, primary_key=True)
    user_id=Column(Integer, ForeignKey("users.id"))
    pair=Column(String)
    side=Column(String)
    amount_usdt=Column(Float)
    start_price=Column(Float)
    close_price=Column(Float, nullable=True)  # Price at trade close
    opened_at=Column(DateTime, default=datetime.utcnow)
    duration_sec=Column(Integer, default=60)
    status=Column(String, default="active")  # active, completed, canceled
    result=Column(String, nullable=True)  # win, loss
    payout=Column(Float, default=0.0)
    closed_at=Column(DateTime, nullable=True)

class SupportMessage(Base):
    __tablename__="support_messages"
    id=Column(Integer, primary_key=True)
    user_id=Column(Integer, ForeignKey("users.id"))
    sender=Column(String)
    text=Column(Text, nullable=True)
    file_path=Column(String, nullable=True)
    created_at=Column(DateTime, default=datetime.utcnow)

class AdminMessage(Base):
    __tablename__="admin_messages"
    id=Column(Integer, primary_key=True)
    user_id=Column(Integer, ForeignKey("users.id"), nullable=True)  # NULL for broadcast messages
    message_text=Column(Text)
    is_broadcast=Column(Boolean, default=False)  # True if sent to all/multiple users
    broadcast_count=Column(Integer, nullable=True)  # Number of users who received this message
    is_deleted=Column(Boolean, default=False)  # True if admin deleted the message
    delivery_type=Column(String, default="app_chat")  # "app_chat" or "telegram_chat"
    created_at=Column(DateTime, default=datetime.utcnow)
    deleted_at=Column(DateTime, nullable=True)

class UserNotificationRead(Base):
    """Tracks which notifications a user has read"""
    __tablename__="user_notification_reads"
    id=Column(Integer, primary_key=True)
    user_id=Column(Integer, ForeignKey("users.id"), index=True)
    admin_message_id=Column(Integer, ForeignKey("admin_messages.id"), index=True)
    read_at=Column(DateTime, default=datetime.utcnow)

class Asset(Base):
    __tablename__="assets"
    id=Column(Integer, primary_key=True)
    symbol=Column(String, index=True)
    name=Column(String)
    asset_class=Column(String, index=True)
    otc=Column(Boolean, default=False, index=True)
    display=Column(String)
    exchange=Column(String)
    status=Column(String, default="active", index=True)
    created_at=Column(DateTime, default=datetime.utcnow)
    updated_at=Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class Check(Base):
    __tablename__="checks"
    id=Column(Integer, primary_key=True)
    creator_id=Column(Integer, ForeignKey("users.id"))  # Only admin can create
    amount_usdt=Column(Float)
    check_code=Column(String, unique=True, index=True)  # Unique activation code
    status=Column(String, default="active")  # active, activated, expired
    activated_by=Column(Integer, ForeignKey("users.id"), nullable=True)
    activated_at=Column(DateTime, nullable=True)
    expires_at=Column(DateTime, nullable=True)  # Optional expiration
    created_at=Column(DateTime, default=datetime.utcnow)

class AdminLog(Base):
    __tablename__="admin_logs"
    id=Column(Integer, primary_key=True)
    admin_id=Column(String)
    user_id=Column(Integer, nullable=True)
    action=Column(String)
    before_value=Column(Text, nullable=True)
    after_value=Column(Text, nullable=True)
    reason=Column(Text, nullable=True)
    details=Column(JSON, default=dict)
    created_at=Column(DateTime, default=datetime.utcnow)

# Admin reply state: stores which user admin is replying to
admin_reply_state = {}



# Admin FSM states for inline button dialogs
# States: awaiting_message
# Format: {admin_id: {"state": "awaiting_message", "user_id": ..., "data": {...}}}
admin_states = {}

async def get_db():
    async with AsyncSessionLocal() as s: yield s
def sha256(s:str)->str: return hashlib.sha256(s.encode("utf-8")).hexdigest()
CMC_BASE="https://pro-api.coinmarketcap.com/v1"
async def cmc_simple_price(symbol:str, convert="USDT")->float|None:
    if symbol.endswith("USDT"): symbol=symbol[:-4]
    headers={"X-CMC_PRO_API_KEY": CMC_API_KEY}
    try:
        async with aiohttp.ClientSession() as sess:
            async with sess.get(f"{CMC_BASE}/cryptocurrency/quotes/latest", headers=headers, params={"symbol":symbol,"convert":convert}, timeout=15) as r:
                d=await r.json(); return float(d["data"][symbol]["quote"][convert]["price"])
    except: return None

async def cmc_usdt_to_fiat(fiat="RUB")->float:
    p=await cmc_simple_price("USDT", fiat)
    return float(p) if p else 78.0

OKX_BASE = "https://www.okx.com/api/v5"

async def okx_get_price(symbol: str, max_retries: int = 3) -> float | None:
    """
    Get real-time price from OKX API with retry logic
    
    Args:
        symbol: Trading symbol (e.g. BTC, ETH, BTC-USDT)
        max_retries: Maximum number of retry attempts (default: 3)
    
    Returns:
        float: Current price or None if all attempts failed
    """
    if "-" not in symbol:
        if not symbol.endswith("USDT"):
            symbol = symbol.upper() + "-USDT"
        else:
            symbol = symbol.replace("USDT", "-USDT")
    
    for attempt in range(max_retries):
        try:
            async with aiohttp.ClientSession() as sess:
                async with sess.get(
                    f"{OKX_BASE}/market/ticker",
                    params={"instId": symbol},
                    timeout=10
                ) as r:
                    if r.status == 200:
                        data = await r.json()
                        if data.get("code") == "0" and data.get("data"):
                            price = float(data["data"][0]["last"])
                            return price
                    elif r.status == 429:  # Rate limit
                        if attempt < max_retries - 1:
                            await asyncio.sleep(2 ** attempt)  # Exponential backoff: 1s, 2s, 4s
                            continue
                    else:
                        if attempt < max_retries - 1:
                            await asyncio.sleep(1)
                            continue
        except asyncio.TimeoutError:
            if attempt < max_retries - 1:
                await asyncio.sleep(1)
                continue
        except Exception as e:
            if attempt < max_retries - 1:
                await asyncio.sleep(1)
                continue
    
    return None

async def okx_get_klines(symbol: str = "BTCUSDT", interval_minutes: int = 5):
    """Get real candlestick data from OKX API
    
    interval_minutes represents the CANDLE SIZE (like Pocket Option):
    - 1 = 1-minute candles (M1)
    - 5 = 5-minute candles (M5)
    - 1440 = daily candles (D1)
    Always shows ~30-40 candles for consistent chart view
    """
    # Map interval to (OKX_bar_format, number_of_candles)
    interval_config = {
        1: ("1m", 40),      # M1: 1m candles × 40 = 40 minutes of data
        5: ("5m", 36),      # M5: 5m candles × 36 = 3 hours of data
        15: ("15m", 32),    # M15: 15m candles × 32 = 8 hours of data
        30: ("30m", 30),    # M30: 30m candles × 30 = 15 hours of data
        60: ("1H", 24),     # H1: 1H candles × 24 = 1 day of data
        240: ("4H", 18),    # H4: 4H candles × 18 = 3 days of data
        1440: ("1D", 20)    # D1: 1D candles × 20 = 20 days of data
    }
    
    bar, limit = interval_config.get(interval_minutes, ("5m", 36))
    
    if "-" not in symbol:
        if not symbol.endswith("USDT"):
            symbol = symbol.upper() + "-USDT"
        else:
            symbol = symbol.replace("USDT", "-USDT")
    
    try:
        async with aiohttp.ClientSession() as sess:
            async with sess.get(
                f"{OKX_BASE}/market/candles",
                params={"instId": symbol, "bar": bar, "limit": limit},
                timeout=10
            ) as r:
                if r.status == 200:
                    data = await r.json()
                    if data.get("code") == "0" and data.get("data"):
                        klines_data = data["data"]
                        
                        candles = []
                        for kline in reversed(klines_data):
                            candles.append({
                                "t": int(kline[0]),
                                "o": round(float(kline[1]), 2),
                                "h": round(float(kline[2]), 2),
                                "l": round(float(kline[3]), 2),
                                "c": round(float(kline[4]), 2)
                            })
                        
                        if candles:
                            current_price = candles[-1]['c']
                            change_pct = round(((candles[-1]['c'] - candles[0]['o']) / candles[0]['o']) * 100, 2)
                            return {
                                "price": round(current_price, 4),
                                "change_pct": change_pct,
                                "candles": candles
                            }
    except:
        pass
    
    price = await okx_get_price(symbol) or 50000.0
    return {
        "price": round(price, 4),
        "change_pct": 0.0,
        "candles": [{"t": int(time.time() * 1000), "o": price, "h": price, "l": price, "c": price}]
    }

def aggregate_candles(candles_1m: List[Dict], target_tf: str) -> List[Dict]:
    """
    Aggregate 1-minute candles into larger timeframes (2m, 10m)
    
    Args:
        candles_1m: List of 1-minute candles with 't' timestamp in ms
        target_tf: Target timeframe ('2m' or '10m')
    
    Returns:
        List of aggregated candles
    """
    if not candles_1m:
        return []
    
    agg_minutes = {"2m": 2, "10m": 10}.get(target_tf)
    if not agg_minutes:
        return candles_1m
    
    candles_1m.sort(key=lambda x: x['t'])
    
    aggregated = []
    i = 0
    while i < len(candles_1m):
        dt = datetime.fromtimestamp(candles_1m[i]['t'] / 1000, tz=timezone.utc)
        boundary_minute = (dt.minute // agg_minutes) * agg_minutes
        boundary_dt = dt.replace(minute=boundary_minute, second=0, microsecond=0)
        boundary_ts = int(boundary_dt.timestamp() * 1000)
        
        group = []
        while i < len(candles_1m):
            candle_dt = datetime.fromtimestamp(candles_1m[i]['t'] / 1000, tz=timezone.utc)
            if candle_dt < boundary_dt + timedelta(minutes=agg_minutes):
                group.append(candles_1m[i])
                i += 1
            else:
                break
        
        if group:
            agg_candle = {
                't': boundary_ts,
                'o': group[0]['o'],
                'h': max(c['h'] for c in group),
                'l': min(c['l'] for c in group),
                'c': group[-1]['c'],
                'v': sum(c.get('v', 0) for c in group)
            }
            aggregated.append(agg_candle)
    
    return aggregated

# Helper functions for user display
def format_user_display(user):
    """Format user display as #ProfileID or @username"""
    if user:
        if user.profile_id:
            return f"#{user.profile_id}"
        elif user.username:
            return f"@{user.username}"
        else:
            return f"TG:{user.telegram_id}"
    return "N/A"

def format_user_info(user):
    """Format full user info with both ID and username"""
    if user:
        parts = []
        if user.profile_id:
            parts.append(f"#{user.profile_id}")
        if user.username:
            parts.append(f"@{user.username}")
        if not parts:
            parts.append(f"TG:{user.telegram_id}")
        return " | ".join(parts)
    return "N/A"

# Create required directories if they don't exist
for dir_path in ["static", "static/css", "static/js", "static/img", "static/uploads", "i18n", "templates"]:
    os.makedirs(dir_path, exist_ok=True)

app=FastAPI(title="Kraken Exchange")
app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/i18n", StaticFiles(directory="i18n"), name="i18n")
templates=Jinja2Templates(directory="templates")

_cors_origins = ["https://web.telegram.org", "https://t.me"]
if _replit_domain:
    _cors_origins.append(f"https://{_replit_domain}")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
    allow_credentials=False,
)

_SKIP_AUTH_PATHS = frozenset(["/", "/health", "/webhook", "/webhook/cryptobot", "/api/cryptobot/webhook", "/favicon.ico"])
_SKIP_AUTH_PREFIXES = ("/static/", "/i18n/")
_IS_PRODUCTION = bool(os.getenv("RAILWAY_ENVIRONMENT") or os.getenv("RENDER") or os.getenv("FLY_APP_NAME"))

@app.middleware("http")
async def telegram_auth_middleware(request: Request, call_next):
    path = request.url.path
    if path in _SKIP_AUTH_PATHS or path.startswith(_SKIP_AUTH_PREFIXES):
        return await call_next(request)
    try:
        init_data_raw = request.headers.get("X-Telegram-Init-Data", "")
        if init_data_raw:
            user_data = validate_telegram_init_data(init_data_raw, BOT_TOKEN)
            if user_data:
                request.state.telegram_id = str(user_data.get("id", ""))
                request.state.telegram_username = user_data.get("username")
                if request.state.telegram_id:
                    return await call_next(request)
        if not _IS_PRODUCTION:
            fallback_id = request.headers.get("X-Telegram-Id", "")
            if fallback_id:
                request.state.telegram_id = str(fallback_id)
                request.state.telegram_username = None
                return await call_next(request)
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    except Exception:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

@app.exception_handler(Exception)
async def generic_exception_handler(request, exc):
    return JSONResponse({"error": "Internal server error"}, status_code=500)

@app.exception_handler(404)
async def not_found_handler(request, exc):
    return JSONResponse({"error": "Not found"}, status_code=404)

@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
        # Auto-migration: Add virtual_balance and balance_rub to users
        try:
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS virtual_balance FLOAT DEFAULT 0.0"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS balance_rub FLOAT DEFAULT 0.0"))
            # Migrate old display_balance_usdt to virtual_balance
            await conn.execute(text("UPDATE users SET virtual_balance = display_balance_usdt WHERE display_balance_usdt IS NOT NULL AND virtual_balance IS NULL"))
        except Exception:
            pass
        
        # Auto-migration: Add new withdrawal columns
        try:
            await conn.execute(text("ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS telegram_id VARCHAR"))
            await conn.execute(text("ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS card_number VARCHAR"))
            await conn.execute(text("ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS modified_by_admin BOOLEAN DEFAULT FALSE"))
            await conn.execute(text("ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS modified_amount_rub FLOAT"))
            await conn.execute(text("ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS modified_to_crypto BOOLEAN DEFAULT FALSE"))
            await conn.execute(text("ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS crypto_currency VARCHAR"))
            await conn.execute(text("ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS crypto_address VARCHAR"))
            await conn.execute(text("ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS admin_notes TEXT"))
            await conn.execute(text("ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP"))
            await conn.execute(text("ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP"))
        except Exception:
            pass
        
        # Auto-migration: Add delivery_type to admin_messages
        try:
            await conn.execute(text("ALTER TABLE admin_messages ADD COLUMN IF NOT EXISTS delivery_type VARCHAR DEFAULT 'app_chat'"))
            await conn.execute(text("UPDATE admin_messages SET delivery_type = 'app_chat' WHERE delivery_type IS NULL"))
        except Exception:
            pass
        
        # Auto-migration: Add preferred_fiat to users
        try:
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_fiat VARCHAR DEFAULT 'RUB'"))
            await conn.execute(text("UPDATE users SET preferred_fiat = 'RUB' WHERE preferred_fiat IS NULL"))
        except Exception:
            pass
        
        # Auto-migration: Add is_verified and is_premium to users
        try:
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_premium BOOLEAN DEFAULT FALSE"))
        except Exception:
            pass
        
        # Auto-migration: Add is_blocked and block_reason to users
        try:
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS block_reason TEXT"))
        except Exception:
            pass
        
        # Auto-migration: Add lucky mode columns
        for col_name, col_type, col_default in [
            ("lucky_mode", "BOOLEAN", "FALSE"),
            ("lucky_until", "TIMESTAMP", "NULL"),
            ("lucky_max_wins", "INTEGER", "NULL"),
            ("lucky_wins_used", "INTEGER", "0"),
        ]:
            try:
                await conn.execute(text(f"ALTER TABLE users ADD COLUMN {col_name} {col_type} DEFAULT {col_default}"))
            except:
                pass
        
        await conn.commit()
    
    # Auto-setup Telegram webhook on startup
    try:
        webhook_url = f"{HOST_BASE}/webhook"
        async with aiohttp.ClientSession() as session:
            async with session.get(f"https://api.telegram.org/bot{BOT_TOKEN}/setWebhook?url={webhook_url}") as resp:
                result = await resp.json()
                print(f"[Kraken] Webhook setup: {result.get('ok')} - {webhook_url}")
    except Exception as e:
        print(f"[Kraken] Webhook setup failed: {e}")
@app.get("/", response_class=HTMLResponse)
async def root(request: Request): 
    response = templates.TemplateResponse("base.html", {
        "request": request,
        "cache_bust": int(time.time())
    })
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response
@app.get("/health")
async def health(): return {"ok": True}
class EnsureUser(BaseModel):
    telegram_id: int|None=None; username: str|None=None; language: str|None="ru"
import secrets
import string

def generate_referral_code():
    chars = string.ascii_uppercase + string.digits
    return ''.join(secrets.choice(chars) for _ in range(8))

async def get_or_create_user(db: AsyncSession, telegram_id: str, username: str|None, language: str="ru", referrer_code: str|None=None):
    q=await db.execute(select(User).where(User.telegram_id==str(telegram_id))); u=q.scalars().first()
    if u:
        if language and u.language!=language: u.language=language; await db.commit()
        return u
    q2=await db.execute(select(func.max(User.profile_id))); maxpid=q2.scalar() or 100000
    
    ref_code = generate_referral_code()
    while (await db.execute(select(User).where(User.referral_code==ref_code))).scalars().first():
        ref_code = generate_referral_code()
    
    referred_by = None
    if referrer_code:
        referrer = (await db.execute(select(User).where(User.referral_code==referrer_code))).scalars().first()
        if referrer:
            referred_by = referrer.profile_id
            referrer.referral_count = (referrer.referral_count or 0) + 1
    
    u=User(telegram_id=str(telegram_id), username=username, language=language, profile_id=int(maxpid)+1, wallets={}, addresses={}, referral_code=ref_code, referred_by=referred_by)
    db.add(u); await db.commit(); return u
@app.post("/api/auth/ensure")
async def api_ensure_user(p: EnsureUser, request: Request, db: AsyncSession=Depends(get_db)):
    tid = getattr(request.state, 'telegram_id', None)
    if not tid:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    username = getattr(request.state, 'telegram_username', None)
    u=await get_or_create_user(db, str(tid), username, p.language or "ru")
    return {"ok":True, "user_id":u.id, "telegram_id":u.telegram_id, "profile_id":u.profile_id}
@app.get("/api/user")
async def api_user(db: AsyncSession=Depends(get_db), request: Request=None):
    tid = getattr(request.state, 'telegram_id', None)
    if not tid:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    u=(await db.execute(select(User).where(User.telegram_id==str(tid)))).scalars().first()
    if not u: u=await get_or_create_user(db, str(tid), "localtester", "ru")
    is_admin = str(tid) == str(ADMIN_ID)
    
    # Show combined balance to users (real + virtual)
    displayed_balance = (u.balance_usdt or 0.0) + (u.virtual_balance or 0.0)
    
    # Remove RUB from wallets - we only work with USDT now
    wallets = (u.wallets or {}).copy()
    if 'RUB' in wallets:
        del wallets['RUB']
    
    resp = {"id":u.id,"telegram_id":u.telegram_id,"profile_id":u.profile_id,"language":u.language,"balance_usdt":displayed_balance,"balance_rub":u.balance_rub or 0.0,"preferred_fiat":u.preferred_fiat or "RUB","wallets":wallets,"addresses":u.addresses or {},"is_verified":u.is_verified or False,"is_premium":u.is_premium or False,"is_blocked":u.is_blocked or False,"block_reason":u.block_reason}
    if is_admin:
        resp["is_admin"] = True
    return resp

# ========== NOTIFICATIONS API ==========
@app.get("/api/notifications")
async def api_get_notifications(db: AsyncSession=Depends(get_db), request: Request=None):
    """Get all notifications for user (broadcasts + personal messages)"""
    tid = getattr(request.state, 'telegram_id', None)
    if not tid:
        return {"notifications": [], "unread_count": 0}
    
    user = (await db.execute(select(User).where(User.telegram_id == str(tid)))).scalars().first()
    if not user:
        return {"notifications": [], "unread_count": 0}
    
    # Get personal messages for this user
    personal = (await db.execute(
        select(AdminMessage)
        .where(AdminMessage.user_id == user.id, AdminMessage.is_deleted == False)
        .order_by(AdminMessage.created_at.desc())
        .limit(50)
    )).scalars().all()
    
    # Get global broadcasts (user_id is NULL and is_broadcast is True)
    broadcasts = (await db.execute(
        select(AdminMessage)
        .where(AdminMessage.user_id == None, AdminMessage.is_broadcast == True, AdminMessage.is_deleted == False)
        .order_by(AdminMessage.created_at.desc())
        .limit(50)
    )).scalars().all()
    
    # Combine and sort by date
    all_msgs = list(personal) + list(broadcasts)
    all_msgs.sort(key=lambda x: x.created_at, reverse=True)
    
    # Get read notification IDs for this user
    read_ids = set((await db.execute(
        select(UserNotificationRead.admin_message_id)
        .where(UserNotificationRead.user_id == user.id)
    )).scalars().all())
    
    # Build response
    notifications = []
    unread_count = 0
    for msg in all_msgs[:30]:
        is_read = msg.id in read_ids
        if not is_read:
            unread_count += 1
        notifications.append({
            "id": msg.id,
            "message": msg.message_text,
            "is_broadcast": msg.is_broadcast,
            "is_read": is_read,
            "created_at": msg.created_at.isoformat() if msg.created_at else None
        })
    
    return {"notifications": notifications, "unread_count": unread_count}

@app.post("/api/notifications/read")
async def api_mark_notifications_read(request: Request, db: AsyncSession=Depends(get_db)):
    """Mark notifications as read"""
    tid = getattr(request.state, 'telegram_id', None)
    if not tid:
        return {"ok": False}
    
    user = (await db.execute(select(User).where(User.telegram_id == str(tid)))).scalars().first()
    if not user:
        return {"ok": False}
    
    data = await request.json()
    notification_ids = data.get("ids", [])
    
    if not notification_ids:
        # Mark all as read
        all_notifications = (await db.execute(
            select(AdminMessage.id)
            .where(
                or_(
                    AdminMessage.user_id == user.id,
                    and_(AdminMessage.user_id == None, AdminMessage.is_broadcast == True)
                ),
                AdminMessage.is_deleted == False
            )
        )).scalars().all()
        notification_ids = list(all_notifications)
    
    # Get already read IDs
    already_read = set((await db.execute(
        select(UserNotificationRead.admin_message_id)
        .where(UserNotificationRead.user_id == user.id)
    )).scalars().all())
    
    # Add new read entries
    for nid in notification_ids:
        if nid not in already_read:
            db.add(UserNotificationRead(user_id=user.id, admin_message_id=nid))
    
    await db.commit()
    return {"ok": True}

@app.get("/api/notifications/count")
async def api_notifications_count(db: AsyncSession=Depends(get_db), request: Request=None):
    """Get unread notifications count"""
    tid = getattr(request.state, 'telegram_id', None)
    if not tid:
        return {"count": 0}
    
    user = (await db.execute(select(User).where(User.telegram_id == str(tid)))).scalars().first()
    if not user:
        return {"count": 0}
    
    # Get all notification IDs for user
    personal_ids = (await db.execute(
        select(AdminMessage.id)
        .where(AdminMessage.user_id == user.id, AdminMessage.is_deleted == False)
    )).scalars().all()
    
    broadcast_ids = (await db.execute(
        select(AdminMessage.id)
        .where(AdminMessage.user_id == None, AdminMessage.is_broadcast == True, AdminMessage.is_deleted == False)
    )).scalars().all()
    
    all_ids = set(personal_ids) | set(broadcast_ids)
    
    # Get read IDs
    read_ids = set((await db.execute(
        select(UserNotificationRead.admin_message_id)
        .where(UserNotificationRead.user_id == user.id)
    )).scalars().all())
    
    unread_count = len(all_ids - read_ids)
    return {"count": unread_count}

@app.get("/api/referrals")
async def api_referrals(db: AsyncSession=Depends(get_db), request: Request=None):
    """Get referral info for current user"""
    tid = getattr(request.state, 'telegram_id', None)
    if not tid:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    u=(await db.execute(select(User).where(User.telegram_id==str(tid)))).scalars().first()
    if not u:
        return {"error": "User not found"}
    
    if not u.referral_code:
        u.referral_code = generate_referral_code()
        while (await db.execute(select(User).where(User.referral_code==u.referral_code, User.id != u.id))).scalars().first():
            u.referral_code = generate_referral_code()
        await db.commit()
    
    referrals = (await db.execute(select(User).where(User.referred_by==u.profile_id).order_by(User.created_at.desc()))).scalars().all()
    referral_list = []
    for ref in referrals:
        referral_list.append({
            "username": ref.username or "Аноним",
            "date": ref.created_at.strftime("%d.%m.%Y") if ref.created_at else "N/A"
        })
    
    return {
        "referral_code": u.referral_code,
        "referral_count": u.referral_count or 0,
        "referral_earnings": u.referral_earnings or 0.0,
        "referrals": referral_list
    }

@app.get("/api/prices")
async def api_prices():
    """Get current prices and 24h change for all supported cryptocurrencies from OKX"""
    cryptos = ['BTC', 'ETH', 'TON', 'SOL', 'BNB', 'XRP', 'DOGE', 'LTC', 'TRX']
    prices = {'USDT': {'price': 1.0, 'change_24h': 0.0}}
    
    try:
        async with aiohttp.ClientSession() as sess:
            async with sess.get(
                f"{OKX_BASE}/market/tickers",
                params={"instType": "SPOT"},
                timeout=15
            ) as r:
                if r.status == 200:
                    data = await r.json()
                    if data.get("code") == "0" and data.get("data"):
                        tickers = {t["instId"]: t for t in data["data"]}
                        
                        for sym in cryptos:
                            inst_id = f"{sym}-USDT"
                            if inst_id in tickers:
                                ticker = tickers[inst_id]
                                try:
                                    last_price = float(ticker.get("last", 0))
                                    open_24h = float(ticker.get("open24h", 0))
                                    if open_24h > 0:
                                        change_24h = ((last_price - open_24h) / open_24h) * 100
                                    else:
                                        change_24h = 0.0
                                    prices[sym] = {
                                        'price': last_price,
                                        'change_24h': round(change_24h, 2)
                                    }
                                except (ValueError, TypeError):
                                    prices[sym] = {'price': 0, 'change_24h': 0.0}
                            else:
                                prices[sym] = {'price': 0, 'change_24h': 0.0}
                        return prices
    except Exception as e:
        print(f"[PRICES] Error fetching tickers: {e}")
    
    for sym in cryptos:
        try:
            price = await okx_get_price(sym)
            prices[sym] = {'price': float(price) if price else 0, 'change_24h': 0.0}
        except Exception as e:
            print(f"[PRICES] Error getting price for {sym}: {e}")
            prices[sym] = {'price': 0, 'change_24h': 0.0}
    
    return prices

async def get_exchange_rates():
    """Get USD exchange rates from free API"""
    try:
        async with aiohttp.ClientSession() as sess:
            async with sess.get("https://open.er-api.com/v6/latest/USD", timeout=10) as r:
                if r.status == 200:
                    data = await r.json()
                    rates = data.get("rates", {})
                    return {
                        "usd_rub": rates.get("RUB", 78.0),
                        "usd_uah": rates.get("UAH", 42.2),
                        "usd_byn": rates.get("BYN", 2.92)
                    }
    except Exception as e:
        print(f"[RATES] Error fetching exchange rates: {e}")
    return {"usd_rub": 78.0, "usd_uah": 42.2, "usd_byn": 2.92}

@app.get("/api/rates")
async def api_rates():
    """Get current exchange rates for RUB, BYN, UAH to USD"""
    return await get_exchange_rates()

class SetCurrencyPayload(BaseModel):
    currency: str

@app.post("/api/user/currency")
async def api_set_currency(p: SetCurrencyPayload, db: AsyncSession=Depends(get_db), request: Request=None):
    """Set user's preferred fiat currency"""
    tid = getattr(request.state, 'telegram_id', None)
    if not tid:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    u = (await db.execute(select(User).where(User.telegram_id == str(tid)))).scalars().first()
    if not u:
        return JSONResponse({"ok": False, "error": "User not found"})
    
    valid_currencies = ["RUB", "BYN", "UAH"]
    currency = p.currency.upper()
    if currency not in valid_currencies:
        return JSONResponse({"ok": False, "error": f"Invalid currency. Use: {', '.join(valid_currencies)}"})
    
    u.preferred_fiat = currency
    await db.commit()
    return {"ok": True, "currency": currency}

@app.get("/api/tickers")
async def api_tickers():
    """Get prices and 24h change for all trading pairs from OKX"""
    trading_pairs = ['BTC', 'ETH', 'SOL', 'ADA', 'DOT', 'LINK', 'MATIC', 'AVAX', 'XRP', 'DOGE', 'SHIB', 'UNI', 'LTC', 'BCH', 'TRX']
    result = {}
    
    async def fetch_ticker(symbol: str):
        inst_id = f"{symbol}-USDT"
        try:
            async with aiohttp.ClientSession() as sess:
                async with sess.get(
                    f"{OKX_BASE}/market/ticker",
                    params={"instId": inst_id},
                    timeout=10
                ) as r:
                    if r.status == 200:
                        data = await r.json()
                        if data.get("code") == "0" and data.get("data"):
                            ticker = data["data"][0]
                            last_price = float(ticker.get("last", 0))
                            open_24h = float(ticker.get("open24h", last_price))
                            if open_24h > 0:
                                change_pct = ((last_price - open_24h) / open_24h) * 100
                            else:
                                change_pct = 0
                            return symbol, {
                                "price": last_price,
                                "change_24h": round(change_pct, 2)
                            }
        except Exception:
            pass
        return symbol, {"price": 0, "change_24h": 0}
    
    tasks = [fetch_ticker(sym) for sym in trading_pairs]
    results = await asyncio.gather(*tasks)
    
    for symbol, data in results:
        result[symbol] = data
    
    return result

@app.get("/api/history")
async def api_history(symbol: str|None=None, db: AsyncSession=Depends(get_db), request: Request=None):
    tid = getattr(request.state, 'telegram_id', None)
    if not tid:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    u=(await db.execute(select(User).where(User.telegram_id==str(tid)))).scalars().first()
    
    # Get transactions
    q=select(Transaction).where(Transaction.user_id==u.id).order_by(Transaction.created_at.desc()).limit(200)
    if symbol: q=q.where(Transaction.currency==symbol)
    rows=(await db.execute(q)).scalars().all()
    transactions = [{"id":r.id,"type":r.type,"amount":r.amount,"currency":r.currency,"status":r.status,"created_at":r.created_at.isoformat(),"details":r.details} for r in rows]
    
    # Get withdrawals
    withdrawals_q = select(Withdrawal).where(Withdrawal.user_id==u.id).order_by(Withdrawal.created_at.desc()).limit(200)
    withdrawals_rows = (await db.execute(withdrawals_q)).scalars().all()
    withdrawals = [{
        "id": w.id,
        "type": "withdrawal",
        "amount": w.usdt_required,
        "currency": "USDT",
        "status": w.status,
        "created_at": w.created_at.isoformat(),
        "details": {
            "amount_rub": w.amount_rub,
            "card_number": w.card_number,
            "full_name": w.full_name,
            "modified_by_admin": w.modified_by_admin,
            "modified_amount_rub": w.modified_amount_rub,
            "modified_to_crypto": w.modified_to_crypto,
            "crypto_currency": w.crypto_currency,
            "crypto_address": w.crypto_address
        }
    } for w in withdrawals_rows]
    
    # Combine and sort by date
    all_items = transactions + withdrawals
    all_items.sort(key=lambda x: x["created_at"], reverse=True)
    
    return all_items
class DepositPayload(BaseModel): amount: float

async def bot_send_message(chat_id:int, text:str, buttons:List[List[Dict[str,str]]]|None=None, parse_mode:str="HTML", reply_keyboard:List[List[Dict]]|None=None):
    url=f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"; payload={"chat_id":chat_id,"text":text,"parse_mode":parse_mode}
    if buttons: payload["reply_markup"]={"inline_keyboard":buttons}
    elif reply_keyboard: payload["reply_markup"]={"keyboard":reply_keyboard,"resize_keyboard":True,"is_persistent":True}
    async with aiohttp.ClientSession() as s:
        async with s.post(url,json=payload) as r:
            try:
                return await r.json()
            except:
                return {}

async def bot_send_document(chat_id: int, file_path: str, caption: str = ""):
    """Send a document file via Telegram Bot API"""
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendDocument"
    try:
        async with aiohttp.ClientSession() as session:
            with open(file_path, 'rb') as f:
                data = aiohttp.FormData()
                data.add_field('chat_id', str(chat_id))
                data.add_field('document', f, filename=os.path.basename(file_path))
                if caption:
                    data.add_field('caption', caption[:1024])
                async with session.post(url, data=data) as resp:
                    return await resp.json()
    except Exception as e:
        print(f"Error sending document: {e}")
        return {"ok": False, "error": str(e)}

async def bot_answer_callback(callback_query_id: str, text: str = None, show_alert: bool = False):
    """Answer callback query to remove loading state from button"""
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/answerCallbackQuery"
    payload = {"callback_query_id": callback_query_id}
    if text:
        payload["text"] = text
        payload["show_alert"] = show_alert
    async with aiohttp.ClientSession() as s:
        async with s.post(url, json=payload) as r:
            try:
                return await r.json()
            except:
                return {}

async def bot_edit_message(chat_id: int, message_id: int, text: str, buttons: List[List[Dict[str,str]]]|None=None, parse_mode: str="HTML"):
    """Edit an existing message with new text and optional inline buttons"""
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/editMessageText"
    payload = {"chat_id": chat_id, "message_id": message_id, "text": text, "parse_mode": parse_mode}
    if buttons:
        payload["reply_markup"] = {"inline_keyboard": buttons}
    async with aiohttp.ClientSession() as s:
        async with s.post(url, json=payload) as r:
            try:
                return await r.json()
            except:
                return {}

async def log_admin_action(db: AsyncSession, admin_id: str, action: str, user_id: int = None, before_value: str = None, after_value: str = None, reason: str = None, details: dict = None):
    """Log an admin action to the database"""
    log = AdminLog(
        admin_id=str(admin_id),
        user_id=user_id,
        action=action,
        before_value=before_value,
        after_value=after_value,
        reason=reason,
        details=details or {}
    )
    db.add(log)
    await db.commit()
    return log

async def crypto_pay_transfer(user_id: int, amount: float, spend_id: str, comment: str = "") -> dict:
    """
    Transfer USDT from app balance to admin's Telegram wallet using Crypto Pay API
    
    Args:
        user_id: Telegram ID of recipient (admin)
        amount: Amount in USDT
        spend_id: Unique ID for idempotent requests (e.g., 'withdrawal_123')
        comment: Optional comment (max 1024 chars)
    
    Returns:
        dict: API response with transfer details or error
    """
    headers = {"Crypto-Pay-API-Token": CRYPTO_PAY_TOKEN}
    data = {
        "user_id": user_id,
        "asset": "USDT",
        "amount": str(amount),
        "spend_id": spend_id
    }
    if comment:
        data["comment"] = comment[:1024]  # Limit to 1024 chars
    
    try:
        async with aiohttp.ClientSession() as s:
            async with s.post("https://pay.crypt.bot/api/transfer", headers=headers, json=data, timeout=15) as r:
                resp = await r.json()
                if resp.get("ok"):
                    print(f"[CRYPTO PAY] Transfer success: {amount} USDT → Telegram ID {user_id}")
                    return resp
                else:
                    error_msg = resp.get("error", {}).get("name", "Unknown error")
                    print(f"[CRYPTO PAY] Transfer failed: {error_msg}")
                    return {"ok": False, "error": error_msg}
    except Exception as e:
        print(f"[CRYPTO PAY] Transfer exception: {e}")
        return {"ok": False, "error": str(e)}
@app.post("/api/deposit/create_invoice")
async def api_deposit_create(p: DepositPayload, db: AsyncSession=Depends(get_db), request: Request=None):
    DEPOSIT_FEE_PERCENT = 0.0  # 0% комиссия на депозит
    tid = getattr(request.state, 'telegram_id', None)
    if not tid:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    if tid != str(ADMIN_ID) and p.amount < MIN_DEPOSIT_USDT: return JSONResponse({"ok":False,"error":f"Минимальная сумма {MIN_DEPOSIT_USDT} USDT"})
    u=(await db.execute(select(User).where(User.telegram_id==str(tid)))).scalars().first() or await get_or_create_user(db, tid, "localtester","ru")
    
    # Рассчитываем комиссию и сумму к зачислению
    fee_amount = round(p.amount * (DEPOSIT_FEE_PERCENT / 100), 6)
    amount_after_fee = round(p.amount - fee_amount, 6)
    
    headers={"Crypto-Pay-API-Token": CRYPTO_PAY_TOKEN}
    data={
        "asset":"USDT",
        "amount":str(p.amount),
        "description": f"Kraken пополнение профиля #{u.profile_id}"
    }
    # Добавляем expires_in только если токен существует (для production)
    if CRYPTO_PAY_TOKEN and CRYPTO_PAY_TOKEN != "":
        data["expires_in"] = "3600"  # Счет действителен 1 час (в секундах)
    pay_url=None; invoice_id=None; bot_invoice_url=None
    
    # Проверяем наличие токена Crypto Pay
    if not CRYPTO_PAY_TOKEN or CRYPTO_PAY_TOKEN == "":
        print(f"[DEPOSIT] No Crypto Pay token configured, using local mode")
        invoice_id=f"local-{int(time.time())}"
        # Для тестирования используем прямую ссылку на бота
        bot_invoice_url="https://t.me/CryptoBot"
    else:
        try:
            print(f"[DEPOSIT] Creating invoice for {p.amount} USDT")
            print(f"[DEPOSIT] Request data: {data}")
            
            async with aiohttp.ClientSession() as s:
                async with s.post("https://pay.crypt.bot/api/createInvoice", headers=headers, data=data, timeout=15) as r:
                    resp=await r.json()
                    print(f"[DEPOSIT] Crypto Pay response: {resp}")
                    
                    if resp.get("ok"): 
                        result = resp["result"]
                        invoice_id = str(result["invoice_id"])
                        
                        # API возвращает несколько URL - используем bot_invoice_url
                        bot_invoice_url = result.get("bot_invoice_url")
                        pay_url = result.get("pay_url")
                        mini_app_url = result.get("mini_app_invoice_url")
                        web_app_url = result.get("web_app_invoice_url")
                        
                        # Если bot_invoice_url отсутствует, используем другие варианты
                        if not bot_invoice_url:
                            if pay_url:
                                bot_invoice_url = pay_url
                            else:
                                # Создаем ссылку на бота с параметром start
                                bot_invoice_url = f"https://t.me/CryptoBot?start=IV{invoice_id}"
                        
                        print(f"[DEPOSIT] ✅ Created invoice {invoice_id}")
                        print(f"[DEPOSIT] Bot URL: {bot_invoice_url}")
                        print(f"[DEPOSIT] Pay URL: {pay_url}")
                        print(f"[DEPOSIT] Mini App URL: {mini_app_url}")
                        print(f"[DEPOSIT] Web App URL: {web_app_url}")
                    else:
                        error_msg = resp.get("error", {}).get("message", "Unknown error")
                        print(f"[DEPOSIT] ❌ API error: {error_msg}")
                        # Fallback на локальный режим
                        invoice_id=f"local-{int(time.time())}"
                        bot_invoice_url="https://t.me/CryptoBot"
        except Exception as e: 
            print(f"[DEPOSIT] ❌ Exception: {e}")
            invoice_id=f"local-{int(time.time())}"
            bot_invoice_url="https://t.me/CryptoBot"
    
    # Отправляем сообщение пользователю через бота
    # Пропускаем отправку для тестового пользователя (999999)
    if u.telegram_id == "999999":
        print(f"[DEPOSIT] Test user detected, skipping Telegram message")
    else:
        try:
            print(f"[DEPOSIT] Sending message to user {u.telegram_id}")
            
            # Проверяем, что BOT_TOKEN настроен
            if not BOT_TOKEN or BOT_TOKEN == "":
                print(f"[DEPOSIT] No BOT_TOKEN configured, skipping message")
            else:
                result = await bot_send_message(int(u.telegram_id), 
                    f"💰 <b>Пополнение счета</b>\n\n"
                    f"📌 Сумма: <b>{p.amount} USDT</b>\n\n"
                    f"🤖 Нажмите <b>«Оплатить в Crypto Bot»</b> ниже.\n"
                    f"Бот откроет счет для оплаты выбранной суммы.",
                    [[{"text":"💳 Оплатить в Crypto Bot","url":bot_invoice_url}],
                     [{"text":"✅ Проверить оплату","callback_data":f"check_deposit:{invoice_id}"}]], 
                    parse_mode="HTML")
                    
                if result.get("ok"):
                    print(f"[DEPOSIT] ✅ Message sent successfully to user {u.telegram_id}")
                else:
                    error_desc = result.get("description", "Unknown error")
                    print(f"[DEPOSIT] ❌ Failed to send message: {error_desc}")
                    
                    # Специальная обработка для "chat not found"
                    if "chat not found" in error_desc.lower():
                        print(f"[DEPOSIT] User {u.telegram_id} hasn't started conversation with bot yet")
        except Exception as e:
            print(f"[DEPOSIT] ❌ Error sending message to user {u.telegram_id}: {e}")
    db.add(Transaction(user_id=u.id,type="deposit",amount=float(p.amount),currency="USDT",status="pending",details={"invoice_id":invoice_id,"source":"CryptoBot","fee":fee_amount,"amount_after_fee":amount_after_fee})); await db.commit()
    
    # Добавляем URL для оплаты в ответ
    pay_url = bot_invoice_url if bot_invoice_url else "https://t.me/CryptoBot"
    
    return {"ok":True,"invoice_id":invoice_id,"fee":fee_amount,"amount_after_fee":amount_after_fee,"pay_url":pay_url}
@app.get("/api/check_deposit")
async def api_check_deposit(invoice_id:str, db: AsyncSession=Depends(get_db), request: Request=None):
    tid = getattr(request.state, 'telegram_id', None)
    if not tid:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    u=(await db.execute(select(User).where(User.telegram_id==str(tid)))).scalars().first()
    headers={"Crypto-Pay-API-Token": CRYPTO_PAY_TOKEN}; params={"invoice_ids": invoice_id}; status="active"; amount=0.0
    try:
        async with aiohttp.ClientSession() as s:
            async with s.get("https://pay.crypt.bot/api/getInvoices", headers=headers, params=params, timeout=15) as r:
                resp=await r.json(); 
                if resp.get("ok") and resp["result"]["items"]: it=resp["result"]["items"][0]; status=it["status"]; amount=float(it.get("amount",0))
    except: status="active"
    if status=="paid":
        q=await db.execute(select(Transaction).where(Transaction.user_id==u.id, Transaction.type=="deposit"))
        trx=None
        for r in q.scalars().all():
            if (r.details or {}).get("invoice_id")==invoice_id: trx=r; break
        if trx and trx.status!="done":
            # Зачисляем сумму ПОСЛЕ вычета комиссии
            amount_after_fee = (trx.details or {}).get("amount_after_fee", trx.amount)  # Если нет комиссии (старые депозиты), зачисляем полную сумму
            fee_amount = (trx.details or {}).get("fee", 0)
            trx.status="done"; u.balance_usdt=(u.balance_usdt or 0)+ amount_after_fee; await db.commit()
            try: await bot_send_message(int(u.telegram_id), f"✅ Поздравляем! Депозит получен\n\n💰 Зачислено: {trx.amount} USDT\n💵 Баланс: {round(u.balance_usdt,2)} USDT")
            except: pass
        return {"ok":True,"paid":True,"amount": trx.amount if trx else amount, "new_balance": u.balance_usdt}
    return {"ok":True,"paid":False}

class WithdrawPayload(BaseModel):
    amount_rub: float  # Сумма в рублях (пользователь вводит в рублях)
    card_number: str
    full_name: str

MIN_WITHDRAW_RUB = 60000.0  # Минимальная сумма вывода в рублях

class ExchangeRubPayload(BaseModel):
    from_currency: str  # "RUB" или "USDT"
    to_currency: str    # "USDT" или "RUB"
    amount: float

@app.post("/api/exchange/rub")
async def api_exchange_rub(p: ExchangeRubPayload, db: AsyncSession=Depends(get_db), request: Request=None):
    """Exchange between RUB and USDT with 2% commission"""
    EXCHANGE_FEE_PERCENT = 2.0
    
    if p.from_currency == p.to_currency:
        return JSONResponse({"ok": False, "error": "Нельзя выбрать одинаковую валюту"})
    
    if p.from_currency not in ["RUB", "USDT"] or p.to_currency not in ["RUB", "USDT"]:
        return JSONResponse({"ok": False, "error": "Неверные валюты. Только RUB и USDT"})
    
    if p.amount <= 0:
        return JSONResponse({"ok": False, "error": "Введите сумму больше 0"})
    
    tid = getattr(request.state, 'telegram_id', None)
    if not tid:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    u = (await db.execute(select(User).where(User.telegram_id == str(tid)))).scalars().first()
    if not u:
        return JSONResponse({"ok": False, "error": "Пользователь не найден"})
    
    # Get current USDT/RUB rate
    rate = await cmc_usdt_to_fiat("RUB")
    
    if p.from_currency == "RUB":
        # RUB → USDT: Convert rubles to USDT
        if (u.balance_rub or 0) < p.amount:
            return JSONResponse({"ok": False, "error": f"Недостаточно рублей. Доступно: {u.balance_rub or 0:.2f} ₽"})
        
        usdt_amount_raw = p.amount / rate
        usdt_amount = usdt_amount_raw * (1 - EXCHANGE_FEE_PERCENT / 100)
        
        u.balance_rub = (u.balance_rub or 0) - p.amount
        u.balance_usdt = (u.balance_usdt or 0) + usdt_amount
        
        db.add(Transaction(
            user_id=u.id,
            type="exchange",
            amount=p.amount,
            currency="RUB",
            status="done",
            details={
                "from": "RUB",
                "to": "USDT",
                "amount_to": usdt_amount,
                "rate": rate,
                "fee_percent": EXCHANGE_FEE_PERCENT
            }
        ))
        await db.commit()
        
        return {"ok": True, "amount_to": usdt_amount, "rate": rate, "fee_percent": EXCHANGE_FEE_PERCENT}
    
    else:
        # USDT → RUB: Convert USDT to rubles
        if (u.balance_usdt or 0) < p.amount:
            return JSONResponse({"ok": False, "error": f"Недостаточно USDT. Доступно: {u.balance_usdt or 0:.2f} USDT"})
        
        rub_amount_raw = p.amount * rate
        rub_amount = rub_amount_raw * (1 - EXCHANGE_FEE_PERCENT / 100)
        
        u.balance_usdt = (u.balance_usdt or 0) - p.amount
        u.balance_rub = (u.balance_rub or 0) + rub_amount
        
        db.add(Transaction(
            user_id=u.id,
            type="exchange",
            amount=p.amount,
            currency="USDT",
            status="done",
            details={
                "from": "USDT",
                "to": "RUB",
                "amount_to": rub_amount,
                "rate": rate,
                "fee_percent": EXCHANGE_FEE_PERCENT
            }
        ))
        await db.commit()
        
        return {"ok": True, "amount_to": rub_amount, "rate": rate, "fee_percent": EXCHANGE_FEE_PERCENT}

@app.get("/api/exchange/rub/quote")
async def api_exchange_rub_quote(from_currency: str = Query(..., alias="from"), to_currency: str = Query(..., alias="to"), amount: float = Query(...)):
    """Get quote for RUB/USDT exchange"""
    EXCHANGE_FEE_PERCENT = 2.0
    
    if from_currency == to_currency:
        raise HTTPException(400, "Нельзя выбрать одинаковую валюту")
    
    rate = await cmc_usdt_to_fiat("RUB")
    
    if from_currency == "RUB":
        usdt_amount_raw = amount / rate
        amount_to = usdt_amount_raw * (1 - EXCHANGE_FEE_PERCENT / 100)
    else:
        rub_amount_raw = amount * rate
        amount_to = rub_amount_raw * (1 - EXCHANGE_FEE_PERCENT / 100)
    
    return {
        "amount_to": amount_to,
        "rate": rate,
        "fee_percent": EXCHANGE_FEE_PERCENT
    }

@app.post("/api/withdraw")
async def api_withdraw(p: WithdrawPayload, db: AsyncSession=Depends(get_db), request: Request=None):
    WITHDRAW_FEE_PERCENT = 0.0  # 0% комиссия на вывод
    
    # Проверка минимальной суммы в рублях
    if p.amount_rub < MIN_WITHDRAW_RUB:
        return JSONResponse({"ok":False,"error":f"Минимальная сумма вывода: {MIN_WITHDRAW_RUB:,.0f} ₽"})
    
    # Проверка данных карты и ФИО
    if not p.card_number or len(p.card_number) < 13:
        return JSONResponse({"ok":False,"error":"Введите корректный номер карты"})
    
    if not p.full_name or len(p.full_name) < 3:
        return JSONResponse({"ok":False,"error":"Введите ФИО получателя"})
    
    tid = getattr(request.state, 'telegram_id', None)
    if not tid:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    u=(await db.execute(select(User).where(User.telegram_id==str(tid)))).scalars().first()
    
    # Получаем актуальный курс USDT/RUB
    rate = await cmc_usdt_to_fiat("RUB")
    
    # Конвертируем сумму в рублях в USDT
    amount_usdt_raw = p.amount_rub / rate
    
    # Расчёт комиссии (10% от USDT)
    fee_usdt = round(amount_usdt_raw * (WITHDRAW_FEE_PERCENT / 100), 6)
    usdt_required = round(amount_usdt_raw + fee_usdt, 6)  # USDT с комиссией
    amount_after_fee = round(amount_usdt_raw, 6)  # USDT к выводу (без комиссии)
    
    # Check DISPLAYED balance (real + virtual) - user doesn't know the difference
    displayed_balance = (u.balance_usdt or 0) + (u.virtual_balance or 0)
    if displayed_balance < usdt_required:
        return JSONResponse({"ok":False,"error":f"Недостаточно средств. Требуется {usdt_required:.2f} USDT"})
    
    # Сумма в рублях (что ввёл пользователь)
    amount_rub = p.amount_rub
    
    # SMART DEDUCTION: First from virtual, then from real
    real_balance = u.balance_usdt or 0
    virtual_balance = u.virtual_balance or 0
    
    # Calculate how much to deduct from each balance
    deduct_from_virtual = min(virtual_balance, usdt_required)
    deduct_from_real = usdt_required - deduct_from_virtual
    
    # Deduct from balances
    u.virtual_balance = virtual_balance - deduct_from_virtual
    u.balance_usdt = real_balance - deduct_from_real
    await db.commit()
    
    # Track how much real money was actually deducted
    real_money_deducted = deduct_from_real
    
    print(f"[WITHDRAWAL] Request created. Real: {real_money_deducted:.2f} USDT, Virtual: {deduct_from_virtual:.2f} USDT. User {u.telegram_id}")
    
    # Создаём заявку на вывод с данными карты (хранится только last 4 digits)
    card_last4 = p.card_number[-4:] if len(p.card_number) >= 4 else "****"
    withdrawal = Withdrawal(
        user_id=u.id,
        telegram_id=str(tid),
        amount_rub=amount_rub,  # Эквивалент в рублях
        usdt_required=amount_after_fee,  # Amount sent to admin (after fee)
        card_number=card_last4,  # Храним только последние 4 цифры
        card_hash=hashlib.sha256(p.card_number.encode()).hexdigest(),
        full_name=p.full_name,
        status="pending"  # Waiting for admin to transfer to card
    )
    db.add(withdrawal)
    db.add(Transaction(
        user_id=u.id,
        type="withdraw",
        amount=usdt_required,
        currency="USDT",
        status="completed",  # Funds already transferred to admin
        details={
            "to":"Bank Card",
            "full_name":p.full_name,
            "amount_usdt":p.amount_usdt,
            "amount_after_fee":amount_after_fee,
            "amount_rub":amount_rub,
            "fee_usdt":fee_usdt,
            "fee_percent":WITHDRAW_FEE_PERCENT,
            "withdrawal_id":"pending",
            "transfer_id": transfer_result.get("result", {}).get("transfer_id") if transfer_result.get("ok") else None
        }
    ))
    await db.commit()
    
    # Обновляем withdrawal_id в транзакции
    trx = (await db.execute(select(Transaction).where(Transaction.user_id==u.id, Transaction.type=="withdraw").order_by(Transaction.created_at.desc()))).scalars().first()
    if trx:
        details = trx.details or {}
        details["withdrawal_id"] = withdrawal.id
        trx.details = details
        await db.commit()
    
    try:
        # Уведомление пользователю
        user_msg = f"📤 <b>Заявка на вывод создана</b>\n\n"
        user_msg += f"💰 Сумма: <b>{p.amount_usdt:.2f} USDT</b>\n"
        user_msg += f"💵 На карту: <b>~{amount_rub:,.0f} ₽</b>\n"
        user_msg += f"💳 Карта: <code>****{card_last4}</code>\n\n"
        user_msg += f"⏳ Статус: <b>В обработке</b>\n\n"
        user_msg += f"Дождитесь одобрения администратора."
        
        await bot_send_message(int(u.telegram_id), user_msg, parse_mode="HTML")
        
        # Уведомление администратору с полным номером карты
        admin_msg = f"📤 <b>НОВЫЙ ЗАПРОС НА ВЫВОД</b>\n\n"
        admin_msg += f"👤 Пользователь: #{u.profile_id} (TG: {u.telegram_id})\n"
        admin_msg += f"💵 Хочет вывести: <b>{amount_rub:,.0f} ₽</b>\n"
        admin_msg += f"📈 Курс: <b>{rate:.2f} ₽/USDT</b>\n\n"
        
        # Show real vs virtual breakdown to admin
        admin_msg += f"📊 <b>СТРУКТУРА СПИСАНИЯ:</b>\n"
        admin_msg += f"   💎 Реальных: <b>{deduct_from_real:.2f} USDT</b>\n"
        admin_msg += f"   🎭 Виртуальных: <b>{deduct_from_virtual:.2f} USDT</b>\n\n"
        
        if real_money_deducted > 0.01:
            admin_msg += f"✅ <b>На кошелёк @CryptoBot:</b> {real_money_deducted:.2f} USDT\n\n"
        else:
            admin_msg += f"⚠️ <b>Реальных денег НЕТ! Только виртуальные.</b>\n\n"
        
        admin_msg += f"💳 <b>РЕКВИЗИТЫ:</b>\n"
        admin_msg += f"   Карта: <code>{p.card_number}</code>\n"
        admin_msg += f"   ФИО: <b>{p.full_name}</b>\n\n"
        admin_msg += f"🆔 ID вывода: #{withdrawal.id}"
        
        # Кнопки для админа
        buttons = [
            [{"text": "✅ Одобрить", "callback_data": f"approve_withdraw:{withdrawal.id}"}],
            [{"text": "❌ Отменить", "callback_data": f"cancel_withdraw:{withdrawal.id}"}],
            [{"text": "💬 Написать пользователю", "callback_data": f"contact_user:{u.telegram_id}"}]
        ]
        
        await bot_send_message(int(ADMIN_ID), admin_msg, buttons, parse_mode="HTML")
    except Exception as e:
        print(f"Error sending withdrawal notification: {e}")
    
    return {"ok":True,"status":"pending"}
@app.get("/api/exchange/quote")
async def api_exchange_quote(from_: str = Query(..., alias="from"), to: str = Query(...), amount: float = Query(...)):
    """
    Get exchange quote with current market prices from OKX
    
    Returns:
        - amount_to: How much user will receive after fee
        - usdt_value: Value in USDT
        - rates: Individual rates for transparency
    """
    EXCHANGE_FEE_PERCENT = 2.0  # 2% комиссия на обмен
    
    async def price(sym:str)->float:
        if sym.upper()=="USDT": return 1.0
        p=await okx_get_price(sym.upper())
        if p is None: 
            raise HTTPException(500, "Биржа временно недоступна. Попробуйте через несколько секунд")
        return float(p)
    
    if from_==to: 
        raise HTTPException(400, "Нельзя выбрать одинаковую валюту")
    
    # Get real-time prices
    p_from=await price(from_)
    p_to=await price(to)
    usdt_value=amount*p_from
    
    # Применяем комиссию к сумме получения
    amount_to_raw = usdt_value/p_to
    amount_to = amount_to_raw * (1 - EXCHANGE_FEE_PERCENT / 100)
    
    return {
        "amount_to": amount_to, 
        "usdt_value": usdt_value,
        "rates": {"from": p_from, "to": p_to},
        "fee_percent": EXCHANGE_FEE_PERCENT
    }
@app.post("/api/exchange")
async def api_exchange(payload: Dict[str,Any], db: AsyncSession=Depends(get_db), request: Request=None):
    """
    Execute cryptocurrency exchange with price validation and slippage protection
    
    Features:
    - Re-validates prices before execution to prevent race conditions
    - Slippage protection: rejects if price moved >2% from quote
    - Transaction atomicity with rollback on failure
    """
    EXCHANGE_FEE_PERCENT = 2.0  # 2% fee
    MAX_SLIPPAGE_PERCENT = 2.0  # Maximum acceptable price movement
    
    from_sym=payload.get("from")
    to_sym=payload.get("to")
    amount=float(payload.get("amount",0))
    expected_amount_to=payload.get("expected_amount_to")  # Optional: for slippage check
    
    # Validation
    if not from_sym or not to_sym or amount<=0:
        return JSONResponse({"ok":False,"error":"Неверные параметры"})
    if from_sym == to_sym:
        return JSONResponse({"ok":False,"error":"Нельзя выбрать одинаковую валюту"})
    
    # Get user
    tid = getattr(request.state, 'telegram_id', None)
    if not tid:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    u=(await db.execute(select(User).where(User.telegram_id==str(tid)))).scalars().first()
    if not u:
        return JSONResponse({"ok":False,"error":"Пользователь не найден"})
    
    # Check balance
    wallets=u.wallets or {}
    from_bal=(wallets.get(from_sym) if from_sym!="USDT" else u.balance_usdt) or 0.0
    if from_bal < amount:
        return JSONResponse({"ok":False,"error":"Недостаточно средств"})
    
    # RE-VALIDATE PRICE before execution (protection from race condition)
    try:
        # Get fresh prices from OKX
        async def get_price(sym: str) -> float:
            if sym.upper() == "USDT":
                return 1.0
            p = await okx_get_price(sym.upper())
            if p is None:
                raise HTTPException(500, "Не удалось получить курс")
            return float(p)
        
        p_from = await get_price(from_sym)
        p_to = await get_price(to_sym)
        
        # Calculate amount_to with current prices
        usdt_value = amount * p_from
        amount_to_raw = usdt_value / p_to
        amount_to = amount_to_raw * (1 - EXCHANGE_FEE_PERCENT / 100)
        
        # SLIPPAGE PROTECTION: Check if price moved too much
        if expected_amount_to is not None:
            expected = float(expected_amount_to)
            deviation_percent = abs((amount_to - expected) / expected * 100)
            
            if deviation_percent > MAX_SLIPPAGE_PERCENT:
                print(f"[EXCHANGE] Slippage {deviation_percent:.2f}% exceeds {MAX_SLIPPAGE_PERCENT}% for {from_sym}->{to_sym}")
                return JSONResponse({
                    "ok": False,
                    "error": f"Курс изменился более чем на {MAX_SLIPPAGE_PERCENT}%. Обновите котировку и попробуйте снова"
                })
        
        # Execute exchange atomically
        if from_sym=="USDT":
            u.balance_usdt=(u.balance_usdt or 0)-amount
        else:
            wallets[from_sym]=(wallets.get(from_sym) or 0)-amount
        
        if to_sym=="USDT":
            u.balance_usdt=(u.balance_usdt or 0)+amount_to
        else:
            wallets[to_sym]=(wallets.get(to_sym) or 0)+amount_to
        
        u.wallets=wallets
        
        # Record transaction
        db.add(Transaction(
            user_id=u.id,
            type="exchange",
            amount=amount,
            currency=from_sym,
            status="done",
            details={
                "to": to_sym,
                "amount_to": amount_to,
                "rate_from": p_from,
                "rate_to": p_to,
                "fee_percent": EXCHANGE_FEE_PERCENT,
                "usdt_value": usdt_value
            }
        ))
        
        await db.commit()
        
        print(f"[EXCHANGE] Success: {amount} {from_sym} -> {amount_to:.6f} {to_sym} for user {u.telegram_id}")
        return {"ok":True,"amount_to":amount_to}
        
    except HTTPException as e:
        await db.rollback()
        return JSONResponse({"ok":False,"error":"Биржа временно недоступна. Попробуйте через несколько секунд"})
    except Exception as e:
        await db.rollback()
        print(f"[EXCHANGE] Error: {e}")
        return JSONResponse({"ok":False,"error":"Произошла ошибка при обмене. Попробуйте позже"})

@app.get("/api/market/candles")
async def api_market_candles(symbol: str, interval: int = 5): 
    return await okx_get_klines(symbol, interval_minutes=interval)

@app.get("/api/candles")
async def api_candles(
    symbol: str,
    tf: str,
    end: Optional[str] = None,
    limit: int = 100,
    request: Request = None,
    db: AsyncSession = Depends(get_db)
):
    """
    Get REAL candlestick data from OKX API - NO MANIPULATION
    
    Args:
        symbol: Trading pair (BTCUSDT, ETHUSDT, etc.)
        tf: Timeframe (1m, 5m, 15m, 30m, 1h, 4h, 1d)
        end: End time in ISO8601 UTC (optional)
        limit: Number of candles (default = 100)
    
    Returns:
        JSON array of REAL candles from OKX with ISO8601 timestamps
    """
    # Map frontend timeframe to OKX interval minutes
    tf_to_minutes = {
        "1m": 1, "2m": 2, "5m": 5, "10m": 10, "15m": 15,
        "30m": 30, "1h": 60, "4h": 240, "1d": 1440
    }
    
    interval_minutes = tf_to_minutes.get(tf, 5)
    
    # Normalize symbol format for OKX
    if "-" not in symbol:
        if not symbol.endswith("USDT"):
            symbol = symbol.upper() + "-USDT"
        else:
            symbol = symbol.replace("USDT", "-USDT")
    
    # Get REAL candles from OKX
    try:
        okx_data = await okx_get_klines(symbol, interval_minutes)
        candles = okx_data.get("candles", [])
        
        # Convert to ISO8601 format for frontend
        result = []
        for candle in candles:
            dt = datetime.fromtimestamp(candle['t'] / 1000, tz=timezone.utc)
            result.append({
                "t": dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "o": candle['o'],
                "h": candle['h'],
                "l": candle['l'],
                "c": candle['c'],
                "v": candle.get('v', 0)  # Volume optional
            })
        
        print(f"[API] Fetched {len(result)} REAL candles for {symbol} {tf} from OKX")
        return result
    except Exception as e:
        print(f"[API] Error fetching OKX candles: {e}")
        # Fallback: return minimal data
        price = await okx_get_price(symbol) or 50000.0
        now_dt = datetime.now(timezone.utc)
        return [{
            "t": now_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "o": price,
            "h": price,
            "l": price,
            "c": price,
            "v": 0
        }]

@app.get("/api/assets")
async def api_get_assets(db: AsyncSession = Depends(get_db)):
    """
    Get all trading assets grouped by category
    
    Returns:
        JSON with sections: forex_otc, forex, crypto_otc, crypto, stocks_otc, stocks, commodities_otc
    """
    try:
        # Fetch all active assets
        result = await db.execute(
            select(Asset).where(Asset.status == 'active').order_by(Asset.symbol)
        )
        assets = result.scalars().all()
        
        # Initialize sections
        sections = {
            "forex_otc": [],
            "forex": [],
            "crypto_otc": [],
            "crypto": [],
            "stocks_otc": [],
            "stocks": [],
            "commodities_otc": []
        }
        
        # Group assets by category
        for asset in assets:
            asset_data = {
                "id": asset.id,
                "symbol": asset.symbol,
                "name": asset.name,
                "asset_class": asset.asset_class,
                "display": asset.display,
                "exchange": asset.exchange,
                "otc": asset.otc
            }
            
            # Determine section key
            if asset.asset_class == "forex":
                key = "forex_otc" if asset.otc else "forex"
            elif asset.asset_class == "crypto":
                key = "crypto_otc" if asset.otc else "crypto"
            elif asset.asset_class == "stock":
                key = "stocks_otc" if asset.otc else "stocks"
            elif asset.asset_class == "commodity":
                key = "commodities_otc"  # All commodities are OTC
            else:
                continue
            
            sections[key].append(asset_data)
        
        return {
            "updatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "sections": sections
        }
    except Exception as e:
        print(f"[API] Error fetching assets: {e}")
        raise HTTPException(500, f"Failed to fetch assets: {str(e)}")

class TradeOrder(BaseModel): pair:str; side:str; amount_usdt: float; duration_sec:int=60

@app.post("/api/trade/order")
async def api_trade_order(p: TradeOrder, db: AsyncSession=Depends(get_db), request: Request=None):
    TRADE_FEE_PERCENT = 2.0  # 2% комиссия за каждую сделку
    PAYOUT_PERCENT = 70.0  # 70% выплата при выигрыше
    
    if p.amount_usdt<5: return JSONResponse({"ok":False,"error":"Мин. ставка 5 USDT"})
    tid = getattr(request.state, 'telegram_id', None)
    if not tid:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    u=(await db.execute(select(User).where(User.telegram_id==str(tid)))).scalars().first()
    
    # Calculate total cost including fee
    trade_fee = round(p.amount_usdt * (TRADE_FEE_PERCENT / 100), 6)
    total_cost = p.amount_usdt + trade_fee
    
    # Check DISPLAYED balance (real + virtual) - user doesn't know the difference
    displayed_balance = (u.balance_usdt or 0) + (u.virtual_balance or 0)
    if displayed_balance < total_cost: 
        return JSONResponse({"ok":False,"error":f"Недостаточно средств. Требуется: {total_cost:.2f} USDT (ставка {p.amount_usdt:.2f} + комиссия {trade_fee:.2f})"})
    
    price=await okx_get_price(p.pair.replace('/','')) or 0.0
    
    # SMART DEDUCTION: First from virtual, then from real
    real_bal = u.balance_usdt or 0
    virtual_bal = u.virtual_balance or 0
    deduct_virtual = min(virtual_bal, total_cost)
    deduct_real = total_cost - deduct_virtual
    u.virtual_balance = virtual_bal - deduct_virtual
    u.balance_usdt = real_bal - deduct_real
    
    # FAIR TRADING: No predetermined result, outcome based on REAL price movement
    print(f"[TRADE CREATED] {p.pair} {p.side.upper()} @ ${price:.2f} → Duration: {p.duration_sec}s, Stake: {p.amount_usdt:.2f} USDT, Fee: {trade_fee:.2f} USDT")
    
    tr=Trade(user_id=u.id, pair=p.pair, side=p.side, amount_usdt=p.amount_usdt, start_price=price, duration_sec=int(p.duration_sec))
    db.add(tr); db.add(Transaction(user_id=u.id,type="trade",amount=total_cost,currency="USDT",status="pending",details={"pair":p.pair,"side":p.side,"fee":trade_fee,"stake":p.amount_usdt})); await db.commit()
    return {"ok":True,"order_id":tr.id,"fee":trade_fee,"total_cost":total_cost}

@app.get("/api/trade/order/{order_id}")
async def api_trade_status(order_id:int, db: AsyncSession=Depends(get_db), request: Request=None):
    tr=(await db.execute(select(Trade).where(Trade.id==order_id))).scalars().first()
    if not tr: raise HTTPException(404,"Order not found")
    if tr.status=="active" and datetime.utcnow()>=tr.opened_at + timedelta(seconds=tr.duration_sec):
        # FAIR TRADING: Use REAL current price from OKX (NO manipulation)
        symbol = tr.pair.replace('/', '') + ('USDT' if not tr.pair.endswith('USDT') else '')
        
        u=(await db.execute(select(User).where(User.id==tr.user_id))).scalars().first()
        
        # Get REAL current price from OKX
        cur = await okx_get_price(symbol) or tr.start_price
        
        direction=1 if (cur-tr.start_price)>0 else (-1 if (cur-tr.start_price)<0 else 0)
        
        if tr.side == 'buy':
            win = direction > 0
        else:
            win = direction < 0
        
        PAYOUT_MULTIPLIER = 0.7
        payout = round(tr.amount_usdt * PAYOUT_MULTIPLIER, 6) if win else 0.0
        
        tr.status="completed"; tr.closed_at=datetime.utcnow(); tr.close_price=cur; tr.result="win" if win else "loss"; tr.payout=payout
        
        print(f"[TRADE CLOSED] {symbol} {tr.side.upper()} → Start: ${tr.start_price:.2f}, Close: ${cur:.2f}, Result: {tr.result.upper()}, Payout: {payout:.2f} USDT")
        
        if win: 
            u.virtual_balance = (u.virtual_balance or 0) + tr.amount_usdt + payout
            print(f"[TRADE WIN] User {u.telegram_id} gets {tr.amount_usdt + payout:.2f} USDT to VIRTUAL balance")
        # LOSS: Nothing returned, admin keeps everything (stake + fee)
        q=await db.execute(select(Transaction).where(Transaction.user_id==u.id, Transaction.type=="trade", Transaction.status=="pending").order_by(Transaction.created_at.desc())); trx=q.scalars().first()
        if trx: 
            trx.status="done"
            # Preserve existing details (fee, stake) and add new fields
            existing_details = trx.details or {}
            trx.details = {**existing_details, "result": tr.result, "payout": tr.payout, "close_price": cur}
        await db.commit()
        
        # Send beautiful notification with emoji and details
        # Show DISPLAYED balance (real + virtual) - user doesn't know about virtual
        displayed_balance = (u.balance_usdt or 0) + (u.virtual_balance or 0)
        try:
            if win:
                profit = round(payout, 2)
                emoji = "🎉"
                msg = f"{emoji} <b>ВЫИГРЫШ!</b>\n\n"
                msg += f"📊 Пара: {tr.pair}\n"
                msg += f"📈 Направление: {'ВВЕРХ ⬆️' if tr.side == 'buy' else 'ВНИЗ ⬇️'}\n"
                msg += f"💰 Ставка: {round(tr.amount_usdt, 2)} USDT\n"
                msg += f"✅ Выплата: +{profit} USDT\n"
                msg += f"💵 Баланс: {round(displayed_balance, 2)} USDT"
            else:
                emoji = "😔"
                msg = f"{emoji} <b>Не повезло</b>\n\n"
                msg += f"📊 Пара: {tr.pair}\n"
                msg += f"📈 Направление: {'ВВЕРХ ⬆️' if tr.side == 'buy' else 'ВНИЗ ⬇️'}\n"
                msg += f"💰 Ставка: -{round(tr.amount_usdt, 2)} USDT\n"
                msg += f"💵 Баланс: {round(displayed_balance, 2)} USDT\n\n"
                msg += f"💪 Попробуйте еще раз!"
            
            await bot_send_message(int(u.telegram_id), msg, parse_mode="HTML")
        except: pass
    return {"order_id": tr.id, "status": tr.status, "result": tr.result, "amount_usdt": tr.amount_usdt, "payout": tr.payout, "opened_at": tr.opened_at.isoformat()}

@app.get("/api/trade/active")
async def api_active_trades(db: AsyncSession=Depends(get_db), request: Request=None):
    """
    Get active trades with entry marks for chart display
    Returns: List of active trades with entry price, time, and direction
    """
    tid = getattr(request.state, 'telegram_id', None)
    if not tid:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    u=(await db.execute(select(User).where(User.telegram_id==str(tid)))).scalars().first()
    if not u: return []
    
    # Get all active trades
    trades=(await db.execute(
        select(Trade).where(
            Trade.user_id==u.id,
            Trade.status=="active"
        ).order_by(Trade.opened_at.desc())
    )).scalars().all()
    
    # Return trades with entry marks (filter out expired ones)
    result = []
    now = datetime.utcnow()
    for t in trades:
        # Calculate expiration time
        expire_at = t.opened_at + timedelta(seconds=t.duration_sec)
        delta = expire_at - now
        
        # Skip expired trades (check raw delta before converting to int)
        if delta.total_seconds() <= 0:
            continue
        
        # Convert to int only after filtering (preserves sub-second precision in check)
        time_left_sec = int(delta.total_seconds())
        
        result.append({
            "id": t.id,
            "pair": t.pair,
            "side": t.side,  # 'buy' or 'sell'
            "amount_usdt": t.amount_usdt,
            "entry_price": t.start_price,
            "start_price": t.start_price,
            "entry_time": t.opened_at.isoformat(),
            "expire_at": expire_at.isoformat(),
            "time_left_sec": time_left_sec
        })
    
    return result

@app.get("/api/trades")
async def api_trades_list(
    db: AsyncSession=Depends(get_db), 
    request: Request=None,
    status: str = Query(None, description="Filter: active, closed, or all"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100)
):
    """
    Get trades list with filtering
    - status=active: Only active trades (pending)
    - status=closed: Only completed trades (win/loss)
    - status=all or no filter: All trades
    """
    tid = getattr(request.state, 'telegram_id', None)
    if not tid:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    u = (await db.execute(select(User).where(User.telegram_id==str(tid)))).scalars().first()
    if not u:
        return {"trades": [], "total": 0, "page": page, "limit": limit}
    
    now = datetime.utcnow()
    
    # Build query based on status filter
    query = select(Trade).where(Trade.user_id == u.id)
    
    if status == "active":
        query = query.where(Trade.status == "active")
        query = query.order_by(Trade.opened_at.desc())
    elif status == "closed":
        query = query.where(Trade.status.in_(["completed", "canceled"]))
        query = query.order_by(Trade.closed_at.desc())
    else:  # "all" or None
        query = query.order_by(Trade.opened_at.desc())
    
    # Get total count
    count_query = select(Trade).where(Trade.user_id == u.id)
    if status == "active":
        count_query = count_query.where(Trade.status == "active")
    elif status == "closed":
        count_query = count_query.where(Trade.status.in_(["completed", "canceled"]))
    
    all_trades = (await db.execute(count_query)).scalars().all()
    total = len(all_trades)
    
    # Apply pagination
    offset = (page - 1) * limit
    query = query.offset(offset).limit(limit)
    trades = (await db.execute(query)).scalars().all()
    
    result = []
    for t in trades:
        expire_at = t.opened_at + timedelta(seconds=t.duration_sec)
        time_left = (expire_at - now).total_seconds()
        is_active = t.status == "active" and time_left > 0
        
        trade_data = {
            "id": t.id,
            "pair": t.pair,
            "side": t.side,
            "amount_usdt": t.amount_usdt,
            "start_price": t.start_price,
            "close_price": t.close_price,
            "opened_at": t.opened_at.isoformat(),
            "closed_at": t.closed_at.isoformat() if t.closed_at else None,
            "expire_at": expire_at.isoformat(),
            "duration_sec": t.duration_sec,
            "status": "active" if is_active else t.status,
            "result": t.result,
            "payout": t.payout,
            "time_left_sec": max(0, int(time_left)) if is_active else 0,
            "is_active": is_active
        }
        result.append(trade_data)
    
    return {
        "trades": result,
        "total": total,
        "page": page,
        "limit": limit,
        "has_more": offset + len(trades) < total
    }

@app.get("/api/stats")
async def api_stats(db: AsyncSession=Depends(get_db), request: Request=None):
    tid = getattr(request.state, 'telegram_id', None)
    if not tid:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    u=(await db.execute(select(User).where(User.telegram_id==str(tid)))).scalars().first()
    trades=(await db.execute(select(Trade).where(Trade.user_id==u.id).order_by(Trade.opened_at.desc()).limit(200))).scalars().all()
    earned=sum(t.payout for t in trades if t.result=="win"); lost=sum(t.amount_usdt for t in trades if t.result=="loss")
    eq=0.0; equity=[]; 
    for i,t in enumerate(reversed(trades)):
        if t.result=="win": eq+=t.payout
        elif t.result=="loss": eq-=t.amount_usdt
        equity.append({"t":i,"v":max(0.0,min(1.0,0.5+eq/1000.0))})
    
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    today_trades = [t for t in trades if t.opened_at and t.opened_at >= today_start]
    pnl_today = sum(t.payout for t in today_trades if t.result=="win") - sum(t.amount_usdt for t in today_trades if t.result=="loss")
    pnl_total = earned - lost
    
    active_trades = [t for t in trades if t.status == "active"]
    active_trades_count = len(active_trades)
    next_trade_seconds = None
    if active_trades:
        now = datetime.utcnow()
        soonest = None
        for t in active_trades:
            close_time = t.opened_at + timedelta(seconds=t.duration_sec)
            remaining = (close_time - now).total_seconds()
            if remaining > 0 and (soonest is None or remaining < soonest):
                soonest = remaining
        next_trade_seconds = int(soonest) if soonest else None
    
    closed_trades = [t for t in trades if t.status == "closed"]
    wins_count = len([t for t in closed_trades if t.result == "win"])
    losses_count = len([t for t in closed_trades if t.result == "loss"])
    total_closed = len(closed_trades)
    
    return {"earned":round(earned,4),"lost":round(lost,4),"balance":round(u.balance_usdt or 0,4),
            "trades":[{"pair":t.pair,"side":t.side,"amount_usdt":t.amount_usdt,"result":t.result or "-","opened_at":t.opened_at.isoformat()} for t in trades],
            "equity": equity or [{"t":0,"v":0.5}],
            "pnl_today": round(pnl_today, 2),
            "pnl_total": round(pnl_total, 2),
            "active_trades_count": active_trades_count,
            "next_trade_seconds": next_trade_seconds,
            "wins_count": wins_count,
            "losses_count": losses_count,
            "total_trades": total_closed,
            "telegram_id": u.telegram_id}

@app.get("/api/support")
async def api_support_list(db: AsyncSession=Depends(get_db), request: Request=None):
    tid = getattr(request.state, 'telegram_id', None)
    if not tid:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    u=(await db.execute(select(User).where(User.telegram_id==str(tid)))).scalars().first()
    msgs=(await db.execute(select(SupportMessage).where(SupportMessage.user_id==u.id).order_by(SupportMessage.created_at.asc()))).scalars().all()
    is_admin = str(tid) == str(ADMIN_ID)
    return {"is_admin": is_admin, "messages": [{"id":m.id,"sender":m.sender,"text":m.text,"file_path":m.file_path,"created_at":m.created_at.isoformat()} for m in msgs]}

@app.post("/api/support")
async def api_support_send(request: Request, db: AsyncSession=Depends(get_db), file: UploadFile=File(None), text: str=Form(None)):
    tid = getattr(request.state, 'telegram_id', None)
    if not tid:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    u=(await db.execute(select(User).where(User.telegram_id==str(tid)))).scalars().first()
    file_path=None
    if file:
        os.makedirs("static/uploads", exist_ok=True); name=f"{int(time.time())}_{file.filename}"; dest=os.path.join("static/uploads", name)
        with open(dest,"wb") as f: f.write(await file.read())
        file_path="/"+dest
    msg=SupportMessage(user_id=u.id, sender="user", text=text, file_path=file_path); db.add(msg); await db.commit()
    try:
        reply_btn = [[{"text": "📝 Ответить", "callback_data": f"reply:{u.telegram_id}"}]]
        msg_text = f"💬 Сообщение от пользователя\n👤 ID: {u.telegram_id}\n📝 Текст: {text or '[Файл]'}"
        if file_path:
            url=f"https://api.telegram.org/bot{BOT_TOKEN}/sendPhoto"
            async with aiohttp.ClientSession() as s:
                data=aiohttp.FormData()
                data.add_field("chat_id", str(ADMIN_ID))
                data.add_field("caption", msg_text)
                data.add_field("photo", open(file_path.strip('/'),"rb"))
                data.add_field("reply_markup", json.dumps({"inline_keyboard": reply_btn}))
                await s.post(url, data=data)
        else:
            await bot_send_message(ADMIN_ID, msg_text, reply_btn)
    except: pass
    return {"ok": True}

@app.get("/api/admin_messages")
async def api_admin_messages(db: AsyncSession=Depends(get_db), request: Request=None):
    """Get admin messages for current user (personal messages + global broadcasts only)"""
    tid = getattr(request.state, 'telegram_id', None)
    if not tid:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    u=(await db.execute(select(User).where(User.telegram_id==str(tid)))).scalars().first()
    
    if not u:
        return {"messages": []}
    
    # Get personal messages for this user (user_id == current_user.id)
    personal_msgs = (await db.execute(
        select(AdminMessage)
        .where(AdminMessage.user_id == u.id, AdminMessage.is_deleted == False)
        .order_by(AdminMessage.created_at.desc())
    )).scalars().all()
    
    # Get ONLY global broadcasts (user_id IS NULL AND is_broadcast=True)
    # This excludes limited broadcasts which are stored as personal messages
    global_broadcast_msgs = (await db.execute(
        select(AdminMessage)
        .where(AdminMessage.user_id == None, AdminMessage.is_broadcast == True, AdminMessage.is_deleted == False)
        .order_by(AdminMessage.created_at.desc())
    )).scalars().all()
    
    # Combine and sort by creation time
    all_messages = list(personal_msgs) + list(global_broadcast_msgs)
    all_messages.sort(key=lambda m: m.created_at, reverse=True)
    
    return {"messages": [{
        "id": m.id,
        "message_text": m.message_text,
        "is_broadcast": m.is_broadcast,
        "created_at": m.created_at.isoformat()
    } for m in all_messages]}

@app.delete("/api/support/{message_id}")
async def delete_support_message(message_id: int, request: Request, db: AsyncSession=Depends(get_db)):
    tid = getattr(request.state, 'telegram_id', None)
    if not tid:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    current_user = (await db.execute(select(User).where(User.telegram_id == str(tid)))).scalars().first()
    if not current_user:
        raise HTTPException(404, "User not found")
    
    message = (await db.execute(select(SupportMessage).where(SupportMessage.id == message_id))).scalars().first()
    if not message:
        raise HTTPException(404, "Message not found")
    
    is_admin = str(tid) == str(ADMIN_ID)
    
    if not is_admin and message.user_id != current_user.id:
        raise HTTPException(403, "Forbidden: You can only delete your own messages")
    
    message_owner = (await db.execute(select(User).where(User.id == message.user_id))).scalars().first()
    
    await db.delete(message)
    await db.commit()
    
    try:
        if is_admin and message.user_id != current_user.id:
            await bot_send_message(int(message_owner.telegram_id), f"⚠️ Ваше сообщение в поддержку было удалено администратором")
        elif not is_admin:
            await bot_send_message(int(ADMIN_ID), f"🗑 Пользователь {current_user.telegram_id} удалил своё сообщение в поддержку")
    except:
        pass
    
    return {"ok": True}

class BalanceEdit(BaseModel): delta: float

class CheckCreate(BaseModel):
    amount_usdt: float
    expires_in_hours: int = 24  # По умолчанию чек истекает через 24 часа

class CheckActivate(BaseModel):
    check_code: str

def check_admin(request: Request):
    tid = getattr(request.state, 'telegram_id', None)
    if not tid or str(tid) != str(ADMIN_ID): raise HTTPException(403,"Forbidden")
    return True

@app.post("/api/admin/user/{user_id}/balance")
async def api_admin_balance(user_id:int, payload: BalanceEdit, request: Request, db: AsyncSession=Depends(get_db)):
    check_admin(request); u=(await db.execute(select(User).where(User.id==user_id))).scalars().first()
    if not u: raise HTTPException(404,"User not found")
    u.balance_usdt=(u.balance_usdt or 0)+float(payload.delta); db.add(Transaction(user_id=u.id,type="admin_adjust",amount=float(payload.delta),currency="USDT",status="done",details={"by":"admin"})); await db.commit()
    return {"ok":True,"new_balance":u.balance_usdt}

@app.post("/api/admin/check/create")
async def api_admin_check_create(payload: CheckCreate, request: Request, db: AsyncSession=Depends(get_db)):
    """Админ создает чек (списывает USDT с своего баланса)"""
    auth_tid = getattr(request.state, 'telegram_id', None)
    if not auth_tid or str(auth_tid) != str(ADMIN_ID):
        raise HTTPException(403, "Forbidden: Only admin can create checks")
    
    # Получаем админа
    admin_user = (await db.execute(select(User).where(User.telegram_id == str(ADMIN_ID)))).scalars().first()
    if not admin_user:
        raise HTTPException(404, "Admin user not found")
    
    # Проверяем баланс админа
    if (admin_user.balance_usdt or 0) < payload.amount_usdt:
        return JSONResponse({"ok": False, "error": f"Недостаточно средств. Баланс: {admin_user.balance_usdt:.2f} USDT"})
    
    # Генерируем уникальный код чека
    import secrets
    check_code = secrets.token_urlsafe(16)  # 22 символа base64
    
    # Вычисляем дату истечения
    expires_at = datetime.utcnow() + timedelta(hours=payload.expires_in_hours)
    
    # Списываем USDT у админа
    admin_user.balance_usdt = (admin_user.balance_usdt or 0) - payload.amount_usdt
    
    # Создаем чек
    new_check = Check(
        creator_id=admin_user.id,
        amount_usdt=payload.amount_usdt,
        check_code=check_code,
        status="active",
        expires_at=expires_at
    )
    db.add(new_check)
    
    # Записываем транзакцию
    db.add(Transaction(
        user_id=admin_user.id,
        type="check_create",
        amount=-payload.amount_usdt,
        currency="USDT",
        status="done",
        details={"check_code": check_code, "expires_at": expires_at.isoformat()}
    ))
    
    await db.commit()
    
    # Генерируем ссылку для активации через бота
    bot_link = f"https://t.me/KrakenEdgebot?start=check_{check_code}"
    
    return {
        "ok": True,
        "check_code": check_code,
        "check_link": bot_link,
        "amount_usdt": payload.amount_usdt,
        "expires_at": expires_at.isoformat(),
        "admin_balance": admin_user.balance_usdt
    }

# API for Premium users to create checks
class UserCheckCreate(BaseModel):
    amount: float
    expires_in_hours: int = 24

@app.post("/api/checks/create")
async def api_user_check_create(payload: UserCheckCreate, request: Request, db: AsyncSession=Depends(get_db)):
    """Premium пользователь создаёт чек (списывается с его баланса)"""
    
    tid = getattr(request.state, 'telegram_id', None)
    if not tid:
        raise HTTPException(401, "Unauthorized")
    
    user = (await db.execute(select(User).where(User.telegram_id == str(tid)))).scalars().first()
    if not user:
        raise HTTPException(404, "User not found")
    
    # Проверяем Premium статус
    if not user.is_premium and str(tid) != str(ADMIN_ID):
        return JSONResponse({"ok": False, "error": "Создание чеков доступно только Premium пользователям"})
    
    # Проверяем минимальную сумму
    if payload.amount < 1:
        return JSONResponse({"ok": False, "error": "Минимальная сумма чека: 1 USDT"})
    
    # Проверяем общий баланс (реальный + виртуальный)
    real_bal = user.balance_usdt or 0
    virtual_bal = user.virtual_balance or 0
    total_bal = real_bal + virtual_bal
    
    if total_bal < payload.amount:
        return JSONResponse({"ok": False, "error": f"Недостаточно средств. Баланс: {total_bal:.2f} USDT"})
    
    # Генерируем код
    import secrets
    check_code = secrets.token_urlsafe(16)
    
    # Дата истечения
    expires_at = datetime.utcnow() + timedelta(hours=payload.expires_in_hours)
    
    # Списываем с баланса (сначала виртуальный, потом реальный)
    amount_to_deduct = payload.amount
    deducted_from_virtual = min(virtual_bal, amount_to_deduct)
    user.virtual_balance = virtual_bal - deducted_from_virtual
    amount_to_deduct -= deducted_from_virtual
    
    if amount_to_deduct > 0:
        user.balance_usdt = real_bal - amount_to_deduct
    
    # Создаём чек
    new_check = Check(
        creator_id=user.id,
        amount_usdt=payload.amount,
        check_code=check_code,
        status="active",
        expires_at=expires_at
    )
    db.add(new_check)
    
    # Записываем транзакцию
    db.add(Transaction(
        user_id=user.id,
        type="check_create",
        amount=-payload.amount,
        currency="USDT",
        status="done",
        details={"check_code": check_code, "expires_at": expires_at.isoformat()}
    ))
    
    await db.commit()
    
    bot_link = f"https://t.me/KrakenEdgebot?start=check_{check_code}"
    
    return {
        "ok": True,
        "check_code": check_code,
        "check_link": bot_link,
        "amount": payload.amount,
        "expires_at": expires_at.isoformat(),
        "new_balance": user.balance_usdt
    }

@app.post("/api/checks/redeem")
async def api_checks_redeem(payload: CheckActivate, request: Request, db: AsyncSession=Depends(get_db)):
    """Активация чека через API (альтернатива боту)"""
    
    tid = getattr(request.state, 'telegram_id', None)
    if not tid:
        raise HTTPException(401, "Unauthorized")
    
    user = (await db.execute(select(User).where(User.telegram_id == str(tid)))).scalars().first()
    if not user:
        raise HTTPException(404, "User not found")
    
    check = (await db.execute(select(Check).where(Check.check_code == payload.check_code))).scalars().first()
    
    if not check:
        return JSONResponse({"ok": False, "error": "Чек не найден"})
    
    if check.status != "active":
        return JSONResponse({"ok": False, "error": "Чек уже активирован или истёк"})
    
    if check.expires_at and datetime.utcnow() > check.expires_at:
        check.status = "expired"
        await db.commit()
        return JSONResponse({"ok": False, "error": "Срок действия чека истёк"})
    
    if check.creator_id == user.id:
        return JSONResponse({"ok": False, "error": "Вы не можете активировать свой собственный чек"})
    
    # Активируем чек
    check.status = "activated"
    check.activated_by = user.id
    check.activated_at = datetime.utcnow()
    
    # Начисляем баланс
    user.balance_usdt = (user.balance_usdt or 0) + check.amount_usdt
    
    # Записываем транзакцию
    db.add(Transaction(
        user_id=user.id,
        type="check_activate",
        amount=check.amount_usdt,
        currency="USDT",
        status="done",
        details={"check_code": payload.check_code, "creator_id": check.creator_id}
    ))
    
    await db.commit()
    
    return {
        "ok": True,
        "amount": check.amount_usdt,
        "new_balance": user.balance_usdt
    }

@app.post("/api/check/activate")
async def api_check_activate(payload: CheckActivate, request: Request, db: AsyncSession=Depends(get_db)):
    """Пользователь активирует чек и получает USDT"""
    
    auth_tid = getattr(request.state, 'telegram_id', None)
    if not auth_tid:
        raise HTTPException(401, "Unauthorized")
    
    user = (await db.execute(select(User).where(User.telegram_id == str(auth_tid)))).scalars().first()
    if not user:
        raise HTTPException(404, "User not found")
    
    # Находим чек
    check = (await db.execute(select(Check).where(Check.check_code == payload.check_code))).scalars().first()
    if not check:
        return JSONResponse({"ok": False, "error": "Чек не найден"})
    
    # Проверяем статус
    if check.status != "active":
        return JSONResponse({"ok": False, "error": "Чек уже активирован или истёк"})
    
    # Проверяем срок действия
    if check.expires_at and datetime.utcnow() > check.expires_at:
        check.status = "expired"
        await db.commit()
        return JSONResponse({"ok": False, "error": "Срок действия чека истёк"})
    
    # Проверяем что пользователь не активирует свой собственный чек
    if check.creator_id == user.id:
        return JSONResponse({"ok": False, "error": "Вы не можете активировать свой собственный чек"})
    
    # Активируем чек
    check.status = "activated"
    check.activated_by = user.id
    check.activated_at = datetime.utcnow()
    
    # Начисляем USDT пользователю
    user.balance_usdt = (user.balance_usdt or 0) + check.amount_usdt
    
    # Записываем транзакцию
    db.add(Transaction(
        user_id=user.id,
        type="check_activate",
        amount=check.amount_usdt,
        currency="USDT",
        status="done",
        details={"check_code": payload.check_code, "creator_id": check.creator_id}
    ))
    
    await db.commit()
    
    # Уведомляем админа
    try:
        await bot_send_message(
            int(ADMIN_ID),
            f"✅ <b>Чек активирован!</b>\n\n"
            f"💰 Сумма: {check.amount_usdt} USDT\n"
            f"👤 Активировал: #{user.profile_id} (TG: {user.telegram_id})\n"
            f"🔑 Код чека: <code>{payload.check_code}</code>",
            parse_mode="HTML"
        )
    except:
        pass
    
    return {
        "ok": True,
        "amount_usdt": check.amount_usdt,
        "new_balance": user.balance_usdt
    }

class AssetImport(BaseModel): 
    assets: List[Dict[str, Any]]

class AssetStatusUpdate(BaseModel): 
    asset_id: int
    status: str

@app.post("/admin/assets/import")
async def admin_assets_import(payload: AssetImport, request: Request, db: AsyncSession=Depends(get_db)):
    """Admin endpoint: массовый импорт активов из JSON"""
    check_admin(request)
    
    imported = 0
    for asset_data in payload.assets:
        try:
            asset = Asset(
                symbol=asset_data["symbol"],
                name=asset_data["name"],
                asset_class=asset_data["asset_class"],
                otc=asset_data.get("otc", False),
                display=asset_data.get("display", asset_data["name"]),
                exchange=asset_data.get("exchange", ""),
                status=asset_data.get("status", "active")
            )
            db.add(asset)
            imported += 1
        except Exception as e:
            print(f"[ADMIN] Failed to import asset {asset_data.get('symbol')}: {e}")
            continue
    
    await db.commit()
    return {"ok": True, "imported": imported}

@app.put("/admin/assets/set-status")
async def admin_assets_set_status(payload: AssetStatusUpdate, request: Request, db: AsyncSession=Depends(get_db)):
    """Admin endpoint: изменить статус актива (active/inactive)"""
    check_admin(request)
    
    if payload.status not in ["active", "inactive"]:
        raise HTTPException(400, "Status must be 'active' or 'inactive'")
    
    asset = (await db.execute(select(Asset).where(Asset.id == payload.asset_id))).scalars().first()
    if not asset:
        raise HTTPException(404, "Asset not found")
    
    asset.status = payload.status
    await db.commit()
    
    return {"ok": True, "asset_id": payload.asset_id, "new_status": asset.status}

@app.post("/admin/assets/reload")
async def admin_assets_reload(request: Request, db: AsyncSession=Depends(get_db)):
    """Admin endpoint: перезагрузить активы (удалить все и вставить заново из предустановленного списка)"""
    check_admin(request)
    
    # Подсчитать количество активов перед удалением
    count_result = await db.execute(select(func.count(Asset.id)))
    deleted_count = count_result.scalar()
    
    # Удалить все активы
    await db.execute(text("DELETE FROM assets"))
    
    # Сбросить auto-increment sequence
    await db.execute(text("ALTER SEQUENCE assets_id_seq RESTART WITH 1"))
    
    await db.commit()
    
    return {"ok": True, "deleted": deleted_count, "message": "Assets cleared. Use import endpoint to add new assets."}

# ========== ADMIN PANEL API ==========

async def require_admin(request: Request, db: AsyncSession = Depends(get_db)):
    tid = getattr(request.state, 'telegram_id', None)
    if not tid or str(tid) != str(ADMIN_ID):
        raise HTTPException(403, "Access denied")
    return tid

class AdminBalancePayload(BaseModel):
    action: str
    amount: float
    type: str = "real"

class AdminStatusPayload(BaseModel):
    action: str
    reason: Optional[str] = None

class LuckySetPayload(BaseModel):
    target_telegram_id: str
    enabled: bool
    reason: str
    until: Optional[str] = None
    max_wins: Optional[int] = None

class AdminMessagePayload(BaseModel):
    text: str

class AdminWithdrawalAction(BaseModel):
    action: str
    reason: Optional[str] = None

class AdminBroadcastPayload(BaseModel):
    text: str
    filter: Optional[str] = None

@app.get("/api/admin/dashboard")
async def api_admin_dashboard(request: Request, db: AsyncSession = Depends(get_db)):
    admin_tid = await require_admin(request, db)
    try:
        now = datetime.utcnow()
        day_ago = now - timedelta(hours=24)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week_ago = now - timedelta(days=7)
        month_ago = now - timedelta(days=30)

        total_users = (await db.execute(select(func.count(User.id)))).scalar() or 0
        active_24h = (await db.execute(select(func.count(func.distinct(Transaction.user_id))).where(Transaction.created_at >= day_ago))).scalar() or 0

        deposits_today = (await db.execute(select(func.coalesce(func.sum(Transaction.amount), 0)).where(Transaction.type == "deposit", Transaction.status == "done", Transaction.created_at >= today_start))).scalar() or 0
        deposits_week = (await db.execute(select(func.coalesce(func.sum(Transaction.amount), 0)).where(Transaction.type == "deposit", Transaction.status == "done", Transaction.created_at >= week_ago))).scalar() or 0
        deposits_month = (await db.execute(select(func.coalesce(func.sum(Transaction.amount), 0)).where(Transaction.type == "deposit", Transaction.status == "done", Transaction.created_at >= month_ago))).scalar() or 0

        pending_withdrawals = (await db.execute(select(func.count(Withdrawal.id)).where(Withdrawal.status == "pending"))).scalar() or 0
        active_trades = (await db.execute(select(func.count(Trade.id)).where(Trade.status == "active"))).scalar() or 0

        total_balance = (await db.execute(select(func.coalesce(func.sum(User.balance_usdt), 0)))).scalar() or 0
        total_virtual = (await db.execute(select(func.coalesce(func.sum(User.virtual_balance), 0)))).scalar() or 0

        return {
            "ok": True,
            "stats": {
                "total_users": total_users,
                "active_24h": active_24h,
                "deposits_today": round(float(deposits_today), 2),
                "deposits_week": round(float(deposits_week), 2),
                "deposits_month": round(float(deposits_month), 2),
                "pending_withdrawals": pending_withdrawals,
                "active_trades": active_trades,
                "total_balance": round(float(total_balance), 2),
                "total_virtual": round(float(total_virtual), 2)
            }
        }
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)

@app.get("/api/admin/users")
async def api_admin_users(request: Request, db: AsyncSession = Depends(get_db), page: int = Query(1, ge=1), limit: int = Query(20, ge=1, le=100), search: str = Query(""), filter: str = Query("")):
    admin_tid = await require_admin(request, db)
    try:
        query = select(User)

        if search:
            search_term = f"%{search}%"
            try:
                search_int = int(search)
                query = query.where(or_(User.username.ilike(search_term), User.profile_id == search_int, User.telegram_id == str(search)))
            except ValueError:
                query = query.where(or_(User.username.ilike(search_term), User.telegram_id.ilike(search_term)))

        if filter == "premium":
            query = query.where(User.is_premium == True)
        elif filter == "blocked":
            query = query.where(User.is_blocked == True)
        elif filter == "verified":
            query = query.where(User.is_verified == True)
        elif filter == "with_balance":
            query = query.where(or_(User.balance_usdt > 0, User.virtual_balance > 0))

        count_query = select(func.count()).select_from(query.subquery())
        total = (await db.execute(count_query)).scalar() or 0

        query = query.order_by(User.created_at.desc()).offset((page - 1) * limit).limit(limit)
        result = await db.execute(query)
        users = result.scalars().all()

        users_data = []
        for u in users:
            users_data.append({
                "id": u.id,
                "telegram_id": u.telegram_id,
                "profile_id": u.profile_id,
                "username": u.username,
                "balance_usdt": round(u.balance_usdt or 0, 2),
                "virtual_balance": round(u.virtual_balance or 0, 2),
                "is_verified": u.is_verified or False,
                "is_premium": u.is_premium or False,
                "is_blocked": u.is_blocked or False,
                "language": u.language,
                "created_at": u.created_at.isoformat() if u.created_at else None,
                "referral_code": u.referral_code
            })

        return {
            "ok": True,
            "users": users_data,
            "total": total,
            "page": page,
            "pages": (total + limit - 1) // limit if limit > 0 else 1
        }
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)

@app.get("/api/admin/user/{profile_id}")
async def api_admin_user_detail(profile_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    admin_tid = await require_admin(request, db)
    try:
        user = (await db.execute(select(User).where(User.profile_id == profile_id))).scalars().first()
        if not user:
            raise HTTPException(404, "User not found")

        transactions = (await db.execute(select(Transaction).where(Transaction.user_id == user.id).order_by(Transaction.created_at.desc()).limit(50))).scalars().all()
        trades = (await db.execute(select(Trade).where(Trade.user_id == user.id).order_by(Trade.opened_at.desc()).limit(50))).scalars().all()
        withdrawals = (await db.execute(select(Withdrawal).where(Withdrawal.user_id == user.id).order_by(Withdrawal.created_at.desc()).limit(50))).scalars().all()

        user_data = {
            "id": user.id,
            "telegram_id": user.telegram_id,
            "profile_id": user.profile_id,
            "username": user.username,
            "balance_usdt": round(user.balance_usdt or 0, 2),
            "virtual_balance": round(user.virtual_balance or 0, 2),
            "is_verified": user.is_verified or False,
            "is_premium": user.is_premium or False,
            "is_blocked": user.is_blocked or False,
            "block_reason": user.block_reason,
            "language": user.language,
            "wallets": user.wallets or {},
            "referral_code": user.referral_code,
            "referred_by": user.referred_by,
            "referral_earnings": round(user.referral_earnings or 0, 2) if hasattr(user, 'referral_earnings') else 0,
            "referral_count": user.referral_count or 0 if hasattr(user, 'referral_count') else 0,
            "created_at": user.created_at.isoformat() if user.created_at else None
        }

        txs_data = [{
            "id": t.id,
            "type": t.type,
            "amount": round(t.amount or 0, 2),
            "currency": t.currency,
            "status": t.status,
            "details": t.details,
            "created_at": t.created_at.isoformat() if t.created_at else None
        } for t in transactions]

        trades_data = [{
            "id": tr.id,
            "pair": tr.pair,
            "side": tr.side,
            "amount_usdt": round(tr.amount_usdt or 0, 2),
            "start_price": tr.start_price,
            "close_price": tr.close_price,
            "duration_sec": tr.duration_sec,
            "status": tr.status,
            "result": tr.result,
            "payout": round(tr.payout or 0, 2),
            "opened_at": tr.opened_at.isoformat() if tr.opened_at else None,
            "closed_at": tr.closed_at.isoformat() if tr.closed_at else None
        } for tr in trades]

        wd_data = [{
            "id": w.id,
            "amount_rub": round(w.amount_rub or 0, 2),
            "usdt_required": round(w.usdt_required or 0, 2) if w.usdt_required else None,
            "card_number": w.card_number,
            "full_name": w.full_name,
            "status": w.status,
            "created_at": w.created_at.isoformat() if w.created_at else None
        } for w in withdrawals]

        return {
            "ok": True,
            "user": user_data,
            "transactions": txs_data,
            "trades": trades_data,
            "withdrawals": wd_data
        }
    except HTTPException:
        raise
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)

@app.post("/api/admin/user/{profile_id}/balance")
async def api_admin_user_balance(profile_id: int, payload: AdminBalancePayload, request: Request, db: AsyncSession = Depends(get_db)):
    admin_tid = await require_admin(request, db)
    try:
        user = (await db.execute(select(User).where(User.profile_id == profile_id))).scalars().first()
        if not user:
            raise HTTPException(404, "User not found")

        if payload.type == "virtual":
            old_val = user.virtual_balance or 0
            if payload.action == "add":
                user.virtual_balance = old_val + payload.amount
            elif payload.action == "subtract":
                user.virtual_balance = old_val - payload.amount
            elif payload.action == "set":
                user.virtual_balance = payload.amount
            new_val = user.virtual_balance
        else:
            old_val = user.balance_usdt or 0
            if payload.action == "add":
                user.balance_usdt = old_val + payload.amount
            elif payload.action == "subtract":
                user.balance_usdt = old_val - payload.amount
            elif payload.action == "set":
                user.balance_usdt = payload.amount
            new_val = user.balance_usdt

        db.add(Transaction(
            user_id=user.id,
            type="admin_adjust",
            amount=round(new_val - old_val, 6),
            currency="USDT",
            status="done",
            details={"by": "admin", "action": payload.action, "balance_type": payload.type}
        ))
        await db.commit()

        await log_admin_action(db, admin_tid, f"balance_{payload.action}_{payload.type}", user.id, f"{old_val:.2f}", f"{new_val:.2f}")

        displayed = round((user.balance_usdt or 0) + (user.virtual_balance or 0), 2)
        try:
            await bot_send_message(int(user.telegram_id), f"💰 <b>Баланс обновлён!</b>\n\n💵 Баланс: {displayed:.2f} USDT", parse_mode="HTML")
        except: pass

        return {
            "ok": True,
            "balance_usdt": round(user.balance_usdt or 0, 2),
            "virtual_balance": round(user.virtual_balance or 0, 2),
            "displayed": displayed
        }
    except HTTPException:
        raise
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)

@app.post("/api/admin/user/{profile_id}/status")
async def api_admin_user_status(profile_id: int, payload: AdminStatusPayload, request: Request, db: AsyncSession = Depends(get_db)):
    admin_tid = await require_admin(request, db)
    try:
        user = (await db.execute(select(User).where(User.profile_id == profile_id))).scalars().first()
        if not user:
            raise HTTPException(404, "User not found")

        action = payload.action
        if action == "verify":
            old_val = str(user.is_verified)
            user.is_verified = not user.is_verified
            await log_admin_action(db, admin_tid, "toggle_verification", user.id, old_val, str(user.is_verified))
        elif action == "premium":
            old_val = str(user.is_premium)
            user.is_premium = not user.is_premium
            await log_admin_action(db, admin_tid, "toggle_premium", user.id, old_val, str(user.is_premium))
        elif action == "block":
            old_val = str(user.is_blocked)
            user.is_blocked = True
            user.block_reason = payload.reason or "Blocked by admin"
            await log_admin_action(db, admin_tid, "block_user", user.id, old_val, f"blocked: {user.block_reason}")
        elif action == "unblock":
            old_val = str(user.is_blocked)
            user.is_blocked = False
            user.block_reason = None
            await log_admin_action(db, admin_tid, "unblock_user", user.id, old_val, "unblocked")
        else:
            return JSONResponse({"ok": False, "error": f"Unknown action: {action}"}, status_code=400)

        await db.commit()

        return {
            "ok": True,
            "is_verified": user.is_verified or False,
            "is_premium": user.is_premium or False,
            "is_blocked": user.is_blocked or False,
            "block_reason": user.block_reason
        }
    except HTTPException:
        raise
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)

@app.get("/api/admin/lucky/users")
async def api_admin_lucky_users(request: Request, db: AsyncSession = Depends(get_db), search: str = Query(""), filter: str = Query(""), page: int = Query(1, ge=1)):
    admin_tid = await require_admin(request, db)
    try:
        query = select(User)
        if search:
            query = query.where(or_(User.telegram_id.ilike(f"%{search}%"), User.username.ilike(f"%{search}%"), User.profile_id == int(search) if search.isdigit() else False))
        if filter == "on":
            query = query.where(User.lucky_mode == True)
        elif filter == "off":
            query = query.where(or_(User.lucky_mode == False, User.lucky_mode == None))
        count_q = select(func.count()).select_from(query.subquery())
        total = (await db.execute(count_q)).scalar() or 0
        per_page = 20
        query = query.order_by(User.id.desc()).offset((page - 1) * per_page).limit(per_page)
        users = (await db.execute(query)).scalars().all()
        users_data = []
        for u in users:
            users_data.append({
                "id": u.id, "profile_id": u.profile_id, "telegram_id": u.telegram_id,
                "username": u.username, "balance_usdt": round((u.balance_usdt or 0) + (u.virtual_balance or 0), 2),
                "lucky_mode": u.lucky_mode or False,
                "lucky_until": u.lucky_until.isoformat() if u.lucky_until else None,
                "lucky_max_wins": u.lucky_max_wins, "lucky_wins_used": u.lucky_wins_used or 0
            })
        return {"ok": True, "users": users_data, "total": total, "page": page, "pages": max(1, (total + per_page - 1) // per_page)}
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)

@app.post("/api/admin/lucky/set")
async def api_admin_lucky_set(payload: LuckySetPayload, request: Request, db: AsyncSession = Depends(get_db)):
    admin_tid = await require_admin(request, db)
    try:
        if not payload.reason or not payload.reason.strip():
            return JSONResponse({"ok": False, "error": "Причина обязательна"}, status_code=400)
        user = (await db.execute(select(User).where(User.telegram_id == payload.target_telegram_id))).scalars().first()
        if not user:
            raise HTTPException(404, "User not found")
        before = f"lucky_mode={user.lucky_mode}, until={user.lucky_until}, max_wins={user.lucky_max_wins}, used={user.lucky_wins_used}"
        if payload.enabled:
            user.lucky_mode = True
            user.lucky_wins_used = 0
            try:
                user.lucky_until = datetime.fromisoformat(payload.until) if payload.until else None
            except ValueError:
                return JSONResponse({"ok": False, "error": "Неверный формат даты"}, status_code=400)
            user.lucky_max_wins = payload.max_wins
        else:
            user.lucky_mode = False
            user.lucky_until = None
            user.lucky_max_wins = None
            user.lucky_wins_used = 0
        after = f"lucky_mode={user.lucky_mode}, until={user.lucky_until}, max_wins={user.lucky_max_wins}, used={user.lucky_wins_used}"
        action = "LUCKY_ENABLE" if payload.enabled else "LUCKY_DISABLE"
        await log_admin_action(db, admin_tid, action, user.id, before, after, reason=payload.reason)
        await db.commit()
        return {"ok": True, "lucky_mode": user.lucky_mode, "lucky_until": user.lucky_until.isoformat() if user.lucky_until else None, "lucky_max_wins": user.lucky_max_wins, "lucky_wins_used": user.lucky_wins_used or 0}
    except HTTPException:
        raise
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)

@app.get("/api/admin/lucky/history/{profile_id}")
async def api_admin_lucky_history(profile_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    admin_tid = await require_admin(request, db)
    try:
        user = (await db.execute(select(User).where(User.profile_id == profile_id))).scalars().first()
        if not user:
            raise HTTPException(404, "User not found")
        logs = (await db.execute(select(AdminLog).where(AdminLog.user_id == user.id, AdminLog.action.like("LUCKY_%")).order_by(AdminLog.created_at.desc()).limit(50))).scalars().all()
        history = []
        for l in logs:
            history.append({"id": l.id, "admin_id": l.admin_id, "action": l.action, "before": l.before_value, "after": l.after_value, "reason": l.reason, "created_at": l.created_at.isoformat() if l.created_at else None})
        return {"ok": True, "history": history}
    except HTTPException:
        raise
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)

@app.post("/api/admin/user/{profile_id}/message")
async def api_admin_user_message(profile_id: int, payload: AdminMessagePayload, request: Request, db: AsyncSession = Depends(get_db)):
    admin_tid = await require_admin(request, db)
    try:
        user = (await db.execute(select(User).where(User.profile_id == profile_id))).scalars().first()
        if not user:
            raise HTTPException(404, "User not found")

        result = await bot_send_message(int(user.telegram_id), payload.text)
        success = result.get("ok", False) if result else False

        await log_admin_action(db, admin_tid, "send_message", user.id, None, payload.text[:200])

        return {"ok": success, "message_sent": success}
    except HTTPException:
        raise
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)

@app.get("/api/admin/withdrawals")
async def api_admin_withdrawals(request: Request, db: AsyncSession = Depends(get_db), status: str = Query("pending"), page: int = Query(1, ge=1), limit: int = Query(20, ge=1, le=100)):
    admin_tid = await require_admin(request, db)
    try:
        query = select(Withdrawal)
        if status and status != "all":
            query = query.where(Withdrawal.status == status)

        count_query = select(func.count()).select_from(query.subquery())
        total = (await db.execute(count_query)).scalar() or 0

        query = query.order_by(Withdrawal.created_at.desc()).offset((page - 1) * limit).limit(limit)
        result = await db.execute(query)
        withdrawals = result.scalars().all()

        wd_data = []
        for w in withdrawals:
            user = (await db.execute(select(User).where(User.id == w.user_id))).scalars().first()
            wd_data.append({
                "id": w.id,
                "user_id": w.user_id,
                "telegram_id": w.telegram_id,
                "profile_id": user.profile_id if user else None,
                "username": user.username if user else None,
                "amount_rub": round(w.amount_rub or 0, 2),
                "usdt_required": round(w.usdt_required or 0, 2) if w.usdt_required else None,
                "card_number": w.card_number,
                "full_name": w.full_name,
                "status": w.status,
                "admin_notes": w.admin_notes,
                "created_at": w.created_at.isoformat() if w.created_at else None
            })

        return {
            "ok": True,
            "withdrawals": wd_data,
            "total": total,
            "page": page,
            "pages": (total + limit - 1) // limit if limit > 0 else 1
        }
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)

@app.post("/api/admin/withdrawal/{wd_id}/action")
async def api_admin_withdrawal_action(wd_id: int, payload: AdminWithdrawalAction, request: Request, db: AsyncSession = Depends(get_db)):
    admin_tid = await require_admin(request, db)
    try:
        withdrawal = (await db.execute(select(Withdrawal).where(Withdrawal.id == wd_id))).scalars().first()
        if not withdrawal:
            raise HTTPException(404, "Withdrawal not found")
        if withdrawal.status != "pending":
            return JSONResponse({"ok": False, "error": f"Withdrawal is already {withdrawal.status}"}, status_code=400)

        user = (await db.execute(select(User).where(User.id == withdrawal.user_id))).scalars().first()

        if payload.action == "approve":
            withdrawal.status = "completed"
            withdrawal.completed_at = datetime.utcnow()
            withdrawal.updated_at = datetime.utcnow()
            if payload.reason:
                withdrawal.admin_notes = payload.reason
            await db.commit()

            await log_admin_action(db, admin_tid, "approve_withdrawal", withdrawal.user_id, "pending", "completed", details={"wd_id": wd_id, "amount": withdrawal.amount_rub})

            if user and user.telegram_id:
                try:
                    await bot_send_message(int(user.telegram_id), f"✅ <b>Вывод одобрен!</b>\n\n💰 Сумма: {withdrawal.amount_rub:.2f} RUB\n💳 Карта: {withdrawal.card_number or '***'}\n\nСредства будут зачислены в течение 24 часов.")
                except:
                    pass

            return {"ok": True, "status": "completed"}

        elif payload.action == "reject":
            withdrawal.status = "cancelled"
            withdrawal.updated_at = datetime.utcnow()
            if payload.reason:
                withdrawal.admin_notes = payload.reason

            refund = withdrawal.usdt_required or 0
            if user and refund > 0:
                user.balance_usdt = (user.balance_usdt or 0) + refund

            await db.commit()

            await log_admin_action(db, admin_tid, "reject_withdrawal", withdrawal.user_id, "pending", "cancelled", reason=payload.reason, details={"wd_id": wd_id, "refund": refund})

            if user and user.telegram_id:
                try:
                    reason_text = f"\n📝 Причина: {payload.reason}" if payload.reason else ""
                    await bot_send_message(int(user.telegram_id), f"❌ <b>Вывод отклонён</b>\n\n💰 Сумма: {withdrawal.amount_rub:.2f} RUB{reason_text}\n💵 Возврат: {refund:.2f} USDT на баланс")
                except:
                    pass

            return {"ok": True, "status": "cancelled", "refunded": refund}

        else:
            return JSONResponse({"ok": False, "error": f"Unknown action: {payload.action}"}, status_code=400)
    except HTTPException:
        raise
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)

@app.post("/api/admin/broadcast")
async def api_admin_broadcast(payload: AdminBroadcastPayload, request: Request, db: AsyncSession = Depends(get_db)):
    admin_tid = await require_admin(request, db)
    try:
        query = select(User)
        if payload.filter == "premium":
            query = query.where(User.is_premium == True)
        elif payload.filter == "verified":
            query = query.where(User.is_verified == True)
        elif payload.filter == "with_balance":
            query = query.where(or_(User.balance_usdt > 0, User.virtual_balance > 0))

        users = (await db.execute(query)).scalars().all()

        sent = 0
        failed = 0
        for u in users:
            if u.is_blocked:
                continue
            try:
                result = await bot_send_message(int(u.telegram_id), payload.text)
                if result and result.get("ok"):
                    sent += 1
                else:
                    failed += 1
            except:
                failed += 1

        admin_msg = AdminMessage(
            user_id=None,
            message_text=payload.text,
            is_broadcast=True,
            broadcast_count=sent,
            delivery_type="telegram_chat"
        )
        db.add(admin_msg)

        await log_admin_action(db, admin_tid, "broadcast", None, None, payload.text[:100], details={"sent": sent, "failed": failed, "filter": payload.filter})

        return {"ok": True, "sent": sent, "failed": failed, "total": len(users)}
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)

@app.get("/api/admin/logs")
async def api_admin_logs(request: Request, db: AsyncSession = Depends(get_db), page: int = Query(1, ge=1), limit: int = Query(50, ge=1, le=200)):
    admin_tid = await require_admin(request, db)
    try:
        count_query = select(func.count(AdminLog.id))
        total = (await db.execute(count_query)).scalar() or 0

        query = select(AdminLog).order_by(AdminLog.created_at.desc()).offset((page - 1) * limit).limit(limit)
        result = await db.execute(query)
        logs = result.scalars().all()

        logs_data = [{
            "id": log.id,
            "admin_id": log.admin_id,
            "user_id": log.user_id,
            "action": log.action,
            "before_value": log.before_value,
            "after_value": log.after_value,
            "reason": log.reason,
            "details": log.details,
            "created_at": log.created_at.isoformat() if log.created_at else None
        } for log in logs]

        return {
            "ok": True,
            "logs": logs_data,
            "total": total,
            "page": page,
            "pages": (total + limit - 1) // limit if limit > 0 else 1
        }
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)

# ========== CRYPTOBOT WEBHOOK ==========

async def process_deposit_payment(db: AsyncSession, invoice_id: str, amount: float, source: str = "webhook"):
    """
    Process a deposit payment - shared logic for webhook and polling.
    Idempotent: won't double-credit if called multiple times.
    Returns (success, message)
    """
    # Find pending transaction by invoice_id - ONLY process pending ones (idempotent)
    trx = None
    q = await db.execute(select(Transaction).where(Transaction.type == "deposit"))
    for t in q.scalars().all():
        if (t.details or {}).get("invoice_id") == invoice_id:
            trx = t
            break
    
    if not trx:
        print(f"[DEPOSIT:{source}] Transaction not found for invoice {invoice_id}")
        return False, "Transaction not found"
    
    # Idempotency check - if already done, skip
    if trx.status == "done":
        print(f"[DEPOSIT:{source}] Invoice {invoice_id} already processed (idempotent skip)")
        return True, "Already processed"
    
    user = (await db.execute(select(User).where(User.id == trx.user_id))).scalars().first()
    if not user:
        print(f"[DEPOSIT:{source}] User not found for transaction {trx.id}")
        return False, "User not found"
    
    # Use pre-calculated amount_after_fee from invoice creation (stored in transaction details)
    # Falls back to 2.5% fee calculation if not stored
    DEPOSIT_FEE_PERCENT = 0.0
    details = trx.details or {}
    if "amount_after_fee" in details:
        amount_after_fee = float(details["amount_after_fee"])
        fee_amount = float(details.get("fee", amount - amount_after_fee))
    else:
        fee_amount = round(amount * (DEPOSIT_FEE_PERCENT / 100), 6)
        amount_after_fee = round(amount - fee_amount, 6)
    
    # Credit user's REAL balance
    user.balance_usdt = (user.balance_usdt or 0) + amount_after_fee
    
    # Update transaction
    trx.status = "done"
    trx.details = trx.details or {}
    trx.details["paid_at"] = datetime.utcnow().isoformat()
    trx.details["credited_via"] = source
    trx.details["fee_applied"] = fee_amount
    trx.details["amount_credited"] = amount_after_fee
    
    await db.commit()
    
    # Check if this is user's first deposit and pay referral bonus
    if user.referred_by:
        first_deposit_count = (await db.execute(
            select(func.count(Transaction.id)).where(
                Transaction.user_id == user.id,
                Transaction.type == "deposit",
                Transaction.status == "done",
                Transaction.id != trx.id
            )
        )).scalar() or 0
        
        if first_deposit_count == 0:
            referrer = (await db.execute(select(User).where(User.profile_id == user.referred_by))).scalars().first()
            if referrer:
                REFERRAL_BONUS_PERCENT = 5.0
                referral_bonus = round(amount_after_fee * (REFERRAL_BONUS_PERCENT / 100), 6)
                
                referrer.balance_usdt = (referrer.balance_usdt or 0) + referral_bonus
                referrer.referral_earnings = (referrer.referral_earnings or 0) + referral_bonus
                
                ref_tx = Transaction(
                    user_id=referrer.id,
                    type="referral_bonus",
                    amount=referral_bonus,
                    currency="USDT",
                    status="done",
                    details={"from_user": user.profile_id, "deposit_amount": amount_after_fee}
                )
                db.add(ref_tx)
                await db.commit()
                
                try:
                    await bot_send_message(int(referrer.telegram_id), f"🎉 <b>Реферальный бонус!</b>\n\n💰 Получено: +{referral_bonus:.2f} USDT\n👤 Ваш друг @{user.username or 'Аноним'} сделал первый депозит\n📊 Новый баланс: {referrer.balance_usdt:.2f} USDT")
                except: pass
                
                print(f"[REFERRAL] Bonus paid: User #{referrer.profile_id} +{referral_bonus} USDT from User #{user.profile_id}")
    
    # Notify user
    try:
        await bot_send_message(int(user.telegram_id), f"✅ <b>Пополнение успешно!</b>\n\n💰 Зачислено: {amount_after_fee:.2f} USDT\n📊 Новый баланс: {user.balance_usdt:.2f} USDT")
    except: pass
    
    print(f"[DEPOSIT:{source}] ✅ Processed: User #{user.profile_id}, +{amount_after_fee} USDT (fee: {fee_amount})")
    return True, "Success"

@app.post("/webhook/cryptobot")
@app.post("/api/cryptobot/webhook")
async def cryptobot_webhook(request: Request, db: AsyncSession=Depends(get_db)):
    """CryptoBot webhook for automatic deposit processing"""
    try:
        body_bytes = await request.body()
        signature = request.headers.get("crypto-pay-api-signature", "")
        
        print(f"[CRYPTOBOT WEBHOOK] Received request, signature present: {bool(signature)}")
        
        # Verify signature
        if CRYPTO_PAY_TOKEN and signature:
            secret = hashlib.sha256(CRYPTO_PAY_TOKEN.encode()).digest()
            expected = hmac.new(secret, body_bytes, hashlib.sha256).hexdigest()
            
            if not hmac.compare_digest(expected, signature):
                print("[CRYPTOBOT WEBHOOK] Invalid signature")
                return {"ok": False, "error": "Invalid signature"}
            print("[CRYPTOBOT WEBHOOK] Signature verified ✓")
        
        data = json.loads(body_bytes.decode())
        update_type = data.get("update_type")
        update_id = data.get("update_id")
        
        print(f"[CRYPTOBOT WEBHOOK] update_type={update_type}, update_id={update_id}")
        
        # Process only invoice_paid events
        if update_type == "invoice_paid":
            payload = data.get("payload", {})
            invoice_id = str(payload.get("invoice_id"))
            amount = float(payload.get("amount", 0))
            asset = payload.get("asset", "USDT")
            status = payload.get("status")
            
            print(f"[CRYPTOBOT WEBHOOK] Invoice {invoice_id} paid: {amount} {asset}, status: {status}")
            
            if status == "paid" and asset == "USDT":
                success, msg = await process_deposit_payment(db, invoice_id, amount, "webhook")
                return {"ok": success, "message": msg}
            else:
                print(f"[CRYPTOBOT WEBHOOK] Skipping: asset={asset}, status={status}")
        
        return {"ok": True}
    except Exception as e:
        print(f"[CRYPTOBOT WEBHOOK] Error: {e}")
        import traceback
        traceback.print_exc()
        return {"ok": False, "error": str(e)}

# ========== BACKGROUND DEPOSIT POLLING ==========
async def poll_pending_deposits():
    """Background task to check pending deposits every 30 seconds"""
    while True:
        try:
            await asyncio.sleep(30)
            
            async with AsyncSessionLocal() as db:
                # Find all pending deposit transactions older than 60 seconds
                cutoff_time = datetime.utcnow() - timedelta(seconds=60)
                
                pending_txs = (await db.execute(
                    select(Transaction).where(
                        Transaction.type == "deposit",
                        Transaction.status == "pending",
                        Transaction.created_at < cutoff_time
                    )
                )).scalars().all()
                
                if pending_txs:
                    print(f"[DEPOSIT POLL] Checking {len(pending_txs)} pending deposits...")
                
                for trx in pending_txs:
                    invoice_id = (trx.details or {}).get("invoice_id")
                    if not invoice_id:
                        continue
                    
                    try:
                        # Check invoice status via CryptoBot API
                        headers = {"Crypto-Pay-API-Token": CRYPTO_PAY_TOKEN}
                        async with aiohttp.ClientSession() as session:
                            async with session.get(
                                "https://pay.crypt.bot/api/getInvoices",
                                headers=headers,
                                params={"invoice_ids": invoice_id},
                                timeout=15
                            ) as r:
                                resp = await r.json()
                                if resp.get("ok") and resp.get("result", {}).get("items"):
                                    item = resp["result"]["items"][0]
                                    status = item.get("status")
                                    amount = float(item.get("amount", 0))
                                    
                                    if status == "paid":
                                        print(f"[DEPOSIT POLL] Invoice {invoice_id} is paid, processing...")
                                        success, msg = await process_deposit_payment(db, invoice_id, amount, "polling")
                                        print(f"[DEPOSIT POLL] Result: {success}, {msg}")
                    except Exception as e:
                        print(f"[DEPOSIT POLL] Error checking invoice {invoice_id}: {e}")
                        
        except Exception as e:
            print(f"[DEPOSIT POLL] Background task error: {e}")

@app.on_event("startup")
async def start_deposit_polling():
    """Start the background deposit polling task"""
    asyncio.create_task(poll_pending_deposits())
    print("[DEPOSIT POLL] Background polling task started (every 30s)")

# Background task to close expired trades
async def poll_expired_trades():
    """Background task to close expired trades every 2 seconds"""
    while True:
        await asyncio.sleep(2)
        try:
            async with AsyncSessionLocal() as db:
                # Find all active trades that have expired
                now = datetime.utcnow()
                result = await db.execute(
                    select(Trade).where(
                        Trade.status == "active"
                    )
                )
                active_trades = result.scalars().all()
                
                expired_count = 0
                for tr in active_trades:
                    expire_time = tr.opened_at + timedelta(seconds=tr.duration_sec)
                    if now >= expire_time:
                        # Trade has expired - close it
                        symbol = tr.pair.replace('/', '') + ('USDT' if not tr.pair.endswith('USDT') else '')
                        
                        u = (await db.execute(select(User).where(User.id == tr.user_id))).scalars().first()
                        if not u:
                            continue
                        
                        # Get REAL current price from OKX
                        cur = await okx_get_price(symbol) or tr.start_price
                        
                        # Calculate REAL result based on price movement
                        direction = 1 if (cur - tr.start_price) > 0 else (-1 if (cur - tr.start_price) < 0 else 0)
                        
                        # Check Lucky Mode
                        is_lucky = False
                        if u.lucky_mode:
                            is_lucky = True
                            if u.lucky_until and now >= u.lucky_until:
                                is_lucky = False
                            if u.lucky_max_wins is not None and u.lucky_wins_used >= u.lucky_max_wins:
                                is_lucky = False

                        if is_lucky:
                            win = True
                            if u.lucky_max_wins is not None:
                                u.lucky_wins_used = (u.lucky_wins_used or 0) + 1
                                if u.lucky_wins_used >= u.lucky_max_wins:
                                    u.lucky_mode = False
                                    u.lucky_until = None
                                    u.lucky_max_wins = None
                                    print(f"[LUCKY] Auto-disabled for user {u.telegram_id} (max wins reached)")
                        else:
                            if tr.side == 'buy':
                                win = direction > 0
                            else:
                                win = direction < 0
                        
                        PAYOUT_MULTIPLIER = 0.7
                        payout = round(tr.amount_usdt * PAYOUT_MULTIPLIER, 6) if win else 0.0
                        
                        tr.status = "completed"
                        tr.closed_at = datetime.utcnow()
                        tr.close_price = cur
                        tr.result = "win" if win else "loss"
                        tr.payout = payout
                        
                        print(f"[TRADE POLL] Closed {symbol} {tr.side.upper()} → Start: ${tr.start_price:.2f}, Close: ${cur:.2f}, Result: {tr.result.upper()}")
                        
                        if win:
                            u.virtual_balance = (u.virtual_balance or 0) + tr.amount_usdt + payout
                        
                        # Update transaction
                        q = await db.execute(
                            select(Transaction).where(
                                Transaction.user_id == u.id,
                                Transaction.type == "trade",
                                Transaction.status == "pending"
                            ).order_by(Transaction.created_at.desc())
                        )
                        trx = q.scalars().first()
                        if trx:
                            trx.status = "done"
                            existing_details = trx.details or {}
                            trx.details = {**existing_details, "result": tr.result, "payout": tr.payout, "close_price": cur}
                        
                        expired_count += 1
                        
                        # Send notification
                        displayed_balance = (u.balance_usdt or 0) + (u.virtual_balance or 0)
                        try:
                            if win:
                                profit = round(payout, 2)
                                msg = f"🎉 <b>ВЫИГРЫШ!</b>\n\n📊 Пара: {tr.pair}\n💰 Ставка: {round(tr.amount_usdt, 2)} USDT\n✅ Выплата: +{profit} USDT\n💵 Баланс: {round(displayed_balance, 2)} USDT"
                            else:
                                msg = f"😔 <b>Сделка закрыта</b>\n\n📊 Пара: {tr.pair}\n💰 Ставка: {round(tr.amount_usdt, 2)} USDT\n❌ Результат: Проигрыш\n💵 Баланс: {round(displayed_balance, 2)} USDT"
                            await bot_send_message(int(u.telegram_id), msg)
                        except:
                            pass
                
                if expired_count > 0:
                    await db.commit()
                    print(f"[TRADE POLL] Closed {expired_count} expired trades")
                    
        except Exception as e:
            print(f"[TRADE POLL] Error: {e}")

@app.on_event("startup")
async def start_trade_polling():
    """Start the background trade polling task"""
    asyncio.create_task(poll_expired_trades())
    print("[TRADE POLL] Background polling task started (every 2s)")

# Helper function for balance changes
async def execute_balance_change(db: AsyncSession, profile_id: int, amount: float, action: str, admin_chat_id: str):
    """Execute balance change with proper notifications"""
    try:
        user = (await db.execute(select(User).where(User.profile_id == profile_id))).scalars().first()
        if not user:
            return {"ok": False, "message": f"❌ Пользователь #{profile_id} не найден"}
        
        old_balance = user.balance_usdt or 0.0
        
        if action == "add":
            new_balance = old_balance + amount
            if new_balance < 0:
                return {"ok": False, "message": f"❌ Недостаточно средств!\n\nТекущий баланс: {old_balance:.2f} USDT\nПопытка списать: {abs(amount):.2f} USDT"}
            user.balance_usdt = new_balance
        elif action == "set":
            if amount < 0:
                return {"ok": False, "message": "❌ Баланс не может быть отрицательным"}
            new_balance = amount
            user.balance_usdt = new_balance
            amount = new_balance - old_balance  # For transaction record
        
        # Create transaction record
        if amount > 0:
            transaction = Transaction(
                user_id=user.id,
                type="deposit",
                amount=abs(amount),
                currency="USDT",
                status="done",
                details={"source": "admin_manual", "admin_id": str(ADMIN_ID), "reason": "Manual balance adjustment"}
            )
            db.add(transaction)
        elif amount < 0:
            transaction = Transaction(
                user_id=user.id,
                type="withdrawal",
                amount=abs(amount),
                currency="USDT",
                status="done",
                details={"source": "admin_manual", "admin_id": str(ADMIN_ID), "reason": "Manual balance adjustment"}
            )
            db.add(transaction)
        
        await db.commit()
        
        # Prepare response message
        operation = "Добавлено" if amount > 0 else "Списано" if amount < 0 else "Без изменений"
        message = f"✅ <b>Баланс изменен!</b>\n\n"
        user_info = format_user_info(user)
        message += f"👤 Пользователь: {user_info}\n\n"
        message += f"💰 Старый баланс: {old_balance:.2f} USDT\n"
        if amount != 0:
            message += f"{'📈' if amount > 0 else '📉'} {operation}: {abs(amount):.2f} USDT\n"
        message += f"💎 <b>Новый баланс: {new_balance:.2f} USDT</b>"
        
        # Notify user
        try:
            if amount > 0:
                await bot_send_message(int(user.telegram_id), 
                    f"💰 <b>Ваш баланс пополнен!</b>\n\n✅ Зачислено: {amount:.2f} USDT\n💵 Новый баланс: {new_balance:.2f} USDT\n\n📝 Причина: Ручное пополнение администратором", 
                    parse_mode="HTML")
            elif amount < 0:
                await bot_send_message(int(user.telegram_id), 
                    f"💸 <b>С вашего баланса списаны средства</b>\n\n📉 Списано: {abs(amount):.2f} USDT\n💵 Новый баланс: {new_balance:.2f} USDT\n\n📝 Причина: Корректировка администратором", 
                    parse_mode="HTML")
        except:
            pass
        
        return {"ok": True, "message": message}
    except Exception as e:
        return {"ok": False, "message": f"❌ Ошибка: {str(e)}"}

router=APIRouter()
@router.post("/webhook")
async def telegram_webhook(update: Dict[str,Any], db: AsyncSession=Depends(get_db)):
    try:
        # Handle callback queries (button clicks)
        if "callback_query" in update:
            cq=update["callback_query"]; data=cq.get("data",""); chat_id=cq["message"]["chat"]["id"]
            callback_id = cq.get("id")
            
            print(f"[CALLBACK] User {chat_id} pressed: {data}")
            
            # Answer callback to remove loading state from button
            await bot_answer_callback(callback_id)
            
            # ========== ESSENTIAL CALLBACKS ONLY ==========
            # Check deposit payment status
            if data.startswith("check_deposit:"):
                invoice_id=data.split(":",1)[1]
                print(f"[CHECK_DEPOSIT] User {chat_id} checking invoice {invoice_id}")
                u = (await db.execute(select(User).where(User.telegram_id==str(chat_id)))).scalars().first()
                if u:
                    status_val = "active"; amount_val = 0.0
                    try:
                        async with aiohttp.ClientSession() as s2:
                            async with s2.get("https://pay.crypt.bot/api/getInvoices", headers={"Crypto-Pay-API-Token": CRYPTO_PAY_TOKEN}, params={"invoice_ids": invoice_id}, timeout=15) as r2:
                                resp2 = await r2.json()
                                if resp2.get("ok") and resp2["result"]["items"]: it2=resp2["result"]["items"][0]; status_val=it2["status"]; amount_val=float(it2.get("amount",0))
                    except: status_val = "active"
                    if status_val == "paid":
                        q2 = await db.execute(select(Transaction).where(Transaction.user_id==u.id, Transaction.type=="deposit"))
                        trx = None
                        for r3 in q2.scalars().all():
                            if (r3.details or {}).get("invoice_id") == invoice_id: trx = r3; break
                        if trx and trx.status != "done":
                            amount_after_fee = (trx.details or {}).get("amount_after_fee", trx.amount)
                            trx.status = "done"; u.balance_usdt = (u.balance_usdt or 0) + amount_after_fee; await db.commit()
                        await bot_send_message(chat_id, f"✅ <b>Платеж подтвержден!</b>\n\n💰 Сумма: {trx.amount if trx else amount_val} USDT\n💵 Ваш баланс: {round(u.balance_usdt, 2)} USDT\n\n🎉 Средства успешно зачислены на ваш счет!", parse_mode="HTML")
                    else:
                        await bot_send_message(chat_id, "⏳ <b>Платеж в обработке</b>\n\nПлатеж еще не поступил. Пожалуйста, подождите несколько минут и попробуйте еще раз.\n\nЕсли вы оплатили счет, средства будут зачислены автоматически.", parse_mode="HTML")
            
            # Handle withdrawal approval from notification buttons
            elif data.startswith("approve_withdraw:"):
                if str(chat_id) == str(ADMIN_ID):
                    withdrawal_id = int(data.split(":",1)[1])
                    withdrawal = (await db.execute(select(Withdrawal).where(Withdrawal.id == withdrawal_id))).scalars().first()
                    if withdrawal:
                        if withdrawal.status == "completed":
                            await bot_send_message(chat_id, f"✅ Вывод #{withdrawal_id} уже одобрен")
                            return {"ok": True}
                        
                        user = (await db.execute(select(User).where(User.id == withdrawal.user_id))).scalars().first()
                        withdrawal.status = "completed"
                        withdrawal.completed_at = datetime.utcnow()
                        await db.commit()
                        
                        user_display = format_user_display(user) if user else "N/A"
                        await bot_send_message(chat_id, f"✅ <b>Вывод #{withdrawal_id} завершен!</b>\n\n💰 Сумма: {withdrawal.amount_rub:,.0f} ₽\n👤 Пользователь: {user_display}", parse_mode="HTML")
                        
                        if user:
                            try:
                                await bot_send_message(int(user.telegram_id), f"✅ <b>Деньги переведены!</b>\n\n💰 Сумма: {withdrawal.amount_rub:,.0f} ₽\n💳 На карту: **** {withdrawal.card_number}\n\n📊 Статус: <b>Завершено</b>", parse_mode="HTML")
                            except: pass
                    else:
                        await bot_send_message(chat_id, "❌ Вывод не найден")
            
            # Handle withdrawal cancellation from notification buttons
            elif data.startswith("cancel_withdraw:"):
                if str(chat_id) == str(ADMIN_ID):
                    withdrawal_id = int(data.split(":",1)[1])
                    withdrawal = (await db.execute(select(Withdrawal).where(Withdrawal.id == withdrawal_id))).scalars().first()
                    if withdrawal:
                        if withdrawal.status == "completed":
                            await bot_send_message(chat_id, f"❌ Вывод #{withdrawal_id} уже завершен, отменить невозможно")
                            return {"ok": True}
                        elif withdrawal.status == "cancelled":
                            await bot_send_message(chat_id, f"⚠️ Вывод #{withdrawal_id} уже отменен")
                            return {"ok": True}
                        
                        user = (await db.execute(select(User).where(User.id == withdrawal.user_id))).scalars().first()
                        
                        refund_amount = withdrawal.usdt_required
                        if user:
                            user.balance_usdt = (user.balance_usdt or 0) + refund_amount
                        
                        withdrawal.status = "cancelled"
                        await db.commit()
                        
                        user_display = format_user_display(user) if user else "N/A"
                        await bot_send_message(chat_id, f"❌ <b>Вывод #{withdrawal_id} отменён!</b>\n\n💰 Сумма: {withdrawal.amount_rub:,.0f} ₽\n👤 Пользователь: {user_display}\n\n✅ {refund_amount:.4f} USDT возвращены пользователю", parse_mode="HTML")
                        
                        if user:
                            try:
                                await bot_send_message(int(user.telegram_id), f"❌ <b>Вывод отменён</b>\n\n💰 Запрошенная сумма: {withdrawal.amount_rub:,.0f} ₽\n\n✅ {refund_amount:.4f} USDT возвращены на ваш баланс.", parse_mode="HTML")
                            except: pass
                    else:
                        await bot_send_message(chat_id, "❌ Вывод не найден")
            
            # Handle contact user button
            elif data.startswith("contact_user:"):
                if str(chat_id) == str(ADMIN_ID):
                    target_user_id = data.split(":",1)[1]
                    admin_reply_state[str(ADMIN_ID)] = target_user_id
                    await bot_send_message(chat_id, f"✅ Режим ответа включен для пользователя {target_user_id}\n\nОтправьте сообщение, которое хотите передать пользователю.\n\nДля отмены отправьте: /cancel")
            
            # Handle admin reply button
            elif data.startswith("reply:"):
                if str(chat_id) == str(ADMIN_ID):
                    target_user_id = data.split(":",1)[1]
                    admin_reply_state[str(ADMIN_ID)] = target_user_id
                    await bot_send_message(chat_id, f"✅ Режим ответа включен для пользователя {target_user_id}\n\nОтправьте сообщение, которое хотите передать пользователю.\n\nДля отмены отправьте: /cancel")
            
            # ========== END ESSENTIAL CALLBACKS ==========
            

            elif data.startswith("select_user:"):
                if str(chat_id) == str(ADMIN_ID):
                    profile_id = int(data.split(":")[1])
                    user = (await db.execute(select(User).where(User.profile_id == profile_id))).scalars().first()
                    if user:
                        verify_status = "✅" if user.is_verified else "❌"
                        premium_status = "⭐" if user.is_premium else "❌"
                        block_status = "🚫" if user.is_blocked else "✅"
                        
                        msg = f"👤 <b>Пользователь #{profile_id}</b>\n\n"
                        msg += f"Username: @{user.username or 'N/A'}\n"
                        msg += f"💰 Баланс: {user.balance_usdt:.2f} USDT\n"
                        msg += f"Верификация: {verify_status}\n"
                        msg += f"Premium: {premium_status}\n"
                        msg += f"Статус: {block_status}\n"
                        if user.is_blocked and user.block_reason:
                            msg += f"Причина блокировки: {user.block_reason}\n"
                        msg += f"\nВыберите действие:"
                        
                        block_btn_text = "✅ Разблокировать" if user.is_blocked else "🚫 Заблокировать"
                        buttons = [
                            [{"text": "💰 Баланс", "callback_data": f"manage:balance:{profile_id}"}],
                            [{"text": "✅ Верификация", "callback_data": f"manage:verify:{profile_id}"}],
                            [{"text": "⭐ Premium", "callback_data": f"manage:premium:{profile_id}"}],
                            [{"text": block_btn_text, "callback_data": f"manage:block:{profile_id}"}],
                            [{"text": "🔙 Назад", "callback_data": "adm:users:page:1"}]
                        ]
                        await bot_send_message(chat_id, msg, buttons, parse_mode="HTML")
                    else:
                        await bot_send_message(chat_id, f"❌ Пользователь #{profile_id} не найден")
            
            # ========== USER MENU CALLBACKS ==========
            # User: Show balance
            elif data == "user:balance":
                user = (await db.execute(select(User).where(User.telegram_id==str(chat_id)))).scalars().first()
                if user:
                    reg_date = user.created_at.strftime('%d.%m.%Y') if user.created_at else "Неизвестно"
                    text = f"""💰 <b>Ваш баланс</b>

💵 Баланс: <b>{user.balance_usdt:.2f} USDT</b>
🆔 Profile ID: #{user.profile_id}
📅 Регистрация: {reg_date}

Откройте приложение для пополнения или вывода средств 👇"""
                    buttons = [
                        [{"text": "🔙 Назад", "callback_data": "user:menu"}]
                    ]
                else:
                    text = "❌ Профиль не найден. Нажмите /start для регистрации."
                    buttons = []
                await bot_send_message(chat_id, text, buttons, parse_mode="HTML")
            
            # User: Show referral info
            elif data == "user:referral":
                user = (await db.execute(select(User).where(User.telegram_id==str(chat_id)))).scalars().first()
                if user:
                    ref_link = f"https://t.me/KrakenEdgebot?start={user.referral_code}"
                    lang = user.language if user.language else "ru"
                    ref_count = user.referral_count or 0
                    ref_earnings = user.referral_earnings or 0
                    
                    if lang == "en":
                        text = f"""👥 <b>Referral Program</b>

🔗 Your link:
<code>{ref_link}</code>

📊 <b>Statistics:</b>
👥 Invited: {ref_count}
💰 Earned: {ref_earnings:.2f} USDT

💡 Invite friends and get <b>5%</b> from their first deposit!"""
                        copy_btn = "📋 Copy link"
                        back_btn = "🔙 Back"
                    else:
                        text = f"""👥 <b>Реферальная программа</b>

🔗 Ваша ссылка:
<code>{ref_link}</code>

📊 <b>Статистика:</b>
👥 Приглашено: {ref_count}
💰 Заработано: {ref_earnings:.2f} USDT

💡 Приглашайте друзей и получайте <b>5%</b> с их первого депозита!"""
                        copy_btn = "📋 Скопировать ссылку"
                        back_btn = "🔙 Назад"
                    
                    buttons = [
                        [{"text": copy_btn, "callback_data": f"user:copy_ref:{user.referral_code}"}],
                        [{"text": back_btn, "callback_data": "user:menu"}]
                    ]
                else:
                    text = "❌ Профиль не найден. Нажмите /start для регистрации."
                    buttons = []
                await bot_send_message(chat_id, text, buttons, parse_mode="HTML")
            
            # User: Show support info
            elif data == "user:support":
                user = (await db.execute(select(User).where(User.telegram_id==str(chat_id)))).scalars().first()
                lang = user.language if user else "ru"
                if lang == "en":
                    text = """💬 <b>Customer Support</b>

You can contact support directly in the app!

1️⃣ Open the app
2️⃣ Look for the "Chat" button in the bottom right corner
3️⃣ Write your question

We'll respond as quickly as possible! ⚡"""
                else:
                    text = """💬 <b>Служба поддержки</b>

Вы можете связаться с поддержкой прямо в приложении!

1️⃣ Откройте приложение
2️⃣ Найдите кнопку «Чат» в правом нижнем углу
3️⃣ Напишите ваш вопрос

Мы ответим как можно быстрее! ⚡"""
                buttons = [
                    [{"text": "🔙 Назад", "callback_data": "user:menu"}]
                ]
                await bot_send_message(chat_id, text, buttons, parse_mode="HTML")
            
            # User: Show transaction history
            elif data == "user:history":
                user = (await db.execute(select(User).where(User.telegram_id==str(chat_id)))).scalars().first()
                if user:
                    transactions = (await db.execute(
                        select(Transaction).where(Transaction.user_id == user.id).order_by(Transaction.created_at.desc()).limit(5)
                    )).scalars().all()
                    
                    if transactions:
                        text = "📊 <b>Последние транзакции:</b>\n\n"
                        for tx in transactions:
                            emoji = "📥" if tx.type == "deposit" else "📤" if tx.type == "withdrawal" else "🔄"
                            status_emoji = "✅" if tx.status == "done" else "⏳"
                            text += f"{emoji} {tx.type.capitalize()}: {abs(tx.amount):.2f} {tx.currency} {status_emoji}\n"
                            text += f"   📅 {tx.created_at.strftime('%d.%m.%Y %H:%M')}\n\n"
                    else:
                        text = "📊 <b>История транзакций</b>\n\nУ вас пока нет транзакций."
                    
                    buttons = [
                        [{"text": "🔙 Назад", "callback_data": "user:menu"}]
                    ]
                else:
                    text = "❌ Профиль не найден. Нажмите /start для регистрации."
                    buttons = []
                await bot_send_message(chat_id, text, buttons, parse_mode="HTML")
            
            # User: Back to main menu
            elif data == "user:menu":
                user = (await db.execute(select(User).where(User.telegram_id==str(chat_id)))).scalars().first()
                buttons = [
                    [{"text": "💰 Мой баланс", "callback_data": "user:balance"}, {"text": "👥 Пригласить друга", "callback_data": "user:referral"}],
                    [{"text": "💬 Поддержка", "callback_data": "user:support"}, {"text": "📊 История", "callback_data": "user:history"}]
                ]
                await bot_send_message(chat_id, "🐙 <b>Главное меню Kraken</b>\n\nВыберите действие:", buttons, parse_mode="HTML")
            
            # ========== CHECK ACTIVATION CALLBACKS ==========
            
            # Check: Activate check from bot
            elif data.startswith("check:activate:"):
                check_code = data.split(":")[2]
                user = (await db.execute(select(User).where(User.telegram_id==str(chat_id)))).scalars().first()
                
                if not user:
                    await bot_send_message(chat_id, "❌ Пользователь не найден", parse_mode="HTML")
                    return {"ok": True}
                
                check = (await db.execute(select(Check).where(Check.check_code == check_code))).scalars().first()
                
                if not check:
                    await bot_send_message(chat_id, "❌ Чек не найден", parse_mode="HTML")
                    return {"ok": True}
                
                if check.status != "active":
                    await bot_send_message(chat_id, "❌ Чек уже активирован или истёк", parse_mode="HTML")
                    return {"ok": True}
                
                if check.expires_at and datetime.utcnow() > check.expires_at:
                    check.status = "expired"
                    await db.commit()
                    await bot_send_message(chat_id, "❌ Срок действия чека истёк", parse_mode="HTML")
                    return {"ok": True}
                
                if check.creator_id == user.id:
                    await bot_send_message(chat_id, "❌ Вы не можете активировать свой собственный чек", parse_mode="HTML")
                    return {"ok": True}
                
                # Activate the check
                check.status = "activated"
                check.activated_by = user.id
                check.activated_at = datetime.utcnow()
                
                # Credit USDT to user
                user.balance_usdt = (user.balance_usdt or 0) + check.amount_usdt
                
                # Record transaction
                db.add(Transaction(
                    user_id=user.id,
                    type="check_activate",
                    amount=check.amount_usdt,
                    currency="USDT",
                    status="done",
                    details={"check_code": check_code, "creator_id": check.creator_id}
                ))
                
                await db.commit()
                
                # Notify user
                success_text = f"""✅ <b>Чек активирован!</b>

💰 Получено: <b>{check.amount_usdt:.2f} USDT</b>
📊 Новый баланс: <b>{user.balance_usdt:.2f} USDT</b>"""
                
                await bot_send_message(chat_id, success_text, parse_mode="HTML")
                
                # Notify admin
                try:
                    await bot_send_message(
                        int(ADMIN_ID),
                        f"✅ <b>Чек активирован!</b>\n\n💰 Сумма: {check.amount_usdt} USDT\n👤 Активировал: #{user.profile_id}\n🔑 Код: <code>{check_code}</code>",
                        parse_mode="HTML"
                    )
                except: pass
            
            # Check: Cancel
            elif data == "check:cancel":
                await bot_send_message(chat_id, "❌ Активация чека отменена", parse_mode="HTML")
            
            # ========== END USER MENU CALLBACKS ==========
            
            # Return OK after processing callback
            return {"ok": True}

        # Handle regular messages from admin
        elif "message" in update:
            msg = update["message"]
            chat_id = msg.get("chat", {}).get("id")
            text = msg.get("text", "")
            
            # ========== ADMIN FSM STATE HANDLER ==========
            if str(chat_id) == str(ADMIN_ID) and str(chat_id) in admin_states and text and not text.startswith("/"):
                state = admin_states[str(chat_id)]
                state_type = state.get("state", "")
                
                if state_type == "awaiting_message":
                    profile_id = state.get("user_id")
                    admin_states[str(chat_id)]["data"] = {"message": text}
                    
                    msg_text = f"💬 <b>Подтверждение отправки</b>\n\n👤 Получатель: #{profile_id}\n\n📝 <b>Текст:</b>\n{text}\n\nОтправить сообщение?"
                    buttons = [
                        [{"text": "✅ Отправить", "callback_data": f"adm:user:msg:send:{profile_id}"}],
                        [{"text": "❌ Отмена", "callback_data": f"adm:user:open:{profile_id}"}]
                    ]
                    await bot_send_message(chat_id, msg_text, buttons, parse_mode="HTML")
                    return {"ok": True}

            # ========== END ADMIN FSM STATE HANDLER ==========

            # Handle /start command - Main menu for admin or welcome for users
            if text.startswith("/start"):
                # Extract parameter if present (format: /start PARAM)
                start_param = None
                if " " in text:
                    start_param = text.split(" ", 1)[1].strip()
                
                username = msg.get("from", {}).get("username")
                user = (await db.execute(select(User).where(User.telegram_id==str(chat_id)))).scalars().first()
                if not user:
                    user = await get_or_create_user(db, str(chat_id), username, "ru", start_param if start_param and not start_param.startswith("check_") else None)
                
                # Handle check activation: /start check_<token>
                if start_param and start_param.startswith("check_"):
                    check_code = start_param[6:]  # Remove "check_" prefix
                    
                    # Find the check
                    check = (await db.execute(select(Check).where(Check.check_code == check_code))).scalars().first()
                    
                    if not check:
                        await bot_send_message(chat_id, "❌ Чек не найден", parse_mode="HTML")
                        return {"ok": True}
                    
                    if check.status != "active":
                        await bot_send_message(chat_id, "❌ Чек уже активирован или истёк", parse_mode="HTML")
                        return {"ok": True}
                    
                    if check.expires_at and datetime.utcnow() > check.expires_at:
                        check.status = "expired"
                        await db.commit()
                        await bot_send_message(chat_id, "❌ Срок действия чека истёк", parse_mode="HTML")
                        return {"ok": True}
                    
                    if check.creator_id == user.id:
                        await bot_send_message(chat_id, "❌ Вы не можете активировать свой собственный чек", parse_mode="HTML")
                        return {"ok": True}
                    
                    # Show check info with activation button
                    check_text = f"""🎁 <b>Подарочный чек</b>

💰 Сумма: <b>{check.amount_usdt:.2f} USDT</b>

Нажмите кнопку ниже, чтобы получить средства на свой баланс."""
                    
                    buttons = [
                        [{"text": "✅ Активировать чек", "callback_data": f"check:activate:{check_code}"}],
                        [{"text": "❌ Отмена", "callback_data": "check:cancel"}]
                    ]
                    await bot_send_message(chat_id, check_text, buttons, parse_mode="HTML")
                    return {"ok": True}
                
                # Regular start - referral or welcome
                if user.referred_by and start_param and not start_param.startswith("check_"):
                    welcome_text = """🐙 <b>Добро пожаловать в Kraken!</b>

🎁 Вы пришли по приглашению друга!

Торгуй криптовалютой быстро и безопасно.
Используй кнопки ниже для навигации 👇"""
                else:
                    welcome_text = """🐙 <b>Добро пожаловать в Kraken!</b>

Торгуй криптовалютой быстро и безопасно.

Используй кнопки ниже для навигации 👇"""
                
                # Reply keyboard (persistent buttons under input field)
                reply_kb = [
                    [{"text": "💰 Баланс"}, {"text": "👥 Рефералы"}],
                    [{"text": "💬 Поддержка"}, {"text": "📊 История"}],
                    [{"text": "📈 Курсы"}, {"text": "ℹ️ О боте"}]
                ]
                await bot_send_message(chat_id, welcome_text, reply_keyboard=reply_kb, parse_mode="HTML")
                return {"ok": True}

            # Handle /menu command - User main menu (same as /start but without referral check)
            elif text == "/menu":
                user = (await db.execute(select(User).where(User.telegram_id==str(chat_id)))).scalars().first()
                if not user:
                    username = msg.get("from", {}).get("username")
                    user = await get_or_create_user(db, str(chat_id), username, "ru")
                
                # Reply keyboard (persistent buttons under input field) - same for all users
                reply_kb = [
                    [{"text": "💰 Баланс"}, {"text": "👥 Рефералы"}],
                    [{"text": "💬 Поддержка"}, {"text": "📊 История"}],
                    [{"text": "📈 Курсы"}, {"text": "ℹ️ О боте"}]
                ]
                await bot_send_message(chat_id, "🐙 <b>Главное меню Kraken</b>\n\nВыберите действие:", reply_keyboard=reply_kb, parse_mode="HTML")
                return {"ok": True}
            
            # Handle reply keyboard button presses
            elif text == "💰 Баланс":
                user = (await db.execute(select(User).where(User.telegram_id==str(chat_id)))).scalars().first()
                if user:
                    reg_date = user.created_at.strftime('%d.%m.%Y') if user.created_at else "Неизвестно"
                    msg_text = f"""💰 <b>Ваш баланс</b>

💵 Баланс: <b>{user.balance_usdt:.2f} USDT</b>
🆔 Profile ID: #{user.profile_id}
📅 Регистрация: {reg_date}

Откройте приложение для пополнения или вывода средств 👇"""
                else:
                    msg_text = "❌ Профиль не найден. Нажмите /start для регистрации."
                await bot_send_message(chat_id, msg_text, parse_mode="HTML")
                return {"ok": True}
            
            elif text == "👥 Рефералы":
                user = (await db.execute(select(User).where(User.telegram_id==str(chat_id)))).scalars().first()
                if user:
                    ref_link = f"https://t.me/KrakenEdgebot?start={user.referral_code}"
                    lang = user.language if user.language else "ru"
                    ref_count = user.referral_count or 0
                    ref_earnings = user.referral_earnings or 0
                    
                    if lang == "en":
                        msg_text = f"""👥 <b>Referral Program</b>

🔗 Your link:
<code>{ref_link}</code>

📊 <b>Statistics:</b>
👥 Invited: {ref_count}
💰 Earned: {ref_earnings:.2f} USDT

💡 Invite friends and get <b>5%</b> from their first deposit!"""
                    else:
                        msg_text = f"""👥 <b>Реферальная программа</b>

🔗 Ваша ссылка:
<code>{ref_link}</code>

📊 <b>Статистика:</b>
👥 Приглашено: {ref_count}
💰 Заработано: {ref_earnings:.2f} USDT

💡 Приглашайте друзей и получайте <b>5%</b> с их первого депозита!"""
                else:
                    msg_text = "❌ Профиль не найден. Нажмите /start для регистрации."
                await bot_send_message(chat_id, msg_text, parse_mode="HTML")
                return {"ok": True}
            
            elif text == "💬 Поддержка":
                user = (await db.execute(select(User).where(User.telegram_id==str(chat_id)))).scalars().first()
                lang = user.language if user else "ru"
                if lang == "en":
                    msg_text = """💬 <b>Customer Support</b>

You can contact support directly in the app!

1️⃣ Open the app
2️⃣ Look for the "Chat" button in the bottom right corner
3️⃣ Write your question

We'll respond as quickly as possible! ⚡"""
                else:
                    msg_text = """💬 <b>Служба поддержки</b>

Вы можете связаться с поддержкой прямо в приложении!

1️⃣ Откройте приложение
2️⃣ Найдите кнопку «Чат» в правом нижнем углу
3️⃣ Напишите ваш вопрос

Мы ответим как можно быстрее! ⚡"""
                await bot_send_message(chat_id, msg_text, parse_mode="HTML")
                return {"ok": True}
            
            elif text == "📊 История":
                user = (await db.execute(select(User).where(User.telegram_id==str(chat_id)))).scalars().first()
                if user:
                    lang = user.language if user.language else "ru"
                    txns = (await db.execute(
                        select(Transaction).where(Transaction.user_id==user.id).order_by(Transaction.created_at.desc()).limit(10)
                    )).scalars().all()
                    
                    if txns:
                        if lang == "en":
                            lines = ["📊 <b>Transaction History</b> (last 10)\n"]
                            for t in txns:
                                date = t.created_at.strftime('%d.%m') if t.created_at else "?"
                                lines.append(f"• {date}: {t.type} {t.amount:.2f} {t.currency} — {t.status}")
                        else:
                            lines = ["📊 <b>История транзакций</b> (последние 10)\n"]
                            for t in txns:
                                date = t.created_at.strftime('%d.%m') if t.created_at else "?"
                                lines.append(f"• {date}: {t.type} {t.amount:.2f} {t.currency} — {t.status}")
                        msg_text = "\n".join(lines)
                    else:
                        msg_text = "📊 История пуста" if lang == "ru" else "📊 No transactions yet"
                else:
                    msg_text = "❌ Профиль не найден. Нажмите /start для регистрации."
                await bot_send_message(chat_id, msg_text, parse_mode="HTML")
                return {"ok": True}
            
            # Handle "📈 Курсы" button - Show current crypto prices
            elif text == "📈 Курсы":
                try:
                    prices_text = "📈 <b>Текущие курсы криптовалют</b>\n\n"
                    symbols = ["BTC", "ETH", "TON", "SOL", "BNB", "XRP", "DOGE", "LTC", "TRX"]
                    
                    async with aiohttp.ClientSession() as session:
                        for sym in symbols:
                            try:
                                url = f"https://www.okx.com/api/v5/market/ticker?instId={sym}-USDT"
                                async with session.get(url, timeout=aiohttp.ClientTimeout(total=5)) as resp:
                                    if resp.status == 200:
                                        data = await resp.json()
                                        if data.get("data"):
                                            price = float(data["data"][0].get("last", 0))
                                            change = float(data["data"][0].get("changeUtc24h", 0)) * 100
                                            arrow = "🟢" if change >= 0 else "🔴"
                                            prices_text += f"{arrow} <b>{sym}</b>: ${price:,.2f} ({change:+.2f}%)\n"
                            except:
                                continue
                    
                    prices_text += "\n<i>Данные: OKX</i>"
                    await bot_send_message(chat_id, prices_text, parse_mode="HTML")
                except Exception as e:
                    await bot_send_message(chat_id, "❌ Ошибка загрузки курсов. Попробуйте позже.")
                return {"ok": True}
            
            # Handle "ℹ️ О боте" button - Show bot info
            elif text == "ℹ️ О боте":
                about_text = """🐙 <b>Kraken — торговая платформа</b>

<b>Возможности:</b>
• 💰 Пополнение через CryptoBot (USDT)
• 📊 Трейдинг криптовалют
• 💱 Обмен валют по курсу OKX
• 👥 Реферальная программа (5% бонус)
• 💸 Вывод на карту

<b>Поддерживаемые криптовалюты:</b>
BTC, ETH, TON, SOL, BNB, XRP, DOGE, LTC, TRX, USDT

<b>Техподдержка:</b>
Нажмите кнопку "💬 Поддержка" для связи с оператором.

<i>© 2025 Kraken Trading</i>"""
                await bot_send_message(chat_id, about_text, parse_mode="HTML")
                return {"ok": True}

            # Handle /check_create command - Create a gift check (deducts from creator's balance)
            elif text.startswith("/check_create "):
                try:
                    amount = float(text.split()[1])
                    if amount < 1:
                        await bot_send_message(chat_id, "❌ Минимальная сумма чека: 1 USDT")
                        return {"ok": True}
                    
                    # Get creator user
                    creator = (await db.execute(select(User).where(User.telegram_id == str(chat_id)))).scalars().first()
                    if not creator:
                        await bot_send_message(chat_id, "❌ Пользователь не найден")
                        return {"ok": True}
                    
                    # Check if user is premium or admin
                    if not creator.is_premium and str(chat_id) != str(ADMIN_ID):
                        await bot_send_message(chat_id, "❌ Создание чеков доступно только Premium пользователям")
                        return {"ok": True}
                    
                    # Check total balance (real + virtual)
                    real_bal = creator.balance_usdt or 0
                    virtual_bal = creator.virtual_balance or 0
                    total_bal = real_bal + virtual_bal
                    
                    if total_bal < amount:
                        await bot_send_message(chat_id, f"❌ Недостаточно средств.\n\n💰 Ваш баланс: {total_bal:.2f} USDT\n📝 Нужно: {amount:.2f} USDT")
                        return {"ok": True}
                    
                    import secrets
                    check_code = secrets.token_urlsafe(8)
                    
                    expires = datetime.utcnow() + timedelta(hours=24)
                    
                    # Deduct from balance (virtual first, then real)
                    amount_to_deduct = amount
                    deducted_from_virtual = min(virtual_bal, amount_to_deduct)
                    creator.virtual_balance = virtual_bal - deducted_from_virtual
                    amount_to_deduct -= deducted_from_virtual
                    
                    if amount_to_deduct > 0:
                        creator.balance_usdt = real_bal - amount_to_deduct
                    
                    new_check = Check(
                        creator_id=creator.id,
                        amount_usdt=amount,
                        check_code=check_code,
                        status="active",
                        expires_at=expires
                    )
                    db.add(new_check)
                    
                    # Record transaction
                    db.add(Transaction(
                        user_id=creator.id,
                        type="check_create",
                        amount=-amount,
                        currency="USDT",
                        status="done",
                        details={"check_code": check_code}
                    ))
                    
                    await db.commit()
                    
                    bot_link = f"https://t.me/KrakenEdgebot?start=check_{check_code}"
                    
                    new_total = (creator.balance_usdt or 0) + (creator.virtual_balance or 0)
                    msg = f"🎫 <b>Чек создан!</b>\n\n"
                    msg += f"💰 Сумма: <b>{amount:.2f} USDT</b>\n"
                    msg += f"💵 Списано с баланса\n"
                    msg += f"📊 Остаток: <b>{new_total:.2f} USDT</b>\n"
                    msg += f"⏰ Действует: 24 часа\n\n"
                    msg += f"🔗 Ссылка для активации:\n<code>{bot_link}</code>\n\n"
                    msg += f"Отправьте эту ссылку получателю."
                    
                    await bot_send_message(chat_id, msg, parse_mode="HTML")
                except ValueError:
                    await bot_send_message(chat_id, "❌ Использование: /check_create СУММА\n\nПример: /check_create 10")
                except Exception as e:
                    await bot_send_message(chat_id, f"❌ Ошибка: {str(e)}")
                return {"ok": True}

            # Check if this is admin replying to a user
            elif str(chat_id) == str(ADMIN_ID) and str(ADMIN_ID) in admin_reply_state:
                if text == "/cancel":
                    del admin_reply_state[str(ADMIN_ID)]
                    await bot_send_message(chat_id, "❌ Режим ответа отменен")
                else:
                    target_user_id = admin_reply_state[str(ADMIN_ID)]
                    # Find user by telegram_id
                    user = (await db.execute(select(User).where(User.telegram_id == target_user_id))).scalars().first()
                    if user:
                        # Save admin message to database
                        admin_msg = SupportMessage(user_id=user.id, sender="admin", text=text, file_path=None)
                        db.add(admin_msg)
                        await db.commit()
                        
                        # Send notification to user via Telegram with button to open app
                        try:
                            notification_text = (
                                "💬 <b>Новое сообщение от администрации!</b>\n\n"
                                "📱 Зайдите в чат поддержки в приложении, чтобы прочитать сообщение."
                            )
                            # Button to open Mini App
                            open_app_button = [[{
                                "text": "📱 Открыть чат поддержки",
                                "web_app": {"url": HOST_BASE}
                            }]]
                            await bot_send_message(int(target_user_id), notification_text, open_app_button, parse_mode="HTML")
                        except: pass
                        
                        # Confirm to admin
                        await bot_send_message(chat_id, f"✅ Сообщение отправлено пользователю {target_user_id}")
                        del admin_reply_state[str(ADMIN_ID)]
                    else:
                        await bot_send_message(chat_id, "❌ Пользователь не найден")
                        del admin_reply_state[str(ADMIN_ID)]
    except Exception as e:
        print(f"Webhook error: {e}")
    return {"ok":True}
app.include_router(router)
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)
