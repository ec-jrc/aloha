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
import {
  Artifact,
  Message,
  MessageSendParams,
  Task,
  TaskArtifactUpdateEvent,
  TaskState,
  TaskStatusUpdateEvent,
} from "@a2a-js/sdk";
import { isTextPart } from "./a2a-utils";

type A2ADisplayBaseEvent = {
  id: string;
  timestamp: Date;
  rawEvents?: RawA2AEvent[]; // Track original raw events for debugging
};
type A2AUserMessageDisplayEvent = A2ADisplayBaseEvent & {
  type: "user_message";
  content: string;
};

type A2AAgentMessageDisplayEvent = A2ADisplayBaseEvent & {
  type: "agent_message";
  content: string;
};

export type A2ATaskStatusDisplayEvent = A2ADisplayBaseEvent & {
  type: "task_status";
  status: TaskState;
  message?: string;
  taskId: string;
  streaming: boolean;
};

type A2AArtifactCreatedDisplayEvent = A2ADisplayBaseEvent & {
  type: "artifact_created";
  artifact: Artifact;
  taskId: string;
};

type A2AArtifactUpdatedDisplayEvent = A2ADisplayBaseEvent & {
  type: "artifact_updated";
  artifact: Artifact;
  taskId: string;
};

type A2AErrorDisplayEvent = A2ADisplayBaseEvent & {
  type: "error";
  message: string;
  details?: unknown;
};

export type A2ADisplayEvent =
  | A2AUserMessageDisplayEvent
  | A2AAgentMessageDisplayEvent
  | A2ATaskStatusDisplayEvent
  | A2AArtifactCreatedDisplayEvent
  | A2AArtifactUpdatedDisplayEvent
  | A2AErrorDisplayEvent;

export type RawA2AEvent =
  | Task
  | Message
  | MessageSendParams
  | TaskStatusUpdateEvent
  | TaskArtifactUpdateEvent;

export type RawEventWithType = RawA2AEvent & {
  type: "user_message" | "agent_message" | "error_message";
};

function isTaskDisplayEventStreaming(a2aEvent: Task | TaskStatusUpdateEvent) {
  return !(
    a2aEvent.status.state === "completed" ||
    a2aEvent.status.state === "failed" ||
    a2aEvent.status.state === "canceled" ||
    a2aEvent.status.state === "rejected" ||
    a2aEvent.status.state === "input-required"
  );
}

function getTaskDisplayEventIndex(
  taskId: string,
  displayEvents: A2ADisplayEvent[]
) {
  // Only search after the last user_message to avoid merging across conversation turns
  const lastUserMsgIndex = displayEvents.findLastIndex(
    (e) => e.type === "user_message"
  );
  const searchStart = lastUserMsgIndex >= 0 ? lastUserMsgIndex + 1 : 0;
  return displayEvents.findIndex(
    (e, i) => i >= searchStart && e.type === "task_status" && e.taskId === taskId
  );
}

