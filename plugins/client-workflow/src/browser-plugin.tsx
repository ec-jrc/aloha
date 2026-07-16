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
import { Button } from "@aloha-ui-components/ui/button";
import { Input } from "@aloha-ui-components/ui/input";
import { Label } from "@aloha-ui-components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@aloha-ui-components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@aloha-ui-components/ui/select";
import {
  UIChangeOperation,
  UIPluginDefinition,
  UISlotChange,
} from "@aloha-ui-plugins/definitions/ui-slot-plugin";

import { getPluginRoute } from "@aloha-ui-plugins/plugin-utils";

import { PencilIcon, Workflow } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { PLUGIN_ID } from "./id";
import "./plugin.css";
import {
  ClientWorkflowPluginExtra,
  ClientWorkflowState,
  ItemType,
} from "./types";
import { notifyError } from "./utils";

type ClientWorkflowContext = {
  readonly: boolean;
  itemId: string;
  type: ItemType;
  afterSave: () => Promise<void>;
};

function ClientStateSelector({
  readonly,
  itemId,
  type,
  afterSave,
}: ClientWorkflowContext) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedState, setSelectedState] = useState<
    ClientWorkflowState | undefined
  >();
  const [publishedLink, setPublishedLink] = useState("");
  const [verifiedLink, setVerifiedLink] = useState("");

  const [clientState, setClientState] = useState<
    ClientWorkflowState | undefined
  >();

  console.log("Item state", clientState);

  useEffect(() => {
    async function loadState() {
      console.log("Loading item state", itemId);
      const result = await fetch(
        getPluginRoute(PLUGIN_ID, `/state/${type}/${itemId}`)
      );
      if (!result.ok) {
        await notifyError(
          result,
          `Unable to load the state for item ${itemId}`
        );
        return;
      }

      const extra = (await result.json()) as ClientWorkflowPluginExtra;
      console.log("Extra for item " + itemId, extra);

      if (extra.state) {
        console.log("Set extra state", extra.state);
        setClientState(extra.state);
        setSelectedState(extra.state);
        setPublishedLink(extra.publishedLink ?? "");
        setVerifiedLink(extra.verifiedLink ?? "");
      }
    }
    if (itemId) {
      void loadState();
    }
  }, [itemId, dialogOpen]);

  async function handleSave() {
    const result = await fetch(
      getPluginRoute(PLUGIN_ID, `/state/${type}/${itemId}`),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          state: selectedState,
          publishedLink,
          verifiedLink,
        }),
      }
    );

    if (!result.ok) {
      await notifyError(result, "Unable to save the item state");
      return;
    }

    toast.info("State changed successfully");
    setDialogOpen(false);
    void afterSave();
  }

  if (!itemId) {
    return null;
  }

  return (
    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-8 h-8 bg-blue-100 rounded-lg">
          <Workflow className="w-4 h-4 text-blue-600" />
        </div>
        <div>
          <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Item state
          </dt>
          <dd className="text-sm font-medium text-gray-900">{clientState}</dd>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <button
            disabled={readonly}
            className={`ml-auto flex items-center gap-1 px-2 py-2 text-xs font-medium rounded-md transition-colors duration-150 ${readonly ? "bg-gray-100 text-gray-400 cursor-not-allowed" : "bg-blue-100"}`}
          >
            <PencilIcon className="w-3 h-3" />
            Edit
          </button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Item State</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Label>State</Label>
            <Select
              value={selectedState}
              onValueChange={(value) =>
                setSelectedState(value as ClientWorkflowState)
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a item state" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>States</SelectLabel>
                  <SelectItem value="DRAFT">DRAFT</SelectItem>
                  <SelectItem value="PUBLISHED">PUBLISHED</SelectItem>
                  <SelectItem value="VERIFIED">VERIFIED</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>

            {selectedState === "PUBLISHED" && (
              <>
                <Label>Published link</Label>
                <Input
                  placeholder="Published link"
                  value={publishedLink}
                  onChange={(e) => setPublishedLink(e.target.value)}
                />
              </>
            )}

            {selectedState === "VERIFIED" && (
              <>
                <Label>Verified link</Label>
                <Input
                  placeholder="Verified link"
                  value={verifiedLink}
                  onChange={(e) => setVerifiedLink(e.target.value)}
                />
              </>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={() => void handleSave()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default class PluginWorkflowClientUI implements UIPluginDefinition {
  id = PLUGIN_ID;
  getUiSlotChanges = (
    context: ClientWorkflowContext | null
  ): Partial<Record<string, UISlotChange[]>> => {
    return {
      "client-workflow-slot": [
        {
          op: UIChangeOperation.Insert,
          widget: {
            id: "client-state-selector",
            priority: 50,
            content: (
              <div className="">
                <ClientStateSelector
                  type={context?.type}
                  readonly={context?.readonly}
                  itemId={context?.itemId}
                  afterSave={context?.afterSave}
                />
              </div>
            ),
          },
        },
      ],
    };
  };
}
