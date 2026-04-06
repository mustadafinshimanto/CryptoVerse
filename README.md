<p align="center">
  <img src="banner.png" alt="CryptoVerse Banner" width="100%">
</p>

<h1 align="center">◆ CryptoVerse</h1>

<p align="center">
  <b>A Full-Stack, Real-Time Blockchain Dashboard</b><br>
  <i>✨ Vibe Coded with Node.js · Express · Ethers.js · WebSocket · Chart.js ✨</i>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/Express-4.x-000000?style=for-the-badge&logo=express&logoColor=white" alt="Express">
  <img src="https://img.shields.io/badge/Ethers.js-6.x-3C3C3D?style=for-the-badge&logo=ethereum&logoColor=white" alt="Ethers.js">
  <img src="https://img.shields.io/badge/WebSocket-Live-6366f1?style=for-the-badge&logo=websocket&logoColor=white" alt="WebSocket">
  <img src="https://img.shields.io/badge/Vibe_Coded-🎵_AI_Powered-ff69b4?style=for-the-badge" alt="Vibe Coded">
  <img src="https://img.shields.io/badge/license-MIT-blue?style=for-the-badge" alt="License">
</p>

---

<p align="center">
  <img src="screenshot.png" alt="CryptoVerse Dashboard Screenshot" width="90%" style="border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,0.3);">
</p>

---

## 🚀 Overview

**CryptoVerse** is a production-grade, full-stack Web3 dashboard **vibe coded** from concept to deployment — turning creative ideas into a working blockchain application through AI-powered pair programming. It features a Node.js backend powering 15+ REST API endpoints and a WebSocket server for real-time block streaming, whale alerts, and gas tracking — all consumed by a premium, single-page frontend application.

This project demonstrates deep blockchain engineering skills, including:

- **Server-side blockchain interaction** via Ethers.js multi-chain providers
- **Transaction decoding** (ERC-20, Uniswap V2, NFT operations)
- **Address analysis** (EOA vs Smart Contract detection, ENS resolution)
- **Real-time data streaming** via WebSocket (new blocks, whale alerts, gas updates)
- **Full-stack architecture** with caching, proxying, and error handling

---

## ✨ Features

### 🔗 Backend (Node.js + Express)

| Feature | Description |
|---|---|
| **Multi-Chain Support** | Ethereum, Polygon, BSC with automatic RPC failover |
| **Transaction Decoder** | Parses ERC-20 transfers, Uniswap swaps, NFT operations from raw calldata |
| **Address Analyzer** | Detects EOA vs Smart Contract, reads bytecode size, resolves ENS |
| **Token Scanner** | Checks 8 popular ERC-20 token balances for any address |
| **Gas Oracle** | EIP-1559 aware gas pricing with USD cost estimates |
| **Whale Monitor** | Real-time alerts for ETH transfers ≥ 10 ETH |
| **Market Proxy** | Server-side CoinGecko proxy with in-memory TTL caching |
| **Universal Search** | Search by address, tx hash, block number, or ENS name |
| **WebSocket Server** | Live streaming of blocks, gas updates, and whale alerts |

### 🎨 Frontend (Vanilla JS SPA)

| Page | Description |
|---|---|
| **📊 Dashboard** | Interactive price chart, top 10 coins with 7-day sparklines, gas oracle, live block feed |
| **🔍 Block Explorer** | Browse latest blocks with drill-down to individual block transactions |
| **🔬 TX Analyzer** | Paste any transaction hash → decoded method calls, arguments, event logs, gas costs |
| **🔎 Address Inspector** | Inspect any Ethereum address for balance, type, ENS, and ERC-20 tokens |
| **💼 Wallet** | Connect MetaMask to view balances, network info, and token holdings |

### 🎯 Design

- Premium dark/light theme with glassmorphism and animated gradient orbs
- Responsive layout (desktop → mobile)
- Skeleton loaders, micro-animations, and smooth page transitions
- Keyboard shortcuts (press `/` to focus search)
- Toast notification system

---

## 📁 Project Structure

```
CryptoVerse/
├── server.js              # Node.js backend (Express + WebSocket + Ethers.js)
├── package.json           # Dependencies and scripts
├── .env                   # Environment variables (gitignored)
├── .env.example           # Configuration template
├── .gitignore             # Git ignore rules
├── start.bat              # One-click Windows launcher
├── banner.png             # README banner
├── screenshot.png         # Dashboard screenshot
│
└── public/                # Static frontend (served by Express)
    ├── index.html         # Single-page application HTML
    ├── css/
    │   └── style.css      # Full design system (~700 lines)
    └── js/
        └── app.js         # Client-side application (~650 lines)
```

---

## ⚡ Quick Start

### Option 1: One-Click (Windows)

