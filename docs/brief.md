# cornellcgs.org beta build brief

Read this whole file before touching anything. Then write a short plan, then build phase by phase in the order at the bottom. Every effect in here is required, not optional. If something is truly impossible, say so and propose the closest thing, do not quietly drop it.

Work in the current folder. Install whatever you need without asking. After every phase, run the dev server, take Playwright screenshots at 1440 wide and 390 wide, look at them, and fix what looks wrong before moving on. Commit after every phase.

## 0. Reference images

The assets folder next to this file holds the references. Copy them into public/assets/ and keep the names.

globe_reference.png. A dark globe made of dotted continents, orange country dots with mono labels, a blue atmospheric rim at the bottom and a warm rim at the top. This is the World section. It will be turned into a slowly rotating video outside of this project, see 5.9. You do not make the video. Do not try to generate or fake it with AI. Build around a video file and give a fallback.

flip_before_blue.png. Deep navy to blue gradient, brighter at the bottom, soft vignette in the corners. This is the site background before the hero card is flipped. Background only, match this gradient.

flip_after_red.png. Deep wine to red gradient, brighter at the bottom, same vignette. This is the site background after the hero card is flipped. Background only, match this gradient. The cards in these two pictures are also a fair reference for how the hero card should look, an ornate dark back with silver filigree, and an aged ivory ace of spades face.

blackhole_math.jpg. A black hole bending a wall of handwritten math equations. This is the backdrop of the Our Machine Learning process section, see 5.10. It explodes when the user reaches it.

## 1. What we are making

A one page beta site for the Cornell Computational Game Society, CGS, at cornellcgs.org.

Page flow copies cornellmcsa.com. Hero, who we are with counters, what we do in threads, a machine learning section, events, world, people, an open invitation, contact, footer.

Motion feel copies citadel.com. Buttery smooth scroll. Sections do not sit there, they arrive. Text rises in lines, images settle into place, the background keeps drifting, and the whole thing feels like one continuous scene the camera moves through.

The hero has a live typing line like cuai.github.io, where the last words keep changing.

The visual language is playing cards. The card itself, its face, its back, its edge, the way a hand fans, the way a dealer flips. Not chips, not dice, not felt tables. Cards.

Everything must look unconventional and expensive. If a section looks like a template or a Tailwind starter, redo it.

All fonts must be big and clear. Nobody should squint. Body text is 19 px on desktop and 17 px on mobile, never smaller. Headings are huge. No thin weights anywhere. Body text contrast against the background is at least 7 to 1.

Anything we do not know yet is marked TODO in this brief. Write believable placeholder copy so the site looks finished, and keep the word TODO in the source next to each placeholder so we can find them later.

## 2. Stack

Vite, React 18, TypeScript, Tailwind v4.
Three.js through React Three Fiber and Drei for the 3D hero card and the gradient background.
GSAP with ScrollTrigger for scroll animation.
Lenis for smooth scroll.
Canvas 2D for the moving code layer, the glass shatter layer and the black hole particle burst.
No backend, no CMS. All words live in one file, src/content.ts, so we can edit copy without touching components.

Static build to dist. Add a GitHub Actions workflow that builds and deploys to GitHub Pages on every push to main. Add public/CNAME containing cornellcgs.org and an empty public/.nojekyll. Vite base is "/".

## 3. Design tokens

Two color worlds. The site starts in Blue. Flipping the hero card switches everything to Red. Flipping again goes back. Put every color in CSS variables on the html element under a data theme attribute, and transition all of them over 800 ms.

Blue world, match flip_before_blue.png
background top #03071A
background middle #0B2A6B
background bottom #3B5FB8
glow #2F6BFF, a big soft radial glow low on the screen so the bottom of the page lights up
text #F2F5FF
muted text #A9B4D6
neon core #E8FBFF
neon mid #4EA8FF
neon dim #12336B

