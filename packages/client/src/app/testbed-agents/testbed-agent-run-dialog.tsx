/* eslint-disable react-hooks/set-state-in-effect */
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChatInput } from "@/components/chat/chat-input";
import { ChatMessageList } from "@/components/chat/chat-message-list";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AgentInstance,
  AgentInstanceEvent,
  createAgentInstance,
  CustomAgentEvent,
  getModelsForEndpoint,
  getTestbedAgentDetail,
  sendMessageToAgentInstance,
  stopAgentInstanceRun,
  updateTestbedAgent,
} from "@/services/testbed-agents";
import { transformTestbedEvents } from "@/utils/testbed-event-transformer";
import { isWithErrorsObject } from "@/services/utils";
import { PlayIcon } from "@heroicons/react/24/outline";
import { PaperAirplaneIcon, StopIcon } from "@heroicons/react/24/solid";
import { endpoints_schemas } from "aloha-shared";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { TestbedAgentEvent } from "./testbed-agent-event";
import { Textarea } from "@/components/ui/textarea";

export default function TestbedAgentRunDialog({
  agentId,
  onAgentChange,
}: {
  agentId: string;
  onAgentChange: () => void;
}) {
  const [events, setEvents] = useState<
    Array<AgentInstanceEvent | CustomAgentEvent>
  >([]);
  const [agentInstance, setAgentInstance] = useState<AgentInstance | null>(
    null
  );

  const [isGenerating, setIsGenerating] = useState(false);
  const [input, setInput] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState<boolean>(false);
  const [agentDetail, setAgentDetail] =
    useState<endpoints_schemas.TestbedAgentWithIdAndDetail | null>(null);

  const [systemPrompt, setSystemPrompt] = useState<string>("");
  const [modelList, setModelList] = useState<string[]>([]);
  const [model, setModel] = useState<string>("");

  const updateEvents = (event: AgentInstanceEvent | CustomAgentEvent) => {
    setEvents((prev) => [...prev, event]);
  };

  const displayEvents = useMemo(() => transformTestbedEvents(events), [events]);

  useEffect(() => {
    if (!agentId) {
      return;
    }

    if (dialogOpen) {
      setEvents([]);
      setIsGenerating(false);
      setInput("");
      void getTestbedAgentDetail(agentId)
        .then((agentDetail) => {
          if (!isWithErrorsObject(agentDetail)) {
            setAgentDetail(agentDetail);
            setSystemPrompt(agentDetail.prompt);
            setModel(agentDetail.model);
            return createAgentInstance(
              agentDetail,
              (agentInstance, lastEvent) => {
                updateEvents({
                  type: "agent_instance_event",
                  agentInstance,
                  event: lastEvent,
                });
              }
            );
          } else {
            setAgentDetail(null);
            setSystemPrompt("");
            setModel("");
            setModelList([]);
            return null;
          }
        })
        .then((agentInstance) => {
          setAgentInstance(agentInstance);
          if (agentInstance?.agentDetail) {
            console.log("Prendiamo la lista di modelli");
            return getModelsForEndpoint(agentInstance?.agentDetail);
          } else {
            console.log("Non prendiamo la lista di modelli");
            return null;
          }
        })
        .then((modelList) => {
          console.log("Lista dei modelli:", modelList);
          if (modelList) {
            setModelList(modelList.data.map((m) => m.id).sort());
          }
        });
    } else {
      setAgentDetail(null);
      setAgentInstance(null);
      setSystemPrompt("");
      setModel("");
    }

    return () => {
      setAgentDetail(null);
      setAgentInstance(null);
      setSystemPrompt("");
      setModel("");
    };
  }, [dialogOpen, agentId]);

  const handleSubmit = async (message: string) => {
    if (agentInstance && message) {
      try {
        updateEvents({
          type: "custom_agent_event",
          agentInstance,
          event: {
            type: "system_prompt",
            content: systemPrompt || "",
          },
        });
        updateEvents({
          type: "custom_agent_event",
          agentInstance,
          event: {
            type: "user_message",
            content: message,
          },
        });
        // Override the agent prompt and model
        // eslint-disable-next-line react-hooks/immutability
        agentInstance.agent.instructions = systemPrompt;
        agentInstance.agent.model = model;
        await sendMessageToAgentInstance(agentInstance, message);
        // await sendMessageToAgentInstance(
        //   {
        //     ...agentInstance,
        //     agentDetail: {
        //       ...agentInstance.agentDetail,
        //       prompt: systemPrompt,
        //       model,
        //     },
        //   },
        //   message
        // );
      } catch (err) {
        console.error(err);

        updateEvents({
          type: "custom_agent_event",
          agentInstance,
          event: {
            type: "error_message",
            content: err,
          },
        });

        toast.error("Failed to send message to agent");
      }
    }
    console.log("Set isGenerating to false");
    setIsGenerating(false);
  };

  const stopAgentInstanceGeneration = () => {
    if (agentInstance) {
      stopAgentInstanceRun(agentInstance);
    }
    setIsGenerating(false);
  };

  const stopGeneration = (e: React.MouseEvent) => {
    if (agentInstance) {
      e.preventDefault();
      stopAgentInstanceGeneration();
    }
  };
  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsGenerating(true);
    void handleSubmit(input);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey) {
      e.preventDefault();
      if (isGenerating || !input) return;
      setIsGenerating(true);
      void handleSubmit(input);
    }
  };

  const onDialogOpen = (open: boolean) => {
    if (!open) {
      stopAgentInstanceGeneration();
    }
    setDialogOpen(open);
  };

  const savePromptOrModel = async () => {
    if (agentDetail) {
      try {
        await updateTestbedAgent(agentDetail.id, {
          ...agentDetail,
          prompt: systemPrompt,
          model,
        });
        if (onAgentChange) onAgentChange();
        const agentDetailNew = await getTestbedAgentDetail(agentId);
        if (!isWithErrorsObject(agentDetailNew)) {
          setAgentDetail(agentDetailNew);
        } else {
          toast.error("Failed to retrieve the modified agent");
        }
        toast.success("Changes saved");
      } catch (e) {
        console.error(e);
        toast.error("Failed to store the changes");
      }
    }
  };

  const placeholderExamples = [
    "What is the capital of France?",
    "Explain the theory of relativity in simple terms.",
    "Write a short story about a robot who discovers music.",
    "Translate 'hello world' to Spanish.",
  ];

  return (
    <Dialog open={dialogOpen} onOpenChange={(open) => onDialogOpen(open)}>
      <DialogTrigger asChild>
        <Button>
          <PlayIcon />
          Run Agent
        </Button>
      </DialogTrigger>
      {dialogOpen && agentDetail && (
        <DialogContent className="!max-w-[90vw]">
          <DialogHeader>
            <DialogTitle>Run {agentDetail.name} Testbed Agent</DialogTitle>
          </DialogHeader>
          {(agentDetail?.prompt !== systemPrompt ||
            agentDetail?.model !== model) && (
            <div className="flex items-center justify-between text-sm bg-red-200 px-4 py-2 rounded">
              <span>
                Note: You have modified the prompt or model. The agent will use
                the modified prompt and model.
              </span>

              <Button size="sm" onClick={savePromptOrModel}>
                Save changes
              </Button>
            </div>
          )}

          {displayEvents.length === 0 ? (
            <>
              <form
                onSubmit={onSubmit}
                className="flex flex-col gap-4 !h-[60vh]"
              >
                <div className="order-4">
                  <p className="text-sm text-gray-600 py-2">Prompt</p>
                  <div className="flex relative gap-2">
                    <ChatInput
                      value={input}
                      onChange={(e) => {
                        setInput(e.target.value);
                      }}
                      onKeyDown={onKeyDown}
                      className="min-h-12 bg-background shadow-none"
                      disabled={isGenerating}
                      animatedPlaceholderExamples={placeholderExamples}
                    />
                    <Button
                      className="absolute top-1/2 right-2 transform  -translate-y-1/2"
                      type="submit"
                      size="icon"
                      disabled={!input}
                    >
                      <PaperAirplaneIcon />
                    </Button>
                  </div>
                </div>
                <div className="flex flex-col">
                  <div className="text-sm text-gray-500 py-2 rounded-full">
                    Model
                  </div>
                  <Select value={model} onValueChange={setModel}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a model" />
                    </SelectTrigger>
                    <SelectContent>
                      {modelList.map((model) => (
                        <SelectItem key={model} value={model}>
                          {model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grow flex flex-col">
                  <div className="text-sm text-gray-500 py-2 rounded-full">
                    System prompt
                  </div>
                  <Textarea
                    name="system_prompt"
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    className="grow max-h-[16em]"
                  />
                </div>
              </form>
            </>
          ) : (
            <>
              <ChatMessageList className="!h-[60vh]">
                {agentInstance &&
                  displayEvents.map((event) => {
                    return <TestbedAgentEvent event={event} key={event.id} />;
                  })}
              </ChatMessageList>

              <form className="flex relative gap-2" onSubmit={onSubmit}>
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
                  >
                    <StopIcon />
                  </Button>
                )}
              </form>
            </>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button
                onClick={(e) => {
                  stopGeneration(e);
                  setDialogOpen(false);
                }}
              >
                Close
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
