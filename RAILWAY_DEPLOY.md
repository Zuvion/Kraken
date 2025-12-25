# Kraken Exchange - Railway Deployment Guide

## Подготовка к деплою

### Файлы для загрузки на GitHub:
```
main.py
requirements.txt
railway.json
Procfile
.gitignore
static/
templates/
i18n/
```

### НЕ загружайте:
- `.replit`, `replit.nix`, `replit.md`
- `*.zip` архивы
- `.env` файлы

---

## Шаги деплоя на Railway

### 1. Подготовка GitHub репозитория

```bash
# Инициализируйте репозиторий (если нет)
git init
git add main.py requirements.txt railway.json Procfile .gitignore static/ templates/ i18n/
git commit -m "Initial Kraken Exchange for Railway"

# Создайте репозиторий на GitHub и подключите
git remote add origin https://github.com/YOUR_USERNAME/kraken-exchange.git
git push -u origin main
```

### 2. Создание проекта на Railway

1. Зайдите на [railway.app](https://railway.app)
2. Нажмите **"New Project"**
3. Выберите **"Deploy from GitHub repo"**
4. Авторизуйте GitHub и выберите репозиторий `kraken-exchange`

### 3. Добавление PostgreSQL

1. В проекте нажмите **"+ New"** → **"Database"** → **"PostgreSQL"**
2. Railway автоматически добавит `DATABASE_URL` в переменные окружения

### 4. Настройка переменных окружения

В настройках сервиса (Variables) добавьте:

| Переменная | Значение | Описание |
|------------|----------|----------|
| `BOT_TOKEN` | `123456:ABC...` | Токен от @BotFather |
| `ADMIN_ID` | `123456789` | Ваш Telegram ID |
| `CMC_API_KEY` | `abc123...` | Ключ CoinMarketCap |
| `CRYPTO_PAY_TOKEN` | `xyz789...` | Токен Crypto Pay |
| `HOST_BASE` | `https://your-app.up.railway.app` | URL вашего приложения |
| `MIN_DEPOSIT_USDT` | `50` | Минимальный депозит |

### 5. Деплой

Railway автоматически деплоит после каждого пуша в GitHub.

После деплоя получите URL вашего приложения:
- Нажмите на сервис → **Settings** → **Domains**
- Скопируйте URL (например: `https://kraken-production.up.railway.app`)

### 6. Настройка Telegram Mini App

1. Откройте @BotFather в Telegram
2. Отправьте `/mybots` → выберите бота
3. **Bot Settings** → **Menu Button** → **Configure Menu Button**
4. Введите URL вашего Railway приложения

---

## Проверка работы

1. Откройте бота в Telegram
2. Нажмите кнопку Menu — должно открыться Mini App
3. Проверьте вкладки: Активы, Торговля, Рефералы

---

## Переменные окружения Railway

Railway автоматически предоставляет:
- `PORT` — порт для сервера (обычно 3000 или динамический)
- `DATABASE_URL` — строка подключения PostgreSQL
- `RAILWAY_ENVIRONMENT` — текущее окружение
- `RAILWAY_STATIC_URL` — публичный URL приложения

---

## Troubleshooting

### Ошибка подключения к БД
- Убедитесь что PostgreSQL добавлен в проект
- Проверьте что `DATABASE_URL` виден в Variables

### Mini App не открывается
- Проверьте что URL правильный (с https://)
- Убедитесь что сервер запущен (проверьте логи в Railway)

### 502/503 ошибки
- Проверьте логи деплоя в Railway
- Убедитесь что все переменные окружения установлены

---

## Полезные команды

```bash
# Локальный тест перед деплоем
export DATABASE_URL="sqlite+aiosqlite:///./test.db"
export BOT_TOKEN="your_token"
export ADMIN_ID="your_id"
uvicorn main:app --host 0.0.0.0 --port 5000
```
