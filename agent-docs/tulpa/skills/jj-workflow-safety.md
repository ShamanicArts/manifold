# JJ Workflow Safety Rules

## Description

Critical safety rules for JJ version control operations. Based on analysis of 50 sessions with 2,750 JJ commands - 88% required user correction.

## The Golden Rules

### Rule 1: ALWAYS Check State First

**Before ANY JJ operation:**

```bash
jj st
```

**Why:** User expects this. Without it, user assumes you're flying blind.

**User says when skipped:** *"Go read the fucking Agents M.D."*

### Rule 2: NEVER Commit Without Permission

**Never run:**
```bash
jj commit -m "message"  # WITHOUT explicit user request
```

**Why:** Committing is a significant operation. User wants control.

**User says when violated:** *"I didn't ask you to JJ commit"*

### Rule 3: Always Use -A (Insert-After)

**Never assume parent:**
```bash
jj split -r @ -m "message"  # WRONG - uses default parent
```

**Always specify:**
```bash
jj split -r @ -A <specific_parent> -m "message"  # RIGHT
```

**Why:** Default parent is often wrong in complex DAGs.

**User says when wrong:** *"You need to restore to that fucking commit"*

### Rule 4: If Conflict, Undo Immediately

**On any conflict:**
```bash
jj undo
```

**Don't:**
- Try to resolve manually
- Continue with --force
- Ignore it

**Why:** Conflicts indicate wrong approach. User expects undo and retry.

**User says:** *"Any time you hit a conflict, jj undo"*

### Rule 5: Verify After Every Operation

**After EVERY JJ command:**
```bash
jj st
```

**Why:** Confirms operation worked as expected.

**User says:** *"Run JJST after every JJ operation"*

## Command-Specific Safety

### For `jj split`

**Checklist:**
- [ ] Ran `jj st` first
- [ ] Ran `jj diff --name-only`
- [ ] Used `-A <specific_parent>`
- [ ] Files are logically grouped
- [ ] No conflicts (if yes, undo)
- [ ] Ran `jj st` after
- [ ] Ran `jj log` to verify

### For `jj squash`

**Checklist:**
- [ ] User explicitly asked for squash
- [ ] Know target commit (`--into <target>`)
- [ ] Ran `jj st` first
- [ ] Ran `jj log` to see target
- [ ] Squashed
- [ ] Ran `jj st` after
- [ ] Ran `jj log` to verify

### For `jj commit`

**Checklist:**
- [ ] User explicitly said "commit"
- [ ] Know what commit message to use
- [ ] Ran `jj st` first
- [ ] Ran `jj diff --stat` to see what's committing
- [ ] Committed
- [ ] Ran `jj log -r @` to verify

### For `jj new`

**Checklist:**
- [ ] User wants NEW CHILD (not insertion)
- [ ] Know parent
- [ ] Ran `jj st` first
- [ ] Created
- [ ] Ran `jj st` after

### For `jj insert`

**Checklist:**
- [ ] User wants INSERTION BETWEEN commits
- [ ] Know parent to insert after
- [ ] Ran `jj st` first
- [ ] Used `-A <parent>`
- [ ] Inserted
- [ ] Ran `jj log` to verify placement

## Failure Mode Triggers

**User will correct you if:**

| Trigger | What You Did Wrong |
|---------|-------------------|
| *"I didn't ask you to JJ commit"* | Committed without permission |
| *"You need to restore"* | Wrong parent in split |
| *"JJ undo"* | Wrong operation |
| *"Run JJST"* | Didn't check state |
| *"Read the Agents M.D."* | Not following protocol |
| *"Learn to fucking read"* | Used wrong command |
| *"Why didn't you undo?"* | Continued after conflict |

## Red Flags (Stop Immediately)

**Stop and ask user if:**

1. **Conflict appears** - Don't try to resolve, just undo
2. **Don't know parent** - Don't guess, ask
3. **User says "stop"** - Stop, don't continue
4. **Multiple errors in row** - Pause, reassess
5. **User frustration escalating** - Pause, ask for clarification

## Safe Sequence Template

**For any JJ workflow:**

```bash
# 1. Check state
jj st

# 2. See changes
jj diff --name-only

# 3. See history
jj log -r "@ | @- | bookmarks()" --limit 20

# 4. Execute operation (with explicit parameters)
jj <operation> <explicit_params>

# 5. Verify
jj st
jj log -r "@ | @-" --limit 5
```

## Common User Instructions

**What user says → What to do:**

| User Says | Action |
|-----------|--------|
| *"JJ st"* | Run `jj st`, report state |
| *"JJ undo"* | Run `jj undo`, verify with `jj st` |
| *"Split it"* | Follow safe split protocol |
| *"Squash it"* | Get target, then squash |
| *"Commit it"* | Get message, then commit |
| *"Insert between"* | Use `jj insert -A`, not `jj new` |
| *"Go back"* | `jj undo` or `jj op restore` |

## Success Metrics

**From session analysis:**

- Clean success (no correction): 2%
- Corrected after feedback: 88%
- Failed: 10%

**Goal:** Follow safety rules to move from 2% to higher clean success rate.

## Emergency Recovery

**If everything goes wrong:**

```bash
# Nuclear option - restore from main
jj restore --from main
jj st
```

**Then:** Report to user and wait for instructions.

## Related Skills

- `jj-safe-split` - Detailed split protocol
- `jj-squash-insert` - Detailed squash/insert protocol
- `jj-recovery` - Recovery commands
