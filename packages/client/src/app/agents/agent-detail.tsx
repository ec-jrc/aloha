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
import {
  ChatBubble,
  ChatBubbleAvatar,
  ChatBubbleMessage,
} from "@/components/chat/chat-bubble";
import { ChatInput } from "@/components/chat/chat-input";
import { ChatMessageList } from "@/components/chat/chat-message-list";
import ConfirmDialog from "@/components/confirm-dialog";
import ConnectionTypeIndicator from "@/components/connection-type-indicator";
import { CreatorAndVisibilityEditor } from "@/components/creator-and-visibility-editor";
import PageTitle from "@/components/page-title";
import { ScrollableUrl } from "@/components/scrollable-url";
import { TagsList } from "@/components/tags-list";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { usePermissionChecker } from "@/hooks/use-permission-checker";
import { useService } from "@/hooks/useService";
// import JsonView from "@/mcp-inspector/JsonView";
import { OIDCRegistration } from "@/components/oidc-registration";
import { getAllGenericConnections } from "@/services/testbed-agents";
import { isWithErrorsObject } from "@/services/utils";
import {
  RawA2AEvent,
  RawEventWithType,
  transformA2AEvents,
} from "@/utils/a2a-event-transformer";
import { isA2AAgent } from "@/utils/a2a-utils";
import { exceptionToMessage, isDefined } from "@/utils/type-utils";
import { MessageSendParams } from "@a2a-js/sdk";
import {
  ExclamationTriangleIcon,
  MinusCircleIcon,
  PlusCircleIcon,
  TrashIcon,
} from "@heroicons/react/16/solid";
import { PaperAirplaneIcon, StopIcon } from "@heroicons/react/24/solid";
import { schemas } from "aloha-shared";
import { Pencil } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";
import {
  cancelA2AStream,
  connectClientToAgent,
  deleteAgent,
  disconnectClientFromAgent,
  getAgentDetail,
  // isA2AMessageSendParams,
  sendA2AMessageStream,
  setAgentCreator,
  setAgentVisibility,
} from "../../services/agents";
import MCPClientTool from "../clients/client-tool";
import { A2AEvent } from "./a2a-event";
import AgentEditDialog from "./agent-edit-dialog";
import AgentTokenDialog from "./agent-token-dialog";

const PING_TIMEOUT = 5000;

function EditDialog({
  disabled,
  id,
  refreshAgent,
}: {
  disabled: boolean;
  id: string;
  refreshAgent: () => void;
}) {
  return (
    <AgentEditDialog
      agentId={id}
      trigger={
        <Button disabled={disabled}>
          <Pencil /> Edit Agent
        </Button>
      }
      onAccept={async () => {
        refreshAgent();
      }}
    ></AgentEditDialog>
  );
}

