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
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {FamilyIcons} from "@/components/ui/FamilySymbol";
const {Copy,KeyRound,Loader2,Plus,CheckCircle2}=FamilyIcons;
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from "@/components/ui/dialog";
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
  trial: "bg-muted text-muted-foreground",
  standard: "bg-annotation/10 text-annotation",
  trusted: "bg-primary/10 text-primary",
};

const STATUS_STYLES: Record<ApiKeyRow["status"], string> = {
  active: "bg-primary/10 text-primary",
  suspended: "bg-annotation/10 text-annotation",
  revoked: "bg-muted text-muted-foreground",
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
  const [statusFilter,setStatusFilter]=useState("all");
  const [listIssue,setListIssue]=useState("");
  const [confirmation,setConfirmation]=useState<{key:ApiKeyRow;action:"revoke"|"suspend"}|null>(null);
  const actionOrigin=useRef<HTMLElement|null>(null);
  const actionRow=useRef<HTMLElement|null>(null);
  const ledgerHeading=useRef<HTMLHeadingElement|null>(null);
  function rememberActionOrigin() {actionOrigin.current=document.activeElement as HTMLElement;actionRow.current=actionOrigin.current?.closest("[data-api-key]") as HTMLElement|null;}
  function restoreActionFocus() {if(actionOrigin.current?.isConnected)actionOrigin.current.focus();else if(actionRow.current?.isConnected)actionRow.current.focus();else ledgerHeading.current?.focus();}
  function confirmAction(key:ApiKeyRow,action:"revoke"|"suspend") {rememberActionOrigin();setConfirmation({key,action});}
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
    try {
      const res=await fetch("/api/keys",{cache:"no-store"});const data=await res.json();
      if(!res.ok||!data?.success)throw new Error("Key list could not refresh. The last loaded list remains visible.");
      setKeys(data.keys as ApiKeyRow[]);setListIssue("");return true;
    }catch {setListIssue("The key list could not refresh. An acknowledged change still applies; retry the list read.");return false;}
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
      setKeys(current=>current.map(key=>key.keyId===keyId?{...key,status:"revoked"}:key));
      await refresh();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not revoke");
      return false;
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
      setKeys(current=>current.map(key=>key.keyId===keyId?{...key,status}:key));
      await refresh();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update key");
      return false;
    } finally {
      setBusyKeyId(null);
    }
  }

  function copy(text: string) {
    void navigator.clipboard.writeText(text).then(()=>toast.success("Copied to clipboard")).catch(()=>toast.error("Copy failed. Select the secret and copy it manually."));
  }

  const staleCount = keys.filter((k) => isStale(k, nowMs)).length;
  const visibleKeys=keys.filter(key=>statusFilter==="all"?true:statusFilter==="stale"?isStale(key,nowMs):key.status===statusFilter);
  const statusCounts={all:keys.length,active:keys.filter(key=>key.status==="active").length,suspended:keys.filter(key=>key.status==="suspended").length,revoked:keys.filter(key=>key.status==="revoked").length,stale:staleCount};

  return (
    <div className="space-y-6">
      <section aria-labelledby="key-ledger-heading" className="rounded-lg border border-border bg-card">
        <header className="border-b border-border p-4"><h2 ref={ledgerHeading} tabIndex={-1} id="key-ledger-heading" className="font-serif text-2xl font-semibold">{mode==="admin"?"Vault key ledger":"Your keys"}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Keys in this vault only. Every scope still passes the existing privacy, review and role gates.{mode==="admin"&&" Stale means never used, or unused for 30+ days. This is not cross-tenant oversight."}</p></header>
        {mode==="admin"&&<div aria-label="Recorded key states" className="grid grid-cols-3 divide-x divide-border border-b border-border">{(["active","suspended","revoked"] as const).map(status=><button key={status} type="button" onClick={()=>setStatusFilter(status)} className="min-h-24 p-3 text-left"><span className="block text-xs capitalize text-muted-foreground">{status}</span><span className="mt-1 block font-mono text-2xl">{statusCounts[status]}</span><span aria-hidden="true" className="mt-2 block h-1 bg-muted"><span className="block h-full bg-primary/60" style={{width:`${keys.length?100*statusCounts[status]/keys.length:0}%`}}/></span></button>)}</div>}
        {listIssue&&<div role="alert" className="border-b border-annotation/40 bg-annotation/5 p-4 text-sm">{listIssue}<Button variant="outline" className="ml-2 min-h-11" disabled={busyKeyId!==null||minting} onClick={()=>void refresh()}>Refresh key list</Button></div>}
        <nav aria-label="Key ledger views" className="sticky top-14 z-10 flex gap-1 overflow-x-auto border-b border-border bg-card p-2">{Object.entries(statusCounts).filter(([key])=>mode==="admin"||key!=="stale").map(([key,count])=><Button key={key} variant={statusFilter===key?"secondary":"ghost"} aria-pressed={statusFilter===key} className="min-h-11 shrink-0 capitalize" onClick={()=>setStatusFilter(key)}>{key} <span className="font-mono">{count}</span></Button>)}</nav>
        {keys.length===0?<p className="p-5 text-sm text-muted-foreground">No keys yet. Create one below to get started.</p>:visibleKeys.length===0?<p className="p-5 text-sm text-muted-foreground">No keys in this view. <Button variant="link" onClick={()=>setStatusFilter("all")}>Show all keys</Button></p>:<table className="block w-full table-fixed text-left text-sm md:table"><caption className="sr-only">Current vault key metadata and controls. Secrets are never listed here.</caption><colgroup className="hidden md:table-column-group"><col style={{width:"29%"}}/><col style={{width:"16%"}}/><col style={{width:"18%"}}/><col style={{width:"17%"}}/><col style={{width:"20%"}}/></colgroup><thead className="hidden bg-muted/40 text-xs text-muted-foreground md:table-header-group"><tr>{["Key & scope","State","Created / last used","End date","Controls"].map(label=><th key={label} scope="col" className="p-3 font-medium">{label}</th>)}</tr></thead>{visibleKeys.map(key=><tbody key={key.keyId} data-api-key={key.keyId} tabIndex={-1} className="block border-t border-border md:table-row-group"><tr className="block align-top md:table-row"><th scope="row" className="block p-4 text-left font-normal md:table-cell md:p-3"><p className="break-words font-medium">{key.label}</p><p className="mt-1 break-all font-mono text-xs text-muted-foreground">{key.keyId}</p><p className="mt-2 text-xs text-muted-foreground">{key.scopes.length} {key.scopes.length===1?"scope":"scopes"} · {key.tier}</p></th><td className="block px-4 pb-3 md:table-cell md:p-3"><span className="mr-2 text-xs text-muted-foreground md:hidden">State</span><Badge className={STATUS_STYLES[key.status]}>{key.status}</Badge>{isStale(key,nowMs)&&<span className="mt-2 block text-xs text-annotation">Stale</span>}{key.revokedAt&&<p className="mt-2 text-xs text-muted-foreground">Revoked {formatDate(key.revokedAt)}</p>}</td><td className="block px-4 pb-3 text-xs leading-6 text-muted-foreground md:table-cell md:p-3"><p>Created {formatDate(key.createdAt)}</p><p>Last used {key.lastUsedAt?formatDate(key.lastUsedAt):"Never"}</p></td><td className="block px-4 pb-3 text-xs leading-6 md:table-cell md:p-3"><span className="mr-2 text-muted-foreground md:hidden">End date</span>{key.expiresAt?formatDate(key.expiresAt):"No recorded end date"}</td><td className="block p-4 pt-0 md:table-cell md:p-3"><div className="flex flex-wrap gap-2">{key.status==="active"?<Button variant="outline" className="min-h-11" disabled={busyKeyId!==null||minting} onClick={()=>confirmAction(key,"suspend")}>Suspend</Button>:key.status==="suspended"?<Button variant="outline" className="min-h-11" disabled={busyKeyId!==null||minting} onClick={async()=>{rememberActionOrigin();if(await setStatus(key.keyId,"active"))requestAnimationFrame(restoreActionFocus);}}>Reactivate</Button>:null}{key.status!=="revoked"&&<Button variant="ghost" className="min-h-11 text-destructive" disabled={busyKeyId!==null||minting} onClick={()=>confirmAction(key,"revoke")}>Revoke…</Button>}</div></td></tr><tr className="block md:table-row"><td colSpan={5} className="block px-4 pb-3 md:table-cell md:px-3"><details><summary className="min-h-11 cursor-pointer text-xs font-medium text-primary">Full scope list</summary><ul className="flex flex-wrap gap-2 py-2">{key.scopes.map(scope=><li key={scope} className="max-w-full break-all rounded border border-border bg-muted/30 px-2 py-1 font-mono text-xs">{scope}</li>)}</ul></details></td></tr></tbody>)}</table>}
      </section>
      {/* Mint */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
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
              className="min-h-11"
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
                    preset === p.key ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">{p.label}</span>
                    {preset === p.key ? <CheckCircle2 className="h-4 w-4 text-primary" /> : null}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>
                  <Badge className={cn("mt-2", TIER_STYLES[p.tier])}>{p.tier}</Badge>
                  {p.admin ? <Badge className="ml-2 mt-2 bg-annotation/10 text-annotation">admin role</Badge> : null}
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-border p-4">
              <p className="mb-3 text-sm text-muted-foreground">Advanced: choose individual scopes.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {SCOPES.map((scope) => {
                  const checked = customScopes.includes(scope);
                  return (
                    <label key={scope} className="flex min-h-11 min-w-0 items-center gap-2 text-sm text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setCustomScopes((prev) =>
                            checked ? prev.filter((s) => s !== scope) : [...prev, scope],
                          )
                        }
                      />
                      <code className="break-all font-mono text-xs">{scope}</code>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={mint} disabled={minting} className="min-h-11 bg-primary hover:bg-primary/90">
              {minting ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              Create key
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setAdvanced((v) => !v)} className="text-muted-foreground">
              {advanced ? "Use a preset instead" : "Advanced: choose raw scopes"}
            </Button>
          </div>

          {mintedKey ? (
            <div className="rounded-xl border border-primary/40 bg-primary/5 p-4">
              <p className="break-words text-sm font-medium text-primary">
                Your new key “{mintedKey.label}” — copy it now. It will never be shown again.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 overflow-x-auto rounded bg-card px-3 py-2 font-mono text-xs text-foreground">
                  {mintedKey.key}
                </code>
                <Button size="sm" variant="outline" className="min-h-11" onClick={() => copy(mintedKey.key)}>
                  <Copy className="h-4 w-4" />
                  Copy
                </Button>
              </div>
              <Button size="sm" variant="ghost" className="mt-2 min-h-11 text-primary" onClick={() => setMintedKey(null)}>
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
          <pre className="overflow-x-auto rounded-lg bg-primary px-4 py-3 text-xs leading-6 text-primary-foreground">
{`# 1. Learn what this platform stores (public, live now)
curl ${PUBLIC_APP_ORIGIN}/context-schema

# 2. Verify your key (rolling out)
curl -H "Authorization: Bearer dts_live_..." ${PUBLIC_APP_ORIGIN}/api/v1/me`}
          </pre>
        </CardContent>
      </Card>

      <Dialog open={confirmation!==null} onOpenChange={open=>{if(!open)setConfirmation(null);}}><DialogContent onCloseAutoFocus={event=>{event.preventDefault();restoreActionFocus();}}><DialogHeader><DialogTitle>{confirmation?.action==="revoke"?"Revoke":"Suspend"} {confirmation?.key.label}?</DialogTitle><DialogDescription>{confirmation?.action==="revoke"?"This key will stop working. Its secret cannot be recovered; create a new key if you need one later.":"This key will stop working until you reactivate it. Its existing scopes stay recorded."}</DialogDescription></DialogHeader><DialogFooter><Button className="min-h-11" variant="outline" disabled={busyKeyId===confirmation?.key.keyId} onClick={()=>setConfirmation(null)}>Cancel</Button><Button className="min-h-11" variant={confirmation?.action==="revoke"?"destructive":"default"} disabled={busyKeyId===confirmation?.key.keyId} onClick={async()=>{if(!confirmation)return;const success=confirmation.action==="revoke"?await revoke(confirmation.key.keyId):await setStatus(confirmation.key.keyId,"suspended");if(success)setConfirmation(null);}}>{confirmation?.action==="revoke"?"Revoke key":"Suspend key"}</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}
