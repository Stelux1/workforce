// Stranice šalju poruke preko `sonner` (toast.success/error), pa mora da bude uključen njegov Toaster.
import { Toaster } from "@/components/ui/sonner"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { AppSettingsProvider } from '@/lib/AppSettingsContext';
import { LanguageProvider } from '@/lib/LanguageContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import SetupRequired from '@/components/SetupRequired';
import Login from '@/pages/Login';
import { isAdminOnlyPath } from '@/lib/access';
import { supabaseConfigured } from '@/api/supabase';

import AppLayout from '@/components/layout/AppLayout';
import Dashboard from '@/pages/Dashboard';
import Employees from '@/pages/Employees';
import EmployeeForm from '@/pages/EmployeeForm';
import EmployeeDetail from '@/pages/EmployeeDetail';
import Documents from '@/pages/Documents';
import Attendance from '@/pages/Attendance';
import SchedulePage from '@/pages/SchedulePage';
import Tasks from '@/pages/Tasks';
import LeaveRequests from '@/pages/LeaveRequests';
import Notifications from '@/pages/Notifications';
import Reports from '@/pages/Reports';
import PayrollDashboard from '@/pages/payroll/PayrollDashboard';
import Timesheets from '@/pages/payroll/Timesheets';
import TimesheetDashboard from '@/pages/timesheets/TimesheetDashboard';
import MonthlyPayroll from '@/pages/payroll/MonthlyPayroll';
import PayrollReports from '@/pages/payroll/PayrollReports';
import Clients from '@/pages/payroll/Clients';
import EmailNotifications from '@/pages/EmailNotifications';
import DepartmentsSettings from '@/pages/DepartmentsSettings';
import Projects from '@/pages/projects/Projects';
import ProjectDetail from '@/pages/projects/ProjectDetail';
import ProjectCostsPage from '@/pages/projects/ProjectCostsPage';
import CostCategoriesSettings from '@/pages/CostCategoriesSettings';
import CoefficientsSettings from '@/pages/CoefficientsSettings';
import CompanySettings from '@/pages/CompanySettings';
import UsersSettings from '@/pages/UsersSettings';
import Vendors from '@/pages/Vendors';
import RatesPage from '@/pages/rates/RatesPage';

// Operater koji otvori adresu stranice samo za admina vraća se na početnu (D3).
const AdminRouteGuard = ({ children }) => {
  const { isAdmin } = useAuth();
  const location = useLocation();
  if (!isAdmin && isAdminOnlyPath(location.pathname)) return <Navigate to="/" replace />;
  return children;
};

const AuthenticatedApp = () => {
  const { isLoadingAuth, isAuthenticated, authError } = useAuth();

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError?.type === 'user_not_registered') {
    return <UserNotRegisteredError />;
  }

  // Neprijavljen korisnik na bilo kojoj adresi vidi prijavu; posle prijave ostaje na istoj adresi.
  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <AdminRouteGuard>
    <Routes>
      {/* Posle prijave sa adrese /login vodi na početnu (ranije 404). */}
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/employees" element={<Employees />} />
        <Route path="/employees/new" element={<EmployeeForm />} />
        <Route path="/employees/edit" element={<EmployeeForm />} />
        <Route path="/employees/:id" element={<EmployeeDetail />} />
        <Route path="/documents" element={<Documents />} />
        <Route path="/attendance" element={<Attendance />} />
        <Route path="/schedule" element={<SchedulePage />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/leave-requests" element={<LeaveRequests />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/payroll" element={<PayrollDashboard />} />
        <Route path="/timesheets" element={<Timesheets />} />
        <Route path="/timesheet-dashboard" element={<TimesheetDashboard />} />
        <Route path="/payroll/monthly" element={<MonthlyPayroll />} />
        {/* Stari „Nedeljni obračun" je sada mesečni (Faza 3) — stari linkovi vode na novu stranicu. */}
        <Route path="/payroll/weekly" element={<Navigate to="/payroll/monthly" replace />} />
        <Route path="/payroll/reports" element={<PayrollReports />} />
        <Route path="/clients" element={<Clients />} />
        <Route path="/vendors" element={<Vendors />} />
        <Route path="/rates" element={<RatesPage />} />
        <Route path="/email-notifications" element={<EmailNotifications />} />
        <Route path="/settings/departments" element={<DepartmentsSettings />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/:id" element={<ProjectDetail />} />
        <Route path="/project-costs" element={<ProjectCostsPage />} />
        <Route path="/settings/cost-categories" element={<CostCategoriesSettings />} />
        <Route path="/settings/coefficients" element={<CoefficientsSettings />} />
        <Route path="/settings/company" element={<CompanySettings />} />
        <Route path="/settings/users" element={<UsersSettings />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
    </AdminRouteGuard>
  );
};

function App() {
  if (!supabaseConfigured) return <SetupRequired />;
  return (
    <AuthProvider>
      <AppSettingsProvider>
      <LanguageProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster richColors closeButton position="top-right" />
      </QueryClientProvider>
      </LanguageProvider>
      </AppSettingsProvider>
    </AuthProvider>
  )
}

export default App