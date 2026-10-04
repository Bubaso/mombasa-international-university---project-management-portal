/**
 * Every colour a chart draws with, in one place, split by the job it does.
 *
 * This replaces seven constants that were spelled out twice — once in
 * GanttPanel, once in CurvePanel — and that mixed three different jobs into
 * one list: two series colours, three status colours and the axis ink. The
 * design requirements asked for that list to pass the categorical palette
 * validator. It failed. But it failed mostly for the wrong reason, and
 * finding that out changed what needed fixing.
 *
 * Measured with the dataviz validator, which is the instrument the
 * requirement names:
 *
 *   node scripts/validate_palette.js "<hex,hex,...>" --mode light --pairs all
 *
 * ---------------------------------------------------------------------------
 * CATEGORICAL — identity. Which series is this?
 *
 *   Blue and orange, unchanged, because they were never the problem. On all
 *   pairs: ΔE 24.7 under protanopia, 33.6 to full colour vision, both above
 *   the floors, chroma and surface contrast fine. ALL CHECKS PASS.
 *
 *   A magenta replacement was tried and measured worse (ΔE 14.0), which is
 *   the only reason this comment exists: changing a correct colour because a
 *   list containing it failed a check would have been churn dressed as a fix.
 *
 *   Two slots is the honest limit, not a placeholder. Violet #6c71c4 as a
 *   third passes while it is only ever drawn beside magenta and fails beside
 *   blue (ΔE 2.9 protan, 6.9 normal) — a palette correct in one arrangement
 *   only is a trap for whoever adds the next chart. A third series is a
 *   second chart, a facet, or a composite encoding; never a new hue.
 *
 * ---------------------------------------------------------------------------
 * STATUS — state. Is this fine, or is it bad?
 *
 *   Reserved, and that is the rule the old set broke: green and red sat in
 *   the same list as the series colours, so "series 3" and "this is
 *   critical" were the same kind of thing.
 *
 *   Neither validator fits a status palette, and the measurements say so
 *   rather than the comment asserting it:
 *
 *     as a categorical palette → FAIL. Severity is deliberately a warm
 *       sweep, so warning↔serious land ΔE 1.4 apart under deuteranopia.
 *       Right design, wrong instrument.
 *     as an ordinal ramp → FAIL on "single hue": 66° of spread. Also right
 *       design — yellow through red is what severity means — and again the
 *       wrong instrument.
 *
 *   The dataviz method lists the status palette as its own parameter for
 *   exactly this reason, and says its legibility comes from shipping with an
 *   icon and a label, never from colour alone. So what this set is actually
 *   held to, in tests/palette.mjs:
 *
 *     1. No value shared with CATEGORICAL.
 *     2. Every mark clears 3:1 against the chart surface.
 *        good 3.08, warning 3.13, serious 5.92, critical 9.20.
 *     3. good↔critical is separable without colour vision. This is the one
 *        distinction a reader takes at a glance, and where the old palette
 *        was genuinely broken: #0ca30c against #d03b3b is ΔE 4.1 under
 *        deuteranopia, which is indistinguishable. Teal against dark red is
 *        23.3.
 *     4. Severity falls light to dark — L 0.654, 0.515, 0.413, each step at
 *        least 0.06 apart — so the order survives greyscale and print even
 *        where hue does not.
 *
 *   One pair sits close on purpose and is worth naming: `warning` against
 *   the orange series is ΔE 12.5, under the 15 floor. They never appear as
 *   the same kind of mark — the Gantt draws phases as bars and milestones as
 *   shapes, and its legend names the shapes — which is the secondary
 *   encoding the method asks for in exactly this case. `serious` was moved
 *   from #cb4b16 to #b03a0f to take the equivalent pair from 9.0 to 15.7,
 *   because that one cost nothing.
 *
 * ---------------------------------------------------------------------------
 * INK and GRID — neither identity nor state.
 *
 *   Axis labels are text, so ink answers to text contrast, not to the chroma
 *   floor. The old #586e75 failed that floor "for reading grey", which was
 *   the validator correctly answering a question nobody should have put to
 *   it: grey is what an axis label ought to be. #475569 gives 7.58:1 on
 *   white, past the 4.5:1 of T9-01.
 *
 *   Grid rules recede on purpose. 1.23:1 is the intent, not an oversight.
 */

/** Series identity, in fixed order. Never cycled; never a status colour. */
export const CATEGORICAL = ['#2a78d6', '#eb6834'] as const;

/** Tints of the slots above, for the area under a line or inside a bar. */
export const CATEGORICAL_FILL = ['#9ec5f4', '#f7c4ae'] as const;

/** Reserved. Always drawn with an icon and a word beside it (T9-02). */
export const STATUS = {
  good: '#2aa198',
  warning: '#b58900',
  serious: '#b03a0f',
  critical: '#8c1220',
} as const;

/** Axis and label text. Held to text contrast: 7.58:1 on white. */
export const INK = '#475569';

/** Grid rules, deliberately recessive: 1.23:1 on white. */
export const GRID = '#e2e8f0';

export type StatusKey = keyof typeof STATUS;
