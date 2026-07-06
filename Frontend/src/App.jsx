import { BrowserRouter, Routes, Route } from 'react-router-dom';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Forecasts from './pages/Forecasts';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
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
          <Route path="forecasts" element={<Forecasts />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<Settings />} />
          <Route path="users" element={<Users />} />
          <Route path="sales" element={<Sales />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}