Red world, match flip_after_red.png
background top #1E0406
background middle #7A1518
background bottom #B84A4A
glow #E0313C
text #FFF4F0
muted text #E1B3AE
neon core #FFF1E6
neon mid #FF6A3D
neon dim #5A1014

Card colors, same in both worlds
ivory #EFE6D2, aged, with faint paper grain
ink #0B0B0F
silver #C9CDD6 for the filigree on the back
red #C8102E, Cornell red, used only on a tiny Cornell C on the face

Type
Display is Fraunces, variable, weight 600 to 700, optical size 144, italic on one or two emphasis words per heading. Hero title size clamp(3.4rem, 9vw, 9.5rem), line height 0.95, letter spacing slightly negative. Section headings clamp(2.6rem, 6vw, 6rem).
Body is Manrope, 500 and 700.
Utility and code is JetBrains Mono, weight 500 or heavier, never below 14 px. The typing line, eyebrows, counters, labels and the code background all use it.
Load fonts from Google Fonts or self host, either is fine.

Section marks
Every section carries a card index in its top left corner, rank and suit stacked exactly like the corner of a real card. Hero is A♠, Who we are is K♠, What we do is Q♠, Our Machine Learning process is J♠, Events is 10♠, World is 9♠, People is 8♠, Join is the Joker. This is the numbering system for the page. The suit glyph is neon mid, the rank is ivory, both large enough to read from across a room.

Spacing
Generous. Section padding around 20vh top and bottom on desktop. Content max width 1280. Big type, few words, lots of air.

## 4. Page structure

Nav
A floating pill, glass blur, no visible border until hovered. Left side is a tiny playing card logo that reads CGS. Links are Who we are, What we do, ML, Events, World, People, Join. On scroll down it slides up out of view, on scroll up it slides back. Active link gets a small suit glyph under it.

Hero, A♠
Full viewport. Left half is text, right half is the 3D card.
Eyebrow in mono reads Cornell University · Registered student organization.
Title reads Cornell Computational Game Society in Fraunces, huge, broken over three lines.
Under it the typing line, mono, reads We do research in and then the rotating words. See 5.4.
Two buttons, Join CGS and See what we do.
Small scroll hint at the bottom, a card that slowly tips forward and back.

Who we are, K♠
Two hole cards laid side by side, slightly rotated toward each other like a player peeking. Left card is text. Heading reads Games, solved with computers. Two short paragraphs, TODO real copy. Placeholder says we are Cornell students who study games with code, poker, board games, auctions, anything with players and payoffs, and we build the solvers, train the agents and run the math.
Right card is a photo placeholder with a soft gradient and the words TODO team photo.
Under the cards, four counters styled as card corner indices. Members TODO, Countries TODO, Projects TODO, Founded TODO. They count up from 0 when they enter the viewport.

What we do, Q♠
This section is a poker board. Five community cards dealt face down in a row. As the user scrolls, the section pins, and the cards flip face up one at a time, three first as the flop, then the turn, then the river. Each face carries one thing we do.
Placeholder threads, TODO real ones
1 Study nights, weekly sessions on game theory, ranges and equilibrium
2 Research, projects on solvers, agents and equity math
3 Build, bots that actually play, tools and papers
4 Tournaments, friendly events with real structure and zero buy in
5 Talks, guests from quant, poker and academia
Heading reads How we play. Scrolling past the river unpins and the board slides away.

Our Machine Learning process, J♠
Full bleed section on the black hole image. Title reads Our Machine Learning process. Five steps come out of the hole, see 5.10. Placeholder steps, TODO real ones
1 Frame the game, states, actions, payoffs
2 Build the environment, a simulator and self play
3 Train, counterfactual regret minimization and deep reinforcement learning
4 Evaluate, exploitability and head to head matches
5 Ship, bots that play, tools people use, papers
Every step is a card with a big number, a big title and one plain sentence.

