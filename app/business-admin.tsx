'use client';
import {createContext,useContext,useEffect,useState,type ReactNode} from 'react';
const BusinessAdmin=createContext(false);
export function BusinessAdminProvider({children}:{children:ReactNode}){const [admin,setAdmin]=useState(false);useEffect(()=>{let live=true;void fetch('/api/auth/me',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(d=>{if(live)setAdmin(d?.user?.roleCode==='super_admin');}).catch(()=>{});return()=>{live=false;};},[]);return <BusinessAdmin.Provider value={admin}>{children}</BusinessAdmin.Provider>;}
export function useBusinessAdmin(){return useContext(BusinessAdmin);}
