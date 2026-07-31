use std::fs::File;
use std::io::Write;

use bible_desktop::archive::{
    apply_import, inspect_archive, write_archive, ImportPolicy, PortableNote,
};
use tempfile::tempdir;
use zip::write::SimpleFileOptions;

fn note(reference_key: &str, markdown: &str, updated_at: &str) -> PortableNote {
    PortableNote {
        reference_key: reference_key.to_string(),
        markdown: markdown.to_string(),
        updated_at: updated_at.to_string(),
    }
}

#[test]
fn exports_and_inspects_a_human_readable_notes_archive() {
    let directory = tempdir().unwrap();
    let path = directory.path().join("notes.zip");
    let notes = vec![
        note("book:0", "# Genesis", "2026-07-31T01:00:00Z"),
        note("verse:0:1:1", "Created", "2026-07-31T02:00:00Z"),
    ];

    write_archive(&path, &notes).unwrap();
    let inspection = inspect_archive(&path, &[]).unwrap();

    assert_eq!(inspection.imported, notes);
    assert!(inspection.conflicts.is_empty());
}

#[test]
fn identifies_conflicts_and_applies_an_explicit_policy() {
    let current = vec![note("verse:0:1:1", "Current", "2026-07-31T01:00:00Z")];
    let imported = vec![
        note("verse:0:1:1", "Imported", "2026-07-31T02:00:00Z"),
        note("verse:0:1:2", "New", "2026-07-31T03:00:00Z"),
    ];

    let keep = apply_import(&current, &imported, ImportPolicy::KeepCurrent);
    let replace = apply_import(&current, &imported, ImportPolicy::ReplaceImported);

    assert_eq!(keep[0].markdown, "Current");
    assert_eq!(keep[1].reference_key, "verse:0:1:2");
    assert_eq!(replace[0].markdown, "Imported");
}

#[test]
fn rejects_archive_path_traversal() {
    let directory = tempdir().unwrap();
    let path = directory.path().join("unsafe.zip");
    let file = File::create(&path).unwrap();
    let mut archive = zip::ZipWriter::new(file);
    archive
        .start_file("../outside.md", SimpleFileOptions::default())
        .unwrap();
    archive.write_all(b"bad").unwrap();
    archive.finish().unwrap();

    let error = inspect_archive(&path, &[]).unwrap_err().to_string();

    assert!(error.contains("unsafe archive path"));
}
