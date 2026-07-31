# 나란히 성경 데스크톱

여러 성경 번역을 절 단위로 비교하는 오프라인 우선 Linux 데스크톱
애플리케이션입니다. Tauri의 기존 HTML/CSS/JavaScript 화면과 Rust 백엔드를
사용합니다.

- 설치 후 읽기, 장 이동, 검색에 인터넷이나 로컬 HTTP 서버가 필요하지 않습니다.
- 성경 본문은 읽기 전용 `bible.db`로 AppImage에 포함됩니다.
- 화면 배치와 읽던 위치는 사용자 데이터 디렉터리의 별도 `user.db`에 저장됩니다.
- 주석, 영상, 메모, 북마크는 현재 버전에 포함되지 않습니다.

## Linux 개발 환경

Ubuntu 24.04 계열에서는 먼저 Tauri의 WebKit/GTK 빌드 의존성을 설치합니다.

```sh
sudo apt-get update
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  patchelf
```

Rust 1.88 이상, Node.js, Tauri CLI v2가 필요합니다.

```sh
rustup update stable
cargo install tauri-cli --version '^2.0.0' --locked
```

## 성경 데이터 생성

커밋된 원본 `data.db`와 `data/manifest.json`으로 배포용 데이터베이스를
생성합니다. 출력 파일은 생성물이라 Git에 포함되지 않습니다.

```sh
cargo run --release -p bible-db-builder -- \
  data.db data/manifest.json src-tauri/resources/bible.db
```

이 작업은 원본을 읽기 전용으로 열며, 앱에 필요 없는 가져오기 기록이나 비어 있는
메모/북마크 테이블은 배포 데이터베이스에 넣지 않습니다.

## 개발 실행과 AppImage 빌드

```sh
cargo tauri dev
cargo tauri build
```

Linux에서는 NVIDIA 및 GPU 장치 접근이 제한된 환경의 WebKitGTK 블랭크 화면을
방지하기 위해 앱 시작 전에 `WEBKIT_DISABLE_DMABUF_RENDERER=1`을 자동으로
적용합니다.

AppImage는 `target/release/bundle/appimage/`에 생성됩니다. 생성된 AppImage와
사용자 데이터만 있으면 되며 저장소, Python, 웹 서버는 필요하지 않습니다.

## 검증

```sh
cargo fmt --all -- --check
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
npm test
node --check app.js
```

실데이터 성능 결과는
[`docs/performance/2026-07-25-linux-baseline.md`](docs/performance/2026-07-25-linux-baseline.md)에
기록되어 있습니다.

## 원본 데이터 갱신

`data.db` 자체를 갱신하는 기존 가져오기 도구는 `scripts/`에 남아 있습니다.
브라우저용 JSON도 유지 보수를 위해 `python scripts/export_data.py`로 다시 만들
수 있지만, 데스크톱 앱은 런타임에 이 JSON을 읽지 않습니다.
