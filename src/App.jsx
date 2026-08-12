import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { OrderProvider } from './context/OrderContext';
import { AuthProvider } from './context/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import ModuleErrorBoundary from './components/ModuleErrorBoundary';

import SaaSLandingPage from './pages/SaaSLandingPage';
import CustomerPublicLanding from './pages/CustomerPublicLanding';
import TermsPage from './pages/TermsPage';
import Home from './pages/Home';
import CounterPage from './pages/CounterPage';
import CustomerOrderPage from './pages/CustomerOrderPage';
import KitchenPage from './pages/KitchenPage';
import MenuEditorPage from './pages/MenuEditorPage';
import AdminHealthCheckPage from './pages/AdminHealthCheckPage';
import StaffPinGuard from './components/StaffPinGuard';
import GlobalEmergencyOverlay from './components/GlobalEmergencyOverlay';

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <OrderProvider>
          <BrowserRouter>
          {/* GLOBAL EMERGENCY MAINTENANCE MODE LOCK OVERLAY (z-index: 999999) */}
          <GlobalEmergencyOverlay />
          <Routes>

            {/* ============================================================
                1. SAAS HOME LANDING PAGE (Root URL)
                Laman Utama SaaS dengan Welcome, Visi, Ciri-ciri, FAQ & Login.
            ============================================================= */}
            <Route path="/" element={<SaaSLandingPage />} />
            <Route path="/customer-landing" element={<CustomerPublicLanding />} />
            <Route path="/terms" element={<TermsPage />} />

            {/* ============================================================
                2. CUSTOMER ORDER ROUTES (Unprotected — QR Code destinations)
                Accessible via QR Code link: /o?t=X&s=YZ or /order?table=X...
            ============================================================= */}
            <Route
              path="/order"
              element={
                <ModuleErrorBoundary moduleName="Menu Pelanggan">
                  <CustomerOrderPage />
                </ModuleErrorBoundary>
              }
            />
            <Route
              path="/o"
              element={
                <ModuleErrorBoundary moduleName="Menu Pelanggan">
                  <CustomerOrderPage />
                </ModuleErrorBoundary>
              }
            />

            {/* ============================================================
                3. PROTECTED STAFF ROUTES (Require 4-Digit PIN via StaffPinGuard)
                Staf mesti taip /staff, /counter, atau /kitchen secara manual.
            ============================================================= */}

            {/* Staff Portal / Dashboard (Moved from "/" to "/staff") */}
            <Route
              path="/staff"
              element={
                <StaffPinGuard roleTitle="Portal Staf">
                  <ModuleErrorBoundary moduleName="Laporan Staff">
                    <Home />
                  </ModuleErrorBoundary>
                </StaffPinGuard>
              }
            />

            {/* POS Counter Panel */}
            <Route
              path="/counter"
              element={
                <StaffPinGuard roleTitle="POS Kaunter">
                  <ModuleErrorBoundary moduleName="POS Panel">
                    <CounterPage />
                  </ModuleErrorBoundary>
                </StaffPinGuard>
              }
            />

            {/* Kitchen Display System (KDS) */}
            <Route
              path="/kitchen"
              element={
                <StaffPinGuard roleTitle="KDS Dapur">
                  <ModuleErrorBoundary moduleName="KDS Dapur">
                    <KitchenPage />
                  </ModuleErrorBoundary>
                </StaffPinGuard>
              }
            />

            {/* Menu Editor Panel */}
            <Route
              path="/menu-editor"
              element={
                <StaffPinGuard roleTitle="Editor Menu">
                  <ModuleErrorBoundary moduleName="Editor Menu">
                    <MenuEditorPage />
                  </ModuleErrorBoundary>
                </StaffPinGuard>
              }
            />

            {/* Health Check Dashboard */}
            <Route
              path="/admin/health"
              element={
                <StaffPinGuard roleTitle="Health Check">
                  <ModuleErrorBoundary moduleName="Health Check">
                    <AdminHealthCheckPage />
                  </ModuleErrorBoundary>
                </StaffPinGuard>
              }
            />

            {/* ============================================================
                4. CATCH-ALL FALLBACK
                Mana-mana URL tidak sah diredirect ke Public Landing Page.
            ============================================================= */}
            <Route path="*" element={<Navigate to="/" replace />} />

          </Routes>
        </BrowserRouter>
      </OrderProvider>
    </AuthProvider>
  </ErrorBoundary>
);
}
