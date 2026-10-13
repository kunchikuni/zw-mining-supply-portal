'use client';

import Link from 'next/link';
import { ButtonHTMLAttributes, ReactNode, forwardRef } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-gradient-to-b from-copper-400 to-copper-600 text-white shadow-gold hover:from-copper-500 hover:to-copper-700 disabled:from-copper-200 disabled:to-copper-300 disabled:shadow-none',
  secondary:
    'border border-gray-200 bg-white text-ink shadow-soft hover:border-gray-300 hover:shadow-lift disabled:text-gray-400 disabled:shadow-none',
  ghost: 'text-gray-600 hover:bg-gray-100 hover:text-ink disabled:text-gray-400',
  danger:
    'border border-red-200 bg-white text-red-700 shadow-sm hover:border-red-300 hover:bg-red-50 disabled:text-red-300',
};

const sizeClasses: Record<Size, string> = {
  sm: 'px-3.5 py-2 text-[13px]',
  md: 'px-5 py-2.5 text-sm',
};

export function buttonClasses({
  variant = 'primary',
  size = 'md',
  className = '',
}: { variant?: Variant; size?: Size; className?: string } = {}) {
  return `inline-flex items-center justify-center gap-2 rounded-md font-semibold tracking-[0.01em] transition duration-200 disabled:cursor-not-allowed ${variantClasses[variant]} ${sizeClasses[size]} ${className}`;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, disabled, children, className = '', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, className })}
      {...rest}
    >
      {loading && (
        <span
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      )}
      {children}
    </button>
  );
});

// A link that looks like a button. Use this instead of wrapping <Button> in
// <Link>: a button inside an anchor is invalid HTML and reads as two
// controls to screen readers.
export function ButtonLink({
  href,
  variant,
  size,
  className,
  children,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={buttonClasses({ variant, size, className })}>
      {children}
    </Link>
  );
}
