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
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import JsonView from "@/mcp-inspector/JsonView";
import { sendMCPClientRequest } from "@/services/clients";
import { exceptionToMessage } from "@/utils/type-utils";
import { ReadResourceResultSchema, ResourceSchema, ResourceTemplateSchema } from "@modelcontextprotocol/core";
import { ReadResourceResult, Resource, ResourceTemplateType } from "@modelcontextprotocol/client";
import { DocumentTextIcon } from "@heroicons/react/24/solid";
import { useState } from "react";

type Props = {
  resource: Resource | ResourceTemplateType;
  clientId: string;
  disabled: boolean;
};

export default function MCPClientResourceDetail({
  resource,
  clientId,
  disabled,
}: Props) {
  const [resourceContent, setResourceContent] =
    useState<ReadResourceResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [uriToFill, setUriToFill] = useState<string>("");
  const [newSessionCreated, setNewSessionCreated] = useState<
    boolean | undefined
  >(undefined);

  const readResource = async (uri: string) => {
    try {
      const response = await sendMCPClientRequest(
        clientId,
        {
          method: "resources/read" as const,
          params: { uri },
        },
        ReadResourceResultSchema
      );
      setResourceContent(response.response);
      setNewSessionCreated(response.newSessionCreated);
    } catch (err) {
      console.log(err);
      setErrorMessage(exceptionToMessage(err));
      setResourceContent(null);
      setNewSessionCreated(undefined);
    }
  };
  const onOpenChange = (opening: boolean) => {
    setOpen(opening);
    if (opening) {
      setNewSessionCreated(undefined);
      const resourceTemplate = ResourceTemplateSchema.safeParse(resource);
      const safeResource = ResourceSchema.safeParse(resource);
      if (resourceTemplate.success) {
        setErrorMessage("");
        setUriToFill(resourceTemplate.data.uriTemplate);
      } else if (safeResource.success) {
        void readResource(safeResource.data.uri);
      } else {
        throw Error(`Invalid Resource/ResourceTemplate`);
      }
    } else {
      setResourceContent(null);
    }
  };

  const resourceDescription: string[] = [];
  if (resource.description) {
    resourceDescription.push(resource.description);
  }

  if (resource.mimeType) {
    resourceDescription.push("Mime Type: " + resource.mimeType);
  }

  return (
    <Dialog onOpenChange={onOpenChange}>
      <DialogTrigger asChild disabled={disabled}>
        <Button variant="outline">
          <DocumentTextIcon /> Retrieve Resource
        </Button>
      </DialogTrigger>
      {open && (
        <>
          <DialogContent className="min-w-[80vw]">
            <DialogHeader>
              <DialogTitle>Resource {resource.name}</DialogTitle>
              <DialogDescription>
                {resourceDescription.join(", ")}
              </DialogDescription>
            </DialogHeader>
            {uriToFill && (
              <>
                <Label>Please edit the uri here below</Label>
                <Input
                  value={uriToFill}
                  onChange={(e) => setUriToFill(e.target.value)}
                />
                <Button type="button" onClick={() => readResource(uriToFill)}>
                  <DocumentTextIcon /> Retrieve Resource
                </Button>
              </>
            )}
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
