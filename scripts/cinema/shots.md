# Shot list: the resting compositions of every runway

A "shot" is a picture the reader may rest on. Between two shots the picture is in transit
(a dissolve, a card in the air, a title swap); such a stretch is either short enough to be a
finished picture itself, or it is declared as a rest gap (`setRestGaps`) so the deck settles the
picture on the nearer shot when the page stops.

`node scripts/cinema/probe/shots.mjs <url> <outdir> [desktop|phone|touch]` teleports to every
shot below and to the middle of every gap, saves a JPEG of each and prints where the deck
settled (`run` is where the page is, `vrun` is what is drawn). The lead looks at every JPEG.

Positions are fractions of the chapter's run (0 = the stage has just stuck, 1 = it lets go).

| Chapter | Owner of the picture | Shots | Rest gaps |
|---|---|---|---|
| AlphaGo (205svh) | film (Go board) | 0: board and words (words are complete when the stage sticks); 0.9: stones played | none: the board drift is continuous |
| What we do (260svh, wide screens, 5 cards or fewer) | scroll-core | 0: heading and the deck; one shot per dealt card (card i begins at 0.04 + 0.15 i and takes 0.34); 0.95: the whole hand | none needed: each card is a latched reveal, so a card that has left the deck lands and turns over by itself when the page stops |
| Code (290svh) | scroll-core | 0: words and laptop, file dim; 0.54: file typed; 0.67: command typed; 0.95: run finished | none: typing is a continuous, legible state |
| ML (240svh; 220 narrow) | scroll-core (film), film (grade) | 0, 0.33, 0.66, 1 of the film | none: any frame of the film is a picture; stills cover for the video |
| World (660svh) | scroll-core (words, timing), film (globe, travel canvas) | 0 to .22 globe and words; .30 globe alone; .37 to .43 Bali; .475 to .533 Hawaii; .577 to .635 Dolomites; .677 to .735 Iceland; .775 to .833 New York; .873 to 1 Cornell and every credit | `EARTH_REST_GAPS` in `src/lib/earthJourney.ts`: [.22,.30] words fade, [.30,.37], [.43,.475], [.533,.577], [.635,.677], [.735,.775], [.833,.873] dissolves |
| Universe (520svh; 440 under 768 px) | film | three legs, one title each | film declares them: SPEC says [.30,.36] and [.66,.72] |
| Soda (300svh) | scroll-core | 0: ice above the glass, "Drop in."; 0.5: the plunge; 0.74 to 1: ice afloat and the invitation | none: any frame of the film is a picture; the invitation is a latched reveal over .62 to .74 |

World timing, checked against "the reader can see everything": with a 560svh run every photograph
holds still for at least 30svh of scroll between dissolves (Bali 33.6, the others 32.5) and the
last frame, with all the credits, for 71svh. No gap is wider than 8% of the run (45svh).


## Film: Universe runway (merged from shots-film.md at integration)


Resting compositions of `#universe` (progress = `vrun` of the chapter). The probe should teleport to each
shot and to the middle of each gap and save a frame.

| Shot | Progress | What a reader at rest sees |
|---|---|---|
| U1 flypast | 0.00 to 0.30 | Title "Two decks". Deep star field with dust; the blue spiral galaxy grows from small (0.04) to filling the left half (0.30). |
| gap | 0.30 to 0.36 | Title swap (rest gap): at rest the picture settles on 0.30 or 0.36, never between. |
| U2 tunnel | 0.36 to 0.66 | Title "Four players". The blue and violet tunnel around a dark aperture; from 0.62 the second galaxy is visible in its centre. |
| gap | 0.66 to 0.72 | Title swap (rest gap). |
| U3 arrival | 0.72 to 1.00 | Title "More deals than stars". The warm galaxy grows from a small object among stars (0.76) to full frame (0.96). |

Posters (shown until the canvas is live, and whenever the context is lost): `universe-0/1/2.webp`, one per shot, chosen by `data-leg`.
Reduced motion and no WebGL2: one screen, poster U3, title "More deals than stars".
