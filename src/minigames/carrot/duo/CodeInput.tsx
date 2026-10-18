import { useId } from 'react'
import type { CodeCheck } from './code'
import { CODE_LENGTH, normalizeCode } from './code'

/**
 * The room-code field: whatever is typed or pasted is uppercased, spaces and dashes drop out, and 0, O, 1, I and L are refused with the
 * reason ("Codes never use 0, O, 1, I or L"). Five slots under the text show how far along the code is. Enter submits.
 */
export function CodeInput({value,error,onChange,onSubmit,autoFocus=false,disabled=false}:{value:string;error:string|null;onChange:(check:CodeCheck)=>void;onSubmit:()=>void;autoFocus?:boolean;disabled?:boolean}){
 const id=useId(),hint=`${id}-hint`
 return <div className="ct-duo-codein" data-error={error?'1':undefined}>
  <label htmlFor={id} className="ct-duo-label">Room code</label>
  <div className="ct-duo-codein__box">
   <input id={id} className="ct-duo-codein__input" value={value} disabled={disabled} autoFocus={autoFocus} inputMode="text" autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="go" maxLength={CODE_LENGTH+7} placeholder="K7M2Q" aria-invalid={error?true:undefined} aria-describedby={hint}
    onChange={e=>onChange(normalizeCode(e.target.value))}
    onPaste={e=>{const text=e.clipboardData.getData('text');if(text){e.preventDefault();onChange(normalizeCode(text))}}}
    onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();onSubmit()}}}/>
   <span className="ct-duo-codein__slots" aria-hidden="true">{Array.from({length:CODE_LENGTH},(_,i)=><i key={i} data-on={i<value.length?'1':undefined}/>)}</span>
  </div>
  <p id={hint} className="ct-duo-codein__hint" aria-live="polite">{error||'Five letters and digits, from your friend'}</p>
 </div>
}
