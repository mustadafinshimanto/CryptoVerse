/* ═══════════════════════════════════════════════════════════════════════
   CryptoVerse — Full-Stack Blockchain Server
   ═══════════════════════════════════════════════════════════════════════
   Features:
   • Multi-chain Ethereum provider management (ETH, Polygon, BSC)
   • Real-time WebSocket streaming (blocks, whale alerts, gas)
   • Transaction decoder (ERC-20, Uniswap, NFT)
   • Address analyzer (balance, type, ENS, tokens)
   • Token scanner (ERC-20 balance checking)
   • Gas oracle (EIP-1559 aware)
   • Market data proxy with server-side caching
   ═══════════════════════════════════════════════════════════════════════ */

require('dotenv').config();
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const { ethers } = require('ethers');
const cors = require('cors');
const path = require('path');

// ══════════════════════════════════════
//  Configuration
// ══════════════════════════════════════
const PORT = process.env.PORT || 3000;
const WHALE_THRESHOLD = parseFloat(process.env.WHALE_THRESHOLD || '10'); // ETH

const CHAINS = {
    ethereum: {
        name: 'Ethereum',
        chainId: 1,
        symbol: 'ETH',
        rpcs: [
            process.env.ETH_RPC_URL,
            'https://eth.llamarpc.com',
            'https://rpc.ankr.com/eth',
            'https://ethereum-rpc.publicnode.com',
            'https://1rpc.io/eth',
        ].filter(Boolean),
        explorer: 'https://etherscan.io',
    },
    mantaPacific: {
        name: 'Manta Pacific',
        chainId: 169,
        symbol: 'ETH',
        rpcs: [
            process.env.MANTA_RPC_URL,
            'https://pacific-rpc.manta.network/http',
            'https://1rpc.io/manta',
        ].filter(Boolean),
        explorer: 'https://pacific-explorer.manta.network',
    },
    mantaTestnet: {
        name: 'Manta Testnet',
        chainId: 3441006,
        symbol: 'ETH',
        rpcs: [
            process.env.MANTA_TESTNET_RPC_URL,
            'https://pacific-rpc.sepolia-testnet.manta.network/http',
        ].filter(Boolean),
        explorer: 'https://pacific-explorer.sepolia-testnet.manta.network',
    },
    polygon: {
        name: 'Polygon',
        chainId: 137,
        symbol: 'MATIC',
        rpcs: [
            process.env.POLYGON_RPC_URL,
            'https://polygon-rpc.com',
            'https://rpc.ankr.com/polygon',
            'https://polygon-bor-rpc.publicnode.com',
        ].filter(Boolean),
        explorer: 'https://polygonscan.com',
    },
    bsc: {
        name: 'BNB Chain',
        chainId: 56,
        symbol: 'BNB',
        rpcs: [
            process.env.BSC_RPC_URL,
            'https://bsc-dataseed.binance.org',
            'https://rpc.ankr.com/bsc',
            'https://bsc-rpc.publicnode.com',
        ].filter(Boolean),
        explorer: 'https://bscscan.com',
    },
};

