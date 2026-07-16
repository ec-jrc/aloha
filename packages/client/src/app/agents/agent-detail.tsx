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
import ConnectionAssociationList from "@/components/connection-association-list";
import { CreatorAndVisibilityEditor } from "@/components/creator-and-visibility-editor";
import { OIDCRegistration } from "@/components/oidc-registration";
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePermissionChecker } from "@/hooks/use-permission-checker";
import { usePlatformPluginsForSlotId } from "@/hooks/use-platform-plugins";
import { useService } from "@/hooks/use-service";
import JsonView from "@/mcp-inspector/JsonView";
import { UISlot } from "@/plugins/definitions/ui-slot";
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
import { ExclamationTriangleIcon, TrashIcon } from "@heroicons/react/16/solid";
import { PaperAirplaneIcon, StopIcon } from "@heroicons/react/24/solid";
import { authentication_strategy, schemas } from "aloha-shared";
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
  const [showConnectionSection, setShowConnectionSection] = useState(false);
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

  const navigate = useNavigate();

  const permissionChecker = usePermissionChecker();

  const canOperateOnItem =
    permissionChecker.isAdministrator() ||
    permissionChecker.hasOwnership(agentDetail);

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

  const registryUrl = useMemo(() => {
    if (!isDefined(agentDetail)) {
      return "";
    }

    return (
      (!isA2A
        ? `${window.location.origin}/api/mcp/${agentDetail.serverPath}`
        : `${window.location.origin}/api/a2a/${agentDetail.serverPath}`) +
      "/registry/v1"
    );
  }, [isA2A, agentDetail]);
  const isClientCallable = useMemo(() => {
    return (
      !isWithErrorsObject(agentDetail) &&
      permissionChecker.hasVisibility(agentDetail)
    );
  }, [agentDetail, permissionChecker]);

  const associateClient = useCallback(
    async (clientId: string) => {
      if (!canOperateOnItem) {
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
    [id, refreshAgent, canOperateOnItem]
  );

  const dissociateClient = useCallback(
    async (clientId: string) => {
      if (!canOperateOnItem) {
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
    [id, refreshAgent, canOperateOnItem]
  );

  const updateEvents = useCallback(
    (event: RawA2AEvent, eventType: RawEventWithType["type"]) => {
      setEvents((prev) => [...prev, { ...event, type: eventType }]);
    },
    []
  );

  const canTheUserOperateOnWorkflow = useMemo(
    () =>
      permissionChecker.has(
        authentication_strategy.Permissions.ManageWorkflows
      ),
    [permissionChecker]
  );

  const clientWorkflowPlugins = usePlatformPluginsForSlotId(
    "client-workflow-slot"
  );

  const workflowSlotContext = useMemo(
    () => ({
      readonly: !canTheUserOperateOnWorkflow,
      itemId: id,
      type: "agent",
      afterSave: async () => refreshAgent(),
    }),
    [id, refreshAgent, canTheUserOperateOnWorkflow]
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
                case "error":
                  updateEvents(
                    event as unknown as RawA2AEvent,
                    "error_message"
                  );
                  setTaskId(null);
                  setInput("");
                  setIsGenerating(false);
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
          updateEvents(
            { kind: "error", data: String(err) } as unknown as RawA2AEvent,
            "error_message"
          );
          setIsGenerating(false);
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
      void cancelA2AStream(agentDetail, taskId);
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
      void handleSubmit(input);
    },
    [handleSubmit, input]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey) {
        e.preventDefault();
        if (isGenerating || !input) return;
        setIsGenerating(true);
        void handleSubmit(input);
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
      void navigate(`/agents`);
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
          <div className="flex shrink-0 gap-2 sm:ml-8 self-start">
            <ConfirmDialog
              onClick={() => {
                return doDeleteAgent();
              }}
            >
              <Button variant="destructive" disabled={!canOperateOnItem}>
                <TrashIcon />
                Delete Agent
              </Button>
            </ConfirmDialog>
            <EditDialog
              disabled={!canOperateOnItem}
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

            {agentDetail.id !== undefined &&
              canOperateOnItem &&
              clientWorkflowPlugins.length > 0 && (
                <div className="space-y-4 mt-6">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                      Agent Workflow
                    </h3>
                  </div>

                  <div className="space-y-4">
                    <UISlot
                      context={workflowSlotContext}
                      slotId="client-workflow-slot"
                      renderWidget={(w) => {
                        return <div key={w.id}>{w.content}</div>;
                      }}
                    ></UISlot>
                  </div>
                </div>
              )}
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
              <Tabs defaultValue="chat" className="w-full">
                <TabsList className="flex w-full md:grid md:grid-cols-2 gap-1 bg-gray-200 rounded-lg h-11 px-2 overflow-x-auto md:overflow-visible">
                  <TabsTrigger
                    value="chat"
                    className="data-[state=active]:bg-gray-50 h-8 duration-0 flex-shrink-0 md:flex-shrink"
                  >
                    Chat
                  </TabsTrigger>
                  {!!agentDetail.metadata?.agentCard && (
                    <TabsTrigger
                      value="agent-card"
                      className="data-[state=active]:bg-gray-50 h-8 duration-0 flex-shrink-0 md:flex-shrink"
                    >
                      Agent Card
                    </TabsTrigger>
                  )}
                </TabsList>
                <TabsContent value="chat">
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
                              className={
                                variant === "sent" ? "" : "!max-w-[90%] w-full"
                              }
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
                              <ChatBubbleMessage
                                variant={variant}
                                className={
                                  variant === "received" ? "w-full" : ""
                                }
                              >
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
                </TabsContent>
                {!!agentDetail.metadata?.agentCard && (
                  <TabsContent value="agent-card">
                    <Card className="bg-white shadow-lg rounded-xl border border-gray-100 hover:shadow-xl flex flex-col h-full">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base font-semibold text-gray-900">
                          Agent Card
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="grow max-h-[22.8em] overflow-auto">
                        <JsonView data={agentDetail.metadata.agentCard} />
                      </CardContent>
                    </Card>
                  </TabsContent>
                )}
              </Tabs>
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

      <div className="text-foreground mt-6">
        If you want to configure connections for this Agent and show the
        available endpoints to get the connection information, use the toggle
        here below
      </div>
      <div className="flex items-center gap-3 mt-4">
        <span className="">Configure connections</span>
        <Switch
          checked={showConnectionSection}
          onCheckedChange={setShowConnectionSection}
        />
      </div>
      {showConnectionSection && (
        <div className="rounded-xl my-8">
          {/* Agent Path */}
          <div className="space-y-2 py-4 mb-2">
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
                  disabled={!canOperateOnItem}
                />
              )}
            </div>
          </div>
          {
            <div className="space-y-2 py-4 mb-6">
              <dt className="text-sm font-semibold uppercase tracking-wide">
                A2A Connected Clients Registry
              </dt>

              <div className="flex w-full items-center justify-between gap-4">
                <ScrollableUrl url={registryUrl} className="max-w-full grow" />

                {!("isError" in agentDetail && agentDetail.isError) && (
                  <AgentTokenDialog
                    agent={agentDetail as schemas.AgentWithId}
                    disabled={!canOperateOnItem}
                  />
                )}
              </div>
            </div>
          }
          <ConnectionAssociationList
            boundConnectionsTitle="Associated with Agent"
            boundConnections={serverConnections}
            unboundConnections={unassociatedConnections}
            associateConnection={associateClient}
            dissociateConnection={dissociateClient}
            canOperate={canOperateOnItem}
          />
        </div>
      )}
    </div>
  );
}
