# Linux AppImage releases

Published binaries are available at https://github.com/simplecaryu/Bible/releases/latest.
Users download the AppImage, make it executable, and run it; a source checkout and
Rust toolchain are unnecessary. The Bible corpus is included in the image.

The current release process is manual. `.github/workflows/deploy-pages.yml` deploys
the old web distribution; it does not build, test, or publish the desktop app.

For maintainers:

1. Prepare the pinned runtime database using the root README instructions.
2. Run `npm test`, `cargo fmt --all -- --check`, `cargo test --workspace`,
   `cargo clippy --workspace --all-targets -- -D warnings`, and `node --check app.js`.
3. Run `cargo tauri build --no-bundle --ci -- --locked`, followed by
   `cargo tauri bundle --bundles appimage --features desktop --ci`.
4. Extract the AppImage into a temporary directory. Compare its executable with
   the staged AppDir executable and verify its ELF build ID against the fresh
   build (packaging changes the library search path). Compare `bible.db` exactly
   against the input corpus and smoke-test startup with fresh user data.
5. Commit and push the intended release source. Create a release tag at that exact
   commit, upload the AppImage and `SHA256SUMS`, and include release notes stating
   the platform and verification performed. Verify the published asset digest.

If the repository was moved, cached Tauri permission metadata may still reference
its former absolute path. The September 2026 build required regenerating only
the affected release artifacts with
`cargo clean --release -p tauri -p tauri-plugin-dialog -p tauri-plugin-fs`.
This removes generated dependency artifacts, which Cargo rebuilds.

The bundler may need network access to download its AppImage runtime. Offline Rust
compilation does not imply offline packaging.

A useful next process improvement is a dedicated desktop CI workflow that tests
pull requests and builds tagged releases using pinned data revisions. Keep that
separate from Pages deployment and test its generated AppImage before relying on
it for releases.
