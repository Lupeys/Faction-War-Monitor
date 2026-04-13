import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import type { FilterState, FilterTab } from "@/types";

const STORAGE_KEY = "war-monitor-filters";
const DEFAULT_FILTERS: FilterState = {
  activeTab: "hittable",
  minLevel: 1,
  maxLevel: 100,
  minBstats: 0,
  maxBstats: 9e15,
};

interface FilterContextValue {
  filters: FilterState;
  setTab: (tab: FilterTab) => void;
  setLevelRange: (min: number, max: number) => void;
  setBstatsRange: (min: number, max: number) => void;
  reset: () => void;
}

const FilterContext = createContext<FilterContextValue | null>(null);

export function FilterProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<FilterState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return { ...DEFAULT_FILTERS, ...JSON.parse(saved) };
    } catch { /* ignore */ }
    return DEFAULT_FILTERS;
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(filters)); } catch { /* ignore */ }
  }, [filters]);

  const setTab = (tab: FilterTab) => setFilters((f) => ({ ...f, activeTab: tab }));
  const setLevelRange = (min: number, max: number) =>
    setFilters((f) => ({ ...f, minLevel: min, maxLevel: max }));
  const setBstatsRange = (min: number, max: number) =>
    setFilters((f) => ({ ...f, minBstats: min, maxBstats: max }));
  const reset = () => setFilters(DEFAULT_FILTERS);

  return (
    <FilterContext.Provider value={{ filters, setTab, setLevelRange, setBstatsRange, reset }}>
      {children}
    </FilterContext.Provider>
  );
}

export function useFilters(): FilterContextValue {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error("useFilters must be used within FilterProvider");
  return ctx;
}
