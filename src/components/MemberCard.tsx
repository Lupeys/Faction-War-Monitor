import type { TornMember } from "@/types";

interface MemberCardProps {
  member: TornMember;
  myBstats: number | null;
  onAttack: (id: number) => void;
}

function formatBstats(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (n >= 1e12) return (n / 1e12).toFixed(1).replace(/\.0$/, "") + "t";
  if (n >= 1e9)  return (n / 1e9).toFixed(1).replace(/\.0$/, "") + "b";
  if (n >= 1e6)  return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "m";
  if (n >= 1e3)  return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n | 0);
}

function nameClass(my: number | null, theirs: number): string {
  if (!my) return "";
  const ratio = theirs / my;
  if (ratio < 0.5)   return "bg-zinc-700";
  if (ratio <= 1.5)  return "bg-green-900/60 border-green-700";
  if (ratio <= 3)    return "bg-orange-900/60 border-orange-700";
  return "bg-red-900/60 border-red-700";
}

const STATUS_COLORS: Record<string, string> = {
  Hospital:  "text-red-400",
  Traveling: "text-yellow-400",
  Abroad:    "text-yellow-400",
  Okay:      "text-green-400",
  Online:    "text-green-400",
  Offline:   "text-zinc-500",
  Idle:      "text-orange-400",
};

const ACTIVITY_DOTS: Record<string, string> = {
  Online:   "bg-green-400",
  Offline:  "bg-zinc-600",
  Idle:     "bg-orange-400",
  Hospital: "bg-red-400",
  Traveling:"bg-yellow-400",
};

export function MemberCard({ member, myBstats, onAttack }: MemberCardProps) {
  const { name, id, level, bstats, status, statusDescription, lastActionRelative, activity } = member;
  const nc = nameClass(myBstats, bstats);

  return (
    <div className={
      "rounded-xl border border-zinc-800 bg-zinc-900 p-4 shadow-sm transition-colors " +
      (nc || "bg-zinc-900")
    }>
      {/* Top row: name + attack button */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`inline-block h-2 w-2 rounded-full ${ACTIVITY_DOTS[activity] ?? "bg-zinc-600"}`} />
            <span className="truncate text-base font-semibold text-zinc-100">{name}</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-xs text-zinc-500">
            <span>Lv.{level}</span>
            <span>·</span>
            <span>{statusDescription || status}</span>
          </div>
        </div>
        <button
          onClick={() => onAttack(id)}
          className="flex-shrink-0 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-500 active:scale-95 transition-all"
        >
          Attack
        </button>
      </div>

      {/* Bottom row: stats */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex flex-col gap-0.5">
          <span className="text-zinc-500 text-xs">Battle Stats</span>
          <span className="font-mono text-zinc-200">{formatBstats(bstats)}</span>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-zinc-500 text-xs">Last Action</span>
          <span className="text-zinc-400 text-xs">{lastActionRelative || "—"}</span>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-zinc-500 text-xs">Status</span>
          <span className={`text-xs font-medium ${STATUS_COLORS[status] ?? "text-zinc-400"}`}>
            {status}
          </span>
        </div>
      </div>

      {/* ID for reference */}
      <div className="mt-2 text-xs text-zinc-600">#{id}</div>
    </div>
  );
}
