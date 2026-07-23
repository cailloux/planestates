import { useEffect, useState } from "react";

interface AdminStatus {
  currentCycle: string;
  storedCycle: string | null;
  airportCount: string | null;
  lastGenerated: string | null;
}

/**
 * /admin — status + manual extract re-trigger.
 * Reachable only through the Cloudflare Access policy on /api/admin/* (the
 * page itself is public but useless without it: every API call requires a
 * verified Access JWT).
 */
export default function AdminPage() {
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const res = await fetch("/api/admin/status");
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(body.detail ?? `Status failed (${res.status})`);
      }
      setStatus((await res.json()) as AdminStatus);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function trigger() {
    setBusy(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/extract", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { status?: string; detail?: string };
      if (!res.ok) throw new Error(body.detail ?? `Extract failed (${res.status})`);
      setResult(body.status ?? "done");
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const stale = status && status.storedCycle !== status.currentCycle;

  return (
    <section className="panel">
      <h2>Airport data admin</h2>
      {error && <p className="notice">{error}</p>}
      {status && (
        <p className="hint">
          Current cycle: <strong>{status.currentCycle}</strong> · Stored cycle:{" "}
          <strong>{status.storedCycle ?? "none"}</strong>
          {status.airportCount && ` · ${status.airportCount} airports`}
          {status.lastGenerated && ` · extracted ${new Date(status.lastGenerated).toLocaleString()}`}
        </p>
      )}
      {stale && <p className="notice">Stored data is behind the current cycle.</p>}
      {status && !stale && <p className="notice ok">Data is current.</p>}
      <div className="upload-row">
        <button className="btn primary" onClick={trigger} disabled={busy}>
          {busy ? "Extracting…" : "Run extract now"}
        </button>
        <button className="btn" onClick={load} disabled={busy}>
          Refresh status
        </button>
        <button
          className="btn"
          disabled={busy}
          onClick={async () => {
            setError(null);
            setResult(null);
            const res = await fetch("/api/admin/test-email", { method: "POST" });
            const body = (await res.json().catch(() => ({}))) as { status?: string; detail?: string };
            if (res.ok) setResult(body.status ?? "sent");
            else setError(body.detail ?? `Test email failed (${res.status})`);
          }}
        >
          Send test email
        </button>
        <a className="hint" href="/">
          ← back to app
        </a>
      </div>
      {result && <p className="notice ok">{result}</p>}
    </section>
  );
}
