import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import Icon from '../Icon'

/** The modal dialog shell shared by How to play, Settings, Field guide and the restart confirm (styles: ui/menus.css). */
export function Modal({title,children,onClose,className='',kicker}:{title:string;children:ReactNode;onClose:()=>void;className?:string;kicker?:string}){
 const ref=useRef<HTMLDialogElement>(null)
 useEffect(()=>{const el=ref.current;el?.showModal();return()=>el?.close()},[])
 return <dialog ref={ref} className={`ct-dialog ${className}`} onCancel={e=>{e.preventDefault();onClose()}} onClick={e=>{if(e.target===e.currentTarget)onClose()}} aria-label={title}>
  <div className="ct-dialog__inner ct-panel"><header>{kicker&&<span className="ct-kicker">{kicker}</span>}<h2>{title}</h2><button className="ct-icon-btn" onClick={onClose} aria-label={`Close ${title}`}><Icon name="close"/></button></header>{children}</div>
 </dialog>
}

/** A small confirm step for Restart (it throws away the run). */
export function ConfirmModal({title,body,confirm,onConfirm,onClose}:{title:string;body:string;confirm:string;onConfirm:()=>void;onClose:()=>void}){
 return <Modal title={title} onClose={onClose} className="ct-confirm"><p>{body}</p><div className="ct-confirm__actions"><button className="ct-cta" onClick={onConfirm}>{confirm}</button><button className="ct-ghost" onClick={onClose}>Keep playing</button></div></Modal>
}
