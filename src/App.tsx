/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Outlet, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppProvider, useApp } from './context/AppContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SignInPage } from './components/SignInPage';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { DeadlineAlertBanner } from './components/DeadlineAlertBanner';
import { OfflineIndicator } from './components/OfflineIndicator';
import { GlobalSearchModal } from './components/GlobalSearchModal';
import { MobileBottomNav } from './components/MobileBottomNav';
import { MobileMoreSheet } from './components/MobileMoreSheet';
import { ErrorBoundary } from './components/ErrorBoundary';
import { formatLandArea } from './lib/units';

const DashboardView = lazy(() =>
  import('./views/DashboardView').then((m) => ({ default: m.DashboardView })),
);
const ProjectInfoView = lazy(() =>
  import('./views/ProjectInfoView').then((m) => ({ default: m.ProjectInfoView })),
);
const LegalAffairsView = lazy(() =>
  import('./views/LegalAffairsView').then((m) => ({ default: m.LegalAffairsView })),
);
const ConstructionView = lazy(() =>
  import('./views/ConstructionView').then((m) => ({ default: m.ConstructionView })),
);
const GovernanceCharterView = lazy(() =>
  import('./views/GovernanceCharterView').then((m) => ({ default: m.GovernanceCharterView })),
);
const FinanceAccountingView = lazy(() =>
  import('./views/FinanceAccountingView').then((m) => ({ default: m.FinanceAccountingView })),
);
const DocumentVaultView = lazy(() =>
  import('./views/DocumentVaultView').then((m) => ({ default: m.DocumentVaultView })),
);
const CommunicationView = lazy(() =>
  import('./views/CommunicationView').then((m) => ({ default: m.CommunicationView })),
);
const StakeholdersView = lazy(() =>
  import('./views/StakeholdersView').then((m) => ({ default: m.StakeholdersView })),
);
const MeetingsView = lazy(() =>
  import('./views/MeetingsView').then((m) => ({ default: m.MeetingsView })),
);
const MeetingDetailView = lazy(() =>
  import('./views/MeetingDetailView').then((m) => ({ default: m.MeetingDetailView })),
);
const CalendarView = lazy(() =>
  import('./views/CalendarView').then((m) => ({ default: m.CalendarView })),
);
const ObligationsView = lazy(() =>
  import('./views/ObligationsView').then((m) => ({ default: m.ObligationsView })),
);
const RisksView = lazy(() => import('./views/RisksView').then((m) => ({ default: m.RisksView })));
const AdminConsoleView = lazy(() =>
  import('./views/AdminConsoleView').then((m) => ({ default: m.AdminConsoleView })),
);
const AssistantView = lazy(() =>
  import('./views/AssistantView').then((m) => ({ default: m.AssistantView })),
);

const MainLayout: React.FC = () => {
  const { language } = useApp();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Offline Alert */}
      <OfflineIndicator />

      {/* Global Search Dialog */}
      <GlobalSearchModal />

      {/* Mobile Menu Drawer (Single, Unified) */}
      <MobileMoreSheet isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />

      {/* Top Navigation */}
      <Navbar onOpenMenu={() => setIsMobileMenuOpen(true)} />

      {/* Critical Legal / Project Deadlines Banner */}
      <DeadlineAlertBanner />

      <div className="flex-1 flex max-w-7xl w-full mx-auto">
        {/* Desktop Sidebar */}
        <Sidebar />

        {/* Dynamic Main View with mobile safe bottom spacing */}
        <main className="flex-1 p-3 sm:p-6 lg:p-8 pb-24 md:pb-8 overflow-y-auto relative">
          <ErrorBoundary>
            <Suspense
              fallback={
                <div className="flex items-center justify-center h-full">
                  <div className="w-8 h-8 border-4 border-amber-600 border-t-transparent rounded-full animate-spin"></div>
                </div>
              }
            >
              <Outlet />
            </Suspense>
          </ErrorBoundary>

          {/* Footer note */}
          <footer className="mt-12 pt-6 border-t border-slate-200 text-[11px] text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              <span className="font-semibold text-slate-700">
                {language === 'tr'
                  ? 'Mombasa Uluslararası Üniversitesi Projesi'
                  : 'Mombasa International University Project'}
              </span>{' '}
              ·{' '}
              <span>
                {language === 'tr'
                  ? 'Kenya Afrika Üniversitesi Vakfı (AUTK)'
                  : 'African University Trust of Kenya (AUTK)'}
              </span>{' '}
              ·{' '}
              <span>
                {language === 'tr'
                  ? `Parsel No: MN/I/5141 (${formatLandArea(84, 'tr')}), Utange/Majaoni`
                  : 'Plot No. MN/I/5141 (84 Acres), Utange/Majaoni'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span>
                {language === 'tr' ? 'Fasıl 164 Kenya Kanunları' : 'Cap 164 Laws of Kenya'}
              </span>
              <span>·</span>
              <span className="text-emerald-600 font-mono font-medium">
                {language === 'tr' ? 'PWA Etkin' : 'PWA Enabled'}
              </span>
              {/* The invested total used to sit here, typed in. A figure
                  that appears on every page reads as current, and this one
                  came from nowhere — there is no query behind it and no date
                  on it. The ledger is where that number lives now, and it
                  says which of it has been audited (M12-03). */}
            </div>
          </footer>
        </main>
      </div>

      {/* Mobile Fixed Bottom Navigation Bar */}
      <MobileBottomNav onOpenMore={() => setIsMobileMenuOpen(true)} isMoreOpen={isMobileMenuOpen} />
    </div>
  );
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: true,
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 60 * 24, // 24 hours
    },
  },
});

/**
 * Nothing renders until we know who is asking. The portal used to mount
 * straight into the dashboard with a hard-coded identity, so every screen was
 * reachable by anyone who loaded the page.
 */
const Gate: React.FC = () => {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-4 border-amber-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (status !== 'signed_in') return <SignInPage />;

  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<DashboardView />} />
        <Route path="/project_info" element={<ProjectInfoView />} />
        <Route path="/legal" element={<LegalAffairsView />} />
        <Route path="/construction" element={<ConstructionView />} />
        <Route path="/governance" element={<GovernanceCharterView />} />
        <Route path="/finance" element={<FinanceAccountingView />} />
        <Route path="/documents" element={<DocumentVaultView />} />
        <Route path="/stakeholders" element={<StakeholdersView />} />
        <Route path="/calendar" element={<CalendarView />} />
        <Route path="/obligations" element={<ObligationsView />} />
        <Route path="/risks" element={<RisksView />} />
        <Route path="/meetings" element={<MeetingsView />} />
        <Route path="/meetings/:id" element={<MeetingDetailView />} />
        <Route path="/communication" element={<CommunicationView />} />
        {/* Open to anyone signed in. The assistant reads the archive with
            the caller's own token, so it can only ever show somebody what
            they could already open — and never anything restricted. */}
        <Route path="/assistant" element={<AssistantView />} />
        {/* Open to anyone signed in: the console shows each person only the
            parts their policies let them use, and everyone has a right to see
            what their own access consists of. */}
        <Route path="/admin" element={<AdminConsoleView />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <AppProvider>
          <AuthProvider>
            <Gate />
          </AuthProvider>
        </AppProvider>
      </Router>
    </QueryClientProvider>
  );
}
