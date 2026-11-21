CREATE UNIQUE INDEX "pos_outlets_code_uq" ON "pos_outlets" USING btree ("property_id","code");--> statement-breakpoint
-- Restaurant bills get one series per outlet (GST: each series consecutive). Carry the old shared counter over to each hotel's first outlet.
UPDATE "counters" c
SET "key" = 'posbill:' || o."code" || ':' || substring(c."key" from 9)
FROM (SELECT DISTINCT ON ("property_id") "property_id", "code" FROM "pos_outlets" ORDER BY "property_id", "created_at") o
WHERE o."property_id" = c."property_id" AND c."key" ~ '^posbill:[0-9]{4}-[0-9]{2}$';
