import { ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import AppLayout from '@/components/layout/AppLayout'
import LoginPage from '@/app/auth/LoginPage'
import DashboardPage from '@/app/dashboard/DashboardPage'
import OrdersPage from '@/app/orders/OrdersPage'
import OrderDetailPage from '@/app/orders/OrderDetailPage'
import NewOrderPage from '@/app/orders/NewOrderPage'
import EditOrderPage from '@/app/orders/EditOrderPage'
import CustomersPage from '@/app/customers/CustomersPage'
import CustomerDetailPage from '@/app/customers/CustomerDetailPage'
import NewCustomerPage from '@/app/customers/NewCustomerPage'
import EditCustomerPage from '@/app/customers/EditCustomerPage'
import InventoryPage from '@/app/inventory/InventoryPage'
import InventoryDetailPage from '@/app/inventory/InventoryDetailPage'
import NewInventoryPage from '@/app/inventory/NewInventoryPage'
import EditInventoryPage from '@/app/inventory/EditInventoryPage'
import InvoicesPage from '@/app/invoices/InvoicesPage'
import InvoiceDetailPage from '@/app/invoices/InvoiceDetailPage'
import PaymentsPage from '@/app/payments/PaymentsPage'
import NewPaymentPage from '@/app/payments/NewPaymentPage'
import DispatchPage from '@/app/dispatch/DispatchPage'
import NewDispatchPage from '@/app/dispatch/NewDispatchPage'
import ReturnsPage from '@/app/returns/ReturnsPage'
import NewReturnPage from '@/app/returns/NewReturnPage'
import DamagesPage from '@/app/damages/DamagesPage'
import NewDamagePage from '@/app/damages/NewDamagePage'
import ExpensesPage from '@/app/expenses/ExpensesPage'
import NewExpensePage from '@/app/expenses/NewExpensePage'
import CalendarPage from '@/app/calendar/CalendarPage'
import ReportsPage from '@/app/reports/ReportsPage'
import HelpPage from '@/app/help/HelpPage'
import SettingsPage from '@/app/settings/SettingsPage'
import TeamPage from '@/app/settings/TeamPage'
import CompanySettingsPage from '@/app/settings/CompanySettingsPage'
import RoleGuard from '@/components/common/RoleGuard'
import BundlesPage from '@/app/assets/BundlesPage'
import BundleDetailPage from '@/app/assets/BundleDetailPage'
import NewBundlePage from '@/app/assets/NewBundlePage'
import ScannerPage from '@/app/assets/ScannerPage'

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">Loading Rentora...</p>
      </div>
    </div>
  )
}

function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full bg-card border border-red-200 rounded-xl p-8 text-center space-y-4">
        <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto">
          <span className="text-red-600 text-xl">!</span>
        </div>
        <h2 className="text-lg font-semibold text-foreground">Unable to load your account</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">{message}</p>
        <div className="space-y-2 text-xs text-muted-foreground bg-muted rounded-lg p-3 text-left">
          <p className="font-medium">Common fixes:</p>
          <p>• Make sure a row exists in the <code>profiles</code> table for your user ID</p>
          <p>• Make sure the profile's <code>company_id</code> matches a row in <code>companies</code></p>
          <p>• Check browser console for the exact Supabase error</p>
        </div>
        <div className="flex gap-2 justify-center">
          <button
            onClick={onRetry}
            className="btn-primary text-sm"
          >
            Try again
          </button>
          <button
            onClick={() => window.location.href = '/login'}
            className="btn-secondary text-sm"
          >
            Back to login
          </button>
        </div>
      </div>
    </div>
  )
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading, error } = useAuth()

  if (loading) return <LoadingScreen />

  if (error) {
    return (
      <ErrorScreen
        message={error}
        onRetry={() => window.location.reload()}
      />
    )
  }

  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AppRoutes() {
  const { session } = useAuth()

  return (
    <Routes>
      {/* Auth */}
      <Route
        path="/login"
        element={session ? <Navigate to="/" replace /> : <LoginPage />}
      />

      {/* Protected app routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />

        <Route path="orders" element={<OrdersPage />} />
        <Route path="orders/new" element={<RoleGuard require="staff"><NewOrderPage /></RoleGuard>} />
        <Route path="orders/:id" element={<OrderDetailPage />} />
        <Route path="orders/:id/edit" element={<RoleGuard require="staff"><EditOrderPage /></RoleGuard>} />

        <Route path="customers" element={<CustomersPage />} />
        <Route path="customers/new" element={<RoleGuard require="staff"><NewCustomerPage /></RoleGuard>} />
        <Route path="customers/:id" element={<CustomerDetailPage />} />
        <Route path="customers/:id/edit" element={<RoleGuard require="staff"><EditCustomerPage /></RoleGuard>} />

        <Route path="inventory" element={<InventoryPage />} />
        <Route path="inventory/new" element={<RoleGuard require="staff"><NewInventoryPage /></RoleGuard>} />
        <Route path="inventory/:id" element={<InventoryDetailPage />} />
        <Route path="inventory/:id/edit" element={<RoleGuard require="staff"><EditInventoryPage /></RoleGuard>} />

        {/* Asset tracking — Phase 1B */}
        <Route path="assets/bundles" element={<BundlesPage />} />
        <Route path="assets/bundles/new" element={<RoleGuard require="admin"><NewBundlePage /></RoleGuard>} />
        <Route path="assets/bundles/:id" element={<BundleDetailPage />} />
        <Route path="assets/scan" element={<RoleGuard require="staff"><ScannerPage /></RoleGuard>} />

        <Route path="invoices" element={<InvoicesPage />} />
        <Route path="invoices/:id" element={<InvoiceDetailPage />} />

        <Route path="payments" element={<PaymentsPage />} />
        <Route path="payments/new" element={<RoleGuard require="staff"><NewPaymentPage /></RoleGuard>} />

        <Route path="dispatch" element={<DispatchPage />} />
        <Route path="dispatch/new" element={<RoleGuard require="staff"><NewDispatchPage /></RoleGuard>} />

        <Route path="returns" element={<ReturnsPage />} />
        <Route path="returns/new" element={<RoleGuard require="staff"><NewReturnPage /></RoleGuard>} />

        <Route path="calendar"    element={<CalendarPage />} />
        <Route path="damages"     element={<DamagesPage />} />
        <Route path="damages/new" element={<RoleGuard require="staff"><NewDamagePage /></RoleGuard>} />
        <Route path="expenses"    element={<ExpensesPage />} />
        <Route path="expenses/new" element={<RoleGuard require="staff"><NewExpensePage /></RoleGuard>} />
        <Route path="reports"   element={<ReportsPage />} />
        <Route path="help"          element={<HelpPage />} />
        <Route path="settings"         element={<RoleGuard require="admin"><SettingsPage /></RoleGuard>} />
        <Route path="settings/team"    element={<RoleGuard require="admin"><TeamPage /></RoleGuard>} />
        <Route path="settings/company" element={<RoleGuard require="staff"><CompanySettingsPage /></RoleGuard>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
