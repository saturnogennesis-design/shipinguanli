"use client";
import {AuthGate} from './auth-gate';
import {ProjectShell} from './project-shell';
export default function Home(){return <AuthGate><ProjectShell/></AuthGate>;}
