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
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ChatBubbleOvalLeftEllipsisIcon,
  ClipboardDocumentListIcon,
  DocumentDuplicateIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/16/solid";
import { endpoints_schemas } from "aloha-shared";
import { formatDistanceToNow } from "date-fns";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router";
import { getConnectionList } from "../../services/clients";
import MCPClientEditDialog from "./client-edit-dialog";
import { WithErrors } from "@/services/utils";
import { useService } from "@/hooks/useService";
import Loading from "@/components/loading";
import { TagsList } from "@/components/tags-list";
import { CardHeaderConnectionIndicator } from "@/components/card-header-connection-indicator";

const PING_TIMEOUT = 5000;

export default function MCPClientsListPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<string>("");

  const [loading, connections] = useService(
    getConnectionList,
    [],
    null,
    [],
    PING_TIMEOUT
  );

  const filterConnections = useCallback(
    (
      c:
        | endpoints_schemas.MCPConnectionStatus
        | WithErrors<endpoints_schemas.MCPConnectionStatus>
    ) => {
      if (filter.length < 3) return true;
      if ("isError" in c) return true;
      return filter
        .toLowerCase()
        .split(" ")
        .map(
          (f) =>
            c.name.toLowerCase().includes(f) ||
            !!c.description?.toLowerCase().includes(f) ||
            !!c.tags?.some((t) => t.toLowerCase().includes(f))
        )
        .some((f) => f);
    },
    [filter]
  );

  return (
    <div data-testid="client-list-page-witness" className="max-w-8xl mx-auto">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-6">
          <PageTitle className="text-2xl font-bold text-gray-900">
            MCP Clients
          </PageTitle>
          <MCPClientEditDialog disabled={false} client={undefined} />
        </div>

        {/* Search and Filter */}

        <Input
          type="search"
          className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2"
          placeholder="Search clients by name, description, or tags..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      {/* Client Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {!loading &&
          connections &&
          connections.filter(filterConnections).map((c) => (
            <Card
              key={c.id}
              onClick={() => navigate(`/clients/${c.id}`)}
              className="transform hover:scale-105 transition-all duration-200 ease-in-out cursor-pointer bg-white shadow-lg rounded-xl border border-gray-100 hover:shadow-xl flex flex-col h-full"
            >
              <CardHeader className="pb-4">
                <CardTitle className="flex justify-between items-center truncate gap-3">
                  <span className="text-lg font-semibold text-gray-900 truncate min-w-0 flex-1 ">
                    {c.name}
                    {c.versioningInfo && (
                      <span className="ml-2 text-muted-foreground">
                        v{c.versioningInfo.versionNumber}
                      </span>
                    )}
                  </span>
                  <CardHeaderConnectionIndicator value={c} />
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-gray-600 mb-4 flex-grow ">
                {"isError" in c && (
                  <p className="text-red-600 font-medium mb-2">
                    Error: Connection issue
                  </p>
                )}

                <p className="line-clamp-3">
                  {c.description || "No description provided"}
                </p>
                <TagsList item={c} inline={true}></TagsList>
              </CardContent>
              <CardFooter className="border-t border-gray-100 pt-4">
                {c.disabled ? (
                  <div className="text-sm text-gray-600 flex items-center">
                    <span className="w-2 h-2 bg-gray-500 rounded-full mr-2 animate-pulse"></span>
                    Client disabled
                  </div>
                ) : c.isConnected ? (
                  <div className="flex items-center justify-between w-full text-sm">
                    <div className="flex items-center space-x-3">
                      <div className="flex items-center">
                        <WrenchScrewdriverIcon className="w-4 h-4 mr-1" />
                        <span>{c.tools || 0}</span>
                      </div>
                      <div className="flex items-center">
                        <DocumentDuplicateIcon className="w-4 h-4 mr-1" />
                        <span>{c.resources || 0}</span>
                      </div>
                      <div className="flex items-center">
                        <ClipboardDocumentListIcon className="w-4 h-4 mr-1" />
                        <span>{c.resourceTemplates || 0}</span>
                      </div>
                      <div className="flex items-center">
                        <ChatBubbleOvalLeftEllipsisIcon className="w-4 h-4 mr-1" />
                        <span>{c.prompts || 0}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-red-600 flex items-center">
                    <span className="w-2 h-2 bg-red-500 rounded-full mr-2 animate-pulse"></span>
                    Client offline
                    {c.lastOfflineAt && (
                      <span className="ml-1 opacity-75">
                        since {formatDistanceToNow(new Date(c.lastOfflineAt))}
                      </span>
                    )}
                  </div>
                )}
              </CardFooter>
            </Card>
          ))}
      </div>

      {/* Loading State */}
      {loading && <Loading message="Loading clients..." />}

      {/* Empty State */}
      {!loading &&
        connections &&
        connections.filter(filterConnections).length === 0 && (
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
              No clients found
            </h3>
            <p className="text-gray-500 mb-6">
              {filter
                ? "No clients match your search criteria"
                : "There are no clients available at the moment"}
            </p>
            <MCPClientEditDialog disabled={false} client={undefined} />
          </div>
        )}
    </div>
  );
}
