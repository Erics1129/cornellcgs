/**
 * cgs-account: Google sign-in + cross-device progress for the mini-games.
 *
 * The browser sends a Google ID token once (POST /login). The Worker verifies it against Google's
 * JWKS and then issues its own HMAC-signed session token; the Google token is never stored or
 * reused. Progress is one JSON record per localStorage key, last-write-wins by the client's merged
 * timestamp. Sign-out and delete bump `players.session_version`, which kills every issued token.
 *
 * Deployed as a plain Worker with a D1 binding `DB`, vars `ALLOWED_ORIGIN` and `GOOGLE_CLIENT_ID`,
 * and the secret `SESSION_SECRET` (see docs/accounts/SETUP.md). Nothing here is a credential.
 */
interface Statement { bind(...args:unknown[]):Statement; first<T>():Promise<T|null>; all<T>():Promise<{results:T[]}>; run():Promise<{meta:{changes:number}}> }
interface Database { prepare(sql:string):Statement; batch(statements:Statement[]):Promise<unknown[]> }
export type Env={DB?:Database;ALLOWED_ORIGIN?:string;GOOGLE_CLIENT_ID?:string;SESSION_SECRET?:string}
export const LIMITS={bodyBytes:420_000,recordBytes:65_536,forgeRunBytes:400_000,putCooldownMs:2_000,sessionMs:30*86_400_000,maxRecords:32,maxName:60,maxPicture:512,clockSkewMs:60_000,loginsPerMinute:20,jwksGraceMs:86_400_000}
/** A Forge run is an action log of up to 12 000 actions (~26 bytes each as JSON); everything else fits in 64 KB. */
export const recordCap=(game:string)=>game==='forge:run'?LIMITS.forgeRunBytes:LIMITS.recordBytes
export const JWKS_URL='https://www.googleapis.com/oauth2/v3/certs'
export const GAME_ID=/^[a-z0-9]+:[a-z0-9-]{1,30}$/
const ISSUERS=['accounts.google.com','https://accounts.google.com']
const SESSION_PREFIX='cgs1.'
const enc=new TextEncoder(),dec=new TextDecoder()
type Deps={fetchJwks:(url:string)=>Promise<Response>;now:()=>number}
type Jwk={kty?:string;kid?:string;use?:string;alg?:string;n?:string;e?:string}
type PlayerRow={name:string;picture:string;session_version:number}
type ProgressRow={game:string;data:string;updated:number;version:number}
type Record_={data:unknown;updated:number;version:number}

