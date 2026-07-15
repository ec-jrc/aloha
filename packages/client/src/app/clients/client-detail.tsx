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

import { CreatorAndVisibilityEditor } from "@/components/creator-and-visibility-editor";
import Loading from "@/components/loading";
import { OIDCRegistration } from "@/components/oidc-registration";
import PageTitle from "@/components/page-title";
import { ScrollableUrl } from "@/components/scrollable-url";
import { TagsList } from "@/components/tags-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePermissionChecker } from "@/hooks/use-permission-checker";
import { usePlatformPluginsForSlotId } from "@/hooks/use-platform-plugins";
import { useService } from "@/hooks/useService";
import { UISlot } from "@/plugins/definitions/ui-slot";
import { isWithErrorsObject, WithErrors } from "@/services/utils";
import {
  ChatBubbleOvalLeftEllipsisIcon,
  ClipboardDocumentListIcon,
  DocumentDuplicateIcon,
  ExclamationTriangleIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/16/solid";
import { authentication_strategy, schemas } from "aloha-shared";
import { FileStack } from "lucide-react";
import { useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import {
  createNewClientVersion,
  getAllConnectionVersions,
  getConnectionDetail,
  setConnectionCreator,
  setConnectionVisibility,
} from "../../services/clients";
import MCPClientDeleteDialog from "./client-delete-dialog";
import MCPClientEditDialog from "./client-edit-dialog";
import MCPClientPromptDetail from "./client-prompt-detail";
import MCPClientResourceDetail from "./client-resource-detail";
import MCPClientTool from "./client-tool";

const PING_TIMEOUT = 3000;

function NewVersionDialog({
  client,
}: {
  client:
    | schemas.MCPConnectionOptionsWithId
    | WithErrors<schemas.MCPConnectionOptionsWithId>;
}) {
  const navigate = useNavigate();

  const [loading, allVersions] = useService(
    async (c) => {
      if (c && !isWithErrorsObject(c)) {
        return await getAllConnectionVersions(c.id);
      } else {
        return [] as schemas.MCPBaseConnectionWithId[];
      }
    },
    [client],
    []
  );

  const loadClientDetailPage = useCallback(
    (id: string) => {
      return navigate("/clients/" + id);
    },
    [navigate]
  );

  const createNewVersion = useCallback(async () => {
    try {
      if (!client || isWithErrorsObject(client)) {
        return;
      }
      const clientId = client.id;
      const { id } = await createNewClientVersion(clientId);
      return navigate("/clients/" + id);
    } catch (err: unknown) {
      console.error("Unable to create new client version", err);
      toast.error("Unable to create a new client version");
    }
  }, [client, navigate]);

  if (!client || isWithErrorsObject(client)) {
    return null;
  }

  if (loading) {
    return (
      <Button disabled={true}>
        <FileStack /> Client Versions
      </Button>
    );
  }

  const hasVersions = allVersions.length > 1;

  // if (allVersions.length > 1) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button>
          <FileStack /> Client Versions
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={() => createNewVersion()}>
            New Client Version
          </DropdownMenuItem>
        </DropdownMenuGroup>
        {hasVersions && (
          <DropdownMenuGroup>
            <DropdownMenuSeparator />
            {allVersions.map((v) => {
              return (
                <DropdownMenuItem onSelect={() => loadClientDetailPage(v.id)}>
                  Switch to v{v.versioningInfo!.versionNumber}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuGroup>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
  // }

  // return (
  //   <ConfirmDialog
  //     onClick={() => createNewVersion()}
  //     message={`Do you want to create a new version of this client?`}
  //     title="New client version"
  //   >
  //     <Button disabled={operating}>
  //       <FileStack /> {operating ? "Please wait..." : "New Client Version"}
  //     </Button>
  //   </ConfirmDialog>
  // );
}

export default function MCPClientDetailsPage() {
  const { id } = useParams();

  const [loading, connection, , forceFetch] = useService(
    getConnectionDetail,
    [id],
    null,
    [],
    PING_TIMEOUT
  );

  const permissionChecker = usePermissionChecker();

  const clientWorkflowPlugins = usePlatformPluginsForSlotId(
    "client-workflow-slot"
  );

  const isAdministrator = useMemo(() => {
    return permissionChecker.isAdministrator();
  }, [permissionChecker]);

  const canTheUserOperateOnWorkflow = useMemo(
    () =>
      permissionChecker.has(
        authentication_strategy.Permissions.ManageWorkflows
      ),
    [permissionChecker]
  );

  const isTheUserTheConnectionOwner = useMemo(() => {
    return permissionChecker.hasOwnership(connection);
  }, [connection, permissionChecker]);

  const isClientCallable = useMemo(() => {
    return (
      !isWithErrorsObject(connection) &&
      permissionChecker.hasVisibility(connection)
    );
  }, [connection, permissionChecker]);

  const tabCounts = useMemo(
    () => ({
      tools: connection?.tools?.length || 0,
      resources: connection?.resources?.length || 0,
      templates: connection?.resourceTemplates?.length || 0,
      prompts: connection?.prompts?.length || 0,
    }),
    [connection]
  );

  const hasTabsContent = useMemo(
    () => Object.values(tabCounts).some((count) => count > 0),
    [tabCounts]
  );

  const workflowSlotContext = useMemo(
    () => ({
      readonly: !canTheUserOperateOnWorkflow,
      clientId: id,
      afterSave: async () => forceFetch(),
    }),
    [id, forceFetch, canTheUserOperateOnWorkflow]
  );

  if (loading) {
    return <Loading message="Loading client details..." />;
  }

  if (!connection) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <ExclamationTriangleIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Client Not Found
          </h2>
          <p className="text-gray-600 mb-6">
            The requested MCP client could not be found.
          </p>
          <MCPClientDeleteDialog
            disabled={!isAdministrator}
            client={{
              id,
              isError: true,
              error: "Client error",
              name: "delete",
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="">
      {/* Header Section */}
      <div className="">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-6 gap-4">
          <div className="flex-1 min-w-0">
            <PageTitle
              className="flex gap-6 items-center"
              isConnected={connection.isConnected}
              isDisabled={connection.disabled}
              lastOnlineAt={connection.lastOnlineAt}
              lastOfflineAt={connection.lastOfflineAt}
            >
              {connection.name}

              {connection.versioningInfo && (
                <span className="ml-2 text-muted-foreground">
                  v{connection.versioningInfo.versionNumber}
                </span>
              )}
            </PageTitle>
            {connection.description && (
              <p className="text-gray-600 text-lg leading-relaxed max-w-3xl">
                {connection.description}
              </p>
            )}
          </div>
          <div className="flex flex-shrink-0 gap-2 sm:ml-6 self-start">
            <MCPClientDeleteDialog
              client={connection}
              disabled={!isTheUserTheConnectionOwner}
            />

            <NewVersionDialog client={connection} />

            <MCPClientEditDialog
              client={connection}
              disabled={!isTheUserTheConnectionOwner}
            />
          </div>
        </div>

        {"isError" in connection && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-start">
              <ExclamationTriangleIcon className="w-5 h-5 text-red-500 mt-0.5 mr-3 flex-shrink-0" />
              <div>
                <h3 className="font-medium text-red-800 mb-1">
                  Client Connection Error
                </h3>
                <p className="text-red-700">
                  There is an error with this client:{" "}
                  <span className="font-mono italic">{connection.error}</span>
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

      {/* Client Information & Configuration */}
      <div className="rounded-xl my-8">
        <div className="lg:flex gap-12">
          {/* Configuration Panel */}
          <div className="lg:w-1/3">
            <TagsList item={connection} inline={false} />
            <div className="space-y-2">
              <dt className="text-sm font-semibold uppercase tracking-wide">
                Server URL
              </dt>
              <ScrollableUrl
                url={connection.serverUrl}
                className="max-w-full"
              />
            </div>
            {connection.isConnected && (
              <div className="space-y-2 mt-6">
                <dt className="text-sm font-semibold uppercase tracking-wide mb-2">
                  Session state support
                </dt>
                {connection.isStateful ? (
                  <div className="flex items-center">
                    The client is
                    <span
                      data-testid="state-witness"
                      className="ml-2 inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium bg-sky-50 text-sky-700"
                    >
                      <span className="w-2 h-2 mr-1.5 rounded-full bg-sky-500" />
                      stateful
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center">
                    The client is
                    <span
                      data-testid="state-witness"
                      className="ml-2 inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium bg-emerald-100 text-emerald-600"
                    >
                      <span className="w-2 h-2 mr-1.5 rounded-full bg-emerald-400" />
                      stateless
                    </span>
                  </div>
                )}
              </div>
            )}
            <div className="mt-6">
              {connection.id !== undefined && (
                <OIDCRegistration item={connection}></OIDCRegistration>
              )}
            </div>
            <div className="mt-6">
              {connection.id !== undefined && (
                <CreatorAndVisibilityEditor
                  name="Client"
                  item={
                    connection as schemas.VisibilityInterface &
                      schemas.WithIdBase
                  }
                  setVisibilityService={setConnectionVisibility}
                  setCreatorService={setConnectionCreator}
                  onAccept={() => new Promise(() => forceFetch())}
                />
              )}
            </div>
            {connection.id !== undefined &&
              clientWorkflowPlugins.length > 0 && (
                <div className="space-y-4 mt-6">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                      Client Workflow
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
          {/* Content Area */}
          <div className="lg:w-2/3 mt-8 lg:mt-0">
            {connection.id && connection.isConnected && hasTabsContent ? (
              <>
                <Tabs
                  defaultValue={
                    Object.keys(tabCounts).find(
                      (tName) => tabCounts[tName as keyof typeof tabCounts] > 0
                    ) || "tools"
                  }
                  className="w-full"
                >
                  <TabsList className="flex w-full md:grid md:grid-cols-4 gap-1 bg-gray-200 rounded-lg h-11 px-2 overflow-x-auto md:overflow-visible">
                    {tabCounts.tools > 0 && (
                      <TabsTrigger
                        value="tools"
                        className="data-[state=active]:bg-gray-50 h-8 duration-0 flex-shrink-0 md:flex-shrink"
                      >
                        <WrenchScrewdriverIcon className="w-4 h-4 mr-1" />
                        Tools
                        <Badge variant="secondary" className="ml-2 bg-gray-300">
                          {tabCounts.tools}
                        </Badge>
                      </TabsTrigger>
                    )}
                    <TabsTrigger
                      value="resources"
                      className="data-[state=active]:bg-gray-50 h-8 duration-0 flex-shrink-0 md:flex-shrink"
                    >
                      <DocumentDuplicateIcon className="w-4 h-4 mr-1" />
                      Resources
                      <Badge variant="secondary" className="ml-2 bg-gray-300">
                        {tabCounts.resources}
                      </Badge>
                    </TabsTrigger>
                    <TabsTrigger
                      value="templates"
                      className="data-[state=active]:bg-gray-50 h-8 duration-0 flex-shrink-0 md:flex-shrink"
                    >
                      <ClipboardDocumentListIcon className="w-4 h-4 mr-1" />
                      Templates
                      <Badge variant="secondary" className="ml-2 bg-gray-300">
                        {tabCounts.templates}
                      </Badge>
                    </TabsTrigger>
                    <TabsTrigger
                      value="prompts"
                      className="data-[state=active]:bg-gray-50 h-8 duration-0 flex-shrink-0 md:flex-shrink"
                    >
                      <ChatBubbleOvalLeftEllipsisIcon className="w-4 h-4 mr-1" />
                      Prompts
                      <Badge variant="secondary" className="ml-2 bg-gray-300">
                        {tabCounts.prompts}
                      </Badge>
                    </TabsTrigger>
                  </TabsList>
                  {tabCounts.resources > 0 && (
                    <TabsContent value="resources" className="mt-0">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {connection.resources?.map((r, index) => (
                          <Card
                            key={r.name}
                            className="transform hover:scale-105 transition-all duration-200 ease-in-out cursor-pointer bg-white shadow-lg rounded-xl border border-gray-100 hover:shadow-xl"
                            style={{
                              animationDelay: `${index * 50}ms`,
                              animation: "fadeInUp 0.3s ease-out forwards",
                            }}
                          >
                            <CardHeader className="pb-3">
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 bg-blue-500 rounded-full flex-shrink-0"></div>
                                <CardTitle className="text-base font-semibold text-gray-900">
                                  {r.name}
                                </CardTitle>
                              </div>
                            </CardHeader>
                            <CardContent className="flex-grow text-sm text-gray-600 pb-3">
                              {r.description || (
                                <span className="italic text-gray-400">
                                  No description provided.
                                </span>
                              )}
                            </CardContent>
                            <CardFooter className="pt-0">
                              <MCPClientResourceDetail
                                resource={r}
                                clientId={connection.id!}
                                disabled={!isClientCallable}
                              />
                            </CardFooter>
                          </Card>
                        ))}
                      </div>
                    </TabsContent>
                  )}

                  {tabCounts.templates > 0 && (
                    <TabsContent value="templates" className="mt-0">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {connection.resourceTemplates?.map((r, index) => (
                          <Card
                            key={r.name}
                            className="transform hover:scale-105 transition-all duration-200 ease-in-out cursor-pointer bg-white shadow-lg rounded-xl border border-gray-100 hover:shadow-xl"
                            style={{
                              animationDelay: `${index * 50}ms`,
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
                            <CardContent className="flex-grow text-sm text-gray-600 pb-3 truncate">
                              {r.description || (
                                <span className="italic text-gray-400">
                                  No description provided.
                                </span>
                              )}
                            </CardContent>
                            <CardFooter className="pt-0">
                              <MCPClientResourceDetail
                                resource={r}
                                clientId={connection.id!}
                                disabled={!isClientCallable}
                              />
                            </CardFooter>
                          </Card>
                        ))}
                      </div>
                    </TabsContent>
                  )}

                  {tabCounts.prompts > 0 && (
                    <TabsContent value="prompts" className="mt-0">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {connection.prompts?.map((r, index) => (
                          <Card
                            key={r.name}
                            className="transform hover:scale-105 transition-all duration-200 ease-in-out cursor-pointer bg-white shadow-lg rounded-xl border border-gray-100 hover:shadow-xl"
                            style={{
                              animationDelay: `${index * 50}ms`,
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
                            <CardContent className="flex-grow text-sm text-gray-600 pb-3 truncate">
                              {r.description || (
                                <span className="italic text-gray-400">
                                  No description provided.
                                </span>
                              )}
                            </CardContent>
                            <CardFooter className="pt-0">
                              <MCPClientPromptDetail
                                prompt={r}
                                clientId={connection.id!}
                                disabled={!isClientCallable}
                              />
                            </CardFooter>
                          </Card>
                        ))}
                      </div>
                    </TabsContent>
                  )}

                  {tabCounts.tools > 0 && (
                    <TabsContent value="tools" className="mt-0">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {connection.tools?.map((r, index) => (
                          <Card
                            key={r.name}
                            className="transform hover:scale-105 transition-all duration-200 ease-in-out cursor-pointer bg-white shadow-lg rounded-xl border border-gray-100 hover:shadow-xl"
                            style={{
                              animationDelay: `${index * 50}ms`,
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
                            <CardContent className="flex-grow text-sm text-gray-600 pb-3 truncate">
                              {r.description || (
                                <span className="italic text-gray-400">
                                  No description provided.
                                </span>
                              )}
                            </CardContent>
                            <CardFooter className="pt-0">
                              <MCPClientTool
                                disabled={!isClientCallable}
                                tool={r}
                                clientId={connection.id!}
                              />
                            </CardFooter>
                          </Card>
                        ))}
                      </div>
                    </TabsContent>
                  )}
                </Tabs>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-gray-400 bg-gray-50/50 rounded-xl border-2 border-dashed border-gray-200">
                <div className="w-12 h-12 mb-4 opacity-40">
                  <svg fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                  </svg>
                </div>
                <p className="text-lg font-medium text-gray-600">
                  {!connection.isConnected && !connection.disabled
                    ? "Client is not connected"
                    : !connection.disabled
                      ? "No items available or please wait for the client to connect"
                      : "Client is disabled"}
                </p>
                <p className="text-sm text-gray-500 mt-1 text-center">
                  {!connection.isConnected && !connection.disabled
                    ? "Connect the client to view available resources, prompts, and tools"
                    : !connection.disabled
                      ? "This client doesn't provide any resources, prompts, or tools"
                      : "This client has been disabled, enable it to access to available resources, prompts and tools"}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
