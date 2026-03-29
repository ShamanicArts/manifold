# JJ Recovery Patterns

## Description

Recover from mistakes during JJ workflows. This is essential because 88% of JJ workflows in sessions required correction.

## Recovery Commands

### 1. Undo Last Operation

```bash
jj undo
```

**Use when:**
- Wrong split created
- Wrong commit made
- Wrong parent used
- Any JJ operation was incorrect

**User instruction:** *"JJ undo"*

### 2. Restore Specific Files

```bash
jj restore --from <commit_id> <file_paths>
```

**Use when:**
- Specific files need to be reverted
- Not a full operation undo, just file restore

**Example:**
```bash
jj restore --from be53692d60ff AGENTS.md README.md
```

### 3. Restore Operation State

```bash
jj op log --limit 10
jj op restore <operation_id>
```

**Use when:**
- Multiple operations need undoing
- Want to restore to specific point in history
- `jj undo` isn't enough

**Example:**
```bash
jj op log --limit 10
# Find operation ID (e.g., 06bc40a174f8)
jj op restore 06bc40a174f8
```

### 4. Abandon Commit

```bash
jj abandon <change_id>
```

**Use when:**
- Need to remove a commit entirely
- Commit was created by mistake

**Example:**
```bash
jj abandon @ opqumwys  # Abandon current and specific commit
```

### 5. Rebase to Fix Parent

```bash
jj rebase -r <change_id> -d <new_parent>
```

**Use when:**
- Commit has wrong parent
- Need to move commit in DAG

**Example:**
```bash
jj rebase -r @ -d main  # Rebase current to main
```

## Recovery Protocols

### Protocol 1: Simple Undo

**When:** Single operation was wrong

```bash
jj undo
jj st  # Verify clean state
```

### Protocol 2: Restore to Known Good State

**When:** Multiple wrong operations

```bash
jj op log --limit 20
# Find last known good operation ID
jj op restore <good_operation_id>
jj st
```

### Protocol 3: File-Level Recovery

**When:** Only specific files are wrong

```bash
jj log -r "@ | @-" --limit 10
# Find commit with good version
jj restore --from <good_commit> <file1> <file2>
jj st
```

### Protocol 4: Complete Reset

**When:** Everything is messed up

```bash
jj op log --limit 30
# Find initial good state
jj op restore <initial_state>
# OR
jj restore --from <main_commit>  # Restore all files from main
jj st
```

## User Recovery Instructions

**When user says:**

| User Says | Recovery Action |
|-----------|----------------|
| *"JJ undo"* | `jj undo` |
| *"restore it"* | `jj restore --from <commit>` |
| *"go back"* | `jj op restore <id>` or `jj undo` |
| *"abandon it"* | `jj abandon <change_id>` |
| *"start over"* | `jj op restore <initial>` |

## Examples

### Example 1: Wrong Split

```bash
# Agent did wrong split
jj split -r @ -A wrong_parent -m "message"

# User: "JJ undo"
jj undo

# Verify
jj st

# Retry with correct parent
jj split -r @ -A correct_parent -m "message"
```

### Example 2: Wrong Files Changed

```bash
# Agent changed wrong files

# User: "restore it"
jj log -r "@ | @-" --limit 10
# Find last good commit
jj restore --from <good_commit> <wrong_files>

# Verify
jj st
```

### Example 3: Multiple Bad Operations

```bash
# Agent made several mistakes

# User: "go back to before"
jj op log --limit 20
# Find operation before mistakes
jj op restore <before_mistakes_op_id>

# Verify
jj st
jj log -r "@ | @-" --limit 10
```

## Rules

1. **Undo immediately when user says undo** - Don't ask questions
2. **Verify state after recovery** - Always run `jj st`
3. **Report back** - User expects confirmation of clean state
4. **Don't repeat the mistake** - If you undid, don't do same thing again

## Common Recovery Scenarios

### Scenario 1: Wrong Parent

```bash
# Wrong
jj split -r @ -A wrong_id -m "message"

# Recovery
jj undo
jj log -r "bookmarks()"  # Find correct parent
jj split -r @ -A correct_id -m "message"
```

### Scenario 2: Wrong Commit Made

```bash
# Wrong
jj commit -m "wrong message"

# Recovery
jj undo
# Wait for correct instructions
```

### Scenario 3: Conflicts After Split

```bash
# Split caused conflicts

# Recovery
jj undo
# Try different split order or grouping
```

### Scenario 4: Accidentally Changed Files

```bash
# Files changed that shouldn't have

# Recovery
jj log -r "@ | @--" --limit 10
jj restore --from <before_changes> <files>
```

## Success Criteria

- [ ] Ran recovery command (`undo`, `restore`, `op restore`, `abandon`)
- [ ] Verified with `jj st` - shows clean state
- [ ] Verified with `jj log` - shows expected DAG
- [ ] User confirmed clean state

## User Feedback

**Positive:**
- "Good"
- "JJ undo. Now read the agents md"
- "Restore and try again"

**Negative (if you don't recover):**
- "Why didn't you undo?"
- "I said JJ undo"
- "Fuck you, undo it"

## Related Skills

- `jj-safe-split` - After recovery, retry split correctly
- `jj-squash-insert` - After recovery, retry squash correctly
