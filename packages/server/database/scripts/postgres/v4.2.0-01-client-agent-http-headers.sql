ALTER TABLE agents ADD COLUMN "allowedHttpHeaders" JSONB NULL;
ALTER TABLE clients ADD COLUMN "allowedHttpHeaders" JSONB NULL;