export function transformA2AEvents(
  events: RawEventWithType[]
): A2ADisplayEvent[] {
  const displayEvents: A2ADisplayEvent[] = [];

  for (const event of events) {
    const timestamp = new Date();

    // User messages
    if (event.type === "user_message" && "message" in event) {
      const msgEvent = event as MessageSendParams;
      const textParts = msgEvent.message.parts.filter(isTextPart);
      const content = textParts.map((p) => p.text).join("\n");

      displayEvents.push({
        id: msgEvent.message.messageId || crypto.randomUUID(),
        timestamp,
        type: "user_message",
        content,
        rawEvents: [event],
      });
      continue;
    }

    // Agent messages - accumulate streaming text
    if (event.type === "agent_message") {
      // Task event
      if ("kind" in event && event.kind === "task") {
        const task = event as Task;

        // Add task status
        const statusMessage = task.status.message
          ? task.status.message.parts
              .filter(isTextPart)
              .map((p) => p.text)
              .join("\n")
          : undefined;

        // Check if last event is same status - if so, update it instead of adding new
        const taskStatusEventIndex = getTaskDisplayEventIndex(
          task.id,
          displayEvents
        );

        if (taskStatusEventIndex >= 0) {
          const taskStatusEvent = displayEvents[
            taskStatusEventIndex
          ] as A2ATaskStatusDisplayEvent;

          // Concatenate messages if both exist
          const combinedMessage = [taskStatusEvent.message, statusMessage]
            .filter(Boolean)
            .join("");

          displayEvents[taskStatusEventIndex] = {
            ...taskStatusEvent,
            message: combinedMessage || undefined,
            timestamp, // Update to latest timestamp
            rawEvents: [...(taskStatusEvent.rawEvents || []), event],
            streaming: isTaskDisplayEventStreaming(task),
            status: task.status.state as TaskState,
          };
        } else {
          displayEvents.push({
            id: crypto.randomUUID(),
            timestamp,
            type: "task_status",
            status: task.status.state as TaskState,
            message: statusMessage,
            taskId: task.id,
            rawEvents: [event],
            streaming: isTaskDisplayEventStreaming(task),
          } as A2ATaskStatusDisplayEvent);
        }

        // Add artifacts
        for (const artifact of task.artifacts || []) {
          displayEvents.push({
            id: crypto.randomUUID(),
            timestamp,
            type: "artifact_created",
            artifact,
            taskId: task.id,
            rawEvents: [event],
          });
        }

        // Extract text from task history
        // if (task.history && task.history.length > 0) {
        //   const lastMessage = task.history[task.history.length - 1];
        //   if (lastMessage.role === "agent") {
        //     const textParts = lastMessage.parts.filter(isTextPart);
        //     const content = textParts.map((p) => p.text).join("\n");
        //     if (content) {
        //       displayEvents.push({
        //         id: lastMessage.messageId || crypto.randomUUID(),
        //         timestamp,
        //         type: "agent_message",
        //         content,
        //         rawEvents: [event],
        //       });
        //     }
        //   }
        // }
      }
      // Message event
      else if ("kind" in event && event.kind === "message") {
        const message = event as Message;
        if (message.role === "agent") {
          const textParts = message.parts.filter(isTextPart);
          const content = textParts.map((p) => p.text).join("\n");

          if (content) {
            displayEvents.push({
              id: message.messageId || crypto.randomUUID(),
              timestamp,
              type: "agent_message",
              content,
              rawEvents: [event],
            });
          }
        }
      }

      // TaskStatusUpdateEvent
      else if ("kind" in event && event.kind === "status-update") {
        const statusUpdate = event as TaskStatusUpdateEvent;

        const statusMessage = statusUpdate.status.message
          ? statusUpdate.status.message.parts
              .filter(isTextPart)
              .map((p) => p.text)
              .join("")
          : undefined;

        // Check if last event is same status - if so, update it instead of adding new
        const taskStatusEventIndex = getTaskDisplayEventIndex(
          statusUpdate.taskId,
          displayEvents
        );
        if (taskStatusEventIndex >= 0) {
          const lastEvent = displayEvents[
            taskStatusEventIndex
          ] as A2ATaskStatusDisplayEvent;

          const combinedMessage = [lastEvent.message, statusMessage]
            .filter(Boolean)
            .join("");

          displayEvents[taskStatusEventIndex] = {
            ...lastEvent,
            message: combinedMessage || undefined,
            timestamp, // Update to latest timestamp
            rawEvents: [...(lastEvent.rawEvents || []), event],
            streaming: isTaskDisplayEventStreaming(statusUpdate),
            status: statusUpdate.status.state as TaskState,
          };
        } else {
          console.warn("Task status update event without previous task", event);
          displayEvents.push({
            id: crypto.randomUUID(),
            timestamp,
            type: "task_status",
            status: statusUpdate.status.state,
            message: statusMessage,
            taskId: statusUpdate.taskId,
            rawEvents: [event],
            streaming: isTaskDisplayEventStreaming(statusUpdate),
          });
        }
      }

      // TaskArtifactUpdateEvent
      else if ("kind" in event && event.kind === "artifact-update") {
        const artifactUpdate = event as TaskArtifactUpdateEvent;
        displayEvents.push({
          id: crypto.randomUUID(),
          timestamp,
          type: "artifact_updated",
          artifact: artifactUpdate.artifact,
          taskId: artifactUpdate.taskId,
          rawEvents: [event],
        });
      }
    }

    // Error messages
    if (event.type === "error_message") {
      const rawEvent = event as unknown as Record<string, unknown>;
      const message =
        (typeof rawEvent.data === "string" && rawEvent.data) ||
        "An error occurred" +
          (rawEvent.responseCode
            ? ` (status ${rawEvent.responseCode})`
            : "");
      displayEvents.push({
        id: crypto.randomUUID(),
        timestamp,
        type: "error",
        message,
        details: event,
        rawEvents: [event],
      });
    }
  }

  return displayEvents;
}
