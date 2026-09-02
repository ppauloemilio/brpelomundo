import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { ProfileView } from '@/components/profile/ProfileView';

export function ProfilePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  if (!user) return null;

  return (
    <ProfileView
      userId={user.id}
      isOwner
      onEdit={() => navigate('/profile/edit')}
    />
  );
}
