import React from "react";
import { useAuth } from "@/lib/AuthContext";

/**
 * ProfileLoadError — dedicated recovery page for /profile/load-error.
 * Renders when profile/bootstrap loading has failed and the user needs
 * an explicit recovery action. This complements the global authError
 * handler in AuthenticatedApp (which fires on 403/auth_required), covering
 * the case where a user navigates directly to this route or the profile
 * bootstrap failed without triggering a global auth error.
 *
 * Recovery actions:
 *   Retry   → restarts the auth/bootstrap flow via checkAppState()
 *   Sign In → opens the supported authentication flow via navigateToLogin()
 */
export default function ProfileLoadError() {
  const { checkAppState, navigateToLogin } = useAuth();

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background p-4">
      <div className="mx-auto max-w-md rounded-2xl border border-destructive/40 bg-destructive/10 p-6 text-center">
        <h2 className="text-base font-bold text-destructive">Unable to load Honda Hub</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your profile could not be loaded. Please try again, or sign in to continue.
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <button
            onClick={() => checkAppState()}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
          >
            Retry
          </button>
          <button
            onClick={() => navigateToLogin()}
            className="rounded-xl border border-border px-4 py-2 text-sm font-medium"
          >
            Sign in
          </button>
        </div>
      </div>
    </div>
  );
}