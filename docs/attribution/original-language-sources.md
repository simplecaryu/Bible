# Original-language data attribution

The bundled Hebrew, Biblical Aramaic, and Greek study data is generated from
the STEPBible Data repository at revision
`b86d26cdb1f51729e73b5b4eb7f7ccadc5dfba39`.

The imported tagged texts, brief lexicons, and morphology descriptions were
created by STEPBible.org based on work at Tyndale House, Cambridge and are
licensed under CC BY 4.0. The application preserves the original Unicode
surface forms and records this source, license, repository URL, and revision
inside `bible.db`.

Exact upstream paths and SHA-256 checksums are recorded in
[`data/original-sources.json`](../../data/original-sources.json).

No BibleHub page is scraped. The official Berean download page currently
offers the interlinear as a PDF rather than a machine-readable, word-order
alignment source. Consequently, the application does not infer English
ordering: it explicitly labels those displays as original-order fallbacks.