Events, 10♠
A fanned hand of five to seven event cards held at the bottom of the section like a player holding cards. On hover the hand spreads wider and the hovered card lifts. Click opens a detail panel. Placeholder events, TODO real ones, fall kickoff, solver workshop, alumni night, charity tournament, spring banquet.

World, 9♠
Left is the rotating globe video, right is text. Heading reads Wherever you are from, you have a seat at this table. Subtext reads We welcome members from every country and every skill level, TODO count of countries. See 5.9.

People, 8♠
Team members as playing cards in a grid. Front is name, role and a portrait placeholder. Hover tilts the card toward the cursor, click flips it to show a two line bio. Placeholder names, TODO. Six to eight cards.

Join, Joker
One big card shaped panel, heading reads Pull up a chair. One line of text and a single button, Apply to CGS, linking to TODO form url.

Contact and footer
Email TODO, Instagram TODO, WeChat TODO, mailto link. Footer says This organization is a registered student organization of Cornell University and the year. The sound toggle from 5.6 lives here.

## 5. Effects

### 5.1 Gradient background

A fixed full screen WebGL plane with a fragment shader. Vertical gradient from background top through middle to bottom, matching the reference images, plus a large radial glow anchored near the bottom center that breathes slowly, scale pulsing about 4 percent over 6 seconds, plus a corner vignette. A faint grain overlay so it never looks flat. The glow position also follows scroll progress a little, drifting up as the user goes down so each section feels lit differently. Colors come from the theme variables and lerp in the shader when the theme flips.

### 5.2 The hero card

One realistic 3D playing card. Rounded rectangle geometry, 2.5 by 3.5 units, thickness about 0.02, corner radius about 0.12. Physical material with clearcoat 1, clearcoat roughness 0.15, roughness 0.35, environment reflections from a Drei environment preset so light slides across the face when it moves.
Front face is a canvas or SVG generated texture, an ace of spades in the style of flip_after_red.png. Aged ivory, a large ornamental spade in the center with fine filigree inside it, A♠ indices in two corners, the letters CGS worked small into the spade, a tiny Cornell red C near the bottom index.
Back face is in the style of flip_before_blue.png. Near black navy, a silver filigree frame, a silver medallion in the middle, a faint repeating micro pattern behind it.
Generate both faces yourself at high resolution, do not paste the raster references onto the card.
The card starts face down, back showing, in the Blue world.
Idle it floats, slow sine bob and a slow yaw of a few degrees, with a soft contact shadow underneath like the references.
It tilts toward the cursor up to about 12 degrees on both axes.
Left click flips it 180 degrees around its vertical axis with a spring, about 0.9 seconds, tiny overshoot.
Click and drag rotates it freely, release lets it spin down with inertia and settle to the nearest face.
On touch, tap flips, drag rotates.

### 5.3 Theme flip

Every time the card lands on a new face, the theme switches. Face down is Blue, face up is Red. Do the flip as a wipe, not a fade. A radial reveal that starts from the card and expands to cover the screen over about 800 ms, timed so the wipe passes the card at the exact moment the face turns. All CSS variables, the shader gradient, the neon colors and the code layer tint follow.

### 5.4 Typing line

We do research in followed by a rotating list. Placeholder list, TODO real topics. computational game theory, poker solvers, counterfactual regret minimization, reinforcement learning for games, imperfect information games, multi agent learning, equilibrium computation, mechanism design.
Type each word letter by letter at 55 to 90 ms per letter with slight randomness, hold 1.6 seconds, delete at 35 ms per letter, short pause, next word. A blinking block cursor in neon mid. Mono, at least 22 px on desktop. Store the list in content.ts.

### 5.5 Moving code background

A fixed full screen Canvas 2D layer behind all content and above the gradient. Twelve to twenty columns of mono code lines drifting upward at different speeds between 8 and 30 px per second, restarting from the bottom when they leave the top. Alpha between 0.06 and 0.18. Tokens colored, keywords in neon mid, strings in a warm amber, comments dimmer. Every few seconds one random line pulses bright for a moment, like a compile flash. The layer moves at 0.3 times scroll speed for parallax. Pause it when the tab is hidden.
The code content is real. Use a small poker hand evaluator, a counterfactual regret minimization update, an equity calculation function and a few snippets copied from this site's own components. No lorem code.
In Red world the token colors shift toward orange and rose.

