import {ShieldAlert} from "lucide-react";
import {BaselineApiKeyManager as ApiKeyManager,type ApiKeyRow} from "./BaselineApiKeyManager";
/** Original route JSX with invented records; no server/backend reads. */
export function BaselineOperatorView({keys}:{keys:ApiKeyRow[]}) {
  return (
    <div className="max-w-4xl p-4 sm:p-8">
      <header className="mb-8">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-6 w-6 text-amber-700" />
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl font-semibold text-stone-950">
            Admin API
          </h1>
        </div>
        <p className="mt-2 max-w-2xl text-stone-600">
          Operator console: review keys, flag stale credentials, and suspend or revoke access. Admin
          and security scopes require this operator role, separate from the normal key tiers.
        </p>
      </header>
      <ApiKeyManager initialKeys={keys} mode="admin" isAdmin />
    </div>
  );
}
