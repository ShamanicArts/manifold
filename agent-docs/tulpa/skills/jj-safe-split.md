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

### Step 3: Identify Correct Parent (Lineage Tip)

```bash
# Find Working Merge change id
jj log -r 'description(glob:"*Working Merge*")' --no-graph

# Find its parents (these are the ONLY valid lineage tips for insertion)
jj log -r 'parents(<wm>)' --no-graph
```

**Why:** Working Merge parents are the only valid insert points. Never use bookmarks as lineage tips. These determine which chain the split files flow into.

**CRITICAL:** Save the Working Merge change id as `<wm>` and the parent change ids as `<L1_tip>`, `<L2_tip>`, etc. Use these by change id, not by bookmark name.

### Step 4: Look Up Working Copy Change ID, Then Split

```bash
# Record the working copy commit's change id — never use @ after this
jj log -r '@' --no-graph    # save as <wc>

jj split -r <wc> -A <L_tip> -m "type(scope): description" <files>
```

**Critical:** Always use `-A` (insert-after) with a Working Merge parent change id, never assume default parent. Use the change ID (`<wc>`), not `@`.

### Step 5: Verify Result

```bash
jj st
jj log -r '<wm>::' --no-graph           # full picture from WM upward
jj log -r 'parents(<wm>)' --no-graph    # verify lineage tips are correct
```

**Why:** Confirm the split worked correctly before proceeding. Check that the new commit appears on the intended lineage and the Working Merge's parents are as expected.

## Examples

### Example 1: Split Docs to SLOP Lineage

```bash
# Check state
jj st
jj log -r 'description(glob:"*Working Merge*")' --no-graph

# See what files changed
jj diff --name-only

# Record change ids (substitute with actual ids from your output)
# <wm> = Working Merge change id
# <slop_tip> = first parent of <wm> (the SLOP lineage tip)

# Split docs after SLOP lineage tip
jj split -r <wc> -A <slop_tip> -m "docs: update AGENTS.md and README" AGENTS.md README.md

# Verify
jj st
jj log -r '<wm>::' --no-graph
jj log -r 'parents(<wm>)' --no-graph
```

### Example 2: Split Code to Dev Lineage

```bash
# Check state
jj st
jj log -r 'description(glob:"*Working Merge*")' --no-graph

# Find lineage tips
jj log -r 'parents(<wm>)' --no-graph   # save <dev_tip>

# Record working copy change id
jj log -r '@' --no-graph               # save as <wc>

# Split feature code after dev lineage tip
jj split -r <wc> -A <dev_tip> -m "feat(dsp): add LoopBuffer and Playhead primitives" \
  manifold/primitives/dsp/LoopBuffer.cpp \
  manifold/primitives/dsp/Playhead.cpp

# Verify
jj st
jj log -r '<wm>::' --no-graph
jj log -r 'parents(<wm>)' --no-graph
```

## Rules

1. **Never split without `jj st` first** - User will correct you
2. **Always use `-A <parent>`** - Never assume default parent
3. **Verify with `jj log` after** - Confirm correct placement
4. **Group related files** - All DSP together, all UI together, etc.
5. **If conflict: stop and report to user** - Do not attempt to resolve or undo. Run `jj op log -n 10` and show the output. The user decides whether to undo.

## Common Mistakes

### Mistake 1: Forgetting -A

**Wrong:**
```bash
jj split -r @ -m "feat: add feature"  # Uses default parent, often wrong
```

**Right:**
```bash
jj split -r <wc> -A <L_tip> -m "feat: add feature"   # <L_tip> is a WM parent
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
# Find WM and lineage tips first
jj log -r 'description(glob:"*Working Merge*")' --no-graph
jj log -r 'parents(<wm>)' --no-graph
jj split -r <wc> -A <L_tip> -m "message" <verified_files>
```

### Mistake 3: Wrong File Grouping

**Wrong:**
```bash
jj split -r @ -A parent -m "message" file1.cpp file2.h README.md
```

**Right:**
```bash
# First split: code to dev lineage
jj split -r <wc> -A <dev_tip> -m "feat: add feature" file1.cpp file2.h
# Second split: docs to SLOP lineage (re-find WM parents after first split!)
jj split -r <wc> -A <slop_tip> -m "docs: update readme" README.md
```

## Recovery

**If you split wrong, do NOT autonomously attempt to repair.**

```bash
# Stop. Do not reach for jj undo on your own.
jj op log -n 10                       # Show recent operations
jj log -r '<wm>::' --no-graph         # Show current DAG state
jj log -r 'parents(<wm>)' --no-graph  # Show lineage tips
```

Report the output to the user. The user decides whether to `jj undo`, `jj op restore`, or proceed forward.

**But if the user explicitly tells you to undo** — e.g. "jj undo", "undo that", "restore to that commit" — **then you do it.** The rule is: don't decide to undo on your own. If they say undo, you undo.

## Success Criteria

- [ ] Ran `jj st` before splitting
- [ ] Used `-A <specific_parent>` 
- [ ] Verified with `jj log` after
- [ ] Files are logically grouped
- [ ] No conflicts (if conflict, stop and report to user)

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
