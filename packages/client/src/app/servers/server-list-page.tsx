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

import PageTitle from "@/components/page-title";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import SearchBox from "@/components/search-box";
import { DocumentPlusIcon } from "@heroicons/react/16/solid";
import { schemas } from "aloha-shared";
import { useState } from "react";
import { useNavigate } from "react-router";
import { useService } from "../../hooks/use-service";
import { getServersList } from "../../services/servers";
import MCPServerEditDialog from "./server-edit-dialog";
import { WithErrors } from "@/services/utils";
import Loading from "@/components/loading";
import { Cable } from "lucide-react";
import { TagsList } from "@/components/tags-list";

const PING_TIMEOUT = 3000;

type ServerItem =
  | schemas.MCPServerOptionsWithId
  | WithErrors<schemas.MCPServerOptionsWithId>;

const serverPredicate = (c: ServerItem, search: string) => {
  if ("isError" in c) return true;
  return search
    .toLowerCase()
    .split(" ")
    .some(
      (f) =>
        c.name.toLowerCase().includes(f) ||
        !!c.description?.toLowerCase().includes(f) ||
        !!c.tags?.some((t) => t.toLowerCase().includes(f))
    );
};

export default function MCPServersListPage() {
  const [isLoading, servers, , reloadServer] = useService<ServerItem[]>(
    getServersList,
    [],
    [],
    [],
    PING_TIMEOUT
  );

  const [filteredServers, setFilteredServers] = useState<ServerItem[] | null>(
    null
  );

  const navigate = useNavigate();

  const displayedServers = filteredServers ?? servers;

  return (
    <div className="max-w-8xl mx-auto" data-testid="server-list-page-witness">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-6">
          <PageTitle className="text-2xl font-bold text-gray-900">
            MCP Servers
          </PageTitle>
          <MCPServerEditDialog
            serverId={undefined}
            trigger={
              <Button>
                <DocumentPlusIcon />
                New Server
              </Button>
            }
            onAccept={async () => reloadServer()}
          />
        </div>

        {/* Search and Filter */}
        <SearchBox
          items={servers}
          predicate={serverPredicate}
          onFilter={setFilteredServers}
          placeholder="Search servers by name, description, or tags..."
        />
      </div>
      {isLoading && <Loading message="Loading servers..."></Loading>}
      {/* Server Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {!isLoading &&
          displayedServers.map((server) => (
            <Card
              key={server.id}
              onClick={() => navigate(`/servers/${server.id}`)}
              className="transform hover:scale-105 transition-all duration-200 ease-in-out cursor-pointer bg-white shadow-lg rounded-xl border border-gray-100 hover:shadow-xl flex flex-col h-full"
            >
              <CardHeader className="pb-4">
                <CardTitle className="flex justify-between items-start truncate gap-3">
                  <span className="text-lg font-semibold text-gray-900 truncate min-w-0 flex-1">
                    {server.name}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-gray-600 mb-4 flex-grow">
                {"isError" in server && (
                  <p className="text-red-600 font-medium mb-2">
                    Error: Server issue
                  </p>
                )}
                <p className="line-clamp-3">
                  {server.description || "No description provided"}
                </p>
                <TagsList item={server} inline={true} />
              </CardContent>
              <CardFooter className="border-t border-gray-100 pt-4 mt-auto">
                <div className="flex items-center justify-between w-full text-sm">
                  <div className="flex items-center space-x-3">
                    {server.disabled ? (
                      <div className="text-sm text-gray-600 flex items-center">
                        <span className="w-2 h-2 bg-gray-500 rounded-full mr-2 animate-pulse"></span>
                        Server disabled
                      </div>
                    ) : server.connections && server.connections.length ? (
                      <p className="flex items-center font-bold">
                        <Cable className="w-4 h-4 mr-1" size={16} />
                        {server.connections.length}
                      </p>
                    ) : (
                      <p className="italic">No clients</p>
                    )}
                  </div>
                </div>
              </CardFooter>
            </Card>
          ))}
      </div>

      {/* Empty State */}
      {!isLoading && displayedServers.length === 0 && (
        <div className="text-center py-16 bg-gray-50 rounded-xl">
          <div className="inline-block p-4 bg-white rounded-full shadow-md mb-4">
            <svg
              className="w-12 h-12 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              ></path>
            </svg>
          </div>
          <h3 className="text-xl font-medium text-gray-900 mb-2">
            No servers found
          </h3>
          <p className="text-gray-500 mb-6">
            {filteredServers &&
            filteredServers.length === 0 &&
            servers.length > 0
              ? "No servers match your search criteria"
              : "There are no servers available at the moment"}
          </p>
          <MCPServerEditDialog
            serverId={undefined}
            trigger={
              <Button>
                <DocumentPlusIcon />
                New Server
              </Button>
            }
            onAccept={async () => reloadServer()}
          />
        </div>
      )}
    </div>
  );
}
