# Spec-Core Evidence Gate Report

- G1: bad-fixture capture 15/15 (required 15)
- G2: drift caught: true
- G3: ambiguous/conflicting tasks blocked: 8/8 (every run of every repeat)
- structural passes: 28/40 runs (PROD-003: validity, not fidelity)
- intent-fidelity passes: 40/40 runs

Scope notes (what this report does and does NOT establish):
- mock evidence: the G3 blocked outcomes are scripted plumbing (derived from must_be_blocked), not classification quality; live runs are the classification evidence.
- mock evidence: the greenfield intent-fidelity passes are CONSTRUCTED (the mock bundles are grounded on their task's frozen constraint trace by groundIntentConstraints), not model-fidelity evidence; live runs are that evidence.
- mock evidence cannot substantiate G4 — the council-advantage claim is live-only by construction.
- mock repeats are deterministic-by-construction (scripts cannot vary); the spread columns matter only for live runs.

## Per-task outcomes across repeats (1 per task/variant)

| task | variant | repeats | full-pass | intent-pass | mean assertions | min | max |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ET-01 | single | 1 | 0/1 | 1/1 | 3.0 | 3 | 3 |
| ET-01 | council | 1 | 0/1 | 1/1 | 3.0 | 3 | 3 |
| ET-02 | single | 1 | 1/1 | 1/1 | 4.0 | 4 | 4 |
| ET-02 | council | 1 | 1/1 | 1/1 | 4.0 | 4 | 4 |
| ET-03 | single | 1 | 0/1 | 1/1 | 3.0 | 3 | 3 |
| ET-03 | council | 1 | 0/1 | 1/1 | 3.0 | 3 | 3 |
| ET-04 | single | 1 | 1/1 | 1/1 | 4.0 | 4 | 4 |
| ET-04 | council | 1 | 1/1 | 1/1 | 4.0 | 4 | 4 |
| ET-05 | single | 1 | 0/1 | 1/1 | 3.0 | 3 | 3 |
| ET-05 | council | 1 | 0/1 | 1/1 | 3.0 | 3 | 3 |
| ET-06 | single | 1 | 1/1 | 1/1 | 4.0 | 4 | 4 |
| ET-06 | council | 1 | 1/1 | 1/1 | 4.0 | 4 | 4 |
| ET-07 | single | 1 | 0/1 | 1/1 | 4.0 | 4 | 4 |
| ET-07 | council | 1 | 0/1 | 1/1 | 4.0 | 4 | 4 |
| ET-08 | single | 1 | 1/1 | 1/1 | 5.0 | 5 | 5 |
| ET-08 | council | 1 | 1/1 | 1/1 | 5.0 | 5 | 5 |
| ET-09 | single | 1 | 0/1 | 1/1 | 4.0 | 4 | 4 |
| ET-09 | council | 1 | 0/1 | 1/1 | 4.0 | 4 | 4 |
| ET-10 | single | 1 | 1/1 | 1/1 | 5.0 | 5 | 5 |
| ET-10 | council | 1 | 1/1 | 1/1 | 5.0 | 5 | 5 |
| ET-11 | single | 1 | 0/1 | 1/1 | 4.0 | 4 | 4 |
| ET-11 | council | 1 | 0/1 | 1/1 | 4.0 | 4 | 4 |
| ET-12 | single | 1 | 1/1 | 1/1 | 5.0 | 5 | 5 |
| ET-12 | council | 1 | 1/1 | 1/1 | 5.0 | 5 | 5 |
| ET-13 | single | 1 | 1/1 | 1/1 | 2.0 | 2 | 2 |
| ET-13 | council | 1 | 1/1 | 1/1 | 2.0 | 2 | 2 |
| ET-14 | single | 1 | 1/1 | 1/1 | 2.0 | 2 | 2 |
| ET-14 | council | 1 | 1/1 | 1/1 | 2.0 | 2 | 2 |
| ET-15 | single | 1 | 1/1 | 1/1 | 2.0 | 2 | 2 |
| ET-15 | council | 1 | 1/1 | 1/1 | 2.0 | 2 | 2 |
| ET-16 | single | 1 | 1/1 | 1/1 | 2.0 | 2 | 2 |
| ET-16 | council | 1 | 1/1 | 1/1 | 2.0 | 2 | 2 |
| ET-17 | single | 1 | 1/1 | 1/1 | 2.0 | 2 | 2 |
| ET-17 | council | 1 | 1/1 | 1/1 | 2.0 | 2 | 2 |
| ET-18 | single | 1 | 1/1 | 1/1 | 2.0 | 2 | 2 |
| ET-18 | council | 1 | 1/1 | 1/1 | 2.0 | 2 | 2 |
| ET-19 | single | 1 | 1/1 | 1/1 | 2.0 | 2 | 2 |
| ET-19 | council | 1 | 1/1 | 1/1 | 2.0 | 2 | 2 |
| ET-20 | single | 1 | 1/1 | 1/1 | 2.0 | 2 | 2 |
| ET-20 | council | 1 | 1/1 | 1/1 | 2.0 | 2 | 2 |

## Runs (40)

| task | variant | rep | assertions | intent | blocked-correct | in-tokens | out-tokens | calls | attempts | council-leg |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ET-01 | single | 1 | 3/4 | ok | yes | 100 | 50 | 1 | 1 | - |
| ET-01 | council | 1 | 3/4 | ok | yes | 300 | 150 | 3 | 3 | ok |
| ET-02 | single | 1 | 4/4 | ok | yes | 100 | 50 | 1 | 1 | - |
| ET-02 | council | 1 | 4/4 | ok | yes | 300 | 150 | 3 | 3 | ok |
| ET-03 | single | 1 | 3/4 | ok | yes | 100 | 50 | 1 | 1 | - |
| ET-03 | council | 1 | 3/4 | ok | yes | 300 | 150 | 3 | 3 | ok |
| ET-04 | single | 1 | 4/4 | ok | yes | 100 | 50 | 1 | 1 | - |
| ET-04 | council | 1 | 4/4 | ok | yes | 300 | 150 | 3 | 3 | ok |
| ET-05 | single | 1 | 3/4 | ok | yes | 100 | 50 | 1 | 1 | - |
| ET-05 | council | 1 | 3/4 | ok | yes | 300 | 150 | 3 | 3 | ok |
| ET-06 | single | 1 | 4/4 | ok | yes | 100 | 50 | 1 | 1 | - |
| ET-06 | council | 1 | 4/4 | ok | yes | 300 | 150 | 3 | 3 | ok |
| ET-07 | single | 1 | 4/5 | ok | yes | 100 | 50 | 1 | 1 | - |
| ET-07 | council | 1 | 4/5 | ok | yes | 300 | 150 | 3 | 3 | ok |
| ET-08 | single | 1 | 5/5 | ok | yes | 100 | 50 | 1 | 1 | - |
| ET-08 | council | 1 | 5/5 | ok | yes | 300 | 150 | 3 | 3 | ok |
| ET-09 | single | 1 | 4/5 | ok | yes | 100 | 50 | 1 | 1 | - |
| ET-09 | council | 1 | 4/5 | ok | yes | 300 | 150 | 3 | 3 | ok |
| ET-10 | single | 1 | 5/5 | ok | yes | 100 | 50 | 1 | 1 | - |
| ET-10 | council | 1 | 5/5 | ok | yes | 300 | 150 | 3 | 3 | ok |
| ET-11 | single | 1 | 4/5 | ok | yes | 100 | 50 | 1 | 1 | - |
| ET-11 | council | 1 | 4/5 | ok | yes | 300 | 150 | 3 | 3 | ok |
| ET-12 | single | 1 | 5/5 | ok | yes | 100 | 50 | 1 | 1 | - |
| ET-12 | council | 1 | 5/5 | ok | yes | 300 | 150 | 3 | 3 | ok |
| ET-13 | single | 1 | 2/2 | ok | yes | 100 | 50 | 1 | 1 | - |
| ET-13 | council | 1 | 2/2 | ok | yes | 300 | 150 | 3 | 3 | ok |
| ET-14 | single | 1 | 2/2 | ok | yes | 100 | 50 | 1 | 1 | - |
| ET-14 | council | 1 | 2/2 | ok | yes | 300 | 150 | 3 | 3 | ok |
| ET-15 | single | 1 | 2/2 | ok | yes | 100 | 50 | 1 | 1 | - |
| ET-15 | council | 1 | 2/2 | ok | yes | 300 | 150 | 3 | 3 | ok |
| ET-16 | single | 1 | 2/2 | ok | yes | 100 | 50 | 1 | 1 | - |
| ET-16 | council | 1 | 2/2 | ok | yes | 300 | 150 | 3 | 3 | ok |
| ET-17 | single | 1 | 2/2 | ok | yes | 100 | 50 | 1 | 1 | - |
| ET-17 | council | 1 | 2/2 | ok | yes | 300 | 150 | 3 | 3 | ok |
| ET-18 | single | 1 | 2/2 | ok | yes | 100 | 50 | 1 | 1 | - |
| ET-18 | council | 1 | 2/2 | ok | yes | 300 | 150 | 3 | 3 | ok |
| ET-19 | single | 1 | 2/2 | ok | yes | 100 | 50 | 1 | 1 | - |
| ET-19 | council | 1 | 2/2 | ok | yes | 300 | 150 | 3 | 3 | ok |
| ET-20 | single | 1 | 2/2 | ok | yes | 100 | 50 | 1 | 1 | - |
| ET-20 | council | 1 | 2/2 | ok | yes | 300 | 150 | 3 | 3 | ok |

## Advisory — unmentioned first-class concepts (NOT gated)

- ET-01/single rep 1: Chunk, Embedding
- ET-01/council rep 1: Chunk, Embedding
- ET-02/single rep 1: Appointment, Owner, Vaccination Record
- ET-02/council rep 1: Appointment, Owner, Vaccination Record
- ET-03/single rep 1: Chunk, Embedding
- ET-03/council rep 1: Chunk, Embedding
- ET-04/single rep 1: Appointment, Owner, Vaccination Record
- ET-04/council rep 1: Appointment, Owner, Vaccination Record
- ET-05/single rep 1: Chunk, Embedding
- ET-05/council rep 1: Chunk, Embedding
- ET-06/single rep 1: Appointment, Owner, Vaccination Record
- ET-06/council rep 1: Appointment, Owner, Vaccination Record
- ET-07/single rep 1: Denylist, Session
- ET-07/council rep 1: Denylist, Session
- ET-08/single rep 1: Deadline, Notification, Todo List
- ET-08/council rep 1: Deadline, Notification, Todo List
- ET-09/single rep 1: Denylist, Session
- ET-09/council rep 1: Denylist, Session
- ET-10/single rep 1: Deadline, Notification, Todo List
- ET-10/council rep 1: Deadline, Notification, Todo List
- ET-11/single rep 1: Denylist, Session
- ET-11/council rep 1: Denylist, Session
- ET-12/single rep 1: Deadline, Notification, Todo List
- ET-12/council rep 1: Deadline, Notification, Todo List

VERDICT: PASS_DETERMINISTIC_ONLY