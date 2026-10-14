import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {readFileSync} from 'node:fs'
import {generateKeyPairSync,sign,constants,createHmac} from 'node:crypto'
import {createHandler,LIMITS,recordCap,sha256hex} from '../backend/account/worker.ts'

// ---------- local D1 stand-in ----------
const sql=new DatabaseSync(':memory:');sql.exec(readFileSync('backend/account/schema.sql','utf8'))
class Statement{constructor(query,args=[]){this.query=query;this.args=args}bind(...args){return new Statement(this.query,args)}async first(){return sql.prepare(this.query).get(...this.args)||null}async all(){return {results:sql.prepare(this.query).all(...this.args)}}async run(){return {meta:{changes:Number(sql.prepare(this.query).run(...this.args).changes)}}}}
const DB={prepare:q=>new Statement(q),batch:async ss=>{sql.exec('BEGIN');try{const r=[];for(const s of ss)r.push(await s.run());sql.exec('COMMIT');return r}catch(e){sql.exec('ROLLBACK');throw e}}}

// ---------- fake Google: a local RSA pair and a JWKS endpoint ----------
const CLIENT_ID='123-test.apps.googleusercontent.com'
const b64u=buf=>Buffer.from(buf).toString('base64url')
const makeKey=kid=>{const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});return {kid,privateKey,jwk:{...publicKey.export({format:'jwk'}),kid,use:'sig',alg:'RS256'}}}
const k1=makeKey('k1'),k2=makeKey('k2')
let jwksKeys=[k1.jwk],jwksFetches=0
const fetchJwks=async()=>{jwksFetches++;return new Response(JSON.stringify({keys:jwksKeys}),{headers:{'Content-Type':'application/json','Cache-Control':'public, max-age=3600'}})}
let clock=1_760_000_000_000
const sec=()=>Math.floor(clock/1000)
function idToken({key=k1,header={alg:'RS256',kid:key.kid,typ:'JWT'},claims={},signWith}={}){
 const payload={iss:'https://accounts.google.com',aud:CLIENT_ID,sub:'10769150350006150715113082367',exp:sec()+3600,iat:sec(),name:'Ada <Lovelace>\u0007',picture:'https://lh3.googleusercontent.com/a/photo=s96-c',email:'ada@example.com',...claims}
 const h=b64u(JSON.stringify(header)),p=b64u(JSON.stringify(payload)),data=h+'.'+p
 const sig=signWith?signWith(data):sign('sha256',Buffer.from(data),{key:key.privateKey,padding:constants.RSA_PKCS1_PADDING})
 return data+'.'+b64u(sig)
}

// ---------- requests ----------
const handler=createHandler({fetchJwks,now:()=>clock})
const SECRET='test-session-secret-at-least-32-characters-long'
const env={DB,ALLOWED_ORIGIN:'https://cornellcgs.org,http://localhost:5190',GOOGLE_CLIENT_ID:CLIENT_ID,SESSION_SECRET:SECRET}
const ORIGIN='https://cornellcgs.org'
// Every login in the main flow comes from its own IP so the per-IP limiter (tested on its own below) stays out of the way.
let ipSeq=0
const call=(method,path,{body,token,origin=ORIGIN,raw,env:e=env,headers={},ip,gzip}={})=>handler.fetch(new Request('https://account.test'+path,{method,headers:{...(origin?{Origin:origin}:{}),...(token?{Authorization:'Bearer '+token}:{}),...(body!==undefined||raw!==undefined?{'Content-Type':gzip?'application/gzip':'application/json'}:{}),...(ip?{'CF-Connecting-IP':ip}:{}),...headers},body:raw!==undefined?raw:body!==undefined?JSON.stringify(body):undefined,duplex:'half'}),e)
const login=(opts)=>call('POST','/login',{body:{idToken:idToken(opts)},ip:'198.51.100.'+(++ipSeq%250),...opts?.req})
const gzipBytes=async(text)=>new Uint8Array(await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer())
const expect=async(res,status,label)=>{assert.equal(res.status,status,label+': '+await res.clone().text());return res.json()}

