import { schemas } from "aloha-shared";
import { MinusCircleIcon, PlusCircleIcon } from "lucide-react";
import { useState } from "react";

import ConnectionTypeIndicator from "./connection-type-indicator";
import SearchBox from "./search-box";
import { normalizeForSearch } from "@/utils/string-utils";

type ConnectionType = {
  id: string;
  type: string;
  isConnected?: boolean;
  name?: string;
  versioningInfo?: schemas.VersioningInfo;
};
type Props = {
  boundConnections: ConnectionType[];
  boundConnectionsTitle: string;
  unboundConnections: ConnectionType[];
  unboundConnectionsTitle?: string;
  associateConnection: (id: string) => Promise<void>;
  dissociateConnection: (id: string) => Promise<void>;
  canOperate: boolean;
  title?: string;
};

const connectionPredicate = (c: ConnectionType, search: string) =>
  normalizeForSearch(c.name ?? "").includes(normalizeForSearch(search));

export default function ConnectionAssociationList({
  boundConnections,
  boundConnectionsTitle,
  unboundConnections,
  unboundConnectionsTitle = "Available MCP Clients & Agents",
  associateConnection,
  dissociateConnection,
  canOperate,
  title = "MCP Clients & Agents",
}: Props) {
  const [draggingOver, setDraggingOver] = useState(0);
  const [filteredBoundConnections, setFilteredBoundConnections] = useState<
    ConnectionType[] | null
  >(null);
  const [filteredUnboundConnections, setFilteredUnboundConnections] = useState<
    ConnectionType[] | null
  >(null);

  const displayedBoundConnections =
    filteredBoundConnections ?? boundConnections;
  const displayedUnboundConnections =
    filteredUnboundConnections ?? unboundConnections;
  return (
    <div className="rounded-xl my-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-1 h-6 bg-linear-to-b from-blue-500 to-purple-600 rounded-full"></div>
        <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
        <div className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
          Drag & drop to manage associations
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
            <h3 className="font-medium text-gray-700">
              {boundConnectionsTitle}
            </h3>
            <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
              {boundConnections.length}
            </span>
          </div>
          <div
            className={`h-full min-h-40 p-4 rounded-xl border-2 border-dashed transition-all duration-200 ${
              draggingOver === 1
                ? "border-blue-400 bg-blue-50/70 shadow-lg scale-[1.02]"
                : "border-gray-200 bg-gray-50/50 hover:bg-gray-50"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDraggingOver(1);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setDraggingOver(0);
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDraggingOver(0);
              const connectionId = e.dataTransfer.getData("connectionId");
              void associateConnection(connectionId);
            }}
          >
            {boundConnections.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-gray-400">
                <div className="w-8 h-8 mb-2 opacity-40">
                  <svg fill="currentColor" viewBox="0 0 24 24">
                    <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                  </svg>
                </div>
                <p className="text-sm text-gray-500">
                  Drop items here to associate
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="mb-4">
                  <SearchBox
                    items={boundConnections}
                    predicate={connectionPredicate}
                    onFilter={setFilteredBoundConnections}
                  />
                </div>
                {displayedBoundConnections.map((connection, index) => (
                  <div
                    key={connection.id}
                    className={`group flex items-center gap-3 p-3 bg-white rounded-lg border shadow-sm hover:shadow-md transition-all duration-200 ${
                      canOperate
                        ? "cursor-grab active:cursor-grabbing"
                        : "cursor-default"
                    }`}
                    draggable={canOperate}
                    onDragStart={(e) => {
                      e.dataTransfer.setData(
                        "connectionId",
                        connection.id || ""
                      );
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    style={{
                      animationDelay: `${index * 50}ms`,
                      animation: "fadeInUp 0.3s ease-out forwards",
                    }}
                  >
                    <ConnectionTypeIndicator type={connection.type} />

                    <div
                      className={`w-3 h-3 rounded-full shrink-0 shadow-sm ${
                        connection.isConnected
                          ? "bg-emerald-500 shadow-emerald-200"
                          : "bg-red-500 shadow-red-200"
                      }`}
                    >
                      <div
                        className={`w-full h-full rounded-full animate-pulse ${
                          connection.isConnected
                            ? "bg-emerald-400"
                            : "bg-red-400"
                        }`}
                      ></div>
                    </div>

                    <span className="flex-1 font-medium text-gray-900 truncate">
                      {connection.name || "Unknown connection"}
                      {connection.versioningInfo && (
                        <span className="text-muted-foreground italic ml-2">
                          v{connection.versioningInfo.versionNumber}
                        </span>
                      )}
                    </span>

                    {canOperate && (
                      <button
                        onClick={() => dissociateConnection(connection.id)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all duration-150 group-hover:opacity-100"
                        title="Remove association"
                      >
                        <MinusCircleIcon width={18} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
            <h3 className="font-medium text-gray-700">
              {unboundConnectionsTitle}
            </h3>
            <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded-full">
              {unboundConnections.length}
            </span>
          </div>

          <div
            className={`h-full min-h-40 p-4 rounded-xl border-2 border-dashed transition-all duration-200 ${
              draggingOver === 2
                ? "border-gray-400 bg-gray-100 shadow-lg scale-[1.02]"
                : "border-gray-200 bg-gray-50/30 hover:bg-gray-50/50"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDraggingOver(2);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setDraggingOver(0);
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDraggingOver(0);
              const connectionId = e.dataTransfer.getData("connectionId");
              void dissociateConnection(connectionId);
            }}
          >
            {unboundConnections.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-gray-400">
                <div className="w-8 h-8 mb-2 opacity-40">
                  <svg fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                  </svg>
                </div>
                <p className="text-sm">All items are associated</p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="mb-4">
                  <SearchBox
                    items={unboundConnections}
                    predicate={connectionPredicate}
                    onFilter={setFilteredUnboundConnections}
                  />
                </div>
                {displayedUnboundConnections.map((connection, index) => (
                  <div
                    key={connection.id}
                    className={`group flex items-center gap-3 p-3 bg-white rounded-lg border shadow-sm hover:shadow-md transition-all duration-200 ${
                      canOperate
                        ? "cursor-grab active:cursor-grabbing"
                        : "cursor-default"
                    }`}
                    draggable={canOperate}
                    onDragStart={(e) => {
                      e.dataTransfer.setData(
                        "connectionId",
                        connection.id || ""
                      );
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    style={{
                      animationDelay: `${index * 50}ms`,
                      animation: "fadeInUp 0.3s ease-out forwards",
                    }}
                  >
                    <ConnectionTypeIndicator type={connection.type} />

                    <div
                      className={`w-3 h-3 rounded-full shrink-0 shadow-sm ${
                        connection.isConnected
                          ? "bg-emerald-500 shadow-emerald-200"
                          : "bg-red-500 shadow-red-200"
                      }`}
                    >
                      <div
                        className={`w-full h-full rounded-full animate-pulse ${
                          connection.isConnected
                            ? "bg-emerald-400"
                            : "bg-red-400"
                        }`}
                      ></div>
                    </div>

                    <span className="flex-1 font-medium text-gray-900 truncate">
                      {connection.name || "Unknown connection"}
                      {connection.versioningInfo && (
                        <span className="text-muted-foreground italic ml-2">
                          v{connection.versioningInfo.versionNumber}
                        </span>
                      )}
                    </span>

                    {canOperate && (
                      <button
                        onClick={() => associateConnection(connection.id)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-all duration-150 group-hover:opacity-100"
                        title="Associate"
                      >
                        <PlusCircleIcon width={18} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
