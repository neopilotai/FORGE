# v0-bridge Extension

This VS Code extension bridges code-server with the v0 parent frame, enabling:

1. **File save notifications** - Notifies parent when user saves files
2. **Readonly mode** - Disables editing while AI is generating code
3. **File reload** - Reloads files from disk after revert operations

## Message Protocol

All messages use `__v0_remote__: 1` marker for identification.

### Messages FROM code-server TO parent

| Type                     | Payload                             | Description                   |
| ------------------------ | ----------------------------------- | ----------------------------- |
| `code_server_ready`      | `{}`                                | Extension activated and ready |
| `code_server_file_saved` | `{ file: string, content: string }` | User saved a file             |

### Messages FROM parent TO code-server

| Type           | Payload                                  | Description            |
| -------------- | ---------------------------------------- | ---------------------- |
| `set_readonly` | `{ readonly: boolean, reason?: string }` | Enable/disable editing |
| `reload_files` | `{ files: string[] }`                    | Reload files from disk |

## Usage Examples

### Sending messages to code-server (from v0 parent)

```typescript
// Lock editing during AI generation
sendToIframe(codeServerIframe.contentWindow, {
	type: "set_readonly",
	readonly: true,
	reason: "AI is generating code...",
})

// Unlock after AI finishes
sendToIframe(codeServerIframe.contentWindow, {
	type: "set_readonly",
	readonly: false,
})

// Reload files after revert
sendToIframe(codeServerIframe.contentWindow, {
	type: "reload_files",
	files: ["src/app/page.tsx", "src/components/button.tsx"],
})
```

### Receiving messages from code-server (in v0 parent)

```typescript
window.addEventListener("message", (event) => {
	if (event.data?.__v0_remote__ !== 1) return

	switch (event.data.type) {
		case "code_server_ready":
			console.log("Code-server extension ready")
			break

		case "code_server_file_saved":
			const { file, content } = event.data
			// Update editValueMap, sync to preview, etc.
			break
	}
})
```

## Building

```bash
cd extensions/v0-bridge
npm install
npm run build
```

## Installing in code-server

The extension should be installed when code-server starts. Options:

### Option 1: Bake into container image

```dockerfile
COPY extensions/v0-bridge /vercel/share/extensions/v0-bridge
```

Then in code-server startup script:

```bash
code-server --install-extension /vercel/share/extensions/v0-bridge
```

### Option 2: Install on startup

In the code-server wrapper script (`/vercel/share/v0-code-server.sh`):

```bash
# Install v0-bridge extension
code-server --install-extension /vercel/share/extensions/v0-bridge 2>/dev/null || true
```