// origin rules, preflight, health, misconfiguration
assert.equal((await call('GET','/',{origin:'https://bad.test'})).status,403)
const pre=await call('OPTIONS','/progress/carrot:campaign');assert.equal(pre.status,204);assert.equal(pre.headers.get('Access-Control-Allow-Origin'),ORIGIN);assert.match(pre.headers.get('Access-Control-Allow-Methods'),/PUT/);assert.match(pre.headers.get('Access-Control-Allow-Headers'),/Authorization/)
assert.deepEqual(await expect(await call('GET','/'),200,'health'),{ok:true,service:'cgs-account'})
assert.deepEqual(await expect(await call('GET','/',{origin:''}),200,'health without Origin (curl)'),{ok:true,service:'cgs-account'})
assert.equal((await call('GET','/',{env:{...env,SESSION_SECRET:'short'}})).status,503,'short SESSION_SECRET fails safe')
assert.equal((await call('GET','/',{env:{...env,DB:undefined}})).status,503,'missing DB binding fails safe')
assert.equal((await call('GET','/nope')).status,404)
assert.equal((await call('GET','/me')).status,401,'no token')

// good login
let res=await login();const first=await expect(res,200,'login')
assert.match(first.session,/^cgs1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);assert.ok(first.session.length<260)
assert.equal(first.expires,clock+LIMITS.sessionMs)
assert.deepEqual(first.player,{id:await sha256hex('10769150350006150715113082367'),name:'Ada Lovelace',picture:'https://lh3.googleusercontent.com/a/photo=s96-c'},'the player id (the sub hash) comes back so the website can tell whose saves a device holds')
assert.deepEqual(first.progress,{})
const players=sql.prepare('SELECT * FROM players').all();assert.equal(players.length,1)
assert.equal(players[0].id,await sha256hex('10769150350006150715113082367'),'id is the sha256 of the Google sub')
assert.ok(!Object.keys(players[0]).includes('email'));assert.ok(!JSON.stringify(players).includes('10769150350006150715113082367'),'the sub itself is never stored')
assert.ok(!JSON.stringify(players).includes('example.com'),'email is never stored')
assert.equal(jwksFetches,1)
const session1=first.session

// JWKS cache: a second login within max-age does not refetch; rotation to an unknown kid refetches once after 60 s
clock+=10_000;assert.equal((await login()).status,200);assert.equal(jwksFetches,1,'JWKS cached')
assert.equal((await login({key:k2})).status,401,'unknown kid within 60 s of the last fetch: no refetch, 401');assert.equal(jwksFetches,1)
clock+=61_000;jwksKeys=[k1.jwk,k2.jwk]
assert.equal((await login({key:k2})).status,200,'rotated key accepted');assert.equal(jwksFetches,2,'exactly one refetch')
assert.equal((await login({key:k2})).status,200);assert.equal(jwksFetches,2)

// every token failure is the same 401
const unverified='Google sign-in could not be verified.'
const bad=async(label,opts)=>{const r=await login(opts);assert.equal(r.status,401,label);assert.equal((await r.json()).error,unverified,label)}
await bad('bad signature',{signWith:()=>Buffer.alloc(256,7)})
await bad('signed by another key with k1 kid',{header:{alg:'RS256',kid:'k1',typ:'JWT'},key:{kid:'k1',privateKey:k2.privateKey}})
await bad('wrong aud',{claims:{aud:'other-client.apps.googleusercontent.com'}})
await bad('aud as array',{claims:{aud:[CLIENT_ID]}})
await bad('wrong iss',{claims:{iss:'https://evil.example'}})
await bad('expired',{claims:{exp:sec()-31}})
await bad('iat in the future',{claims:{iat:sec()+120}})
await bad('nbf in the future',{claims:{nbf:sec()+120}})
await bad('missing sub',{claims:{sub:''}})
await bad('alg none',{header:{alg:'none',kid:'k1'},signWith:()=>Buffer.alloc(1)})
await bad('HS256 confusion',{header:{alg:'HS256',kid:'k1'},signWith:data=>createHmac('sha256',k1.jwk.n).update(data).digest()})
assert.equal((await call('POST','/login',{body:{idToken:'garbage'}})).status,401,'garbage token')
assert.equal((await call('POST','/login',{body:{idToken:'a.b.c'}})).status,401,'garbage segments')
assert.equal((await call('POST','/login',{body:{}})).status,400,'missing idToken')
assert.equal((await call('POST','/login',{raw:'{not json'})).status,400,'bad JSON')
assert.equal((await call('POST','/login',{raw:'"a string"'})).status,400,'non-object body')
assert.equal((await call('POST','/login',{raw:JSON.stringify({idToken:'x'.repeat(LIMITS.bodyBytes+1)})})).status,413,'80 KB body')
assert.equal((await login({claims:{exp:sec()-10}})).status,200,'30 s skew on exp is tolerated')

