import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "@/components/theme-provider";
import { FilterProvider } from "@/hooks/useFilters";
import { WarMonitorPage } from "@/pages/WarMonitor";

export default function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="war-monitor-theme">
      <FilterProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<WarMonitorPage />} />
          </Routes>
        </BrowserRouter>
      </FilterProvider>
    </ThemeProvider>
  );
}
