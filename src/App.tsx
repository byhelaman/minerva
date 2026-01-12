import { Routes, Route, Outlet } from "react-router-dom";
import { useEffect } from "react";
import { MainNav } from "@/components/main-nav";
import { UserNav } from "@/components/user-nav";
import { ScheduleDashboard } from "@/features/schedules/components/ScheduleDashboard";
import { SettingsPage } from "@/features/settings/components/SettingsPage";
import { ProfilePage } from "@/features/profile/components/ProfilePage";
import { DocsPage } from "@/features/docs/components/DocsPage";
import { useSettings } from "@/components/settings-provider";
import { useTheme } from "@/components/theme-provider";

// Syncs theme from settings file to ThemeProvider on app load
function ThemeSyncer() {
  const { settings, isLoading } = useSettings();
  const { setTheme } = useTheme();

  useEffect(() => {
    if (!isLoading && settings.theme) {
      setTheme(settings.theme);
    }
  }, [isLoading, settings.theme, setTheme]);

  return null;
}

function Layout() {
  return (
    <div className="max-w-[1400px] mx-auto p-5 pb-10">
      <ThemeSyncer />
      <div className="flex pr-3">
        <MainNav />
        <div className="ml-auto flex items-center space-x-4">
          <UserNav />
        </div>
      </div>
      <div className="flex-1 px-3">
        <Outlet />
      </div>
    </div>
  );
}

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<ScheduleDashboard />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/docs" element={<DocsPage />} />
      </Route>
    </Routes>
  );
}

export default App;

