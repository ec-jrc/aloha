-- Bring the agents table in line with the clients table.
-- The Agent entity inherits versioningInfo (flattened to versionNumber /
-- versionGroupingUUID), lastOnlineAt and lastOfflineAt from the shared
-- MCPBaseConnectionSchema, but these columns were only ever added to the
-- clients table (v4.0.0-01, v4.0.0-03). Writing an agent with any of these
-- fields populated would otherwise fail with "column does not exist".

ALTER TABLE agents ADD COLUMN IF NOT EXISTS "versionNumber" NUMERIC NULL;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS "versionGroupingUUID" UUID NULL;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS "lastOnlineAt" TIMESTAMP WITH TIME ZONE NULL;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS "lastOfflineAt" TIMESTAMP WITH TIME ZONE NULL;
