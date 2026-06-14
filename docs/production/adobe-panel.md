# Adobe Panel Packaging

The CEP panel files live in `apps/adobe-panel`.

## Building

Build the panel JavaScript:

```bash
pnpm --filter @openreview/adobe-panel build
```

The build produces `dist/panel.js` which is loaded by `index.html`.

## Extension files

The following files are packaged into the CEP extension:

- `index.html` — panel UI
- `host.jsx` — ExtendScript host functions (markers, sequence export)
- `manifest.xml` — CEP extension manifest
- `dist/panel.js` — compiled TypeScript panel logic

## Local development

Enable unsigned extensions in Adobe CEP debug preferences:

- **macOS**: `defaults write com.adobe.CSXS.9 PlayerDebugMode 1`
- **Windows**: set `PlayerDebugMode` to `1` in `HKEY_CURRENT_USER\Software\Adobe\CSXS.9`

Then symlink or copy the `apps/adobe-panel` directory into the CEP extensions folder:

- **macOS**: `~/Library/Application Support/Adobe/CEP/extensions/`
- **Windows**: `%APPDATA%\Adobe\CEP\extensions\`

## Packaging a ZXP

### Quick start

```bash
# Signed build (requires ZXPSignCmd on PATH)
pnpm --filter @openreview/adobe-panel package

# Unsigned build (for testing without ZXPSignCmd)
pnpm --filter @openreview/adobe-panel package:unsigned
```

The output is `apps/adobe-panel/dist/openreview-panel.zxp`.

### ZXPSignCmd

Adobe's ZXPSignCmd tool is required for signed builds. Download it from
[Adobe's CEP resources](https://github.com/nicolo-ribaudo/create-zxp-certificate)
or from the [Adobe Developer Console](https://developer.adobe.com/).

If `ZXPSignCmd` is not on your PATH, set the `ZXPSIGNCMD` environment variable:

```bash
ZXPSIGNCMD=/path/to/ZXPSignCmd pnpm --filter @openreview/adobe-panel package
```

### Self-signed certificates

For development, the packaging script auto-generates a self-signed `.p12`
certificate in `apps/adobe-panel/.certs/` if no certificate exists yet.

To use a custom certificate:

```bash
bash scripts/package-zxp.sh --cert /path/to/cert.p12 --password "YourPassword"
```

The certificate password defaults to the `ZXP_CERT_PASSWORD` environment
variable, falling back to `"OpenReviewDev"` for development builds.

**For production distribution**, use a certificate from a trusted CA (e.g.,
GlobalSign, Comodo) to avoid security warnings during installation.

### Script options

```
Usage: package-zxp.sh [OPTIONS]

Options:
  --cert FILE        Path to a .p12 signing certificate
  --password PASS    Certificate password
  --skip-sign        Create an unsigned .zxp (zip)
  --help             Show help
```

### Installing a ZXP

Install the signed ZXP with ExManCmd or a compatible extension manager:

```bash
ExManCmd --install openreview-panel.zxp
```

Or use [ZXPInstaller](https://zxpinstaller.com/) for a GUI-based installation.

## Live updates (SSE)

The panel connects to the API's Server-Sent Events endpoint
(`GET /review/:assetVersionId/events`) when viewing comments for an asset
version. Events are received as named SSE events matching `ReviewEventType`:

| Event | Panel behavior |
|---|---|
| `comment.created` | Reloads comments list |
| `comment.updated` | Reloads comments list |
| `comment.resolved` | Reloads comments list |
| `reply.created` | Reloads comments list |
| `approval.updated` | Updates approval status badge |
| `version.status` | Updates version status in dropdown |
| `presence.updated` | Reserved for future use |

The connection auto-reconnects on failure with exponential backoff (1s → 30s
max). A live-connection indicator in the panel header shows the current state:

- **Green "Live"** — connected and receiving events
- **Yellow "Reconnecting…"** — attempting to reconnect
- **Hidden** — no active SSE connection

## Marker imports

Marker imports are validated in `host.jsx` before writing to the host
application. Invalid timestamps are skipped, imports are capped at 500 markers
per action, and marker author/body text is length-bounded before being written
into Premiere Pro or After Effects marker fields.

## Authentication

If an API request returns `401`, the panel clears the saved token and requires
login again. The SSE connection passes the JWT token as a query parameter since
`EventSource` does not support custom headers.
