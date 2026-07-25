use bible_db_builder::{build_database, parse_paths};

fn main() {
    if let Err(error) = run() {
        eprintln!("bible-db-builder: {error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let paths = parse_paths(std::env::args_os())?;
    build_database(&paths.source, &paths.manifest, &paths.output)
}
