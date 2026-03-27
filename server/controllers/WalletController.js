/**
 * WalletController
 *
 * HTTP handlers for all /api/wallet routes.
 * Signature verification is done here before delegating to WalletService.
 */

const WalletService = require('../services/WalletService');

// secp256k1 + sha256 are already configured in index.js on the `secp` and
// `sha256` globals exported via ServerCrypto — we re-use the same verify
// helper by accepting it as a constructor argument.
class WalletController {
  /**
   * @param {object} db             - Database instance (dbConfig)
   * @param {function} verifySignature - ServerCrypto.verifySignature
   * @param {object}   wsManager    - SecureWebSocketManager (for real-time push)
   */
  constructor(db, verifySignature, wsManager) {
    this.walletService   = new WalletService(db);
    this.verifySignature = verifySignature;
    this.wsManager       = wsManager;
  }

  // ── GET /api/wallet ───────────────────────────────────────────────────────
  async getWallet(req, res) {
    try {
      const publicKey = req.user.publicKey;
      const wallet    = await this.walletService.getWallet(publicKey);
      res.json(wallet);
    } catch (err) {
      console.error('getWallet error:', err);
      res.status(500).json({ error: 'Failed to fetch wallet', code: 'WALLET_ERROR' });
    }
  }

  // ── GET /api/wallet/balance/:publicKey ────────────────────────────────────
  async getPublicBalance(req, res) {
    try {
      const { publicKey } = req.params;
      if (!publicKey || publicKey.length < 10) {
        return res.status(400).json({ error: 'Invalid public key', code: 'INVALID_KEY' });
      }
      const result = await this.walletService.getPublicBalance(publicKey);
      res.json(result);
    } catch (err) {
      console.error('getPublicBalance error:', err);
      res.status(500).json({ error: 'Failed to fetch balance', code: 'BALANCE_ERROR' });
    }
  }

  // ── GET /api/wallet/faucet/status ─────────────────────────────────────────
  async getFaucetStatus(req, res) {
    try {
      const publicKey = req.user.publicKey;
      const status    = await this.walletService.getFaucetStatus(publicKey);
      res.json(status);
    } catch (err) {
      console.error('getFaucetStatus error:', err);
      res.status(500).json({ error: 'Failed to fetch faucet status', code: 'FAUCET_STATUS_ERROR' });
    }
  }

  // ── POST /api/wallet/faucet ───────────────────────────────────────────────
  async claimFaucet(req, res) {
    try {
      const publicKey = req.user.publicKey;
      const result    = await this.walletService.claimFaucet(publicKey);

      // Push real-time balance update to the owner
      this.wsManager.broadcastToUser(publicKey, {
        type: 'wallet_update',
        data: { publicKey, balance: result.newBalance }
      });

      res.json(result);
    } catch (err) {
      if (err.code === 'FAUCET_COOLDOWN') {
        return res.status(429).json({
          error:       err.message,
          code:        err.code,
          nextClaimAt: err.nextClaimAt
        });
      }
      console.error('claimFaucet error:', err);
      res.status(500).json({ error: 'Faucet claim failed', code: 'FAUCET_ERROR' });
    }
  }

  // ── POST /api/wallet/transfer ─────────────────────────────────────────────
  async transfer(req, res) {
    try {
      const senderKey                      = req.user.publicKey;
      const { recipientKey, amount, memo, signature } = req.body;

      // ── Input validation ──────────────────────────────────────────────────
      if (!recipientKey || typeof recipientKey !== 'string') {
        return res.status(400).json({ error: 'recipientKey is required', code: 'MISSING_RECIPIENT' });
      }
      if (!amount || isNaN(parseInt(amount, 10))) {
        return res.status(400).json({ error: 'amount must be a positive integer', code: 'INVALID_AMOUNT' });
      }
      if (!signature) {
        return res.status(400).json({ error: 'signature is required', code: 'MISSING_SIGNATURE' });
      }

      const amt = parseInt(amount, 10);

      // ── Verify signature ──────────────────────────────────────────────────
      // The client signs: `transfer:<recipientKey>:<amount>:<memo|''>`
      const cleanMemo       = memo ? String(memo).slice(0, 280) : '';
      const transferMessage = `transfer:${recipientKey}:${amt}:${cleanMemo}`;

      if (!this.verifySignature(transferMessage, signature, senderKey)) {
        return res.status(401).json({ error: 'Invalid signature', code: 'INVALID_SIGNATURE' });
      }

      // ── Execute transfer ──────────────────────────────────────────────────
      const result = await this.walletService.transfer({
        senderKey,
        recipientKey,
        amount: amt,
        memo:   cleanMemo || null,
        signature
      });

      // Push real-time balance updates to both parties
      this.wsManager.broadcastToUser(senderKey, {
        type: 'wallet_update',
        data: { publicKey: senderKey, balance: result.newSenderBalance }
      });
      this.wsManager.broadcastToUser(recipientKey, {
        type: 'wallet_update',
        data: { publicKey: recipientKey, balance: result.newRecipientBalance }
      });

      res.json(result);
    } catch (err) {
      const clientCodes = ['INVALID_RECIPIENT', 'SELF_TRANSFER', 'INVALID_AMOUNT',
                           'AMOUNT_TOO_LARGE', 'INSUFFICIENT_BALANCE'];
      if (clientCodes.includes(err.code)) {
        return res.status(400).json({
          error:     err.message,
          code:      err.code,
          available: err.available
        });
      }
      console.error('transfer error:', err);
      res.status(500).json({ error: 'Transfer failed', code: 'TRANSFER_ERROR' });
    }
  }

  // ── GET /api/wallet/transactions ──────────────────────────────────────────
  async getTransactionHistory(req, res) {
    try {
      const publicKey = req.user.publicKey;
      const limit     = req.query.limit;
      const offset    = req.query.offset;
      const result    = await this.walletService.getTransactionHistory(publicKey, { limit, offset });
      res.json(result);
    } catch (err) {
      console.error('getTransactionHistory error:', err);
      res.status(500).json({ error: 'Failed to fetch transactions', code: 'TX_HISTORY_ERROR' });
    }
  }

  // ── GET /api/wallet/transactions/:txUuid ──────────────────────────────────
  async getTransaction(req, res) {
    try {
      const { txUuid } = req.params;
      const tx         = await this.walletService.getTransaction(txUuid);
      res.json(tx);
    } catch (err) {
      if (err.code === 'TX_NOT_FOUND') {
        return res.status(404).json({ error: err.message, code: err.code });
      }
      console.error('getTransaction error:', err);
      res.status(500).json({ error: 'Failed to fetch transaction', code: 'TX_ERROR' });
    }
  }
}

module.exports = WalletController;
