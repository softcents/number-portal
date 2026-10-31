-- Seed 09644 display code for ICON providers
INSERT INTO "display_companies" ("id", "code", "name", "isActive", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), '09644', 'ICON Network - 09644', true, NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;
