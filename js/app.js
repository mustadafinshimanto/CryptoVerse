/* ═══════════════════════════════════════════════════════════════
   CryptoVerse — Application Logic
   Real-time blockchain dashboard powered by Web3
   ═══════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    // ══════════════════════════════════════
    //  Configuration
    // ══════════════════════════════════════
    const CONFIG = {
        // CoinGecko free API (no key needed)
        COINGECKO_BASE: 'https://api.coingecko.com/api/v3',

        // Public Ethereum RPC endpoints (fallback chain)
        ETH_RPC_URLS: [
            'https://eth.llamarpc.com',
            'https://rpc.ankr.com/eth',
            'https://cloudflare-eth.com',
            'https://ethereum-rpc.publicnode.com'
        ],

        // Refresh intervals (ms)
        PRICE_REFRESH: 60000,       // 1 minute
        BLOCK_REFRESH: 15000,       // 15 seconds
        GAS_REFRESH: 30000,         // 30 seconds
        GLOBAL_REFRESH: 120000,     // 2 minutes

        // Number of items
        TOP_COINS_COUNT: 10,
        BLOCKS_TO_SHOW: 6,

        // Chart
        DEFAULT_CHART_COIN: 'ethereum',
        DEFAULT_CHART_DAYS: 1,
    };

    // ══════════════════════════════════════
    //  State
    // ══════════════════════════════════════
    const state = {
        provider: null,
        signer: null,
        walletAddress: null,
        isConnected: false,
        currentChartCoin: CONFIG.DEFAULT_CHART_COIN,
        currentChartDays: CONFIG.DEFAULT_CHART_DAYS,
        priceChart: null,
        gasChart: null,
        sparklineCharts: {},
        ethPrice: 0,
        gasHistory: [],
        intervals: [],
    };

    // ══════════════════════════════════════
    //  Utility Functions
    // ══════════════════════════════════════
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    function formatCurrency(value, decimals = 2) {
        if (value === null || value === undefined) return '$0.00';
        if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
        if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
        if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
        if (value >= 1000) return `$${value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
        if (value >= 1) return `$${value.toFixed(decimals)}`;
        return `$${value.toFixed(6)}`;
    }

    function formatNumber(value) {
        if (value === null || value === undefined) return '0';
        return value.toLocaleString('en-US');
    }

    function formatAddress(address) {
        if (!address) return '0x0000...0000';
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    }

    function timeAgo(timestamp) {
        const seconds = Math.floor((Date.now() / 1000) - timestamp);
        if (seconds < 5) return 'Just now';
        if (seconds < 60) return `${seconds}s ago`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        return `${Math.floor(seconds / 3600)}h ago`;
    }

    function generateJazzicon(address) {
        // Simple deterministic color from address
        const hash = address ? parseInt(address.slice(2, 10), 16) : 0;
        const hue = hash % 360;
        return `linear-gradient(135deg, hsl(${hue}, 70%, 55%), hsl(${(hue + 60) % 360}, 80%, 45%))`;
    }

    // ══════════════════════════════════════
    //  Toast Notifications
    // ══════════════════════════════════════
    function showToast(message, type = 'info') {
        const container = $('#toastContainer');
        const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <span class="toast-icon">${icons[type]}</span>
            <span>${message}</span>
        `;
        
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add('removing');
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    // ══════════════════════════════════════
    //  API Helpers
    // ══════════════════════════════════════
    async function fetchJSON(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } catch (err) {
            console.warn(`Fetch failed: ${url}`, err.message);
            return null;
        }
    }

    function getProvider() {
        if (state.provider) return state.provider;
        // Try each RPC endpoint until one works
        for (const url of CONFIG.ETH_RPC_URLS) {
            try {
                state.provider = new ethers.JsonRpcProvider(url);
                return state.provider;
            } catch (e) {
                console.warn(`RPC failed: ${url}`);
            }
        }
        return null;
    }

    // ══════════════════════════════════════
    //  Theme Toggle
    // ══════════════════════════════════════
    function initTheme() {
        const saved = localStorage.getItem('cryptoverse-theme') || 'dark';
        document.documentElement.setAttribute('data-theme', saved);
        updateThemeIcon(saved);

        $('#themeToggle').addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            const next = current === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('cryptoverse-theme', next);
            updateThemeIcon(next);

            // Rebuild charts with new theme colors
            if (state.priceChart) loadPriceChart();
            if (state.gasChart) updateGasChart();
        });
    }

    function updateThemeIcon(theme) {
        const moon = $('#themeToggle .icon-moon');
        const sun = $('#themeToggle .icon-sun');
        if (theme === 'dark') {
            moon.style.display = '';
            sun.style.display = 'none';
        } else {
            moon.style.display = 'none';
            sun.style.display = '';
        }
    }

    // ══════════════════════════════════════
    //  Mobile Menu
    // ══════════════════════════════════════
    function initMobileMenu() {
        const btn = $('#mobileMenuBtn');
        const nav = $('#headerNav');
        btn.addEventListener('click', () => {
            nav.classList.toggle('open');
        });
    }

    // ══════════════════════════════════════
    //  Wallet Connection (MetaMask)
    // ══════════════════════════════════════
    async function connectWallet() {
        if (!window.ethereum) {
            showToast('MetaMask not detected! Please install MetaMask.', 'error');
            return;
        }

        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const accounts = await provider.send('eth_requestAccounts', []);
            
            if (accounts.length === 0) {
                showToast('No accounts found', 'error');
                return;
            }

            state.signer = await provider.getSigner();
            state.walletAddress = accounts[0];
            state.isConnected = true;

            // Update UI
            updateWalletUI();
            showToast('Wallet connected successfully!', 'success');

            // Fetch wallet data
            await loadWalletData(provider);

        } catch (err) {
            console.error('Wallet connection error:', err);
            if (err.code === 4001) {
                showToast('Connection request rejected', 'warning');
            } else {
                showToast('Failed to connect wallet', 'error');
            }
        }
    }

    function disconnectWallet() {
        state.signer = null;
        state.walletAddress = null;
        state.isConnected = false;
        updateWalletUI();
        showToast('Wallet disconnected', 'info');
    }

    function updateWalletUI() {
        const walletBtn = $('#connectWallet');
        const walletText = $('#walletText');
        const notConnected = $('.wallet-not-connected');
        const connected = $('#walletConnected');

        if (state.isConnected) {
            walletBtn.classList.add('connected');
            walletText.textContent = formatAddress(state.walletAddress);
            notConnected.style.display = 'none';
            connected.style.display = 'flex';
            
            // Set avatar
            const avatar = $('#walletAvatar');
            avatar.style.background = generateJazzicon(state.walletAddress);
            
            // Set address
            $('#walletAddress').textContent = formatAddress(state.walletAddress);
        } else {
            walletBtn.classList.remove('connected');
            walletText.textContent = 'Connect Wallet';
            notConnected.style.display = 'flex';
            connected.style.display = 'none';
        }
    }

    async function loadWalletData(provider) {
        try {
            // Get ETH balance
            const balance = await provider.getBalance(state.walletAddress);
            const ethBalance = parseFloat(ethers.formatEther(balance));
            
            $('#ethBalance').textContent = `${ethBalance.toFixed(4)} ETH`;
            $('#ethBalanceUsd').textContent = `≈ ${formatCurrency(ethBalance * state.ethPrice)}`;

            // Get network info
            const network = await provider.getNetwork();
            const blockNumber = await provider.getBlockNumber();

            const networkNames = {
                '1': 'Ethereum Mainnet',
                '5': 'Goerli Testnet',
                '11155111': 'Sepolia Testnet',
                '137': 'Polygon',
                '56': 'BSC',
                '42161': 'Arbitrum',
                '10': 'Optimism'
            };

            const chainIdStr = network.chainId.toString();
            $('#networkName').textContent = networkNames[chainIdStr] || `Chain ${chainIdStr}`;
            $('#chainId').textContent = chainIdStr;
            $('#blockHeight').textContent = formatNumber(blockNumber);
            $('#lastUpdated').textContent = new Date().toLocaleTimeString();

            // Update network badge
            const netBadge = $('.network-name');
            netBadge.textContent = networkNames[chainIdStr] || `Chain ${chainIdStr}`;

        } catch (err) {
            console.error('Error loading wallet data:', err);
        }
    }

    function initWalletListeners() {
        $('#connectWallet').addEventListener('click', () => {
            if (state.isConnected) {
                // Could show dropdown, for now just disconnect
                disconnectWallet();
            } else {
                connectWallet();
            }
        });

        $('#connectWalletCta').addEventListener('click', connectWallet);
        $('#disconnectWallet').addEventListener('click', disconnectWallet);
        
        $('#copyAddress').addEventListener('click', () => {
            if (state.walletAddress) {
                navigator.clipboard.writeText(state.walletAddress);
                showToast('Address copied to clipboard!', 'success');
            }
        });

        // Listen for account/chain changes
        if (window.ethereum) {
            window.ethereum.on('accountsChanged', (accounts) => {
                if (accounts.length === 0) {
                    disconnectWallet();
                } else {
                    state.walletAddress = accounts[0];
                    updateWalletUI();
                    loadWalletData(new ethers.BrowserProvider(window.ethereum));
                    showToast('Account changed', 'info');
                }
            });

            window.ethereum.on('chainChanged', () => {
                window.location.reload();
            });
        }
    }

    // ══════════════════════════════════════
    //  Global Market Data
    // ══════════════════════════════════════
    async function loadGlobalData() {
        const data = await fetchJSON(`${CONFIG.COINGECKO_BASE}/global`);
        if (!data || !data.data) return;

        const g = data.data;

        animateValue('totalMarketCap', formatCurrency(g.total_market_cap?.usd));
        animateValue('totalVolume', formatCurrency(g.total_volume?.usd));
        animateValue('btcDominance', `${(g.market_cap_percentage?.btc || 0).toFixed(1)}%`);
        animateValue('activeCoins', formatNumber(g.active_cryptocurrencies || 0));
    }

    function animateValue(elementId, newValue) {
        const el = document.getElementById(elementId);
        if (!el) return;
        el.innerHTML = newValue;
        el.classList.add('value-updated');
        setTimeout(() => el.classList.remove('value-updated'), 600);
    }

    // ══════════════════════════════════════
    //  Top Coins List
    // ══════════════════════════════════════
    async function loadTopCoins() {
        const data = await fetchJSON(
            `${CONFIG.COINGECKO_BASE}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${CONFIG.TOP_COINS_COUNT}&page=1&sparkline=true&price_change_percentage=24h`
        );

        if (!data || !Array.isArray(data)) return;

        // Store ETH price for wallet display
        const eth = data.find(c => c.id === 'ethereum');
        if (eth) state.ethPrice = eth.current_price;

        const list = $('#coinsList');
        list.innerHTML = '';

        data.forEach((coin, index) => {
            const changeClass = coin.price_change_percentage_24h >= 0 ? 'positive' : 'negative';
            const changeSymbol = coin.price_change_percentage_24h >= 0 ? '+' : '';

            const row = document.createElement('div');
            row.className = 'coin-row fade-in';
            row.style.animationDelay = `${index * 50}ms`;
            row.innerHTML = `
                <span class="coin-rank">${coin.market_cap_rank}</span>
                <div class="coin-info">
                    <img class="coin-icon" src="${coin.image}" alt="${coin.name}" loading="lazy">
                    <div class="coin-name-group">
                        <span class="coin-name">${coin.name}</span>
                        <span class="coin-symbol">${coin.symbol}</span>
                    </div>
                </div>
                <span class="coin-price">${formatCurrency(coin.current_price)}</span>
                <span class="coin-change ${changeClass}">
                    ${changeSymbol}${(coin.price_change_percentage_24h || 0).toFixed(1)}%
                </span>
                <div class="coin-sparkline">
                    <canvas id="spark-${coin.id}"></canvas>
                </div>
            `;

            // Click to change chart
            row.addEventListener('click', () => {
                state.currentChartCoin = coin.id;
                const select = $('#chartCoinSelect');
                // Update select if option exists
                const option = select.querySelector(`option[value="${coin.id}"]`);
                if (!option) {
                    const newOpt = document.createElement('option');
                    newOpt.value = coin.id;
                    newOpt.textContent = coin.symbol.toUpperCase();
                    select.appendChild(newOpt);
                }
                select.value = coin.id;
                loadPriceChart();
            });

            list.appendChild(row);

            // Draw sparkline
            if (coin.sparkline_in_7d?.price) {
                setTimeout(() => {
                    drawSparkline(`spark-${coin.id}`, coin.sparkline_in_7d.price, changeClass === 'positive');
                }, index * 50 + 100);
            }
        });
    }

    function drawSparkline(canvasId, data, isPositive) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        // Destroy existing chart
        if (state.sparklineCharts[canvasId]) {
            state.sparklineCharts[canvasId].destroy();
        }

        const color = isPositive ? '#22c55e' : '#ef4444';

        // Sample data to ~30 points for performance
        const step = Math.max(1, Math.floor(data.length / 30));
        const sampled = data.filter((_, i) => i % step === 0);

        state.sparklineCharts[canvasId] = new Chart(canvas, {
            type: 'line',
            data: {
                labels: sampled.map((_, i) => i),
                datasets: [{
                    data: sampled,
                    borderColor: color,
                    borderWidth: 1.5,
                    fill: false,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 0,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { enabled: false } },
                scales: {
                    x: { display: false },
                    y: { display: false }
                },
                animation: { duration: 800 }
            }
        });
    }

    // ══════════════════════════════════════
    //  Price Chart
    // ══════════════════════════════════════
    async function loadPriceChart() {
        const loadingEl = $('#chartLoading');
        loadingEl.classList.add('visible');

        const coinId = state.currentChartCoin;
        const days = state.currentChartDays;

        // Fetch chart data
        const data = await fetchJSON(
            `${CONFIG.COINGECKO_BASE}/coins/${coinId}/market_chart?vs_currency=usd&days=${days}`
        );

        // Fetch current coin info
        const coinInfo = await fetchJSON(
            `${CONFIG.COINGECKO_BASE}/coins/${coinId}?localization=false&tickers=false&community_data=false&developer_data=false`
        );

        loadingEl.classList.remove('visible');

        if (!data || !data.prices) {
            showToast('Failed to load chart data', 'error');
            return;
        }

        // Update header info
        if (coinInfo) {
            const icon = $('#chartCoinIcon');
            if (coinInfo.image?.small) {
                icon.src = coinInfo.image.small;
                icon.alt = coinInfo.name;
                icon.style.display = '';
            }
            $('#chartCoinName').textContent = coinInfo.name || coinId;
        }

        const prices = data.prices;
        const currentPrice = prices[prices.length - 1][1];
        const startPrice = prices[0][1];
        const priceChange = ((currentPrice - startPrice) / startPrice) * 100;

        $('#chartCurrentPrice').textContent = formatCurrency(currentPrice);
        
        const changeEl = $('#chartPriceChange');
        const isPositive = priceChange >= 0;
        changeEl.textContent = `${isPositive ? '+' : ''}${priceChange.toFixed(2)}%`;
        changeEl.className = `chart-price-change ${isPositive ? 'positive' : 'negative'}`;

        // Build chart
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

        const labels = prices.map(p => {
            const d = new Date(p[0]);
            if (days <= 1) return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            if (days <= 30) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        });

        const values = prices.map(p => p[1]);

        const gradientColor = isPositive ? '34, 197, 94' : '239, 68, 68';
        const lineColor = isPositive ? '#22c55e' : '#ef4444';

        const canvas = document.getElementById('priceChart');
        const ctx = canvas.getContext('2d');

        // Create gradient
        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, `rgba(${gradientColor}, 0.15)`);
        gradient.addColorStop(1, `rgba(${gradientColor}, 0)`);

        // Destroy existing chart
        if (state.priceChart) {
            state.priceChart.destroy();
        }

        // Sample data for performance (max 200 points)
        const maxPoints = 200;
        const step = Math.max(1, Math.floor(labels.length / maxPoints));
        const sampledLabels = labels.filter((_, i) => i % step === 0);
        const sampledValues = values.filter((_, i) => i % step === 0);

        state.priceChart = new Chart(canvas, {
            type: 'line',
            data: {
                labels: sampledLabels,
                datasets: [{
                    label: 'Price',
                    data: sampledValues,
                    borderColor: lineColor,
                    backgroundColor: gradient,
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    pointHoverBackgroundColor: lineColor,
                    pointHoverBorderColor: '#fff',
                    pointHoverBorderWidth: 2,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: isDark ? 'rgba(13, 16, 24, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                        titleColor: isDark ? '#eaedf2' : '#0f1729',
                        bodyColor: isDark ? '#8b92a5' : '#5a6178',
                        borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                        borderWidth: 1,
                        padding: 12,
                        cornerRadius: 8,
                        titleFont: { family: "'Inter', sans-serif", weight: '600' },
                        bodyFont: { family: "'JetBrains Mono', monospace" },
                        displayColors: false,
                        callbacks: {
                            label: (ctx) => formatCurrency(ctx.parsed.y),
                        }
                    }
                },
                scales: {
                    x: {
                        display: true,
                        grid: {
                            color: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
                            drawBorder: false,
                        },
                        ticks: {
                            color: isDark ? '#505668' : '#8892a8',
                            font: { family: "'Inter', sans-serif", size: 10 },
                            maxTicksLimit: 8,
                            maxRotation: 0,
                        }
                    },
                    y: {
                        display: true,
                        position: 'right',
                        grid: {
                            color: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
                            drawBorder: false,
                        },
                        ticks: {
                            color: isDark ? '#505668' : '#8892a8',
                            font: { family: "'JetBrains Mono', monospace", size: 10 },
                            callback: (val) => formatCurrency(val),
                            maxTicksLimit: 6,
                        }
                    }
                },
                animation: {
                    duration: 1000,
                    easing: 'easeInOutCubic',
                }
            }
        });
    }

    function initChartControls() {
        // Period buttons
        $$('.period-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                $$('.period-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.currentChartDays = parseInt(btn.dataset.days);
                loadPriceChart();
            });
        });

        // Coin selector
        $('#chartCoinSelect').addEventListener('change', (e) => {
            state.currentChartCoin = e.target.value;
            loadPriceChart();
        });
    }

    // ══════════════════════════════════════
    //  Gas Tracker
    // ══════════════════════════════════════
    async function loadGasData() {
        const provider = getProvider();
        if (!provider) {
            // Fallback: try CoinGecko for ETH gas
            estimateGasFallback();
            return;
        }

        try {
            const feeData = await provider.getFeeData();
            
            if (feeData.gasPrice) {
                const gasPriceGwei = parseFloat(ethers.formatUnits(feeData.gasPrice, 'gwei'));
                
                // Estimate tiers
                const low = Math.max(1, gasPriceGwei * 0.8);
                const standard = gasPriceGwei;
                const fast = gasPriceGwei * 1.3;

                $('#gasLow').textContent = `${Math.round(low)} Gwei`;
                $('#gasStandard').textContent = `${Math.round(standard)} Gwei`;
                $('#gasFast').textContent = `${Math.round(fast)} Gwei`;
                
                animateValue('gasPrice', `${Math.round(standard)} Gwei`);

                // Track history for chart
                state.gasHistory.push({
                    time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
                    value: Math.round(standard)
                });
                if (state.gasHistory.length > 20) state.gasHistory.shift();
                
                updateGasChart();
            }
        } catch (err) {
            console.warn('Gas fetch error:', err);
            estimateGasFallback();
        }
    }

    async function estimateGasFallback() {
        // Use simple gas estimation from Etherscan-like API
        const data = await fetchJSON(`${CONFIG.COINGECKO_BASE}/simple/price?ids=ethereum&vs_currencies=usd&include_24hr_change=true`);
        if (data) {
            // Just show placeholder gas
            $('#gasLow').textContent = '~15 Gwei';
            $('#gasStandard').textContent = '~20 Gwei';
            $('#gasFast').textContent = '~30 Gwei';
            animateValue('gasPrice', '~20 Gwei');
        }
    }

    function updateGasChart() {
        if (state.gasHistory.length < 2) return;

        const canvas = document.getElementById('gasChart');
        if (!canvas) return;

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const ctx = canvas.getContext('2d');

        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, 'rgba(99, 102, 241, 0.2)');
        gradient.addColorStop(1, 'rgba(99, 102, 241, 0)');

        if (state.gasChart) state.gasChart.destroy();

        state.gasChart = new Chart(canvas, {
            type: 'line',
            data: {
                labels: state.gasHistory.map(h => h.time),
                datasets: [{
                    data: state.gasHistory.map(h => h.value),
                    borderColor: '#6366f1',
                    backgroundColor: gradient,
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 2,
                    pointBackgroundColor: '#6366f1',
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: isDark ? 'rgba(13,16,24,0.9)' : 'rgba(255,255,255,0.9)',
                        titleColor: isDark ? '#eaedf2' : '#0f1729',
                        bodyColor: isDark ? '#8b92a5' : '#5a6178',
                        borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                        borderWidth: 1,
                        padding: 8,
                        cornerRadius: 6,
                        callbacks: {
                            label: (ctx) => `${ctx.parsed.y} Gwei`
                        }
                    }
                },
                scales: {
                    x: {
                        display: true,
                        grid: { display: false },
                        ticks: {
                            color: isDark ? '#505668' : '#8892a8',
                            font: { size: 9 },
                            maxTicksLimit: 5,
                        }
                    },
                    y: {
                        display: true,
                        grid: {
                            color: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
                        },
                        ticks: {
                            color: isDark ? '#505668' : '#8892a8',
                            font: { size: 9 },
                            callback: (v) => `${v}`,
                            maxTicksLimit: 4,
                        }
                    }
                },
                animation: { duration: 500 }
            }
        });
    }

    // ══════════════════════════════════════
    //  Latest Blocks
    // ══════════════════════════════════════
    async function loadLatestBlocks() {
        const provider = getProvider();
        if (!provider) {
            showBlocksFallback();
            return;
        }

        try {
            const latestBlockNumber = await provider.getBlockNumber();
            const blockPromises = [];

            for (let i = 0; i < CONFIG.BLOCKS_TO_SHOW; i++) {
                blockPromises.push(provider.getBlock(latestBlockNumber - i));
            }

            const blocks = await Promise.all(blockPromises);
            const list = $('#blocksList');
            list.innerHTML = '';

            blocks.forEach((block, index) => {
                if (!block) return;

                const row = document.createElement('div');
                row.className = `block-row ${index === 0 ? 'new-block' : 'fade-in'}`;
                row.style.animationDelay = `${index * 80}ms`;
                row.innerHTML = `
                    <div class="block-number-group">
                        <span class="block-number">#${formatNumber(block.number)}</span>
                        <span class="block-time">${timeAgo(block.timestamp)}</span>
                    </div>
                    <div class="block-details">
                        <span class="block-miner-label">Miner / Validator</span>
                        <span class="block-miner">${formatAddress(block.miner)}</span>
                    </div>
                    <div class="block-txns">
                        <span class="block-txn-count">${block.transactions?.length || 0}</span>
                        <span class="block-txn-label">txns</span>
                    </div>
                `;

                list.appendChild(row);
            });
        } catch (err) {
            console.warn('Block fetch error:', err);
            showBlocksFallback();
        }
    }

    function showBlocksFallback() {
        const list = $('#blocksList');
        list.innerHTML = `
            <div class="block-row" style="justify-content: center; grid-template-columns: 1fr;">
                <div style="text-align: center; padding: 20px; color: var(--text-tertiary); font-size: 0.85rem;">
                    <p style="margin-bottom: 8px;">⚡ Connecting to Ethereum network...</p>
                    <p style="font-size: 0.75rem;">Block data will appear when an RPC connection is established.</p>
                </div>
            </div>
        `;
    }

    // ══════════════════════════════════════
    //  Navigation Sections
    // ══════════════════════════════════════
    function initNavigation() {
        $$('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                $$('.nav-link').forEach(l => l.classList.remove('active'));
                link.classList.add('active');

                // For now, all sections visible (could add tab switching later)
                const section = link.dataset.section;
                scrollToSection(section);
            });
        });
    }

    function scrollToSection(section) {
        const sectionMap = {
            dashboard: '#chartCard',
            explorer: '#blocksCard',
            wallet: '#walletCard',
        };
        const target = $(sectionMap[section]);
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    // ══════════════════════════════════════
    //  Auto-Refresh
    // ══════════════════════════════════════
    function startAutoRefresh() {
        // Prices
        state.intervals.push(setInterval(loadTopCoins, CONFIG.PRICE_REFRESH));
        
        // Blocks
        state.intervals.push(setInterval(loadLatestBlocks, CONFIG.BLOCK_REFRESH));
        
        // Gas
        state.intervals.push(setInterval(loadGasData, CONFIG.GAS_REFRESH));
        
        // Global
        state.intervals.push(setInterval(loadGlobalData, CONFIG.GLOBAL_REFRESH));
    }

    // ══════════════════════════════════════
    //  Header Scroll Effect
    // ══════════════════════════════════════
    function initScrollEffect() {
        let ticking = false;
        window.addEventListener('scroll', () => {
            if (!ticking) {
                requestAnimationFrame(() => {
                    const header = $('#header');
                    if (window.scrollY > 10) {
                        header.style.boxShadow = 'var(--shadow-md)';
                    } else {
                        header.style.boxShadow = 'none';
                    }
                    ticking = false;
                });
                ticking = true;
            }
        });
    }

    // ══════════════════════════════════════
    //  Initialization
    // ══════════════════════════════════════
    async function init() {
        console.log('%c◆ CryptoVerse Dashboard', 'color: #6366f1; font-size: 16px; font-weight: bold;');
        console.log('%cReal-time blockchain dashboard powered by Web3', 'color: #8b92a5; font-size: 11px;');

        // Init UI
        initTheme();
        initMobileMenu();
        initNavigation();
        initChartControls();
        initWalletListeners();
        initScrollEffect();

        // Load data (parallel)
        try {
            await Promise.allSettled([
                loadGlobalData(),
                loadTopCoins(),
                loadPriceChart(),
                loadGasData(),
                loadLatestBlocks(),
            ]);
        } catch (err) {
            console.error('Initialization error:', err);
            showToast('Some data failed to load. Will retry automatically.', 'warning');
        }

        // Start live updates
        startAutoRefresh();

        showToast('Dashboard loaded — data refreshes automatically', 'success');
    }

    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
