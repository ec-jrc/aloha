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
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { usePermissionChecker } from "@/hooks/use-permission-checker";
import { exceptionToMessage } from "@/utils/type-utils";
import { Pencil } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { UserSelect } from "./user-select";

export type CreatorEditDialogProps = {
  name: string;
  objectId: string;
  currentCreatorId?: string;
  setCreatorService: (
    id: string,
    creator: { creator: string }
  ) => Promise<void>;
  onAccept?: () => Promise<void>;
  trigger?: React.ReactNode;
};

export function CreatorEditDialog({
  name,
  objectId,
  currentCreatorId,
  setCreatorService,
  onAccept,
  trigger,
}: CreatorEditDialogProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const permissionChecker = usePermissionChecker();
  const [creatorId, setCreatorId] = useState<string | undefined>(
    currentCreatorId
  );

  async function handleSubmit() {
    if (!creatorId) return;

    try {
      await setCreatorService(objectId, { creator: creatorId });
      setDialogOpen(false);
      if (onAccept) await onAccept();
    } catch (e) {
      toast.error(exceptionToMessage(e));
    }
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger
        asChild
        disabled={
          !(
            permissionChecker.isAdministrator() ||
            (currentCreatorId &&
              permissionChecker.user()?.id === currentCreatorId)
          )
        }
      >
        {trigger ?? (
          <Button>
            <Pencil /> Edit Owner
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit creator of {name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            Select the new creator for this item
          </p>
          <UserSelect
            value={creatorId || ""}
            onChange={(id) => setCreatorId(id)}
            className="w-full"
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setDialogOpen(false)}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
