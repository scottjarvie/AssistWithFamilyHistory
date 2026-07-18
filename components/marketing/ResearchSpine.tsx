import {
  Archive,
  Feather,
  SearchCheck,
  Upload,
  type LucideIcon,
} from "lucide-react";

export const researchSpineStages = [
  {
    id: "capture",
    label: "Capture",
    description: "Bring source material in deliberately, with its origin intact.",
    icon: Upload,
  },
  {
    id: "vault",
    label: "Vault",
    description: "Preserve originals, import history, and evidence connections.",
    icon: Archive,
  },
  {
    id: "research",
    label: "Research",
    description: "Review claims, conflicts, gaps, and historical context.",
    icon: SearchCheck,
  },
  {
    id: "story",
    label: "Story",
    description: "Write from reviewed evidence and publish intentionally.",
    icon: Feather,
  },
] as const satisfies ReadonlyArray<{
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
}>;

export type ResearchSpineStage = (typeof researchSpineStages)[number]["id"];

type ResearchSpineProps = {
  activeStage?: ResearchSpineStage;
};

export function ResearchSpine({ activeStage }: ResearchSpineProps) {
  return (
    <ol
      aria-label="Research journey"
      className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
    >
      {researchSpineStages.map((stage, index) => {
        const Icon = stage.icon;
        const active = stage.id === activeStage;

        return (
          <li
            key={stage.id}
            aria-current={active ? "step" : undefined}
            className={`relative overflow-hidden rounded-2xl border p-5 shadow-[0_18px_45px_-36px_#132b35] ${
              active
                ? "border-[#c57d39] bg-[#fffaf2]"
                : "border-[#d8c7a7] bg-[#f8f3e7]"
            }`}
          >
            <div className="mb-6 flex items-center justify-between">
              <span className="font-mono text-xs tracking-[0.2em] text-[#75694f]">
                0{index + 1}
              </span>
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-full border ${
                  active
                    ? "border-[#c57d3980] bg-[#c57d3918] text-[#9f5a2d]"
                    : "border-[#234d5e40] bg-[#234d5e0d] text-[#234d5e]"
                }`}
              >
                <Icon aria-hidden="true" className="h-4 w-4" />
              </span>
            </div>
            <h3 className="text-2xl font-semibold text-[#1d212a]" data-display="true">
              {stage.label}
            </h3>
            <p className="mt-2 text-sm leading-6 text-[#5f665f]">
              {stage.description}
            </p>
            {active ? (
              <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9f5a2d]">
                You are here
              </p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
