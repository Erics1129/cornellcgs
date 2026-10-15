# Giant update: sound

This is the audio stream of the Neon Harvest update. It covers the master bus, the voice pool, the cue hierarchy, plant signatures, risers, judgements, music direction, ambience, menu sounds, provenance, and how the result was measured. All audio comes from assets already on this machine: the CC0 Kenney packs in `carrot-defense-preproduction/source-assets`, the CC0 orchestral tracks already in the project, and procedural or self-made sound. Nothing was downloaded.

## Signal flow

The Unity Web player has no mixer effects, so the master bus lives in `Assets/Plugins/WebGL/CarrotMusic.jslib`. It is built once on Unity's own `WEBAudio.audioContext`, from `CarrotAudio.Awake`, before any AudioSource can play.

```
Unity SFX channels -------------------------------------------------------> sfxIn ----\
music slot A/B -> musicIn -> high shelf 2.5 kHz (intensity) -> low-pass (blind) -> trim -> duck -> sum
sum -> compressor (-18 dB, knee 6, 3:1, 10/250 ms) -> makeup (-4 dB) -> limiter (-6 dB, knee 0, 20:1, 1/100 ms)
    -> output (-0.5 dB) -> safety clipper (linear to -3 dBFS, ceiling -1 dBFS, 2x oversampled) -> analyser (1024) -> destination
```

- **Routing.** Unity reconnects each channel to `WEBAudio.audioContext.destination` every time a clip starts (`configurePanningNodes`). The bus shadows that one property on that one context with `sfxIn`. Nothing else is rerouted: `AudioNode.prototype` is never patched and other AudioContexts on the page are left alone. Exactly one node, the analyser, reaches the real destination. The music slots connect to `musicIn` directly.
- **Gains.** `DynamicsCompressorNode` applies its own automatic makeup gain (Web Audio spec), about +7 dB at these settings. The explicit makeup and output trims were therefore calibrated by measurement (see Measurements) rather than assumed. The safety clipper guarantees that no sample exceeds -1 dBFS (0.891) even when a 1 ms limiter attack lets a transient through.
- **Ducks.** Ducks act on the music only and are scheduled as AudioParam automation:

  | Trigger | Depth | Attack / hold / release |
  |---|---|---|
  | Boss telegraph | -6 dB | 80 ms / real windup / 600 ms |
  | Miniboss telegraph | -3 dB | 80 ms / real windup / 600 ms |
  | Carrot bite | -4 dB | 40 / 0 / 400 ms |
  | Boss death | -9 dB | 300 / 600 / 1400 ms |
  | Victory | -9 dB | 300 / 1400 / 1200 ms |
  | Super forge, phase break, blindness, arrivals | -6 to -4 dB | see `CarrotAudioCues` |

  When ducks overlap, the deepest depth and the latest hold end win. Every new request re-plans from the current gain, so ducks never pump. Routine shots never duck. A C# mirror of the envelope (`DuckGain`) moves the ambience bed with the music.
- **Blindness.** While Blind, Dusk, Whiteout or Blackout is active (`game.elapsed < game.blindUntil`), the music low-pass sweeps from 18 kHz to 900 Hz over 300 ms, and back over 600 ms when the effect ends.
- **Intensity.** A value from 0 to 1 sets a 2.5 kHz high shelf (-6 dB to 0) and a music trim (-2.5 dB to 0), both glided with `setTargetAtTime`:

  | State | Intensity |
  |---|---|
  | Ready | 0.3 |
  | Waves | 0.4 to 0.9 with wave progress; +0.1 above 12 enemies, -0.1 in breathers |
  | Boss on the field | 1 |

- **Page view.** `window.carrotAudioBus` exposes `{analyser, context, bpm, track, beatPhase(), level(), cues}`. `src/minigames/carrot/audioPrefs.ts` installs null-safe defaults when the page loads, and the jslib fills in the real values. `bpm` is `null` unless the playing track has a stable tempo, so the HUD beat glow stays off for rubato tracks. `cues` is a ring of 512 `[ms, name, value]` entries: waves, telegraphs, risers, bites, heartbeat beats, judgements, deadlines, music changes. The QA script uses it for timing checks.

