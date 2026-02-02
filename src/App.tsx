import { Routes, Route, Outlet } from "react-router-dom";

import { MainNav } from "@/components/main-nav";
import { UserNav } from "@/components/user-nav";
import { ScheduleDashboard } from "@/features/schedules/components/ScheduleDashboard";
import { SettingsPage } from "@/features/settings/components/SettingsPage";
import { ProfilePage } from "@/features/profile/components/ProfilePage";
import { DocsPage } from "@/features/docs/components/DocsPage";
import { SystemPage } from "@/features/system/components/SystemPage";
import { ReportsPage } from "@/features/system/components/ReportsPage";
import { LoginPage } from "@/features/auth/components/LoginPage";

import { ProtectedRoute, AdminRoute } from "@/components/ProtectedRoute";

function Layout() {
  return (
    <div className="flex flex-col min-h-screen gap-6 p-5">
      <div className="flex pr-3">
        <MainNav />
        <div className="ml-auto flex items-center space-x-4">
          <UserNav />
        </div>
      </div>
      <div className="w-full max-w-[1400px] mx-auto pb-8">
        <Outlet />
      </div>
    </div>
  );
}

import { UpdateDialog } from "@/components/update-dialog";
import { GlobalSyncManager } from "@/features/system/components/GlobalSyncManager";

function App() {
  return (
    <>
      <UpdateDialog />
      <Routes>
        {/* Ruta pública - Login (signup se hace desde el dialog) */}
        <Route path="/login" element={<LoginPage />} />

        {/* Rutas protegidas */}
        <Route
          element={
            <ProtectedRoute>
              <GlobalSyncManager />
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<ScheduleDashboard />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/docs" element={<DocsPage />} />

          <Route path="/system" element={
            <AdminRoute>
              <SystemPage />
            </AdminRoute>
          } />

          <Route path="/reports" element={
            <ProtectedRoute requiredPermission="reports.view">
              <ReportsPage />
            </ProtectedRoute>
          } />
        </Route>
      </Routes>
    </>
  );
}

export default App;

