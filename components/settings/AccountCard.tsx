import { auth, signOut } from "@/lib/auth";

/** Settings → Account: identity + sign out (T1). */
export async function AccountCard() {
  const session = await auth();
  if (!session?.user) return null;

  return (
    <div className="card elev-sm" style={{ gap: 12, padding: 18 }}>
      <div
        style={{
          fontSize: 11,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--color-neutral-700)",
        }}
      >
        Account
      </div>
      <div>
        <div style={{ fontWeight: 600 }}>{session.user.name ?? "Signed in"}</div>
        <div className="text-muted" style={{ fontSize: 13 }}>
          {session.user.email}
        </div>
      </div>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      >
        <button type="submit" className="btn btn-secondary" style={{ marginTop: 0 }}>
          Sign out
        </button>
      </form>
    </div>
  );
}
