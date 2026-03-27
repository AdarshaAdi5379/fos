/**
 * SendModal — modal dialog for sending UBT to another address.
 * Validates input, shows a live balance preview, and submits via WalletService.
 */

import { useState } from 'react';
import type { WalletService } from '../../services/WalletService';

interface Props {
  isOpen:        boolean;
  onClose:       () => void;
  walletService: WalletService;
  currentBalance: number;
  onSuccess:     (newBalance: number) => void;
}

export function SendModal({ isOpen, onClose, walletService, currentBalance, onSuccess }: Props) {
  const [recipient, setRecipient] = useState('');
  const [amount,    setAmount]    = useState('');
  const [memo,      setMemo]      = useState('');
  const [error,     setError]     = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const parsedAmount = parseInt(amount, 10);
  const amountValid  = !isNaN(parsedAmount) && parsedAmount > 0 && parsedAmount <= currentBalance;
  const canSubmit    = recipient.trim().length > 10 && amountValid && !isLoading;

  const handleSend = async () => {
    setError('');
    setIsLoading(true);
    try {
      const result = await walletService.transfer(recipient.trim(), parsedAmount, memo.trim() || undefined);
      onSuccess(result.newSenderBalance);
      setRecipient('');
      setAmount('');
      setMemo('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Transfer failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (isLoading) return;
    setError('');
    setRecipient('');
    setAmount('');
    setMemo('');
    onClose();
  };

  return (
    <div className="modal-overlay open" onClick={handleClose}>
      <div className="modal wallet-modal fade-in" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="text-green">Send UBT</h3>
          <button className="btn btn-sm btn-secondary" onClick={handleClose} disabled={isLoading}>
            ×
          </button>
        </div>

        <div className="modal-content">
          {error && (
            <div className="wallet-error-banner">
              {error}
            </div>
          )}

          <div className="wallet-field">
            <label className="wallet-label">Recipient Public Key</label>
            <textarea
              className="input wallet-recipient-input"
              placeholder="Paste the recipient's full public key..."
              value={recipient}
              onChange={e => setRecipient(e.target.value)}
              rows={3}
              disabled={isLoading}
            />
          </div>

          <div className="wallet-field">
            <label className="wallet-label">Amount (UBT)</label>
            <div className="wallet-amount-row">
              <input
                className="input wallet-amount-input"
                type="number"
                min={1}
                max={currentBalance}
                placeholder="0"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                disabled={isLoading}
              />
              <button
                className="btn btn-secondary btn-sm wallet-max-btn"
                onClick={() => setAmount(String(currentBalance))}
                disabled={isLoading || currentBalance === 0}
              >
                MAX
              </button>
            </div>
            <div className="wallet-hint">
              Available: <span className="text-green">{currentBalance.toLocaleString()} UBT</span>
              {parsedAmount > 0 && amountValid && (
                <span className="wallet-after-send">
                  {' '}→ after send: {(currentBalance - parsedAmount).toLocaleString()} UBT
                </span>
              )}
              {parsedAmount > currentBalance && (
                <span className="text-error"> Insufficient balance</span>
              )}
            </div>
          </div>

          <div className="wallet-field">
            <label className="wallet-label">Memo <span className="wallet-optional">(optional)</span></label>
            <input
              className="input"
              type="text"
              placeholder="Add a note..."
              value={memo}
              onChange={e => setMemo(e.target.value.slice(0, 280))}
              disabled={isLoading}
            />
            <div className="wallet-hint">{memo.length}/280</div>
          </div>

          <div className="wallet-send-actions">
            <button
              className="btn btn-secondary"
              onClick={handleClose}
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSend}
              disabled={!canSubmit}
            >
              {isLoading ? <span className="loading-spinner-sm" /> : null}
              {isLoading ? 'Sending…' : `Send ${parsedAmount > 0 ? parsedAmount.toLocaleString() : ''} UBT`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SendModal;
