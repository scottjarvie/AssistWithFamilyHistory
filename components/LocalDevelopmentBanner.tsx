export function LocalDevelopmentBanner() {
 const mode = process.env.NEXT_PUBLIC_LOCAL_DEVELOPMENT_MODE;
 if (mode !== "live" && mode !== "sandbox") return null;
 return <div role="status" style={{ position: "sticky", top: 0, zIndex: 100, background: "var(--background)", color: "var(--foreground)", borderBottom: "1px solid var(--border)", padding: "0.5rem 1rem", fontSize: "0.875rem" }}>{mode === "live" ? "Local site · Live data · Changes affect your real account." : "Development data · Changes stay here. Record-only: media and provider actions unavailable."}</div>;
}
