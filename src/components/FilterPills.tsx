import type { FilterTab } from "@/types";
import { useFilters } from "@/hooks/useFilters";

const TABS: { id: FilterTab; label: string }[] = [
  { id: "hittable", label: "Hittable" },
  { id: "hospital", label: "Hospital" },
  { id: "travel", label: "Travel" },
  { id: "online", label: "Online" },
  { id: "offline", label: "Offline" },
  { id: "idle", label: "Idle" },
  { id: "all", label: "All" },
];

interface FilterPillsProps {
  counts: Record<FilterTab, number>;
}

export function FilterPills({ counts }: FilterPillsProps) {
  const { filters, setTab } = useFilters();

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 text-sm">
      {TABS.map(({ id, label }) => {
        const count = counts[id] ?? 0;
        const active = filters.activeTab === id;
        return (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={
              "flex-shrink-0 rounded-full border px-3 py-1 transition-colors " +
              (active
                ? "border-blue-500 bg-blue-500/20 text-blue-400"
                : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200")
            }
          >
            {label}
            <span className="ml-1.5 opacity-60">{count}</span>
          </button>
        );
      })}
    </div>
  );
}