### 5.6 Glass shatter on click and drag

This is the fun one and it has to be convincing. A transparent full screen Canvas 2D layer on top of the code layer. When the user presses the left mouse button on empty background and drags, the code layer behaves like a pane of glass being scratched and cracked along the drag path.

What happens
At pointer down, an impact point. A small ring and five to nine jagged radial cracks with two levels of branching, lengths 40 to 140 px, each segment displaced with noise so nothing is straight.
While dragging, every 10 to 14 px of travel add a new crack node along the path. Nodes link to the previous node with a bright fracture line, then spawn one to three short side branches. Fast strokes make longer branches. This is the scratch trail.
Every 60 to 90 px of travel, or when stroke speed spikes, a break event. Build eight to sixteen shard polygons around that point, Voronoi style cells inside a radius of 60 to 140 px. Each shard shows the code layer sampled through it but shifted 3 to 8 px and scaled about 1.03, so it reads as refraction. Shards separate a few pixels, rotate slowly, fall with light gravity and fade. Add specular streaks, thin white lines at a shared angle across several shards so they look like they catch the same light.
Tiny glass dust, 20 to 40 dots per break event, ejected from the point with random velocity, gravity, quick fade.
Fracture lines are drawn with a thin white core over a wider soft neon mid glow, composite mode lighter.
Screen shake. On every break event, translate the page wrapper randomly within ±3 to ±6 px and rotate within ±0.2 degrees, decaying over about 250 ms. Intensity scales with stroke speed. Cap it so a long fast stroke never feels sick.
Trail fade. Each crack node starts fading 800 ms after it is created even while the drag continues, so the stroke reads as a trail behind the cursor. After pointer up, everything fades over about 1 second and the canvas clears.
Sound is off by default. Include a tiny glass tick sample and a mute toggle in the footer, muted until the user turns it on.

Rules
Only start on background. Never start on links, buttons, inputs, the card, the globe, the black hole section or any element with data interactive. Never break text selection inside content. Use pointer events. Keep an object pool, cap at 400 live shards and 800 dust particles, cap device pixel ratio at 2. On touch devices, a single tap on background makes one small break event and no drag behavior. Skip the whole thing when prefers reduced motion is set.

### 5.7 Neon edges, hover only

Every box shaped element can glow, but nothing glows until the cursor is over it. Nav pill, buttons, the two hole cards, the five community cards, the five ML step cards, event cards, people cards, counters, form fields, the join panel, the event detail panel.

How
The element gets a pseudo element inset 0 with a 1.5 px ring, made with a conic gradient masked to the border only using mask composite. The gradient is mostly neon dim with one hot segment about 12 percent wide that goes neon mid to neon core to neon mid, plus one or two faint secondary blooms, so at any moment one edge is bright and the far edge is faint. The gradient angle animates 0 to 360, about 5 seconds per lap, so the hot segment travels around the perimeter like a comet. A second pseudo element, same gradient, blurred 14 px, opacity 0.45, sits behind for the bleed.
Default state is opacity 0 and the animation paused. On hover the ring fades in over 150 ms and the comet starts running. On leave it fades out over 300 ms and the animation pauses. Keyboard focus visible behaves exactly like hover so keyboard users get it too. On touch a tap shows the glow for 600 ms.
Colors come from the theme variables so the glow is blue in Blue world and orange red in Red world.
With prefers reduced motion the ring still appears on hover but does not move.

### 5.8 Scroll scenes

