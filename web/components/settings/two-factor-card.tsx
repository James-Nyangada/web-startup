"use client";

import React, { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { useToast } from "@/components/shell/toast-context";
import { ApiException } from "@/lib/auth-client";
import { mfaClient, passkeysSupported, type MfaStatus } from "@/lib/mfa-client";

const inputClass =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary";
const primaryBtn =
  "rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-on-primary disabled:opacity-60";
const ghostBtn =
  "rounded-lg border border-line px-3.5 py-2 text-xs font-semibold text-ink hover:bg-subtle disabled:opacity-60";

function errorText(err: unknown, fallback: string): string {
  if (err instanceof ApiException) return err.message;
  if (err instanceof Error && err.name === "NotAllowedError") return "The passkey prompt was cancelled.";
  if (err instanceof Error && err.name === "InvalidStateError") return "This device already has a passkey for your account.";
  return fallback;
}

function downloadCodes(codes: string[]) {
  const text = [
    "EveryVisitor recovery codes",
    `Generated: ${new Date().toLocaleString()}`,
    "",
    "Each code can be used once if you lose access to your authenticator app.",
    "Keep this file somewhere safe.",
    "",
    ...codes,
    "",
  ].join("\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "everyvisitor-recovery-codes.txt";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-subtle p-4">
      <p className="m-0 text-sm font-semibold text-ink">Save your recovery codes</p>
      <p className="m-0 text-xs text-muted">
        Each code works once if you lose your authenticator. They won&apos;t be shown again.
      </p>
      <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0 font-mono text-sm text-ink">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="flex gap-2">
        <button type="button" className={ghostBtn} onClick={() => void navigator.clipboard?.writeText(codes.join("\n"))}>
          Copy codes
        </button>
        <button type="button" className={ghostBtn} onClick={() => downloadCodes(codes)}>
          Download .txt
        </button>
        <button type="button" className={primaryBtn} onClick={onDone}>
          I&apos;ve saved them
        </button>
      </div>
    </div>
  );
}

export function TwoFactorCard() {
  const { showToast } = useToast();
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [confirming, setConfirming] = useState<"disable" | "regenerate" | null>(null);
  const [passkeyName, setPasskeyName] = useState("");

  const refresh = useCallback(async () => {
    try {
      setStatus(await mfaClient.status());
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (fn: () => Promise<void>, fallback: string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(errorText(err, fallback));
    } finally {
      setBusy(false);
    }
  };

  const startTotp = () =>
    run(async () => {
      const res = await mfaClient.startTotp();
      setSetup({ secret: res.secret, qr: await QRCode.toDataURL(res.otpauthUrl, { margin: 1, width: 192 }) });
      setCode("");
    }, "Could not start authenticator setup.");

  const enableTotp = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const res = await mfaClient.enableTotp(code);
      setSetup(null);
      setCode("");
      if (res.recoveryCodes) setRecoveryCodes(res.recoveryCodes);
      showToast("Authenticator app turned on.");
      await refresh();
    }, "Could not verify that code.");
  };

  const confirmAction = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      if (confirming === "disable") {
        await mfaClient.disableTotp(code);
        showToast("Authenticator app turned off.");
      } else {
        setRecoveryCodes((await mfaClient.regenerateRecoveryCodes(code)).recoveryCodes);
      }
      setConfirming(null);
      setCode("");
      await refresh();
    }, "That code is not correct.");
  };

  const addPasskey = () =>
    run(async () => {
      await mfaClient.addPasskey(passkeyName.trim() || "Passkey");
      setPasskeyName("");
      showToast("Passkey added.");
      await refresh();
    }, "Could not add a passkey on this device.");

  const removePasskey = (id: string) =>
    run(async () => {
      await mfaClient.removePasskey(id);
      showToast("Passkey removed.");
      await refresh();
    }, "Could not remove the passkey.");

  const anyEnabled = Boolean(status?.totpEnabled || status?.passkeys.length);

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-6 shadow-card">
      <div className="border-b border-line pb-4">
        <div className="flex items-center gap-2">
          <h2 className="m-0 text-base font-semibold text-ink">Two-step verification</h2>
          {status && (
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                anyEnabled ? "bg-primary-soft text-ptext" : "bg-subtle text-muted"
              }`}
            >
              {anyEnabled ? "On" : "Off"}
            </span>
          )}
        </div>
        <p className="m-0 mt-0.5 text-xs text-muted">
          Add a passkey or an authenticator app. After you sign in with your password you&apos;ll confirm it
          once, then you won&apos;t be asked again for {status?.trustWindowHours ?? 24} hours.
        </p>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-crit/40 bg-crit-soft p-3 text-xs font-semibold text-crit">
          {error}
        </div>
      )}

      {recoveryCodes && <RecoveryCodes codes={recoveryCodes} onDone={() => setRecoveryCodes(null)} />}

      {/* Authenticator app */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="m-0 text-sm font-semibold text-ink">Authenticator app</h3>
            <p className="m-0 text-xs text-muted">
              Google Authenticator, Microsoft Authenticator, Authy, 1Password and any other TOTP app.
              {status?.totpEnabled && ` ${status.recoveryCodesRemaining} recovery codes left.`}
            </p>
          </div>
          {status && !status.totpEnabled && !setup && (
            <button type="button" className={primaryBtn} onClick={startTotp} disabled={busy}>
              Set up
            </button>
          )}
          {status?.totpEnabled && !confirming && (
            <div className="flex gap-2">
              <button type="button" className={ghostBtn} onClick={() => setConfirming("regenerate")}>
                New recovery codes
              </button>
              <button type="button" className={ghostBtn} onClick={() => setConfirming("disable")}>
                Turn off
              </button>
            </div>
          )}
        </div>

        {setup && (
          <form onSubmit={enableTotp} className="flex flex-col gap-3 rounded-xl border border-line bg-subtle p-4">
            <p className="m-0 text-xs text-muted">
              1. Scan this QR code with your authenticator app, or enter the key manually.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={setup.qr} alt="QR code for your authenticator app" width={144} height={144} className="rounded-lg bg-white p-1" />
              <code className="break-all rounded-lg bg-surface px-3 py-2 font-mono text-xs text-ink">
                {setup.secret.replace(/(.{4})/g, "$1 ").trim()}
              </code>
            </div>
            <label htmlFor="totp-enable-code" className="text-xs text-muted">
              2. Enter the 6-digit code it shows.
            </label>
            <div className="flex gap-2">
              <input
                id="totp-enable-code"
                className={`${inputClass} max-w-40 text-center font-mono tracking-widest`}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={7}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
              />
              <button type="submit" className={primaryBtn} disabled={busy || code.trim().length < 6}>
                Turn on
              </button>
              <button type="button" className={ghostBtn} onClick={() => setSetup(null)}>
                Cancel
              </button>
            </div>
          </form>
        )}

        {confirming && (
          <form onSubmit={confirmAction} className="flex flex-col gap-2 rounded-xl border border-line bg-subtle p-4">
            <label htmlFor="totp-confirm-code" className="text-xs text-muted">
              Enter a current authenticator code to {confirming === "disable" ? "turn it off" : "get new recovery codes"}.
            </label>
            <div className="flex gap-2">
              <input
                id="totp-confirm-code"
                className={`${inputClass} max-w-40 text-center font-mono tracking-widest`}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={12}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <button type="submit" className={primaryBtn} disabled={busy || code.trim().length < 6}>
                Confirm
              </button>
              <button
                type="button"
                className={ghostBtn}
                onClick={() => {
                  setConfirming(null);
                  setCode("");
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Passkeys */}
      <section className="flex flex-col gap-3 border-t border-line pt-5">
        <div>
          <h3 className="m-0 text-sm font-semibold text-ink">Passkeys</h3>
          <p className="m-0 text-xs text-muted">
            Use your fingerprint, face, screen lock or a security key instead of typing a code.
          </p>
        </div>

        {status?.passkeys.length ? (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {status.passkeys.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2">
                <div className="min-w-0">
                  <p className="m-0 truncate text-sm font-medium text-ink">{p.name}</p>
                  <p className="m-0 text-xs text-muted">
                    Added {new Date(p.createdAt).toLocaleDateString()}
                    {p.lastUsedAt ? ` · Last used ${new Date(p.lastUsedAt).toLocaleDateString()}` : " · Never used"}
                  </p>
                </div>
                <button type="button" className={ghostBtn} onClick={() => removePasskey(p.id)} disabled={busy}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {passkeysSupported() ? (
          <div className="flex flex-wrap gap-2">
            <input
              aria-label="Passkey name"
              className={`${inputClass} max-w-56`}
              placeholder="Name, e.g. MacBook"
              maxLength={60}
              value={passkeyName}
              onChange={(e) => setPasskeyName(e.target.value)}
            />
            <button type="button" className={primaryBtn} onClick={addPasskey} disabled={busy}>
              Add a passkey
            </button>
          </div>
        ) : (
          <p className="m-0 text-xs text-muted">This browser doesn&apos;t support passkeys.</p>
        )}
      </section>
    </div>
  );
}
