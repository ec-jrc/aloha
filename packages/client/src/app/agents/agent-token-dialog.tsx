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
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { getAgentToken } from "@/services/agents";
import { exceptionToMessage } from "@/utils/type-utils";
import { TagIcon } from "@heroicons/react/16/solid";
import { Dialog } from "@radix-ui/react-dialog";
import { schemas } from "aloha-shared";
import { useState } from "react";
import { toast } from "sonner";

export default function AgentTokenDialog({
  agent,
  disabled,
}: {
  agent: schemas.AgentWithId;
  disabled: boolean;
}) {
  const [tokenFormOpen, setTokenFormOpen] = useState<boolean>(false);
  const [hasAccepted, setHasAccepted] = useState<boolean>(false);
  const [generatingToken, setGeneratingToken] = useState<boolean>(false);
  const [token, setToken] = useState<string>("Generating token...");

  const generateToken = async () => {
    setHasAccepted(true);
    setGeneratingToken(true);
    try {
      const newToken = await getAgentToken(agent.id);
      setToken(newToken.token || "Failed to generate the token");
    } catch (e) {
      setToken("Failed to generate the token");
      toast.error(exceptionToMessage(e));
    }
    setGeneratingToken(false);
  };

  const copyToClipboard = async () => {
    if (token) {
      await navigator.clipboard.writeText(token);
      toast.success("Token copied to clipboard!");
    }
  };

  const downloadToken = () => {
    if (token) {
      const element = document.createElement("a");
      const file = new Blob([token], { type: "text/plain" });
      element.href = URL.createObjectURL(file);
      element.download = "jwt-token.txt";
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
      toast.success("Token downloaded!");
    }
  };

  return (
    <>
      <Dialog open={tokenFormOpen} onOpenChange={setTokenFormOpen}>
        <DialogTrigger asChild disabled={disabled}>
          <Button variant="default" className="mr-2">
            <TagIcon /> Get access token
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Get agent access token</DialogTitle>
            {!hasAccepted && (
              <>
                <div className="my-4">
                  Do you want to create an access token for agent {agent.name}?
                  The token will have 365 days validity.{" "}
                  <b>Existing tokens for this agent will be deleted.</b>
                </div>
                <div className="flex justify-end gap-4 mt-4">
                  <Button
                    variant="secondary"
                    onClick={() => setTokenFormOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="default"
                    onClick={() => generateToken().then(() => {})}
                  >
                    Yes
                  </Button>
                </div>
              </>
            )}
            {hasAccepted && generatingToken && (
              <>
                <p className="text-sm text-gray-600 mt-4">
                  Generating token...
                </p>
              </>
            )}
            {hasAccepted && !generatingToken && token && (
              <div>
                <p className="text-sm whitespace-break-spaces text-wrap break-all max-w-96">
                  {token}
                </p>
                <p className="text-sm text-gray-600 mt-4">
                  This token is not stored on the server. Please save it
                  securely.
                </p>
                <DialogFooter>
                  <div className="mt-4">
                    <Button
                      type="button"
                      variant="secondary"
                      className="mr-2"
                      onClick={() => setTokenFormOpen(false)}
                    >
                      Close
                    </Button>
                    <Button
                      type="button"
                      onClick={copyToClipboard}
                      className="mr-2"
                    >
                      Copy Token
                    </Button>
                    <Button
                      type="button"
                      onClick={downloadToken}
                      className="bg-green-500 text-white  hover:bg-green-600"
                    >
                      Download Token
                    </Button>
                  </div>
                </DialogFooter>
              </div>
            )}
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </>
  );
}
