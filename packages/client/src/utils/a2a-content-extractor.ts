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
import { Artifact, Message, Role, Task, TaskState } from "@a2a-js/sdk";
import { partText } from "./a2a-utils";

export function extractTextFromMessage(message: Message): string {
  return message.parts.map(partText).filter(Boolean).join("\n");
}

export function extractTextFromTask(task: Task): string {
  const texts: string[] = [];

  if (task.status?.message) {
    const msgText = extractTextFromMessage(task.status.message);
    if (msgText) texts.push(msgText);
  }

  if (task.history) {
    for (const msg of task.history) {
      if (msg.role === Role.ROLE_AGENT) {
        const text = extractTextFromMessage(msg);
        if (text) texts.push(text);
      }
    }
  }

  return texts.join("\n");
}

export function extractTextFromArtifact(artifact: Artifact): string {
  return artifact.parts.map(partText).filter(Boolean).join("\n");
}

export function getTaskStatusDisplay(state: TaskState): {
  label: string;
  color: string;
  variant: "default" | "secondary" | "destructive" | "outline";
} {
  switch (state) {
    case TaskState.TASK_STATE_SUBMITTED:
      return { label: "Submitted", color: "bg-blue-500", variant: "secondary" };
    case TaskState.TASK_STATE_WORKING:
      return { label: "Working", color: "bg-yellow-500", variant: "outline" };
    case TaskState.TASK_STATE_COMPLETED:
      return { label: "Completed", color: "bg-green-500", variant: "default" };
    case TaskState.TASK_STATE_FAILED:
      return { label: "Failed", color: "bg-red-500", variant: "destructive" };
    case TaskState.TASK_STATE_CANCELED:
      return { label: "Cancelled", color: "bg-gray-500", variant: "secondary" };
    case TaskState.TASK_STATE_INPUT_REQUIRED:
      return {
        label: "Input Required",
        color: "bg-orange-500",
        variant: "outline",
      };
    case TaskState.TASK_STATE_REJECTED:
      return { label: "Rejected", color: "bg-red-400", variant: "destructive" };
    case TaskState.TASK_STATE_AUTH_REQUIRED:
      return {
        label: "Auth Required",
        color: "bg-purple-500",
        variant: "outline",
      };
    default:
      return { label: "Unknown", color: "bg-gray-400", variant: "secondary" };
  }
}