Lenis smooth scroll with lerp about 0.08. GSAP ScrollTrigger drives everything.
Headings split into lines, each line masked and rising from 100 percent with a stagger of 0.06 seconds and blur from 8 px to 0.
Paragraphs fade and rise 24 px.
Cards and images enter with a small 3D tilt of about 6 degrees that settles to flat, scale 0.94 to 1.
Counters count up over 1.4 seconds when visible.
The hero card is part of the scene. As the user scrolls into Who we are it scales to about 40 percent and drifts to the right margin, still tilting with the cursor. When What we do pins, the WebGL card fades out and the five DOM community cards fade in at the same spot, then get dealt across the board. So the card visibly becomes the deck. When the ML section begins the board slides away.
What we do pins for about 2.5 viewport heights and the five flips are scrubbed to scroll, flop at 0.2 to 0.5, turn at 0.65, river at 0.85.
The gradient glow drifts with scroll as described in 5.1.
Use a single fixed canvas for all Three.js content and move things in world space with scroll progress, do not mount a new canvas per section.

### 5.9 World, the rotating globe video

The globe is a video, not a 3D scene. The video is made outside this project by the site owner with a free AI video tool such as Google Whisk animate, Luma Dream Machine or Kling, from globe_reference.png. You do not generate it, you build around it.

Files
public/assets/globe.mp4, and public/assets/globe.webm if available. Poster is public/assets/globe_reference.png. If the video file is missing, print one clear console warning with the expected path and use the fallback below. The site must still look finished without it.

Player
Autoplay, muted, loop, playsinline, preload metadata, lazy mounted when the section is near the viewport. Square or the source aspect, object fit cover, rounded corners, the same soft contact shadow the cards have.

Seamless loop
AI clips rarely loop cleanly. Use two overlapping video elements. When the playing one is 0.6 seconds from its end, start the other from 0 and crossfade over 0.6 seconds, then swap roles. The globe must never visibly jump.

Make it movable
Pressing and dragging horizontally on the globe scrubs the video time, so the globe follows the hand and appears to spin under the cursor. Release resumes normal playback from where it stopped. Touch drag works the same. Wheel events pass through to the page.

Fallback with no video
Show the still image with a very slow 60 second horizontal drift inside its frame, a gentle parallax on scroll, and a slow pulse on a blue rim glow drawn around the frame. Drag does nothing in the fallback.

Text next to the globe is described in section 4. Make the heading large.

### 5.10 Our Machine Learning process, the black hole burst

This section is the second signature moment. The backdrop is blackhole_math.jpg, full bleed, object fit cover, positioned so the hole sits left of center on desktop and center on mobile. The section pins for about 1.5 viewport heights.

Before the burst
As the section scrolls in, the image sits at scale 1.05 with a slow drift and the bright ring around the hole pulses gently. Nothing else is visible yet. No title, no cards.

The burst, triggered once the section is about 60 percent in view
It is fast and it is smooth. Whole thing under 1.6 seconds, every movement eased with power4 out, nothing linear, nothing jerky.
0 to 250 ms. The ring flares white orange. A shockwave ring expands from the hole to the edges of the screen over 700 ms, a thin bright edge with a slight color fringe.
0 to 400 ms. The equation wall lifts off and rushes toward the viewer. Do this with a WebGL zoom blur shader on the backdrop, centered on the hole, strength ramping to full at 300 ms and relaxing to zero by 900 ms. If a shader is not possible, fake it with four scaled ghost copies of the image at low opacity.
50 to 900 ms. A Canvas 2D layer fires 300 to 500 glyph particles out of the hole. They are real equation fragments in JetBrains Mono, softmax, cross entropy, the Bellman update, the counterfactual regret update, the Nash condition, a gradient step. They start fast, decelerate, spin slightly, and fade near the edges. One medium screen shake from 5.6 fires at 100 ms.
500 to 900 ms. The title Our Machine Learning process comes out of the hole, scale 0.2 to 1, with three ghost copies trailing to fake motion blur, and lands top center, huge, ivory, Fraunces.
600 to 1400 ms. The five step cards shoot out of the hole one after another 120 ms apart, each on its own curved path, overshoot slightly and settle into a row under the title. They are card shaped with the hover neon edge.

