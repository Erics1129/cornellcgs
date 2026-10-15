/**
 * Campaign labels and pips come from measurement, not from a stage's slot in its chapter: the novice bot R2's win rate per level in
 * docs/carrot-defense/giant-update/difficulty-bands.json (polish pass, 100 seeds each). LevelSelect maps it to NORMAL (60% or more),
 * HARD (40-60%) and EXPERT (under 40%), and to 1-5 pips. scripts/carrot-ui-qa/unit.mjs fails when this row drifts from the bands file,
 * so re-copy it whenever the bands are re-run.
 */
export const measuredR2=[1,1,1,.99,.69,.84,.48,.43,.71,.42,.41,.42,.57,.43,.43,.36,.46,.43,.37,.43,.6,.5,.38,.31]