## Voices and hierarchy (`CarrotAudio.cs`)

- **Pool.** There are 20 foley voices, up from 14. Voice bookkeeping runs on the sound clock (start, end, priority, owner), not on `isPlaying`, so allocation is deterministic and testable without an audio device.
- **Priorities.** These follow the research spec's `event_intensity`:

  | Level | Cues |
  |---|---|
  | Threat 10 | Telegraph, bite, heartbeat, deadline, result |
  | Boss 8 | Boss abilities, arrivals, phase breaks, Super |
  | Signature 6 | Plant procs, coins, judgement chords |
  | Elite 5 | Miniboss kills |
  | Kill 3 | Kills |
  | Routine 2 | Shots, impacts |

  A full pool steals the lowest-priority, most-decayed voice strictly below the request. Routine requests never steal, so routine fire is what drops first. Creature voices are capped at 5.
- **Clip limits.** At most 6 voices play the same clip at once, and a 20 ms debounce applies to a repeat of the same clip, except for threat cues.
- **Loudness budget.** The foley budget is 0.85, behind the limiter. Each class competes only with its own class and the classes above it: routine fire shares 0.6, kills 0.68, and signature and above the full 0.85. A crowd of shots can therefore never squeeze a telegraph, a bite or a boss beat. Under every boss or threat cue, routine fire also yields -4 dB for 400 ms. The SFX gain is 2.1x relative to the old mix.
- **Music level.** Music went from 0.24 to 0.40, with a hard maximum of 0.8. Per-track gains (`TrackGain`) bring each file's measured RMS (`music-provenance.json`) to about -17 dBFS, so a playlist crossfade never jumps in level.
- **Stereo.** Pan is x × 0.07, clamped to ±0.6.
- **Allocations.** Hot paths (shots, hits, creature voices) use interned keys and allocate no strings after the first event of each kind.

## Plant signatures (all 20 families)

Each shot layers a recorded CC0 Kenney transient (0-10 ms) from a round-robin bank under a synthesised body and tail from `Synth/Sig<Family>`. Each pick from a bank gets ±1 semitone and ±1.5 dB. Nine busy families also have a second synthesised take (`Sig<Family>B`: another seed, varispeed +1 to +3 semitones), so two shots in a row are never the same buffer. Higher tiers are slightly louder and lower (+7% level and -2.5% pitch per tier). Supers are 1.2x level and 0.9x pitch and add a quiet sub thump.

| Family | Transient | Body |
|---|---|---|
| seed | Grass bank, 1.55x | pop + marimba "tok" A5, air tail |
| mortar | Wood bank, 0.66x | sub drop 92→38 Hz + LP noise whump, room |
| frost | Snow bank, 1.25x | 6 inharmonic ice partials + HP hiss, shimmer room |
| prism | GlassLight bank | A5/E6/A6 glass chord with chorus |
| storm | Slice bank | FM zap 220→110 Hz through a 4k→1k band-pass + crackle |
| thunder | Slice bank, 0.7x | FM zap (shot); the strike is `SigThunder` at impact |
| book | Page | band-passed page whoosh + E4 glow |
| gravity | BookOpen, 0.57x | 140→55 Hz whomp with 12 Hz warble |
| blossom | Grass bank, 0.75x | E6-G6-A6 petal arpeggio |
| starfruit | Slice bank, 1.5x | four pentatonic pings, shimmer |
| bamboo | Wood bank, 1.45x | resonant hollow thock (420 / 1150 Hz modes) |
| chili | Chop | fire fwoosh (LP 500→3500 Hz) + crackle |
| lotus | LotusDrop stinger | two water bubbles (400→900 Hz) |
| magnet | Metal bank, 1.45x | ring-modulated metallic zing + comb |
| orchid | Snow bank, 0.71x | poison hiss + bubble pops |
| mushroom | Soft bank, 1.3x | spore puff + Karplus-Strong G3 pluck |
| cactus | Grass bank, 1.7x | needle click + A5 pluck |
| clockflower | ClockChime stinger | tick-tock + small inharmonic bell |
| dragonfruit | Wood bank, 0.65x | meteor whoosh (300→2000 Hz) + low swell |
| moonflower | MoonChime stinger | A4/E5 ethereal swell |

