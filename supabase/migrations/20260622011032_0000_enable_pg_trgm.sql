/*
# Enable pg_trgm extension

Provides trigram index operator class used for fast product-name substring search
(autocomplete). Idempotent.
*/
CREATE EXTENSION IF NOT EXISTS pg_trgm;
