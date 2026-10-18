// Room codes (pure, no DOM): five characters from the room server's alphabet, which leaves out 0, O, 1, I and L so a code read
// aloud or copied from a phone screen cannot be mistaken. Typed or pasted text is uppercased and spaces, dashes and dots dropped.
import { AMBIGUOUS_CODE_CHARS, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '../net/protocol.ts'
export const CODE_ALPHABET=ROOM_CODE_ALPHABET
export const CODE_LENGTH=ROOM_CODE_LENGTH
/** The protocol's 'bad-code' copy, without its full stop (it sits under the field). */
export const AMBIGUOUS_MESSAGE='Codes never use 0, O, 1, I or L'
export const CHARSET_MESSAGE='Codes use letters and the digits 2 to 9'
export const LENGTH_MESSAGE=`Codes are ${CODE_LENGTH} characters`
const ambiguous=new RegExp(`[${AMBIGUOUS_CODE_CHARS}]`)
const separators=/[\s\-_.·–—]+/g

export type CodeCheck={code:string;complete:boolean;error:string|null}

/** Normalizes what the player typed or pasted. `code` is what the field shows (at most CODE_LENGTH valid characters). */
export function normalizeCode(raw:string):CodeCheck{
 const text=String(raw??'').toUpperCase().replace(separators,'')
 if(ambiguous.test(text))return {code:keep(text),complete:false,error:AMBIGUOUS_MESSAGE}
 if([...text].some(ch=>!CODE_ALPHABET.includes(ch)))return {code:keep(text),complete:false,error:CHARSET_MESSAGE}
 if(text.length>CODE_LENGTH)return {code:text.slice(0,CODE_LENGTH),complete:false,error:LENGTH_MESSAGE}
 return {code:text,complete:text.length===CODE_LENGTH,error:null}
}
const keep=(text:string)=>[...text].filter(ch=>CODE_ALPHABET.includes(ch)).join('').slice(0,CODE_LENGTH)
export const isRoomCode=(value:unknown):value is string=>typeof value==='string'&&value.length===CODE_LENGTH&&[...value].every(ch=>CODE_ALPHABET.includes(ch))

/** "K7M2Q" read out one character at a time ("K, 7, M, 2, Q"), for screen readers. */
export const spokenCode=(code:string)=>[...code].join(', ')

/** The room a link points at: #room=K7M2Q (also accepted lowercase or with a dash). */
export function roomFromHash(hash:string):string|null{
 const m=/(?:^#|&)room=([^&]+)/i.exec(hash||'');if(!m)return null
 let value:string;try{value=decodeURIComponent(m[1])}catch{return null}
 const check=normalizeCode(value)
 return check.complete&&!check.error?check.code:null
}
/** The page URL with #room=CODE, for Copy link (the query string is kept, any other hash replaced). */
export function roomLink(href:string,code:string):string{
 const at=href.indexOf('#');return `${at>=0?href.slice(0,at):href}#room=${code}`
}
