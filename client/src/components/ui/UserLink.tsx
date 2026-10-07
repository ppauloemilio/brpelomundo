import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

type Props = {
  userId?: string | null;
  className?: string;
  children: React.ReactNode;
};

/** Nome/avatar que abre o perfil da pessoa. */
export function UserLink({ userId, className, children }: Props) {
  if (!userId) return <>{children}</>;
  return (
    <Link
      to={`/user/${userId}`}
      className={cn('hover:underline', className)}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </Link>
  );
}