// Popular tokens per chain
const POPULAR_TOKENS = {
    ethereum: {
        '0xdAC17F958D2ee523a2206206994597C13D831ec7': { symbol: 'USDT', name: 'Tether', decimals: 6 },
        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48': { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
        '0x6B175474E89094C44Da98b954EesdeCD56130b7a': { symbol: 'DAI', name: 'Dai', decimals: 18 },
        '0x514910771AF9Ca656af840dff83E8264EcF986CA': { symbol: 'LINK', name: 'Chainlink', decimals: 18 },
        '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984': { symbol: 'UNI', name: 'Uniswap', decimals: 18 },
        '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599': { symbol: 'WBTC', name: 'Wrapped BTC', decimals: 8 },
    },
    mantaPacific: {
        '0xf417F5A458eC102B90352F697D6e2Ac3A3d2851f': { symbol: 'USDT', name: 'Tether (Manta)', decimals: 6 },
        '0xb7322792694E4f1E2C8449B8aE029A9008801594': { symbol: 'USDC', name: 'USD Coin (Manta)', decimals: 6 },
        '0x0Dc808Ad50918efF5b943591c9D49173d8C27471': { symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
    },
    bsc: {
        '0x55d398326f99059fF775485246999027B3197955': { symbol: 'USDT', name: 'BSC-USD', decimals: 18 },
        '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d': { symbol: 'USDC', name: 'Binance-Peg USDC', decimals: 18 },
        '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56': { symbol: 'BUSD', name: 'BUSD Token', decimals: 18 },
        '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c': { symbol: 'WBNB', name: 'Wrapped BNB', decimals: 18 },
    },
    polygon: {
        '0xc2132D05D31c914a87C6611C10748AEb04B58e8F': { symbol: 'USDT', name: 'Tether (Polygon)', decimals: 6 },
        '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174': { symbol: 'USDC', name: 'USD Coin (Polygon)', decimals: 6 },
        '0x8f3Cf7ad23Cd3BaDbD9735AFf958023239c6A063': { symbol: 'DAI', name: '(PoS) Dai Stablecoin', decimals: 18 },
    }
};

// Standard ABIs for decoding
const ERC20_ABI = [
    'function name() view returns (string)',
    'function symbol() view returns (string)',
    'function decimals() view returns (uint8)',
    'function totalSupply() view returns (uint256)',
    'function balanceOf(address) view returns (uint256)',
    'function transfer(address to, uint256 amount) returns (bool)',
    'function approve(address spender, uint256 amount) returns (bool)',
    'function transferFrom(address from, address to, uint256 amount) returns (bool)',
    'event Transfer(address indexed from, address indexed to, uint256 value)',
    'event Approval(address indexed owner, address indexed spender, uint256 value)',
];

const UNISWAP_ROUTER_ABI = [
    'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline)',
    'function swapExactETHForTokens(uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) payable',
    'function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline)',
    'function addLiquidity(address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline)',
    'function removeLiquidity(address tokenA, address tokenB, uint256 liquidity, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline)',
];

const ERC721_ABI = [
    'function safeTransferFrom(address from, address to, uint256 tokenId)',
    'function transferFrom(address from, address to, uint256 tokenId)',
    'function approve(address to, uint256 tokenId)',
    'function setApprovalForAll(address operator, bool approved)',
    'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
];

// Combined interface for decoding
const KNOWN_INTERFACES = new ethers.Interface([
    ...ERC20_ABI.filter(a => !a.startsWith('event')),
    ...UNISWAP_ROUTER_ABI,
    ...ERC721_ABI.filter(a => !a.startsWith('event')),
]);

// ══════════════════════════════════════
//  In-Memory Cache
// ══════════════════════════════════════
class Cache {
    constructor() {
        this.store = new Map();
    }

    get(key) {
        const entry = this.store.get(key);
        if (!entry) return null;
        if (Date.now() > entry.expires) {
            this.store.delete(key);
            return null;
        }
        return entry.value;
    }

    set(key, value, ttlMs = 30000) {
        this.store.set(key, { value, expires: Date.now() + ttlMs });
    }

    clear() {
        this.store.clear();
    }
}

const cache = new Cache();

// ══════════════════════════════════════
//  Provider Management
// ══════════════════════════════════════
const providers = {};
let activeChain = 'ethereum';

function getProvider(chain = activeChain) {
    if (providers[chain]) return providers[chain];

    const config = CHAINS[chain];
    if (!config) throw new Error(`Unknown chain: ${chain}`);

    for (const rpc of config.rpcs) {
        try {
            providers[chain] = new ethers.JsonRpcProvider(rpc, {
                name: config.name,
                chainId: config.chainId,
            });
            console.log(`  ✓ ${config.name} provider connected: ${rpc.substring(0, 40)}...`);
            return providers[chain];
        } catch (e) {
            console.warn(`  ✗ ${config.name} RPC failed: ${rpc}`);
        }
    }
    throw new Error(`All RPCs failed for ${chain}`);
}

// Initialize all providers
function initProviders() {
    console.log('\n🔗 Initializing blockchain providers...');
    for (const chain of Object.keys(CHAINS)) {
        try {
            getProvider(chain);
        } catch (e) {
            console.warn(`  ⚠ ${chain}: ${e.message}`);
        }
    }
    console.log('');
}

// ══════════════════════════════════════
//  CoinGecko API Proxy (with cache)
// ══════════════════════════════════════
const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

async function fetchCoinGecko(endpoint) {
    const cacheKey = `cg:${endpoint}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    try {
        const url = `${COINGECKO_BASE}${endpoint}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
        const data = await res.json();
        cache.set(cacheKey, data, 60000); // Cache 60s
        return data;
    } catch (err) {
        console.warn('CoinGecko error:', err.message);
        return null;
    }
}

