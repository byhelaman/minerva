-- =============================================
-- Migration 017: move extensions to dedicated schema
-- =============================================
-- Follows Supabase Security Advisor recommendation.
-- Moves pg_trgm and unaccent from public to extensions schema.
-- All functions that reference these extensions (005, 006, 011) already
-- use extensions.* prefixes and will work correctly after this migration.

CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION "pg_trgm"   SET SCHEMA extensions;
ALTER EXTENSION "unaccent"  SET SCHEMA extensions;

-- Allow non-SECURITY DEFINER queries to find extension functions without prefix
ALTER DATABASE postgres SET search_path TO "$user", public, extensions;
