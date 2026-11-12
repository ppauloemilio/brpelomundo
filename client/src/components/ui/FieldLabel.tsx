import { LabelHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Asterisco vermelho para campos obrigatórios */
export function RequiredMark({ className }: { className?: string }) {
  return (
    <span className={cn('ml-0.5 font-semibold text-red-600', className)} aria-hidden="true">
      *
    </span>
  );
}

type FieldLabelProps = LabelHTMLAttributes<HTMLLabelElement> & {
  children: ReactNode;
  /** Exibe * vermelho ao lado do texto */
  required?: boolean;
};

export function FieldLabel({ children, required, className, ...props }: FieldLabelProps) {
  return (
    <label className={cn('text-sm font-medium text-slate-700', className)} {...props}>
      {children}
      {required ? <RequiredMark /> : null}
    </label>
  );
}
