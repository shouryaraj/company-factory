---
name: ux-review
description: Review a screen or flow for usability - task success, clarity, states, accessibility - and propose specific, prioritised fixes.
---
# UX review

1. Name the user and the task ("a new admin invites a teammate"). Walk the flow step by step as that user; count steps and decisions.
2. For each screen check:
   - **Clarity**: is the next action obvious? Are labels in the user's words?
   - **States**: empty, loading, error, partial, success, very long content. Each exists and helps the user recover.
   - **Feedback**: every action confirms what happened; destructive actions can be undone or are confirmed.
   - **Accessibility**: contrast at least 4.5:1, keyboard-only path works, focus visible, inputs labelled, no meaning from colour alone, works at 320px wide.
   - **Consistency** with the rest of the product.
3. Findings table: screen, issue, evidence (screenshot path or step), severity (blocks task / slows / polish), fix.
4. Top three fixes first, as concrete changes (copy, layout sketch, component).

Save to `design/reviews/<date>-<flow>.md`.
