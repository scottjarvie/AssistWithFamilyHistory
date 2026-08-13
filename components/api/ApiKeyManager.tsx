"use client";

/**
 * ApiKeyManager — the shared API Center surface (Jarvie Shared Agent API model).
 *
 * Simple-by-default: pick a preset (product job), label it, mint, copy the secret
 * ONCE. An "Advanced" view exposes raw scopes. `mode="admin"` adds operator
 * tooling (stale-key flags + suspend/reactivate) for the Admin API surface.
 *
 * Talks only to the Clerk-protected /api/keys routes; the raw secret is generated
 * + hashed server-side and shown here exactly once.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Copy,
  KeyRound,
  Loader2,
  Plus,
  ShieldAlert,
  Trash2,
  PauseCircle,
  PlayCircle,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { SCOPES, SCOPE_PRESETS_META, type Scope } from "@/lib/auth/scopes";

export interface ApiKeyRow {
  keyId: string;
  label: string;
  scopes: string[];
  tier: "trial" | "standard" | "trusted";
  status: "active" | "revoked" | "suspended";
  createdAt: number;
  lastUsedAt?: number;
  revokedAt?: number;
  expiresAt?: number;
}

const STALE_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const PUBLIC_APP_ORIGIN = "https://assistwithfamilyhistory.com";

const TIER_STYLES: Record<ApiKeyRow["tier"], string> = {
  trial: "bg-stone-100 text-stone-700",
  standard: "bg-amber-100 text-amber-800",
  trusted: "bg-emerald-100 text-emerald-800",
};

const STATUS_STYLES: Record<ApiKeyRow["status"], string> = {
  active: "bg-emerald-100 text-emerald-800",
  suspended: "bg-amber-100 text-amber-800",
  revoked: "bg-stone-200 text-stone-600",
};

function formatDate(ms?: number): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function isStale(key: ApiKeyRow, now: number): boolean {
  if (key.status !== "active") return false;
  if (!key.lastUsedAt) return now - key.createdAt > STALE_MS; // never used + old
  return now - key.lastUsedAt > STALE_MS;
}

export function ApiKeyManager({
  initialKeys,
  mode = "user",
  isAdmin = false,
}: {
  initialKeys: ApiKeyRow[];
  mode?: "user" | "admin";
  isAdmin?: boolean;
}) {
  const [keys, setKeys] = useState<ApiKeyRow[]>(initialKeys);
  // Computed client-side after mount (Date.now() is impure for render).
  const [nowMs, setNowMs] = useState(0);
  useEffect(() => {
    setNowMs(Date.now());
  }, []);
  const [label, setLabel] = useState("");
  const [preset, setPreset] = useState<string>("read_only_assistant");
  const [advanced, setAdvanced] = useState(false);
  const [customScopes, setCustomScopes] = useState<Scope[]>([]);
  const [minting, setMinting] = useState(false);
  const [busyKeyId, setBusyKeyId] = useState<string | null>(null);
  const [mintedKey, setMintedKey] = useState<{ key: string; keyId: string; label: string } | null>(null);

  const presets = SCOPE_PRESETS_META.filter((p) => isAdmin || !p.admin);

  async function refresh() {
    const res = await fetch("/api/keys");
    const data = await res.json();
    if (data?.success) setKeys(data.keys as ApiKeyRow[]);
  }

  async function mint() {
    if (!label.trim()) {
      toast.error("Give your key a label first");
      return;
    }
    setMinting(true);
    try {
      const body = advanced
        ? { label: label.trim(), scopes: customScopes }
        : { label: label.trim(), preset };
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || "Could not mint key");
      setMintedKey({ key: data.key, keyId: data.keyId, label: data.label });
      setLabel("");
      setCustomScopes([]);
      toast.success("API key created — copy it now, it won't be shown again");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not mint key");
    } finally {
      setMinting(false);
    }
  }

  async function revoke(keyId: string) {
    setBusyKeyId(keyId);
    try {
      const res = await fetch(`/api/keys/${keyId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || "Could not revoke");
      toast.success("Key revoked");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not revoke");
    } finally {
      setBusyKeyId(null);
    }
  }

  async function setStatus(keyId: string, status: "active" | "suspended") {
    setBusyKeyId(keyId);
    try {
      const res = await fetch(`/api/keys/${keyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || "Could not update key");
      toast.success(status === "suspended" ? "Key suspended" : "Key reactivated");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update key");
    } finally {
      setBusyKeyId(null);
    }
  }

  function copy(text: string) {
    void navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  }

  const staleCount = keys.filter((k) => isStale(k, nowMs)).length;

  return (
    <div className="space-y-6">
      {/* Mint */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-amber-700" />
            <CardTitle>Create an API key</CardTitle>
          </div>
          <CardDescription>
            Pick what the key is for, label it, and copy the secret once. Point your AI agent (Claude
            Code, Codex, Cowork) at it to work in your vault.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="key-label">Label</Label>
            <Input
              id="key-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Claude Code on my laptop"
            />
          </div>

          {!advanced ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {presets.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPreset(p.key)}
                  className={cn(
                    "rounded-xl border p-4 text-left transition-colors",
                    preset === p.key ? "border-amber-400 bg-amber-50" : "border-stone-200 hover:border-stone-300",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-stone-900">{p.label}</span>
                    {preset === p.key ? <CheckCircle2 className="h-4 w-4 text-amber-700" /> : null}
                  </div>
                  <p className="mt-1 text-sm text-stone-500">{p.description}</p>
                  <Badge className={cn("mt-2", TIER_STYLES[p.tier])}>{p.tier}</Badge>
                  {p.admin ? <Badge className="ml-2 mt-2 bg-rose-100 text-rose-700">admin role</Badge> : null}
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-stone-200 p-4">
              <p className="mb-3 text-sm text-stone-500">Advanced: choose individual scopes.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {SCOPES.map((scope) => {
                  const checked = customScopes.includes(scope);
                  return (
                    <label key={scope} className="flex items-center gap-2 text-sm text-stone-700">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setCustomScopes((prev) =>
                            checked ? prev.filter((s) => s !== scope) : [...prev, scope],
                          )
                        }
                      />
                      <code className="font-mono text-xs">{scope}</code>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={mint} disabled={minting} className="bg-stone-900 hover:bg-stone-800">
              {minting ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              Create key
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setAdvanced((v) => !v)} className="text-stone-600">
              {advanced ? "Use a preset instead" : "Advanced: choose raw scopes"}
            </Button>
          </div>

          {mintedKey ? (
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4">
              <p className="text-sm font-medium text-emerald-900">
                Your new key “{mintedKey.label}” — copy it now. It will never be shown again.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 overflow-x-auto rounded bg-white px-3 py-2 font-mono text-xs text-stone-800">
                  {mintedKey.key}
                </code>
                <Button size="sm" variant="outline" onClick={() => copy(mintedKey.key)}>
                  <Copy className="h-4 w-4" />
                  Copy
                </Button>
              </div>
              <Button size="sm" variant="ghost" className="mt-2 text-emerald-800" onClick={() => setMintedKey(null)}>
                I&apos;ve saved it
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* First success */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">First success</CardTitle>
          <CardDescription>Point your agent here. Discovery is live now; key verification is rolling out.</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-lg bg-stone-900 px-4 py-3 text-xs leading-6 text-stone-100">
{`# 1. Learn what this platform stores (public, live now)
curl ${PUBLIC_APP_ORIGIN}/context-schema

# 2. Verify your key (rolling out)
curl -H "Authorization: Bearer dts_live_..." ${PUBLIC_APP_ORIGIN}/api/v1/me`}
          </pre>
        </CardContent>
      </Card>

      {/* Keys list */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{mode === "admin" ? "All keys (operator view)" : "Your keys"}</CardTitle>
            {mode === "admin" && staleCount > 0 ? (
              <Badge className="bg-amber-100 text-amber-800">
                <ShieldAlert className="mr-1 h-3.5 w-3.5" />
                {staleCount} stale
              </Badge>
            ) : null}
          </div>
          {mode === "admin" ? (
            <CardDescription>
              Operator tooling for the keys in this vault. Stale = never used, or unused for 30+ days. Cross-tenant
              oversight will land with multi-account admin.
            </CardDescription>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-3">
          {keys.length === 0 ? (
            <p className="text-sm text-stone-500">No keys yet. Create one above to get started.</p>
          ) : (
            keys.map((key) => {
              const stale = isStale(key, nowMs);
              return (
                <div
                  key={key.keyId}
                  className={cn(
                    "rounded-xl border px-4 py-3",
                    stale ? "border-amber-300 bg-amber-50/40" : "border-stone-200",
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-stone-900">{key.label}</span>
                        <Badge className={TIER_STYLES[key.tier]}>{key.tier}</Badge>
                        <Badge className={STATUS_STYLES[key.status]}>{key.status}</Badge>
                        {stale ? <Badge className="bg-amber-100 text-amber-800">stale</Badge> : null}
                      </div>
                      <p className="mt-1 font-mono text-xs text-stone-500">{key.keyId}</p>
                      <p className="mt-1 text-xs text-stone-500">
                        {key.scopes.length} scope{key.scopes.length === 1 ? "" : "s"} · created {formatDate(key.createdAt)} · last used {formatDate(key.lastUsedAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {key.status === "active" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyKeyId === key.keyId}
                          onClick={() => setStatus(key.keyId, "suspended")}
                        >
                          <PauseCircle className="h-4 w-4" />
                          Suspend
                        </Button>
                      ) : key.status === "suspended" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyKeyId === key.keyId}
                          onClick={() => setStatus(key.keyId, "active")}
                        >
                          <PlayCircle className="h-4 w-4" />
                          Reactivate
                        </Button>
                      ) : null}
                      {key.status !== "revoked" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-rose-600 hover:text-rose-700"
                          disabled={busyKeyId === key.keyId}
                          onClick={() => revoke(key.keyId)}
                        >
                          {busyKeyId === key.keyId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          Revoke
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
