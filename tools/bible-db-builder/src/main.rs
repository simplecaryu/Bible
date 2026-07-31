use bible_db_builder::{build_database, build_database_with_originals, parse_paths};

fn main() {
    if let Err(error) = run() {
        eprintln!("bible-db-builder: {error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let paths = parse_paths(std::env::args_os())?;
    match paths.originals {
        Some(originals) => {
            build_database_with_originals(&paths.source, &paths.manifest, &originals, &paths.output)
        }
        None => build_database(&paths.source, &paths.manifest, &paths.output),
    }
}
