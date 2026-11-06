import type { ReactNode } from "react";
export function CollectionPage({ title, eyebrow, description, action, children }: { title:string; eyebrow:string; description:string; action?:ReactNode; children:ReactNode }) {
  return <div className="min-w-0 p-4 sm:p-8"><header className="mb-3 flex flex-wrap items-end justify-between gap-3 sm:mb-5"><div><p className="mb-1 font-mono text-xs uppercase tracking-[.16em] text-annotation sm:mb-2">{eyebrow}</p><h1 className="text-[30px] font-semibold leading-tight sm:text-5xl">{title}</h1><p className="mt-1.5 max-w-3xl text-sm leading-5 text-muted-foreground sm:mt-2 sm:leading-6">{description}</p></div>{action}</header>{children}</div>;
}
