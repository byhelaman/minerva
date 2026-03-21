import { Routes, Route, Outlet } from "react-router-dom";

import { MainNav } from "@/components/main-nav";
import { UserNav } from "@/components/user-nav";
import { NotificationBell } from "@/components/NotificationBell";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ScheduleDashboard } from "@/features/schedules/components/ScheduleDashboard";
import { PoolsPage } from "@/features/schedules/components/PoolsPage";
import { SystemPage } from "@/features/system/components/SystemPage";
import { SignInPage } from "@/features/auth/components/SignInPage";

import { ProtectedRoute, AdminRoute } from "@/components/ProtectedRoute";
import { ChatWidget } from "@/features/chat/components/ChatWidget";

function Layout() {
  return (
    <div className="flex flex-col h-screen p-5">
      <div className="flex p-3 px-5">
        <MainNav />
        <div className="ml-auto flex items-center space-x-4">
          <NotificationBell />
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
import { UpdaterProvider } from "@/components/updater-context";
import { GlobalSyncManager } from "@/components/GlobalSyncManager";

function App() {
  return (
    <UpdaterProvider>
      <ErrorBoundary>
        <UpdateDialog />
        <Routes>
          {/* Ruta pública - Login (signup se hace desde el dialog) */}
          <Route path="/login" element={<SignInPage />} />

          {/* Rutas protegidas */}
          <Route
            element={
              <ProtectedRoute>
                <GlobalSyncManager />
                <Layout />
                <ChatWidget />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<ErrorBoundary><ScheduleDashboard /></ErrorBoundary>} />
            <Route path="/pools" element={
              <ProtectedRoute requiredPermission="pools.manage">
                <ErrorBoundary><PoolsPage /></ErrorBoundary>
              </ProtectedRoute>
            } />

            <Route path="/system" element={
              <AdminRoute>
                <ErrorBoundary><SystemPage /></ErrorBoundary>
              </AdminRoute>
            } />
          </Route>
        </Routes>
      </ErrorBoundary>
    </UpdaterProvider>
  );
}

export default App;

