import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { CustomerList } from './pages/customers/CustomerList'
import { CustomerNew } from './pages/customers/CustomerNew'
import { CustomerDetail } from './pages/customers/CustomerDetail'
import { CustomerEdit } from './pages/customers/CustomerEdit'
import { CustomerReports } from './pages/customers/CustomerReports'
import { ServiceNew } from './pages/services/ServiceNew'
import { ServiceDetail } from './pages/services/ServiceDetail'
import { ServiceEdit } from './pages/services/ServiceEdit'
import { ServiceReports } from './pages/services/ServiceReports'
import { ReportNew } from './pages/reports/ReportNew'
import { ReportEdit } from './pages/reports/ReportEdit'
import { ReportView } from './pages/reports/ReportView'
import { SearchReports } from './pages/reports/SearchReports'
import { InviteEngineer } from './pages/admin/InviteEngineer'
import { SparePartsList } from './pages/admin/SparePartsList'
import { AdminSettings } from './pages/admin/AdminSettings'
import { Profile } from './pages/Profile'
import { More } from './pages/More'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />

        <Route path="/customers" element={<ProtectedRoute adminOnly><CustomerList /></ProtectedRoute>} />
        <Route path="/customers/new" element={<ProtectedRoute><CustomerNew /></ProtectedRoute>} />
        <Route path="/customers/:id" element={<ProtectedRoute adminOnly><CustomerDetail /></ProtectedRoute>} />
        <Route path="/customers/:id/edit" element={<ProtectedRoute adminOnly><CustomerEdit /></ProtectedRoute>} />
        <Route path="/customers/:id/services/new" element={<ProtectedRoute adminOnly><ServiceNew /></ProtectedRoute>} />
        <Route path="/customers/:id/reports" element={<ProtectedRoute adminOnly><CustomerReports /></ProtectedRoute>} />

        <Route path="/services/:id" element={<ProtectedRoute><ServiceDetail /></ProtectedRoute>} />
        <Route path="/services/:id/edit" element={<ProtectedRoute><ServiceEdit /></ProtectedRoute>} />
        <Route path="/services/:id/reports" element={<ProtectedRoute><ServiceReports /></ProtectedRoute>} />
        <Route path="/services/:id/reports/new" element={<ProtectedRoute><ReportNew /></ProtectedRoute>} />

        <Route path="/reports/new/:customerId" element={<ProtectedRoute><ReportNew /></ProtectedRoute>} />
        <Route path="/reports/:id" element={<ProtectedRoute><ReportView /></ProtectedRoute>} />
        <Route path="/reports/:id/edit" element={<ProtectedRoute><ReportEdit /></ProtectedRoute>} />
        <Route path="/search" element={<ProtectedRoute><SearchReports /></ProtectedRoute>} />

        <Route path="/admin/invite" element={<ProtectedRoute adminOnly><InviteEngineer /></ProtectedRoute>} />
        <Route path="/admin/spare-parts" element={<ProtectedRoute><SparePartsList /></ProtectedRoute>} />
        <Route path="/admin/settings" element={<ProtectedRoute><AdminSettings /></ProtectedRoute>} />

        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="/more" element={<ProtectedRoute><More /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  )
}
