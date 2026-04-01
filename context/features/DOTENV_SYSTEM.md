# Dotenv System - FastEdge VSCode Extension

This document describes how the extension discovers, loads, and processes dotenv files for FastEdge application configuration.

---

## Overview

The dotenv system allows developers to:
- Store env vars, secrets, and headers outside `fastedge-config.test.json`
- Separate concerns (env vars, secrets, headers) into distinct files
- Use `.gitignore` for sensitive data
- Support large configuration sets
- Share configurations across team

**File**: `src/dotenv/index.ts`

**See also**: `../DOTENV.md` (root) - User-facing documentation

---

## Dotenv File Types

### 1. .env (General)

**Contains**: Mixed configuration with prefixes

**Example**:
```bash
# Environment variables
FASTEDGE_VAR_ENV_API_URL=https://api.example.com
FASTEDGE_VAR_ENV_DEBUG=true

# Secrets
FASTEDGE_VAR_SECRET_API_KEY=secret-value
FASTEDGE_VAR_SECRET_DB_PASSWORD=password

# Request headers
FASTEDGE_VAR_REQ_HEADER_Authorization=Bearer token
FASTEDGE_VAR_REQ_HEADER_X_Custom=value

# Response headers
FASTEDGE_VAR_RSP_HEADER_X_Custom_Header=value
```

**Prefixes determine category**:
- `FASTEDGE_VAR_ENV_` → Environment variables
- `FASTEDGE_VAR_SECRET_` → Secrets
- `FASTEDGE_VAR_REQ_HEADER_` → Request headers
- `FASTEDGE_VAR_RSP_HEADER_` → Response headers

### 2. Specialized Files

**No prefixes needed** - file name determines category:

**.env.variables**:
```bash
API_URL=https://api.example.com
DEBUG=true
PORT=8080
```

**.env.secrets**:
```bash
API_KEY=secret-value
DB_PASSWORD=password
PRIVATE_KEY=key-value
```

**.env.req_headers**:
```bash
Authorization=Bearer token
X-Custom-Header=value
Content-Type=application/json
```

**.env.rsp_headers**:
```bash
X-Custom-Header=value
X-Response-Id=${REQUEST_ID}
Access-Control-Allow-Origin=*
```

**Recommended for**:
- Large configuration sets
- Clear separation of concerns
- Easier to manage and gitignore

---

## Configuration Hierarchy

Dotenv files are loaded by the bundled debugger server and merged in order. There is no external switch to enable/disable them — files are auto-discovered from the `configRoot` directory on every server start.

**Load order** (later files override earlier for same keys):

```
.env
  ↓
.env.variables
  ↓
.env.secrets
  ↓
.env.req_headers
  ↓
.env.rsp_headers
```

Runtime config in `fastedge-config.test.json` (edited in the debugger UI) takes precedence over anything in dotenv files for the same keys.

---

## Discovery Process

### Auto-Discovery

**Always on** — no configuration required:

1. **Start location**: `configRoot` (directory containing `.fastedge-debug/`)

2. **Walk up directory tree**:
```typescript
let currentDir = startLocation;
while (currentDir !== workspaceRoot) {
  if (hasDotenvFiles(currentDir)) {
    return loadDotenvFiles(currentDir);
  }
  currentDir = path.dirname(currentDir);
}
```

3. **Stop conditions**:
   - Found directory with dotenv files
   - Reached workspace root
   - Reached filesystem root

**Why walk up?**
- Supports nested project structures
- Allows repo-level configs
- Flexible placement

### File Detection

**Looks for these files**:
- `.env`
- `.env.variables`
- `.env.secrets`
- `.env.req_headers`
- `.env.rsp_headers`

**Any combination valid**:
- Can have just `.env`
- Can have specialized files only
- Can have mix of both

---

## File Parsing

### General .env File

**With prefixes**:

