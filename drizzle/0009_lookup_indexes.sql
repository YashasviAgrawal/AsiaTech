CREATE INDEX "booking_rooms_stay_idx" ON "booking_rooms" USING btree ("property_id","check_out","check_in");--> statement-breakpoint
CREATE INDEX "guests_name_key_prefix_idx" ON "guests" USING btree ("property_id","name_key" text_pattern_ops);--> statement-breakpoint
CREATE INDEX "guests_created_idx" ON "guests" USING btree ("property_id","created_at");