import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isClerkEnabled } from "@/lib/clerk/config";
import { VAULT_PREVIEW_COOKIE } from "@/lib/vault/constants";

const isProtectedRoute = createRouteMatcher([
  "/app(.*)",
  "/api/people(.*)",
  "/api/import(.*)",
  "/api/process(.*)",
  "/api/convex(.*)",
]);

const hasClerkKeys = isClerkEnabled();
const requireAuth = process.env.REQUIRE_AUTH === "true";

const legacyHosts = new Set([
  "tell-their-stories.vercel.app",
  "tell-their-stories-jarvies-projects.vercel.app",
  "tell-their-stories-jarvie-jarvies-projects.vercel.app",
]);

function getGuestVaultOwner(existingValue?: string | null) {
  const trimmedValue = existingValue?.trim();
  if (trimmedValue) {
    return trimmedValue;
  }

  return `guest_${crypto.randomUUID()}`;
}

const authMiddleware = clerkMiddleware(
  async (auth, req) => {
    if (legacyHosts.has(req.nextUrl.host)) {
      const redirectUrl = new URL(req.url);
      redirectUrl.protocol = "https:";
      redirectUrl.host = "discovertheirstories.com";
      return NextResponse.redirect(redirectUrl, 308);
    }

    const authState = await auth();

    if (requireAuth && isProtectedRoute(req)) {
      await auth.protect();
      return;
    }

    if (!authState.userId) {
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

export default hasClerkKeys
  ? authMiddleware
  : function proxy() {
      return NextResponse.next();
    };

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
