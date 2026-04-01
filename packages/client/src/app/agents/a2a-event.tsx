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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import JsonView from "@/mcp-inspector/JsonView";
import { A2ADisplayEvent } from "@/utils/a2a-event-transformer";
import { Check, Code, Copy } from "lucide-react";
import { useState } from "react";
import ArtifactDisplay from "./artifact-display";
import TaskStatusBadge from "./task-status-badge";

export function A2AEvent({ event }: { event: A2ADisplayEvent }) {
  const [copied, setCopied] = useState(false);

  const rawEvents = event.rawEvents;

  const getTextContent = (): string => {
    switch (event.type) {
      case "user_message":
      case "agent_message":
        return event.content;
      case "task_status":
        return `${event.status}${event.message ? `: ${event.message}` : ""}`;
      case "error":
        return event.message;
      default:
        return "";
    }
  };

  const handleCopy = async () => {
    const text = getTextContent();
    if (text) {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };
  const content = (() => {
    switch (event.type) {
      case "user_message":
        return <div className="whitespace-pre-wrap">{event.content}</div>;

      case "agent_message":
        return <div className="whitespace-pre-wrap">{event.content}</div>;

      case "task_status":
        return (
          <div className="flex items-center gap-2">
            <TaskStatusBadge event={event} />
            {event.message && (
              <span className="text-sm text-muted-foreground">
                {event.message}
              </span>
            )}
          </div>
        );

      case "artifact_created":
      case "artifact_updated":
        return <ArtifactDisplay artifact={event.artifact} />;

      case "error":
        return (
          <div className="text-destructive">
            <div className="font-semibold">Error</div>
            <div>{event.message}</div>
          </div>
        );

      default:
        return null;
    }
  })();

  return (
    <div className="relative group">
      <div className="flex items-start gap-2">
        <div className="flex-1">{content}</div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">
            {formatTime(event.timestamp)}
          </span>
          {getTextContent() && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handleCopy}
              aria-label="Copy message"
            >
              {copied ? (
                <Check className="h-3 w-3" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </Button>
          )}
          {rawEvents && rawEvents.length > 0 && (
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  aria-label="View raw event data"
                >
                  <Code className="h-3 w-3" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Raw Event Data</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  {rawEvents.map((rawEvent, index) => (
                    <div key={index}>
                      {rawEvents.length > 1 && (
                        <div className="text-sm font-semibold mb-2">
                          Event {index + 1}
                        </div>
                      )}
                      <JsonView data={rawEvent} />
                    </div>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>
    </div>
  );
}
