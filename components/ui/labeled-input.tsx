import * as React from "react";
import { Input } from "./input";
import { Label } from "./label";

type LabeledInputProps = {
  label: string;
  id: string;
  placeholder?: string;
  value?: string | number | readonly string[];
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  className?: string;
  required?: boolean;
} & Omit<React.ComponentProps<"input">, 'id' | 'value' | 'onChange'>;

export function LabeledInput({ 
  label, 
  id, 
  placeholder, 
  value, 
  onChange, 
  type = "text",
  className = "",
  required = false,
  ...props 
}: LabeledInputProps) {
  return (
    <div className="grid w-full items-center gap-1.5">
      <Label htmlFor={id}>{label}{required && <span className="text-red-500">*</span>}</Label>
      <Input 
        id={id} 
        placeholder={placeholder} 
        value={value}
        onChange={onChange}
        type={type}
        className={className}
        required={required}
        {...props} 
      />
    </div>
  );
}
