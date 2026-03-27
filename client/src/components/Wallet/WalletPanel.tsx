/**
 * WalletPanel — the full wallet view shown when the user navigates to "Wallet".
 *
 * Displays:
 *   - Current UBT balance (with copy-address button)
 *   - Faucet claim button with cooldown
 *   - "Send UBT" button → SendModal
 *   - Full transaction history
 *
 * Real-time balance updates arrive via the WebSocket `wallet_update` message
 * and are handled in App.tsx, which passes the updated balance as a prop.
 */

import { useState, useEffect } from 'react';
import { WalletService } from '../../services/WalletService';
import { FaucetButton }       from './FaucetButton';
import { SendModal }          from './SendModal';
import { TransactionHistory } from './TransactionHistory';
import type { FaucetStatus, Wallet } from '../../types';

interface Props {
  publicKey:   string;
  accessToken: string;
  cryptoManager: any;
  /** Optional: override balance from parent (WebSocket push) */
  liveBalance?: number | null;
}

export function WalletPanel({ publicKey, accessToken, cryptoManager, liveBalance }: Props) {
  const [wallet,       setWallet]       = useState<Wallet | null>(null);
  const [faucetStatus, setFaucetStatus] = useState<FaucetStatus | null>(null);
  const [sendOpen,     setSendOpen]     = useState(false);
  const [isLoading,    setIsLoading]    = useState(true);
  const [error,        setError]        = useState('');
  const [copied,       setCopied]       = useState(false);
  // Key to force-remount TransactionHistory after a new tx
  const [txKey,        setTxKey]        = useState(0);

  const walletService = new WalletService(accessToken, cryptoManager);

  const loadWallet = async () => {
    setIsLoading(true);
    setError('');
    try {
      const [w, fs] = await Promise.all([
        walletService.getWallet(),
        walletService.getFaucetStatus(),
      ]);
      setWallet(w);
      setFaucetStatus(fs);
    } catch (err: any) {
      setError(err.message || 'Failed to load wallet');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadWallet(); }, [publicKey]);

  // Apply live balance override from WebSocket
  useEffect(() => {
    if (liveBalance != null && wallet) {
      setWallet(prev => prev ? { ...prev, balance: liveBalance } : prev);
    }
  }, [liveBalance]);

  const handleFaucetClaimed = (newBalance: number) => {
    setWallet(prev => prev ? { ...prev, balance: newBalance } : prev);
    setTxKey(k => k + 1);
  };

  const handleSendSuccess = (newBalance: number) => {
    setWallet(prev => prev ? { ...prev, balance: newBalance } : prev);
    setTxKey(k => k + 1);
  };

  const copyAddress = () => {
    navigator.clipboard.writeText(publicKey).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (isLoading) {
    return (
      <div className="wallet-panel">
        <div className="wallet-loading">
          <span className="loading-spinner-sm" /> Loading wallet…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="wallet-panel">
        <div className="wallet-error-banner">{error}</div>
        <button className="btn btn-secondary btn-sm" onClick={loadWallet}>Retry</button>
      </div>
    );
  }

  const balance = wallet?.balance ?? 0;

  return (
    <div className="wallet-panel">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="wallet-header">
        <h2 className="text-green wallet-title">Wallet</h2>
        <button className="btn btn-secondary btn-sm" onClick={loadWallet} title="Refresh">
          ↻
        </button>
      </div>

      {/* ── Balance card ────────────────────────────────────────────── */}
      <div className="wallet-balance-card card">
        <div className="wallet-balance-label text-muted text-sm">Available Balance</div>
        <div className="wallet-balance-amount">
          <span className="wallet-balance-number">{balance.toLocaleString()}</span>
          <span className="wallet-balance-symbol text-muted"> UBT</span>
        </div>

        <div className="wallet-address-row">
          <span className="wallet-address technical text-sm text-muted">
            {publicKey.slice(0, 12)}…{publicKey.slice(-12)}
          </span>
          <button
            className="btn btn-secondary btn-sm wallet-copy-btn"
            onClick={copyAddress}
            title="Copy full address"
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
      </div>

      {/* ── Action buttons ──────────────────────────────────────────── */}
      <div className="wallet-actions">
        <button
          className="btn btn-primary wallet-send-btn"
          onClick={() => setSendOpen(true)}
          disabled={balance === 0}
        >
          ↑ Send
        </button>

        <FaucetButton
          walletService={walletService}
          faucetStatus={faucetStatus}
          onClaimed={handleFaucetClaimed}
          onStatusUpdate={setFaucetStatus}
        />
      </div>

      {/* ── Transaction history ──────────────────────────────────────── */}
      <div className="wallet-tx-section">
        <h3 className="text-green wallet-section-title">Transaction History</h3>
        <TransactionHistory
          key={txKey}
          walletService={walletService}
          publicKey={publicKey}
        />
      </div>

      {/* ── Send modal ───────────────────────────────────────────────── */}
      <SendModal
        isOpen={sendOpen}
        onClose={() => setSendOpen(false)}
        walletService={walletService}
        currentBalance={balance}
        onSuccess={handleSendSuccess}
      />
    </div>
  );
}

export default WalletPanel;
