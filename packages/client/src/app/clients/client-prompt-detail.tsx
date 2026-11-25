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
import { Combobox } from "@/components/ui/combobox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useCompletionState } from "@/hooks/use-completion-state";
import JsonView from "@/mcp-inspector/JsonView";
import { sendMCPClientRequest } from "@/services/clients";
import { exceptionToMessage } from "@/utils/type-utils";
import { GetPromptResult, Prompt, PromptReference, ResourceTemplateReference } from "@modelcontextprotocol/client";
import { CompleteResultSchema, GetPromptResultSchema } from "@modelcontextprotocol/core";
import { DocumentTextIcon } from "@heroicons/react/24/solid";
import { useCallback, useMemo, useState } from "react";

type Props = {
  prompt: Prompt;
  clientId: string;
  disabled: boolean;
};

export default function MCPClientPromptDetail({
  prompt,
  clientId,
  disabled,
}: Props) {
  const [completionsSupported, setCompletionsSupported] = useState(true);
  const [promptArgs, setPromptArgs] = useState<Record<string, string>>({});
  const [resourceContent, setResourceContent] =
    useState<GetPromptResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [newSessionCreated, setNewSessionCreated] = useState<
    boolean | undefined
  >(undefined);

  const handleCompletion = useCallback(
    async (
      ref: ResourceTemplateReference | PromptReference,
      argName: string,
      value: string
    ): Promise<string[]> => {
      if (!completionsSupported) {
        return [];
      }

      try {
        const response = await sendMCPClientRequest(
          clientId,
          {
            method: "completion/complete",
            params: {
              argument: {
                name: argName,
                value,
              },
              ref,
            },
          },
          CompleteResultSchema
        );
        return response?.response.completion.values || [];
      } catch (e: unknown) {
        console.error(e);
        setCompletionsSupported(false);
        return [];
      }
    },
    [completionsSupported, clientId]
  );

  const { completions, clearCompletions, requestCompletions } =
    useCompletionState(handleCompletion, completionsSupported);

  const handleInputChange = useCallback(
    async (argName: string, value: string) => {
      setPromptArgs((prev) => ({ ...prev, [argName]: value }));

      if (prompt) {
        requestCompletions(
          {
            type: "ref/prompt",
            name: prompt.name,
          },
          argName,
          value
        );
      }
    },
    [prompt, requestCompletions]
  );
  const readResource = useCallback(
    async (name: string, args: Record<string, string>) => {
      try {
        const response = await sendMCPClientRequest(
          clientId,
          {
            method: "prompts/get" as const,
            params: { name, arguments: args },
          },
          GetPromptResultSchema
        );
        setResourceContent(response.response);
        setNewSessionCreated(response.newSessionCreated);
      } catch (err) {
        console.log(err);
        setErrorMessage(exceptionToMessage(err));
        setResourceContent(null);
        setNewSessionCreated(undefined);
      }
    },
    [clientId]
  );

  const onOpenChange = (opening: boolean) => {
    setOpen(opening);
    if (opening) {
      setPromptArgs({});
      clearCompletions();
      setErrorMessage("");
      setNewSessionCreated(undefined);
    } else {
      setResourceContent(null);
    }
  };

  const resourceDescription: string[] = useMemo(() => {
    const desc = [];
    if (prompt.description) {
      desc.push(prompt.description);
    }

    if (prompt.arguments) {
      desc.push(
        "Arguments: " +
          prompt.arguments.map((e) =>
            [e.name, e.required || false, e.description]
              .filter((e) => e !== undefined)
              .join(", ")
          )
      );
    }
    return desc;
  }, [prompt.arguments, prompt.description]);

  return (
    <Dialog onOpenChange={onOpenChange}>
      <DialogTrigger asChild disabled={disabled}>
        <Button variant="outline">
          <DocumentTextIcon /> Get Prompt
        </Button>
      </DialogTrigger>
      {open && (
        <>
          <DialogContent className="min-w-[80vw]">
            <DialogHeader>
              <DialogTitle>Resource {prompt.name}</DialogTitle>
              <DialogDescription>
                {resourceDescription.join(", ")}
              </DialogDescription>
            </DialogHeader>
            {prompt.arguments?.map((arg) => (
              <div key={arg.name}>
                <Label htmlFor={arg.name} className="mb-2">
                  {arg.name}
                </Label>
                <Combobox
                  id={arg.name}
                  placeholder={`Enter ${arg.name}`}
                  value={promptArgs[arg.name] || ""}
                  onChange={(value) => handleInputChange(arg.name, value)}
                  onInputChange={(value) => handleInputChange(arg.name, value)}
                  options={completions[arg.name] || []}
                />

                {arg.description && (
                  <p className="text-xs text-gray-500 mt-2">
                    {arg.description}
                    {arg.required && (
                      <span className="text-xs mt-1 ml-1">(Required)</span>
                    )}
                  </p>
                )}
              </div>
            ))}
            {resourceContent && (
              <>
                {newSessionCreated !== undefined && (
                  <div className="text-sm text-foreground my-2">
                    {newSessionCreated === true && (
                      <span className="text-green-600">
                        A new session has been created
                      </span>
                    )}
                    {newSessionCreated === false && (
                      <span className="text-amber-600">
                        A previous session has been reused
                      </span>
                    )}
                  </div>
                )}
                <JsonView data={resourceContent}></JsonView>
              </>
            )}
            {errorMessage ? (
              <>
                <span className="text-red-600 font-semibold">Error</span>
                <div>{errorMessage}</div>
              </>
            ) : (
              <div>No resouce content</div>
            )}
            <DialogFooter>
              <Button
                className="mr-2"
                onClick={() => readResource(prompt.name, promptArgs)}
              >
                <DocumentTextIcon /> Get Prompt
              </Button>
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  Close
                </Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </>
      )}
    </Dialog>
  );
}
