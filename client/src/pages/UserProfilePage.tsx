import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { ProfileView } from '@/components/profile/ProfileView';

export function UserProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user: me } = useAuth();

  useEffect(() => {
    if (id && me?.id === id) navigate('/profile', { replace: true });
  }, [id, me?.id, navigate]);

  if (!id) return null;
  if (me?.id === id) return null;

  return <ProfileView userId={id} showFollow defaultTab="posts" />;
}