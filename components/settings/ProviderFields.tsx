"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DeskProviderDefinition } from "@/lib/integrations/providers";

type DeskCredentialValues = {
  baseUrl: string;
  apiToken: string;
};

type ProviderFieldsProps = {
  provider: DeskProviderDefinition;
  values: DeskCredentialValues;
  onChange: (field: keyof DeskCredentialValues, value: string) => void;
  disabled?: boolean;
};

export function ProviderFields({ provider, values, onChange, disabled = false }: ProviderFieldsProps) {
  return (
    <div className="space-y-4">
      {provider.fields.map((field) => (
        <div key={field.key} className="space-y-2">
          <Label htmlFor={`provider-field-${field.key}`}>{field.label}</Label>
          <Input
            id={`provider-field-${field.key}`}
            type={field.type}
            value={values[field.key]}
            onChange={(event) => onChange(field.key, event.target.value)}
            placeholder={field.placeholder}
            autoComplete="off"
            disabled={disabled}
            className={field.secret ? "font-mono" : undefined}
          />
        </div>
      ))}
    </div>
  );
}
