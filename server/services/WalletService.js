/**
 * WalletService
 *
 * Manages UBT (Unbound Token) balances, peer-to-peer transfers,
 * faucet claims, and transaction history.
 *
 * Design rules:
 *  - All amounts are integers (no floating-point coin arithmetic).
 *  - Every transfer is cryptographically signed by the sender.
 *  - Transfers execute inside a SQLite transaction for atomicity;
 *    a failure rolls back both the debit and the credit.
 *  - The faucet grants FAUCET_AMOUNT UBT once every FAUCET_COOLDOWN_MS.
 *  - Wallets are created on first use (lazy initialisation).
 */

const crypto = require('crypto');

// ── Constants ──────────────────────────────────────────────────────────────
const FAUCET_AMOUNT      = 100;                    // UBT per claim
const FAUCET_COOLDOWN_MS = 24 * 60 * 60 * 1000;   // 24 hours
const MAX_TRANSFER_AMOUNT = 1_000_000;             // sanity cap per tx
const TX_MEMO_MAX_LEN    = 280;                    // same as a post

class WalletService {
  constructor(database) {
    this.db = database;
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  /**
   * Ensure a wallet row exists for the given public key.
   * Creates it with balance = 0 if it does not exist yet.
   */
  async _ensureWallet(publicKey) {
    await this.db.query(
      `INSERT OR IGNORE INTO wallets (public_key, balance) VALUES (?, 0)`,
      [publicKey]
    );
  }

  /**
   * Return the current integer balance for a public key.
   * Creates the wallet row first if absent.
   */
  async _getBalance(publicKey) {
    await this._ensureWallet(publicKey);
    const rows = await this.db.query(
      `SELECT balance FROM wallets WHERE public_key = ?`,
      [publicKey]
    );
    return rows[0].balance;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * GET /api/wallet
   * Returns the wallet summary for the authenticated user.
   */
  async getWallet(publicKey) {
    await this._ensureWallet(publicKey);
    const rows = await this.db.query(
      `SELECT public_key, balance, created_at, updated_at
       FROM wallets WHERE public_key = ?`,
      [publicKey]
    );
    const wallet = rows[0];
    return {
      publicKey:  wallet.public_key,
      balance:    wallet.balance,
      symbol:     'UBT',
      createdAt:  wallet.created_at,
      updatedAt:  wallet.updated_at
    };
  }

  /**
   * GET /api/wallet/balance/:publicKey
   * Returns the public balance of any address (read-only, no auth required).
   */
  async getPublicBalance(publicKey) {
    await this._ensureWallet(publicKey);
    const rows = await this.db.query(
      `SELECT balance FROM wallets WHERE public_key = ?`,
      [publicKey]
    );
    return { publicKey, balance: rows[0].balance, symbol: 'UBT' };
  }

  /**
   * POST /api/wallet/faucet
   * Claims free UBT. Limited to once per FAUCET_COOLDOWN_MS per key.
   */
  async claimFaucet(publicKey) {
    // Check cooldown
    const cutoff = new Date(Date.now() - FAUCET_COOLDOWN_MS).toISOString();
    const recent = await this.db.query(
      `SELECT id FROM faucet_claims
       WHERE public_key = ? AND claimed_at > ?
       LIMIT 1`,
      [publicKey, cutoff]
    );

    if (recent.length > 0) {
      const lastClaim = await this.db.query(
        `SELECT claimed_at FROM faucet_claims
         WHERE public_key = ?
         ORDER BY claimed_at DESC LIMIT 1`,
        [publicKey]
      );
      const claimedAt  = new Date(lastClaim[0].claimed_at).getTime();
      const nextClaim  = new Date(claimedAt + FAUCET_COOLDOWN_MS);
      throw Object.assign(
        new Error('Faucet cooldown active. Try again after ' + nextClaim.toISOString()),
        { code: 'FAUCET_COOLDOWN', nextClaimAt: nextClaim.toISOString() }
      );
    }

    await this._ensureWallet(publicKey);

    const txUuid = crypto.randomUUID();

    // Atomic: credit wallet + record faucet claim + record transaction
    await this.db.query('BEGIN', []);
    try {
      await this.db.query(
        `UPDATE wallets
         SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP
         WHERE public_key = ?`,
        [FAUCET_AMOUNT, publicKey]
      );

      await this.db.query(
        `INSERT INTO faucet_claims (public_key, amount) VALUES (?, ?)`,
        [publicKey, FAUCET_AMOUNT]
      );

      await this.db.query(
        `INSERT INTO transactions
           (tx_uuid, sender_key, recipient_key, amount, type, memo, signature, status)
         VALUES (?, NULL, ?, ?, 'faucet', 'Faucet claim', 'faucet', 'confirmed')`,
        [txUuid, publicKey, FAUCET_AMOUNT]
      );

      await this.db.query('COMMIT', []);
    } catch (err) {
      await this.db.query('ROLLBACK', []);
      throw err;
    }

    const newBalance = await this._getBalance(publicKey);
    return {
      success:    true,
      amount:     FAUCET_AMOUNT,
      newBalance,
      txUuid,
      nextClaimAt: new Date(Date.now() + FAUCET_COOLDOWN_MS).toISOString()
    };
  }

  /**
   * POST /api/wallet/transfer
   * Transfers UBT from sender to recipient.
   *
   * The caller must provide a signature over the canonical transfer message:
   *   `transfer:<txUuid>:<senderKey>:<recipientKey>:<amount>:<memo>`
   *
   * The server verifies the signature with ServerCrypto.verifySignature
   * before calling this method, so `signature` here is stored for the
   * on-chain record only.
   */
  async transfer({ senderKey, recipientKey, amount, memo, signature }) {
    // ── Validate inputs ───────────────────────────────────────────────────
    if (!recipientKey || typeof recipientKey !== 'string') {
      throw Object.assign(new Error('Invalid recipient'), { code: 'INVALID_RECIPIENT' });
    }
    if (senderKey === recipientKey) {
      throw Object.assign(new Error('Cannot transfer to yourself'), { code: 'SELF_TRANSFER' });
    }

    const amt = parseInt(amount, 10);
    if (!Number.isInteger(amt) || amt <= 0) {
      throw Object.assign(new Error('Amount must be a positive integer'), { code: 'INVALID_AMOUNT' });
    }
    if (amt > MAX_TRANSFER_AMOUNT) {
      throw Object.assign(
        new Error(`Amount exceeds maximum of ${MAX_TRANSFER_AMOUNT} UBT per transaction`),
        { code: 'AMOUNT_TOO_LARGE' }
      );
    }

    const cleanMemo = memo ? String(memo).slice(0, TX_MEMO_MAX_LEN) : null;

    // ── Check sender balance ──────────────────────────────────────────────
    await this._ensureWallet(senderKey);
    await this._ensureWallet(recipientKey);

    const senderBalance = await this._getBalance(senderKey);
    if (senderBalance < amt) {
      throw Object.assign(
        new Error(`Insufficient balance. Have ${senderBalance} UBT, need ${amt} UBT`),
        { code: 'INSUFFICIENT_BALANCE', available: senderBalance }
      );
    }

    const txUuid = crypto.randomUUID();

    // ── Atomic debit + credit + ledger entry ──────────────────────────────
    await this.db.query('BEGIN', []);
    try {
      await this.db.query(
        `UPDATE wallets
         SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP
         WHERE public_key = ?`,
        [amt, senderKey]
      );

      await this.db.query(
        `UPDATE wallets
         SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP
         WHERE public_key = ?`,
        [amt, recipientKey]
      );

      await this.db.query(
        `INSERT INTO transactions
           (tx_uuid, sender_key, recipient_key, amount, type, memo, signature, status)
         VALUES (?, ?, ?, ?, 'transfer', ?, ?, 'confirmed')`,
        [txUuid, senderKey, recipientKey, amt, cleanMemo, signature]
      );

      await this.db.query('COMMIT', []);
    } catch (err) {
      await this.db.query('ROLLBACK', []);
      throw err;
    }

    const newSenderBalance    = await this._getBalance(senderKey);
    const newRecipientBalance = await this._getBalance(recipientKey);

    return {
      success:           true,
      txUuid,
      amount:            amt,
      memo:              cleanMemo,
      senderKey,
      recipientKey,
      newSenderBalance,
      newRecipientBalance,
      timestamp:         new Date().toISOString()
    };
  }

  /**
   * GET /api/wallet/transactions
   * Returns paginated transaction history for the authenticated user
   * (both sent and received), newest first.
   */
  async getTransactionHistory(publicKey, { limit = 50, offset = 0 } = {}) {
    const safeLimit  = Math.min(parseInt(limit,  10) || 50,  200);
    const safeOffset = Math.max(parseInt(offset, 10) || 0,   0);

    const rows = await this.db.query(
      `SELECT
         tx_uuid, sender_key, recipient_key, amount, type, memo,
         status, created_at,
         CASE
           WHEN sender_key    = ? THEN 'sent'
           WHEN recipient_key = ? THEN 'received'
           ELSE 'other'
         END AS direction
       FROM transactions
       WHERE sender_key = ? OR recipient_key = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [publicKey, publicKey, publicKey, publicKey, safeLimit, safeOffset]
    );

    const countRows = await this.db.query(
      `SELECT COUNT(*) as total
       FROM transactions
       WHERE sender_key = ? OR recipient_key = ?`,
      [publicKey, publicKey]
    );

    return {
      transactions: rows,
      pagination: {
        total:   countRows[0].total,
        limit:   safeLimit,
        offset:  safeOffset,
        hasMore: safeOffset + rows.length < countRows[0].total
      }
    };
  }

  /**
   * GET /api/wallet/transactions/:txUuid
   * Returns a single transaction by UUID (public, no auth required).
   */
  async getTransaction(txUuid) {
    const rows = await this.db.query(
      `SELECT * FROM transactions WHERE tx_uuid = ?`,
      [txUuid]
    );
    if (rows.length === 0) {
      throw Object.assign(new Error('Transaction not found'), { code: 'TX_NOT_FOUND' });
    }
    return rows[0];
  }

  /**
   * GET /api/wallet/faucet/status
   * Returns whether the caller can claim from the faucet right now.
   */
  async getFaucetStatus(publicKey) {
    const cutoff = new Date(Date.now() - FAUCET_COOLDOWN_MS).toISOString();
    const recent = await this.db.query(
      `SELECT claimed_at FROM faucet_claims
       WHERE public_key = ? AND claimed_at > ?
       ORDER BY claimed_at DESC LIMIT 1`,
      [publicKey, cutoff]
    );

    if (recent.length === 0) {
      return { canClaim: true, faucetAmount: FAUCET_AMOUNT, cooldownMs: FAUCET_COOLDOWN_MS };
    }

    const claimedAt = new Date(recent[0].claimed_at).getTime();
    const nextClaimAt = new Date(claimedAt + FAUCET_COOLDOWN_MS);
    return {
      canClaim:     false,
      faucetAmount: FAUCET_AMOUNT,
      cooldownMs:   FAUCET_COOLDOWN_MS,
      lastClaimedAt: recent[0].claimed_at,
      nextClaimAt:  nextClaimAt.toISOString(),
      remainingMs:  Math.max(0, nextClaimAt.getTime() - Date.now())
    };
  }
}

module.exports = WalletService;
