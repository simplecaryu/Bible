# Linux Desktop Performance Baseline

Date: 2026-07-25

Platform: Linux x86_64

Corpus schema: 1

Corpus: 66 books, 13 translations, 403,986 verse rows

## Results

| Operation | Sample | Median | Minimum | Maximum | Target |
| --- | --- | ---: | ---: | ---: | ---: |
| Chapter query | Psalm 119, all 13 translations, 2,288 rows | 1.71 ms | 1.64 ms | 2.08 ms | 100 ms |
| Search | `god`, first 2 translations, 8,073 matches | 14.86 ms | 14.04 ms | 19.16 ms | 100 ms |
| Search | `god`, all 13 translations, 25,062 matches | 102.92 ms | 99.30 ms | 106.03 ms | 300 ms |

The chapter query was repeated 50 times. Each search was repeated 15 times
against the generated read-only `src-tauri/resources/bible.db`. Timings include
materializing every matching row, so they are conservative relative to the
bounded result set displayed by the application.

`PRAGMA quick_check` returned `ok`.

## Remaining UI Measurements

Cold startup to first render and interaction frame rate require a working GTK
WebView. Record them from the packaged application after installing the Linux
Tauri system dependencies. The backend measurements above satisfy the approved
chapter and search targets without parallel search or a trigram index.
