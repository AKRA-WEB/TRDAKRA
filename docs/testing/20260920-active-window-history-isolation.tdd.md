# TDD Evidence: Active Dispatch Window and Full History Isolation

Source plan: derived from the reported TRDAKRA bug; no separate plan file.

User journey: As a warehouse user, I want opening `ประวัติ` to preserve the
current `รอจัด` queue, so old pending rows from full history are not added to
today's dispatch work.

| Guarantee | Test | Result |
|---|---|---|
| Full-history rows do not inflate the current dispatch queue after returning to W2 | `tests/active-window-history-isolation.test.cjs` | RED before fix; GREEN after fix |
| History, receipt, mobile navigation, and identity/session behavior remain intact | `tests/history-remediation-and-received-qty.test.js`, `tests/performance-history.test.cjs`, `tests/trdakra-mobile-navigation.test.js`, `tests/identity-state.test.cjs` | PASS |
| Frontend source compiles and version parity remains valid | `tests/history-remediation-and-received-qty.test.js` | PASS |

Implementation keeps the active-window item IDs separate from the full
`state.items` history loaded by `getFullHistory`. Operational W1/W2 counts and
lists use the active IDs; history and analytics retain the full dataset.

Coverage gap: the repository has no configured coverage runner for this static
HTML/VM test harness. `node --test tests/*.test.js` was attempted but Windows
sandbox worker creation returned `EPERM`; the affected tests were rerun directly
and passed serially.
