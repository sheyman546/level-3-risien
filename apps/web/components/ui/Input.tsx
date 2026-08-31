"use client";

import { InputHTMLAttributes, SelectHTMLAttributes, forwardRef } from "react";
import { cx } from "@/lib/utils";

const fieldClasses =
  "w-full rounded-lg border border-ink-100 bg-white px-3 py-2 text-sm text-ink-800 " +
  "placeholder:text-ink-800/40 focus:border-brand-500 focus:outline-none focus:ring-2 " +
  "focus:ring-brand-500/30 disabled:cursor-not-allowed disabled:bg-ink-50";

interface FieldWrapProps {
  label?: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
}

function FieldWrap({ label, hint, error, htmlFor, children }: FieldWrapProps & { children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={htmlFor} className="block text-xs font-medium text-ink-800">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-ink-800/50">{hint}</p>
      ) : null}
    </div>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, className, id, ...props },
  ref,
) {
  const inputId = id ?? props.name;
  return (
    <FieldWrap label={label} hint={hint} error={error} htmlFor={inputId}>
      <input
        ref={ref}
        id={inputId}
        className={cx(fieldClasses, error && "border-red-400 focus:border-red-500 focus:ring-red-500/30", className)}
        aria-invalid={Boolean(error)}
        {...props}
      />
    </FieldWrap>
  );
});

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, className, id, children, ...props },
  ref,
) {
  const selectId = id ?? props.name;
  return (
    <FieldWrap label={label} hint={hint} error={error} htmlFor={selectId}>
      <select ref={ref} id={selectId} className={cx(fieldClasses, className)} {...props}>
        {children}
      </select>
    </FieldWrap>
  );
});
