import { SignUp } from "@clerk/nextjs";
import { isClerkEnabled } from "@/lib/clerk/config";

export default function SignUpPage() {
  if (!isClerkEnabled()) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50 p-4">
        <p className="max-w-md text-center text-sm text-stone-600">
          Sign-up is not configured yet. Add Clerk environment variables to enable authentication.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 p-4">
      <SignUp />
    </div>
  );
}