Impacts stay small. Kenney Soft is the default, and family-specific materials are used where they read (glass for frost and prism, metal for magnet and storm chains). Only mortar, dragonfruit and thunder carry big layers (`ImpactBoom`, `SubThump`, `SigThunder`). Thunder's routine strike is loud but never ducks.

**Kills.**
- An ordinary kill plays a kill pop from 3 synthesised takes, pitched by creature HP (bigger creatures pop lower), plus a quiet Punch variant and the creature's death voice.
- Three kills inside 300 ms become one rising coin cascade instead of a ticker.
- A miniboss kill plays `EliteBurst`, a Punch variant and 3 coins.
- A boss death plays `BossFall` (a long sub drop with rumble and a release chord), a Mining shatter, a sub thump and an 8-coin shower, with the -9 dB duck. If the level continues, the music returns to the biome playlist.

**Coins.** Ticks are spaced 60 ms apart and rise a semitone each. They play only for stipends, scenery, elites, bosses and cascades, never on every kill. A Tithe or Coin Leech plays a descending tick.

**Bites and heartbeat.**
- A bite plays Chop, a SoftHeavy variant and a sub thump, with the -4 dB duck.
- A bite that leaves 3 hearts or fewer starts an 8 s heartbeat at 72, 84 or 96 bpm (3, 2 or 1 hearts). It fades over its last 2 s and re-arms on the next bite. It never loops for minutes.

## Telegraphs, risers and the contract v2 events