export default function AgentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [taskId, setTaskId] = useState<string | null>(null);
  const [input, setInput] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [events, setEvents] = useState<RawEventWithType[]>([]);
  const [isAgentLoading, agentDetail, , refreshAgent] = useService(
    (id) => getAgentDetail(id),
    [id],
    null,
    [],
    PING_TIMEOUT
  );

  const [, allConnections] = useService(
    () => getAllGenericConnections(id, true, true, false),
    [id],
    [],
    [],
    PING_TIMEOUT
  );

  const [draggingOver, setDraggingOver] = useState(0);

  const navigate = useNavigate();

  const permissionChecker = usePermissionChecker();

  const isTheUserTheOwner = useMemo(() => {
    return permissionChecker.hasOwnership(agentDetail);
  }, [agentDetail, permissionChecker]);

  const isA2A = useMemo(
    () => isDefined(agentDetail) && isA2AAgent(agentDetail),
    [agentDetail]
  );

  // Clear events when agent changes or component unmounts
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEvents([]);
  }, [agentDetail?.id]);

  const url = useMemo(() => {
    if (!isDefined(agentDetail)) {
      return "";
    }

    return !isA2A
      ? `${window.location.origin}/api/mcp/${agentDetail.serverPath}/mcp`
      : `${window.location.origin}/api/a2a/${agentDetail.serverPath}`;
  }, [isA2A, agentDetail]);

  const isClientCallable = useMemo(() => {
    return (
      !isWithErrorsObject(agentDetail) &&
      permissionChecker.hasVisibility(agentDetail)
    );
  }, [agentDetail, permissionChecker]);

  const associateClient = useCallback(
    async (clientId: string) => {
      if (!isTheUserTheOwner) {
        return;
      }

      if (id) {
        try {
          await connectClientToAgent(id, clientId);
          refreshAgent();
        } catch (err) {
          console.error(err);
          toast.error("Failed to fetch connection list");
        }
      }
    },
    [id, refreshAgent, isTheUserTheOwner]
  );

  const dissociateClient = useCallback(
    async (clientId: string) => {
      if (!isTheUserTheOwner) {
        return;
      }

      if (id) {
        try {
          await disconnectClientFromAgent(id, clientId);
          refreshAgent();
        } catch (err) {
          console.error(err);
          toast.error("Failed to fetch connection list");
        }
      }
    },
    [id, refreshAgent, isTheUserTheOwner]
  );

  const updateEvents = useCallback(
    (event: RawA2AEvent, eventType: RawEventWithType["type"]) => {
      setEvents((prev) => [...prev, { ...event, type: eventType }]);
    },
    []
  );

  const handleSubmitStream = useCallback(
    async (message: string) => {
      if (
        isDefined(agentDetail) &&
        !isWithErrorsObject(agentDetail) &&
        message
      ) {
        try {
          const messageToSend: MessageSendParams = {
            message: {
              kind: "message",
              role: "user",
              messageId: uuidv4(),
              parts: [{ kind: "text", text: message }],
            },
          };

          updateEvents(messageToSend, "user_message");

          await sendA2AMessageStream(
            agentDetail,
            messageToSend,
            async (event) => {
              console.log("Received response:", event);
              switch (event.kind) {
                case "task":
                  setTaskId(event.id);
                  updateEvents(event, "agent_message");
                  break;
                case "message":
                case "status-update":
                case "artifact-update":
                  updateEvents(event, "agent_message");
                  break;
                default:
                  setTaskId(null);
                  setInput("");
                  setIsGenerating(false);
              }
            }
          );
        } catch (err) {
          console.error(err);
          toast.error("Failed to send message to agent");
        }
      }
    },
    [agentDetail, updateEvents]
  );

  const handleSubmit = useCallback(
    async (message: string) => {
      await handleSubmitStream(message);
    },
    [handleSubmitStream]
  );

  const stopAgentInstanceGeneration = useCallback(() => {
    if (isDefined(agentDetail) && !isWithErrorsObject(agentDetail) && taskId) {
      cancelA2AStream(agentDetail, taskId);
    }
    setIsGenerating(false);
  }, [agentDetail, taskId]);

  const stopGeneration = useCallback(
    (e: React.MouseEvent) => {
      // if (agentInstance) {
      e.preventDefault();
      stopAgentInstanceGeneration();
      // }
    },
    [stopAgentInstanceGeneration]
  );

  const onSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setIsGenerating(true);
      handleSubmit(input);
    },
    [handleSubmit, input]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey) {
        e.preventDefault();
        if (isGenerating || !input) return;
        setIsGenerating(true);
        handleSubmit(input);
      }
    },
    [isGenerating, input, handleSubmit]
  );

  if (isAgentLoading) {
    return <div>Loading...</div>;
  }

  if (!id || !agentDetail) {
    return <div>Agent not found</div>;
  }

  const serverConnections = agentDetail.connectionsDetail || [];
  const associatedConnections = serverConnections.map((conn) => ({
    id: conn.id,
    versioningInfo: conn.versioningInfo,
  }));
  const unassociatedConnections = allConnections.filter(
    (conn) =>
      associatedConnections.find(
        (e) =>
          e.id === conn.id ||
          (e.versioningInfo &&
            conn.versioningInfo &&
            e.versioningInfo.versionGroupingUUID ===
              conn.versioningInfo.versionGroupingUUID)
      ) === undefined
  );

  async function doDeleteAgent() {
    try {
      await deleteAgent(id!);
      navigate(`/agents`);
    } catch (e) {
      console.error(e);
      toast.error(exceptionToMessage(e));
    }
  }

  return (
    <div className="max-w-8xl mx-auto px-4">
      {/* Header Section */}
      <div className="">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-6 gap-4">
          <div className="flex-1 min-w-0">
            <PageTitle
              className="flex gap-6 items-center"
              isConnected={agentDetail.isConnected}
              isDisabled={agentDetail.disabled}
              lastOnlineAt={agentDetail.lastOnlineAt}
              lastOfflineAt={agentDetail.lastOfflineAt}
            >
              {agentDetail.name}
            </PageTitle>
            {agentDetail.description && (
              <p className="text-gray-600 text-lg leading-relaxed max-w-3xl">
                {agentDetail.description}
              </p>
            )}
          </div>
          <div className="flex flex-shrink-0 gap-2 sm:ml-8 self-start">
            <ConfirmDialog
              onClick={() => {
                return doDeleteAgent();
              }}
            >
              <Button variant="destructive" disabled={!isTheUserTheOwner}>
                <TrashIcon />
                Delete Agent
              </Button>
            </ConfirmDialog>
            <EditDialog
              disabled={!isTheUserTheOwner}
              id={id}
              refreshAgent={refreshAgent}
            ></EditDialog>
          </div>
        </div>
        {"isError" in agentDetail && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-start">
              <ExclamationTriangleIcon className="w-5 h-5 text-red-500 mt-0.5 mr-3 flex-shrink-0" />
              <div>
                <h3 className="font-medium text-red-800 mb-1">
                  Client Connection Error
                </h3>
                <p className="text-red-700">
                  There is an error with this client:{" "}
                  <span className="font-mono italic">{agentDetail.error}</span>
                </p>
                <p className="text-red-600 text-sm mt-1">
                  To ensure proper functionality, please fix this issue as soon
                  as possible.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <Separator />

      <div className="rounded-xl my-8">
        <div className="lg:flex gap-12">
          {/* Configuration Panel */}
          <div className="lg:w-1/3">
            <TagsList item={agentDetail} inline={false} />
            <div className="space-y-2">
              <dt className="text-sm font-semibold uppercase tracking-wide">
                Server URL
              </dt>
              <ScrollableUrl
                url={agentDetail.serverUrl}
                className="max-w-full"
              />
            </div>

            <div className="mt-6">
              {agentDetail.id !== undefined && (
                <OIDCRegistration item={agentDetail}></OIDCRegistration>
              )}
            </div>
            <div className="mt-6">
              {agentDetail.id !== undefined && (
                <CreatorAndVisibilityEditor
                  name="Client"
                  item={
                    agentDetail as schemas.VisibilityInterface &
                      schemas.WithIdBase
                  }
                  setVisibilityService={setAgentVisibility}
                  setCreatorService={setAgentCreator}
                  onAccept={async () => refreshAgent()}
                />
              )}
            </div>
          </div>

          <div className="lg:w-2/3 mt-8 lg:mt-0">
            {!isA2A &&
            !agentDetail.disabled &&
            agentDetail.tools &&
            agentDetail.tools.length > 0 &&
            agentDetail.isConnected &&
            agentDetail.id ? (
              <div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                  {agentDetail.tools.map((r) => (
                    <Card
                      key={r.name}
                      className="transform hover:scale-105 transition-all duration-200 ease-in-out cursor-pointer bg-white shadow-lg rounded-xl border border-gray-100 hover:shadow-xl flex flex-col h-full"
                      style={{
                        animation: "fadeInUp 0.3s ease-out forwards",
                      }}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-base font-semibold text-gray-900">
                            {r.name}
                          </CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent className="flex-grow text-sm text-gray-600 pb-3">
                        {r.description ? (
                          <p className="text-gray-600 line-clamp-3">
                            {r.description}
                          </p>
                        ) : (
                          <p className="italic text-gray-400">
                            No description provided.
                          </p>
                        )}
                      </CardContent>
                      <CardFooter className="pt-0">
                        <MCPClientTool
                          disabled={!isClientCallable}
                          tool={r}
                          clientId={agentDetail.id!}
                        />
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              </div>
            ) : isA2A && agentDetail.isConnected && !agentDetail.disabled ? (
              <>
                <Card className="bg-white shadow-lg rounded-xl border border-gray-100 hover:shadow-xl flex flex-col h-full">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base font-semibold text-gray-900">
                        Send Message to Agent
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-grow text-sm text-gray-600 pb-3">
                    <ChatMessageList className="!h-[20em]">
                      {transformA2AEvents(events).map((displayEvent) => {
                        const variant =
                          displayEvent.type === "user_message"
                            ? "sent"
                            : "received";
                        return (
                          <ChatBubble
                            key={displayEvent.id}
                            variant={variant}
                            className="max-w-full"
                          >
                            <ChatBubbleAvatar
                              fallback={
                                displayEvent.type === "user_message"
                                  ? "👨🏽"
                                  : displayEvent.type === "error"
                                    ? "💀"
                                    : "🤖"
                              }
                            />
                            <ChatBubbleMessage variant={variant}>
                              <A2AEvent event={displayEvent} />
                            </ChatBubbleMessage>
                          </ChatBubble>
                        );
                      })}
                    </ChatMessageList>
                  </CardContent>
                  <CardFooter>
                    <form
                      className="flex relative gap-0 w-full"
                      onSubmit={onSubmit}
                    >
                      <ChatInput
                        value={input}
                        onChange={(e) => {
                          setInput(e.target.value);
                        }}
                        onKeyDown={onKeyDown}
                        className="min-h-12 bg-background shadow-none "
                        disabled={isGenerating}
                      />
                      {!isGenerating ? (
                        <Button
                          className="absolute top-1/2 right-2 transform  -translate-y-1/2"
                          type="submit"
                          size="icon"
                          disabled={!input}
                        >
                          <PaperAirplaneIcon />
                        </Button>
                      ) : (
                        <Button
                          onClick={stopGeneration}
                          className="absolute top-1/2 right-2 transform  -translate-y-1/2"
                          type="button"
                          size="icon"
                          disabled={!taskId}
                        >
                          <StopIcon />
                        </Button>
                      )}
                    </form>
                  </CardFooter>
                </Card>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-gray-400 bg-gray-50/50 rounded-xl border-2 border-dashed border-gray-200">
                <div className="w-12 h-12 mb-4 opacity-40">
                  <svg fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                  </svg>
                </div>
                <p className="text-lg font-medium text-gray-600">
                  {!agentDetail.isConnected && !agentDetail.disabled
                    ? "Agent is not connected"
                    : !agentDetail.disabled
                      ? "No items available or please wait for the agent to connect"
                      : "Agent is disabled"}
                </p>
                <p className="text-sm text-gray-500 mt-1 text-center">
                  {!agentDetail.isConnected && !agentDetail.disabled
                    ? "Connect the agent to view available resources, prompts, and tools"
                    : !agentDetail.disabled
                      ? "This agent doesn't provide any resources, prompts, or tools"
                      : "This agent has been disabled, enable it to access to available resources, prompts and tools "}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <Separator />

      <div className="rounded-xl my-8">
        {/* Agent Path */}
        <div className="space-y-2 py-4 mb-6">
          <dt className="text-sm font-semibold uppercase tracking-wide">
            {isA2A
              ? "Agent Clients Connections info"
              : "MCP Clients Connections info"}
          </dt>

          <div className="flex w-full items-center justify-between gap-4">
            <ScrollableUrl url={url} className="max-w-full grow" />
            {!("isError" in agentDetail && agentDetail.isError) && (
              <AgentTokenDialog
                agent={agentDetail as schemas.AgentWithId}
                disabled={!isTheUserTheOwner}
              />
            )}
          </div>
        </div>{" "}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-1 h-6 bg-gradient-to-b from-blue-500 to-purple-600 rounded-full"></div>
          <h2 className="text-xl font-semibold text-gray-900">MCP Clients</h2>
          <div className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
            Drag & drop to manage associations
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          {/* Associated Clients */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              <h3 className="font-medium text-gray-700">
                Associated with Agent
              </h3>
              <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
                {serverConnections.length}
              </span>
            </div>

            <div
              className={`h-full min-h-40 p-4 rounded-xl border-2 border-dashed transition-all duration-200 ${
                draggingOver === 1
                  ? "border-blue-400 bg-blue-50/70 shadow-lg scale-[1.02]"
                  : "border-gray-200 bg-gray-50/50 hover:bg-gray-50"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDraggingOver(1);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setDraggingOver(0);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDraggingOver(0);
                const connectionId = e.dataTransfer.getData("connectionId");
                associateClient(connectionId);
              }}
            >
              {serverConnections.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-gray-400">
                  <div className="w-8 h-8 mb-2 opacity-40">
                    <svg fill="currentColor" viewBox="0 0 24 24">
                      <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                    </svg>
                  </div>
                  {/* color dark gray */}
                  <p className="text-sm text-gray-500">
                    Drop clients here to associate
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {serverConnections.map((connection, index) => (
                    <div
                      key={connection.id}
                      className={`group flex items-center gap-3 p-3 bg-white rounded-lg border shadow-sm hover:shadow-md transition-all duration-200 ${
                        isTheUserTheOwner
                          ? "cursor-grab active:cursor-grabbing"
                          : "cursor-default"
                      }`}
                      draggable={isTheUserTheOwner}
                      onDragStart={(e) => {
                        e.dataTransfer.setData(
                          "connectionId",
                          connection.id || ""
                        );
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      style={{
                        animationDelay: `${index * 50}ms`,
                        animation: "fadeInUp 0.3s ease-out forwards",
                      }}
                    >
                      <ConnectionTypeIndicator type={connection.type} />

                      <div
                        className={`w-3 h-3 rounded-full flex-shrink-0 shadow-sm ${
                          connection.isConnected
                            ? "bg-emerald-500 shadow-emerald-200"
                            : "bg-red-500 shadow-red-200"
                        }`}
                      >
                        <div
                          className={`w-full h-full rounded-full animate-pulse ${
                            connection.isConnected
                              ? "bg-emerald-400"
                              : "bg-red-400"
                          }`}
                        ></div>
                      </div>

                      <span className="flex-1 font-medium text-gray-900 truncate">
                        {connection.name || "Unknown connection"}
                        {connection.versioningInfo?.versionNumber && (
                          <span className="text-muted-foreground italic ml-2">
                            v{connection.versioningInfo?.versionNumber}
                          </span>
                        )}
                      </span>

                      {isTheUserTheOwner && (
                        <button
                          onClick={() => dissociateClient(connection.id)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 group-hover:opacity-100"
                          title="Remove association"
                        >
                          <MinusCircleIcon width={18} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Available Clients */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
              <h3 className="font-medium text-gray-700">Available Clients</h3>
              <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded-full">
                {unassociatedConnections.length}
              </span>
            </div>

            <div
              className={`h-full min-h-40 p-4 rounded-xl border-2 border-dashed transition-all duration-200 ${
                draggingOver === 2
                  ? "border-gray-400 bg-gray-100 shadow-lg scale-[1.02]"
                  : "border-gray-200 bg-gray-50/30 hover:bg-gray-50/50"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDraggingOver(2);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setDraggingOver(0);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDraggingOver(0);
                const connectionId = e.dataTransfer.getData("connectionId");
                dissociateClient(connectionId);
              }}
            >
              {unassociatedConnections.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-gray-400">
                  <div className="w-8 h-8 mb-2 opacity-40">
                    <svg fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                    </svg>
                  </div>
                  <p className="text-sm">All clients are associated</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {unassociatedConnections.map((connection, index) => (
                    <div
                      key={connection.id}
                      className={`group flex items-center gap-3 p-3 bg-white rounded-lg border shadow-sm hover:shadow-md transition-all duration-200 ${
                        isTheUserTheOwner
                          ? "cursor-grab active:cursor-grabbing"
                          : "cursor-default"
                      }`}
                      draggable={isTheUserTheOwner}
                      onDragStart={(e) => {
                        e.dataTransfer.setData(
                          "connectionId",
                          connection.id || ""
                        );
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      style={{
                        animationDelay: `${index * 50}ms`,
                        animation: "fadeInUp 0.3s ease-out forwards",
                      }}
                    >
                      <ConnectionTypeIndicator type={connection.type} />

                      <div
                        className={`w-3 h-3 rounded-full flex-shrink-0 shadow-sm ${
                          connection.isConnected
                            ? "bg-emerald-500 shadow-emerald-200"
                            : "bg-red-500 shadow-red-200"
                        }`}
                      >
                        <div
                          className={`w-full h-full rounded-full animate-pulse ${
                            connection.isConnected
                              ? "bg-emerald-400"
                              : "bg-red-400"
                          }`}
                        ></div>
                      </div>

                      <span className="flex-1 font-medium text-gray-900 truncate">
                        {connection.name || "Unknown connection"}
                        {connection.versioningInfo?.versionNumber && (
                          <span className="text-muted-foreground italic ml-2">
                            v{connection.versioningInfo?.versionNumber}
                          </span>
                        )}
                      </span>

                      {isTheUserTheOwner && (
                        <button
                          onClick={() => associateClient(connection.id!)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50"
                          title="Associate with server"
                        >
                          <PlusCircleIcon width={18} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
