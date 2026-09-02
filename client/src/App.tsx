import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { Layout } from '@/components/layout/Layout';
import { LoginPage } from '@/pages/LoginPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { FeedPage } from '@/pages/FeedPage';
import { HomePage } from '@/pages/HomePage';
import { OnboardingPage } from '@/pages/OnboardingPage';
import { BusinessMapPage } from '@/pages/BusinessMapPage';
import { ExplorePage } from '@/pages/ExplorePage';
import { CommunityPage } from '@/pages/CommunityPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { UserProfilePage } from '@/pages/UserProfilePage';
import { CreatePostPage } from '@/pages/CreatePostPage';
import { MessagesPage } from '@/pages/MessagesPage';
import { NotificationsPage } from '@/pages/NotificationsPage';
import { MyBusinessesPage } from '@/pages/MyBusinessesPage';
import { CreateBusinessPage } from '@/pages/CreateBusinessPage';
import { EditBusinessPage } from '@/pages/EditBusinessPage';
import { PromoteBusinessPage } from '@/pages/PromoteBusinessPage';
import { EditProfilePage } from '@/pages/EditProfilePage';
import { SettingsPage } from '@/pages/SettingsPage';
import { AdminPage } from '@/pages/AdminPage';
import { SetupPasswordPage } from '@/pages/SetupPasswordPage';
import { GroupsPage } from '@/pages/GroupsPage';
import { GroupDetailPage } from '@/pages/GroupDetailPage';
import { EventsPage } from '@/pages/EventsPage';
import { ClassifiedsPage } from '@/pages/ClassifiedsPage';
import { PricingPage } from '@/pages/PricingPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 10000 } },
});

function AuthLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-200 border-t-brand-700" />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <AuthLoading />;
  if (!user) return <Navigate to="/login" replace />;

  const onboardingDone = !!user.onboarding_completed;
  const onOnboarding = location.pathname === '/onboarding';

  if (!onboardingDone && !onOnboarding) {
    return <Navigate to="/onboarding" replace />;
  }
  if (onboardingDone && onOnboarding) {
    return <Navigate to="/home" replace />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <AuthLoading />;
  if (user) {
    return <Navigate to={user.onboarding_completed ? '/home' : '/onboarding'} replace />;
  }
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <AuthLoading />;
  if (!user?.is_admin) return <Navigate to="/home" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
            <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
            <Route path="/setup-password" element={<SetupPasswordPage />} />
            <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route index element={<Navigate to="/home" replace />} />
              <Route path="home" element={<HomePage />} />
              <Route path="onboarding" element={<OnboardingPage />} />
              <Route path="feed" element={<FeedPage />} />
              <Route path="business-map" element={<BusinessMapPage />} />
              <Route path="explore" element={<ExplorePage />} />
              <Route path="community" element={<CommunityPage />} />
              <Route path="groups" element={<GroupsPage />} />
              <Route path="groups/:id" element={<GroupDetailPage />} />
              <Route path="events" element={<EventsPage />} />
              <Route path="classifieds" element={<ClassifiedsPage />} />
              <Route path="pricing" element={<PricingPage />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="profile/edit" element={<EditProfilePage />} />
              <Route path="user/:id" element={<UserProfilePage />} />
              <Route path="create-post" element={<CreatePostPage />} />
              <Route path="messages" element={<MessagesPage />} />
              <Route path="notifications" element={<NotificationsPage />} />
              <Route path="my-businesses" element={<MyBusinessesPage />} />
              <Route path="create-business" element={<CreateBusinessPage />} />
              <Route path="edit-business/:id" element={<EditBusinessPage />} />
              <Route path="promote-business" element={<PromoteBusinessPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
            </Route>
            <Route path="*" element={<Navigate to="/home" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
