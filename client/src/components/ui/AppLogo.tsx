import { cn } from '@/lib/utils';

type Props = {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
};

const sizes = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-11 w-11',
  xl: 'h-16 w-16',
};

export function AppLogo({ className, size = 'md' }: Props) {
  return (
    <img
      src="/logo.png"
      alt=""
      className={cn('object-contain', sizes[size], className)}
    />
  );
}
