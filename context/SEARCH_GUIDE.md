# Search Guide - FastEdge VSCode Extension

Quick reference for searching documentation efficiently.

---

## Why Search Instead of Read?

**CHANGELOG.md** and other large docs can be thousands of lines. **Searching is 10-20x faster** than reading linearly and uses far fewer tokens.

---

## Searching CHANGELOG.md

**NEVER read CHANGELOG.md linearly** - Always use grep or search tools.

### Common Searches

**Find feature additions**:
```bash
grep -i "add.*command" context/CHANGELOG.md
grep -i "implement.*" context/CHANGELOG.md
grep -i "new feature" context/CHANGELOG.md
```

**Find bug fixes**:
```bash
grep -i "fix.*bug" context/CHANGELOG.md
grep -i "fix.*rust" context/CHANGELOG.md
grep -i "fix.*compile" context/CHANGELOG.md
```

**Find specific features**:
```bash
grep -i "dotenv" context/CHANGELOG.md
grep -i "mcp" context/CHANGELOG.md
grep -i "debugger" context/CHANGELOG.md
```

**Find refactoring**:
```bash
grep -i "refactor" context/CHANGELOG.md
grep -i "restructure" context/CHANGELOG.md
```

**Date-based searches**:
```bash
grep "## \[2026-" context/CHANGELOG.md  # All 2026 entries
grep "## \[2026-02" context/CHANGELOG.md  # February 2026
```

### Context Around Matches

**Show 3 lines before and after**:
```bash
grep -C 3 "dotenv" context/CHANGELOG.md
```

**Show 5 lines after**:
```bash
grep -A 5 "## \[2026" context/CHANGELOG.md
```

---

## Finding Feature Documentation

**List all feature docs**:
```bash
ls context/features/
```

**Find specific feature**:
```bash
ls context/features/ | grep -i "compiler"
ls context/features/ | grep -i "dotenv"
```

---

## Searching Across All Context

**Search all files for keyword**:
```bash
grep -r "Debug Adapter Protocol" context/
grep -r "FastEdge-run" context/
grep -r "wasm32-wasip1" context/
```

**Case-insensitive**:
```bash
grep -ri "dotenv" context/
```

**With line numbers**:
```bash
grep -rn "launch.json" context/
```

---

## Searching Within Specific Docs

**Architecture docs**:
```bash
grep -i "registration" context/architecture/EXTENSION_LIFECYCLE.md
grep -i "DAP" context/architecture/DEBUGGER_ARCHITECTURE.md
```

**Feature docs**:
```bash
grep -i "cargo" context/features/COMPILER_SYSTEM.md
grep -i "prefix" context/features/DOTENV_SYSTEM.md
```

---

## Common Search Patterns

| Looking for | Search Pattern |
|-------------|----------------|
| How feature works | `grep -ri "feature-name" context/features/` |
| When feature was added | `grep -i "feature-name" context/CHANGELOG.md` |
| Bug fix history | `grep -i "fix.*keyword" context/CHANGELOG.md` |
| Configuration options | `grep -ri "config" context/architecture/CONFIGURATION_SYSTEM.md` |
| Command implementations | `grep -i "command-name" context/features/COMMANDS.md` |
| Compilation details | `grep -i "rust\|javascript" context/features/COMPILER_SYSTEM.md` |

---

## VS Code Search

**Use VS Code's built-in search** (Ctrl+Shift+F / Cmd+Shift+F):
- Search scope: `context/`
- Case-insensitive: Toggle icon
- Regex: Toggle icon
- Include/exclude patterns

**Example queries**:
- `dotenv` in `context/`
- `launch.json` in `context/architecture/`
- `@fastedge` (find all package references)

---

## Grep Tool in Claude Code

**Preferred method when using Claude Code**:
```typescript
Grep tool with:
- pattern: "search-term"
- path: "context/"
- output_mode: "content" (with context)
- -i: true (case-insensitive)
```

**Benefits**:
- Respects .gitignore
- Optimized for codebases
- Returns formatted results

---

## When to Read vs Search

**Read entire doc when**:
- Learning about new feature (<500 lines)
- Understanding architecture overview
- First time working in area

**Search instead when**:
- Looking for specific information
- Checking if feature exists
- Finding implementation details
- Reviewing change history

---

## Key Takeaways

1. **Always search CHANGELOG.md** - Never read linearly
2. **grep is your friend** - Fast, powerful, token-efficient
3. **Use -i for case-insensitive** - Catches more matches
4. **Use -r for recursive** - Search across all files
5. **Context flags (-C, -A, -B)** - See surrounding lines
6. **VS Code search** - When you need interactive results

---

**Last Updated**: February 2026
