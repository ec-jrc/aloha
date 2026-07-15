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

import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

export default function PageTitle({
  children,
  className,
  isConnected,
  isDisabled,
  lastOnlineAt,
  lastOfflineAt,
  ...others
}: React.ComponentProps<"h1"> & {
  isConnected?: boolean;
  isDisabled?: boolean;
  lastOnlineAt?: Date | string;
  lastOfflineAt?: Date | string;
}) {
  const uptimeLabel = (() => {
    if (isDisabled) return undefined;
    if (isConnected && lastOnlineAt)
      return `since ${formatDistanceToNow(new Date(lastOnlineAt))}`;
    if (!isConnected && lastOfflineAt)
      return `since ${formatDistanceToNow(new Date(lastOfflineAt))}`;
    return undefined;
  })();
  if (isConnected !== undefined || isDisabled !== undefined) {
    return (
      <h1 className={cn("text-xl mb-4 font-bold", className)} {...others}>
        <div>{children}</div>
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${
            isDisabled
              ? "bg-gray-50 border-gray-200"
              : isConnected
                ? "bg-emerald-50 border-emerald-200"
                : "bg-red-50 border-red-200"
          }`}
        >
          <div
            className={`w-2.5 h-2.5 rounded-full animate-pulse shadow-sm ${
              isDisabled
                ? "bg-gray-500 shadow-gray-200"
                : isConnected
                  ? "bg-emerald-500 shadow-emerald-200"
                  : "bg-red-500 shadow-red-200"
            }`}
          ></div>
          <span
            data-testid="online-witness"
            className={`text-sm font-medium ${
              isDisabled
                ? "text-gray-700"
                : isConnected
                  ? "text-emerald-700"
                  : "text-red-700"
            }`}
          >
            {isDisabled ? "disabled" : isConnected ? "online" : "offline"}
            {uptimeLabel && (
              <span className="text-xs font-normal opacity-75 ml-1">
                {uptimeLabel}
              </span>
            )}
          </span>
        </div>
      </h1>
    );
  }
  return (
    <h1 className={cn("text-xl mb-4 font-bold", className)} {...others}>
      {children}
    </h1>
  );
}
