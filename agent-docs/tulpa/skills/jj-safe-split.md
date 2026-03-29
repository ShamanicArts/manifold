# JJ Safe Split Workflow

## Description

Split changes from working copy into logical commits without corrupting the DAG. This is the most common JJ operation and the one most prone to user frustration if done wrong.

## Failure Mode

**What happens when wrong:**
- Agent forgets `-A <parent>` → commits get wrong parent
- Agent doesn't check state first → splits wrong files
- Agent splits without verifying → user has to undo and redo
- **User response:** *"You need to restore to that fucking commit"*, *"JJ undo. read the agents md again"*

**Success rate from analysis:** 88% required correction

## Safe Protocol

### Step 1: ALWAYS Check State First

```bash
jj st
jj log -r "@ | @- | @-- | bookmarks()" --limit 20
```

**Why:** User expects to see you verify state before acting. Never skip this.

### Step 2: See What Changed

```bash
jj diff --name-only
jj diff --stat
```

**Why:** Verify you're splitting the right files.

### Step 3: Identify Correct Parent

```bash
jj obslog -r @ --limit 10
```

**Why:** Find the change_id of the commit you want to insert after.

### Step 4: Split with Explicit Parent

```bash
jj split -r @ -A <parent_change_id> -m "type(scope): description" <files>
```

**Critical:** Always use `-A` (insert-after), never assume default parent.

### Step 5: Verify Result

```bash
jj st
jj log -r "@ | @-" --limit 5
```

**Why:** Confirm the split worked correctly before proceeding.

## Examples

### Example 1: Split Docs to Docs Lineage

```bash
# Check state
jj st
jj log -r "@ | @- | bookmarks()" --limit 20

# See what files
jj diff --name-only

# Split docs after docs parent
jj split -r @ -A tlunsxzs -m "docs: update AGENTS.md and README" AGENTS.md README.md

# Verify
jj st
jj log -r "@ | @-" --limit 5
```

### Example 2: Split Code to Code Lineage

```bash
# Check state
jj st

# Split feature code after code parent
jj split -r @ -A pwyplsln -m "feat(dsp): add LoopBuffer and Playhead primitives" \
  manifold/primitives/dsp/LoopBuffer.cpp \
  manifold/primitives/dsp/Playhead.cpp

# Verify
jj log -r "@ | @-" --limit 5
```

## Rules

1. **Never split without `jj st` first** - User will correct you
2. **Always use `-A <parent>`** - Never assume default parent
3. **Verify with `jj log` after** - Confirm correct placement
4. **Group related files** - All DSP together, all UI together, etc.
5. **If conflict: `jj undo` immediately** - Don't try to resolve manually

## Common Mistakes

### Mistake 1: Forgetting -A

**Wrong:**
```bash
jj split -r @ -m "feat: add feature"  # Uses default parent, often wrong
```

**Right:**
```bash
jj split -r @ -A <specific_parent> -m "feat: add feature"
```

### Mistake 2: Not Checking State

**Wrong:**
```bash
jj split -r @ -A parent -m "message"  # What's in working copy?
```

**Right:**
```bash
jj st
jj diff --name-only
jj split -r @ -A parent -m "message" <verified_files>
```

### Mistake 3: Wrong File Grouping

**Wrong:**
```bash
jj split -r @ -A parent -m "message" file1.cpp file2.h README.md
```

**Right:**
```bash
jj split -r @ -A code_parent -m "feat: add feature" file1.cpp file2.h
jj split -r @ -A docs_parent -m "docs: update readme" README.md
```

## Recovery

**If you split wrong:**

```bash
jj undo                    # Undo the split
jj st                      # Verify clean state
# Start over with correct parent
```

**User will say:** *"JJ undo. read the agents md again. report back."*

## Success Criteria

- [ ] Ran `jj st` before splitting
- [ ] Used `-A <specific_parent>` 
- [ ] Verified with `jj log` after
- [ ] Files are logically grouped
- [ ] No conflicts (if conflict, undo immediately)

## User Feedback Indicators

**Positive:**
- "great. we should split those commits..."
- "Good, yes, it does. You can proceed..."

**Negative (stop immediately):**
- "You need to restore to that fucking commit"
- "JJ undo. reread agent md"
- "Why did you put agents md & read me on agent files"
- "Undo to before you made commits"

## Related Skills

- `jj-recovery` - When things go wrong
- `jj-squash-insert` - For squash-then-split workflows