```typescript
function parseEnvFile(content: string): DotenvConfig {
  const config = { env: {}, secrets: {}, headers: {}, responseHeaders: {} };

  for (const line of content.split('\n')) {
    // Skip comments and empty lines
    if (line.trim().startsWith('#') || !line.trim()) continue;

    const [key, ...valueParts] = line.split('=');
    const value = valueParts.join('=');  // Handle = in value

    if (key.startsWith('FASTEDGE_VAR_ENV_')) {
      const varName = key.replace('FASTEDGE_VAR_ENV_', '');
      config.env[varName] = value;
    }
    else if (key.startsWith('FASTEDGE_VAR_SECRET_')) {
      const varName = key.replace('FASTEDGE_VAR_SECRET_', '');
      config.secrets[varName] = value;
    }
    else if (key.startsWith('FASTEDGE_VAR_REQ_HEADER_')) {
      const headerName = key.replace('FASTEDGE_VAR_REQ_HEADER_', '');
      config.headers[headerName] = value;
    }
    else if (key.startsWith('FASTEDGE_VAR_RSP_HEADER_')) {
      const headerName = key.replace('FASTEDGE_VAR_RSP_HEADER_', '');
      config.responseHeaders[headerName] = value;
    }
  }

  return config;
}
```

### Specialized Files

**No prefix stripping** - direct key-value:

```typescript
function parseVariablesFile(content: string): Record<string, string> {
  const vars = {};

  for (const line of content.split('\n')) {
    if (line.trim().startsWith('#') || !line.trim()) continue;

    const [key, ...valueParts] = line.split('=');
    const value = valueParts.join('=');
    vars[key] = value;
  }

  return vars;
}
```

**Same parsing for**:
- `.env.variables` → env
- `.env.secrets` → secrets
- `.env.req_headers` → headers
- `.env.rsp_headers` → responseHeaders

### Comment Handling

**Supported**:
```bash
# This is a comment
API_URL=https://api.example.com  # Comments OK

# Multiline not supported - use multiple comments
# Like this
DEBUG=true
```

**Ignored lines**:
- Start with `#`
- Empty or whitespace-only

### Special Characters

**Values with spaces**:
```bash
# No quotes needed
MESSAGE=Hello World

# But can use quotes if desired
MESSAGE="Hello World"
```

**Values with equals signs**:
```bash
# Multiple = handled correctly
EQUATION=x=y+z
```

**Quotes not stripped** - value includes quotes:
```bash
MESSAGE="Hello"
# Result: MESSAGE = "Hello" (includes quotes)
```

---

## Configuration Merging

### Merge Order

1. **Load all dotenv files**:
```typescript
const config = {
  env: {},
  secrets: {},
  headers: {},
  responseHeaders: {}
};

// 1. .env (if exists)
merge(config, parseDotenv('.env'));

// 2. .env.variables (if exists)
config.env = { ...config.env, ...parseVariables('.env.variables') };

// 3. .env.secrets (if exists)
config.secrets = { ...config.secrets, ...parseSecrets('.env.secrets') };

// 4. .env.req_headers (if exists)
config.headers = { ...config.headers, ...parseHeaders('.env.req_headers') };

// 5. .env.rsp_headers (if exists)
config.responseHeaders = { ...config.responseHeaders, ...parseHeaders('.env.rsp_headers') };
```

**Objects are merged** - not replaced

### Merge Example

**.env.variables**:
```bash
API_URL=https://staging.api.example.com
DEBUG=true
TIMEOUT=30
```

**.env.secrets**:
```bash
API_KEY=staging-key
```

**fastedge-config.test.json** (set in debugger UI):
```json
{
  "env": {
    "API_URL": "https://dev.api.example.com"
  }
}
```

**Final configuration**:
```json
{
  "env": {
    "API_URL": "https://dev.api.example.com",  // fastedge-config.test.json wins
    "DEBUG": "true",                           // from dotenv
    "TIMEOUT": "30"                            // from dotenv
  },
  "secrets": {
    "API_KEY": "staging-key"                   // from dotenv
  }
}
```

---

## FastEdge-run Integration

### Argument Building

**From merged configuration**:

```typescript
const args = ['--wasm', binaryPath];

// Environment variables
for (const [key, value] of Object.entries(config.env)) {
  args.push('--env', `${key}=${value}`);
}

// Secrets
for (const [key, value] of Object.entries(config.secrets)) {
  args.push('--secret', `${key}=${value}`);
}

// Request headers
for (const [key, value] of Object.entries(config.headers)) {
  args.push('--req-header', `${key}=${value}`);
}

// Response headers
for (const [key, value] of Object.entries(config.responseHeaders)) {
  args.push('--rsp-header', `${key}=${value}`);
}
```

**FastEdge-run command**:
```bash
fastedge-run \
  --wasm app.wasm \
  --env API_URL=https://dev.api.example.com \
  --env DEBUG=true \
  --secret API_KEY=staging-key \
  --req-header Authorization=Bearer token \
  --rsp-header X-Custom-Header=value
```

