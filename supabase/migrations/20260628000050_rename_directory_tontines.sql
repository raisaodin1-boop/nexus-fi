-- NO-OP (superseded).
-- This migration previously renamed directory seeds to ethnic community names
-- (Bamiléké, Sawa, Banen, etc.). That direction was reversed by
-- 20260628000049_public_verified_directory.sql and permanently purged by
-- 20260726120000_delete_ethnic_directory_tontines.sql.
-- Kept as a no-op so already-applied migration history stays valid.

select 1;
