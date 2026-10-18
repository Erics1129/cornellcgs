import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import Icon from '../Icon'
import { actions } from '../copy'
import { glass, jelly } from './Glass'

/**
 * The modal dialog shell shared by How to play, Settings, Field guide and the restart confirm (styles: ui/menus.css). A glass sheet:
 * the header stays put and the body scrolls under a soft edge fade (no divider line). Children go in the body.
 */
export function Modal({title,children,onClose,className='',kicker}:{title:string;children:ReactNode;onClose:()=>void;className?:string;kicker?:string}){
 const ref=useRef<HTMLDialogElement>(null)
 useEffect(()=>{const el=ref.current;el?.showModal();return()=>el?.close()},[])
 return <dialog ref={ref} className={`ct-dialog ${className}`} onCancel={e=>{e.preventDefault();onClose()}} onClick={e=>{if(e.target===e.currentTarget)onClose()}} aria-label={title}>
  <div className={glass({depth:3,blur:true,pop:'sheet'},'ct-dialog__inner')}>
   <header className="ct-dialog__head">{kicker&&<span className="gl-label ct-kicker">{kicker}</span>}<h2>{title}</h2><button className="ct-icon-btn" onClick={onClose} aria-label={`Close ${title}`}><Icon name="close"/></button></header>
   <div className="ct-dialog__body">{children}</div>
  </div>
 </dialog>
}

/** A small confirm step for Restart (it throws away the run). The safe choice comes first and keeps the focus order calm. */
export function ConfirmModal({title,body,confirm,onConfirm,onClose}:{title:string;body:string;confirm:string;onConfirm:()=>void;onClose:()=>void}){
 return <Modal title={title} onClose={onClose} className="ct-confirm">
  <div className="ct-confirm__body"><span className="ct-confirm__icon" aria-hidden="true"><Icon name="restart"/></span><p>{body}</p></div>
  <div className="ct-confirm__actions"><button className="ct-ghost" onClick={onClose}>{actions.keepPlaying}</button><button className={jelly({tone:'leak'},'ct-cta')} onClick={onConfirm}>{confirm}</button></div>
 </Modal>
}