// /me with the session
let me=await expect(await call('GET','/me',{token:session1}),200,'/me');assert.equal(me.player.name,'Ada Lovelace');assert.equal(me.player.id,players[0].id,'/me carries the id too');assert.deepEqual(me.progress,{})
assert.equal((await call('GET','/me',{token:session1+'x'})).status,401,'tampered signature')
assert.equal((await call('GET','/me',{token:session1.replace(/^cgs1\.[A-Za-z0-9_-]/,'cgs1.Z')})).status,401,'tampered payload')
assert.equal((await call('GET','/me',{token:session1,env:{...env,SESSION_SECRET:'another-secret-that-is-also-32-characters'}})).status,401,'wrong secret')

// PUT: stored, stale, clamp, rate limit, size cap, bad ids, record cap
const CAMPAIGN={version:1,unlocked:3,medals:{1:7,2:3},sound:true}
const put=(game,body,token=session1)=>call('PUT','/progress/'+game,{body,token})
let r=await expect(await put('carrot:campaign',{data:CAMPAIGN,updated:clock-500}),200,'first PUT');assert.deepEqual(r,{stored:true,updated:clock-500,version:1})
assert.equal((await put('carrot:campaign',{data:CAMPAIGN,updated:clock})).status,429,'second PUT within 2 s')
r=await put('carrot:campaign',{data:CAMPAIGN,updated:clock});assert.equal(r.headers.get('Retry-After'),'2');assert.equal((await r.json()).retryAfter,2)
clock+=LIMITS.putCooldownMs+1
r=await expect(await put('carrot:campaign',{data:{...CAMPAIGN,unlocked:2},updated:clock-5000}),200,'older updated');assert.equal(r.stored,false);assert.deepEqual(r.current,{data:CAMPAIGN,updated:clock-LIMITS.putCooldownMs-1-500,version:1})
clock+=LIMITS.putCooldownMs+1
r=await expect(await put('carrot:campaign',{data:{...CAMPAIGN,unlocked:4},updated:clock-500}),200,'newer wins');assert.deepEqual(r,{stored:true,updated:clock-500,version:2})
clock+=LIMITS.putCooldownMs+1
r=await expect(await put('carrot:campaign',{data:{...CAMPAIGN,unlocked:4},updated:clock-500}),200,'equal timestamp is accepted');assert.equal(r.stored,true);assert.equal(r.version,3)
clock+=LIMITS.putCooldownMs+1
r=await expect(await put('inkmaze:best',{data:{'1':{ink:3,moves:9}},updated:clock+10*365*86_400_000}),200,'future clock');assert.equal(r.updated,clock+LIMITS.clockSkewMs,'clamped to now+60 s')
clock+=LIMITS.putCooldownMs+1
r=await expect(await put('inkmaze:best',{data:{'1':{ink:2,moves:9}},updated:clock}),200,'honest write after a clamped future write');assert.equal(r.stored,false,'still stale within the 60 s window')
clock+=LIMITS.clockSkewMs
r=await expect(await put('inkmaze:best',{data:{'1':{ink:2,moves:9}},updated:clock}),200,'after 60 s');assert.equal(r.stored,true,'the honest write gets through')
clock+=LIMITS.putCooldownMs+1
assert.equal((await put('carrot:campaign',{data:{pad:'x'.repeat(LIMITS.recordBytes-9)},updated:clock})).status,413,'65 537-byte record')
clock+=LIMITS.putCooldownMs+1
assert.equal((await put('carrot:campaign',{data:{pad:'x'.repeat(LIMITS.recordBytes-10)},updated:clock})).status,200,'65 536-byte record')
clock+=LIMITS.putCooldownMs+1
assert.equal((await put('carrot:campaign',{data:{pad:'é'.repeat(LIMITS.recordBytes/2)},updated:clock})).status,413,'cap counts UTF-8 bytes')
clock+=LIMITS.putCooldownMs+1
r=await expect(await put('carrot:campaign',{data:{...CAMPAIGN,unlocked:4},updated:clock}),200,'campaign restored');assert.deepEqual(r,{stored:true,updated:clock,version:5})
// a Forge run has its own, larger cap: a full 12 000-action run fits, plain or gzipped
const bigRun={version:2,seed:123456789,ticket:{id:'run-1',seed:123456789},actions:[]}
for(let i=0;bigRun.actions.length<12_000;i++){const k=i%5;bigRun.actions.push(k===0?{type:'move',id:1+i%4,to:'furnace'}:k===1?{type:'heat',id:1+i%4}:k===2?{type:'move',id:1+i%4,to:'anvil'}:k===3?{type:'tick',ms:60_000}:{type:'hit',id:1+i%4})}
const bigRunText=JSON.stringify(bigRun);assert.ok(bigRunText.length>LIMITS.recordBytes&&bigRunText.length<=recordCap('forge:run'),'a 12 000-action run is '+bigRunText.length+' bytes: over 64 KB, under the forge:run cap')
clock+=LIMITS.putCooldownMs+1
r=await expect(await put('forge:run',{data:bigRun,updated:clock}),200,'12 000-action run, plain JSON');assert.equal(r.stored,true)
clock+=LIMITS.putCooldownMs+1
const gz=await gzipBytes(JSON.stringify({data:{...bigRun,seed:5},updated:clock}));assert.ok(gz.length<40_000,'gzip shrinks the run to '+gz.length+' bytes')
r=await expect(await call('PUT','/progress/forge:run',{raw:gz,gzip:true,token:session1}),200,'12 000-action run, gzipped');assert.equal(r.stored,true)
assert.equal(JSON.parse(sql.prepare('SELECT data FROM progress WHERE game=?').get('forge:run').data).seed,5,'the inflated record is stored as JSON text')
clock+=LIMITS.putCooldownMs+1
assert.equal((await put('forge:run',{data:{pad:'x'.repeat(recordCap('forge:run'))},updated:clock})).status,413,'a run over its own cap is refused')
assert.equal((await call('PUT','/progress/forge:run',{raw:await gzipBytes(JSON.stringify({data:{pad:'0'.repeat(8_000_000)},updated:clock})),gzip:true,token:session1})).status,413,'a gzip bomb stops at the inflated-byte cap')
assert.equal((await call('PUT','/progress/forge:run',{raw:new Uint8Array([31,139,8,0,1,2,3]),gzip:true,token:session1})).status,400,'corrupt gzip')
assert.equal((await call('PUT','/progress/forge:run',{raw:'{"data":1,"updated":1}',gzip:true,token:session1})).status,400,'plain JSON labelled gzip')
clock+=LIMITS.putCooldownMs+1
r=await expect(await call('PUT','/progress/forge:run',{raw:await gzipBytes(JSON.stringify({data:{v:'small'},updated:clock})),gzip:true,token:session1}),200,'a small gzipped body works too');assert.equal(r.stored,true)
assert.equal((await put('Carrot:campaign',{data:1,updated:clock})).status,400,'uppercase id')
assert.equal((await put('carrot',{data:1,updated:clock})).status,400,'no colon')
assert.equal((await put('carrot:'+'a'.repeat(31),{data:1,updated:clock})).status,400,'long id')
assert.equal((await put('carrot:campaign',{updated:clock})).status,400,'missing data')
assert.equal((await put('carrot:campaign',{data:1,updated:-1})).status,400,'negative updated')
assert.equal((await put('carrot:campaign',{data:1,updated:1.5})).status,400,'fractional updated')
assert.equal((await put('carrot:campaign',{data:1})).status,400,'missing updated')
assert.equal((await put('carrot:campaign',{data:1,updated:clock},'nope')).status,401)
for(let i=3;i<LIMITS.maxRecords;i++){clock+=1;assert.equal((await put('extra:'+i,{data:i,updated:clock})).status,200,'record '+i)}
assert.equal((await put('extra:overflow',{data:1,updated:clock})).status,400,'33rd record refused')
clock+=LIMITS.putCooldownMs+1;assert.equal((await put('forge:run',{data:{v:2},updated:clock})).status,200,'an existing record is not blocked by the cap')
assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM progress').get().n,LIMITS.maxRecords)

