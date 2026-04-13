import type { TornMember } from "@/types";

interface MemberCardProps {
  member: TornMember;
  myBstats: number | null;
  onAttack: (id: number) => void;
}

const FF_COLOR = (ff: number) => {
  if (ff >= 30) return "text-red-400 bg-red-900/40";
  if (ff >= 15) return "text-orange-400 bg-orange-900/40";
  if (ff >= 5)  return "text-yellow-400 bg-yellow-900/40";
  return "text-zinc-400 bg-zinc-800";
};

const NAME_BORDER = (my: number | null, theirs: number) => {
  if (!my) return "border-zinc-800";
  const r = theirs / my;
  if (r < 0.5)   return "border-zinc-700";
  if (r <= 1.5)  return "border-green-700/60";
  if (r <= 3)    return "border-orange-700/60";
  return "border-red-700/60";
};

const ACTIVITY_DOTS: Record<string, string> = {
  Online:    "bg-green-400",
  Offline:   "bg-zinc-600",
  Idle:      "bg-orange-400",
  Hospital:  "bg-red-500 animate-pulse",
  Traveling: "bg-yellow-400",
};

const STATUS_COLOR: Record<string, string> = {
  Hospital:  "text-red-400",
  Traveling: "text-yellow-400",
  Abroad:    "text-yellow-400",
  Okay:      "text-green-400",
  Online:    "text-green-400",
  Offline:   "text-zinc-500",
  Idle:      "text-orange-400",
};

export function MemberCard({ member, myBstats, onAttack }: MemberCardProps) {
  const {
    name, id, level,
    bstats, bstatsDisplay, bstats_age,
    fairFight,
    status, statusDescription,
    lastActionRelative, activity,
  } = member;

  const border = NAME_BORDER(myBstats, bstats);
  const ffBg = FF_COLOR(fairFight);

  return (
    <div className={`rounded-xl border bg-zinc-900 p-4 shadow-sm transition-all ${border}`}>
      {/* ── Top: name + attack ───────────────────────────────── */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`inline-block h-2 w-2 flex-shrink-0 rounded-full ${ACTIVITY_DOTS[activity] ?? "bg-zinc-600"}`} />
            <span className="truncate text-base font-semibold text-zinc-100">{name}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-xs text-zinc-500">
            <span className="font-medium text-zinc-400">Lv.{level}</span>
            {statusDescription && statusDescription !== status && (
              <span>· {statusDescription}</span>
            )}
            <span className={`ml-auto font-medium ${STATUS_COLOR[status] ?? "text-zinc-400"}`}>
              {status}
            </span>
          </div>
        </div>
        <button
          onClick={() => onAttack(id)}
          className="flex-shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-500 active:scale-95 transition-all"
        >
          Attack
        </button>
      </div>

      {/* ── Stats row ────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">

        {/* Battle stats */}
        <div className="flex flex-col">
          <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">Battle Stats</span>
          <span className="font-mono text-base font-bold text-zinc-100 leading-none">
            {bstatsDisplay || "—"}
          </span>
          {bstats_age && bstats_age !== "Updated today" && (
            <span className="text-[10px] text-zinc-600 mt-0.5">{bstats_age}</span>
          )}
        </div>

        {/* Fair fight badge */}
        <div className={`flex flex-col items-center rounded-lg border px-3 py-1.5 ${ffBg}`}>
          <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">FF</span>
          <span className="font-mono text-sm font-bold leading-none text-zinc-100">
            {fairFight > 0 ? fairFight.toFixed(1) + "x" : "—"}
          </span>
        </div>

        {/* Last action */}
        <div className="flex flex-col items-end">
          <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">Last Seen</span>
          <span className="text-xs text-zinc-400 leading-none mt-0.5">
            {lastActionRelative || "—"}
          </span>
        </div>

      </div>

      {/* ── ID ──────────────────────────────────────────────── */}
      <div className="mt-2 text-[10px] text-zinc-700">#{id}</div>
    </div>
  );
}