import { useState, useEffect, useCallback, useMemo } from "react";
import { useMembers } from "@/hooks/useMembers";
import { useFilters } from "@/hooks/useFilters";
import { FilterPills } from "@/components/FilterPills";
import { MemberCard } from "@/components/MemberCard";
import type { TornMember, FilterTab, ViewMode } from "@/types";

const API_KEY_STORAGE = "war-monitor-apikey";
const MYPERSONAL_BSTATS_STORAGE = "war-monitor-mystats";

function formatBstats(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (n >= 1e12) return (n / 1e12).toFixed(1).replace(/\.0$/, "") + "t";
  if (n >= 1e9)  return (n / 1e9).toFixed(1).replace(/\.0$/, "") + "b";
  if (n >= 1e6)  return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "m";
  if (n >= 1e3)  return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n | 0);
}

function countByTab(members: TornMember[]): Record<FilterTab, number> {
  const counts: Record<string, number> = {
    hittable: 0, hospital: 0, travel: 0, online: 0, offline: 0, idle: 0, all: 0,
  };
  for (const m of members) {
    counts.all++;
    const act = m.activity ?? "Offline";
    if (m.status === "Hospital") counts.hospital++;
    else if (m.status === "Traveling" || m.status === "Abroad") counts.travel++;
    else if (act === "Online") counts.online++;
    else if (act === "Offline") counts.offline++;
    else if (act === "Idle") counts.idle++;
    if (m.status === "Okay" || m.status === "Hospital") counts.hittable++;
  }
  return counts as Record<FilterTab, number>;
}

function filterMembers(members: TornMember[], _myBstats: number | null, tab: FilterTab): TornMember[] {
  return members.filter((m) => {
    if (tab === "hittable") return m.status === "Okay" || m.status === "Hospital";
    if (tab === "hospital") return m.status === "Hospital";
    if (tab === "travel")   return m.status === "Traveling" || m.status === "Abroad";
    if (tab === "online")   return m.activity === "Online";
    if (tab === "offline")  return m.activity === "Offline";
    if (tab === "idle")     return m.activity === "Idle";
    return true;
  });
}

