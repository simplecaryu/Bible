# Linux WebKit DMABUF Stability Design

## Problem

On the current NVIDIA Linux environment, WebKitGTK opens the application
window but cannot allocate GBM buffers:

```text
KMS: DRM_IOCTL_MODE_CREATE_DUMB failed: Permission denied
Failed to create GBM buffer: Permission denied
```

The result is a blank window. Starting the app with
`WEBKIT_DISABLE_DMABUF_RENDERER=1` avoids the failing renderer and displays the
application normally.

## Decision

Stability takes priority over GPU rendering performance. The Linux desktop
binary will always set `WEBKIT_DISABLE_DMABUF_RENDERER=1` before Tauri and
WebKitGTK are initialized.

Placing the setting in the Rust process startup covers both `cargo tauri dev`
and packaged AppImage execution. Other operating systems will remain
unchanged. A shell wrapper or Cargo-only environment setting is insufficient
because it would not reliably apply when an AppImage is launched directly.
Hardware detection is intentionally avoided because it would add complexity
and could miss virtualized, permission-restricted, or non-NVIDIA environments
with the same failure.

## Implementation

The desktop library will expose a small platform-runtime configuration step.
On Linux it will set the WebKit environment variable, and `run()` will call it
before constructing the Tauri builder.

The configuration behavior will be separated from the actual environment
mutation sufficiently to test the required name and value without mutating the
test process's global environment.

## Verification

1. Add a Linux unit test that expects the runtime configuration to request
   `WEBKIT_DISABLE_DMABUF_RENDERER=1`.
2. Confirm that the test fails before the implementation exists.
3. Implement the minimum startup configuration and confirm the test passes.
4. Run formatting, workspace tests, Clippy, frontend tests, and JavaScript
   syntax validation.
5. Confirm manually that normal `cargo tauri dev` displays the application
   without requiring a command-line environment prefix.
