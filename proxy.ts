import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { localPublicAuthEnabled, localLiveProxy } from "@/lib/localLiveAuth";
import { NextRequest, type NextFetchEvent, NextResponse } from "next/server";
import { isAnonymousVaultEnabled, isClerkEnabled } from "@/lib/clerk/config";
import { canonicalizeProductionUrl } from "@/lib/site/canonicalProductionUrl";
import { VAULT_PREVIEW_COOKIE } from "@/lib/vault/constants";
import { PROTECTED_ROUTE_PATTERNS } from "@/lib/vault/protectedRoutes";
import {
  isVaultPageRead,
  signedOutVaultSignInLocation,
} from "@/lib/vault/signedOutVaultRedirect";

const isProtectedRoute = createRouteMatcher([...PROTECTED_ROUTE_PATTERNS]);

const hasClerkKeys = isClerkEnabled();
const requireAuth = process.env.REQUIRE_AUTH === "true";
const allowAnonymousVault = isAnonymousVaultEnabled();

function getGuestVaultOwner(existingValue?: string | null) {
  const trimmedValue = existingValue?.trim();
  if (trimmedValue) {
    return trimmedValue;
  }

  return `guest_${crypto.randomUUID()}`;
}

const authMiddleware = clerkMiddleware(
  async (auth, req) => {
    const redirectUrl = canonicalizeProductionUrl(req.url);
    if (redirectUrl) {
      return NextResponse.redirect(redirectUrl, 308);
    }

    const authState = await auth();

    if ((requireAuth || !allowAnonymousVault) && isProtectedRoute(req)) {
      // Signed-out reads of vault pages redirect to sign-in for every Accept
      // value. auth.protect() alone rewrites non-document requests to 404.
      // Signed-in visitors, writes, and credentialed calls still use protect().
      if (
        !authState.userId &&
        !req.headers.get("authorization") &&
        isVaultPageRead(req.nextUrl.pathname, req.method)
      ) {
        const response = NextResponse.redirect(
          signedOutVaultSignInLocation(req.nextUrl),
          307,
        );
        response.headers.set("Cache-Control", "private, no-store");
        return response;
      }

      await auth.protect();
      return;
    }

    if (!authState.userId && allowAnonymousVault) {
      const guestOwner = getGuestVaultOwner(
        req.cookies.get(VAULT_PREVIEW_COOKIE)?.value
      );
      const response = NextResponse.next();
      response.cookies.set(VAULT_PREVIEW_COOKIE, guestOwner, {
        httpOnly: true,
        sameSite: "lax",
        secure: req.nextUrl.protocol === "https:",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
      return response;
    }
  },
  {
    signInUrl: "/sign-in",
    signUpUrl: "/sign-up",
  }
);

const hostedProxy = hasClerkKeys
  ? authMiddleware
  : function proxy() {
      if (requireAuth) {
        return new NextResponse("Authentication is unavailable", {
          status: 503,
          headers: { "Cache-Control": "private, no-store" },
        });
      }
      return NextResponse.next();
    };

export default function proxy(request: NextRequest, event: NextFetchEvent) {
 return localPublicAuthEnabled() ? localLiveProxy(request) : hostedProxy(request, event);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
