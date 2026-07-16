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
import { CreatorAndVisibilityEditor } from "@/components/creator-and-visibility-editor";
import Loading from "@/components/loading";
import PageTitle from "@/components/page-title";
import { ScrollableUrl } from "@/components/scrollable-url";
import { TagsList } from "@/components/tags-list";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { usePermissionChecker } from "@/hooks/use-permission-checker";
import { useService } from "@/hooks/use-service";
import { getAllGenericConnections } from "@/services/testbed-agents";
import { exceptionToMessage } from "@/utils/type-utils";
import { ExclamationTriangleIcon, TrashIcon } from "@heroicons/react/16/solid";
import { schemas } from "aloha-shared";
import { Pencil } from "lucide-react";
import { useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import {
  connectClientToServer,
  deleteServer,
  disconnectClientFromServer,
  getServerDetail,
  setServerCreator,
  setServerVisibility,
} from "../../services/servers";
import MCPServerEditDialog from "./server-edit-dialog";

const PING_TIMEOUT = 5000;

const EditDialog = ({
  disabled,
  id,
  refreshServer,
}: {
  disabled: boolean;
  id: string;
  refreshServer: () => void;
}) => {
  return (
    <MCPServerEditDialog
      serverId={id}
      trigger={
        <Button disabled={disabled}>
          <Pencil /> Edit Server
        </Button>
      }
      onAccept={async () => {
        refreshServer();
      }}
    ></MCPServerEditDialog>
  );
};
export default function MCPServerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [isServerLoading, serverDetail, , refreshServer] = useService(
    (id) => getServerDetail(id),
    [id],
    null,
    [id],
    PING_TIMEOUT
  );

  const [isConnectionLoading, allConnections] = useService(
    () => getAllGenericConnections(id, true, true, false),
    [id],
    [],
    []
  );

  const loading = useMemo(
    () => isConnectionLoading || isServerLoading,
    [isConnectionLoading, isServerLoading]
  );

  const permissionChecker = usePermissionChecker();

  const isTheUserTheOwner = useMemo(() => {
    return permissionChecker.hasOwnership(serverDetail);
  }, [serverDetail, permissionChecker]);

  const navigate = useNavigate();

  const associateClient = useCallback(
    async (clientId: string) => {
      if (!isTheUserTheOwner) {
        return;
      }

      if (id) {
        try {
          await connectClientToServer(id, clientId);
          refreshServer();
        } catch (err) {
          console.error(err);
          toast.error("Failed to fetch connection list");
        }
      }
    },
    [id, refreshServer, isTheUserTheOwner]
  );

  const dissociateClient = useCallback(
    async (clientId: string) => {
      if (!isTheUserTheOwner) {
        return;
      }

      if (id) {
        try {
          await disconnectClientFromServer(id, clientId);
          refreshServer();
        } catch (err) {
          console.error(err);
          toast.error("Failed to fetch connection list");
        }
      }
    },
    [id, refreshServer, isTheUserTheOwner]
  );

  if (loading) {
    return <Loading message="Loading server details..." />;
  }

  if (!id || !serverDetail) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <ExclamationTriangleIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Server Not Found
          </h2>
          <p className="text-gray-600">
            The requested server could not be found.
          </p>
        </div>
      </div>
    );
  }

  const serverConnections = serverDetail.connectionsDetail || [];
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

  async function doDeleteServer() {
    try {
      await deleteServer(id!);
      void navigate(`/servers`);
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
            <PageTitle className="mb-2">{serverDetail.name}</PageTitle>
            {serverDetail.description && (
              <p className="text-gray-600 text-lg leading-relaxed max-w-3xl">
                {serverDetail.description}
              </p>
            )}
          </div>
          <div className="flex flex-shrink-0 gap-2 sm:ml-6 self-start">
            <ConfirmDialog
              onClick={() => {
                return doDeleteServer();
              }}
            >
              <Button variant="destructive" disabled={!isTheUserTheOwner}>
                <TrashIcon />
                Delete Server
              </Button>
            </ConfirmDialog>
            <EditDialog
              disabled={!isTheUserTheOwner}
              id={id}
              refreshServer={refreshServer}
            ></EditDialog>
          </div>
        </div>

        {"isError" in serverDetail && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-start">
              <ExclamationTriangleIcon className="w-5 h-5 text-red-500 mt-0.5 mr-3 flex-shrink-0" />
              <div>
                <h3 className="font-medium text-red-800 mb-1">Server Error</h3>
                <p className="text-red-700">
                  There is an error with this server:{" "}
                  <span className="font-mono italic">{serverDetail.error}</span>
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
            {/* Server Path */}
            <TagsList item={serverDetail} inline={false} />
            <div className="space-y-2 py-4">
              <dt className="text-sm font-semibold uppercase tracking-wide">
                Server Urls
              </dt>

              <ScrollableUrl
                url={`${window.location.origin}/api/mcp/${serverDetail.serverPath}/mcp`}
                className="max-w-full"
              />
              <dd className="text-sm text-muted-foreground">
                Use this URL to directly access to all resources available on
                the server
              </dd>
              <ScrollableUrl
                url={`${window.location.origin}/api/mcp/${serverDetail.serverPath}/hub`}
                className="max-w-full mt-4"
              />
              <dd className="text-sm text-muted-foreground">
                Use this URL to access to discover and invoke tools utilities
              </dd>
              <ScrollableUrl
                url={`${window.location.origin}/api/mcp/${serverDetail.serverPath}/registry/v1`}
                className="max-w-full mt-4"
              />
              <dd className="text-sm text-muted-foreground">
                Use this URL to access to discover the connected A2A clients
              </dd>
            </div>

            <div className="space-y-2 py-4">
              <dt className="text-sm font-semibold uppercase tracking-wide">
                Access Token
              </dt>
              <dd className="text-sm text-gray-600">
                To create an access token, please go to the{" "}
                <a
                  href="/jwt-tokens"
                  className="text-blue-600 hover:text-blue-800"
                >
                  access token page
                </a>
              </dd>
            </div>

            <div className="mt-6">
              {serverDetail.id !== undefined && (
                <CreatorAndVisibilityEditor
                  name="Server"
                  item={
                    serverDetail as schemas.VisibilityInterface &
                      schemas.WithIdBase
                  }
                  setVisibilityService={setServerVisibility}
                  setCreatorService={setServerCreator}
                  onAccept={async () => refreshServer()}
                />
              )}
            </div>
          </div>

          <div className="lg:w-2/3 mt-8 lg:mt-0">
            {serverDetail && serverDetail.disabled && (
              <div className="flex flex-col items-center justify-center h-64 text-gray-400 bg-gray-50/50 rounded-xl border-2 border-dashed border-gray-200">
                <div className="w-12 h-12 mb-4 opacity-40">
                  <svg fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                  </svg>
                </div>
                <p className="text-lg font-medium text-gray-600">
                  Server is disabled
                </p>
                <p className="text-sm text-gray-500 mt-1 text-center">
                  This server has been disabled, enable it to access to
                  available resources, prompts and tools
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <ConnectionAssociationList
        boundConnections={serverConnections}
        boundConnectionsTitle="Associated with Server"
        unboundConnections={unassociatedConnections}
        associateConnection={associateClient}
        dissociateConnection={dissociateClient}
        canOperate={isTheUserTheOwner}
      />
    </div>
  );
}
