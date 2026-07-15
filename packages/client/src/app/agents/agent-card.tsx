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

import { endpoints_schemas } from "aloha-shared";
import { formatDistanceToNow } from "date-fns";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { useNavigate } from "react-router";
import { WithErrors } from "@/services/utils";
import { WrenchScrewdriverIcon } from "@heroicons/react/16/solid";
import { Cable } from "lucide-react";
import { TagsList } from "@/components/tags-list";
import { CardHeaderConnectionIndicator } from "@/components/card-header-connection-indicator";

interface AgentCardProps {
  agent:
    | endpoints_schemas.AgentListDetail
    | WithErrors<endpoints_schemas.AgentListDetail>;
}

export function AgentCard({ agent }: AgentCardProps) {
  const navigate = useNavigate();
  return (
    <Card
      key={agent.id}
      onClick={() => navigate(`/agents/${agent.id}`)}
      className="transform hover:scale-105 transition-all duration-200 ease-in-out cursor-pointer bg-white shadow-lg rounded-xl border border-gray-100 hover:shadow-xl flex flex-col h-full"
    >
      <CardHeader className="pb-4">
        <CardTitle className="flex justify-between items-start truncate gap-3">
          <span className="text-lg font-semibold text-gray-900 truncate min-w-0 flex-1">
            {agent.name}
          </span>
          <CardHeaderConnectionIndicator value={agent} />
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-gray-600 mb-4 flex-grow">
        {"isError" in agent && (
          <p className="text-red-600 font-medium mb-2">
            Error: Connection issue
          </p>
        )}
        <p className="line-clamp-3">
          {agent.description || "No description provided"}
        </p>
        <TagsList item={agent} inline={true} />
      </CardContent>
      <CardFooter className="border-t border-gray-100 pt-4">
        {agent.disabled ? (
          <div className="text-sm text-gray-600 flex items-center">
            <span className="w-2 h-2 bg-gray-500 rounded-full mr-2 animate-pulse"></span>
            Agent disabled
          </div>
        ) : agent.isConnected ? (
          <div className="flex items-center justify-between w-full text-sm">
            <div className="flex items-center space-x-3">
              <WrenchScrewdriverIcon className="w-4 h-4 mr-1" />
              <span>{agent.tools || 0}</span>
              <Cable className="w-4 h-4 mr-1" size={16} />
              <span>{agent.connections?.length || 0}</span>
            </div>
          </div>
        ) : (
          <div className="text-sm text-red-600 flex items-center">
            <span className="w-2 h-2 bg-red-500 rounded-full mr-2 animate-pulse"></span>
            Server offline
            {agent.lastOfflineAt && (
              <span className="ml-1 opacity-75">
                since {formatDistanceToNow(new Date(agent.lastOfflineAt))}
              </span>
            )}
          </div>
        )}
      </CardFooter>
    </Card>
  );
}
