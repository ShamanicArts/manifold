# JJ Squash and Insert Workflow

## ⚠️⚠️⚠️ THIS IS NOT A REBASE ⚠️⚠️⚠️

**IF YOU HAVE BEEN LINKED THIS DOCUMENT AND TOLD TO DO THIS WORK, YOU ARE NOT TO `jj rebase`.**

**THIS PROCESS IS NOT `jj rebase`. DO NOT USE `jj rebase`. DO NOT EVEN THINK ABOUT `jj rebase`.**

**The correct commands are `jj new -A` followed by `jj squash --from --into`. That's it. Two commands. No rebase. No thinking. Just do the two commands.**

If you use `jj rebase` after being linked this document, you have fucked up and destroyed the DAG. `jj undo` immediately and try again.

---

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
- Agent uses `jj rebase` instead of `jj new -A` + `jj squash` → destroys DAG shape
- Agent uses `jj new` without `-A` → creates child instead of inserting between
- Agent doesn't identify correct insertion points → wrong DAG shape
- Agent commits without permission → user frustration
- **User response:** *"I didnt say jj rebase . I said insert between"*, *"Learn to fucking read"*, *"Stop thinking, do the task"*

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
# This creates a new empty commit AFTER <parent_change_id> and rebases descendants
jj new -A <parent_change_id> -m "type(scope): description"

# 2. Squash changes from source commit into the new empty commit
jj squash --from <source_change_id> --into @ -m "type(scope): description"

# 3. Verify correct placement
jj log -r "@ | @- | @--" --limit 10
```

**Example: Put commit X between parent A and parent B**

```bash
# Given: A → B and X is the working copy with changes
# Goal: A → X → B
# CRITICAL: X is the WORKING HEAD. Do not move it. Do not rebase it.

# Step 1: Describe the working copy
jj describe -m "feat: new feature between A and B"

# Step 2: Insert after A, squashing working copy changes
# --keep-emptied preserves the working head at its original position
jj squash --insert-after A --keep-emptied -m "feat: new feature between A and B"

# Done. DAG is now A → new_commit(X) → B, working head is still at X
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

### Example 2: Insert Commit Between Two Existing Commits

```bash
# User wants commit X between commit A and commit B
# Current DAG: A → B
# Target DAG: A → X → B
# WORKING HEAD is at X. X must remain the working head.

# Step 1: Describe the working copy
jj describe -m "feat: new feature between A and B"

# Step 2: Insert after A with --keep-emptied
# This creates a new commit after A with the working copy's changes.
# --keep-emptied prevents the working head from moving.
jj squash --insert-after A --keep-emptied -m "feat: new feature between A and B"

# Verify correct placement
jj log -r "A | @ | B" --limit 10
```

## Critical Distinctions

### `jj new` vs `jj new -A`

| Command | What It Does | Use When |
|---------|--------------|----------|
| `jj new <parent>` | Creates **child** at end of lineage | Adding to end of branch |
| `jj new -A <parent>` | Inserts **between** parent and its children | Inserting in middle of DAG |
| `jj rebase -s <commit> -d <parent>` | **DESTROYS DAG** - moves entire subtree | **NEVER USE THIS FOR INSERT** |

**User correction:** *"I didnt say jj rebase . I said insert between"*

**Rule:** If user says "insert between", use `jj squash --insert-after <parent> --keep-emptied`. **NEVER** `jj rebase`. **NEVER** move the working head.

### The Insert Pattern

The two-command insert pattern:

```bash
jj describe -m "description"                                       # Describe working copy
jj squash --insert-after <parent> --keep-emptied -m "description"  # Insert after parent, preserve working head
```

**CRITICAL RULES:**
- Use `--insert-after` to specify the parent to insert after
- Use `--keep-emptied` to prevent the working head from moving
- The working head stays at its original position

## Rules

1. **⚠️ NEVER USE `jj rebase` FOR INSERT OPERATIONS** - This destroys the DAG
2. **Always verify parents before inserting** - Use `jj log` to see DAG
3. **Use `jj new -A <parent>` to insert between** - Not `jj rebase`, not plain `jj new`
4. **Group by lineage** - Docs go to docs parent, code to code parent
5. **Never squash without permission** - User must explicitly ask
6. **Verify final state** - `jj st` and `jj log` to confirm shape

## Common Mistakes

### Mistake 1: Using `jj rebase` Instead of Insert

**WRONG - DESTROYS DAG:**
```bash
jj rebase -s X -d A    # DON'T DO THIS - moves X and ALL ITS DESCENDANTS
```

**RIGHT:**
```bash
jj describe -m "description"                                       # Describe working copy
jj squash --insert-after A --keep-emptied -m "description"         # Insert after A, preserve working head
```

### Mistake 2: Using `jj new` Without `-A`

**Wrong:**
```bash
jj new A -m "message"  # Creates child at end, does not insert between
```

**Right:**
```bash
jj new -A A -m "message"  # Inserts between A and A's children
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

**If used `jj rebase` by accident:**
```bash
jj undo                  # Undo the rebase immediately
# Then use the correct insert pattern:
jj new -A <parent> -m "description"
jj squash --from <source> --into @ -m "description"
```

**If wrong parent:**
```bash
jj undo
jj log -r "bookmarks() | @- | @--"  # Find correct parent
jj new -A <correct_parent> -m "description"
jj squash --from <source> --into @ -m "description"
```

**User will say:** *"JJ undo. reread agent md."*

## Success Criteria

- [ ] Did NOT use `jj rebase` at any point
- [ ] Used `jj squash --insert-after <parent> --keep-emptied` to insert
- [ ] Working head remained at original position
- [ ] Verified parents with `jj log` before inserting
- [ ] Changes went to correct lineages
- [ ] Final `jj st` shows clean state
- [ ] `jj log` shows correct DAG shape

## Related Skills

- `jj-safe-split` - For the split phase
- `jj-recovery` - When things go wrong
