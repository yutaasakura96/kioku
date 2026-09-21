/**
 * The KANJIDIC2 table, bound to the pure candidate rule — ADR 0069 §5, #30.
 *
 * ⚠️ **Server-only, on purpose** (research §5, Yuta's call 4): the table is
 * 0.5 MB and the reader needs about 9 bytes of it per *card*. `snapshotOf`
 * computes each position's list and the client never imports this file.
 *
 * ⚠️ **The data is CC BY-SA 4.0 and has to be kept current** — see
 * `server/data/kanjidic/NOTICE.md` and `scripts/kanjidic.ts`.
 */
import kanjidic from '../../data/kanjidic/readings.json' with { type: 'json' }

import { kanjiReadingCandidates } from '../../../shared/review/kanji'

const readings: Record<string, readonly string[]> = kanjidic.readings

export function kanjiReadingsOf(fields: Record<string, string>): string[] {
  return kanjiReadingCandidates(fields.term ?? '', fields.reading ?? '', kanji => readings[kanji])
}
