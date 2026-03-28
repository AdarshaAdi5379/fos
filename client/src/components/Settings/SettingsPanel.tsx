import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { FeedHeader } from '../Feed/FeedHeader';
import { getApiUrl } from '../../config';
import type { CryptoManager } from '../../crypto/CryptoManager';

type SafetyPreferences = {
  show_sensitive_content: boolean;
  hide_blocked_content: boolean;
  auto_filter_keywords: boolean;
  block_new_accounts: boolean;
};

type InfoModal = {
  title: string;
  body: string;
} | null;

function readBool(key: string, fallback: boolean) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return raw === 'true';
  } catch {
    return fallback;
  }
}

function readString(key: string, fallback: string) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : raw;
  } catch {
    return fallback;
  }
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadJsonFile(filename: string, data: unknown) {
  const content = JSON.stringify(data, null, 2);
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function deleteIndexedDb(name: string) {
  return new Promise<void>((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}

function SettingRow({
  title,
  description,
  right,
  onClick,
  disabled,
}: {
  title: string;
  description?: string;
  right?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`settings-row ${disabled ? 'is-disabled' : ''}`}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
    >
      <div className="settings-row-main">
        <div className="settings-row-title">{title}</div>
        {description ? <div className="settings-row-desc">{description}</div> : null}
      </div>
      <div className="settings-row-right">{right}</div>
    </button>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
  disabled,
  badge,
}: {
  title: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  badge?: string;
}) {
  return (
    <div className={`settings-row is-static ${disabled ? 'is-disabled' : ''}`}>
      <div className="settings-row-main">
        <div className="settings-row-title">
          {title} {badge ? <span className="settings-badge">{badge}</span> : null}
        </div>
        {description ? <div className="settings-row-desc">{description}</div> : null}
      </div>
      <label className="settings-switch">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
        />
        <span className="settings-slider" aria-hidden="true" />
      </label>
    </div>
  );
}

export function SettingsPanel({
  publicKey,
  accessToken,
  cryptoManager,
  onLogout,
}: {
  publicKey: string;
  accessToken: string | null;
  cryptoManager: CryptoManager;
  onLogout: () => void;
}) {
  const seedPhrase = useMemo(() => cryptoManager.getSeedPhrase?.() ?? '', [cryptoManager, publicKey]);

  const [seedVisible, setSeedVisible] = useState(false);
  const [seedCopied, setSeedCopied] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<string>('');

  const [infoModal, setInfoModal] = useState<InfoModal>(null);

  const [markPostsSensitive, setMarkPostsSensitive] = useState(() =>
    readBool('unbound.settings.mark_posts_sensitive', false)
  );

  const [twoFactorEnabled, setTwoFactorEnabled] = useState(() =>
    readBool('unbound.settings.2fa.enabled', false)
  );
  const [twoFactorMethod, setTwoFactorMethod] = useState(() =>
    readString('unbound.settings.2fa.method', 'authenticator')
  );

  const [safetyLoading, setSafetyLoading] = useState(false);
  const [safetySaving, setSafetySaving] = useState(false);
  const [safety, setSafety] = useState<SafetyPreferences>({
    show_sensitive_content: false,
    hide_blocked_content: true,
    auto_filter_keywords: true,
    block_new_accounts: false,
  });

  const [pwdCurrent, setPwdCurrent] = useState('');
  const [pwdNext, setPwdNext] = useState('');
  const [pwdNext2, setPwdNext2] = useState('');
  const [pwdBusy, setPwdBusy] = useState(false);

  const flashMsg = (msg: string) => {
    setSettingsMsg(msg);
    window.setTimeout(() => setSettingsMsg(''), 2500);
  };

  useEffect(() => {
    try {
      localStorage.setItem('unbound.settings.mark_posts_sensitive', String(markPostsSensitive));
    } catch {
      // ignore
    }
  }, [markPostsSensitive]);

  useEffect(() => {
    try {
      localStorage.setItem('unbound.settings.2fa.enabled', String(twoFactorEnabled));
      localStorage.setItem('unbound.settings.2fa.method', twoFactorMethod);
    } catch {
      // ignore
    }
  }, [twoFactorEnabled, twoFactorMethod]);

  const loadSafety = async () => {
    if (!accessToken) return;
    setSafetyLoading(true);
    try {
      const res = await fetch(getApiUrl('/api/safety/preferences'), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to load safety preferences');
      if (json?.data) {
        setSafety({
          show_sensitive_content: !!json.data.show_sensitive_content,
          hide_blocked_content: !!json.data.hide_blocked_content,
          auto_filter_keywords: !!json.data.auto_filter_keywords,
          block_new_accounts: !!json.data.block_new_accounts,
        });
      }
    } catch (err: any) {
      flashMsg(err?.message || 'Failed to load safety preferences');
    } finally {
      setSafetyLoading(false);
    }
  };

  useEffect(() => {
    loadSafety();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const saveSafety = async (next: SafetyPreferences, previous: SafetyPreferences) => {
    if (!accessToken) return;
    setSafetySaving(true);
    try {
      const res = await fetch(getApiUrl('/api/safety/preferences'), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(next),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to update preferences');
      flashMsg('Saved');
    } catch (err: any) {
      setSafety(previous);
      flashMsg(err?.message || 'Failed to update preferences');
    } finally {
      setSafetySaving(false);
    }
  };

  const onToggleSafety = (key: keyof SafetyPreferences, value: boolean) => {
    const previous = safety;
    const next = { ...safety, [key]: value };
    setSafety(next);
    saveSafety(next, previous);
  };

  const copySeed = async () => {
    if (!seedPhrase) {
      flashMsg('Seed phrase not available');
      return;
    }
    try {
      await navigator.clipboard.writeText(seedPhrase);
      setSeedCopied(true);
      window.setTimeout(() => setSeedCopied(false), 2000);
    } catch {
      flashMsg('Failed to copy');
    }
  };

  const downloadSeed = () => {
    if (!seedPhrase) {
      flashMsg('Seed phrase not available');
      return;
    }
    const ts = new Date().toISOString();
    const content = [
      'UNBOUND — Seed Phrase Backup',
      '',
      `Exported: ${ts}`,
      `Public key: ${publicKey}`,
      '',
      'Seed phrase:',
      seedPhrase,
      '',
      'Keep this file offline and secure. Anyone with this phrase can control your identity.',
      '',
    ].join('\n');
    const filename = `unbound-seed-${publicKey.slice(0, 8)}-${ts.slice(0, 10)}.txt`;
    downloadTextFile(filename, content);
    flashMsg('Downloaded');
  };

  const downloadAppData = async () => {
    const ts = new Date().toISOString();

    let safetyPreferences: SafetyPreferences | null = null;
    if (accessToken) {
      try {
        const res = await fetch(getApiUrl('/api/safety/preferences'), {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const json = await res.json();
        if (res.ok && json?.data) {
          safetyPreferences = {
            show_sensitive_content: !!json.data.show_sensitive_content,
            hide_blocked_content: !!json.data.hide_blocked_content,
            auto_filter_keywords: !!json.data.auto_filter_keywords,
            block_new_accounts: !!json.data.block_new_accounts,
          };
        }
      } catch {
        // ignore export failure for optional data
      }
    }

    const payload = {
      exportedAt: ts,
      publicKey,
      safetyPreferences,
      devicePreferences: {
        markPostsSensitive,
        twoFactorEnabled,
        twoFactorMethod,
      },
      notes: [
        'This export does not include your seed phrase.',
        'Use “Seed phrase backup” to copy/download your seed phrase separately.',
      ],
    };

    const filename = `unbound-data-${publicKey.slice(0, 8)}-${ts.slice(0, 10)}.json`;
    downloadJsonFile(filename, payload);
    flashMsg('Downloaded');
  };

  const handleChangePassword = async () => {
    if (!pwdCurrent || !pwdNext || !pwdNext2) {
      flashMsg('Fill all fields');
      return;
    }
    if (pwdNext !== pwdNext2) {
      flashMsg('New passwords do not match');
      return;
    }
    if (pwdNext.length < 6) {
      flashMsg('Use a longer password');
      return;
    }
    if (!seedPhrase) {
      flashMsg('Seed phrase not loaded in this session');
      return;
    }

    setPwdBusy(true);
    try {
      const { SecureStorage } = await import('../../utils/SecureStorage');

      const verifier = new SecureStorage();
      await verifier.initialize(pwdCurrent);
      await verifier.retrieveSeedPhrase();
      await verifier.close();

      // Re-encrypt local stored identity with the new password.
      const storage = (cryptoManager as any).secureStorage;
      if (!storage?.close || !storage?.initialize || !storage?.storeSeedPhrase) {
        throw new Error('Secure storage not available');
      }

      await storage.close();
      await storage.initialize(pwdNext);
      await storage.storeSeedPhrase(seedPhrase);
      await cryptoManager.deriveKeys();

      setPwdCurrent('');
      setPwdNext('');
      setPwdNext2('');
      flashMsg('Password updated');
    } catch (err: any) {
      flashMsg(err?.message || 'Failed to change password');
    } finally {
      setPwdBusy(false);
    }
  };

  const handleDeactivate = async () => {
    await deleteIndexedDb('unbound-secure-storage');
    try {
      sessionStorage.removeItem('unbound-access-token');
      sessionStorage.removeItem('unbound-public-key');
      localStorage.removeItem('unbound-access-token');
    } catch {
      // ignore
    }
    try {
      await cryptoManager.close?.();
    } catch {
      // ignore
    }
    onLogout();
  };

  return (
    <div className="settings-panel">
      <FeedHeader title="Settings" />

      {settingsMsg ? (
        <div className="card settings-toast" style={{ marginBottom: 'var(--space-md)' }}>
          <div className="text-sm text-muted">{settingsMsg}</div>
        </div>
      ) : null}

      {/* Seed phrase backup */}
      <section className="card settings-card">
        <div className="settings-card-header">
          <div>
            <h3 className="text-green settings-card-title">Seed phrase backup</h3>
            <div className="text-sm text-muted">
              Copy or download your seed phrase. Keep it offline. Anyone with it can control your identity.
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => setSeedVisible(v => !v)}>
            {seedVisible ? 'Hide' : 'Reveal'}
          </button>
        </div>

        <div className="settings-seed">
          <div className="settings-seed-box technical">
            {seedVisible ? (seedPhrase || 'Seed phrase not available') : '•••• •••• •••• •••• •••• ••••'}
          </div>

          <div className="settings-seed-actions">
            <button className="btn btn-secondary btn-sm" onClick={copySeed} disabled={!seedPhrase}>
              {seedCopied ? '✓ Copied' : 'Copy'}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={downloadSeed} disabled={!seedPhrase}>
              Download
            </button>
          </div>
        </div>
      </section>

      {/* Help & legal */}
      <section className="card settings-card">
        <div className="settings-card-header">
          <div>
            <h3 className="text-green settings-card-title">Help & legal</h3>
            <div className="text-sm text-muted">Quick links and policies.</div>
          </div>
        </div>

        <div className="settings-list">
          <SettingRow
            title="Help center"
            description="FAQs and troubleshooting (placeholder)"
            right="›"
            onClick={() =>
              setInfoModal({
                title: 'Help center',
                body:
                  'Help center is not wired yet.\n\nPlanned: FAQs, account recovery guidance, safety tools, and support contact.',
              })
            }
          />
          <SettingRow
            title="Terms and policies"
            description="Rules for using Unbound (placeholder)"
            right="›"
            onClick={() =>
              setInfoModal({
                title: 'Terms and policies',
                body:
                  'Placeholder terms.\n\nPlanned: acceptable use, moderation, abuse reporting, and jurisdiction/legal notes.',
              })
            }
          />
          <SettingRow
            title="Privacy policy"
            description="How data is handled (placeholder)"
            right="›"
            onClick={() =>
              setInfoModal({
                title: 'Privacy policy',
                body:
                  'Placeholder privacy policy.\n\nUnbound stores your seed phrase encrypted on-device if you choose “Store Identity”. Server-side data depends on the features you use (e.g., profiles, follows).',
              })
            }
          />
        </div>
      </section>

      {/* Preferences */}
      <section className="card settings-card">
        <div className="settings-card-header">
          <div>
            <h3 className="text-green settings-card-title">Preferences</h3>
            <div className="text-sm text-muted">
              Some settings sync to the server (needs login). Others are device-only.
            </div>
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={loadSafety}
            disabled={!accessToken || safetyLoading}
            title={accessToken ? 'Refresh' : 'Login required'}
          >
            {safetyLoading ? '…' : '↻'}
          </button>
        </div>

        <div className="settings-list">
          <ToggleRow
            title="Mark posts as sensitive"
            badge="Device"
            description="Dummy toggle for later composer integration"
            checked={markPostsSensitive}
            onChange={setMarkPostsSensitive}
          />

          <div className="settings-divider" />

          <ToggleRow
            title="Show sensitive content"
            badge="Server"
            description="Show posts that may contain sensitive content"
            checked={safety.show_sensitive_content}
            onChange={(v) => onToggleSafety('show_sensitive_content', v)}
            disabled={!accessToken || safetySaving}
          />
          <ToggleRow
            title="Hide blocked content"
            badge="Server"
            description="Hide posts from accounts you blocked"
            checked={safety.hide_blocked_content}
            onChange={(v) => onToggleSafety('hide_blocked_content', v)}
            disabled={!accessToken || safetySaving}
          />
          <ToggleRow
            title="Auto-filter keywords"
            badge="Server"
            description="Apply your keyword filters automatically"
            checked={safety.auto_filter_keywords}
            onChange={(v) => onToggleSafety('auto_filter_keywords', v)}
            disabled={!accessToken || safetySaving}
          />
          <ToggleRow
            title="Block new accounts"
            badge="Server"
            description="Stricter filtering for newly created accounts"
            checked={safety.block_new_accounts}
            onChange={(v) => onToggleSafety('block_new_accounts', v)}
            disabled={!accessToken || safetySaving}
          />

          {!accessToken ? (
            <div className="text-sm text-muted" style={{ padding: 'var(--space-md)' }}>
              Login to sync safety preferences to the server.
            </div>
          ) : null}
        </div>
      </section>

      {/* Security */}
      <section className="card settings-card">
        <div className="settings-card-header">
          <div>
            <h3 className="text-green settings-card-title">Security</h3>
            <div className="text-sm text-muted">Account and device security options.</div>
          </div>
        </div>

        <div className="settings-list">
          <ToggleRow
            title="Two-Factor Authentication (2FA)"
            badge="Dummy"
            description="Adds extra security (SMS, authenticator app, or security key)"
            checked={twoFactorEnabled}
            onChange={setTwoFactorEnabled}
          />

          {twoFactorEnabled ? (
            <div className="settings-subcard">
              <div className="text-sm text-muted mb-sm">Choose a method (not implemented yet):</div>
              <div className="settings-radio">
                <label>
                  <input
                    type="radio"
                    name="twofactor-method"
                    value="sms"
                    checked={twoFactorMethod === 'sms'}
                    onChange={(e) => setTwoFactorMethod(e.target.value)}
                  />
                  SMS
                </label>
                <label>
                  <input
                    type="radio"
                    name="twofactor-method"
                    value="authenticator"
                    checked={twoFactorMethod === 'authenticator'}
                    onChange={(e) => setTwoFactorMethod(e.target.value)}
                  />
                  Authenticator app
                </label>
                <label>
                  <input
                    type="radio"
                    name="twofactor-method"
                    value="security_key"
                    checked={twoFactorMethod === 'security_key'}
                    onChange={(e) => setTwoFactorMethod(e.target.value)}
                  />
                  Security key
                </label>
              </div>
            </div>
          ) : null}

          <div className="settings-divider" />

          <div className="settings-subcard">
            <div className="text-sm text-muted mb-sm">
              Change password (for encrypting your stored seed on this device)
            </div>
            <div className="settings-grid">
              <input
                className="input"
                type="password"
                placeholder="Current password"
                value={pwdCurrent}
                onChange={(e) => setPwdCurrent(e.target.value)}
                disabled={pwdBusy}
              />
              <input
                className="input"
                type="password"
                placeholder="New password"
                value={pwdNext}
                onChange={(e) => setPwdNext(e.target.value)}
                disabled={pwdBusy}
              />
              <input
                className="input"
                type="password"
                placeholder="Confirm new password"
                value={pwdNext2}
                onChange={(e) => setPwdNext2(e.target.value)}
                disabled={pwdBusy}
              />
              <button className="btn btn-secondary" onClick={handleChangePassword} disabled={pwdBusy}>
                {pwdBusy ? 'Updating…' : 'Change password'}
              </button>
            </div>
            <div className="text-xs text-muted" style={{ marginTop: 'var(--space-sm)' }}>
              This only affects “Quick Login” on this device. It does not change any server password.
            </div>
          </div>
        </div>
      </section>

      {/* Data */}
      <section className="card settings-card">
        <div className="settings-card-header">
          <div>
            <h3 className="text-green settings-card-title">Data</h3>
            <div className="text-sm text-muted">Export data and manage your local identity.</div>
          </div>
        </div>

        <div className="settings-list">
          <SettingRow
            title="Download your app data"
            description="Exports preferences (and server safety prefs if logged in)"
            right={<span className="text-muted">Download</span>}
            onClick={downloadAppData}
          />

          <div className="settings-divider" />

          <SettingRow
            title="Deactivate your account"
            description="Removes your identity from this device and logs out"
            right={<span className="text-error">Deactivate</span>}
            onClick={() =>
              setInfoModal({
                title: 'Deactivate your account',
                body:
                  'This will remove your stored identity from this device and log you out.\n\nIt does not delete public data already published.\n\nType “DEACTIVATE” in the confirmation to continue.',
              })
            }
          />
        </div>
      </section>

      {/* Info modal */}
      {infoModal ? (
        <div className="modal-overlay open" onClick={() => setInfoModal(null)}>
          <div className="modal fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="text-green">{infoModal.title}</h3>
              <button className="btn btn-sm btn-secondary" onClick={() => setInfoModal(null)}>
                ×
              </button>
            </div>
            <div className="modal-content">
              <pre className="settings-modal-pre">{infoModal.body}</pre>

              {infoModal.title === 'Deactivate your account' ? (
                <DeactivateConfirm
                  onCancel={() => setInfoModal(null)}
                  onConfirm={async () => {
                    setInfoModal(null);
                    await handleDeactivate();
                  }}
                />
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DeactivateConfirm({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  const [value, setValue] = useState('');
  const ok = value.trim().toUpperCase() === 'DEACTIVATE';

  return (
    <div className="settings-deactivate">
      <input
        className="input"
        placeholder="Type DEACTIVATE"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <div className="settings-deactivate-actions">
        <button className="btn btn-secondary btn-sm" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary btn-sm" onClick={onConfirm} disabled={!ok}>
          Deactivate
        </button>
      </div>
    </div>
  );
}

export default SettingsPanel;
