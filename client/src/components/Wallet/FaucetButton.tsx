/**
 * FaucetButton — claims free UBT and shows cooldown state.
 */

import { useState } from 'react';
import type { WalletService } from '../../services/WalletService';
import type { FaucetStatus } from '../../types';

interface Props {
  walletService:  WalletService;
  faucetStatus:   FaucetStatus | null;
  onClaimed:      (newBalance: number) => void;
  onStatusUpdate: (status: FaucetStatus) => void;
}

function formatCountdown(remainingMs: number): string {
  if (remainingMs <= 0) return '0s';
  const h = Math.floor(remainingMs / 3_600_000);
  const m = Math.floor((remainingMs % 3_600_000) / 60_000);
  const s = Math.floor((remainingMs % 60_000) / 1000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function FaucetButton({ walletService, faucetStatus, onClaimed, onStatusUpdate }: Props) {
  const [isLoading, setIsLoading] = useState(false);
  const [message,   setMessage]   = useState('');

  const canClaim = faucetStatus?.canClaim ?? true;

  const handleClaim = async () => {
    if (!canClaim || isLoading) return;
    setIsLoading(true);
    setMessage('');
    try {
      const result = await walletService.claimFaucet();
      onClaimed(result.newBalance);
      setMessage(`+${result.amount} UBT claimed!`);
      // Refresh faucet status
      const newStatus = await walletService.getFaucetStatus();
      onStatusUpdate(newStatus);
      setTimeout(() => setMessage(''), 4000);
    } catch (err: any) {
      if (err.code === 'FAUCET_COOLDOWN') {
        setMessage(`Next claim: ${new Date(err.nextClaimAt).toLocaleTimeString()}`);
        const newStatus = await walletService.getFaucetStatus().catch(() => null);
        if (newStatus) onStatusUpdate(newStatus);
      } else {
        setMessage(err.message || 'Claim failed');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="faucet-section">
      <button
        className={`btn faucet-btn ${canClaim ? 'btn-primary' : 'btn-secondary'}`}
        onClick={handleClaim}
        disabled={!canClaim || isLoading}
        title={canClaim ? `Claim ${faucetStatus?.faucetAmount ?? 100} UBT` : 'Faucet on cooldown'}
      >
        {isLoading ? (
          <span className="loading-spinner-sm" />
        ) : (
          <span className="faucet-icon">⛽</span>
        )}
        {canClaim ? `Claim ${faucetStatus?.faucetAmount ?? 100} UBT` : 'Faucet Used'}
      </button>

      {!canClaim && faucetStatus?.remainingMs !== undefined && faucetStatus.remainingMs > 0 && (
        <div className="faucet-cooldown technical text-muted text-sm">
          Next claim in {formatCountdown(faucetStatus.remainingMs)}
        </div>
      )}

      {message && (
        <div className={`faucet-message text-sm ${message.startsWith('+') ? 'text-green' : 'text-error'}`}>
          {message}
        </div>
      )}
    </div>
  );
}

export default FaucetButton;
