/**
 * WalletService — client-side API client for all /api/wallet endpoints.
 *
 * All mutating calls (faucet, transfer) require an accessToken and
 * a CryptoManager instance so signatures can be computed before sending.
 */

import { getApiUrl } from '../config';
import type {
  Wallet,
  Transaction,
  TransactionPage,
  FaucetStatus,
  TransferResult,
} from '../types';

export class WalletService {
  private accessToken: string;
  private cryptoManager: any;  // CryptoManager instance

  constructor(accessToken: string, cryptoManager: any) {
    this.accessToken   = accessToken;
    this.cryptoManager = cryptoManager;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private authHeaders(): Record<string, string> {
    return {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${this.accessToken}`,
    };
  }

  private async handleResponse<T>(res: Response): Promise<T> {
    const body = await res.json();
    if (!res.ok) {
      const err: any = new Error(body.error || `HTTP ${res.status}`);
      err.code      = body.code;
      err.available = body.available;
      err.nextClaimAt = body.nextClaimAt;
      throw err;
    }
    return body as T;
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  /** Fetch the authenticated user's wallet. */
  async getWallet(): Promise<Wallet> {
    const res = await fetch(getApiUrl('/api/wallet'), {
      headers: this.authHeaders(),
    });
    return this.handleResponse<Wallet>(res);
  }

  /** Fetch the public balance of any address. */
  async getPublicBalance(publicKey: string): Promise<{ publicKey: string; balance: number; symbol: string }> {
    const res = await fetch(getApiUrl(`/api/wallet/balance/${encodeURIComponent(publicKey)}`));
    return this.handleResponse(res);
  }

  /** Check whether the authenticated user can claim from the faucet. */
  async getFaucetStatus(): Promise<FaucetStatus> {
    const res = await fetch(getApiUrl('/api/wallet/faucet/status'), {
      headers: this.authHeaders(),
    });
    return this.handleResponse<FaucetStatus>(res);
  }

  /** Paginated transaction history for the authenticated user. */
  async getTransactions(limit = 50, offset = 0): Promise<TransactionPage> {
    const url = getApiUrl(`/api/wallet/transactions?limit=${limit}&offset=${offset}`);
    const res = await fetch(url, { headers: this.authHeaders() });
    return this.handleResponse<TransactionPage>(res);
  }

  /** Fetch a single transaction by UUID (public). */
  async getTransaction(txUuid: string): Promise<Transaction> {
    const res = await fetch(getApiUrl(`/api/wallet/transactions/${encodeURIComponent(txUuid)}`));
    return this.handleResponse<Transaction>(res);
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  /** Claim free UBT from the faucet. */
  async claimFaucet(): Promise<{ success: boolean; amount: number; newBalance: number; txUuid: string; nextClaimAt: string }> {
    const res = await fetch(getApiUrl('/api/wallet/faucet'), {
      method:  'POST',
      headers: this.authHeaders(),
      body:    JSON.stringify({}),
    });
    return this.handleResponse(res);
  }

  /**
   * Transfer UBT to another address.
   *
   * Signs the canonical message:
   *   `transfer:<recipientKey>:<amount>:<memo|''>`
   * with the user's private key before submitting.
   */
  async transfer(recipientKey: string, amount: number, memo?: string): Promise<TransferResult> {
    const cleanMemo       = memo ? memo.slice(0, 280) : '';
    const transferMessage = `transfer:${recipientKey}:${amount}:${cleanMemo}`;

    const sig = await this.cryptoManager.signMessage(transferMessage);

    const res = await fetch(getApiUrl('/api/wallet/transfer'), {
      method:  'POST',
      headers: this.authHeaders(),
      body:    JSON.stringify({
        recipientKey,
        amount,
        memo:      cleanMemo || undefined,
        signature: sig.signature,
      }),
    });
    return this.handleResponse<TransferResult>(res);
  }
}