// ══════════════════════════════════════
//  Transaction Decoder
// ══════════════════════════════════════
function decodeTxInput(inputData) {
    if (!inputData || inputData === '0x') {
        return { decoded: false, type: 'ETH Transfer', description: 'Native token transfer' };
    }

    try {
        const parsed = KNOWN_INTERFACES.parseTransaction({ data: inputData });
        if (parsed) {
            const args = {};
            parsed.fragment.inputs.forEach((input, i) => {
                let val = parsed.args[i];
                if (typeof val === 'bigint') val = val.toString();
                if (Array.isArray(val)) val = val.map(v => typeof v === 'bigint' ? v.toString() : v);
                args[input.name] = val;
            });

            // Friendly descriptions
            const descriptions = {
                'transfer': `ERC-20 Transfer to ${args.to ? formatAddr(args.to) : 'unknown'}`,
                'approve': `ERC-20 Approval for ${args.spender ? formatAddr(args.spender) : 'unknown'}`,
                'transferFrom': `ERC-20 TransferFrom ${formatAddr(args.from)} → ${formatAddr(args.to)}`,
                'swapExactTokensForTokens': 'Uniswap: Swap Tokens → Tokens',
                'swapExactETHForTokens': 'Uniswap: Swap ETH → Tokens',
                'swapExactTokensForETH': 'Uniswap: Swap Tokens → ETH',
                'addLiquidity': 'Uniswap: Add Liquidity',
                'removeLiquidity': 'Uniswap: Remove Liquidity',
                'safeTransferFrom': `NFT Transfer to ${args.to ? formatAddr(args.to) : 'unknown'}`,
                'setApprovalForAll': 'NFT: Set Approval For All',
            };

            return {
                decoded: true,
                method: parsed.name,
                signature: parsed.signature,
                type: getMethodCategory(parsed.name),
                description: descriptions[parsed.name] || `Contract call: ${parsed.name}`,
                args,
            };
        }
    } catch (e) {
        // Decoding failed — show function selector
    }

    const selector = inputData.slice(0, 10);
    return {
        decoded: false,
        type: 'Contract Interaction',
        description: `Unknown method (selector: ${selector})`,
        selector,
    };
}

function getMethodCategory(method) {
    if (['transfer', 'transferFrom', 'approve'].includes(method)) return 'ERC-20';
    if (method.startsWith('swap') || method.includes('Liquidity')) return 'DEX';
    if (['safeTransferFrom', 'setApprovalForAll'].includes(method)) return 'NFT';
    return 'Contract';
}

function formatAddr(addr) {
    if (!addr) return '???';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

// ══════════════════════════════════════
//  Address Analyzer
// ══════════════════════════════════════
async function analyzeAddress(address, chain = activeChain) {
    const provider = getProvider(chain);
    const chainConfig = CHAINS[chain];

    const [balance, nonce, code] = await Promise.all([
        provider.getBalance(address),
        provider.getTransactionCount(address),
        provider.getCode(address),
    ]);

    const isContract = code !== '0x';
    const ethBalance = parseFloat(ethers.formatEther(balance));

    // ENS resolution (Ethereum only)
    let ensName = null;
    if (chain === 'ethereum') {
        try {
            ensName = await provider.lookupAddress(address);
        } catch (e) {
            // ENS lookup failed
        }
    }

    // Determine address type
    let addressType = 'EOA (Externally Owned Account)';
    if (isContract) {
        addressType = 'Smart Contract';
    }

    return {
        address,
        chain: chainConfig.name,
        chainId: chainConfig.chainId,
        balance: ethBalance,
        balanceWei: balance.toString(),
        symbol: chainConfig.symbol,
        nonce,
        transactionCount: nonce,
        isContract,
        addressType,
        ensName,
        codeSize: isContract ? (code.length - 2) / 2 : 0, // bytes
        explorer: `${chainConfig.explorer}/address/${address}`,
    };
}

// ══════════════════════════════════════
//  Token Scanner
// ══════════════════════════════════════
async function scanTokens(address, chain = activeChain) {
    const provider = getProvider(chain);
    const tokens = [];
    const chainTokens = POPULAR_TOKENS[chain] || {};

    const scanPromises = Object.entries(chainTokens).map(async ([tokenAddress, tokenInfo]) => {
        try {
            const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
            const balance = await contract.balanceOf(address);
            const formatted = parseFloat(ethers.formatUnits(balance, tokenInfo.decimals));

            if (formatted > 0) {
                return {
                    address: tokenAddress,
                    symbol: tokenInfo.symbol,
                    name: tokenInfo.name,
                    decimals: tokenInfo.decimals,
                    balance: formatted,
                    balanceRaw: balance.toString(),
                };
            }
        } catch (e) {
            // Token read failed
        }
        return null;
    });

    const results = await Promise.allSettled(scanPromises);
    for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
            tokens.push(result.value);
        }
    }

    return { address, chain: CHAINS[chain].name, tokens };
}

