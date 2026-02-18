# Kraken Exchange - Telegram Mini App

## Overview
Kraken is a Telegram Mini App — a cryptocurrency trading and wallet management platform. Users can manage crypto wallets, deposit/withdraw USDT, exchange cryptocurrencies, trade binary options, invite friends via referral program, and access customer support — all within Telegram.

## User Preferences
- Всегда пиши на русском
- Подробные объяснения
- Итеративная разработка
- Спрашивай перед крупными изменениями

## Project Structure
```
main.py              — Backend (FastAPI, все API, бот, торговля)
templates/base.html  — HTML шаблон
static/js/app.js     — Frontend (Vanilla JS + Telegram WebApp SDK)
static/css/style.css  — Стили (Binance-style dark theme)
static/img/           — Логотипы и иконки
static/uploads/       — Пользовательские файлы (поддержка)
i18n/translations.json — Переводы (RU/EN)
requirements.txt      — Python зависимости
railway.json          — Конфиг деплоя Railway
.env.example          — Пример переменных окружения
```

## Tech Stack
- **Backend**: FastAPI (Python), PostgreSQL (async SQLAlchemy)
- **Frontend**: Vanilla JavaScript, Telegram WebApp SDK, TradingView Lightweight Charts
- **APIs**: OKX (цены/свечи), Crypto Pay (депозиты), CoinMarketCap (курсы фиат), Telegram Bot API

## Environment Variables
- `BOT_TOKEN` — Telegram Bot Token
- `ADMIN_ID` — Telegram ID администратора
- `CMC_API_KEY` — CoinMarketCap API ключ
- `CRYPTO_PAY_TOKEN` — Crypto Pay API токен
- `DATABASE_URL` — PostgreSQL connection string

## Key Features
- **Кошелёк**: 10 криптовалют, реальные цены OKX, индивидуальные балансы
- **Депозиты**: USDT через Crypto Pay, комиссия 0%
- **Вывод**: USDT на банковские карты (RUB/BYN/UAH), комиссия 0%
- **Обмен**: Обмен крипто по курсам OKX, комиссия 2%
- **Торговля**: Бинарные опционы 30с-30м, реальные цены, 70% выплата (на virtual_balance)
- **Рефералы**: 5% бонус от первого депозита приглашённого
- **Поддержка**: Чат с админом в реальном времени
- **Админ-панель**: Веб-панель (Dashboard, Пользователи, Выводы, Рассылка, Логи)
- **Lucky Mode**: Принудительные выигрыши по-пользовательски
- **Подарочные чеки**: Создание чеков через /check_create

## Business Logic
- **Балансы**: `balance_usdt` (реальные деньги), `virtual_balance` (игровые выигрыши). Пользователь видит сумму.
- **Сделки**: Результат только win/loss (нет draw). Равенство цен = loss. Выигрыш → virtual_balance.
- **Комиссии**: Депозит 0%, Вывод 0%, Обмен 2%, Торговля 2%.

## UI Theme
Binance-style: #0B0E11 (фон), #F0B90B (акцент), #1E2329 (карточки), #0ECB81 (рост), #F6465D (падение)

## Chart Markers
- Активные сделки: стрелка ▲/▼ на свече входа + горизонтальная пунктирная линия цены
- Закрытые сделки: кружки WIN/LOSS с цветовым кодированием
- Привязка маркеров к свечам через snapToCandle (UTC timezone fix)

## Recent Changes (February 2026)
- Удалён результат "push" (ничья) — теперь только win/loss
- Добавлены метки сделок на график (маркеры + price lines)
- Исправлена привязка меток по времени (UTC fix)
- Lucky Mode: принудительные выигрыши с лимитами
- Убраны все комиссии на депозит и вывод (0%)
