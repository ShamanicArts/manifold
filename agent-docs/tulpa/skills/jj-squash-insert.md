# JJ Squash and Insert Workflow

## Description

Squash messy working copy into single commit, then split into logical commits inserted at correct DAG positions. Used for cleaning up "agent slop" - mixed changes that need to be organized.

## Use Case

**When to use:**
- Working copy has mixed changes (docs + code + refactor)
- Changes need to go to different lineages (agent-docs vs main)
- Commits need to be inserted between existing commits
- User says: *"squash everything down and split"*

## Failure Mode

**What happens when wrong:**
- Agent uses `jj new` instead of `jj insert` → creates child instead of inserting between
- Agent doesn't identify correct insertion points → wrong DAG shape
- Agent commits without permission → user frustration
- **User response:** *"I didnt say jj new . I said JJKK insert"*, *"Learn to fucking read"*

## The Two Methods

### Method 1: Squash → Split (Most Common)

For splitting working copy into multiple logical commits:

```bash
# 1. Squash everything to single commit
jj squash --from @ --into <base_parent> -m "wip: consolidated changes"

# 2. Split into logical commits at correct positions
jj split -r @ -A <parent_A> -m "type(scope): feature A" <files_A>
jj split -r @ -A <parent_B> -m "type(scope): feature B" <files_B>
jj split -r @ -A <parent_C> -m "docs(scope): documentation" <doc_files>
```

### Method 2: Insert Empty → Squash (For Between Commits)

For inserting a commit between two existing commits:

```bash
# 1. Insert empty commit after specific parent
jj insert -A <parent_change_id> -m "type(scope): description"

# 2. Get the new commit ID
jj log -r "@ | @-" --limit 5

# 3. Squash changes into the new commit
jj squash --from @ --into <new_commit_id>
```

## Safe Protocol

### Step 1: Check Current State

```bash
jj st
jj log -r "@ | @- | @-- | bookmarks()" --limit 30
```

### Step 2: Identify Lineages

**Key question:** Where do these changes need to go?

- **agent-docs lineage** - Documentation, planning, skills
- **main lineage** - Code features, bug fixes
- **Between commits** - Insert at specific DAG position

### Step 3: Squash to Consolidate

```bash
jj squash --from @ --into <target_parent> -m "wip: consolidated for splitting"
```

### Step 4: Split to Correct Lineages

```bash
# Docs to agent-docs parent
jj split -r @ -A <agent_docs_parent> -m "docs(scope): description" <doc_files>

# Code to main parent  
jj split -r @ -A <main_parent> -m "feat(scope): description" <code_files>

# Refactor to appropriate parent
jj split -r @ -A <refactor_parent> -m "refactor(scope): description" <refactor_files>
```

### Step 5: Verify Clean State

```bash
jj st
jj log -r "@ | @- | @-- | bookmarks()" --limit 30
```

## Examples

### Example 1: Mixed Docs and Code

```bash
# Check state
jj st
jj log -r "@ | @- | bookmarks()" --limit 30

# Squash everything
jj squash --from @ --into main -m "wip: docs and code changes"

# Split docs to agent-docs lineage
jj split -r @ -A tlunsxzs -m "docs: update AGENTS.md and README" AGENTS.md README.md

# Split code to main lineage
jj split -r @ -A pwyplsln -m "feat(dsp): add LoopBuffer primitives" dsp/

# Verify
jj st
jj log -r "@ | @-" --limit 10
```

### Example 2: Insert Between Commits

```bash
# User wants commit between "refactor: rename" and "docs: update"

# Insert empty commit after refactor
jj insert -A <refactor_commit_id> -m "feat: new feature between refactor and docs"

# Check what ID was created
jj log -r "@ | @-" --limit 5

# Squash changes into the new commit
jj squash --from @ --into <new_commit_id>

# Verify correct placement
jj log -r "@ | @- | @--" --limit 10
```

## Critical Distinctions

### `jj new` vs `jj insert`

| Command | What It Does | Use When |
|---------|--------------|----------|
| `jj new <parent>` | Creates **child** of parent | Adding to end of lineage |
| `jj insert -A <parent>` | Inserts **between** parent and its child | Inserting in middle |
| `jj squash --insert-after <parent>` | Squash to new commit **after** parent | Moving changes between |

**User correction:** *"I didnt say jj new . I said JJKK insert"*

**Rule:** If user says "insert between", use `jj insert -A` not `jj new`.

### Split vs Squash

| Command | Purpose |
|---------|---------|
| `jj split -r @ -A <parent>` | Take files from working copy, create new commit after parent |
| `jj squash --from @ --into <target>` | Move changes into existing commit |
| `jj squash --from @ --insert-after <parent>` | Move changes to new commit after parent |

## Rules

1. **Always verify parents before inserting** - Use `jj log` to see DAG
2. **Use `jj insert -A` not `jj new`** when inserting between
3. **Group by lineage** - Docs go to docs parent, code to code parent
4. **Never squash without permission** - User must explicitly ask
5. **Verify final state** - `jj st` and `jj log` to confirm shape

## Common Mistakes

### Mistake 1: Using `jj new` Instead of `jj insert`

**Wrong:**
```bash
jj new <parent> -m "message"  # Creates child, not insertion
```

**Right:**
```bash
jj insert -A <parent> -m "message"  # Inserts between parent and its child
```

### Mistake 2: Not Identifying Correct Parents

**Wrong:**
```bash
jj split -r @ -A @- -m "message"  # Assumes parent is @-
```

**Right:**
```bash
jj log -r "bookmarks()"  # Find correct parent by bookmark
jj split -r @ -A <correct_parent> -m "message"
```

### Mistake 3: Squashing Without Permission

**Wrong:**
```bash
jj squash --into main  # User didn't ask for this
```

**Right:**
```bash
# Wait for user to explicitly say "squash"
# Then: jj squash --from @ --into <target>
```

## Recovery

**If wrong parent:**
```bash
jj undo
jj log -r "bookmarks() | @- | @--"  # Find correct parent
jj split -r @ -A <correct_parent> -m "message"
```

**If used `new` instead of `insert`:**
```bash
jj undo
jj insert -A <parent> -m "message"
```

**User will say:** *"JJ undo. reread agent md."*

## Success Criteria

- [ ] Verified parents with `jj log` before inserting
- [ ] Used correct command (`insert` vs `new`)
- [ ] Changes went to correct lineages
- [ ] Final `jj st` shows clean state
- [ ] `jj log` shows correct DAG shape

## Related Skills

- `jj-safe-split` - For the split phase
- `jj-recovery` - When things go wrong
