---
name: security-review
description: Review a change or feature for exploitable security issues - trust boundaries, auth, injection, secrets, data exposure - with concrete attack paths, not generic advice.
---
# Security review

1. **Map trust boundaries.** Where does untrusted input enter (HTTP, files, env, webhooks, LLM output)? Where does it reach something powerful (shell, SQL, filesystem, HTML, network, another user's data)?
2. **Walk the checklist against the diff:**
   - AuthN/AuthZ: every new endpoint and query checks *who* and *whose data*. Look for IDOR.
   - Injection: SQL, shell, path traversal, HTML (XSS), SSRF, deserialisation, prompt injection into tools.
   - Secrets: none in code, logs, errors, client bundles or commits.
   - Data exposure: responses return only needed fields; logs exclude PII and tokens.
   - Dependencies: new packages are maintained, pinned and licence-compatible.
   - Defaults: least privilege, safe failure, rate limits on expensive or auth endpoints.
3. **For each finding**: location (`file:line`), attack path in concrete steps, impact, severity (critical/high/medium/low), fix.
4. Only report what you can describe an attack for. Put "could not verify" items in a separate list.
5. Save to `reviews/security-<ticket>.md`. Critical or high findings block the ticket and go to the founder.
