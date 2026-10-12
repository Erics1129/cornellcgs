# Unity production contract

User explicitly requested parallel Unity production now; ongoing art creation proceeds alongside implementation. Keep the six existing tower families and add four: `starfruit` (radial returning star shards, ground+air), `gravity` (black-hole pulses/slow, ground), `book` (seeking rune bolts that rewind normal enemies along their route, ground+air), `thunder` (charged long-range lightning burst, ground+air). All ten have four total physical tiers. Unlock additions in levels 2/7/4/8 respectively. Gameplay author tunes and documents their numerical rules.

Every map has **at least two active routes**. Later maps have three, multiple entrances/merges/chokepoints, no confusing crossings. Update original layouts significantly; preserve 15×11 grid and world=(x-7,0,z-5). Every enemy route ends at same carrot position. Do not create path crossing a build pad. All routes shown before start; next-wave source highlighted. Carrot stays readable.

## File ownership

- Gameplay agent: `Assets/Scripts/CarrotGame.cs`, `CarrotData.cs`, `CarrotSimulationTests.cs` and may extend shared `CarrotTypes.cs` after telling View agent. Own all combat, levels/waves, economy, outcomes and input command parsing. No rendering/model files.
- Scene agent: `Assets/Scripts/CarrotView.cs`, `CarrotEffects.cs`, `CarrotAudio.cs` and `Assets/Shaders/*`. Own terrain, scenery, camera, click selection, model animation, VFX/audio. No combat resolution or imported model generation.
- Modeling agent: `Assets/Editor/CarrotModels.cs` or Blender/model scripts, `Assets/Resources/Carrot/Models/*`, `Assets/Resources/Carrot/Audio/*`, `Assets/Resources/Carrot/Nature/*`, model import configuration. Own FBX conversions, all original tower geometry/carrot model and rig/animation import. Communicate exact prefab paths/API to Scene agent. No gameplay/UI.
- Root: website route, React HUD/purchase/menu/progression, browser Unity lifecycle, `Assets/Plugins/WebGL/*`, `Assets/Editor/CarrotBuild.cs`, generated illustration/texture assets, integration/testing/build. No agent should launch Unity; root does once parallel edits ready.

## Shared API

Namespace `CarrotTD`. Types in CarrotTypes.cs. Root scene builder creates one GameObject named `CarrotGame` with CarrotGame and CarrotView components. Game is authoritative; View reads it and listens for effects.

`CarrotGame` exposes public `LevelDef level; List<TowerState> towers; List<EnemyState> enemies; List<BlockerState> blockers; int coins,health,wave; float elapsed,progress,nextWave,speed; bool paused; string phase` (`ready`,`playing`,`won`,`lost`), `string selectionType; int selectionId;` and `event Action<CarrotEvent> Effect;` plus methods `LoadLevel(int id)`, `Command(string json)`, `Select(string type,int id)`; runs fixed-step combat with game delta. View calls `Select` from real raycast hits; empty terrain clears. View gets game via GetComponent, builds upon level id changing, consumes data every frame.

Event vocabulary: `level`, `build`, `upgrade`, `sell`, `shot`, `impact`, `hit`, `death`, `bite`, `clear`, `bossEnter`, `telegraph`, `telegraphTarget`, `ability`, `abilityTarget`, `victory`, `defeat`. `id` usually source entity id, `target` target enemy id, kind tower/enemy/boss id, positions and duration available. Events are presentation only; damage happens in Game. View can safely ignore unknown additional events. Enemies with alive=false retained 0.8s for death animation then removed. `age` and `elapsed` pause; View uses `paused` and `phase` to stop visual gameplay while retaining idle menu motion if desired. Use active audio volume mute command.

`CarrotData.Towers` is `TowerDef[]`; `CarrotData.Levels` is `LevelDef[]`; `CarrotData.Tower(string kind)` returns matching def.

View exposes `public Camera GameCamera; public void SetMuted(bool muted)`. Screen-safe camera frames all routes/pads in 16:9 desktop and phone portrait. Tiny models must remain readable, so phone can use fit board plus tap zoom or constrained pan if necessary; do not rely on browser controls. Root provides fullscreen.

## Browser bridge

Root plugin provides `[DllImport("__Internal")] CarrotSend(string json)`. Game emits every0.1s and onchanges. JSON includes `level` (int),`name`,`biome`,`wave`,`waves`,`coins`,`health`,`progress`(0..1),`phase`,`paused`,`speed`,`nextWave`,`enemyCount`,`selection` object `{type,id,kind,tier,hp,maxHp,refund,x,y}` (x,y normalized viewport with y=0top), `boss` nullable object `{id,kind,name,hp,maxHp,shield,maxShield,phase,ability,castRemaining}`, `monsters` array `{id,kind,hp,maxHp,shield,maxShield,x,y,visible}` and `notice` string. `towerDefinitions` and `levels` can be sent once or root shares static JSON data; provide source generated JSON to root. `boss` remains untilresolved. All UI realvalues, never simulated decorativehealth.

Browser sends `Command(JSON.stringify({type,...}))`: `load {level}`, `start`, `next`, `buy {kind}`, `upgrade`, `sell`, `pause`, `speed {value:1|2}`, `select {selectionType,id}`, `mute {value:0|1}`, `clear`. `buy` only works onselectedlegal pad, costschecked, lockedtowerschecked. Upgrade/sellonlyselectedtower. Code can have editor-only QA commands guarded in production via development build, never overwrite campaign save. Root maintains localStorage campaign medals/unlocks afterwon; passing level selection is permitted forreplay.

Sound: all three bosses need separate entrance stingers and distinct musical theme/instrumentation. A real boss warning event/overlay onentry, graceful music crossfade, no audio beforeplayergesture. Use licensed sourced orchestral tracks + authored stingers/foley; no 'AI' text in game. Short creaturehiteffects, carrotcrunch synchronizedwithonehealthdecrement. Every menu action accessible on touch and keyboard; DOM UI above Unity canvas.

Preproduction art exists /Users/eric/Claude/carrot-defense-preproduction/art. Root preparing 18–21 four additional tower sheets. Final runtime art in website public/assets/minigames/carrot; texturescopiedUnityResources. Sourceassets CC0 under preproduction/source-assets; keep license provenance. Unity6000.3.18f1, standard renderer + custom simple WebGL-compatible shaders, no compute/VFXGraph. Preferredimport Blender GLB→FBX, actualskeletal clips.
