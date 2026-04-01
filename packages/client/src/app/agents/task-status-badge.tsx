/*
Copyright (C) 2025 European Union
 
Licensed under the EUPL, Version 1.2 or – as soon they will be approved by the
European Commission – subsequent versions of the EUPL (the "Licence");
You may not use this work except in compliance with the Licence.
You may obtain a copy of the Licence at:
* https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12 *

Unless required by applicable law or agreed to in writing, software distributed under
the Licence is distributed on an "AS IS" basis, WITHOUT WARRANTIES OR CONDITIONS
OF ANY KIND, either express or implied. See the Licence for the specific language
governing permissions and limitations under the Licence.
*/
import { Badge } from "@/components/ui/badge";
import { getTaskStatusDisplay } from "@/utils/a2a-content-extractor";
import { A2ATaskStatusDisplayEvent } from "@/utils/a2a-event-transformer";
import { Loader2 } from "lucide-react";

export default function TaskStatusBadge({
  event,
}: {
  event: A2ATaskStatusDisplayEvent;
}) {
  const { label, variant } = getTaskStatusDisplay(event.status);
  return (
    <Badge variant={variant}>
      {label}

      {event.streaming && (
        <Loader2 className="inline-block ml-2 h-4 w-4 animate-spin" />
      )}
    </Badge>
  );
}
