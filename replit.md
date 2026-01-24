# Kraken - Telegram Mini App

## Overview
Kraken is a Telegram Mini App serving as a comprehensive cryptocurrency trading and wallet management platform. It allows users to manage crypto wallets, perform deposits/withdrawals, exchange cryptocurrencies, engage in fair binary options-style trading, invite friends via referral program, and access customer support, all within Telegram. The project aims to deliver a user-friendly, feature-rich crypto platform emphasizing accessibility and a transparent business model.

## User Preferences
I prefer detailed explanations.
I want iterative development.
Ask before making major changes.
Do not make changes to the folder `Z`.
Do not make changes to the file `Y`.

## System Architecture

### UI/UX Decisions
The application features a **Binance-style professional dark theme** with colors: main background #0B0E11, accent gold #F0B90B, card backgrounds #1E2329, white text #EAECEF, muted text #848E9C, green #0ECB81 for gains, red #F6465D for losses. 

**Enhanced UI Features (January 2026):**
- **PnL Indicators**: Main screen shows today's P/L, total P/L, and active trades count with clickable alert
- **Crypto Cards**: 24h change with visual arrows (↑↓), colored borders, click-to-trade navigation
- **Trading Screen**: Parameters block (amount input, timer buttons 30s-30m, potential profit preview), timer countdown on BUY/SELL buttons, entry price marker on chart
- **Trades List**: 3 tabs (Active/Closed/All), progress bar timers for active trades, exchange-style formatting
- **Psychology Features**: WIN/LOSS toast notifications with sounds, calculation delay effect with spinner
- **Animations**: Count-up balance animation, skeleton loading, enhanced button hovers with glow effects
- **Crypto Bot Avatar**: Official avatar in deposit section

Trading charts are rendered by **TradingView Lightweight Charts** with OKX data and **timeframe buttons** (1m, 5m, 15m, 30m, 1h, 4h, 1d). The support chat is a full-screen interface with file upload and keyboard shortcuts. The design emphasizes usability with rounded elements (6px radius), professional typography, and smooth transitions.

### Technical Implementations
The backend is built with FastAPI (Python), using PostgreSQL for production and SQLite for local development. Core data models include User, Transaction, Withdrawal, Trade, and SupportMessage. The frontend uses Vanilla JavaScript integrated with the Telegram WebApp SDK. Internationalization supports Russian and English. Environment variables manage configuration. The system operates as a **FAIR trading platform**, with trade outcomes determined by real price movements from the OKX API, ensuring no manipulation.

### Feature Specifications
- **Wallet Management**: Supports 10 cryptocurrencies (BTC, ETH, TON, SOL, BNB, XRP, DOGE, LTC, TRX, USDT) with **individual balances for each crypto**. Each currency card shows logo, current price, balance, and USDT equivalent. Cards with balance are highlighted. Real-time prices from OKX API via /api/prices endpoint.
- **Deposits**: USDT deposits are processed via Crypto Pay with a 2.5% fee.
- **Withdrawals**: Users withdraw USDT to bank cards in rubles. The system converts USDT to RUB using the current USD/RUB exchange rate. Funds are automatically transferred to admin's Crypto Bot wallet via Crypto Pay API transfer method before admin processes bank card payment. Minimum withdrawal is 10 USDT, with a 10% fee. Card numbers are not stored; only the last 4 digits are kept for reference. Withdrawals are visible in transaction history.
- **Exchange**: Real-time cryptocurrency exchange using OKX rates, with a 2% embedded fee. Features robust retry logic (3 attempts with exponential backoff), slippage protection (rejects if price moves >2% from quote), and race condition prevention through price revalidation before execution.
- **Trading**: Honest binary options-style trading on 15+ pairs with configurable durations (30s to 30m). Users predict "Купить" (UP) or "Продать" (DOWN). Trade outcomes are determined by **REAL price movements** from the OKX API. A 70% payout applies to winning trades.
- **Referral Program**: Users receive a unique 8-character referral code and link (t.me/BotName?start=CODE). When a referred user makes their first deposit, the referrer receives 5% bonus. The system tracks referral count, earnings, and displays invited friends list. Referral bonus is paid only once per referred user.
- **Support System**: Real-time in-app chat with admin, supporting text and photo messages, with admin notifications in Telegram.
- **Telegram Bot Admin Panel**: Includes user management, balance management, and secure withdrawal management with ephemeral display of sensitive data for admins and automatic user notifications. It also features an admin messaging system with dual delivery channels (in-app or Telegram bot) and interactive button menus for common commands.

### System Design Choices
The system leverages the OKX API for real-time market data. Built with FastAPI and PostgreSQL, it is designed for scalability. Modularity is achieved through clear separation of frontend, backend, and static assets. Security practices include secure data handling via environment variables, access controls, and a strict policy of not storing sensitive PII like full card numbers in the database, instead using SHA-256 hashes and ephemeral display in admin notifications. All fees are transparent.

## External Dependencies
- **Telegram Bot API**: Used for user notifications, admin interactions, and webhook handling.
- **OKX API**: Provides real-time cryptocurrency prices, candlestick data, and exchange rates.
- **CoinMarketCap API**: Used for RUB/USDT conversion for withdrawal calculations.
- **Crypto Pay API**: Facilitates USDT deposit processing and automated withdrawal transfers.
- **TradingView Widgets**: Provides professional charting for real-time Binance charts.