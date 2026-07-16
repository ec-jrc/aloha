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

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";

interface ScrollableUrlProps {
  url: undefined | string;
  className?: string;
}

export function ScrollableUrl({ url, className = "" }: ScrollableUrlProps) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async () => {
    try {
      if (!url) return;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Item copied to clipboard");

      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error(err);
      toast.error("Failed to copy item");
    }
  };

  return (
    <div className={`relative ${className}`}>
      <div className="flex h-10 w-full rounded-md border border-input bg-background">
        <div className="flex-1 overflow-hidden">
          <div className="h-full overflow-x-hidden overflow-y-hidden px-3 py-2">
            <code title={url} className="text-sm whitespace-nowrap text-muted-foreground leading-6">
              {url}
            </code>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={copyToClipboard}
          className="h-10 w-10 shrink-0 rounded-l-none"
        >
          {copied ? (
            <Check className="h-4 w-4" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
