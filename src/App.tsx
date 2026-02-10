import { Routes, Route, Outlet } from "react-router-dom";

import { MainNav } from "@/components/main-nav";
import { UserNav } from "@/components/user-nav";
import { ErrorBoundary } from "@/components/ErrorBoundary";
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
    <div className="flex flex-col h-screen p-5">
      <div className="flex p-3 px-5">
        <MainNav />
        <div className="ml-auto flex items-center space-x-4">
          <UserNav />
        </div>
      </div>
      <div className="w-full px-8 mx-auto flex-1 flex flex-col min-h-0 overflow-auto pb-8">
        <Outlet />
      </div>
    </div>
  );
}

import { UpdateDialog } from "@/components/update-dialog";
import { GlobalSyncManager } from "@/components/GlobalSyncManager";

function App() {
  return (
    <ErrorBoundary>
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
          <Route path="/" element={<ErrorBoundary><ScheduleDashboard /></ErrorBoundary>} />
          <Route path="/settings" element={<ErrorBoundary><SettingsPage /></ErrorBoundary>} />
          <Route path="/profile" element={<ErrorBoundary><ProfilePage /></ErrorBoundary>} />
          <Route path="/docs" element={<ErrorBoundary><DocsPage /></ErrorBoundary>} />

          <Route path="/system" element={
            <AdminRoute>
              <ErrorBoundary><SystemPage /></ErrorBoundary>
            </AdminRoute>
          } />

          <Route path="/reports" element={
            <ProtectedRoute requiredPermission="reports.view">
              <ErrorBoundary><ReportsPage /></ErrorBoundary>
            </ProtectedRoute>
          } />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}

export default App;

