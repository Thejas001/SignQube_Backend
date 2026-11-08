/** The router. One app, four role areas; the signed-in role decides access. */

import { Navigate, Route, Routes } from 'react-router-dom';

import Layout from './components/Layout';
import { RequireRole, useAuth } from './lib/auth';

import Login from './pages/Login';
import Register from './pages/Register';

import Home from './pages/customer/Home';
import ProductDetail from './pages/customer/ProductDetail';
import Checkout from './pages/customer/Checkout';
import MyOrders from './pages/customer/MyOrders';
import CustomerOrderDetail from './pages/customer/OrderDetail';

import AdminDashboard from './pages/admin/Dashboard';
import AdminOrders from './pages/admin/Orders';
import AdminOrderDetail from './pages/admin/OrderDetail';
import AdminUsers from './pages/admin/Users';
import AdminProducts from './pages/admin/Products';

import DesignerJobs from './pages/designer/Jobs';
import DesignerJobDetail from './pages/designer/JobDetail';

import PrinterJobs from './pages/printer/Jobs';
import PrinterJobDetail from './pages/printer/JobDetail';

import { ROLE_HOME } from './lib/format';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        {/* public */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* storefront — browsing needs no account */}
        <Route index element={<StorefrontOrPanel />} />
        <Route path="/products/:id" element={<ProductDetail />} />

        {/* customer */}
        <Route
          path="/checkout"
          element={
            <RequireRole roles={['CUSTOMER']}>
              <Checkout />
            </RequireRole>
          }
        />
        <Route
          path="/orders"
          element={
            <RequireRole roles={['CUSTOMER']}>
              <MyOrders />
            </RequireRole>
          }
        />
        <Route
          path="/orders/:id"
          element={
            <RequireRole roles={['CUSTOMER']}>
              <CustomerOrderDetail />
            </RequireRole>
          }
        />

        {/* admin */}
        <Route
          path="/admin"
          element={
            <RequireRole roles={['ADMIN']}>
              <AdminDashboard />
            </RequireRole>
          }
        />
        <Route
          path="/admin/orders"
          element={
            <RequireRole roles={['ADMIN']}>
              <AdminOrders />
            </RequireRole>
          }
        />
        <Route
          path="/admin/orders/:id"
          element={
            <RequireRole roles={['ADMIN']}>
              <AdminOrderDetail />
            </RequireRole>
          }
        />
        <Route
          path="/admin/users"
          element={
            <RequireRole roles={['ADMIN']}>
              <AdminUsers />
            </RequireRole>
          }
        />
        <Route
          path="/admin/products"
          element={
            <RequireRole roles={['ADMIN']}>
              <AdminProducts />
            </RequireRole>
          }
        />

        {/* designer */}
        <Route
          path="/designer"
          element={
            <RequireRole roles={['DESIGNER']}>
              <DesignerJobs />
            </RequireRole>
          }
        />
        <Route
          path="/designer/jobs/:orderId"
          element={
            <RequireRole roles={['DESIGNER']}>
              <DesignerJobDetail />
            </RequireRole>
          }
        />

        {/* printing */}
        <Route
          path="/printer"
          element={
            <RequireRole roles={['PRINTER']}>
              <PrinterJobs />
            </RequireRole>
          }
        />
        <Route
          path="/printer/jobs/:orderId"
          element={
            <RequireRole roles={['PRINTER']}>
              <PrinterJobDetail />
            </RequireRole>
          }
        />

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

/**
 * "/" is the storefront for customers and visitors, but staff land in their own
 * panel rather than on the shop.
 */
function StorefrontOrPanel() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user && user.role !== 'CUSTOMER') {
    return <Navigate to={ROLE_HOME[user.role]} replace />;
  }
  return <Home />;
}

function NotFound() {
  return (
    <div className="card-pad mx-auto max-w-md text-center">
      <p className="text-3xl font-bold">404</p>
      <p className="mt-1 text-sm text-ink-faint">That page does not exist.</p>
    </div>
  );
}