// progress visible in /progress, /me and /login; placeholder rows are hidden
const all=await expect(await call('GET','/progress',{token:session1}),200,'/progress')
assert.equal(all.progress['carrot:campaign'].data.unlocked,4);assert.equal(all.progress['carrot:campaign'].version,5);assert.equal(all.progress['inkmaze:best'].data['1'].ink,2)
sql.prepare('INSERT INTO progress(player_id,game) VALUES(?,?)').run(players[0].id,'ghost:placeholder');assert.ok(!('ghost:placeholder' in (await (await call('GET','/progress',{token:session1})).json()).progress));sql.prepare('DELETE FROM progress WHERE game=?').run('ghost:placeholder')
clock+=5_000
const again=await expect(await login(),200,'login again');assert.equal(again.progress['carrot:campaign'].data.unlocked,4);assert.notEqual(again.session,session1,'a new token on every login')
me=await expect(await call('GET','/me',{token:again.session}),200,'/me new token');assert.equal(Object.keys(me.progress).length,LIMITS.maxRecords)
assert.equal((await call('GET','/me',{token:session1})).status,200,'older token still valid until logout')

// logout kills every device's token; a new login works
assert.deepEqual(await expect(await call('POST','/logout',{token:session1}),200,'logout'),{ok:true})
assert.equal((await call('GET','/me',{token:session1})).status,401,'replayed session after logout')
assert.equal((await call('GET','/me',{token:again.session})).status,401,'the other device is signed out too')
assert.equal((await call('POST','/logout',{token:session1})).status,401,'logout needs a live session')
const third=await expect(await login(),200,'login after logout')
assert.equal((await call('GET','/me',{token:third.session})).status,200)
assert.equal(third.progress['carrot:campaign'].data.unlocked,4,'progress survives sign-out')

