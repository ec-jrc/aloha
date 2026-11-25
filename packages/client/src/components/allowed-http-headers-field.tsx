/*
Copyright (C) 2025 European Union
 
Licensed under the EUPL, Version 1.2 or – as soon they will be approved by the
European Commission – subsequent versions of the EUPL (the “Licence”);
You may not use this work except in compliance with the Licence.
You may obtain a copy of the Licence at:
* https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12 *

Unless required by applicable law or agreed to in writing, software distributed under
the Licence is distributed on an “AS IS” basis, WITHOUT WARRANTIES OR CONDITIONS
OF ANY KIND, either express or implied. See the Licence for the specific language
governing permissions and limitations under the Licence.
*/

import { Button } from "@/components/ui/button";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Link, Plus, Trash2, Unlink } from "lucide-react";
import { useEffect } from "react";
import {
  Control,
  FieldValues,
  Path,
  useController,
  useFieldArray,
} from "react-hook-form";

type AllowedHttpHeadersFieldProps<T extends FieldValues> = {
  control: Control<T>;
  name: Path<T>;
  overridesWhitelist: string[];
  description?: string;
};

export default function AllowedHttpHeadersField<T extends FieldValues>({
  control,
  name,
  overridesWhitelist,
  description = "Custom HTTP headers sent with every request over the Streamable HTTP transport.",
}: AllowedHttpHeadersFieldProps<T>) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: name as never,
  });

  return (
    <FormItem>
      <FormLabel>Allowed HTTP Headers</FormLabel>
      <FormDescription>{description}</FormDescription>
      <div className="space-y-2 mt-2">
        {fields.map((headerField, index) => (
          <HeaderRowFields
            key={headerField.id}
            control={control}
            name={name}
            index={index}
            overridesWhitelist={overridesWhitelist}
            onRemove={() => remove(index)}
          />
        ))}
        <Button
          type="button"
          variant="secondary"
          onClick={() =>
            append({ key: "", value: "", override: false } as never)
          }
        >
          <Plus /> Add Header
        </Button>
      </div>
    </FormItem>
  );
}

function HeaderRowFields<T extends FieldValues>({
  control,
  name,
  index,
  overridesWhitelist,
  onRemove,
}: {
  control: Control<T>;
  name: Path<T>;
  index: number;
  overridesWhitelist: string[];
  onRemove: () => void;
}) {
  const keyName = `${name}.${index}.key` as Path<T>;
  const overrideName = `${name}.${index}.override` as Path<T>;

  const { field: keyField } = useController({ control, name: keyName });
  const { field: overrideField } = useController({
    control,
    name: overrideName,
  });

  const normalizedKey = String(keyField.value ?? "")
    .trim()
    .toLowerCase();
  const canOverride = overridesWhitelist.includes(normalizedKey);
  const isOverride = Boolean(overrideField.value);

  const overrideOnChange = overrideField.onChange;
  useEffect(() => {
    if (!canOverride && isOverride) {
      overrideOnChange(false);
    }
  }, [canOverride, isOverride, overrideOnChange]);

  return (
    <div className="flex flex-row items-center gap-2">
      <FormField
        control={control}
        name={keyName}
        render={({ field }) => (
          <FormItem className="flex-1 space-y-0">
            <FormControl>
              <Input placeholder="Header name" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name={`${name}.${index}.value` as Path<T>}
        render={({ field }) => (
          <FormItem className="flex-1 space-y-0">
            <FormControl>
              <Input placeholder="Header value" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="shrink-0">
            <Button
              type="button"
              variant={isOverride ? "default" : "outline"}
              size="icon"
              disabled={!canOverride}
              aria-pressed={isOverride}
              aria-label="Toggle override from incoming request"
              onClick={() => overrideField.onChange(!isOverride)}
            >
              {isOverride ? <Link /> : <Unlink />}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {canOverride
            ? isOverride
              ? "Override enabled: the incoming request value is used when present."
              : "Override disabled: always use the configured value."
            : "Header not whitelisted, override not possibile"}
        </TooltipContent>
      </Tooltip>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="shrink-0"
        onClick={onRemove}
        aria-label="Remove header"
      >
        <Trash2 />
      </Button>
    </div>
  );
}
