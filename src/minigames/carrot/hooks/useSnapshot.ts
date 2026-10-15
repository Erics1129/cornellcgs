import { useCallback, useRef, useSyncExternalStore } from 'react'
import type { GameState } from '../types'

/**
 * The 10 Hz snapshot lives here, outside React state: `set` stores it and notifies; components read memoized slices with `useSlice`,
 * so a publish re-renders only the subtrees whose fields changed (coins, the boss bar, the selection...). The clock extrapolates the
 * game clocks between publishes (requestAnimationFrame readers call `clock()`), using the build's own `timeScale` when it reports one.
 */
export type Clock={elapsed:number;waveElapsed:number;nextWave:number;rate:number}
export type SnapshotStore={
 get():GameState|null
 set(state:GameState|null):void
 subscribe(listener:()=>void):()=>void
 /** game seconds now: level elapsed, current wave elapsed (v2 field, or derived from the wave's start), the breather countdown */
 clock():Clock
 /** a new run began (load or restart): runId changed, or the level changed, or the phase went back to ready */
 run():number
}
const MaxExtrapolation=.35
export function createSnapshotStore():SnapshotStore{
 let state:GameState|null=null,run=0,anchor=0,waveStart=0,lastWave=0,lastRunKey=''
 const listeners=new Set<()=>void>()
 const rateOf=(s:GameState)=>typeof s.timeScale==='number'&&Number.isFinite(s.timeScale)?Math.max(0,s.timeScale):s.paused||s.phase!=='playing'?0:s.speed||1
 return {
  get:()=>state,
  set(next){
   const prev=state;state=next;anchor=performance.now()
   if(next){
    const key=typeof next.runId==='number'?`r${next.runId}`:`l${next.level}`
    const restarted=key!==lastRunKey||(!!prev&&prev.phase!=='ready'&&next.phase==='ready')||(!!prev&&next.wave<prev.wave)
    if(restarted){run++;lastRunKey=key;waveStart=0;lastWave=0}
    // v1 builds have no waveElapsed: the wave started between the previous publish and this one.
    if(next.wave!==lastWave){if(next.wave>lastWave)waveStart=Math.max(0,(next.elapsed||0)-.05*rateOf(next));lastWave=next.wave}
   }
   for(const l of listeners)l()
  },
  subscribe(l){listeners.add(l);return()=>{listeners.delete(l)}},
  clock(){
   if(!state)return {elapsed:0,waveElapsed:0,nextWave:0,rate:0}
   const rate=rateOf(state),dt=Math.min(MaxExtrapolation,(performance.now()-anchor)/1000)*rate
   const elapsed=(state.elapsed||0)+dt
   const waveElapsed=(typeof state.waveElapsed==='number'?state.waveElapsed:Math.max(0,(state.elapsed||0)-waveStart))+dt
   return {elapsed,waveElapsed,nextWave:state.nextWave>0?Math.max(0,state.nextWave-dt):0,rate}
  },
  run:()=>run,
 }
}

const shallowEqual=(a:unknown,b:unknown)=>{
 if(Object.is(a,b))return true
 if(!a||!b||typeof a!=='object'||typeof b!=='object')return false
 if(Array.isArray(a)!==Array.isArray(b))return false
 const ka=Object.keys(a as object),kb=Object.keys(b as object);if(ka.length!==kb.length)return false
 for(const k of ka)if(!Object.is((a as Record<string,unknown>)[k],(b as Record<string,unknown>)[k]))return false
 return true
}
/** A slice of the snapshot; re-renders only when the selected value changes (shallowly, by default). */
export function useSlice<T>(store:SnapshotStore,select:(state:GameState|null)=>T,equal:(a:T,b:T)=>boolean=shallowEqual):T{
 const cache=useRef<{value:T}|null>(null),selectRef=useRef(select);selectRef.current=select
 const getSnapshot=useCallback(()=>{const value=selectRef.current(store.get());if(cache.current&&equal(cache.current.value,value))return cache.current.value;cache.current={value};return value},[store,equal])
 return useSyncExternalStore(store.subscribe,getSnapshot,getSnapshot)
}
