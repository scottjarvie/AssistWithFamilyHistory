"use client";
import type { RefObject } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { SafeLink } from "@/components/layout/SafeLink";
import { useHomeTheme } from "./HomeTheme";
import { PARTS } from "./content";
import { IDEAS } from "@/lib/site/ideas";
export default function IdeasDialog({
  id,
  open,
  onOpenChange,
  returnFocus,
}: {
  id?: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  returnFocus: RefObject<HTMLButtonElement | null>;
}) {
  const theme = useHomeTheme();
  const part = PARTS.find((part) => part.id === id);
  const ideas = [
    ...IDEAS.filter((x) => x.id === id),
    ...IDEAS.filter((x) => x.id !== id),
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`fh-dialog ${theme}`}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocus.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {part
              ? `${part.name} · 1 of ${IDEAS.length} ideas`
              : `All ${IDEAS.length} ideas`}
          </DialogTitle>
          <DialogDescription>
            Prompts grounded in what you deliberately save.
          </DialogDescription>
        </DialogHeader>
        <div className="fh-idea-scroll">
          {ideas.map((idea) => (
            <details key={idea.id} open={idea.id === id || undefined}>
              <summary>{idea.situation}</summary>
              <div className="idea-pair">
                <p>
                  <b>Your AI</b>
                  {idea.ai}
                </p>
                <p>
                  <b>Kept here</b>
                  {idea.site}
                </p>
              </div>
              <p>
                <b>Try it with your AI</b>“{idea.prompt}”
              </p>
              <p><b>Available context</b>{idea.context}</p>
              <p><b>Next level</b>{idea.next}</p>
            </details>
          ))}
        </div>
        <SafeLink href="/ideas-and-usage">All ideas on one page →</SafeLink>
      </DialogContent>
    </Dialog>
  );
}
