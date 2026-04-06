/* ═══════════════════════════════════════════════════════════════
   CryptoVerse v2 — Full-Stack Client Application
   Connects to Node.js backend API + WebSocket for real-time data
   ═══════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    // ══════════════════════════════════════
    //  Configuration
    // ══════════════════════════════════════
    const API_BASE = window.location.origin + '/api';
    const WS_URL = `ws://${window.location.host}/ws`;

    const REFRESH = {
        MARKET: 60000,
        GAS: 30000,
        GLOBAL: 120000,
    };

    // ══════════════════════════════════════
    //  State
    // ══════════════════════════════════════
    const state = {
        ws: null,
        wsConnected: false,
        currentPage: 'dashboard',
        walletAddress: null,
        isConnected: false,
        ethPrice: 0,
        priceChart: null,
        sparkCharts: {},
        chartCoin: 'ethereum',
        chartDays: 1,
        intervals: [],
    };

    // ══════════════════════════════════════
    //  Utilities
    // ══════════════════════════════════════
    const $ = (s) => document.querySelector(s);
    const $$ = (s) => document.querySelectorAll(s);

    function fmt$(v, d = 2) {
        if (v == null) return '$0.00';
        if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
        if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
        if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
        if (v >= 1) return `$${v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
        return `$${v.toFixed(6)}`;
    }

    function fmtNum(v) { return v != null ? v.toLocaleString('en-US') : '0'; }
    function fmtAddr(a) { return a ? `${a.slice(0, 6)}...${a.slice(-4)}` : '0x0000...0000'; }

    async function api(endpoint) {
        try {
            const r = await fetch(`${API_BASE}${endpoint}`);
            if (!r.ok) throw new Error(`API ${r.status}`);
            return await r.json();
        } catch (e) {
            console.warn('API error:', endpoint, e.message);
            return null;
        }
    }

    async function apiPost(endpoint, body) {
        try {
            const r = await fetch(`${API_BASE}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            return await r.json();
        } catch (e) {
            console.warn('API POST error:', e);
            return null;
        }
    }

    function toast(msg, type = 'info') {
        const container = $('#toastContainer');
        const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
        const t = document.createElement('div');
        t.className = `toast ${type}`;
        t.innerHTML = `<span>${icons[type]}</span><span>${msg}</span>`;
        container.appendChild(t);
        setTimeout(() => { t.classList.add('removing'); setTimeout(() => t.remove(), 300); }, 4000);
    }

    function animVal(id, val) {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = val;
        el.classList.add('value-updated');
        setTimeout(() => el.classList.remove('value-updated'), 600);
    }

    // ══════════════════════════════════════
    //  Theme
    // ══════════════════════════════════════
    function initTheme() {
        const saved = localStorage.getItem('cv-theme') || 'dark';
        document.documentElement.setAttribute('data-theme', saved);
        updateThemeIcon(saved);
        $('#themeToggle').addEventListener('click', () => {
            const c = document.documentElement.getAttribute('data-theme');
            const n = c === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', n);
            localStorage.setItem('cv-theme', n);
            updateThemeIcon(n);
        });
    }

    function updateThemeIcon(t) {
        $('.icon-moon').style.display = t === 'dark' ? '' : 'none';
        $('.icon-sun').style.display = t === 'dark' ? 'none' : '';
    }

    // ══════════════════════════════════════
    //  SPA Page Routing
    // ══════════════════════════════════════
    function initPages() {
        $$('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                navigateTo(link.dataset.page);
            });
        });

        // Logo click = dashboard
        $$('.logo').forEach(l => {
            l.addEventListener('click', (e) => {
                e.preventDefault();
                navigateTo('dashboard');
            });
        });
    }

    function navigateTo(page) {
        if (state.currentPage === page) return;
        state.currentPage = page;

        // Update nav
        $$('.nav-link').forEach(l => l.classList.toggle('active', l.dataset.page === page));

        // Show page
        $$('.page').forEach(p => p.classList.remove('active'));
        const target = $(`#page-${page}`);
        if (target) target.classList.add('active');

        // Close mobile menu
        $('#headerNav').classList.remove('open');

        // Load page data
        if (page === 'explorer') loadExplorerBlocks();
    }

    // ══════════════════════════════════════
    //  WebSocket
    // ══════════════════════════════════════
    function initWebSocket() {
        try {
            state.ws = new WebSocket(WS_URL);

            state.ws.onopen = () => {
                state.wsConnected = true;
                updateWsStatus(true);
                console.log('🔌 WebSocket connected');
            };

            state.ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    handleWsMessage(msg);
                } catch (e) {}
            };

            state.ws.onclose = () => {
                state.wsConnected = false;
                updateWsStatus(false);
                console.log('🔌 WebSocket disconnected, reconnecting in 5s...');
                setTimeout(initWebSocket, 5000);
            };

            state.ws.onerror = () => {
                state.wsConnected = false;
                updateWsStatus(false);
            };
        } catch (e) {
            console.warn('WebSocket init failed:', e);
            updateWsStatus(false);
        }
    }

    function updateWsStatus(connected) {
        const dot = $('.ws-dot');
        const label = $('.ws-label');
        const inlineDot = $('.ws-inline-dot');

        if (dot) {
            dot.classList.toggle('connected', connected);
            dot.classList.toggle('disconnected', !connected);
        }
        if (label) label.textContent = connected ? 'Live' : 'Offline';
        if (inlineDot) {
            inlineDot.classList.toggle('connected', connected);
            inlineDot.classList.toggle('disconnected', !connected);
        }
    }

    function handleWsMessage(msg) {
        switch (msg.type) {
            case 'welcome':
                toast(`Connected to ${msg.data.chain} WebSocket`, 'success');
                break;

            case 'newBlock':
                onNewBlock(msg.data);
                break;

            case 'whaleAlert':
                onWhaleAlert(msg.data);
                break;

            case 'gasUpdate':
                if (msg.data.gasPrice) {
                    animVal('statGas', `${msg.data.gasPrice} Gwei`);
                }
                break;
        }
    }

    function onNewBlock(block) {
        // Update stats bar
        animVal('statBlock', `#${fmtNum(block.number)}`);

        // Update blocks list on dashboard
        const list = $('#blocksList');
        if (!list) return;

        // Remove placeholder
        const placeholder = list.querySelector('.placeholder-message');
        if (placeholder) placeholder.remove();

        // Create block row
        const row = document.createElement('div');
        row.className = 'block-row new-block';
        row.innerHTML = `
            <div>
                <div class="block-number">#${fmtNum(block.number)}</div>
                <div class="block-time">Just now</div>
            </div>
            <div>
                <div class="block-miner-label">Validator</div>
                <div class="block-miner">${block.minerShort}</div>
            </div>
            <div style="text-align:right">
                <div class="block-txn-count">${block.transactionCount}</div>
                <div class="block-txn-label">txns</div>
            </div>
        `;

        list.prepend(row);

        // Keep max 15 blocks
        while (list.children.length > 15) {
            list.removeChild(list.lastChild);
        }
    }

    function onWhaleAlert(whale) {
        const ticker = $('#whaleTicker');
        const text = $('#whaleText');
        ticker.style.display = '';
        text.textContent = `🐋 Whale Alert: ${whale.value} ${whale.symbol} transferred | ${whale.fromShort} → ${whale.toShort}`;

        toast(`🐋 Whale: ${whale.value} ${whale.symbol} transferred!`, 'warning');

        // Hide after 15s
        setTimeout(() => { ticker.style.display = 'none'; }, 15000);
    }

    // ══════════════════════════════════════
    //  Chain Switch
    // ══════════════════════════════════════
    function initChainSwitch() {
        $('#chainSelect').addEventListener('change', async (e) => {
            const chain = e.target.value;
            await apiPost('/chain', { chain });
            toast(`Switched to ${e.target.options[e.target.selectedIndex].text.replace(/[🔷🟣🟡]\s*/,'')}`, 'info');
            loadDashboardData();
        });
    }

    // ══════════════════════════════════════
    //  Mobile Menu
    // ══════════════════════════════════════
    function initMobile() {
        $('#mobileMenuBtn').addEventListener('click', () => {
            $('#headerNav').classList.toggle('open');
        });
    }

    // ══════════════════════════════════════
    //  Search
    // ══════════════════════════════════════
    function initSearch() {
        const input = $('#searchInput');
        const dropdown = $('#searchDropdown');
        let searchTimeout;

        input.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            const q = input.value.trim();
            if (q.length < 3) { dropdown.classList.remove('visible'); return; }

            searchTimeout = setTimeout(async () => {
                const result = await api(`/search/${encodeURIComponent(q)}`);
                if (!result) { dropdown.classList.remove('visible'); return; }

                if (result.type === 'unknown') {
                    dropdown.innerHTML = '<div style="padding:12px;color:var(--text-tertiary);font-size:0.82rem">No results found</div>';
                } else {
                    const typeColors = { address: 'address', transaction: 'transaction', block: 'block', ens: 'ens' };
                    let label = '';
                    if (result.type === 'address') label = result.data.address;
                    if (result.type === 'transaction') label = result.data.hash;
                    if (result.type === 'block') label = `Block #${result.data.number}`;
                    if (result.type === 'ens') label = `${result.data.name} → ${fmtAddr(result.data.address)}`;

                    dropdown.innerHTML = `
                        <div class="search-result-item" data-type="${result.type}" data-value="${label}">
                            <span class="search-result-type ${typeColors[result.type]}">${result.type}</span>
                            <span style="font-size:0.82rem;font-family:var(--font-mono);overflow:hidden;text-overflow:ellipsis">${label}</span>
                        </div>
                    `;
                }
                dropdown.classList.add('visible');
            }, 400);
        });

        dropdown.addEventListener('click', (e) => {
            const item = e.target.closest('.search-result-item');
            if (!item) return;
            const type = item.dataset.type;
            dropdown.classList.remove('visible');
            input.value = '';

            if (type === 'address' || type === 'ens') {
                navigateTo('address');
                setTimeout(() => {
                    const val = type === 'ens' ? item.querySelector('span:last-child').textContent.split('→')[1]?.trim() || '' : item.dataset.value;
                    $('#addressInput').value = val;
                    inspectAddress();
                }, 100);
            } else if (type === 'transaction') {
                navigateTo('analyzer');
                setTimeout(() => {
                    $('#txHashInput').value = item.dataset.value;
                    analyzeTx();
                }, 100);
            } else if (type === 'block') {
                navigateTo('explorer');
                setTimeout(() => loadExplorerBlocks(), 100);
            }
        });

        // Close on outside click
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-container')) dropdown.classList.remove('visible');
        });

        // Keyboard shortcut
        document.addEventListener('keydown', (e) => {
            if (e.key === '/' && document.activeElement !== input) {
                e.preventDefault();
                input.focus();
            }
            if (e.key === 'Escape') {
                input.blur();
                dropdown.classList.remove('visible');
            }
        });
    }

    // ══════════════════════════════════════
    //  Dashboard — Global Stats
    // ══════════════════════════════════════
    async function loadGlobalData() {
        const data = await api('/market/global');
        if (!data) return;
        animVal('statMarketCap', fmt$(data.total_market_cap?.usd));
        animVal('statVolume', fmt$(data.total_volume?.usd));
        animVal('statBtcDom', `${(data.market_cap_percentage?.btc || 0).toFixed(1)}%`);
    }

    async function loadNetworkStats() {
        const data = await api('/stats');
        if (!data) return;
        animVal('statBlock', `#${fmtNum(data.blockNumber)}`);
        animVal('statGas', data.gasPrice ? `${data.gasPrice} Gwei` : '--');
    }

    // ══════════════════════════════════════
    //  Dashboard — Top Coins
    // ══════════════════════════════════════
    async function loadTopCoins() {
        const data = await api('/market/coins?count=10');
        if (!data || !Array.isArray(data)) return;

        const eth = data.find(c => c.id === 'ethereum');
        if (eth) state.ethPrice = eth.current_price;

        const list = $('#coinsList');
        list.innerHTML = '';

        data.forEach((coin, i) => {
            const pos = coin.price_change_percentage_24h >= 0;
            const row = document.createElement('div');
            row.className = 'coin-row fade-in';
            row.style.animationDelay = `${i * 40}ms`;
            row.innerHTML = `
                <span class="coin-rank">${coin.market_cap_rank}</span>
                <div class="coin-info">
                    <img class="coin-icon" src="${coin.image}" alt="${coin.name}" loading="lazy">
                    <div class="coin-name-group"><span class="coin-name">${coin.name}</span><span class="coin-symbol">${coin.symbol}</span></div>
                </div>
                <span class="coin-price mono">${fmt$(coin.current_price)}</span>
                <span class="coin-change ${pos ? 'positive' : 'negative'}">${pos ? '+' : ''}${(coin.price_change_percentage_24h || 0).toFixed(1)}%</span>
                <div class="coin-sparkline"><canvas id="spark-${coin.id}"></canvas></div>
            `;

            row.addEventListener('click', () => {
                state.chartCoin = coin.id;
                const sel = $('#chartCoinSelect');
                if (!sel.querySelector(`option[value="${coin.id}"]`)) {
                    const o = document.createElement('option');
                    o.value = coin.id;
                    o.textContent = coin.symbol.toUpperCase();
                    sel.appendChild(o);
                }
                sel.value = coin.id;
                loadPriceChart();
            });

            list.appendChild(row);

            if (coin.sparkline_in_7d?.price) {
                setTimeout(() => drawSparkline(`spark-${coin.id}`, coin.sparkline_in_7d.price, pos), i * 40 + 100);
            }
        });
    }

    function drawSparkline(id, data, positive) {
        const canvas = document.getElementById(id);
        if (!canvas) return;
        if (state.sparkCharts[id]) state.sparkCharts[id].destroy();
        const color = positive ? '#22c55e' : '#ef4444';
        const step = Math.max(1, Math.floor(data.length / 30));
        const sampled = data.filter((_, i) => i % step === 0);
        state.sparkCharts[id] = new Chart(canvas, {
            type: 'line',
            data: { labels: sampled.map((_, i) => i), datasets: [{ data: sampled, borderColor: color, borderWidth: 1.5, fill: false, tension: 0.4, pointRadius: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, scales: { x: { display: false }, y: { display: false } }, animation: { duration: 600 } }
        });
    }

    // ══════════════════════════════════════
    //  Dashboard — Price Chart
    // ══════════════════════════════════════
    async function loadPriceChart() {
        const loading = $('#chartLoading');
        loading.classList.add('visible');

        const [chartData, coinInfo] = await Promise.all([
            api(`/market/chart/${state.chartCoin}?days=${state.chartDays}`),
            api(`/market/coin/${state.chartCoin}`),
        ]);

        loading.classList.remove('visible');
        if (!chartData?.prices) return;

        if (coinInfo) {
            const icon = $('#chartCoinIcon');
            if (coinInfo.image?.small) { icon.src = coinInfo.image.small; icon.style.display = ''; }
            $('#chartCoinName').textContent = coinInfo.name || state.chartCoin;
        }

        const prices = chartData.prices;
        const cur = prices[prices.length - 1][1];
        const start = prices[0][1];
        const change = ((cur - start) / start) * 100;
        const pos = change >= 0;

        $('#chartPrice').textContent = fmt$(cur);
        const changeEl = $('#chartChange');
        changeEl.textContent = `${pos ? '+' : ''}${change.toFixed(2)}%`;
        changeEl.className = `chart-price-change ${pos ? 'positive' : 'negative'}`;

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const canvas = document.getElementById('priceChart');
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        const rgb = pos ? '34,197,94' : '239,68,68';
        gradient.addColorStop(0, `rgba(${rgb},0.15)`);
        gradient.addColorStop(1, `rgba(${rgb},0)`);
        const lineColor = pos ? '#22c55e' : '#ef4444';

        if (state.priceChart) state.priceChart.destroy();

        const maxPts = 200;
        const step = Math.max(1, Math.floor(prices.length / maxPts));
        const labels = prices.filter((_, i) => i % step === 0).map(p => {
            const d = new Date(p[0]);
            if (state.chartDays <= 1) return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            if (state.chartDays <= 30) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        });
        const values = prices.filter((_, i) => i % step === 0).map(p => p[1]);

        state.priceChart = new Chart(canvas, {
            type: 'line',
            data: { labels, datasets: [{ data: values, borderColor: lineColor, backgroundColor: gradient, borderWidth: 2, fill: true, tension: 0.4, pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: lineColor, pointHoverBorderColor: '#fff', pointHoverBorderWidth: 2 }] },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: { legend: { display: false }, tooltip: { backgroundColor: isDark ? 'rgba(13,16,24,0.95)' : 'rgba(255,255,255,0.95)', titleColor: isDark ? '#eaedf2' : '#0f1729', bodyColor: isDark ? '#8b92a5' : '#5a6178', borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', borderWidth: 1, padding: 10, cornerRadius: 8, displayColors: false, callbacks: { label: (c) => fmt$(c.parsed.y) } } },
                scales: {
                    x: { display: true, grid: { color: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }, ticks: { color: isDark ? '#505668' : '#8892a8', font: { size: 10 }, maxTicksLimit: 8, maxRotation: 0 } },
                    y: { display: true, position: 'right', grid: { color: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }, ticks: { color: isDark ? '#505668' : '#8892a8', font: { family: "'JetBrains Mono',monospace", size: 10 }, callback: v => fmt$(v), maxTicksLimit: 6 } }
                },
                animation: { duration: 800 }
            }
        });
    }

    function initChartControls() {
        $$('.period-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                $$('.period-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.chartDays = parseInt(btn.dataset.days);
                loadPriceChart();
            });
        });
        $('#chartCoinSelect').addEventListener('change', (e) => {
            state.chartCoin = e.target.value;
            loadPriceChart();
        });
    }

    // ══════════════════════════════════════
    //  Dashboard — Gas Oracle
    // ══════════════════════════════════════
    async function loadGasData() {
        const data = await api('/gas');
        if (!data) return;

        if (data.tiers) {
            $('#gasLow').textContent = `${data.tiers.low.gwei} Gwei`;
            $('#gasStandard').textContent = `${data.tiers.standard.gwei} Gwei`;
            $('#gasFast').textContent = `${data.tiers.fast.gwei} Gwei`;
            animVal('statGas', `${data.tiers.standard.gwei} Gwei`);
        }

        if (data.estimatedCosts) {
            $('#costTransfer').textContent = `$${data.estimatedCosts.ethTransfer.costUsd}`;
            $('#costErc20').textContent = `$${data.estimatedCosts.erc20Transfer.costUsd}`;
            $('#costSwap').textContent = `$${data.estimatedCosts.uniswapSwap.costUsd}`;
            $('#costMint').textContent = `$${data.estimatedCosts.nftMint.costUsd}`;
        }
    }

    // ══════════════════════════════════════
    //  Dashboard — Initial Blocks
    // ══════════════════════════════════════
    async function loadInitialBlocks() {
        const data = await api('/blocks?count=8');
        if (!data?.blocks) return;

        const list = $('#blocksList');
        list.innerHTML = '';

        data.blocks.forEach((block, i) => {
            const row = document.createElement('div');
            row.className = `block-row fade-in`;
            row.style.animationDelay = `${i * 60}ms`;
            row.innerHTML = `
                <div><div class="block-number">#${fmtNum(block.number)}</div><div class="block-time">${block.timeAgo}</div></div>
                <div><div class="block-miner-label">Validator</div><div class="block-miner">${block.minerShort}</div></div>
                <div style="text-align:right"><div class="block-txn-count">${block.transactionCount}</div><div class="block-txn-label">txns</div></div>
            `;
            list.appendChild(row);
        });
    }

    // ══════════════════════════════════════
    //  Explorer Page
    // ══════════════════════════════════════
    async function loadExplorerBlocks() {
        const data = await api('/blocks?count=20');
        if (!data?.blocks) return;

        const tbody = $('#explorerBlocksBody');
        tbody.innerHTML = '';

        data.blocks.forEach(block => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><span style="color:var(--accent-indigo);font-family:var(--font-mono);font-weight:700">#${fmtNum(block.number)}</span></td>
                <td>${block.timeAgo}</td>
                <td><strong>${block.transactionCount}</strong></td>
                <td><span class="mono" style="font-size:0.78rem;color:var(--text-secondary)">${block.minerShort}</span></td>
                <td class="mono" style="font-size:0.78rem">${block.gasUsed ? BigInt(block.gasUsed).toLocaleString() : '--'}</td>
                <td class="mono" style="font-size:0.78rem">${block.baseFeePerGas || '--'} Gwei</td>
            `;
            tr.addEventListener('click', () => loadBlockDetail(block.number));
            tbody.appendChild(tr);
        });

        // Refresh button
        $('#refreshBlocks').onclick = loadExplorerBlocks;
    }

    async function loadBlockDetail(blockId) {
        const card = $('#blockDetailCard');
        const content = $('#blockDetailContent');
        card.style.display = '';
        content.innerHTML = '<div class="placeholder-message"><div class="spinner"></div></div>';

        const data = await api(`/block/${blockId}`);
        if (!data) { content.innerHTML = '<p style="color:var(--red)">Failed to load block</p>'; return; }

        content.innerHTML = `
            <div class="result-grid">
                <div class="result-item"><span class="result-label">Block Number</span><span class="result-value mono">${fmtNum(data.number)}</span></div>
                <div class="result-item"><span class="result-label">Timestamp</span><span class="result-value">${new Date(data.timestamp * 1000).toLocaleString()}</span></div>
                <div class="result-item full"><span class="result-label">Hash</span><span class="result-value mono" style="font-size:0.72rem">${data.hash}</span></div>
                <div class="result-item"><span class="result-label">Transactions</span><span class="result-value mono">${data.transactionCount}</span></div>
                <div class="result-item"><span class="result-label">Gas Used</span><span class="result-value mono">${data.gasUsed ? BigInt(data.gasUsed).toLocaleString() : '--'}</span></div>
                <div class="result-item"><span class="result-label">Base Fee</span><span class="result-value mono">${data.baseFeePerGas || '--'} Gwei</span></div>
                <div class="result-item full"><span class="result-label">Miner/Validator</span><span class="result-value mono" style="font-size:0.75rem">${data.miner}</span></div>
            </div>
            ${data.transactions.length ? `
                <h4 style="margin:18px 0 10px;font-size:0.85rem">Transactions (first ${data.transactions.length})</h4>
                <div style="max-height:300px;overflow-y:auto">
                    ${data.transactions.map(tx => `
                        <div class="block-row" style="margin-bottom:4px;cursor:pointer" onclick="document.getElementById('txHashInput').value='${tx.hash}';document.querySelectorAll('.nav-link')[2].click();">
                            <div style="min-width:0"><div class="block-number" style="font-size:0.72rem">${fmtAddr(tx.hash)}</div><div class="block-time">${tx.type}</div></div>
                            <div style="min-width:0"><div class="block-miner" style="font-size:0.7rem">${fmtAddr(tx.from)} → ${tx.to ? fmtAddr(tx.to) : 'Contract Create'}</div></div>
                            <div style="text-align:right"><div class="block-txn-count" style="font-size:0.78rem">${parseFloat(tx.value).toFixed(4)}</div><div class="block-txn-label">ETH</div></div>
                        </div>
                    `).join('')}
                </div>
            ` : ''}
        `;

        $('#closeBlockDetail').onclick = () => { card.style.display = 'none'; };
    }

    // ══════════════════════════════════════
    //  TX Analyzer Page
    // ══════════════════════════════════════
    async function analyzeTx() {
        const hash = $('#txHashInput').value.trim();
        if (!hash) return toast('Please enter a transaction hash', 'warning');

        const result = $('#txResult');
        result.innerHTML = '<div class="placeholder-message"><div class="spinner"></div><p>Analyzing transaction...</p></div>';

        const data = await api(`/tx/${hash}`);
        if (!data) { result.innerHTML = '<div class="result-card"><p style="color:var(--red)">Transaction not found or API error</p></div>'; return; }

        const statusClass = data.status === 'Success' ? 'success' : data.status === 'Failed' ? 'failed' : 'pending';

        result.innerHTML = `
            <div class="result-card">
                <h3>📋 Transaction Overview <span class="status-badge ${statusClass}">${data.status}</span></h3>
                <div class="result-grid">
                    <div class="result-item full"><span class="result-label">Transaction Hash</span><span class="result-value mono" style="font-size:0.75rem">${data.hash}</span></div>
                    <div class="result-item"><span class="result-label">From</span><span class="result-value mono" style="font-size:0.75rem">${data.from}</span></div>
                    <div class="result-item"><span class="result-label">To</span><span class="result-value mono" style="font-size:0.75rem">${data.to || 'Contract Creation'}</span></div>
                    <div class="result-item"><span class="result-label">Value</span><span class="result-value mono">${data.value} ETH</span></div>
                    <div class="result-item"><span class="result-label">Gas Price</span><span class="result-value mono">${data.gasPrice || '--'} Gwei</span></div>
                    <div class="result-item"><span class="result-label">Gas Used</span><span class="result-value mono">${data.gasUsed ? BigInt(data.gasUsed).toLocaleString() : '--'}</span></div>
                    <div class="result-item"><span class="result-label">Gas Cost</span><span class="result-value mono">${data.gasCost || '--'} ${data.gasCostSymbol || 'ETH'}</span></div>
                    <div class="result-item"><span class="result-label">Nonce</span><span class="result-value mono">${data.nonce}</span></div>
                    <div class="result-item"><span class="result-label">Block</span><span class="result-value mono">${data.blockNumber ? fmtNum(data.blockNumber) : 'Pending'}</span></div>
                    <div class="result-item"><span class="result-label">TX Type</span><span class="result-value">${data.type != null ? `Type ${data.type}` : '--'}</span></div>
                </div>
            </div>

            <div class="result-card">
                <h3>🔓 Input Data Decoder</h3>
                ${data.input.decoded ? `
                    <div class="decoded-box">
                        <div class="decoded-method">${data.input.method}()</div>
                        <div class="decoded-desc">${data.input.description}</div>
                        <div style="display:flex;gap:6px;margin-bottom:10px">
                            <span class="status-badge contract">${data.input.type}</span>
                            <span style="font-size:0.72rem;color:var(--text-tertiary);font-family:var(--font-mono)">${data.input.signature || ''}</span>
                        </div>
                        ${Object.keys(data.input.args || {}).length ? `
                            <div class="decoded-args">
                                ${Object.entries(data.input.args).map(([k, v]) => `
                                    <div class="arg-row"><span class="arg-name">${k}</span><span class="arg-value">${Array.isArray(v) ? v.join(' → ') : v}</span></div>
                                `).join('')}
                            </div>
                        ` : ''}
                    </div>
                ` : `
                    <div class="decoded-box" style="border-color:var(--border-color)">
                        <div class="decoded-method" style="color:var(--text-secondary)">${data.input.type}</div>
                        <div class="decoded-desc">${data.input.description}</div>
                        ${data.input.raw && data.input.raw !== '0x' ? `<div style="margin-top:8px;font-size:0.72rem;font-family:var(--font-mono);color:var(--text-tertiary);word-break:break-all">${data.input.raw}</div>` : ''}
                    </div>
                `}
            </div>

            ${data.logs.length ? `
                <div class="result-card">
                    <h3>📜 Event Logs (${data.logs.length})</h3>
                    ${data.logs.map(log => `
                        <div class="log-item">
                            <div class="log-address">Contract: ${log.addressShort}</div>
                            ${log.decoded ? `<div class="log-event">${log.decoded.name}(${Object.entries(log.decoded.args).map(([k, v]) => `${k}: ${typeof v === 'string' ? fmtAddr(v) : v}`).join(', ')})</div>` : '<div style="color:var(--text-tertiary);font-size:0.72rem">Unable to decode event</div>'}
                        </div>
                    `).join('')}
                </div>
            ` : ''}

            <div style="text-align:right">
                <a href="${data.explorer}" target="_blank" class="btn-secondary" style="display:inline-flex;text-decoration:none">View on Explorer ↗</a>
            </div>
        `;
    }

    function initAnalyzer() {
        $('#analyzeTxBtn').addEventListener('click', analyzeTx);
        $('#txHashInput').addEventListener('keypress', (e) => { if (e.key === 'Enter') analyzeTx(); });
    }

    // ══════════════════════════════════════
    //  Address Inspector Page
    // ══════════════════════════════════════
    async function inspectAddress() {
        let input = $('#addressInput').value.trim();
        if (!input) return toast('Please enter an address or ENS name', 'warning');

        const result = $('#addressResult');
        result.innerHTML = '<div class="placeholder-message"><div class="spinner"></div><p>Inspecting address...</p></div>';

        // If ENS name, resolve first
        if (input.includes('.') && !input.startsWith('0x')) {
            const ensData = await api(`/ens/resolve/${encodeURIComponent(input)}`);
            if (ensData?.address) {
                input = ensData.address;
            } else {
                result.innerHTML = '<div class="result-card"><p style="color:var(--red)">ENS name could not be resolved</p></div>';
                return;
            }
        }

        const [addrData, tokenData] = await Promise.all([
            api(`/address/${input}`),
            api(`/tokens/${input}`),
        ]);

        if (!addrData) {
            result.innerHTML = '<div class="result-card"><p style="color:var(--red)">Invalid address or API error</p></div>';
            return;
        }

        const typeClass = addrData.isContract ? 'contract' : 'eoa';
        const typeLabel = addrData.isContract ? '📋 Smart Contract' : '👤 EOA';

        result.innerHTML = `
            <div class="result-card">
                <h3>🔎 Address Overview <span class="status-badge ${typeClass}">${typeLabel}</span></h3>
                <div class="result-grid">
                    <div class="result-item full"><span class="result-label">Address</span><span class="result-value mono" style="font-size:0.78rem">${addrData.address}</span></div>
                    ${addrData.ensName ? `<div class="result-item"><span class="result-label">ENS Name</span><span class="result-value" style="color:var(--accent-indigo)">${addrData.ensName}</span></div>` : ''}
                    <div class="result-item"><span class="result-label">${addrData.symbol} Balance</span><span class="result-value mono">${addrData.balance.toFixed(6)} ${addrData.symbol}</span></div>
                    <div class="result-item"><span class="result-label">Balance (USD)</span><span class="result-value mono">${fmt$(addrData.balance * state.ethPrice)}</span></div>
                    <div class="result-item"><span class="result-label">Transaction Count</span><span class="result-value mono">${fmtNum(addrData.transactionCount)}</span></div>
                    <div class="result-item"><span class="result-label">Type</span><span class="result-value">${addrData.addressType}</span></div>
                    ${addrData.isContract ? `<div class="result-item"><span class="result-label">Contract Size</span><span class="result-value mono">${fmtNum(addrData.codeSize)} bytes</span></div>` : ''}
                    <div class="result-item"><span class="result-label">Chain</span><span class="result-value">${addrData.chain}</span></div>
                </div>
            </div>

            ${tokenData?.tokens?.length ? `
                <div class="result-card">
                    <h3>🪙 ERC-20 Token Balances</h3>
                    <div class="tokens-list">
                        ${tokenData.tokens.map(t => `
                            <div class="token-row">
                                <div class="token-info"><span class="token-name">${t.name}</span><span class="token-symbol-label">${t.symbol}</span></div>
                                <span class="token-balance">${t.balance.toFixed(4)} ${t.symbol}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : tokenData ? `
                <div class="result-card">
                    <h3>🪙 ERC-20 Tokens</h3>
                    <p style="color:var(--text-tertiary);font-size:0.85rem">No popular token balances found for this address.</p>
                </div>
            ` : ''}

            <div style="text-align:right">
                <a href="${addrData.explorer}" target="_blank" class="btn-secondary" style="display:inline-flex;text-decoration:none">View on Explorer ↗</a>
            </div>
        `;
    }

    function initAddressInspector() {
        $('#inspectAddrBtn').addEventListener('click', inspectAddress);
        $('#addressInput').addEventListener('keypress', (e) => { if (e.key === 'Enter') inspectAddress(); });
    }

    // ══════════════════════════════════════
    //  Wallet Page
    // ══════════════════════════════════════
    async function connectWallet() {
        if (!window.ethereum) return toast('MetaMask not installed!', 'error');

        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const accounts = await provider.send('eth_requestAccounts', []);
            if (!accounts.length) return toast('No accounts found', 'error');

            state.walletAddress = accounts[0];
            state.isConnected = true;

            updateWalletBtnUI();
            await loadWalletPage(provider);
            toast('Wallet connected!', 'success');
        } catch (e) {
            if (e.code === 4001) toast('Connection rejected', 'warning');
            else toast('Connection failed', 'error');
        }
    }

    function disconnectWallet() {
        state.walletAddress = null;
        state.isConnected = false;
        updateWalletBtnUI();
        $('#walletHero').style.display = 'flex';
        $('#walletDashboard').style.display = 'none';
        toast('Wallet disconnected', 'info');
    }

    function updateWalletBtnUI() {
        const btn = $('#connectWallet');
        const text = $('#walletText');
        if (state.isConnected) {
            btn.classList.add('connected');
            text.textContent = fmtAddr(state.walletAddress);
        } else {
            btn.classList.remove('connected');
            text.textContent = 'Connect';
        }
    }

    async function loadWalletPage(provider) {
        $('#walletHero').style.display = 'none';
        $('#walletDashboard').style.display = '';

        const addr = state.walletAddress;

        // Avatar
        const hash = parseInt(addr.slice(2, 10), 16);
        const hue = hash % 360;
        $('#walletAvatar').style.background = `linear-gradient(135deg, hsl(${hue},70%,55%), hsl(${(hue + 60) % 360},80%,45%))`;
        $('#walletAddr').textContent = fmtAddr(addr);

        // Address analysis from backend
        const addrData = await api(`/address/${addr}`);
        if (addrData) {
            $('#walletEthBal').textContent = `${addrData.balance.toFixed(4)} ${addrData.symbol}`;
            $('#walletUsdBal').textContent = `≈ ${fmt$(addrData.balance * state.ethPrice)}`;
            $('#walletNetwork').textContent = addrData.chain;
            $('#walletChainId').textContent = addrData.chainId;
            $('#walletNonce').textContent = addrData.transactionCount;
            $('#walletType').textContent = addrData.isContract ? 'Contract' : 'EOA';
            if (addrData.ensName) $('#walletEns').textContent = addrData.ensName;
        }

        // Token scan
        const tokenData = await api(`/tokens/${addr}`);
        const tokensList = $('#tokensList');
        if (tokenData?.tokens?.length) {
            tokensList.innerHTML = tokenData.tokens.map(t => `
                <div class="token-row">
                    <div class="token-info"><span class="token-name">${t.name}</span><span class="token-symbol-label">${t.symbol}</span></div>
                    <span class="token-balance">${t.balance.toFixed(4)}</span>
                </div>
            `).join('');
        } else {
            tokensList.innerHTML = '<div class="placeholder-message" style="padding:20px"><p>No popular ERC-20 tokens found</p></div>';
        }
    }

    function initWallet() {
        $('#connectWallet').addEventListener('click', () => {
            if (state.isConnected) disconnectWallet();
            else connectWallet();
        });
        $('#walletConnectCta').addEventListener('click', connectWallet);
        $('#disconnectBtn').addEventListener('click', disconnectWallet);
        $('#copyAddr').addEventListener('click', () => {
            if (state.walletAddress) { navigator.clipboard.writeText(state.walletAddress); toast('Address copied!', 'success'); }
        });

        if (window.ethereum) {
            window.ethereum.on('accountsChanged', (accounts) => {
                if (!accounts.length) disconnectWallet();
                else { state.walletAddress = accounts[0]; updateWalletBtnUI(); loadWalletPage(new ethers.BrowserProvider(window.ethereum)); }
            });
            window.ethereum.on('chainChanged', () => window.location.reload());
        }
    }

    // ══════════════════════════════════════
    //  Load All Dashboard Data
    // ══════════════════════════════════════
    async function loadDashboardData() {
        await Promise.allSettled([
            loadGlobalData(),
            loadNetworkStats(),
            loadTopCoins(),
            loadPriceChart(),
            loadGasData(),
            loadInitialBlocks(),
        ]);
    }

    // ══════════════════════════════════════
    //  Auto Refresh
    // ══════════════════════════════════════
    function startRefresh() {
        state.intervals.push(setInterval(loadTopCoins, REFRESH.MARKET));
        state.intervals.push(setInterval(loadGasData, REFRESH.GAS));
        state.intervals.push(setInterval(loadGlobalData, REFRESH.GLOBAL));
    }

    // ══════════════════════════════════════
    //  Init
    // ══════════════════════════════════════
    async function init() {
        console.log('%c◆ CryptoVerse v2', 'color:#6366f1;font-size:16px;font-weight:bold');
        console.log('%cFull-Stack Blockchain Dashboard', 'color:#8b92a5;font-size:11px');

        initTheme();
        initPages();
        initMobile();
        initSearch();
        initChartControls();
        initChainSwitch();
        initAnalyzer();
        initAddressInspector();
        initWallet();

        // Connect WebSocket
        initWebSocket();

        // Load dashboard
        await loadDashboardData();
        startRefresh();

        toast('Dashboard ready — live data via WebSocket', 'success');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
