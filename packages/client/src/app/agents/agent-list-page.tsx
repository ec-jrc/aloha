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
import SearchBox from "@/components/search-box";
import { useService } from "@/hooks/use-service";
import { getAgentsList } from "@/services/agents";
import { WithErrors } from "@/services/utils";
import { DocumentPlusIcon } from "@heroicons/react/16/solid";
import { endpoints_schemas } from "aloha-shared";
import { useState } from "react";
import { AgentCard } from "./agent-card";
import AgentEditDialog from "./agent-edit-dialog";
import Loading from "@/components/loading";

const PING_TIMEOUT = 5000;

type AgentItem =
  | endpoints_schemas.AgentListDetail
  | WithErrors<endpoints_schemas.AgentListDetail>;

const agentPredicate = (a: AgentItem, search: string) => {
  if ("isError" in a && a.isError) return true;
  return search
    .toLowerCase()
    .split(" ")
    .some(
      (f) =>
        a.name?.toLowerCase().includes(f) ||
        !!a.description?.toLowerCase().includes(f) ||
        !!a.tags?.some((t) => t.toLowerCase().includes(f))
    );
};

export default function AgentsListPage() {
  const [isLoading, agents, , forceReloadAgents] = useService<AgentItem[]>(
    () => getAgentsList(),
    [],
    [],
    [],
    PING_TIMEOUT
  );
  const [filteredAgents, setFilteredAgents] = useState<AgentItem[] | null>(
    null
  );

  const displayedAgents = filteredAgents ?? agents;

  return (
    <div className="max-w-8xl mx-auto" data-testid="agents-list-page-witness">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-6">
          <PageTitle className="text-2xl font-bold text-gray-900">
            Agents
          </PageTitle>
          <AgentEditDialog
            agentId={undefined}
            trigger={
              <Button>
                <DocumentPlusIcon />
                New Agent
              </Button>
            }
            onAccept={async () => forceReloadAgents()}
          />
        </div>

        {/* Search and Filter */}
        <SearchBox
          items={agents}
          predicate={agentPredicate}
          onFilter={setFilteredAgents}
          placeholder="Search agents by name, description, or tags..."
        />
      </div>

      {/* Agent Grid */}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {!isLoading &&
          displayedAgents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
      </div>

      {isLoading && <Loading message="Loading agents..." />}
      {/* Empty State */}
      {!isLoading && displayedAgents.length === 0 && (
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
            No agents found
          </h3>
          <p className="text-gray-500 mb-6">
            {filteredAgents && filteredAgents.length === 0 && agents.length > 0
              ? "No agents match your search criteria"
              : "There are no agents available at the moment"}
          </p>
          <AgentEditDialog
            agentId={undefined}
            trigger={
              <Button>
                <DocumentPlusIcon />
                New Agent
              </Button>
            }
            onAccept={async () => forceReloadAgents()}
          />
        </div>
      )}
    </div>
  );
}