Simply double-click **`start.bat`** — it will:
1. Check Node.js is installed
2. Auto-install dependencies if missing
3. Create `.env` from template if needed
4. Start the server and open your browser

### Option 2: Manual

```bash
# 1. Clone the repo
git clone https://github.com/mustadafinshimanto/CryptoVerse.git
cd cryptoverse

# 2. Install dependencies
npm install

# 3. Configure environment (optional but recommended)
cp .env.example .env
# Edit .env and add your RPC API key

# 4. Start the server
npm start

# 5. Open in browser
# http://localhost:3000
```

---

## ⚙️ Configuration

Copy `.env.example` to `.env` and customize:

```env
# Server port
PORT=3000

# Ethereum RPC (get free keys from infura.io or alchemy.com)
# Using a private RPC key dramatically improves reliability
ETH_RPC_URL=https://mainnet.infura.io/v3/YOUR_KEY_HERE
POLYGON_RPC_URL=
BSC_RPC_URL=

# CoinGecko API key (optional, free tier works without)
COINGECKO_API_KEY=

# Minimum ETH value to trigger whale alerts
WHALE_THRESHOLD=10
```

> **💡 Tip:** Sign up for a free [Infura](https://infura.io/) or [Alchemy](https://www.alchemy.com/) account to get a private RPC URL. This eliminates rate-limiting from public endpoints and unlocks full functionality.

---

## 📡 API Reference

### Network

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/stats` | Block number, gas price, chain info |
| `GET` | `/api/chains` | List available chains |
| `POST` | `/api/chain` | Switch active chain |

### Blocks

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/blocks?count=10` | Latest N blocks |
| `GET` | `/api/block/:id` | Full block with transactions |

### Transactions

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/tx/:hash` | Decode and analyze transaction |

### Addresses

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/address/:addr` | Balance, type, ENS, nonce |
| `GET` | `/api/tokens/:addr` | Scan ERC-20 token balances |

### ENS

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/ens/resolve/:name` | ENS name → address |
| `GET` | `/api/ens/lookup/:addr` | Address → ENS name |

### Gas

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/gas` | Gas tiers, USD cost estimates |

### Market Data

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/market/global` | Total market cap, volume, BTC dominance |
| `GET` | `/api/market/coins?count=10` | Top coins with sparklines |
| `GET` | `/api/market/chart/:coinId?days=7` | Price history |
| `GET` | `/api/market/coin/:coinId` | Coin details |

### Search

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/search/:query` | Universal search (address, tx, block, ENS) |

### WebSocket (`ws://localhost:3000/ws`)

| Event | Payload | Description |
|---|---|---|
| `welcome` | `{ chain, message }` | Connection confirmed |
| `newBlock` | `{ number, hash, miner, transactionCount }` | New block mined |
| `whaleAlert` | `{ hash, from, to, value, symbol }` | Large transfer detected |
| `gasUpdate` | `{ gasPrice, baseFee }` | Gas price changed |

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Runtime** | Node.js | Server-side JavaScript |
| **Server** | Express.js | REST API framework |
| **Blockchain** | Ethers.js v6 | Multi-chain Ethereum interaction |
| **Real-time** | ws (WebSocket) | Live data streaming |
| **Cache** | Custom in-memory | TTL-based request caching |
| **Market Data** | CoinGecko API | Crypto prices and charts |
| **Charts** | Chart.js | Price visualization |
| **Wallet** | MetaMask / Web3 | Browser wallet integration |
| **Security** | dotenv | Environment variable management |
| **Styling** | Vanilla CSS | Custom glassmorphism design system |

---

## 🔒 Security

- API keys and RPC URLs stored in `.env` (gitignored)
- Server-side proxying prevents API key exposure to the frontend
- Input validation on all API endpoints
- Rate-limit-friendly caching reduces RPC calls

---

## 🎵 Vibe Coding

This project was **vibe coded** — built through creative collaboration with AI, turning high-level ideas and vibes into production-grade blockchain code. Instead of writing every line manually, the development process focused on:

- 🧠 **Ideation & Architecture** — Conceptualizing features and system design
- 🎨 **Design Direction** — Guiding the visual aesthetic and user experience
- ⚡ **Rapid Iteration** — Real-time feedback loops to shape the product
- 🔗 **Blockchain Integration** — Combining AI speed with Web3 domain expertise

Vibe coding represents a new paradigm in software development — where developers focus on **what** to build and **why**, while AI handles the **how**. The result? A full-stack blockchain dashboard built at 10x speed without sacrificing quality.

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  <b>🎵 Vibe Coded with ❤️ by <a href="https://github.com/mustadafinshimanto">Mustad Afin Shimanto</a></b><br>
  <i>Powered by AI · Built with Node.js · Express · Ethers.js · WebSocket · Chart.js</i>
</p>
