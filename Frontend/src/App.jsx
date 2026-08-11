import { BrowserRouter, Routes, Route } from 'react-router-dom';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ActivityLog from './pages/ActivityLog';
import Forecasts from './pages/Forecasts';
import Reports from './pages/Reports';
import Users from './pages/Users';
import Sales from './pages/Sales';
import Layout from './components/Layout';
import ProtectedRoute from './routes/ProtectedRoutes';

export default function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="sales" element={<Sales />} />
          <Route
            path="activity"
            element={
              <ProtectedRoute allowedRoles={['Admin']}>
                <ActivityLog />
              </ProtectedRoute>
            }
          />
          <Route
            path="forecasts"
            element={
              <ProtectedRoute allowedRoles={['Admin']}>
                <Forecasts />
              </ProtectedRoute>
            }
          />
          <Route
            path="reports"
            element={
              <ProtectedRoute allowedRoles={['Admin']}>
                <Reports />
              </ProtectedRoute>
            }
          />
          <Route
            path="users"
            element={
              <ProtectedRoute allowedRoles={['Admin']}>
                <Users />
              </ProtectedRoute>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}