// 30-day expiry
clock+=LIMITS.sessionMs;assert.equal((await call('GET','/me',{token:third.session})).status,200,'valid at exactly 30 days')
clock+=1000;assert.equal((await call('GET','/me',{token:third.session})).status,401,'expired at 30 days + 1 s')
const fourth=await expect(await login(),200,'fresh login after expiry')

// delete: rows gone, token dead, local copies untouched (server-side nothing to keep)
assert.deepEqual(await expect(await call('DELETE','/account',{token:fourth.session}),200,'delete'),{ok:true})
assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM progress').get().n,0);assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM players').get().n,0)
assert.equal((await call('GET','/me',{token:fourth.session})).status,401,'token dead after delete')
const fifth=await expect(await login(),200,'login after delete creates a fresh player');assert.deepEqual(fifth.progress,{})
assert.equal(sql.prepare('SELECT session_version FROM players').get().session_version,1)

// JWKS unreachable after the cache expired: the stale keys keep serving for 24 h, then logins fail
{
 const jwksDown=async()=>{throw new Error('ENOTFOUND')}
 let fetches=0
 const h2=createHandler({fetchJwks:async()=>{fetches++;return fetchJwks()},now:()=>clock})
 const login2=(opts)=>h2.fetch(new Request('https://account.test/login',{method:'POST',headers:{Origin:ORIGIN,'Content-Type':'application/json','CF-Connecting-IP':'198.51.100.'+(++ipSeq%250)},body:JSON.stringify({idToken:idToken(opts)})}),env)
 assert.equal((await login2()).status,200);assert.equal(fetches,1)
 const h3=createHandler({fetchJwks:async()=>{fetches++;if(fetches>=3)return jwksDown();return fetchJwks()},now:()=>clock})
 const login3=(opts)=>h3.fetch(new Request('https://account.test/login',{method:'POST',headers:{Origin:ORIGIN,'Content-Type':'application/json','CF-Connecting-IP':'198.51.100.'+(++ipSeq%250)},body:JSON.stringify({idToken:idToken(opts)})}),env)
 assert.equal((await login3()).status,200,'primed');assert.equal(fetches,2)
 clock+=3_600_000+1;assert.equal((await login3()).status,200,'cache expired and Google unreachable: stale keys still verify');assert.equal(fetches,3)
 clock+=120_000;assert.equal((await login3()).status,200,'and again, retrying Google at most once a minute');assert.equal(fetches,4)
 clock+=LIMITS.jwksGraceMs;assert.equal((await login3()).status,401,'past the grace period with Google still down: 401, not a crash')
 const cold=createHandler({fetchJwks:jwksDown,now:()=>clock})
 assert.equal((await cold.fetch(new Request('https://account.test/login',{method:'POST',headers:{Origin:ORIGIN,'Content-Type':'application/json'},body:JSON.stringify({idToken:idToken()})}),env)).status,401,'an empty cache with Google down fails closed')
}

