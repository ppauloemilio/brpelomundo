import { cn } from '@/lib/utils';

type Props = {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  src?: string;
};

const sizes = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-11 w-11',
  xl: 'h-16 w-16',
};

export function AppLogo({ className, size = 'md', src = '/logo.png' }: Props) {
  return (
    <img
      src={src}
      alt="Br Pelo Mundo"
      className={cn('object-contain', sizes[size], className)}
    />
  );
}
