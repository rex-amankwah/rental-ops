import { ReactNode, ChangeEvent, HTMLAttributes } from 'react'

interface FormFieldProps {
  label: string
  required?: boolean
  error?: string
  hint?: string
  children: ReactNode
  className?: string
}

export function FormField({ label, required, error, hint, children, className = '' }: FormFieldProps) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label className="form-label">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

// Use index signature to accept any HTML input attribute
export interface SelectFieldProps {
  label: string
  required?: boolean
  error?: string
  hint?: string
  fieldClassName?: string
  value: string
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void
  children: ReactNode
  [key: string]: unknown
}

export function SelectField({ label, required, error, hint, fieldClassName, children, value, onChange, ...rest }: SelectFieldProps) {
  return (
    <FormField label={label} required={required} error={error} hint={hint} className={fieldClassName}>
      <select
        value={value}
        onChange={onChange}
        className={`form-select ${error ? 'border-red-400 focus:ring-red-400' : ''}`}
        {...(rest as HTMLAttributes<HTMLSelectElement>)}
      >
        {children}
      </select>
    </FormField>
  )
}

export interface InputFieldProps {
  label: string
  required?: boolean
  error?: string
  hint?: string
  fieldClassName?: string
  value: string
  onChange: (e: ChangeEvent<HTMLInputElement>) => void
  [key: string]: unknown
}

export function InputField({ label, required, error, hint, fieldClassName, value, onChange, ...rest }: InputFieldProps) {
  return (
    <FormField label={label} required={required} error={error} hint={hint} className={fieldClassName}>
      <input
        value={value}
        onChange={onChange}
        className={`form-input ${error ? 'border-red-400 focus:ring-red-400' : ''}`}
        {...(rest as HTMLAttributes<HTMLInputElement>)}
      />
    </FormField>
  )
}

export interface TextareaFieldProps {
  label: string
  required?: boolean
  error?: string
  hint?: string
  fieldClassName?: string
  value: string
  onChange: (e: ChangeEvent<HTMLTextAreaElement>) => void
  [key: string]: unknown
}

export function TextareaField({ label, required, error, hint, fieldClassName, value, onChange, ...rest }: TextareaFieldProps) {
  return (
    <FormField label={label} required={required} error={error} hint={hint} className={fieldClassName}>
      <textarea
        value={value}
        onChange={onChange}
        className={`form-input min-h-[80px] resize-y ${error ? 'border-red-400 focus:ring-red-400' : ''}`}
        {...(rest as HTMLAttributes<HTMLTextAreaElement>)}
      />
    </FormField>
  )
}
