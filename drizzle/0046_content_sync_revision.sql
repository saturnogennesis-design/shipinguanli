-- Optimistic concurrency for local saves, including updates by older web routes.
ALTER TABLE contents ADD COLUMN sync_revision INTEGER NOT NULL DEFAULT 1;
CREATE TRIGGER contents_sync_revision AFTER UPDATE ON contents
WHEN NEW.sync_revision=OLD.sync_revision
BEGIN
 UPDATE contents SET sync_revision=OLD.sync_revision+1 WHERE id=NEW.id;
END;
ALTER TABLE material_sets ADD COLUMN sync_revision INTEGER NOT NULL DEFAULT 1;
CREATE TRIGGER material_sets_sync_revision AFTER UPDATE ON material_sets
WHEN NEW.sync_revision=OLD.sync_revision
BEGIN
 UPDATE material_sets SET sync_revision=OLD.sync_revision+1 WHERE id=NEW.id;
END;
