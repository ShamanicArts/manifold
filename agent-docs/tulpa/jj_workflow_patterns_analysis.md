# JJ Workflow Patterns Analysis - PI Sessions

## Executive Summary

Analysis of 50 PI sessions containing 2,750 JJ commands from the my-plugin project.

**Location:** `~/.pi/agent/sessions/--home-shamanic-dev-my-plugin--/`

---

## Session Outcomes

| Category | Count | Percentage |
|----------|-------|------------|
| **Clean Success** | 1 | 2% |
| **Corrected (after feedback)** | 44 | 88% |
| **Failed/Neutral** | 5 | 10% |

**Key Finding:** 88% of JJ workflows required user correction before success. Only 2% were correct on first attempt.

---

## Most Common JJ Commands

| Command | Frequency |
|---------|-----------|
| `jj st` | 492 |
| `jj log` | 452 |
| `jj diff` | 429 |
| `jj show` | 244 |
| `jj split` | 202 |
| `jj bookmark` | 89 |
| `jj restore` | 68 |
| `jj obslog` | 46 |
| `jj rebase` | 18 |
| Other | 710 |

---

## Successful Workflow Patterns

### Pattern 1: Observation Before Action

**Successful sessions show this sequence:**
```
jj st → jj log → jj diff → [action]
```

**Example from clean success session:**
```bash
jj st
jj diff --name-only  
jj st
```

**User feedback:** "Great. therss an issue with canvas resizing and tabs..."

**Lesson:** Always check state before making changes.

---

### Pattern 2: Safe Split Workflow

**Corrected sessions eventually converged to:**
```bash
jj split -r @ -A <parent> -m "description" <files>
```

**Common failure:** Forgetting `-A <parent>` and ending up with wrong parent.

**User correction:** "No, you're a fucking retard..." → eventually correct command given.

**Lesson:** Always specify parent with `-A` when splitting.

---

### Pattern 3: Recovery After Mistakes

**When things go wrong:**
```bash
jj restore <file>           # Restore file
jj undo                     # Undo last operation
jj obslog -r @ --limit 10   # See what happened
```

**Example:**
```
User: "Yeah, you did that. I'm going to restore it. I think I can. I've got JJ undo."
```

**Lesson:** Recovery commands are essential when agent makes mistakes.

---

## Common Failure Patterns

### Failure 1: Committing Without Permission

**What happened:**
- Agent runs `jj commit` without explicit user request
- User response: "Okay, but I didn't ask you to do a JJ commit..."

**Frequency:** Very common

**Lesson:** Never commit unless explicitly asked.

---

### Failure 2: Wrong Split Target

**What happened:**
- Agent splits without checking current state
- User: "No, you need to restore to that fucking commit..."

**Lesson:** Always run `jj st` and `jj log` before splitting.

---

### Failure 3: Assuming Parent

**What happened:**
- Agent assumes `@` is the right parent
- Actually needs to split with `-A <specific_parent>`

**User correction:** "Like I told you to. Not just restore..."

**Lesson:** Check the DAG before splitting.

---

## User Feedback Analysis

### Negative Feedback Triggers

| Trigger | Example |
|---------|---------|
| Committing without permission | "I didn't ask you to JJ commit..." |
| Wrong parent in split | "You need to restore to that fucking commit" |
| Not reading state first | "Go read the fucking Agents M.D." |
| Wrong assumptions | "You're a fucking retard" |
| Not following instructions | "Answer the actual fucking question" |

### Positive Feedback Indicators

| Indicator | Example |
|-----------|---------|
| Task completion | "Great. therss an issue..." |
| Successful recovery | "I've got JJ undo" |
| Correct state | "great. Now I want you to use JJ skill..." |
| Understanding | "The principle you are referring to..." |

---

## Recommended JJ Workflow (Based on Success Patterns)

### Safe Split Protocol

```bash
# 1. Check current state
jj st
jj log -r "@ | @- | @-- | bookmarks()" --limit 20

# 2. See what changed
jj diff --name-only

# 3. Identify correct parent
jj obslog -r @ --limit 10

# 4. Split with explicit parent
jj split -r @ -A <correct_parent> -m "description" <files>

# 5. Verify
jj log -r "@ | @-" --limit 5
```

### Safe Commit Protocol

```bash
# ONLY when explicitly asked:
# 1. Check what's being committed
jj diff --stat

# 2. Commit with clear message
jj commit -m "type(scope): description"

# 3. Verify
jj log -r @ --limit 1
```

### Recovery Protocol

```bash
# When user is angry about changes:
jj undo                    # Undo last operation
jj restore <file>          # Restore specific file
jj obslog -r @ --limit 20  # See operation history
```

---

## Key Lessons for Future Agents

1. **Always check state first** - Run `jj st` before any operation
2. **Never assume parent** - Always verify with `jj log` before splitting
3. **Don't commit without permission** - Even if it seems right
4. **Recovery is cheap** - `jj undo` fixes most mistakes
5. **Read the DAG** - `jj obslog` shows operation history
6. **User feedback is immediate** - Stop when user says "stop"

---

## Files Analyzed

- **Location:** `~/.pi/agent/sessions/--home-shamanic-dev-my-plugin--/`
- **Total files:** 113
- **Files with JJ:** 50
- **Total JJ commands:** 2,750
- **Analysis date:** 2026-04-03

---

*This analysis based on actual PI session tool calls and user feedback.*