export function WarMonitorPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("faction");
  const [myBstats, setMyBstats] = useState<number | null>(null);
  const [personalApiKey, setPersonalApiKey] = useState<string>("");
  const [showApiInput, setShowApiInput] = useState(false);
  const [targetInput, setTargetInput] = useState("");
  const [sharedToken, setSharedToken] = useState("");
  const [addingTarget, setAddingTarget] = useState(false);
  const [addingError, setAddingError] = useState<string | null>(null);

  const { members, loading, error, lastUpdated, refresh } = useMembers({ mode: viewMode });
  const { filters } = useFilters();

  useEffect(() => {
    try {
      const key = localStorage.getItem(API_KEY_STORAGE);
      if (key) setPersonalApiKey(key);
      const stats = localStorage.getItem(MYPERSONAL_BSTATS_STORAGE);
      if (stats) setMyBstats(parseInt(stats, 10));
    } catch { /* ignore */ }
  }, []);

  const handleAttack = useCallback((id: number) => {
    window.open(`https://www.torn.com/loader.php?sid=attack&user2ID=${id}`, "_blank", "noopener");
  }, []);

  const handleSaveApiKey = useCallback(async () => {
    if (!personalApiKey.trim()) return;
    try {
      localStorage.setItem(API_KEY_STORAGE, personalApiKey.trim());
      const res = await fetch(`/api/me?key=${encodeURIComponent(personalApiKey.trim())}`);
      if (!res.ok) throw new Error("Invalid API key");
      const data = await res.json();
      if (data.bstats) {
        setMyBstats(data.bstats);
        localStorage.setItem(MYPERSONAL_BSTATS_STORAGE, String(data.bstats));
      }
      setShowApiInput(false);
    } catch {
      alert("Failed to verify API key. Check your key and try again.");
    }
  }, [personalApiKey]);

  const handleAddTargets = useCallback(async () => {
    const raw = targetInput.trim();
    if (!raw) return;
    const nums = (raw.match(/\d+/g) ?? []).map((s) => parseInt(s, 10)).filter((n) => !isNaN(n) && n > 0);
    if (!nums.length) return;
    setAddingTarget(true);
    setAddingError(null);
    try {
      const res = await fetch("/api/targets/shared", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(sharedToken ? { "X-Shared-Token": sharedToken } : {}) },
        body: JSON.stringify({ ids: nums }),
      });
      if (!res.ok) throw new Error("Failed to add targets");
      setTargetInput("");
      refresh();
    } catch (e) {
      setAddingError(e instanceof Error ? e.message : "Failed to add");
    } finally {
      setAddingTarget(false);
    }
  }, [targetInput, sharedToken, refresh]);

  const counts = useMemo(() => countByTab(members), [members]);
  const filtered = useMemo(() => filterMembers(members, myBstats, filters.activeTab), [members, myBstats, filters.activeTab]);

  const lastUpdatedStr = lastUpdated
    ? lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : null;

  return (
    <div className="mx-auto max-w-lg px-4 py-6 pb-24">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Hellfire War Monitor</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            {viewMode === "faction" ? "Opposing faction" : "Chain targets"}
            {lastUpdatedStr && <span className="ml-2 text-zinc-600">· {lastUpdatedStr}</span>}
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setViewMode("faction")}
          className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${
            viewMode === "faction"
              ? "border-blue-500/50 bg-blue-500/10 text-blue-400"
              : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"
          }`}
        >
          Opposing Faction
        </button>
        <button
          onClick={() => setViewMode("targets")}
          className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${
            viewMode === "targets"
              ? "border-blue-500/50 bg-blue-500/10 text-blue-400"
              : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"
          }`}
        >
          Chain Targets
        </button>
      </div>

      <div className="mb-5 rounded-xl border border-zinc-800 bg-zinc-900/80 p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-zinc-300">Your Battle Stats</span>
          {myBstats && (
            <span className="font-mono text-sm text-green-400">{formatBstats(myBstats)}</span>
          )}
        </div>
        {!myBstats && !showApiInput && (
          <button
            onClick={() => setShowApiInput(true)}
            className="w-full rounded-lg border border-dashed border-zinc-600 py-2 text-sm text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
          >
            Add your API key
          </button>
        )}
        {showApiInput && (
          <div className="space-y-2">
            <input
              type="password"
              value={personalApiKey}
              onChange={(e) => setPersonalApiKey(e.target.value)}
              placeholder="Paste your Torn API key"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500"
            />
            <button
              onClick={handleSaveApiKey}
              className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-500"
            >
              Save & Verify
            </button>
          </div>
        )}
      </div>

      {viewMode === "targets" && (
        <div className="mb-5 rounded-xl border border-zinc-800 bg-zinc-900/80 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-300">Add Targets</span>
          </div>
          <input
            type="text"
            value={targetInput}
            onChange={(e) => setTargetInput(e.target.value)}
            placeholder="Target IDs (comma or space separated)"
            className="mb-2 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500"
          />
          <input
            type="password"
            value={sharedToken}
            onChange={(e) => setSharedToken(e.target.value)}
            placeholder="Shared token (optional)"
            className="mb-2 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500"
          />
          {addingError && <p className="mb-2 text-xs text-red-400">{addingError}</p>}
          <button
            onClick={handleAddTargets}
            disabled={addingTarget || !targetInput.trim()}
            className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {addingTarget ? "Adding..." : "Add Targets"}
          </button>
        </div>
      )}

      <FilterPills counts={counts} />

      {error && (
        <div className="mt-4 rounded-lg border border-red-800 bg-red-900/30 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {!loading && !error && (
        <p className="mt-4 mb-3 text-xs text-zinc-600">
          Showing {filtered.length} of {members.length} members
        </p>
      )}

      <div className="space-y-3">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-blue-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-zinc-500">No targets match this filter</p>
          </div>
        ) : (
          filtered.map((member) => (
            <MemberCard
              key={member.id}
              member={member}
              myBstats={myBstats}
              onAttack={handleAttack}
            />
          ))
        )}
      </div>
    </div>
  );
}