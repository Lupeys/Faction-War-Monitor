import { useState, useEffect, useCallback } from "react";
import type { TornMember } from "@/types";

interface UseMembersOptions {
  mode: "faction" | "targets";
}

export function useMembers({ mode }: UseMembersOptions) {
  const [members, setMembers] = useState<TornMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetch_ = useCallback(async () => {
    try {
      setError(null);
      // Use relative URL — zo.space serves both page and API on same origin
      const endpoint = mode === "faction" ? "/api/war-faction" : "/api/war-targets";
      const res = await fetch(endpoint, { cache: "no-store" });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const json = await res.json();
      if (!Array.isArray(json)) throw new Error("Invalid response");
      setMembers(json);
      setLastUpdated(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    setLoading(true);
    fetch_();
  }, [fetch_]);

  return { members, loading, error, lastUpdated, refresh: fetch_ };
}
