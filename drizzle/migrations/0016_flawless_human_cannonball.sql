CREATE TABLE "survey_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"respondent_profile_id" uuid,
	"answers" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_respondent_profile_id_profiles_id_fk" FOREIGN KEY ("respondent_profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;