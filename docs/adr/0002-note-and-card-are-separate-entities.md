# Note and Card are separate entities

A **note** is a record of named fields extracted from a source; a **note type** owns both the field
list and one or more **card templates**; a **card** is a note rendered through a template, and it
owns its own scheduling state. Kioku adopts Anki's separation rather than emitting flat cards.

The deciding argument is `docs/01-project-brief.md` §5, not precedent. **Vetting cost scales with
notes; study volume scales with cards.** Thirty vetted notes can yield a hundred and twenty studied
cards. A flat-card model multiplies the vetting burden by exactly the factor that makes the app
worth using, and §5 names vetting cost as the assumption most likely to kill the project. Secondly,
a wrong meaning should be **one** edit — under flat cards a bad definition is smeared across every
card derived from it, with nothing that knows they are related.

## What follows

- Note and Card are separate from day one and the Card owns its scheduling state. This is the part
  that is a rewrite if it is wrong, so it is paid for now even though v1 does not exercise it.
- The **note type** owns the templates — not the user, per note. Per-note choice would be a decision
  made thirty times per ingestion, which is the manual work `docs/01-project-brief.md` §1 exists to
  delete.
- v1 ships **exactly one template** for JLPT vocabulary: recognition (term → reading + meaning).
  Production and kanji→reading are template *additions* later, not migrations.
- Cards **schedule independently**. Recognition and production of one word have genuinely different
  difficulty and a shared schedule would drag the easy card along with the hard one. Sibling burying
  becomes necessary once a second template ships, but it is a queue-building rule and waits until then.

## The document model, rejected as a category error

RemNote and Mochi treat a note as a markdown document with cards extracted inside it, and
`docs/01-project-brief.md` §3 borrows from them. The document is real and must persist — §4.11 wants
provenance, §3 wants incremental reading — but it is not a Note. **It is a Source**, and notes are
extracted from it. Naming the two apart now is what stops §4.6 (identity) and §4.11 (provenance)
from becoming the same confused conversation.
