import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import ImageLightboxProvider from '@/components/ImageLightboxProvider';
import ProtectedRoute from '@/components/ProtectedRoute';
import Layout from '@/components/Layout';
// Add page imports here
import Home from '@/pages/Home';
import Profile from '@/pages/Profile';
import Events from '@/pages/Events';
import Settings from '@/pages/Settings';
import Pricing from '@/pages/Pricing';
import Shop from '@/pages/Shop';
import Garage from '@/pages/Garage';
import GarageCarDetail from '@/pages/GarageCarDetail';
import UserGarage from '@/pages/UserGarage';
import VehicleDetail from '@/pages/VehicleDetail';
import VerificationQueue from '@/pages/VerificationQueue';
import EventDetail from '@/pages/EventDetail';
import Groups from '@/pages/Groups';
import GroupDetail from '@/pages/GroupDetail';
import CreateGroup from '@/pages/CreateGroup';
import CreateEvent from '@/pages/CreateEvent';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import VerifyEmail from '@/pages/VerifyEmail';
import Feed from '@/pages/Feed';
import PostDetail from '@/pages/PostDetail';
import Connections from '@/pages/Connections';
import ModerationQueue from '@/pages/ModerationQueue';
import CaseDetail from '@/pages/CaseDetail';
import AuditLogBrowser from '@/pages/AuditLogBrowser';
import Marketplace from '@/pages/Marketplace';
import MarketplaceListingDetail from '@/pages/MarketplaceListingDetail';
import CreateMarketplaceListing from '@/pages/CreateMarketplaceListing';
import Conversations from '@/pages/Conversations';
import ConversationThread from '@/pages/ConversationThread';

import Notifications from '@/pages/Notifications';
import UserProfile from '@/pages/UserProfile';
import AICommandCenter from '@/pages/AICommandCenter';
import TestingCenter from '@/pages/TestingCenter';
import EntitlementOverrides from '@/pages/EntitlementOverrides';
import JobStatusDashboard from '@/pages/JobStatusDashboard';
import AdminDashboard from '@/pages/AdminDashboard';
import BusinessVerificationQueue from '@/pages/BusinessVerificationQueue';
import Businesses from '@/pages/Businesses';
import BusinessStorefront from '@/pages/BusinessStorefront';
import StoreImport from '@/pages/StoreImport';
import ProfileLoadError from '@/pages/ProfileLoadError';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin, checkAppState } = useAuth();


  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-secondary border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError && authError.type !== 'auth_required') {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    }
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background p-4">
        <div className="mx-auto max-w-md rounded-2xl border border-destructive/40 bg-destructive/10 p-6 text-center">
          <h2 className="text-base font-bold text-destructive">Unable to load Honda Hub</h2>
          <p className="mt-1 text-sm text-muted-foreground">{authError.message || "Your session could not be loaded."}</p>
          <div className="mt-4 flex justify-center gap-2">
            <button onClick={() => checkAppState()} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Retry</button>
            <button onClick={navigateToLogin} className="rounded-xl border border-border px-4 py-2 text-sm font-medium">Sign in</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/signin" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/profile/load-error" element={<ProfileLoadError />} />
      <Route element={<Layout />}>
        {/* Public-browsable routes — no authentication required */}
        <Route path="/" element={<Home />} />
        <Route path="/market" element={<Navigate to="/marketplace" replace />} />
        <Route path="/listing/:id" element={<Navigate to="/marketplace" replace />} />
        <Route path="/create" element={<Navigate to="/marketplace/create" replace />} />
        <Route path="/events" element={<Events />} />
        <Route path="/event/:id" element={<EventDetail />} />
        <Route path="/messages" element={<Navigate to="/conversations" replace />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/community" element={<Navigate to="/feed" replace />} />
        <Route path="/shop" element={<Shop />} />
        <Route path="/giveaway" element={<Navigate to="/shop" replace />} />
        <Route path="/vehicle/:id" element={<VehicleDetail />} />
        <Route path="/user/:name/garage" element={<UserGarage />} />
        <Route path="/groups" element={<Groups />} />
        <Route path="/group/:id" element={<GroupDetail />} />
        <Route path="/feed" element={<Feed />} />
        <Route path="/post/:id" element={<PostDetail />} />
        <Route path="/marketplace" element={<Marketplace />} />
        <Route path="/businesses" element={<Businesses />} />
        <Route path="/business/:id" element={<BusinessStorefront />} />
        <Route path="/marketplace/:id" element={<MarketplaceListingDetail />} />
        <Route path="/user/:name" element={<UserProfile />} />

        {/* Protected routes — authentication required */}
        <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/signin" replace />} />}>
          <Route path="/profile" element={<Profile />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/garage" element={<Garage />} />
          <Route path="/garage/:id" element={<GarageCarDetail />} />
          <Route path="/vehicle/create" element={<Garage />} />
          <Route path="/verification-queue" element={<VerificationQueue />} />
          <Route path="/group/create" element={<CreateGroup />} />
          <Route path="/event/create" element={<CreateEvent />} />
          <Route path="/event/:id/edit" element={<CreateEvent />} />
          <Route path="/connections" element={<Connections />} />
          <Route path="/connections/:name" element={<Connections />} />
          <Route path="/moderation" element={<ModerationQueue />} />
          <Route path="/moderation/case/:id" element={<CaseDetail />} />
          <Route path="/admin/audit" element={<AuditLogBrowser />} />
          <Route path="/marketplace/create" element={<CreateMarketplaceListing />} />
          <Route path="/marketplace/:id/edit" element={<CreateMarketplaceListing />} />
          <Route path="/conversations" element={<Conversations />} />
          <Route path="/conversation/:id" element={<ConversationThread />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/ai-command-center" element={<AICommandCenter />} />
          <Route path="/testing" element={<TestingCenter />} />
          <Route path="/admin/entitlements" element={<EntitlementOverrides />} />
          <Route path="/admin/jobs" element={<JobStatusDashboard />} />
          <Route path="/admin/business-verification" element={<BusinessVerificationQueue />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/store-import" element={<StoreImport />} />
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <ImageLightboxProvider>
            <AuthenticatedApp />
          </ImageLightboxProvider>
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App