-- Migration: normalize achievement categories

UPDATE "achievements"
SET "category" = CASE
                     WHEN "category" = 'progress' THEN 'personal'
                     WHEN "category" = 'fun' THEN 'creative'
                     ELSE 'global'
    END;
