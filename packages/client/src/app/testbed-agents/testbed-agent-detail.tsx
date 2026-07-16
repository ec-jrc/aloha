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

import ConfirmDialog from "@/components/confirm-dialog";
import ConnectionAssociationList from "@/components/connection-association-list";
import Loading from "@/components/loading";
import PageTitle from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { usePermissionChecker } from "@/hooks/use-permission-checker";
import { useService } from "@/hooks/use-service";
import {
  connectClientToTestbedAgent,
  deleteTestbedAgent,
  disconnectClientFromTestbedAgent,
  getAllGenericConnections,
  getTestbedAgentDetail,
} from "@/services/testbed-agents";
import { exceptionToMessage } from "@/utils/type-utils";
import { ExclamationTriangleIcon, TrashIcon } from "@heroicons/react/16/solid";
import { Pencil } from "lucide-react";
import { useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import TestbedAgentEditDialog from "./testbed-agent-edit-dialog";
import TestbedAgentRunDialog from "./testbed-agent-run-dialog";

function EditDialog({
  agentId,
  disabled,
  onAccept,
}: {
  agentId: string;
  disabled: boolean;
  onAccept: () => Promise<void>;
}) {
  return (
    <TestbedAgentEditDialog
      agentId={agentId}
      trigger={
        <Button disabled={disabled} className="mr-2">
          <Pencil /> Edit Testbed Agent
        </Button>
      }
      onAccept={onAccept}
    />
  );
}

export default function TestbedAgentDetailPage() {
  const navigate = useNavigate();
  const permissionCheker = usePermissionChecker();

  const { id } = useParams<{ id: string }>();
  if (!id) {
    throw new Error(`id is required`);
  }

  const [isAgentLoading, agentDetail, , refreshAgent] = useService(
    (id) => getTestbedAgentDetail(id),
    [id],
    null,
    [id]
  );

  const [isConnectionLoading, allConnections] = useService(
    () => getAllGenericConnections(id, true, true, true),
    [id],
    [],
    [id]
  );

  const loading = useMemo(
    () => isConnectionLoading || isAgentLoading,
    [isConnectionLoading, isAgentLoading]
  );

  const isTheUserTheOwner = useMemo(() => {
    return permissionCheker.hasOwnership(agentDetail);
  }, [agentDetail, permissionCheker]);

  const associateClient = useCallback(
    async (clientId: string) => {
      if (!isTheUserTheOwner) {
        return;
      }

      try {
        await connectClientToTestbedAgent(id, clientId);
        refreshAgent();
      } catch (err) {
        console.error(err);
        toast.error("Failed to fetch connection list");
      }
    },
    [id, refreshAgent, isTheUserTheOwner]
  );

  const dissociateClient = useCallback(
    async (clientId: string) => {
      if (!isTheUserTheOwner) {
        return;
      }

      try {
        await disconnectClientFromTestbedAgent(id, clientId);
        refreshAgent();
      } catch (err) {
        console.error(err);
        toast.error("Failed to fetch connection list");
      }
    },
    [id, refreshAgent, isTheUserTheOwner]
  );

  const doDeleteAgent = useCallback(async () => {
    try {
      await deleteTestbedAgent(id);
      void navigate(`/testbed-agents`);
    } catch (e) {
      console.error(e);
      toast.error(exceptionToMessage(e));
    }
  }, [id, navigate]);

  if (loading) {
    return <Loading message="Loading agent details..." />;
  }

  if (!agentDetail) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <ExclamationTriangleIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Agent Not Found
          </h2>
          <p className="text-gray-600">
            The requested testbed agent could not be found.
          </p>
        </div>
      </div>
    );
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

  return (
    <div className="max-w-8xl mx-auto px-4">
      {/* Header Section */}
      <div className="">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-6 gap-4">
          <div className="flex-1 min-w-0">
            <PageTitle className="flex gap-6 items-center">
              {agentDetail.name}
            </PageTitle>
            {agentDetail.description && (
              <p className="text-gray-600 text-lg leading-relaxed max-w-3xl">
                {agentDetail.description}
              </p>
            )}
          </div>
          <div className="flex flex-shrink-0 gap-2 sm:ml-6 self-start">
            <ConfirmDialog
              onClick={() => {
                return doDeleteAgent();
              }}
            >
              <Button
                className="mr-2"
                variant="destructive"
                disabled={!isTheUserTheOwner}
              >
                <TrashIcon />
                Delete Agent
              </Button>
            </ConfirmDialog>
            <EditDialog
              agentId={id}
              disabled={!isTheUserTheOwner}
              onAccept={async () => refreshAgent()}
            />
            <TestbedAgentRunDialog
              agentId={id}
              onAgentChange={async () => {
                refreshAgent();
              }}
            ></TestbedAgentRunDialog>
          </div>
        </div>

        {"isError" in agentDetail && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-start">
              <ExclamationTriangleIcon className="w-5 h-5 text-red-500 mt-0.5 mr-3 flex-shrink-0" />
              <div>
                <h3 className="font-medium text-red-800 mb-1">Agent Error</h3>
                <p className="text-red-700">
                  There is an error with this server:{" "}
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

      <ConnectionAssociationList
        boundConnectionsTitle="Associated with Testbed Agent"
        boundConnections={serverConnections}
        unboundConnections={unassociatedConnections}
        associateConnection={associateClient}
        dissociateConnection={dissociateClient}
        canOperate={isTheUserTheOwner}
      />
    </div>
  );
}
