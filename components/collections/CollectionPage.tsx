import type { ReactNode } from "react";
export function CollectionPage({ title, eyebrow, description, action, children }: { title:string; eyebrow:string; description:string; action?:ReactNode; children:ReactNode }) {
  return <div className="min-w-0 p-4 sm:p-8"><header className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="mb-2 font-mono text-xs uppercase tracking-[.16em] text-annotation">{eyebrow}</p><h1 className="text-4xl font-semibold sm:text-5xl">{title}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p></div>{action}</header>{children}</div>;
}
