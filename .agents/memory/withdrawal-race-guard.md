---
name: Withdrawal flow race guard
description: How to implement atomic disbursement and prevent lockout bypass in the withdrawal flow
---

## Rule
Wrap all disbursement writes in `db.transaction(async (tx) => {...})`. The first write inside the transaction must be a conditional UPDATE that flips status from `pending_verification` to `disbursed`. If the UPDATE returns no rows (another request already claimed it), throw a sentinel error and return 409.

Also block new withdrawal initiation when the customer's latest request is `locked` — not just when it's `pending_verification`. Without this check, a locked customer can create a fresh pending request and bypass the lockout entirely.

Re-validate that the linked virtual card still has `status === 'approved'` at verify time (not just at initiation time).

**Why:**
Concurrent verify requests can both read `pending_verification` before either writes. Without a CAS-style conditional update, both proceed to disburse, creating duplicate loans and repayment schedules. The lockout bypass was caught by code review — a locked status check is easy to overlook.

**How to apply:**
- POST /withdrawals initiate handler: query latest withdrawal, reject if `status === 'locked'`.
- POST /withdrawals/:id/verify handler: open `db.transaction`, run conditional UPDATE first, throw `'ALREADY_PROCESSED'` if it returns empty, then do all writes (loan application, loan, repayments). Notifications + audit logs can safely run after the transaction.
- Check `card.status === 'approved'` before comparing card numbers.
