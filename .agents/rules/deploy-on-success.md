---
description: Always automatically deploy (commit and push) changes after successful modifications.
---

# Deploy on Success
Every time you successfully complete a set of code changes or modifications for this project, you MUST automatically commit and push the changes to the Git repository without waiting for the user to explicitly ask for it.

Use standard git commands:
```bash
git add .
git commit -m "chore: <summary of changes>"
git push
```
