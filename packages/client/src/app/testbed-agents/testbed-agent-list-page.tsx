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
import Loading from "@/components/loading";
import { useService } from "@/hooks/use-service";
import { getTestbedAgentsList } from "@/services/testbed-agents";
import { isWithErrorsObject, WithErrors } from "@/services/utils";
import { DocumentPlusIcon } from "@heroicons/react/16/solid";
import { schemas } from "aloha-shared";
import { useState } from "react";
import { TestbedAgentCard } from "./testbed-agent-card";
import TestbedAgentEditDialog from "./testbed-agent-edit-dialog";

type TestbedAgentItem =
  | schemas.TestbedAgentWithId
  | WithErrors<schemas.TestbedAgentWithId>;

const testbedAgentPredicate = (a: TestbedAgentItem, search: string) => {
  if (isWithErrorsObject(a)) return true;
  return search
    .toLowerCase()
    .split(" ")
    .some(
      (f) =>
        a.name?.toLowerCase().includes(f) ||
        !!a.description?.toLowerCase().includes(f)
    );
};

export default function TestbedAgentsListPage() {
  const [reloadAgents, setReloadAgents] = useState(1);

  const [isLoading, agents] = useService<TestbedAgentItem[]>(
    () => getTestbedAgentsList(),
    [],
    [],
    [reloadAgents]
  );
  const [filteredAgents, setFilteredAgents] = useState<
    TestbedAgentItem[] | null
  >(null);

  const displayedAgents = filteredAgents ?? agents;

  return (
    <div
      className="max-w-8xl mx-auto"
      data-testid="testbed-agent-list-page-witness"
    >
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-6">
          <PageTitle className="text-2xl font-bold text-gray-900">
            Testbed Agents
          </PageTitle>
          <TestbedAgentEditDialog
            agentId={undefined}
            trigger={
              <Button>
                <DocumentPlusIcon />
                New Testbed Agent
              </Button>
            }
            onAccept={async () => setReloadAgents(reloadAgents + 1)}
          ></TestbedAgentEditDialog>
        </div>

        {/* Search and Filter */}

        <SearchBox
          items={agents}
          predicate={testbedAgentPredicate}
          onFilter={setFilteredAgents}
          placeholder="Search testbed agents by name or description..."
        />
      </div>

      {isLoading && <Loading message="Loading testbed agents..." />}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {!isLoading &&
          displayedAgents.map((agent) => (
            <TestbedAgentCard key={agent.id} agent={agent} />
          ))}
      </div>
    </div>
  );
}
