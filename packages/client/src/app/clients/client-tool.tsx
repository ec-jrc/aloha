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
import { Checkbox } from "@/components/ui/checkbox";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import DynamicJsonForm, {
  DynamicJsonFormRef,
} from "@/mcp-inspector/DynamicJsonForm";
import ToolResults from "@/mcp-inspector/ToolResults";
import { sendMCPClientRequest } from "@/services/clients";
import { JsonSchemaType, JsonValue } from "@/utils/jsonUtils";
import {
  generateDefaultValue,
  isPropertyRequired,
  normalizeUnionType,
  resolveRef,
} from "@/utils/schemaUtils";
import { exceptionToMessage } from "@/utils/type-utils";
import { ClockIcon, PlayIcon } from "@heroicons/react/16/solid";
import {
  CallToolResultSchema,
  CompatibilityCallToolResult,
  CompatibilityCallToolResultSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import React from "react";

type Props = {
  tool: Tool;
  clientId: string;
  disabled: boolean;
};

export default function MCPClientTool({ tool, clientId, disabled }: Props) {
  const [open, setOpen] = React.useState(false);
  const [params, setParams] = React.useState<Record<string, unknown>>({});
  const [isToolRunning, setIsToolRunning] = React.useState(false);
  const [newSessionCreated, setNewSessionCreated] = React.useState<
    boolean | undefined
  >(undefined);
  const [toolResult, setToolResult] =
    React.useState<CompatibilityCallToolResult | null>(null);
  const [descriptionOpen, setDescriptionOpen] = React.useState(false);

  const formRefs = React.useRef<Record<string, DynamicJsonFormRef | null>>({});

  const toolResultRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setToolResult(null);
      // Initialize params with default values from schema
      const newParams = Object.entries(tool.inputSchema.properties ?? []).map(
        ([key, value]) => {
          const resolvedValue = resolveRef(
            value as JsonSchemaType,
            tool.inputSchema as JsonSchemaType
          );
          return [
            key,
            generateDefaultValue(
              resolvedValue,
              key,
              tool.inputSchema as JsonSchemaType
            ),
          ];
        }
      );
      setParams(Object.fromEntries(newParams));
    }
  }, [open, tool]);

  // Function to check if any form has validation errors
  const checkValidationErrors = React.useCallback(
    (validateChildren: boolean = false) => {
      const errors = Object.values(formRefs.current).some(
        (ref) =>
          ref &&
          (validateChildren ? !ref.validateJson().isValid : ref.hasJsonError())
      );
      return errors;
    },
    []
  );

  const renderToolResult = () => {
    if (!toolResult) return null;

    if ("content" in toolResult) {
      const parsedResult = CallToolResultSchema.safeParse(toolResult);
      if (!parsedResult.success) {
        return (
          <>
            <h4 className="font-semibold mb-2">Invalid Tool Result:</h4>
            <ToolResults
              toolResult={toolResult}
              selectedTool={tool}
              resourceContent={{}}
            />
          </>
        );
      }
      return (
        <ToolResults
          toolResult={toolResult}
          selectedTool={tool}
          resourceContent={{}}
        />
      );
    } else if ("toolResult" in toolResult) {
      return (
        <>
          <h4 className="font-semibold mb-2">Tool Result (Legacy):</h4>
          <ToolResults
            toolResult={toolResult}
            selectedTool={tool}
            resourceContent={{}}
          />
        </>
      );
    }
    return null;
  };

  const callTool = async (name: string, params: Record<string, unknown>) => {
    try {
      const response = await sendMCPClientRequest(
        clientId,
        {
          method: "tools/call" as const,
          params: {
            name,
            arguments: params,
          },
        },
        CompatibilityCallToolResultSchema
      );
      setToolResult(response.response);
      setNewSessionCreated(response.newSessionCreated);
    } catch (e) {
      const result: CompatibilityCallToolResult = {
        content: [
          {
            type: "text",
            text: exceptionToMessage(e),
          },
        ],
        isError: true,
      };
      setToolResult(result);
      setNewSessionCreated(false);
    } finally {
      setTimeout(() => {
        if (toolResultRef.current) {
          toolResultRef.current.scrollIntoView({ behavior: "smooth" });
        }
      }, 250);
    }
  };

  return (
    <Dialog
      onOpenChange={(v) => {
        setOpen(v);
        setNewSessionCreated(undefined);
      }}
    >
      <DialogTrigger asChild disabled={disabled}>
        <Button variant="outline">
          <PlayIcon /> Run Tool
        </Button>
      </DialogTrigger>
      {open && (
        <DialogContent className="min-w-[80vw] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Test {tool.name}</DialogTitle>
            <DialogDescription>
              <p>
                {!!tool.description && tool.description.length > 150 ? (
                  <>
                    {descriptionOpen ? (
                      <>
                        {tool.description}{" "}
                        <span
                          className="text-blue-500 hover:text-blue-800 cursor-pointer underline"
                          onClick={() => setDescriptionOpen(false)}
                        >
                          see less
                        </span>
                      </>
                    ) : (
                      <>
                        {tool.description.slice(0, 150)}...{" "}
                        <span
                          className="text-blue-500 hover:text-blue-800 cursor-pointer underline"
                          onClick={() => setDescriptionOpen(true)}
                        >
                          see more
                        </span>
                      </>
                    )}
                  </>
                ) : (
                  tool.description
                )}
              </p>
              <hr className="my-2" />
              <p>Fill the fields here below and press the button "run"</p>
            </DialogDescription>
          </DialogHeader>
          <div className="grow overflow-y-auto">
            {Object.entries(tool.inputSchema.properties ?? []).map(
              ([key, value]) => {
                // First resolve any $ref references
                const resolvedValue = resolveRef(
                  value as JsonSchemaType,
                  tool.inputSchema as JsonSchemaType
                );
                const prop = normalizeUnionType(resolvedValue);
                const inputSchema = tool.inputSchema as JsonSchemaType;
                const required = isPropertyRequired(key, inputSchema);

                return (
                  <div key={key}>
                    <div className="flex justify-between">
                      <Label
                        htmlFor={key}
                        className="block text-sm font-medium text-gray-700"
                      >
                        {key}
                        {required && (
                          <span className="text-red-500 ml-1">*</span>
                        )}
                      </Label>
                      {prop.nullable ? (
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id={`${key}-null`}
                            name={`${key}-null`}
                            checked={params[key] === null}
                            onCheckedChange={(checked: boolean) =>
                              setParams({
                                ...params,
                                [key]: checked
                                  ? null
                                  : prop.type === "array"
                                    ? undefined
                                    : prop.default !== null
                                      ? prop.default
                                      : prop.type === "boolean"
                                        ? false
                                        : prop.type === "string"
                                          ? ""
                                          : prop.type === "number" ||
                                              prop.type === "integer"
                                            ? undefined
                                            : undefined,
                              })
                            }
                          />
                          <label
                            htmlFor={`${key}-null`}
                            className="text-sm font-medium text-gray-700 dark:text-gray-300"
                          >
                            null
                          </label>
                        </div>
                      ) : null}
                    </div>

                    <div
                      role="toolinputwrapper"
                      className={`${prop.nullable && params[key] === null ? "pointer-events-none opacity-50" : ""}`}
                    >
                      {prop.type === "boolean" ? (
                        <div className="flex items-center space-x-2 mt-2">
                          <Checkbox
                            id={key}
                            name={key}
                            checked={!!params[key]}
                            onCheckedChange={(checked: boolean) =>
                              setParams({
                                ...params,
                                [key]: checked,
                              })
                            }
                          />
                          <label
                            htmlFor={key}
                            className="text-sm font-medium text-gray-700 dark:text-gray-300"
                          >
                            {prop.description || "Toggle this option"}
                          </label>
                        </div>
                      ) : prop.type === "string" ? (
                        <Textarea
                          id={key}
                          name={key}
                          placeholder={prop.description}
                          value={
                            params[key] === undefined ? "" : String(params[key])
                          }
                          onChange={(e) =>
                            setParams({
                              ...params,
                              [key]: e.target.value,
                            })
                          }
                          className="mt-1"
                        />
                      ) : prop.type === "object" || prop.type === "array" ? (
                        <div className="mt-1">
                          <DynamicJsonForm
                            ref={(ref) => {
                              formRefs.current[key] = ref;
                            }}
                            schema={{
                              type: prop.type,
                              properties: prop.properties,
                              description: prop.description,
                              items: prop.items,
                            }}
                            value={
                              (params[key] as JsonValue) ??
                              generateDefaultValue(prop)
                            }
                            onChange={(newValue: JsonValue) => {
                              setParams({
                                ...params,
                                [key]: newValue,
                              });
                              // Check validation after a short delay to allow form to update
                              setTimeout(() => checkValidationErrors(), 100);
                            }}
                          />
                        </div>
                      ) : prop.type === "number" || prop.type === "integer" ? (
                        <Input
                          type="number"
                          id={key}
                          name={key}
                          placeholder={prop.description}
                          value={
                            params[key] === undefined ? "" : String(params[key])
                          }
                          onChange={(e) =>
                            setParams({
                              ...params,
                              [key]: Number(e.target.value),
                            })
                          }
                          className="mt-1"
                        />
                      ) : (
                        <div className="mt-1">
                          <DynamicJsonForm
                            ref={(ref) => {
                              formRefs.current[key] = ref;
                            }}
                            schema={{
                              type: prop.type,
                              properties: prop.properties,
                              description: prop.description,
                              items: prop.items,
                            }}
                            value={params[key] as JsonValue}
                            onChange={(newValue: JsonValue) => {
                              setParams({
                                ...params,
                                [key]: newValue,
                              });
                              // Check validation after a short delay to allow form to update
                              setTimeout(() => checkValidationErrors(), 100);
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              }
            )}
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
            <div ref={toolResultRef}>{toolResult && renderToolResult()}</div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              onClick={async () => {
                // Validate JSON inputs before calling tool
                if (checkValidationErrors(true)) return;

                try {
                  setIsToolRunning(true);
                  await callTool(tool.name, params);
                } finally {
                  setIsToolRunning(false);
                }
              }}
              disabled={isToolRunning}
            >
              {isToolRunning ? (
                <>
                  <ClockIcon />
                  Running...
                </>
              ) : (
                <>
                  <PlayIcon />
                  Run Tool
                </>
              )}
            </Button>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Close
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
