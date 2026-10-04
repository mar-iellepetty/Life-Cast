import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import Landing from './pages/Landing';
import Studio from './pages/Studio';
import { Toaster } from 'sonner';
function Scroll(){const {pathname}=useLocation();useEffect(()=>{window.scrollTo(0,0);},[pathname]);return null;}
const Planner = lazy(() => import('./planner/App'));
export default function App(){return <BrowserRouter><Scroll/><Suspense fallback={<div role="status" className="min-h-screen bg-[#FAF7F2] p-12 text-center">Opening your LifeCast workspace…</div>}><Routes><Route path="/" element={<Landing/>}/><Route path="/studio/*" element={<Planner/>}/><Route path="/classic-studio" element={<Studio/>}/><Route path="*" element={<Landing/>}/></Routes></Suspense><Toaster richColors/></BrowserRouter>}