---

## Security Best Practices

### Gitignore Configuration

**Always add to `.gitignore`**:
```gitignore
# VSCode workspace
.vscode/

# Dotenv files with secrets
.env
.env.*

# But allow example files
!.env.example
!.env.*.example
```

**Example files**:
- `.env.example` - Shows structure, no real values
- `.env.variables.example` - Template for env vars
- `.env.secrets.example` - Template for secrets

### Secrets Handling

**Store sensitive data in**:
- `.env.secrets` - For local development
- GitHub Codespaces secrets - For cloud environments
- CI/CD secrets - For pipelines

**Never commit**:
- API tokens
- Passwords
- Private keys
- Database credentials

### File Permissions

**On Unix systems**:
```bash
chmod 600 .env.secrets  # Owner read/write only
```

**Prevents**:
- Other users reading secrets
- Accidental exposure

---

## Example Scenarios

### Scenario 1: Simple Project

**Structure**:
```
my-project/
├── .env
└── src/
    └── index.js
```

**.env**:
```bash
FASTEDGE_VAR_ENV_API_URL=https://api.example.com
FASTEDGE_VAR_SECRET_API_KEY=secret-value
```

**Discovery**:
- Starts at `src/index.js` directory
- Walks up to project root
- Finds `.env`
- Loads and parses

### Scenario 2: Separate Files

**Structure**:
```
my-project/
├── .env.variables
├── .env.secrets
├── .gitignore
└── src/
    └── index.js
```

**.gitignore**:
```gitignore
.env.secrets
```

**Discovery**:
- Starts at `src/` directory
- Walks up to project root
- Finds `.env.variables` and `.env.secrets`
- Loads both, merges

### Scenario 3: Config Directory

**Structure**:
```
my-project/
├── config/
│   ├── .env.variables
│   └── .env.secrets
├── .fastedge-debug/
│   └── fastedge-config.test.json
└── src/
    └── index.js
```

**Discovery**:
- Server starts from `configRoot` (directory containing `.fastedge-debug/`)
- Walks up, finds `config/` is not at or above `configRoot` — so place dotenv files at `configRoot` level or above for auto-discovery

**Note**: Per-directory dotenv path override (old `"dotenv": "./config"` launch.json option) no longer exists. Place dotenv files where auto-discovery will find them.

### Scenario 4: Multiple Environments

**Structure**:
```
my-project/
├── .env.variables
├── .env.secrets
└── src/
    └── index.js
```

**Note**: The old launch.json multi-configuration approach (separate named configs with different `dotenv` paths) no longer applies. Switch dotenv files manually or use different `fastedge-config.test.json` files in separate directories if you need per-environment isolation.

---

## Error Handling

### File Not Found

**If dotenv path specified but not found**:
```typescript
if (!fs.existsSync(dotenvPath)) {
  throw new Error(`Dotenv directory not found: ${dotenvPath}`);
}
```

**User sees**:
- Error in debug console
- Error notification
- Debug session terminates

### Parse Errors

**If file has invalid format**:
```typescript
try {
  parseDotenvFile(content);
} catch (error) {
  console.warn(`Error parsing ${filename}: ${error.message}`);
  // Continue with other files
}
```

**Non-fatal**:
- Logs warning
- Skips problematic file
- Continues with other files

### Permission Errors

**If file not readable**:
```typescript
try {
  const content = fs.readFileSync(filepath, 'utf8');
} catch (error) {
  console.warn(`Cannot read ${filepath}: ${error.message}`);
  // Continue
}
```

**Non-fatal**: Logs warning, continues

---

## Key Takeaways

1. **Always on** - Auto-discovered from `configRoot`, no configuration required
2. **Hierarchy** - `fastedge-config.test.json` > dotenv files (later specialized files override `.env` for same keys)
3. **Security** - Gitignore sensitive files (`.env.secrets`, etc.)
4. **Merge behavior** - Objects merged, not replaced
5. **FastEdge-run integration** - Translates to CLI arguments
6. **Error handling** - Graceful degradation (missing files skipped, parse errors logged)

---

**Related Documentation**:
- `../DOTENV.md` (root) - User guide
- `CONFIGURATION_SYSTEM.md` - Overall configuration architecture
- `DEBUGGER_ARCHITECTURE.md` - How config is used

---

**Last Updated**: March 2026
