"use client";

import { SafeLink as Link } from "@/components/layout/SafeLink";
import { UserButton, useUser } from "@clerk/nextjs";
import { HardDriveDownload, LogIn, ShieldCheck, UserRound, UserRoundPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type VaultMode = "user" | "local" | "anonymous";

interface VaultAccountPanelProps {
  clerkEnabled: boolean;
  mode: VaultMode;
  vaultOwnerId: string;
  collapsed?: boolean;
}

function SignedInAccountBody({ collapsed = false }: { collapsed?: boolean }) {
  const { user, isLoaded } = useUser();
  const displayName =
    user?.fullName ||
    user?.primaryEmailAddress?.emailAddress ||
    user?.username ||
    "Signed in account";

  if (collapsed) {
    return (
      <div className="flex justify-center">
        <UserButton afterSignOutUrl="/" />
      </div>
    );
  }

  // GEN-82: removed the raw `vaultOwnerId` card (font-mono `user_…`) from the
  // signed-in branch — it was a debugging artifact leaked into production UX.
  // The top-right UserButton in AppTopBar is the primary sign-out affordance;
  // this sidebar card is the secondary one (the redundancy is intentional
  // because sidebar collapses on small screens, but the top bar stays).
  return (
    <div className="rounded-2xl border border-stone-700 bg-stone-800/80 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Badge className="bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/15">
              Signed in
            </Badge>
            <span className="text-[11px] uppercase tracking-[0.2em] text-stone-500">
              Private vault
            </span>
          </div>
          <p className="mt-3 truncate text-sm font-medium text-white">
            {isLoaded ? displayName : "Loading account..."}
          </p>
          <p className="mt-1 text-sm text-stone-400">
            This research vault is tied to your account.
          </p>
        </div>
        <UserButton afterSignOutUrl="/" />
      </div>
    </div>
  );
}

export function VaultAccountPanel({
  clerkEnabled,
  mode,
  vaultOwnerId,
  collapsed = false,
}: VaultAccountPanelProps) {
  if (!clerkEnabled) {
    return collapsed ? (
      <div className="flex justify-center text-stone-400">
        <HardDriveDownload className="h-5 w-5" />
      </div>
    ) : (
      <div className="rounded-2xl border border-stone-700 bg-stone-800/80 p-3">
        <div className="flex items-center gap-2">
          <Badge className="bg-sky-500/15 text-sky-200 hover:bg-sky-500/15">Local mode</Badge>
          <span className="text-[11px] uppercase tracking-[0.2em] text-stone-500">No auth</span>
        </div>
        <p className="mt-3 text-sm font-medium text-white">Local development vault</p>
        <p className="mt-1 text-sm text-stone-400">
          Clerk is not configured, so the app is using one local workspace on this machine.
        </p>
        <div className="mt-3 rounded-xl border border-stone-700/80 bg-stone-900/70 px-3 py-2">
          <p className="text-[11px] uppercase tracking-[0.2em] text-stone-500">Vault owner</p>
          <p className="mt-1 truncate font-mono text-xs text-stone-300">{vaultOwnerId}</p>
        </div>
      </div>
    );
  }

  if (mode === "user") {
    return <SignedInAccountBody collapsed={collapsed} />;
  }

  if (collapsed) {
    return (
      <div className="flex justify-center text-amber-300">
        <UserRound className="h-5 w-5" />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-stone-800/90 p-3">
      <div className="flex items-center gap-2">
        <Badge className="bg-amber-500/15 text-amber-100 hover:bg-amber-500/15">Guest vault</Badge>
        <span className="text-[11px] uppercase tracking-[0.2em] text-stone-500">Signed out</span>
      </div>
      <p className="mt-3 text-sm font-medium text-white">This browser is in its own temporary vault</p>
      <p className="mt-1 text-sm text-stone-300">
        You are not signed in. Data here is separate from any account vault, which is why another user&apos;s people will not appear automatically.
      </p>
      <div className="mt-3 rounded-xl border border-stone-700/80 bg-stone-900/70 px-3 py-2">
        <p className="text-[11px] uppercase tracking-[0.2em] text-stone-500">Guest vault id</p>
        <p className="mt-1 truncate font-mono text-xs text-stone-300">{vaultOwnerId}</p>
      </div>
      <div className={cn("mt-3 flex flex-wrap gap-2", collapsed && "hidden")}>
        <Button asChild size="sm" className="bg-white text-stone-900 hover:bg-stone-100">
          <Link href="/sign-in">
            <LogIn className="h-4 w-4" />
            Sign in
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline" className="border-stone-600 bg-transparent text-white hover:bg-stone-800">
          <Link href="/sign-up">
            <UserRoundPlus className="h-4 w-4" />
            Create account
          </Link>
        </Button>
        <Button asChild size="sm" variant="ghost" className="text-stone-300 hover:bg-stone-800 hover:text-white">
          <Link href="/app/imports">
            <ShieldCheck className="h-4 w-4" />
            Import here instead
          </Link>
        </Button>
      </div>
    </div>
  );
}