// per-IP login limiter: 20 attempts per minute, good or bad, then 429 with Retry-After; other IPs unaffected
{
 const ip='203.0.113.9'
 for(let i=0;i<LIMITS.loginsPerMinute;i++)assert.equal((await login({claims:{aud:'wrong'},req:{ip}})).status,401,'attempt '+i)
 const limited=await login({req:{ip}});assert.equal(limited.status,429,'21st attempt');assert.equal(limited.headers.get('Retry-After'),'60');assert.equal((await limited.json()).retryAfter,60)
 assert.equal((await login({req:{ip:'203.0.113.10'}})).status,200,'another IP is fine')
 clock+=60_001;assert.equal((await login({req:{ip}})).status,200,'a minute later the IP is allowed again')
}

// a PUT that passed the session check just before DELETE /account: nothing is left behind
{
 const racer=await expect(await login(),200,'racer login');const rid=players[0].id
 clock+=LIMITS.putCooldownMs+1
 assert.equal((await put('carrot:campaign',{data:CAMPAIGN,updated:clock},racer.session)).status,200,'a record exists before the race')
 let raced=false
 const racingDB={prepare:q=>{const st=new Statement(q);if(!raced&&/INSERT OR IGNORE INTO progress/.test(q)){raced=true;const orig=st.run.bind(st);st.run=async function(){await handler.fetch(new Request('https://account.test/account',{method:'DELETE',headers:{Origin:ORIGIN,Authorization:'Bearer '+racer.session}}),env);return orig()};return {bind:(...a)=>{const b=new Statement(q,a);b.run=st.run;return b}}}return st},batch:DB.batch}
 clock+=LIMITS.putCooldownMs+1
 const racedPut=await call('PUT','/progress/forge:run',{body:{data:{v:'late'},updated:clock},token:racer.session,env:{...env,DB:racingDB}})
 assert.ok(raced,'the DELETE ran between the session check and the insert');assert.equal(racedPut.status,401,'the late PUT is refused: '+await racedPut.clone().text())
 assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM progress').get().n,0,'no progress row survives the player');assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM players').get().n,0)
 assert.equal((await call('GET','/me',{token:racer.session})).status,401,'the token is dead')
 // ON DELETE CASCADE on its own: a player row deletion takes its records with it
 const again2=await expect(await login(),200,'relogin');clock+=LIMITS.putCooldownMs+1
 assert.equal((await put('carrot:campaign',{data:CAMPAIGN,updated:clock},again2.session)).status,200)
 sql.prepare('DELETE FROM players WHERE id=?').run(rid);assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM progress').get().n,0,'cascade')
 assert.equal((await login()).status,200)
}

// a failing database answers 503 and never leaks
const broken={...env,DB:{prepare:()=>{throw new Error('boom')},batch:async()=>{throw new Error('boom')}}}
const down=await call('GET','/me',{token:fifth.session,env:broken});assert.equal(down.status,503);assert.match((await down.json()).error,/safe on this device/)

console.log('PASS account service: origin rules, health, Google token verification (signature, aud, iss, exp, iat, nbf, alg, JWKS cache + rotation + 24 h stale grace), hashed ids without email (id returned on /login and /me), signed sessions, PUT last-write-wins with clock clamp, 2 s rate limit, 64 KB record cap (400 KB for forge:run, 12 000-action run plain and gzipped, gzip bomb), 32-record cap, 20/min login limiter per IP, logout everywhere, 30-day expiry, delete with cascade and a racing PUT.')
sql.close()