// ---------- encoding helpers ----------
const B64U=/^[A-Za-z0-9_-]+$/
export const b64uEncode=(bytes:Uint8Array)=>{let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
export const b64uDecode=(s:string)=>{if(!B64U.test(s))throw new Error('bad base64url');const b=atob(s.replace(/-/g,'+').replace(/_/g,'/').padEnd(s.length+(4-s.length%4)%4,'='));const out=new Uint8Array(b.length);for(let i=0;i<b.length;i++)out[i]=b.charCodeAt(i);return out}
const hex=(bytes:ArrayBuffer|Uint8Array)=>Array.from(new Uint8Array(bytes)).map(b=>b.toString(16).padStart(2,'0')).join('')
export const sha256hex=async(s:string)=>hex(await crypto.subtle.digest('SHA-256',enc.encode(s)))
const parseJson=(bytes:Uint8Array)=>{const v=JSON.parse(dec.decode(bytes));if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('not an object');return v as Record<string,unknown>}
/** Display name: NFKC, no control characters or angle brackets, trimmed, capped. */
export const cleanName=(s:unknown)=>typeof s==='string'?s.normalize('NFKC').replace(/[\p{Cc}<>]/gu,'').trim().slice(0,LIMITS.maxName):''
/** Picture: only an https URL on googleusercontent.com, else ''. */
export function cleanPicture(s:unknown){
 if(typeof s!=='string'||s.length>LIMITS.maxPicture)return ''
 try{const u=new URL(s);return u.protocol==='https:'&&(u.hostname.endsWith('.googleusercontent.com')||u.hostname==='googleusercontent.com')?s:''}catch{return ''}
}

// ---------- Google ID token ----------
/**
 * JWKS cache: one fetch per isolate per max-age; one extra fetch when an unknown kid shows up after 60 s (key
 * rotation). When Google cannot be reached after the cache expired, the stale keys keep serving for up to 24 h
 * (Google rotates on the order of days), so a JWKS hiccup does not fail every login.
 */
export function createJwks(fetchJwks:Deps['fetchJwks']){
 const cache={keys:[] as Jwk[],expires:0,fetched:0}
 async function load(now:number){
  const res=await fetchJwks(JWKS_URL);if(!res.ok)throw new Error('jwks')
  const body=await res.json() as {keys?:Jwk[]};if(!Array.isArray(body.keys))throw new Error('jwks')
  const m=/max-age=(\d+)/.exec(res.headers.get('Cache-Control')||'')
  const ttl=Math.min(86_400_000,Math.max(300_000,(m?Number(m[1]):3600)*1000))
  cache.keys=body.keys;cache.fetched=now;cache.expires=now+ttl
 }
 /** reload, or keep the stale set while it is within the grace period */
 async function refresh(now:number){
  try{await load(now)}catch(e){if(!cache.keys.length||now>=cache.expires+LIMITS.jwksGraceMs)throw e;cache.fetched=now}
 }
 return {
  async key(kid:string,now:number):Promise<Jwk>{
   if(!cache.keys.length||now>=cache.expires)await refresh(now)
   const find=()=>cache.keys.find(k=>k.kid===kid&&k.kty==='RSA'&&(!k.use||k.use==='sig')&&(!k.alg||k.alg==='RS256')&&typeof k.n==='string'&&typeof k.e==='string')
   let key=find()
   if(!key&&now-cache.fetched>60_000){await refresh(now);key=find()}
   if(!key)throw new Error('unknown kid')
   return key
  }
 }
}
export type Jwks=ReturnType<typeof createJwks>
const isInt=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)
/** Every failure throws the same generic error; the caller answers 401 without saying why. */
export async function verifyGoogleIdToken(token:unknown,opts:{clientId:string;now:number;jwks:Jwks}){
 const fail=()=>new Error('Google sign-in could not be verified.')
 if(typeof token!=='string'||token.length>12_288)throw fail()
 const parts=token.split('.');if(parts.length!==3||parts.some(p=>!p||p.length>4096||!B64U.test(p)))throw fail()
 let header:Record<string,unknown>,payload:Record<string,unknown>
 try{header=parseJson(b64uDecode(parts[0]));payload=parseJson(b64uDecode(parts[1]))}catch{throw fail()}
 if(header.alg!=='RS256'||(header.typ!==undefined&&header.typ!=='JWT')||typeof header.kid!=='string')throw fail()
 let jwk:Jwk;try{jwk=await opts.jwks.key(header.kid,opts.now)}catch{throw fail()}
 let ok:boolean
 try{
  const key=await crypto.subtle.importKey('jwk',{kty:'RSA',n:jwk.n,e:jwk.e,alg:'RS256',ext:true},{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify'])
  ok=await crypto.subtle.verify({name:'RSASSA-PKCS1-v1_5'},key,b64uDecode(parts[2]),enc.encode(parts[0]+'.'+parts[1]))
 }catch{ok=false}
 if(!ok)throw fail()
 const now=opts.now,{iss,aud,exp,iat,nbf,sub}=payload
 if(typeof iss!=='string'||!ISSUERS.includes(iss))throw fail()
 if(typeof aud!=='string'||aud!==opts.clientId)throw fail()
 if(!isInt(exp)||exp*1000<=now-30_000)throw fail()
 if(!isInt(iat)||iat*1000>now+LIMITS.clockSkewMs||iat*1000<now-86_400_000)throw fail()
 if(nbf!==undefined&&(!isInt(nbf)||nbf*1000>now+LIMITS.clockSkewMs))throw fail()
 if(typeof sub!=='string'||!sub||sub.length>255)throw fail()
 return {sub,name:cleanName(payload.name),picture:cleanPicture(payload.picture)}
}

// ---------- session token: cgs1.<base64url(payload)>.<base64url(hmac)> ----------
type SessionPayload={p:string;i:number;n:string;v:number}
let hmacCache:{secret:string;key:CryptoKey}|null=null
async function hmacKey(secret:string){
 if(hmacCache&&hmacCache.secret===secret)return hmacCache.key
 const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify'])
 hmacCache={secret,key};return key
}
export async function issueSession(secret:string,playerId:string,version:number,now:number){
 const payload:SessionPayload={p:playerId,i:now,n:hex(crypto.getRandomValues(new Uint8Array(16))),v:version}
 const body=SESSION_PREFIX+b64uEncode(enc.encode(JSON.stringify(payload)))
 const sig=await crypto.subtle.sign('HMAC',await hmacKey(secret),enc.encode(body))
 return {token:body+'.'+b64uEncode(new Uint8Array(sig)),expires:now+LIMITS.sessionMs}
}
/** Signature, format and age only; the caller still compares `v` with the player's session_version. */
export async function readSession(secret:string,token:string,now:number):Promise<SessionPayload|null>{
 try{
  if(!token.startsWith(SESSION_PREFIX)||token.length>1024)return null
  const dot=token.lastIndexOf('.');if(dot<=SESSION_PREFIX.length)return null
  const body=token.slice(0,dot),sig=b64uDecode(token.slice(dot+1))
  if(!await crypto.subtle.verify('HMAC',await hmacKey(secret),sig,enc.encode(body)))return null
  const p=parseJson(b64uDecode(body.slice(SESSION_PREFIX.length)))
  if(typeof p.p!=='string'||!/^[0-9a-f]{64}$/.test(p.p)||!isInt(p.i)||typeof p.n!=='string'||!isInt(p.v))return null
  if(now-p.i>LIMITS.sessionMs||p.i>now+LIMITS.clockSkewMs)return null
  return {p:p.p,i:p.i,n:p.n,v:p.v}
 }catch{return null}
}

// ---------- the Worker ----------
function configError(env:Env){
 if(!env.DB)return 'The account service has no D1 binding named DB.'
 if(!env.GOOGLE_CLIENT_ID)return 'The account service has no GOOGLE_CLIENT_ID variable.'
 if(!env.SESSION_SECRET||env.SESSION_SECRET.length<32)return 'The account service has no SESSION_SECRET secret (at least 32 characters).'
 return null
}
export function createHandler(deps:Partial<Deps>={}){
 const d:Deps={fetchJwks:(u:string)=>fetch(u),now:()=>Date.now(),...deps}
 const jwks=createJwks(d.fetchJwks)
 // POST /login costs an RSA verification and three queries. This per-isolate sliding window (20 per minute per IP)
 // blunts a single script; the account-wide guard is the WAF rate-limiting rule in docs/accounts/SETUP.md.
 const logins=new Map<string,number[]>()
 const loginAllowed=(ip:string,now:number)=>{
  if(logins.size>10_000)logins.clear()
  const hits=(logins.get(ip)||[]).filter(t=>now-t<60_000)
  if(hits.length>=LIMITS.loginsPerMinute){logins.set(ip,hits);return false}
  hits.push(now);logins.set(ip,hits);return true
 }
 return {
  async fetch(request:Request,env:Env):Promise<Response>{
   const url=new URL(request.url),origin=request.headers.get('Origin')||''
   const allowed=(env.ALLOWED_ORIGIN||'').split(',').map(s=>s.trim()).filter(Boolean)
   const headers=new Headers({'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff'})
   if(allowed.includes(origin)){headers.set('Access-Control-Allow-Origin',origin);headers.set('Access-Control-Allow-Methods','GET, POST, PUT, DELETE, OPTIONS');headers.set('Access-Control-Allow-Headers','Content-Type, Authorization');headers.set('Access-Control-Max-Age','3600')}
   const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers})
   if(origin&&!allowed.includes(origin))return json({error:'Origin not allowed.'},403)
   if(request.method==='OPTIONS')return new Response(null,{status:204,headers})
   const misconfigured=configError(env);if(misconfigured)return json({ok:false,error:misconfigured},503)
   const DB=env.DB as Database,secret=env.SESSION_SECRET as string,clientId=env.GOOGLE_CLIENT_ID as string
   const now=d.now(),method=request.method,path=url.pathname
   const unavailable=()=>json({error:'The account service is unavailable. Your progress is safe on this device.'},503)
   // Streamed read with a hard byte cap; Content-Length is not a trustworthy bound. A body sent as
   // `Content-Type: application/gzip` (the website compresses large records) is inflated through the
   // same cap, counted on the inflated bytes, so a gzip bomb stops at the cap like any other body.
   async function readBody():Promise<Record<string,unknown>|Response>{
    if(Number(request.headers.get('Content-Length')||0)>LIMITS.bodyBytes)return json({error:'Request too large.'},413)
    let stream=request.body;if(!stream)return json({error:'Missing body.'},400)
    const gzip=/^application\/gzip\b/i.test(request.headers.get('Content-Type')||'')
    if(gzip){try{stream=stream.pipeThrough(new DecompressionStream('gzip'))}catch{return json({error:'Invalid gzip body.'},400)}}
    const reader=stream.getReader()
    const chunks:Uint8Array[]=[];let bytes=0
    try{
     while(true){const {done,value:chunk}=await reader.read();if(done)break;bytes+=chunk.length;if(bytes>LIMITS.bodyBytes){await reader.cancel().catch(()=>{});return json({error:'Request too large.'},413)}chunks.push(chunk)}
    }catch{return json({error:gzip?'Invalid gzip body.':'Unreadable body.'},400)}
    const all=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length}
    try{return parseJson(all)}catch{return json({error:'Invalid JSON body.'},400)}
   }
   const readProgress=async(playerId:string)=>{
    const rows=await DB.prepare('SELECT game,data,updated,version FROM progress WHERE player_id=? AND data <> ?').bind(playerId,'').all<ProgressRow>()
    const out:Record<string,Record_>={}
    for(const r of rows.results){try{out[r.game]={data:JSON.parse(r.data),updated:r.updated,version:r.version}}catch{/* unreadable row: skip */}}
    return out
   }
   try{
    if(method==='GET'&&path==='/')return json({ok:true,service:'cgs-account'})
    if(method==='POST'&&path==='/login'){
     if(!loginAllowed(request.headers.get('CF-Connecting-IP')||'unknown',now)){headers.set('Retry-After','60');return json({error:'Too many sign-in attempts. Try again in a minute.',retryAfter:60},429)}
     const body=await readBody();if(body instanceof Response)return body
     if(typeof body.idToken!=='string')return json({error:'Missing idToken.'},400)
     let g:Awaited<ReturnType<typeof verifyGoogleIdToken>>
     try{g=await verifyGoogleIdToken(body.idToken,{clientId,now,jwks})}catch{return json({error:'Google sign-in could not be verified.'},401)}
     const id=await sha256hex(g.sub)
     await DB.prepare('INSERT INTO players(id,name,picture,created,last_login) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,picture=excluded.picture,last_login=excluded.last_login').bind(id,g.name,g.picture,now,now).run()
     const row=await DB.prepare('SELECT session_version FROM players WHERE id=?').bind(id).first<{session_version:number}>()
     if(!row)return unavailable()
     const session=await issueSession(secret,id,row.session_version,now)
     // `player.id` lets the website tell whose saves a shared device holds (docs/accounts/PRIVACY.md); it is the hash, never the sub.
     return json({session:session.token,expires:session.expires,player:{id,name:g.name,picture:g.picture},progress:await readProgress(id)})
    }
    const put=method==='PUT'&&path.startsWith('/progress/')
    const known=(method==='GET'&&(path==='/me'||path==='/progress'))||put||(method==='POST'&&path==='/logout')||(method==='DELETE'&&path==='/account')
    if(!known)return json({error:'Not found.'},404)
    // Every route below needs a live session: valid signature, not expired, version still current.
    const auth=request.headers.get('Authorization')||''
    const session=auth.startsWith('Bearer ')?await readSession(secret,auth.slice(7).trim(),now):null
    const player=session?await DB.prepare('SELECT name,picture,session_version FROM players WHERE id=?').bind(session.p).first<PlayerRow>():null
    if(!session||!player||player.session_version!==session.v)return json({error:'Please sign in again.'},401)
    const id=session.p
    if(method==='GET'&&path==='/me')return json({player:{id,name:player.name,picture:player.picture},progress:await readProgress(id)})
    if(method==='GET'&&path==='/progress')return json({progress:await readProgress(id)})
    if(method==='POST'&&path==='/logout'){await DB.prepare('UPDATE players SET session_version=session_version+1 WHERE id=?').bind(id).run();return json({ok:true})}
    if(method==='DELETE'&&path==='/account'){
     // One transaction: every issued token dies first, then the rows (progress also cascades from players).
     await DB.batch([DB.prepare('UPDATE players SET session_version=session_version+1 WHERE id=?').bind(id),DB.prepare('DELETE FROM progress WHERE player_id=?').bind(id),DB.prepare('DELETE FROM players WHERE id=?').bind(id)])
     return json({ok:true})
    }
    // PUT /progress/:game
    const game=path.slice('/progress/'.length)
    if(game.length>40||!GAME_ID.test(game))return json({error:'Invalid game id.'},400)
    const body=await readBody();if(body instanceof Response)return body
    if(body.data===undefined)return json({error:'Missing data.'},400)
    if(!isInt(body.updated)||body.updated<0)return json({error:'updated must be a non-negative integer (ms).'},400)
    const text=JSON.stringify(body.data)
    if(typeof text!=='string')return json({error:'data must be JSON.'},400)
    if(enc.encode(text).length>recordCap(game))return json({error:'Progress record too large.'},413)
    // 1. Placeholder row so the cooldown below is atomic, capped so unknown ids cannot fill the free tier, and only
    //    while the player still exists (a DELETE /account racing this request must not leave a row behind).
    await DB.prepare('INSERT OR IGNORE INTO progress(player_id,game) SELECT ?,? WHERE (SELECT COUNT(*) FROM progress WHERE player_id=?) < ? AND EXISTS (SELECT 1 FROM players WHERE id=?)').bind(id,game,id,LIMITS.maxRecords,id).run()
    // 2. Rate limit: one PUT per 2 s per (player, game), reserved in a single conditional UPDATE.
    const reserve=await DB.prepare('UPDATE progress SET last_put=? WHERE player_id=? AND game=? AND last_put <= ?').bind(now,id,game,now-LIMITS.putCooldownMs).run()
    if(!reserve.meta.changes){
     const exists=await DB.prepare('SELECT 1 AS x FROM progress WHERE player_id=? AND game=?').bind(id,game).first<{x:number}>()
     if(!exists){
      const alive=await DB.prepare('SELECT 1 AS x FROM players WHERE id=?').bind(id).first<{x:number}>()
      return alive?json({error:'Too many records.'},400):json({error:'Please sign in again.'},401)
     }
     headers.set('Retry-After',String(LIMITS.putCooldownMs/1000))
     return json({error:'Saving too quickly. Try again in a moment.',retryAfter:LIMITS.putCooldownMs/1000},429)
    }
    // 3. A device with a clock far ahead must not lock the record against every later honest write.
    const updated=Math.min(body.updated,now+LIMITS.clockSkewMs)
    // 4. Last-write-wins by the client's merged timestamp.
    const write=await DB.prepare('UPDATE progress SET data=?,updated=?,version=version+1 WHERE player_id=? AND game=? AND updated <= ?').bind(text,updated,id,game,updated).run()
    const current=await DB.prepare('SELECT data,updated,version FROM progress WHERE player_id=? AND game=?').bind(id,game).first<ProgressRow>()
    if(!current)return unavailable()
    if(write.meta.changes)return json({stored:true,updated:current.updated,version:current.version})
    return json({stored:false,current:{data:JSON.parse(current.data),updated:current.updated,version:current.version}})
   }catch{return unavailable()}
  }
 }
}
const handler=createHandler()
export default {fetch:(request:Request,env:Env)=>handler.fetch(request,env)}
