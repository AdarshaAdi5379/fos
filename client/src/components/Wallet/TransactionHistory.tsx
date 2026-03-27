/**
 * TransactionHistory — paginated list of sent/received transactions.
 */

import { useState, useEffect, useCallback } from 'react';
import type { WalletService } from '../../services/WalletService';
import type { Transaction, TransactionPage } from '../../types';

interface Props {
  walletService: WalletService;
  publicKey:     string;
}

function shortKey(key: string | null): string {
  if (!key) return 'Faucet';
  return key.length > 16 ? `${key.slice(0, 8)}…${key.slice(-8)}` : key;
}

function TxRow({ tx }: { tx: Transaction; publicKey: string }) {
  const isSent      = tx.direction === 'sent';
  const isFaucet    = tx.type === 'faucet';
  const counterpart = isSent ? tx.recipient_key : tx.sender_key;

  return (
    <div className={`tx-row ${isSent ? 'tx-sent' : 'tx-received'}`}>
      <div className="tx-icon">{isFaucet ? '⛽' : isSent ? '↑' : '↓'}</div>
      <div className="tx-details">
        <div className="tx-counterpart technical text-sm">
          {isFaucet
            ? 'Faucet'
            : isSent
              ? `To: ${shortKey(counterpart)}`
              : `From: ${shortKey(counterpart)}`
          }
        </div>
        {tx.memo && <div className="tx-memo text-muted text-sm">"{tx.memo}"</div>}
        <div className="tx-date text-muted text-sm">
          {new Date(tx.created_at).toLocaleString()}
        </div>
      </div>
      <div className={`tx-amount ${isSent ? 'text-error' : 'text-green'}`}>
        {isSent ? '-' : '+'}{tx.amount.toLocaleString()} UBT
      </div>
    </div>
  );
}

export function TransactionHistory({ walletService, publicKey }: Props) {
  const [page,      setPage]      = useState<TransactionPage | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error,     setError]     = useState('');
  const [offset,    setOffset]    = useState(0);
  const LIMIT = 20;

  const load = useCallback(async (off: number) => {
    setIsLoading(true);
    setError('');
    try {
      const result = await walletService.getTransactions(LIMIT, off);
      setPage(result);
    } catch (err: any) {
      setError(err.message || 'Failed to load transactions');
    } finally {
      setIsLoading(false);
    }
  }, [walletService]);

  useEffect(() => { load(offset); }, [load, offset]);

  const prevPage = () => {
    const newOffset = Math.max(0, offset - LIMIT);
    setOffset(newOffset);
  };
  const nextPage = () => {
    if (page?.pagination.hasMore) setOffset(offset + LIMIT);
  };

  if (isLoading && !page) {
    return <div className="tx-loading text-muted">Loading transactions…</div>;
  }

  if (error) {
    return <div className="tx-error text-error">{error}</div>;
  }

  if (!page || page.transactions.length === 0) {
    return (
      <div className="tx-empty">
        <div className="empty-state-icon">📭</div>
        <p className="text-muted">No transactions yet.</p>
        <p className="text-muted text-sm">Claim from the faucet or receive UBT from another user.</p>
      </div>
    );
  }

  return (
    <div className="tx-history">
      <div className="tx-list">
        {page.transactions.map(tx => (
          <TxRow key={tx.tx_uuid} tx={tx} publicKey={publicKey} />
        ))}
      </div>

      {(page.pagination.total > LIMIT) && (
        <div className="tx-pagination">
          <button
            className="btn btn-secondary btn-sm"
            onClick={prevPage}
            disabled={offset === 0 || isLoading}
          >
            ← Prev
          </button>
          <span className="text-muted text-sm">
            {offset + 1}–{Math.min(offset + LIMIT, page.pagination.total)} of {page.pagination.total}
          </span>
          <button
            className="btn btn-secondary btn-sm"
            onClick={nextPage}
            disabled={!page.pagination.hasMore || isLoading}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

export default TransactionHistory;
