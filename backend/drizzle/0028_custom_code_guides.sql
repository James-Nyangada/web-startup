-- Custom code guides use the existing `custom` platform value (docs/adr/0001-custom-code-guides.md).
-- Guides saved from the staff editor as `generic` before this change are renamed so they match
-- sites.platform = 'custom' and can sync into fix_guides (whose check constraint rejects `generic`).
UPDATE "content_posts" SET "platform" = 'custom' WHERE "type" = 'guide' AND "platform" = 'generic';