- **Telegraphs.** The immediate windup cue (the caster's growl plus a material hit) plays in the same frame as the `telegraph` event. The riser is queued and sized in `Tick`, after every event of that frame has arrived (including `speedHold`).
- **Risers.**
  - Each riser is rendered at runtime to the exact real windup: `windup / speed`, or 1x while the simulation holds speed. Clips are cached on a 50 ms grid, at most 24 of them, and add 0 bytes to the data file.
  - A riser is a band-passed pink-noise sweep plus a three-note cluster that glides up, with tremolo accelerating to the commit. Its colour depends on the ability's element:

    | Element | Abilities | Colour |
    |---|---|---|
    | Earth | root, bark, uproot, rush, raise and others | Sub drone |
    | Ice | breath, mantle, whiteout, fieldFreeze | High glassy shimmer |
    | Dark | blind, dusk, gaze, blackout | Detuned low drone |
    | Storm | gust, liftoff, stormLock | Crackle grains |
    | Rift | portal blinks and summons | Resonant band |
    | Prism | Asuna's six skills | Rising pentatonic shimmer |
    | Coin | tithe | Jingle |

  - When the cast commits or is cancelled (`castRemaining <= 0`, death), the riser fades out within about 100 ms.
  - Minibosses get a quieter riser and a -3 dB duck.
- **Contract v2 events.** These are handled inside `CarrotAudio.Handle`, which CarrotView already forwards; there is no second Effect subscription:

  | Event | Sound |
  |---|---|
  | `judgement` | Chords from the orchestral `Stinger()` palette in the playing track's key; see Judgements below |
  | `bossDeadline` | 0.5 a low drum, 0.75 `AlarmDeadline75`, 0.9 `AlarmDeadline90`. Each threshold plays once per boss, with a -4 dB duck |
  | `speedHold` | A quiet tape-stop / tape-start (`HoldDown` / `HoldUp`) |
  | `waveIncoming` | Air: wing-flutter warning. Boss: low drum + sub. Mini: drum. Ground: a soft drum only for packets of 12 or more |

- **Judgements.**
  - `flawless`: tonic arpeggio with the 9th.
  - `clear`: fifth and octave.
  - `leak`: falling semitone, played immediately.
  - `phaseBreak`: low power chord over the `PhaseBreak` shatter.
  - `superForged`: high sparkle chord; `SuperForge` only if the merge has not just played it.
  - `saved`: sus4 resolving to the triad.
  - In a simulation without the contract (today's), the wave stipend carries a quiet legacy "clear" chord instead. It switches off for the session as soon as a real `judgement` arrives.
- **Phase break and Super.**
  - `phase`: `PhaseBreak` (a reverse swell into a sub and 40 glass grains) with Mining and Bell variants and a -6 dB duck.
  - `merge`: `SuperForge`, a 250 ms riser into a sub-and-shimmer impact. The orchestral Super chord lands at +250 ms, with a Bell and a -6 dB duck.

## Musical sync

`Tools/analyze_carrot_music.mjs` measures every streamed file and writes its results into `StreamingAssets/Carrot/music-provenance.json`:
- tempo (onset autocorrelation, 70-180 BPM, with a log-normal prior);
- per-16 s window tempi (tempo CV);
- beat offset;
- key (8192-point chroma against Krumhansl-Kessler profiles, with window agreement).

The .mp3 and .ogg files are measured separately because MP3 encoder delay shifts the beat phase.

| Track | BPM | Stable tempo | Key (confident) |
|---|---|---|---|
| MusicExplore | 124 | no (rubato) | A minor (yes) |
| MusicGarden | 100 | yes | B minor (no) |
| MusicMarsh | 160.6 | yes | C minor (yes) |
| MusicFrost | 88 | no | — |
| MusicOrchard | 120 | no (92% agreement) | — |
| MusicEyeball | 140 | yes | C minor (yes) |
| MusicPortal | 87.5 | yes | — |
| MusicTornado | 97 | no | C minor (yes) |
| MusicZombie | 103.5 | yes | — |
| MusicAsuna | 146 | Ogg yes, MP3 no | — |

- **Beat quantisation.** Celebration cues (judgements, the legacy clear) wait for the next beat only when the dominant track's tempo is stable, and never for more than one beat or 500 ms. Gameplay-critical cues (telegraphs, bites, sells, the wave stinger) always play at once.
- **Key.** Judgement chords use the track's key only when the key is confident; otherwise they are unpitched (Bell variants, sparkle). The wave stinger is always a war drum (`IncomingGround`) plus a sub. When the key is confident, it adds an orchestral call (root an octave down, root, fifth) from the `Stinger()` palette on the track's tonic, so a wrong-key horn never plays over the score. Every wave plays it at once.

## Music direction (`CarrotAudioMusic.cs`)

- **Playlists.** From the moment a level loads, each biome plays its own track, alternating with MusicExplore:

  | Biome | Playlist |
  |---|---|
  | Garden | MusicGarden ↔ MusicExplore |
  | Marsh | MusicMarsh ↔ MusicExplore |
  | Frost | MusicFrost ↔ MusicExplore |
  | Orchard | MusicOrchard ↔ MusicExplore |

  A short track (under 150 s) plays at most twice in a row and a long one once, and each switch is a 2.5 s crossfade.
- **Bosses.**
  - On `bossEnter`, a campaign boss restarts its own theme from the top in the other slot, with the arrival stinger. This happens even when the same file was already playing; for example, L4 garden plays MusicGarden for its waves and again for Brambleback.
  - After two loops, the theme alternates with a related battle track: Garden ↔ Tornado, Marsh ↔ Eyeball, Frost ↔ Portal, Orchard ↔ Zombie.
  - The boss theme is prefetched from the second-to-last wave, so the switch is instant.
- **Challenges.** Arenas play their guardian's theme from the first wave. Asuna keeps her tail-ending score.
- **Results.** Victory and defeat return to MusicExplore.
- **Memory.** Decoded buffers are released when their slot finishes fading. Only the next playlist entry (in its last 25 s) and an imminent boss theme are kept, which bounds decoded music to about three tracks.

## Ambience (`CarrotAmbience.cs`)

- **Beds.** Each biome has a procedural, seamless 24 s loop rendered at level load: 22.05 kHz, deterministic, 0 bytes of download.

  | Biome | Bed |
  |---|---|
  | Garden | Wind with gusts, leaf rustle, 9 bird calls |
  | Marsh | Still-water pink noise, 70 Hz-pulsed 6.1 kHz insect drone, 14 FM frog croaks from 3 frogs, water bloops |
  | Frost | Two resonant band-pass wind howls sweeping 300-1100 Hz, rumble, ice creaks |
  | Orchard | Three crickets at 4.3/4.65/4.95 kHz, warm breeze |
  | Arena | A1 + fifth drone with slow beating, filtered pink noise |
  | Prism | Four wandering high partials, chime pings, air |

- **Loop seam.** Each loop is rendered 2 s long, equal-power crossfaded tail into head, RMS-normalised to -24 dBFS, and played at -6 dB (about -30 dBFS before the bus).
- **Mixing.** The bed is 6 dB lower while enemies are alive, follows the music ducks, scales with the SFX preference, and pauses with the game.
- **Cost.** Rendering is time-sliced at one second of audio per frame. It measured 21 ms in total in Chromium for the orchard bed.

## Menus and preferences (web)

- **Menu sounds.** `src/minigames/carrot/uiAudio.ts` synthesises them with Web Audio, with no files:

  | Sound | Recipe |
  |---|---|
  | Click | Sine glide 1.2→1.8 kHz in 30 ms, 2 ms attack, 60 ms decay, peak 0.12 |
  | Open | Two-note up-chirp |
  | Close | Its mirror |
  | Hover | Soft tick |

  Once Unity has loaded, the sounds reuse its context (via `carrotAudioBus.context`) and reach the master bus. In game, `CarrotAudio.UiSound` plays the same chirps, rendered at startup by `Chirp()`, so a click sounds identical before and after Unity loads. Before that, one lazy context is created on the first gesture and closed as soon as Unity's exists, so iOS never runs two contexts at different rates. `navigator.audioSession.type = 'playback'` is set where Safari exposes it. Import settings cannot stop the ringer switch from muting Web Audio; this API is the supported route. `ui-click.ogg` and `ui-open.ogg` were deleted.
- **Preferences.** `src/minigames/carrot/audioPrefs.ts` stores device-only music, sfx and ui levels from 0 to 1 under `cgs-carrot-audio-v1`. Every access is wrapped in try/catch, the module offers get/set/subscribe and cross-tab sync, and `volumesJson()` produces the payload for `SendMessage('CarrotGame', 'SetVolumes', json)`. The campaign `sound` flag stays the single master mute; these levels only scale underneath it.
- **`CarrotAudio.SetVolumes(json)`.** It accepts a partial `{music, sfx, ui}` payload, clamps each value, and ignores invalid JSON.
- **`SetBusGains("makeupDb,outputDb")`.** This is a QA-only calibration hook.

## Assets and provenance

| Set | Files | Raw | Packed in the Web data file | Provenance |
|---|---|---|---|---|
| Synth layers (`Resources/Carrot/Audio/Synth`) | 51 WAV, 24 kHz mono | 1092 KiB (budget 1.2 MB) | 0.53 MB | `Licenses/synth-provenance.json`: generator, seed, parameters, sha256 |
| Kenney variants (`Resources/Carrot/Audio/Variants`) | 56 Ogg in 14 banks | 478 KiB (budget 0.5 MB) | 0.49 MB | `Licenses/kenney-variants-provenance.json`: pack, file, sha256, CC0 |
| Risers, ambience, stingers, wave calls, UI chirps | runtime | 0 | 0 | parameters in `CarrotAudioCues.RenderRiser`, `CarrotAmbience`, `Stinger()`, `Chirp()` |

The audio added to `carrot.data.unityweb` is **1.02 MB** (0.53 + 0.49), within the 1.5 MB budget. This is measured from the BuildReport packed-asset sizes of the audio lab build, which uses the same import settings and the same Unity version as the release build.

- **`Tools/synth_carrot_sfx.mjs`.** This is original DSP code: a TPT state-variable filter, a Freeverb-topology room, Karplus-Strong, FM, and seeded PRNG noise. Its output is TPDF-dithered and peak -1 dBFS. `--check` re-renders the WAVs in memory and fails on any byte drift. The same tool copies the Kenney variants from the on-disk preproduction archive and checks their hashes.
- **`Editor/CarrotAudioImport.cs`.** This AssetPostprocessor enforces the import settings for every clip under `Resources/Carrot/Audio`, recursively: mono, DecompressOnLoad, preload, Vorbis. Top-level clips get the exact rules of the non-recursive `CarrotModels.ConfigureAudio` (voices q0.5 at 32 kHz, foley q0.65 at an optimised rate). `Synth/` gets q0.5 at 24 kHz, and `Variants/` and any other subfolder get q0.5. `-executeMethod CarrotTD.CarrotAudioImport.Configure` reported `files=236 changed=0` against the committed metas. Because both importers agree, the characters stream can retire `ConfigureAudio` whenever it likes.
- **Credits hand-off.** The characters stream owns `ASSET-CREDITS.md` and `credits.txt`. Rows to add there:
  - "Kenney Impact Sounds and RPG Audio (CC0), 56 additional round-robin variants: see `Resources/Carrot/Audio/Licenses/kenney-variants-provenance.json`".
  - "Procedural sound layers, windup risers and ambience beds: self-made (`Tools/synth_carrot_sfx.mjs`, `CarrotAudioCues.RenderRiser`, `CarrotAmbience`), CC0 dedication; see `Licenses/synth-provenance.json` and this document".

## Measurements

### How it was measured

`scripts/carrot-audio-qa.mjs` drives levels through the documented commands in Playwright Chromium and WebKit, served from a plain static server with no custom headers. It taps everything that reaches the destination (a ScriptProcessor sum: 4096-sample RMS blocks, peak, and a count of samples at or above full scale) and records every AudioBufferSourceNode start. Its scenarios:

- `menu`: the real page under Vite, lobby clicks before Unity loads;
- `l24`: 3 min of dense combat with a mixed 10-family board, waves called early;
- `l8`: the full Lantern Regent fight;
- `asuna`: the Prism Vanguard.

`--record` writes the mix to WAV and AAC for listening.

### Build used for the browser measurements

The release, QA and dev builds of the real project all go through `CarrotBuild.Prepare`, which requires the private Asuna and licensed-FX inputs that the world stream restores. Those inputs are not present in this checkout, and the gate is never bypassed. The browser measurements therefore ran on an **audio lab** player: a separate scratch Unity project that is never shipped. It contains this branch's real simulation (`CarrotGame`, `CarrotData`, `CarrotExpansion`, `CarrotPrism`, `CarrotTypes`), the real audio code and assets, and a stand-in view that forwards events exactly as `CarrotView` does: `Handle` for every event, creature hit voices, the blindness duck, and `SetBiome` on level change. The final release build (world stream) should re-run `node scripts/carrot-audio-qa.mjs --build public/unity/carrot --scenario all --engine both`. Seeded coins are unavailable in the release player, so add `--coins 0` there.

### Results

These are the gated runs. The audio lab player (this branch's code and assets) was built with the release player's compression and stripping settings plus the `CARROT_QA` define, so the bot can seed coins for a dense board.

| Run | Outcome | Combat RMS median | p90 | Peak | Clipped | Distinct buffers | Top-7 share | Largest clip |
|---|---|---|---|---|---|---|---|---|
| Chromium L24, 3 min, dense | playing, 10 hp | -19.8 dBFS | -16.9 | -2.82 dBFS | 0 | 90 | 26.9% | 4.2% |
| Chromium L8, full boss | won, 10 hp | -19.3 dBFS | -16.2 | -2.64 dBFS | 0 | 115 | 25.9% | 4.5% |
| Chromium Asuna | won, 10 hp | -19.5 dBFS | -16.8 | -2.75 dBFS | 0 | 112 | 18.8% | 3.0% |
| WebKit L24, 3 min, dense | playing, 10 hp | -20.0 dBFS | -17.1 | -2.83 dBFS | 0 | 91 | 26.8% | 4.2% |
| WebKit L8, full boss | won, 10 hp | -19.4 dBFS | -16.2 | -2.65 dBFS | 0 | 115 | 25.6% | 4.6% |
| WebKit Asuna | won, 10 hp | -19.6 dBFS | -17.0 | -2.75 dBFS | 0 | 114 | 18.9% | 3.0% |

Gates: combat RMS median -20 ± 2 dBFS, p90 ≤ -14, peak ≤ -1 dBFS, 0 clipped samples, top-7 clips ≤ 45%, no clip above 12%, at least 80 distinct buffers. Every run above passes every gate in both engines.

Mix balance, measured on L24 with `--volumes`:
- Ready phase (music and ambience only): -21.5 to -23 dBFS.
- In combat, music alone measures -21.6 dBFS and effects alone -24.4 dBFS. Effects have the higher p90 (-18.2 against -19.3 for music), so transients sit above the score.

Cue timing, from the game's cue log against the AudioBufferSourceNode starts:
- Every wave stinger starts within 0 ms of its wave event, in both engines.
- Every boss telegraph's windup cue starts within 0-1 ms: 8 casts on L8 and 30 on Asuna, each with a riser sized to the windup.
- The heartbeat ran only at 3 hearts or fewer: see the earned-coins L8 run below.
- Blind low-pass: 2 sweeps on L8. Phase breaks: 2 on L8 and 2 on Asuna. Each boss death was counted once; Asuna's decoys die as elites.

Menus:
- In Chromium and WebKit, a lobby click on the real page (under Vite) plays 2 oscillators before Unity loads, and a second click plays 2 more.
- There is one menu AudioContext. Its clock advances (running), including in WebKit after the gesture's `resume()`.
- No `.ogg` is requested.

### Before and after, same bot commands, earned coins only

A cost-aware bot plays identical commands on both players: build while affordable, otherwise upgrade. The simulation is deterministic, so both runs end the same way.

| Run | Outcome | Combat RMS median | Peak | Distinct buffers | Top-7 share | Largest clip |
|---|---|---|---|---|---|---|
| Shipped player, L24 | 3 min, wave 3, 9 hp | -31.2 dBFS | -8.9 dBFS | 21 | 80.6% | 21.8% |
| This branch, L24 | 3 min, wave 3, 9 hp | -20.1 dBFS | -2.8 dBFS | 81 | 31.3% | 6.2% |
| Shipped player, L8 | lost at wave 4, 158 s | -29.9 dBFS | -10.1 dBFS | 27 | 84.6% | 23.6% |
| This branch, L8 | lost at wave 4, 158 s | -20.1 dBFS | -2.5 dBFS | 79 | 29.8% | 6.0% |

The losing L8 run is also the browser heartbeat check: 10 bites and 13 heartbeat beats, logged at 3, 2 (eleven times) and 1 hearts. No beat played above 3 hearts. The recordings and an index page with these figures are the listening reel for the owner. They are in the scratchpad evidence folder `carrot/audio/reel/` (7 AAC files, 26 MB).

### Not measured here

- **`bossDeadline`, `judgement`, `speedHold` and `waveIncoming`.** The balance stream emits these; this branch's simulation does not, so they were checked by the Unity AudioSystemRegression only:
  - each deadline threshold once per boss;
  - each event consumed, with its state set;
  - the speedHold real-time windups.
- **Behaviour on real phones.** Only desktop Chromium and WebKit were measured.
- **Listening quality.** No one has done a listening pass on this mix yet. The metrics show the mix is loud enough, does not clip and is not repetitive; they cannot show it sounds good. The reel exists for that review.
