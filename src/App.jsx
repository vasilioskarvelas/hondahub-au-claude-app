import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import Layout from '@/components/Layout';
// Add page imports here
import Home from '@/pages/Home';
import Market from '@/pages/Market';
import ListingDetail from '@/pages/ListingDetail';
import CreateListing from '@/pages/CreateListing';
import Profile from '@/pages/Profile';
import Events from '@/pages/Events';
import Messages from '@/pages/Messages';
import Settings from '@/pages/Settings';
import Pricing from '@/pages/Pricing';
import Community from '@/pages/Community';
import Shop from '@/pages/PartnerDiscounts';
import Giveaway from '@/pages/Giveaway';
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

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-secondary border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/market" element={<Market />} />
        <Route path="/listing/:id" element={<ListingDetail />} />
        <Route path="/create" element={<CreateListing />} />
        <Route path="/events" element={<Events />} />
        <Route path="/event/:id" element={<EventDetail />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/community" element={<Community />} />
        <Route path="/shop" element={<Shop />} />
        <Route path="/giveaway" element={<Giveaway />} />
        <Route path="/garage" element={<Garage />} />
        <Route path="/garage/:id" element={<GarageCarDetail />} />
        <Route path="/vehicle/create" element={<Garage />} />
        <Route path="/vehicle/:id" element={<VehicleDetail />} />
        <Route path="/verification-queue" element={<VerificationQueue />} />
        <Route path="/user/:name/garage" element={<UserGarage />} />
        <Route path="/groups" element={<Groups />} />
        <Route path="/group/create" element={<CreateGroup />} />
        <Route path="/group/:id" element={<GroupDetail />} />
        <Route path="/event/create" element={<CreateEvent />} />
        <Route path="/feed" element={<Feed />} />
        <Route path="/post/:id" element={<PostDetail />} />
        <Route path="/connections" element={<Connections />} />
        <Route path="/connections/:name" element={<Connections />} />
        <Route path="/moderation" element={<ModerationQueue />} />
        <Route path="/moderation/case/:id" element={<CaseDetail />} />
        <Route path="/admin/audit" element={<AuditLogBrowser />} />
        <Route path="/marketplace" element={<Marketplace />} />
        <Route path="/marketplace/create" element={<CreateMarketplaceListing />} />
        <Route path="/marketplace/:id" element={<MarketplaceListingDetail />} />
        <Route path="/marketplace/:id/edit" element={<CreateMarketplaceListing />} />
        <Route path="/conversations" element={<Conversations />} />
        <Route path="/conversation/:id" element={<ConversationThread />} />

        <Route path="/notifications" element={<Notifications />} />
        <Route path="/user/:name" element={<UserProfile />} />
        <Route path="/ai-command-center" element={<AICommandCenter />} />
        <Route path="/testing" element={<TestingCenter />} />
        <Route path="/admin/entitlements" element={<EntitlementOverrides />} />
        <Route path="/admin/jobs" element={<JobStatusDashboard />} />
        <Route path="/admin/business-verification" element={<BusinessVerificationQueue />} />
        <Route path="/admin" element={<AdminDashboard />} />
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
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App