After the burst
The backdrop calms to a slow drift, the equations on the wall stay visible behind the cards at reduced opacity so the text is readable. Scrolling back up and down again replays the burst.

Mobile
A lighter version, 120 particles, the cards stack vertically and arrive 90 ms apart. With prefers reduced motion, no burst, the title and cards simply fade in.

## 6. Poker everywhere, done with restraint

The card is the whole identity, so use it with intent, not everywhere at once.
Section indices as card corners, see 3.
Hover on any card style element tilts it toward the cursor like a card being lifted from a table, and shows the neon edge.
The loading screen, if there is one, is a quick riffle of three cards, under 900 ms, then the hero.
The 404 page is a single face down card that flips to show Fold. Nothing here.
Do not add chips, dice, felt textures, casino lights, gold, or any Vegas imagery. Ivory, ink, silver, the two world gradients and neon, that is the palette.

## 7. Performance, mobile, accessibility

60 fps on a recent laptop with everything running. Profile it.
Three.js scenes load through dynamic import. Anything off screen pauses its render loop, and the globe video pauses off screen.
Device pixel ratio capped at 1.75 for WebGL and 2 for canvas.
Mobile, 390 wide, must look designed, not squeezed. Hero stacks card above text. Board becomes a vertical deal. Hand fan becomes a horizontal scroll strip. Globe video fills the width. ML cards stack.
Respect prefers reduced motion, no shake, no shatter, no burst, neon static on hover, reveals become simple fades.
All interactive things reachable by keyboard. Focus rings use the neon edge. Alt text on images. Real heading order.
Lighthouse performance above 80 on desktop, accessibility above 95.

## 8. Build order

Phase 1. Scaffold, tokens, fonts, content.ts, copy the assets into public/assets, nav, all sections with real layout and placeholder copy, Lenis, basic scroll reveals. Deploy workflow, CNAME, nojekyll. Screenshot, commit.
Phase 2. Gradient shader background matching the two references, code layer, hover neon edges on every box, typing line. Screenshot, commit.
Phase 3. Hero card in Three.js with both generated faces, flip, drag, theme wipe Blue to Red. Screenshot both worlds, commit.
Phase 4. Scroll scenes, hero card hand off into the board, board pin and deal, hand fan, people cards, counters. Screenshot, commit.
Phase 5. Black hole section with the burst, shader, particles, title and cards. Screenshot mid burst and after, commit.
Phase 6. Glass shatter layer with shake, trail, break events, sound toggle. Test on background and confirm it never triggers on interactive elements. Screenshot mid drag, commit.
Phase 7. World section with the video player, seamless loop, drag to scrub, and the fallback. Test both with and without the video file. Screenshot, commit.
Phase 8. Mobile pass, reduced motion pass, keyboard pass, big font pass, Lighthouse, fix everything. Final screenshots, commit, push.

At the end write a short report. What is done, every TODO left in the code, the exact path where the globe video should be dropped, and anything you could not do exactly as written.

## 9. Done means

The site opens in the Blue world on the flip_before_blue gradient with the card face down, floating, and the words typing.
Clicking the card flips it to the ace and wipes the whole site to the Red world of flip_after_red, every neon color included.
Nothing glows until the mouse is over a box or button, then a comet runs around its edge and fades when the mouse leaves.
Code drifts behind everything and dragging the mouse across it cracks it like glass, with shards, dust and a shake, and it all fades within a second.
Scrolling feels like Citadel, nothing pops in flat, the card becomes the deck, the board deals on scroll.
Reaching the ML section makes the black hole burst, equations fly out, the title and five step cards shoot out and land, fast and smooth, under 1.6 seconds.
The globe video spins slowly with no visible loop seam and follows the hand when dragged, and the section still looks finished if the video is not there yet.
Every font is big and clear.
It is live at cornellcgs.org from the main branch.
