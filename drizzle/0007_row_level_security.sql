-- Row-level security: every business table only shows and accepts rows of the hotel stamped on the connection
-- (app.property_id, set by the app's pool for staff requests). With no stamp (worker, webhooks, public booking
-- engine, seed, platform console) everything stays visible, as before. FORCE makes it apply to the table owner,
-- which is the role the app connects as. property_members is left out: sign-in reads a user's hotels across all.
CREATE OR REPLACE FUNCTION app_property_id() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT nullif(current_setting('app.property_id', true), '')::uuid $$;--> statement-breakpoint
ALTER TABLE "activity_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "activity_log" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "activity_log_tenant" ON "activity_log" USING (app_property_id() IS NULL OR property_id = app_property_id()) WITH CHECK (app_property_id() IS NULL OR property_id = app_property_id());--> statement-breakpoint
ALTER TABLE "booking_rooms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "booking_rooms" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "booking_rooms_tenant" ON "booking_rooms" USING (app_property_id() IS NULL OR property_id = app_property_id()) WITH CHECK (app_property_id() IS NULL OR property_id = app_property_id());--> statement-breakpoint
ALTER TABLE "bookings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bookings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "bookings_tenant" ON "bookings" USING (app_property_id() IS NULL OR property_id = app_property_id()) WITH CHECK (app_property_id() IS NULL OR property_id = app_property_id());--> statement-breakpoint
ALTER TABLE "channel_mappings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "channel_mappings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "channel_mappings_tenant" ON "channel_mappings" USING (app_property_id() IS NULL OR property_id = app_property_id()) WITH CHECK (app_property_id() IS NULL OR property_id = app_property_id());--> statement-breakpoint
ALTER TABLE "channels" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "channels" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "channels_tenant" ON "channels" USING (app_property_id() IS NULL OR property_id = app_property_id()) WITH CHECK (app_property_id() IS NULL OR property_id = app_property_id());--> statement-breakpoint
ALTER TABLE "counters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "counters" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "counters_tenant" ON "counters" USING (app_property_id() IS NULL OR property_id = app_property_id()) WITH CHECK (app_property_id() IS NULL OR property_id = app_property_id());--> statement-breakpoint
ALTER TABLE "folio_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "folio_lines" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "folio_lines_tenant" ON "folio_lines" USING (app_property_id() IS NULL OR property_id = app_property_id()) WITH CHECK (app_property_id() IS NULL OR property_id = app_property_id());--> statement-breakpoint
ALTER TABLE "guests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "guests" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "guests_tenant" ON "guests" USING (app_property_id() IS NULL OR property_id = app_property_id()) WITH CHECK (app_property_id() IS NULL OR property_id = app_property_id());--> statement-breakpoint
ALTER TABLE "hk_checklist_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "hk_checklist_items" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "hk_checklist_items_tenant" ON "hk_checklist_items" USING (app_property_id() IS NULL OR property_id = app_property_id()) WITH CHECK (app_property_id() IS NULL OR property_id = app_property_id());--> statement-breakpoint
ALTER TABLE "hk_tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "hk_tasks" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "hk_tasks_tenant" ON "hk_tasks" USING (app_property_id() IS NULL OR property_id = app_property_id()) WITH CHECK (app_property_id() IS NULL OR property_id = app_property_id());--> statement-breakpoint
ALTER TABLE "inventory" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "inventory" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "inventory_tenant" ON "inventory" USING (app_property_id() IS NULL OR property_id = app_property_id()) WITH CHECK (app_property_id() IS NULL OR property_id = app_property_id());--> statement-breakpoint
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoices" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "invoices_tenant" ON "invoices" USING (app_property_id() IS NULL OR property_id = app_property_id()) WITH CHECK (app_property_id() IS NULL OR property_id = app_property_id());--> statement-breakpoint
ALTER TABLE "jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "jobs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "jobs_tenant" ON "jobs" USING (app_property_id() IS NULL OR property_id = app_property_id()) WITH CHECK (app_property_id() IS NULL OR property_id = app_property_id());--> statement-breakpoint
ALTER TABLE "maintenance_tickets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "maintenance_tickets" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "maintenance_tickets_tenant" ON "maintenance_tickets" USING (app_property_id() IS NULL OR property_id = app_property_id()) WITH CHECK (app_property_id() IS NULL OR property_id = app_property_id());--> statement-breakpoint
ALTER TABLE "message_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "message_log" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "message_log_tenant" ON "message_log" USING (app_property_id() IS NULL OR property_id = app_property_id()) WITH CHECK (app_property_id() IS NULL OR property_id = app_property_id());--> statement-breakpoint
ALTER TABLE "night_audits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "night_audits" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "night_audits_tenant" ON "night_audits" USING (app_property_id() IS NULL OR property_id = app_property_id()) WITH CHECK (app_property_id() IS NULL OR property_id = app_property_id());--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "notifications_tenant" ON "notifications" USING (app_property_id() IS NULL OR property_id = app_property_id()) WITH CHECK (app_property_id() IS NULL OR property_id = app_property_id());--> statement-breakpoint
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "payments_tenant" ON "payments" USING (app_property_id() IS NULL OR property_id = app_property_id()) WITH CHECK (app_property_id() IS NULL OR property_id = app_property_id());--> statement-breakpoint
ALTER TABLE "petty_cash" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "petty_cash" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "petty_cash_tenant" ON "petty_cash" USING (app_property_id() IS NULL OR property_id = app_property_id()) WITH CHECK (app_property_id() IS NULL OR property_id = app_property_id());--> statement-breakpoint
ALTER TABLE "pos_categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pos_categories" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "pos_categories_tenant" ON "pos_categories" USING (app_property_id() IS NULL OR property_id = app_property_id()) WITH CHECK (app_property_id() IS NULL OR property_id = app_property_id());--> statement-breakpoint
ALTER TABLE "pos_day_closes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pos_day_closes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "pos_day_closes_tenant" ON "pos_day_closes" USING (app_property_id() IS NULL OR property_id = app_property_id()) WITH CHECK (app_property_id() IS NULL OR property_id = app_property_id());--> statement-breakpoint
ALTER TABLE "pos_menu_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pos_menu_items" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "pos_menu_items_tenant" ON "pos_menu_items" USING (app_property_id() IS NULL OR property_id = app_property_id()) WITH CHECK (app_property_id() IS NULL OR property_id = app_property_id());--> statement-breakpoint
ALTER TABLE "pos_order_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pos_order_items" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "pos_order_items_tenant" ON "pos_order_items" USING (app_property_id() IS NULL OR property_id = app_property_id()) WITH CHECK (app_property_id() IS NULL OR property_id = app_property_id());--> statement-breakpoint
ALTER TABLE "pos_orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pos_orders" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "pos_orders_tenant" ON "pos_orders" USING (app_property_id() IS NULL OR property_id = app_property_id()) WITH CHECK (app_property_id() IS NULL OR property_id = app_property_id());--> statement-breakpoint
ALTER TABLE "pos_outlets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pos_outlets" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "pos_outlets_tenant" ON "pos_outlets" USING (app_property_id() IS NULL OR property_id = app_property_id()) WITH CHECK (app_property_id() IS NULL OR property_id = app_property_id());--> statement-breakpoint
ALTER TABLE "pos_tables" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pos_tables" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "pos_tables_tenant" ON "pos_tables" USING (app_property_id() IS NULL OR property_id = app_property_id()) WITH CHECK (app_property_id() IS NULL OR property_id = app_property_id());--> statement-breakpoint
ALTER TABLE "print_agents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "print_agents" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "print_agents_tenant" ON "print_agents" USING (app_property_id() IS NULL OR property_id = app_property_id()) WITH CHECK (app_property_id() IS NULL OR property_id = app_property_id());--> statement-breakpoint
ALTER TABLE "print_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "print_jobs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "print_jobs_tenant" ON "print_jobs" USING (app_property_id() IS NULL OR property_id = app_property_id()) WITH CHECK (app_property_id() IS NULL OR property_id = app_property_id());--> statement-breakpoint
ALTER TABLE "printers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "printers" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "printers_tenant" ON "printers" USING (app_property_id() IS NULL OR property_id = app_property_id()) WITH CHECK (app_property_id() IS NULL OR property_id = app_property_id());--> statement-breakpoint
ALTER TABLE "promotions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "promotions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "promotions_tenant" ON "promotions" USING (app_property_id() IS NULL OR property_id = app_property_id()) WITH CHECK (app_property_id() IS NULL OR property_id = app_property_id());--> statement-breakpoint
ALTER TABLE "rate_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rate_plans" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "rate_plans_tenant" ON "rate_plans" USING (app_property_id() IS NULL OR property_id = app_property_id()) WITH CHECK (app_property_id() IS NULL OR property_id = app_property_id());--> statement-breakpoint
ALTER TABLE "rates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rates" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "rates_tenant" ON "rates" USING (app_property_id() IS NULL OR property_id = app_property_id()) WITH CHECK (app_property_id() IS NULL OR property_id = app_property_id());--> statement-breakpoint
ALTER TABLE "reviews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reviews" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "reviews_tenant" ON "reviews" USING (app_property_id() IS NULL OR property_id = app_property_id()) WITH CHECK (app_property_id() IS NULL OR property_id = app_property_id());--> statement-breakpoint
ALTER TABLE "room_types" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "room_types" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "room_types_tenant" ON "room_types" USING (app_property_id() IS NULL OR property_id = app_property_id()) WITH CHECK (app_property_id() IS NULL OR property_id = app_property_id());--> statement-breakpoint
ALTER TABLE "rooms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rooms" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "rooms_tenant" ON "rooms" USING (app_property_id() IS NULL OR property_id = app_property_id()) WITH CHECK (app_property_id() IS NULL OR property_id = app_property_id());--> statement-breakpoint
ALTER TABLE "sync_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sync_logs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "sync_logs_tenant" ON "sync_logs" USING (app_property_id() IS NULL OR property_id = app_property_id()) WITH CHECK (app_property_id() IS NULL OR property_id = app_property_id());--> statement-breakpoint
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tasks" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tasks_tenant" ON "tasks" USING (app_property_id() IS NULL OR property_id = app_property_id()) WITH CHECK (app_property_id() IS NULL OR property_id = app_property_id());--> statement-breakpoint
ALTER TABLE "uploads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "uploads" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "uploads_tenant" ON "uploads" USING (app_property_id() IS NULL OR property_id = app_property_id()) WITH CHECK (app_property_id() IS NULL OR property_id = app_property_id());
