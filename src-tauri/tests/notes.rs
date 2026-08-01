use bible_desktop::notes::{NoteReference, NoteStore};
use rusqlite::Connection;
use tempfile::tempdir;

#[test]
fn migrates_settings_database_without_changing_saved_state() {
    let directory = tempdir().unwrap();
    let path = directory.path().join("user.db");
    let connection = Connection::open(&path).unwrap();
    connection
        .execute_batch(
            "
            CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            INSERT INTO metadata VALUES ('schema_version', '1');
            CREATE TABLE settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                payload TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            INSERT INTO settings VALUES (1, '{\"panels\":[]}', '2026-07-31 00:00:00');
            ",
        )
        .unwrap();
    drop(connection);

    NoteStore::open(&path).unwrap();

    let connection = Connection::open(&path).unwrap();
    let version: String = connection
        .query_row(
            "SELECT value FROM metadata WHERE key = 'schema_version'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    let payload: String = connection
        .query_row("SELECT payload FROM settings WHERE id = 1", [], |row| {
            row.get(0)
        })
        .unwrap();
    assert_eq!(version, "3");
    assert_eq!(payload, r#"{"panels":[]}"#);
}

#[test]
fn stores_one_markdown_note_per_canonical_reference() {
    let directory = tempdir().unwrap();
    let path = directory.path().join("user.db");
    let mut notes = NoteStore::open(&path).unwrap();
    let reference = NoteReference::verse(0, 1, 1).unwrap();

    notes.save(&reference, "# First").unwrap();
    notes.save(&reference, "# Revised").unwrap();

    let note = notes.load(&reference).unwrap().unwrap();
    assert_eq!(note.reference_key, "verse:0:1:1");
    assert_eq!(note.markdown, "# Revised");
    assert_eq!(notes.count().unwrap(), 1);
}

#[test]
fn deletes_a_note_when_markdown_is_blank() {
    let directory = tempdir().unwrap();
    let path = directory.path().join("user.db");
    let mut notes = NoteStore::open(&path).unwrap();
    let reference = NoteReference::chapter(0, 1).unwrap();

    notes.save(&reference, "chapter note").unwrap();
    notes.save(&reference, "  \n").unwrap();

    assert!(notes.load(&reference).unwrap().is_none());
    assert_eq!(notes.tombstones().unwrap()[0].reference_key, "chapter:0:1");
}

#[test]
fn resaving_a_deleted_note_clears_its_sync_tombstone() {
    let directory = tempdir().unwrap();
    let path = directory.path().join("user.db");
    let mut notes = NoteStore::open(&path).unwrap();
    let reference = NoteReference::verse(0, 1, 2).unwrap();

    notes.save(&reference, "first").unwrap();
    notes.delete(&reference).unwrap();
    assert_eq!(notes.tombstones().unwrap().len(), 1);

    notes.save(&reference, "restored").unwrap();
    assert!(notes.tombstones().unwrap().is_empty());
}

#[test]
fn lists_descendant_notes_in_canonical_order() {
    let directory = tempdir().unwrap();
    let path = directory.path().join("user.db");
    let mut notes = NoteStore::open(&path).unwrap();
    notes
        .save(&NoteReference::verse(0, 2, 3).unwrap(), "third")
        .unwrap();
    notes
        .save(&NoteReference::chapter(0, 2).unwrap(), "## Chapter two")
        .unwrap();
    notes
        .save(&NoteReference::verse(0, 1, 2).unwrap(), "**second**")
        .unwrap();

    let descendants = notes.descendants(&NoteReference::book(0).unwrap()).unwrap();

    assert_eq!(
        descendants
            .iter()
            .map(|note| note.reference_key.as_str())
            .collect::<Vec<_>>(),
        ["verse:0:1:2", "chapter:0:2", "verse:0:2:3"]
    );
    assert_eq!(descendants[0].preview, "second");
}

#[test]
fn replaces_all_notes_for_an_import_in_one_operation() {
    let directory = tempdir().unwrap();
    let path = directory.path().join("user.db");
    let mut notes = NoteStore::open(&path).unwrap();
    notes.save(&NoteReference::book(0).unwrap(), "Old").unwrap();

    notes
        .replace_all(&[
            (
                NoteReference::chapter(0, 1).unwrap(),
                "Chapter".to_string(),
                "2026-07-31T01:00:00Z".to_string(),
            ),
            (
                NoteReference::verse(0, 1, 1).unwrap(),
                "Verse".to_string(),
                "2026-07-31T02:00:00Z".to_string(),
            ),
        ])
        .unwrap();

    assert_eq!(
        notes
            .all()
            .unwrap()
            .into_iter()
            .map(|note| note.reference_key)
            .collect::<Vec<_>>(),
        ["chapter:0:1", "verse:0:1:1"]
    );
}
