'use client';
const guards=new Set<()=>Promise<boolean>>();
export function registerPageLeaveGuard(guard:()=>Promise<boolean>){guards.add(guard);return()=>{guards.delete(guard);};}
export async function canLeavePage(){for(const guard of guards)if(!await guard())return false;return true;}