// ══════════════════════════════════════
//  Express Server Setup
// ══════════════════════════════════════
const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Request logging
app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
        console.log(`  → ${req.method} ${req.path}`);
    }
    next();
});

// ══════════════════════════════════════
//  API Routes — Network Stats
// ══════════════════════════════════════
app.get('/api/stats', async (req, res) => {
    try {
        const chain = req.query.chain || activeChain;
        const cacheKey = `stats:${chain}`;
        const cached = cache.get(cacheKey);
        if (cached) return res.json(cached);

        const provider = getProvider(chain);
        const chainConfig = CHAINS[chain];

        const [blockNumber, feeData, network] = await Promise.all([
            provider.getBlockNumber(),
            provider.getFeeData(),
            provider.getNetwork(),
        ]);

        const gasPrice = feeData.gasPrice
            ? parseFloat(ethers.formatUnits(feeData.gasPrice, 'gwei'))
            : null;

        const maxFee = feeData.maxFeePerGas
            ? parseFloat(ethers.formatUnits(feeData.maxFeePerGas, 'gwei'))
            : null;

        const maxPriorityFee = feeData.maxPriorityFeePerGas
            ? parseFloat(ethers.formatUnits(feeData.maxPriorityFeePerGas, 'gwei'))
            : null;

        const result = {
            chain: chainConfig.name,
            chainId: Number(network.chainId),
            blockNumber,
            gasPrice: gasPrice ? Math.round(gasPrice * 100) / 100 : null,
            maxFeePerGas: maxFee ? Math.round(maxFee * 100) / 100 : null,
            maxPriorityFee: maxPriorityFee ? Math.round(maxPriorityFee * 100) / 100 : null,
            symbol: chainConfig.symbol,
            explorer: chainConfig.explorer,
            timestamp: Date.now(),
        };
        cache.set(cacheKey, result, 10000); // Cache 10s
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════
//  API Routes — Blocks
// ══════════════════════════════════════
app.get('/api/blocks', async (req, res) => {
    try {
        const chain = req.query.chain || activeChain;
        const count = Math.min(parseInt(req.query.count) || 10, 20);
        const cacheKey = `blocks:${chain}:${count}`;
        const cached = cache.get(cacheKey);
        if (cached) return res.json(cached);

        const provider = getProvider(chain);

        const latest = await provider.getBlockNumber();
        const blockPromises = [];
        for (let i = 0; i < count; i++) {
            blockPromises.push(provider.getBlock(latest - i).catch(() => null));
        }

        const rawBlocks = await Promise.all(blockPromises);
        const blocks = rawBlocks.filter(Boolean).map(block => ({
            number: block.number,
            hash: block.hash,
            parentHash: block.parentHash,
            timestamp: block.timestamp,
            timeAgo: timeAgo(block.timestamp),
            miner: block.miner,
            minerShort: formatAddr(block.miner),
            transactionCount: block.transactions?.length || 0,
            gasUsed: block.gasUsed?.toString(),
            gasLimit: block.gasLimit?.toString(),
            baseFeePerGas: block.baseFeePerGas
                ? parseFloat(ethers.formatUnits(block.baseFeePerGas, 'gwei')).toFixed(2)
                : null,
            extraData: block.extraData,
        }));

        const result = { chain: CHAINS[chain].name, blocks };
        cache.set(cacheKey, result, 12000); // Cache 12s
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/block/:id', async (req, res) => {
    try {
        const chain = req.query.chain || activeChain;
        const provider = getProvider(chain);
        const blockId = req.params.id.startsWith('0x') ? req.params.id : parseInt(req.params.id);

        const block = await provider.getBlock(blockId, true); // true = include txs
        if (!block) return res.status(404).json({ error: 'Block not found' });

        const transactions = (block.transactions || []).slice(0, 50).map(tx => {
            if (typeof tx === 'string') return { hash: tx };
            return {
                hash: tx.hash,
                from: tx.from,
                to: tx.to,
                value: ethers.formatEther(tx.value || 0),
                gasPrice: tx.gasPrice ? parseFloat(ethers.formatUnits(tx.gasPrice, 'gwei')).toFixed(2) : null,
                type: tx.to ? (tx.data === '0x' ? 'Transfer' : 'Contract Call') : 'Contract Creation',
            };
        });

        res.json({
            number: block.number,
            hash: block.hash,
            parentHash: block.parentHash,
            timestamp: block.timestamp,
            datetime: new Date(block.timestamp * 1000).toISOString(),
            miner: block.miner,
            transactionCount: block.transactions?.length || 0,
            gasUsed: block.gasUsed?.toString(),
            gasLimit: block.gasLimit?.toString(),
            baseFeePerGas: block.baseFeePerGas
                ? parseFloat(ethers.formatUnits(block.baseFeePerGas, 'gwei')).toFixed(4)
                : null,
            transactions,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════
//  API Routes — Transaction Analyzer
// ══════════════════════════════════════
app.get('/api/tx/:hash', async (req, res) => {
    try {
        const chain = req.query.chain || activeChain;
        const provider = getProvider(chain);
        const chainConfig = CHAINS[chain];

        const [tx, receipt] = await Promise.all([
            provider.getTransaction(req.params.hash),
            provider.getTransactionReceipt(req.params.hash),
        ]);

        if (!tx) return res.status(404).json({ error: 'Transaction not found' });

        // Decode input data
        const decoded = decodeTxInput(tx.data);

        // Calculate gas cost
        const gasUsed = receipt ? receipt.gasUsed : null;
        const gasPrice = tx.gasPrice || receipt?.gasPrice;
        const gasCost = gasUsed && gasPrice
            ? parseFloat(ethers.formatEther(gasUsed * gasPrice))
            : null;

        // Process event logs
        const logs = receipt ? receipt.logs.slice(0, 20).map(log => {
            let decoded = null;
            try {
                // Try to decode known events
                const erc20Iface = new ethers.Interface(ERC20_ABI);
                decoded = erc20Iface.parseLog({ topics: log.topics, data: log.data });
            } catch (e) {}

            return {
                address: log.address,
                addressShort: formatAddr(log.address),
                topics: log.topics,
                data: log.data?.slice(0, 66) + (log.data?.length > 66 ? '...' : ''),
                decoded: decoded ? {
                    name: decoded.name,
                    args: Object.fromEntries(
                        decoded.fragment.inputs.map((input, i) => {
                            let val = decoded.args[i];
                            if (typeof val === 'bigint') val = val.toString();
                            return [input.name, val];
                        })
                    ),
                } : null,
            };
        }) : [];

        res.json({
            hash: tx.hash,
            status: receipt ? (receipt.status === 1 ? 'Success' : 'Failed') : 'Pending',
            blockNumber: tx.blockNumber,
            timestamp: null, // Would need block for this
            from: tx.from,
            to: tx.to,
            value: ethers.formatEther(tx.value || 0),
            valueBigInt: tx.value?.toString(),
            gasPrice: gasPrice ? parseFloat(ethers.formatUnits(gasPrice, 'gwei')).toFixed(4) : null,
            gasLimit: tx.gasLimit?.toString(),
            gasUsed: gasUsed?.toString(),
            gasCost: gasCost?.toFixed(6),
            gasCostSymbol: chainConfig.symbol,
            nonce: tx.nonce,
            type: tx.type,
            chainId: Number(tx.chainId),
            input: {
                raw: tx.data?.slice(0, 200) + (tx.data?.length > 200 ? '...' : ''),
                ...decoded,
            },
            logs,
            explorer: `${chainConfig.explorer}/tx/${tx.hash}`,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════
//  API Routes — Address Analyzer
// ══════════════════════════════════════
app.get('/api/address/:address', async (req, res) => {
    try {
        const chain = req.query.chain || activeChain;
        const address = req.params.address;

        // Validate address
        if (!ethers.isAddress(address)) {
            return res.status(400).json({ error: 'Invalid Ethereum address' });
        }

        const result = await analyzeAddress(address, chain);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/tokens/:address', async (req, res) => {
    try {
        const chain = req.query.chain || activeChain;
        const address = req.params.address;

        if (!ethers.isAddress(address)) {
            return res.status(400).json({ error: 'Invalid Ethereum address' });
        }

        const result = await scanTokens(address, chain);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════
//  API Routes — ENS
// ══════════════════════════════════════
app.get('/api/ens/resolve/:name', async (req, res) => {
    try {
        const provider = getProvider('ethereum');
        const address = await provider.resolveName(req.params.name);
        
        if (!address) {
            return res.status(404).json({ error: 'ENS name not found' });
        }

        res.json({
            name: req.params.name,
            address,
            addressShort: formatAddr(address),
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/ens/lookup/:address', async (req, res) => {
    try {
        const provider = getProvider('ethereum');
        const name = await provider.lookupAddress(req.params.address);
        
        res.json({
            address: req.params.address,
            name: name || null,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════
//  API Routes — Gas Oracle
// ══════════════════════════════════════
app.get('/api/gas', async (req, res) => {
    try {
        const chain = req.query.chain || activeChain;
        const cacheKey = `gas:${chain}`;
        const cached = cache.get(cacheKey);
        if (cached) return res.json(cached);

        const provider = getProvider(chain);
        const feeData = await provider.getFeeData();

        const gasPrice = feeData.gasPrice
            ? parseFloat(ethers.formatUnits(feeData.gasPrice, 'gwei'))
            : 0;

        const baseFee = feeData.maxFeePerGas
            ? parseFloat(ethers.formatUnits(feeData.maxFeePerGas, 'gwei'))
            : null;

        const priorityFee = feeData.maxPriorityFeePerGas
            ? parseFloat(ethers.formatUnits(feeData.maxPriorityFeePerGas, 'gwei'))
            : null;

        // Estimate tiers
        const low = Math.max(1, gasPrice * 0.8);
        const standard = gasPrice;
        const fast = gasPrice * 1.2;
        const instant = gasPrice * 1.5;

        // Estimate costs for common operations (in USD — would need ETH price)
        const ethPriceData = await fetchCoinGecko('/simple/price?ids=ethereum&vs_currencies=usd');
        const ethPrice = ethPriceData?.ethereum?.usd || 0;

        const estimateCost = (gas, gweiPrice) => {
            return (gas * gweiPrice * 1e-9 * ethPrice).toFixed(4);
        };

        const result = {
            chain: CHAINS[chain].name,
            gasPrice: Math.round(gasPrice * 100) / 100,
            baseFeePerGas: baseFee ? Math.round(baseFee * 100) / 100 : null,
            maxPriorityFee: priorityFee ? Math.round(priorityFee * 100) / 100 : null,
            tiers: {
                low: { gwei: Math.round(low * 100) / 100, time: '~10 min' },
                standard: { gwei: Math.round(standard * 100) / 100, time: '~3 min' },
                fast: { gwei: Math.round(fast * 100) / 100, time: '~30 sec' },
                instant: { gwei: Math.round(instant * 100) / 100, time: '~15 sec' },
            },
            estimatedCosts: {
                ethTransfer: {
                    gas: 21000,
                    costUsd: estimateCost(21000, standard),
                },
                erc20Transfer: {
                    gas: 65000,
                    costUsd: estimateCost(65000, standard),
                },
                uniswapSwap: {
                    gas: 150000,
                    costUsd: estimateCost(150000, standard),
                },
                nftMint: {
                    gas: 200000,
                    costUsd: estimateCost(200000, standard),
                },
            },
            ethPriceUsd: ethPrice,
            timestamp: Date.now(),
        };
        cache.set(cacheKey, result, 15000); // Cache 15s
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════
//  API Routes — Market Data (Cached Proxy)
// ══════════════════════════════════════
app.get('/api/market/global', async (req, res) => {
    const data = await fetchCoinGecko('/global');
    if (!data) return res.status(502).json({ error: 'CoinGecko unavailable' });
    res.json(data.data);
});

app.get('/api/market/coins', async (req, res) => {
    const count = Math.min(parseInt(req.query.count) || 10, 50);
    const data = await fetchCoinGecko(
        `/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${count}&page=1&sparkline=true&price_change_percentage=24h`
    );
    if (!data) return res.status(502).json({ error: 'CoinGecko unavailable' });
    res.json(data);
});

app.get('/api/market/chart/:coinId', async (req, res) => {
    const days = req.query.days || 1;
    const data = await fetchCoinGecko(
        `/coins/${req.params.coinId}/market_chart?vs_currency=usd&days=${days}`
    );
    if (!data) return res.status(502).json({ error: 'CoinGecko unavailable' });
    res.json(data);
});

app.get('/api/market/coin/:coinId', async (req, res) => {
    const data = await fetchCoinGecko(
        `/coins/${req.params.coinId}?localization=false&tickers=false&community_data=false&developer_data=false`
    );
    if (!data) return res.status(502).json({ error: 'CoinGecko unavailable' });
    res.json(data);
});

// ══════════════════════════════════════
//  API Routes — Chain Switch
// ══════════════════════════════════════
app.get('/api/chains', (req, res) => {
    res.json(Object.entries(CHAINS).map(([id, config]) => ({
        id,
        name: config.name,
        chainId: config.chainId,
        symbol: config.symbol,
        explorer: config.explorer,
        active: id === activeChain,
    })));
});

app.post('/api/chain', (req, res) => {
    const { chain } = req.body;
    if (!CHAINS[chain]) return res.status(400).json({ error: 'Unknown chain' });
    activeChain = chain;
    res.json({ active: chain, name: CHAINS[chain].name });
});

// ══════════════════════════════════════
//  API Routes — Search (Universal)
// ══════════════════════════════════════
app.get('/api/search/:query', async (req, res) => {
    const query = req.params.query.trim();
    const chain = req.query.chain || activeChain;
    const provider = getProvider(chain);

    try {
        // Check if it's a block number
        if (/^\d+$/.test(query)) {
            const block = await provider.getBlock(parseInt(query));
            if (block) return res.json({ type: 'block', data: { number: block.number, hash: block.hash } });
        }

        // Check if it's a transaction hash
        if (/^0x[a-fA-F0-9]{64}$/.test(query)) {
            const tx = await provider.getTransaction(query);
            if (tx) return res.json({ type: 'transaction', data: { hash: tx.hash } });
            // Could also be a block hash
            const block = await provider.getBlock(query);
            if (block) return res.json({ type: 'block', data: { number: block.number, hash: block.hash } });
        }

        // Check if it's an address
        if (ethers.isAddress(query)) {
            return res.json({ type: 'address', data: { address: query } });
        }

        // Check if it's an ENS name
        if (query.includes('.')) {
            try {
                const address = await getProvider('ethereum').resolveName(query);
                if (address) {
                    return res.json({ type: 'ens', data: { name: query, address } });
                }
            } catch (e) {}
        }

        res.json({ type: 'unknown', data: null });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════
//  WebSocket Server — Real-Time Streaming
// ══════════════════════════════════════
const wss = new WebSocketServer({ server, path: '/ws' });
const wsClients = new Set();

wss.on('connection', (ws) => {
    wsClients.add(ws);
    console.log(`  🔌 WebSocket client connected (${wsClients.size} total)`);

    ws.on('close', () => {
        wsClients.delete(ws);
        console.log(`  🔌 WebSocket client disconnected (${wsClients.size} total)`);
    });

    ws.on('error', () => wsClients.delete(ws));

    // Send welcome message
    ws.send(JSON.stringify({
        type: 'welcome',
        data: {
            chain: CHAINS[activeChain].name,
            message: 'Connected to CryptoVerse WebSocket',
            timestamp: Date.now(),
        },
    }));
});

function broadcast(type, data) {
    const message = JSON.stringify({ type, data, timestamp: Date.now() });
    for (const ws of wsClients) {
        if (ws.readyState === 1) { // OPEN
            try { ws.send(message); } catch (e) {}
        }
    }
}

// ── Block Listener ──
let blockListenerActive = false;

async function startBlockListener() {
    if (blockListenerActive) return;
    
    try {
        const provider = getProvider();
        blockListenerActive = true;
        console.log('  👁  Block listener started');

        provider.on('block', async (blockNumber) => {
            try {
                const block = await provider.getBlock(blockNumber, true);
                if (!block) return;

                // Broadcast new block
                broadcast('newBlock', {
                    number: block.number,
                    hash: block.hash,
                    timestamp: block.timestamp,
                    miner: block.miner,
                    minerShort: formatAddr(block.miner),
                    transactionCount: block.transactions?.length || 0,
                    gasUsed: block.gasUsed?.toString(),
                    baseFeePerGas: block.baseFeePerGas
                        ? parseFloat(ethers.formatUnits(block.baseFeePerGas, 'gwei')).toFixed(2)
                        : null,
                });

                // Whale detection — scan for large ETH transfers
                if (block.prefetchedTransactions) {
                    for (const tx of block.prefetchedTransactions) {
                        const ethValue = parseFloat(ethers.formatEther(tx.value || 0));
                        if (ethValue >= WHALE_THRESHOLD) {
                            broadcast('whaleAlert', {
                                hash: tx.hash,
                                from: tx.from,
                                fromShort: formatAddr(tx.from),
                                to: tx.to,
                                toShort: formatAddr(tx.to),
                                value: ethValue.toFixed(4),
                                symbol: CHAINS[activeChain].symbol,
                                blockNumber: block.number,
                            });
                            console.log(`  🐋 Whale alert: ${ethValue.toFixed(2)} ETH | ${formatAddr(tx.from)} → ${formatAddr(tx.to)}`);
                        }

                        // ERC-20 Whale detection (USDT, USDC, DAI)
                        if (tx.data && tx.data.length >= 138) { // Minimum length for transfer(address,uint256)
                            const selector = tx.data.slice(0, 10);
                            if (selector === '0xa9059cbb') { // transfer(address,uint256)
                                try {
                                    const chainTokens = POPULAR_TOKENS[activeChain] || {};
                                    const tokenInfo = chainTokens[tx.to];
                                    if (tokenInfo) {
                                        const decoded = KNOWN_INTERFACES.decodeFunctionData('transfer', tx.data);
                                        const amount = parseFloat(ethers.formatUnits(decoded[1], tokenInfo.decimals));
                                        
                                        // Threshold for stablecoin whales: 100k
                                        const stableThreshold = 100000;
                                        if (amount >= stableThreshold) {
                                            broadcast('whaleAlert', {
                                                hash: tx.hash,
                                                from: tx.from,
                                                fromShort: formatAddr(tx.from),
                                                to: decoded[0],
                                                toShort: formatAddr(decoded[0]),
                                                value: amount.toLocaleString(),
                                                symbol: tokenInfo.symbol,
                                                blockNumber: block.number,
                                            });
                                            console.log(`  🐋 Token Whale: ${amount.toLocaleString()} ${tokenInfo.symbol} | ${formatAddr(tx.from)} → ${formatAddr(decoded[0])}`);
                                        }
                                    }
                                } catch (e) {}
                            }
                        }
                    }
                }

                // Gas update
                try {
                    const feeData = await provider.getFeeData();
                    if (feeData.gasPrice) {
                        broadcast('gasUpdate', {
                            gasPrice: parseFloat(ethers.formatUnits(feeData.gasPrice, 'gwei')).toFixed(2),
                            baseFee: feeData.maxFeePerGas
                                ? parseFloat(ethers.formatUnits(feeData.maxFeePerGas, 'gwei')).toFixed(2)
                                : null,
                        });
                    }
                } catch (e) {}

            } catch (err) {
                console.warn('  Block listener error:', err.message);
            }
        });
    } catch (err) {
        console.error('  Failed to start block listener:', err.message);
        blockListenerActive = false;
    }
}

// ══════════════════════════════════════
//  Utility
// ══════════════════════════════════════
function timeAgo(timestamp) {
    const seconds = Math.floor(Date.now() / 1000 - timestamp);
    if (seconds < 5) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
}

// ══════════════════════════════════════
//  Fallback Route
// ══════════════════════════════════════
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ══════════════════════════════════════
//  Start Server
// ══════════════════════════════════════
server.listen(PORT, () => {
    console.log('');
    console.log('  ╔═══════════════════════════════════════════╗');
    console.log('  ║                                           ║');
    console.log('  ║   ◆ CryptoVerse Blockchain Server v2.0    ║');
    console.log('  ║                                           ║');
    console.log('  ╚═══════════════════════════════════════════╝');
    console.log('');
    console.log(`  🌐 Dashboard:    http://localhost:${PORT}`);
    console.log(`  📡 API:          http://localhost:${PORT}/api`);
    console.log(`  🔌 WebSocket:    ws://localhost:${PORT}/ws`);
    console.log(`  ⛓  Active Chain: ${CHAINS[activeChain].name}`);
    console.log('');

    initProviders();
    startBlockListener();
});
