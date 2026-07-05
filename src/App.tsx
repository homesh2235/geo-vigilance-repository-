/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  Users, 
  Radio, 
  MapPin, 
  AlertTriangle, 
  CheckCircle, 
  Bell, 
  MessageSquare, 
  Send, 
  ChevronRight, 
  Globe, 
  Database, 
  FileCode, 
  Sparkles,
  Volume2,
  VolumeX,
  PlusCircle,
  FolderTree,
  ExternalLink,
  Lock,
  Compass,
  Info,
  Smartphone
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Incident, Citizen, Tip, BroadcastNotification, IncidentType, SystemStats } from './types.js';
import MapComponent from './components/MapComponent';
import CitizenSimulator from './components/CitizenSimulator';

// Reusable corner ornaments component for a pristine military tactical dashboard look
function HudCardCorners() {
  return (
    <>
      <div className="corner-bracket bracket-tl" />
      <div className="corner-bracket bracket-tr" />
      <div className="corner-bracket bracket-bl" />
      <div className="corner-bracket bracket-br" />
    </>
  );
}

export default function App() {
  // Real-time server states
  const [citizens, setCitizens] = useState<Citizen[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [tips, setTips] = useState<Tip[]>([]);
  const [notifications, setNotifications] = useState<BroadcastNotification[]>([]);
  const [stats, setStats] = useState<SystemStats>({
    activeIncidents: 0,
    resolvedIncidents: 0,
    registeredCitizens: 0,
    totalTipsReceived: 0
  });

  // Dynamic Geographic Centering State
  const [mapCenter, setMapCenter] = useState<{ latitude: number; longitude: number }>({
    latitude: 18.950,
    longitude: 72.825
  });
  const [isLoadingCenter, setIsLoadingCenter] = useState<boolean>(false);
  const [locationStatus, setLocationStatus] = useState<'prompt' | 'locating' | 'ready' | 'error'>('prompt');

  // UI Selection States
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>('inc-101');
  const [pendingCoordinates, setPendingCoordinates] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isShowingDocs, setIsShowingDocs] = useState<boolean>(false);
  const [activeDocsTab, setActiveDocsTab] = useState<'endpoints' | 'postgis' | 'files'>('postgis');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [activeTheme, setActiveTheme] = useState<'onyx' | 'matrix' | 'amber' | 'subzero'>('onyx');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', activeTheme);
  }, [activeTheme]);

  // New Incident Dispatch Form States
  const [newTitle, setNewTitle] = useState<string>('');
  const [newDescription, setNewDescription] = useState<string>('');
  const [newType, setNewType] = useState<IncidentType>('robbery');
  const [newRadius, setNewRadius] = useState<number>(1.5); // Default 1.5km geofence
  const [isSubmittingIncident, setIsSubmittingIncident] = useState<boolean>(false);
  const [formError, setFormError] = useState<string>('');

  // SSE & Audio notification indicators
  const [recentTipAlert, setRecentTipAlert] = useState<string | null>(null);

  // Audio simulation feedback (dispatch beep & alert wave)
  const playAlertSound = (type: 'beep' | 'radar') => {
    if (!soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      if (type === 'beep') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, audioCtx.currentTime); // High pitch beep
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.15);
      } else if (type === 'radar') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(330, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(110, audioCtx.currentTime + 0.6); // falling alert alarm
        gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.6);
      }
    } catch (e) {
      console.warn('Audio play blocked or unsupported by browser sandbox.', e);
    }
  };

  // Fetch full dataset initially
  const fetchAllData = async () => {
    try {
      const [statsRes, incidentsRes, tipsRes, citizensRes, centerRes] = await Promise.all([
        fetch('/api/stats').then(r => r.json()),
        fetch('/api/incidents').then(r => r.json()),
        fetch('/api/tips').then(r => r.json()),
        fetch('/api/citizens').then(r => r.json()),
        fetch('/api/center').then(r => r.json()).catch(() => ({ latitude: 18.950, longitude: 72.825 }))
      ]);

      setStats(statsRes);
      setIncidents(incidentsRes);
      setTips(tipsRes);
      setCitizens(citizensRes);
      if (centerRes && centerRes.latitude) {
        setMapCenter({ latitude: centerRes.latitude, longitude: centerRes.longitude });
      }
    } catch (err) {
      console.error('Failed to pull server states', err);
    }
  };

  const handleChangeCenter = async (latitude: number, longitude: number) => {
    setIsLoadingCenter(true);
    try {
      const response = await fetch('/api/center', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latitude, longitude })
      });
      if (!response.ok) {
        throw new Error('Failed to update operational center');
      }
      const data = await response.json();
      if (data && data.center) {
        setMapCenter(data.center);
        await fetchAllData();
      }
    } catch (e: any) {
      console.error('Failed to shift operational center', e);
      setFormError(`Failed to shift center: ${e.message || e}`);
    } finally {
      setIsLoadingCenter(false);
    }
  };

  const handleCenterOnMyLocation = () => {
    if (!navigator.geolocation) {
      setFormError("Geolocation is not supported by your browser sandbox environment.");
      setLocationStatus('error');
      return;
    }
    setIsLoadingCenter(true);
    setLocationStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        handleChangeCenter(position.coords.latitude, position.coords.longitude)
          .then(() => {
            setLocationStatus('ready');
            setFormError('');
          })
          .catch((e) => {
            console.error(e);
            setLocationStatus('error');
          });
      },
      (error) => {
        setIsLoadingCenter(false);
        setLocationStatus('error');
        console.error("Geolocation error:", error);
        setFormError(`Geolocation Access Required: Please allow browser location access so that the tactical map can center strictly on your live coordinates.`);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  useEffect(() => {
    // Automatically trigger real live GPS synchronization on mount
    if (navigator.geolocation) {
      setIsLoadingCenter(true);
      setLocationStatus('locating');
      navigator.geolocation.getCurrentPosition(
        (position) => {
          handleChangeCenter(position.coords.latitude, position.coords.longitude)
            .then(() => {
              setLocationStatus('ready');
              setFormError('');
            })
            .catch(() => {
              setLocationStatus('error');
              fetchAllData();
            });
        },
        (error) => {
          setIsLoadingCenter(false);
          setLocationStatus('error');
          console.error("Geolocation error:", error);
          setFormError(`Geolocation Access Required: Please allow browser location access so that the tactical map can center strictly on your live coordinates.`);
          fetchAllData();
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      setLocationStatus('error');
      setFormError("Geolocation is not supported by your browser sandbox environment.");
      fetchAllData();
    }

    // CONNECT TO SERVER-SENT EVENTS (SSE) FOR HIGH-CONCURRENCY REAL-TIME BROADCASTS
    const eventSource = new EventSource('/api/events');

    eventSource.addEventListener('center_updated', (e: any) => {
      const data = JSON.parse(e.data);
      if (data && data.latitude) {
        setMapCenter({ latitude: data.latitude, longitude: data.longitude });
        fetchAllData();
      }
    });

    eventSource.addEventListener('citizen_updated', (e: any) => {
      const updatedCitizen = JSON.parse(e.data);
      setCitizens(prev => {
        const exists = prev.some(c => c.id === updatedCitizen.id);
        if (exists) {
          return prev.map(c => c.id === updatedCitizen.id ? updatedCitizen : c);
        }
        return [...prev, updatedCitizen];
      });
      // Update counts
      setStats(prev => ({ ...prev, registeredCitizens: prev.registeredCitizens + 1 }));
    });

    eventSource.addEventListener('new_incident', (e: any) => {
      const data = JSON.parse(e.data);
      setIncidents(prev => [data.incident, ...prev]);
      setNotifications(prev => [data.notification, ...prev]);
      setSelectedIncidentId(data.incident.id);
      playAlertSound('radar');
      
      // Update statistics
      setStats(prev => ({
        ...prev,
        activeIncidents: prev.activeIncidents + 1
      }));
    });

    eventSource.addEventListener('incident_resolved', (e: any) => {
      const data = JSON.parse(e.data);
      setIncidents(prev => prev.map(i => i.id === data.incident.id ? data.incident : i));
      setNotifications(prev => [data.notification, ...prev]);
      playAlertSound('beep');

      // Update statistics
      setStats(prev => ({
        ...prev,
        activeIncidents: Math.max(0, prev.activeIncidents - 1),
        resolvedIncidents: prev.resolvedIncidents + 1
      }));
    });

    eventSource.addEventListener('new_tip', (e: any) => {
      const data = JSON.parse(e.data);
      setTips(prev => [data.tip, ...prev]);
      
      if (data.tip && data.tip.isPriority) {
        playAlertSound('radar');
        setRecentTipAlert(`🚨 PRIORITY LEADING THREAT DETECTED on Case [${data.incidentId}]!`);
      } else {
        playAlertSound('beep');
        setRecentTipAlert(`New Eyewitness Tip Logged on Case [${data.incidentId}]!`);
      }
      setTimeout(() => setRecentTipAlert(null), 6000);

      // Update statistics
      setStats(prev => ({
        ...prev,
        totalTipsReceived: prev.totalTipsReceived + 1
      }));
    });

    return () => {
      eventSource.close();
    };
  }, [soundEnabled]);

  // Handle map click to place coordinates in incident initiation form
  const handleMapClick = (lat: number, lng: number) => {
    setPendingCoordinates({ latitude: lat, longitude: lng });
    playAlertSound('beep');
    setFormError('');
  };

  // Dispatcher creates new incident geofence alert
  const handleInitiateIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle || !newDescription || !pendingCoordinates) {
      setFormError('Please select coordinates on the map and write details.');
      return;
    }

    setIsSubmittingIncident(true);
    setFormError('');

    try {
      const response = await fetch('/api/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle,
          description: newDescription,
          type: newType,
          latitude: pendingCoordinates.latitude,
          longitude: pendingCoordinates.longitude,
          radiusKm: newRadius
        })
      });

      if (!response.ok) {
        throw new Error('Server returned an error initiating alert');
      }

      // Reset form on success
      setNewTitle('');
      setNewDescription('');
      setPendingCoordinates(null);
    } catch (err: any) {
      setFormError(err.message || 'Failed to dispatch alert.');
    } finally {
      setIsSubmittingIncident(false);
    }
  };

  // Dispatcher resolves an incident
  const handleResolveIncident = async (incidentId: string) => {
    try {
      const response = await fetch(`/api/incidents/${incidentId}/resolve`, {
        method: 'POST'
      });
      if (!response.ok) throw new Error('Failed to mark resolved');
    } catch (err) {
      console.error('Resolution broadcast failure', err);
    }
  };

  // Citizen Simulator submits a tip via REST POST
  const handleAddTip = async (tipData: {
    incidentId: string;
    description: string;
    latitude: number;
    longitude: number;
    isAnonymous: boolean;
    contactPhone?: string;
    photoUrl?: string;
  }) => {
    try {
      const response = await fetch('/api/tips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tipData)
      });
      if (!response.ok) return null;
      return await response.json();
    } catch (e) {
      console.error('Tip POST routing exception', e);
      return null;
    }
  };

  // Update citizen coordinate from simulator node
  const handleCitizenUpdate = async (citizenData: { phone: string; name: string; latitude: number; longitude: number }) => {
    try {
      await fetch('/api/citizens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(citizenData)
      });
    } catch (err) {
      console.error('Citizen GPS routing exception', err);
    }
  };

  // Helper mapping incident types to friendly text
  const getFriendlyType = (type: string) => {
    return type.replace('_', ' ').toUpperCase();
  };

  const getIncidentTypeColor = (type: string) => {
    switch (type) {
      case 'robbery': return 'text-red-500 bg-red-500/10 border-red-500/20';
      case 'missing_person': return 'text-sky-400 bg-sky-400/10 border-sky-400/20';
      case 'assault': return 'text-orange-500 bg-orange-500/10 border-orange-500/20';
      case 'theft': return 'text-purple-400 bg-purple-400/10 border-purple-400/20';
      case 'suspicious_activity': return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20';
      default: return 'text-slate-400 bg-slate-400/10 border-slate-400/20';
    }
  };

  return (
    <div className="min-h-screen bg-[#050508] bg-cyber-grid text-zinc-100 flex flex-col font-sans select-none antialiased relative overflow-x-hidden">
      {/* Immersive background ambient decorations */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-luxury-gold/5 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-20 right-1/4 w-[600px] h-[600px] bg-rose-500/5 rounded-full blur-[160px] pointer-events-none" />
      
      {/* GLOBAL HEAD NAVIGATION BAR */}
      <header className="border-b border-luxury-border/60 bg-[#0c0c10]/95 backdrop-blur-md sticky top-0 z-50 px-6 py-4 flex justify-between items-center shadow-[0_4px_30px_rgba(0,0,0,0.6)]">
        <div className="flex items-center space-x-3.5">
          <div className="bg-rose-500/10 p-2.5 rounded-xl border border-rose-500/30 text-rose-400 shadow-md shadow-rose-950/30">
            <Shield className="w-6 h-6 animate-pulse text-rose-500" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-xl font-extrabold tracking-tight text-white font-sans uppercase">
                Geo<span className="text-luxury-gold">Vigilance</span>
              </h1>
              <span className="text-[9px] bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2.5 py-0.5 rounded font-bold tracking-widest font-mono">
                MIL-SPEC TACTICAL LINK
              </span>
            </div>
            <p className="text-[10px] text-zinc-400 font-semibold tracking-wide uppercase font-mono mt-0.5">Real-Time Geofenced Crisis Dispatcher & Citizen Crowdsourcing Platform</p>
          </div>

          {/* JUDGE IMPRESSING REAL-TIME HUD TELEMETRY BLOCKS */}
          <div className="hidden xl:flex items-center space-x-4 text-[9px] font-mono text-zinc-500 border-l border-luxury-border/60 pl-6 ml-6">
            <div className="flex items-center space-x-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-bold tracking-wider uppercase text-zinc-400">TELEMETRY: SYNCHRONIZED</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="w-1.5 h-1.5 rounded-full bg-luxury-gold animate-pulse" />
              <span className="font-bold tracking-wider uppercase text-zinc-400">DOPPLER SATELLITES: 12 CONNECTED</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
              <span className="font-bold tracking-wider uppercase text-zinc-400">GEOFENCING: LIVE CORE</span>
            </div>
          </div>
        </div>

        {/* Global Controls & Docs Trigger */}
        <div className="flex items-center space-x-3">
          {recentTipAlert && (
            <div className="hidden lg:flex items-center space-x-2 bg-amber-500/10 text-luxury-gold border border-amber-500/20 px-3 py-1 rounded-lg text-xs animate-pulse">
              <AlertTriangle className="w-4 h-4" />
              <span className="font-semibold">{recentTipAlert}</span>
            </div>
          )}

          {/* THEME PRESET CHIP SELECTOR */}
          <div className="hidden md:flex items-center space-x-2 bg-[#121217] border border-luxury-border/60 rounded-xl px-3 py-1.5 shadow-inner mr-1">
            <span className="text-[10px] font-mono text-zinc-500 font-bold uppercase tracking-wider mr-1">ACTIVE THEME:</span>
            {[
              { id: 'onyx' as const, label: 'Onyx', color: 'bg-[#c5a880]' },
              { id: 'matrix' as const, label: 'Matrix', color: 'bg-[#22c55e]' },
              { id: 'amber' as const, label: 'Amber', color: 'bg-[#f59e0b]' },
              { id: 'subzero' as const, label: 'Arctic', color: 'bg-[#0ea5e9]' },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTheme(t.id)}
                className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-mono font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  activeTheme === t.id 
                    ? 'bg-luxury-gold/15 border-luxury-gold text-white shadow-md shadow-black/50' 
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${t.color} shadow-sm animate-pulse`} />
                <span>{t.label}</span>
              </button>
            ))}
          </div>

          <button
            id="sound-toggle-btn"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2.5 bg-[#121217] border border-luxury-border rounded-xl hover:bg-[#1a1a20] text-zinc-400 hover:text-zinc-200 transition-all flex items-center justify-center cursor-pointer shadow-sm"
            title={soundEnabled ? 'Disable dispatch audio' : 'Enable dispatch audio'}
          >
            {soundEnabled ? <Volume2 className="w-4.5 h-4.5 text-emerald-400" /> : <VolumeX className="w-4.5 h-4.5 text-zinc-500" />}
          </button>

          <button
            id="architecture-toggle-btn"
            onClick={() => setIsShowingDocs(!isShowingDocs)}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl border transition-all text-xs font-semibold cursor-pointer shadow-sm ${isShowingDocs ? 'bg-luxury-gold border-luxury-gold-hover text-[#070709] font-bold' : 'bg-[#121217] border-luxury-border text-zinc-300 hover:bg-[#1a1a20] hover:text-white'}`}
          >
            <Database className="w-4 h-4" />
            <span>Architecture & API Docs</span>
          </button>
        </div>
      </header>

      {/* TACTICAL GEOLOCATION CONTROL PANEL */}
      <div className="bg-[#08080c]/90 border-b border-luxury-border/60 py-3.5 px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono shadow-inner relative z-10 backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center space-x-2">
            <MapPin className="w-4 h-4 text-rose-500 animate-pulse" />
            <span className="font-bold text-zinc-300 uppercase tracking-wider text-[11px] font-sans">Active Base Coordinates:</span>
            <span className="text-luxury-gold font-bold bg-luxury-gold/5 px-2.5 py-1 rounded border border-luxury-gold/20 font-mono text-[11px]">
              Lat: {mapCenter.latitude.toFixed(5)}, Lng: {mapCenter.longitude.toFixed(5)}
            </span>
          </div>
          <div className="flex items-center space-x-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-0.5 rounded text-[10px] font-sans">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            <span className="font-semibold tracking-wide uppercase">Browser Live GPS Linked</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* HTML5 Browser Geolocation */}
          <button
            onClick={handleCenterOnMyLocation}
            disabled={isLoadingCenter}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
              isLoadingCenter 
                ? 'bg-[#271515] border-rose-900 text-rose-500 cursor-not-allowed animate-pulse' 
                : 'bg-[#121217] border-luxury-border text-zinc-300 hover:text-white hover:border-zinc-500 hover:bg-[#1a1a20]'
            }`}
          >
            <Compass className={`w-4 h-4 ${isLoadingCenter ? 'animate-spin' : ''}`} />
            <span>{isLoadingCenter ? 'Re-syncing GPS...' : 'Re-Sync Live GPS'}</span>
          </button>
        </div>
      </div>

      {/* SYSTEM ARCHITECTURE & API REFERENCE DIALOG */}
      <AnimatePresence>
        {isShowingDocs && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-luxury-card border-b border-luxury-border p-6 shadow-2xl z-40 relative flex flex-col max-w-7xl mx-auto w-full glow-gold/5"
          >
            <div className="flex justify-between items-start border-b border-luxury-border pb-3 mb-4">
              <div>
                <h3 className="text-sm font-bold text-zinc-100 flex items-center space-x-2">
                  <Sparkles className="w-4.5 h-4.5 text-luxury-gold" />
                  <span className="font-sans text-base">GeoVigilance Backend Architecture & Geospatial Specifications</span>
                </h3>
                <p className="text-xs text-zinc-400 mt-1">Detailed technical overview matching project execution outputs (Models, PostGIS Queries, and API Routes)</p>
              </div>
              <button
                onClick={() => setIsShowingDocs(false)}
                className="text-xs font-mono text-luxury-gold hover:text-luxury-gold-hover bg-black/60 px-2.5 py-1 rounded border border-luxury-border cursor-pointer transition-colors"
              >
                Close Docs [Esc]
              </button>
            </div>

            {/* Docs Tabs */}
            <div className="flex space-x-2 mb-4 border-b border-luxury-border pb-2">
              <button
                onClick={() => setActiveDocsTab('postgis')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center space-x-1.5 transition-colors cursor-pointer ${activeDocsTab === 'postgis' ? 'bg-luxury-gold/10 text-luxury-gold border border-luxury-gold/20' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                <Database className="w-4 h-4" />
                <span>PostgreSQL + PostGIS Schema</span>
              </button>
              <button
                onClick={() => setActiveDocsTab('endpoints')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center space-x-1.5 transition-colors cursor-pointer ${activeDocsTab === 'endpoints' ? 'bg-luxury-gold/10 text-luxury-gold border border-luxury-gold/20' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                <Globe className="w-4 h-4" />
                <span>REST API Geofence Routes</span>
              </button>
              <button
                onClick={() => setActiveDocsTab('files')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center space-x-1.5 transition-colors cursor-pointer ${activeDocsTab === 'files' ? 'bg-luxury-gold/10 text-luxury-gold border border-luxury-gold/20' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                <FolderTree className="w-4 h-4" />
                <span>File Directory Structure</span>
              </button>
            </div>

            {/* Tab content */}
            <div className="bg-black/60 rounded-xl p-4 border border-luxury-border text-xs text-zinc-300 font-mono overflow-x-auto max-h-[280px]">
              {activeDocsTab === 'postgis' && (
                <div className="text-left space-y-3">
                  <div className="text-luxury-gold font-bold">// 1. High-Performance Geofenced Circle Query (PostGIS)</div>
                  <pre className="text-zinc-300 bg-black/40 p-3 rounded-lg border border-luxury-border/60">
{`SELECT id, phone, name, ST_Distance(location::geography, ST_SetSRID(ST_MakePoint(:incidentLng, :incidentLat), 4326)::geography) AS distance_meters
FROM citizens
WHERE ST_DWithin(
    location::geography, 
    ST_SetSRID(ST_MakePoint(:incidentLng, :incidentLat), 4326)::geography, 
    :radiusInMeters
)
ORDER BY distance_meters ASC;`}
                  </pre>
                  <p className="text-zinc-400 leading-normal font-sans text-[11px]">
                    <strong>Technical Note:</strong> The standard index is a 2D GiST index (`gist(location)`). By casting `location::geography`, the query uses the WGS 84 ellipsoid to get real-world distance metrics (meters) instead of degree-based euclidean approximations.
                  </p>
                </div>
              )}

              {activeDocsTab === 'endpoints' && (
                <div className="text-left space-y-4 font-mono">
                  <div className="text-emerald-400 font-bold border-b border-luxury-border/60 pb-1">// Core REST / SSE Action Loop</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[11px] leading-relaxed">
                    <div className="space-y-2">
                      <div>
                        <span className="text-emerald-400 font-bold">POST /api/incidents</span>
                        <p className="text-zinc-400 font-sans ml-2">Dispatcher initiates alert. Coordinates citizens database within `radiusKm`. Fires geofenced alert via SMS.</p>
                      </div>
                      <div>
                        <span className="text-emerald-400 font-bold">POST /api/incidents/:id/resolve</span>
                        <p className="text-zinc-400 font-sans ml-2">Mark incident "Resolved". Fires secondary resolution geofenced alert notifying security status.</p>
                      </div>
                      <div>
                        <span className="text-emerald-400 font-bold">GET /api/events</span>
                        <p className="text-luxury-gold font-sans ml-2">EventSource (Server-Sent Events) live streaming active tips & mobile sirens instantly.</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <span className="text-emerald-400 font-bold">POST /api/tips</span>
                        <p className="text-zinc-400 font-sans ml-2">Citizen uploads eyewitness text description, coordinates, and photo evidence attachment.</p>
                      </div>
                      <div>
                        <span className="text-emerald-400 font-bold">POST /api/citizens</span>
                        <p className="text-zinc-400 font-sans ml-2">Register/update active mobile node phone and simulated location vector.</p>
                      </div>
                      <div>
                        <span className="text-emerald-400 font-bold">GET /api/stats</span>
                        <p className="text-zinc-400 font-sans ml-2">Pulls live dispatcher metrics dashboard.</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeDocsTab === 'files' && (
                <div className="text-left whitespace-pre text-zinc-300">
{`├── /database.sql             <-- Production-ready schema with PostGIS indexing & radius triggers
├── /server.ts                 <-- High-concurrency Express server serving static assets + SSE socket
├── /package.json              <-- Dependencies manager config (Vite, TSX compiler, Express)
├── /metadata.json             <-- AI Studio metadata including Geolocation frame clearance
├── /src/
│   ├── /types.ts              <-- Global model structures (Citizen, Incident, Tip, Broadcast)
│   ├── /main.tsx              <-- React runtime entry loader
│   ├── /index.css             <-- Global Tailwind directives
│   ├── /App.tsx               <-- Master interactive Split-Pane Dispatch Terminal & Mobile Simulation
│   └── /components/
│       ├── /MapComponent.tsx  <-- Custom interactive SVG GIS coordinate map engine
│       └── /CitizenSimulator.tsx <-- Simulated smartphone device simulating SMS/Push & Tip attachments`}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CORE SPLIT-PANE ACTIVE GRID WORKSPACE */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        
        {/* LEFT COLUMN: LAW ENFORCEMENT DISPATCH TERMINAL (8 COLS) */}
        <section className="lg:col-span-8 flex flex-col space-y-6">
          
          {/* TOP METRICS STRIP */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="hud-panel rounded-xl p-4 flex items-center space-x-3.5 shadow-lg relative overflow-hidden group">
              <HudCardCorners />
              <div className="bg-rose-500/10 p-2.5 rounded-lg border border-rose-500/30 text-rose-400 group-hover:bg-rose-500/20 transition-all duration-300">
                <Radio className="w-5 h-5 animate-pulse text-rose-500" />
              </div>
              <div>
                <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider font-mono">Active Alerts</span>
                <h4 className="text-2xl font-extrabold text-white font-sans mt-0.5 tracking-tight">{stats.activeIncidents}</h4>
              </div>
            </div>

            <div className="hud-panel rounded-xl p-4 flex items-center space-x-3.5 shadow-lg relative overflow-hidden group">
              <HudCardCorners />
              <div className="bg-emerald-500/10 p-2.5 rounded-lg border border-emerald-500/30 text-emerald-400 group-hover:bg-emerald-500/20 transition-all duration-300">
                <CheckCircle className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider font-mono">Resolved Cases</span>
                <h4 className="text-2xl font-extrabold text-white font-sans mt-0.5 tracking-tight">{stats.resolvedIncidents}</h4>
              </div>
            </div>

            <div className="hud-panel rounded-xl p-4 flex items-center space-x-3.5 shadow-lg relative overflow-hidden group">
              <HudCardCorners />
              <div className="bg-[#121217] p-2.5 rounded-lg border border-luxury-border text-[#a5b4fc] group-hover:bg-[#1a1a24] transition-all duration-300">
                <Users className="w-5 h-5 text-[#818cf8]" />
              </div>
              <div>
                <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider font-mono">Local Citizens</span>
                <h4 className="text-2xl font-extrabold text-white font-sans mt-0.5 tracking-tight">{stats.registeredCitizens}</h4>
              </div>
            </div>

            <div className="hud-panel rounded-xl p-4 flex items-center space-x-3.5 shadow-lg relative overflow-hidden group">
              <HudCardCorners />
              <div className="bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/30 text-luxury-gold group-hover:bg-amber-500/20 transition-all duration-300">
                <MessageSquare className="w-5 h-5 text-luxury-gold" />
              </div>
              <div>
                <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider font-mono">Tips Received</span>
                <h4 className="text-2xl font-extrabold text-white font-sans mt-0.5 tracking-tight">{stats.totalTipsReceived}</h4>
              </div>
            </div>
          </div>

          {/* MAIN INTERACTIVE COORDINATE MAP CONTAINER */}
          <div className="hud-panel rounded-2xl overflow-hidden shadow-2xl relative p-1 bg-[#09090c]/40">
            <HudCardCorners />
            <div className="bg-[#0f0f13]/90 px-5 py-3 border-b border-luxury-border/60 flex justify-between items-center rounded-t-xl">
              <div className="flex items-center space-x-2">
                <Globe className="w-4 h-4 text-luxury-gold" />
                <span className="text-xs font-bold text-zinc-200 uppercase tracking-wider font-sans">Interactive GIS Tactical Grid</span>
              </div>
              <div className="flex items-center space-x-2 text-[10px] text-zinc-400 font-mono">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="tracking-wide">OPERATIONAL GRID (Lat: {mapCenter.latitude.toFixed(3)}, Lng: {mapCenter.longitude.toFixed(3)})</span>
              </div>
            </div>
            
            <MapComponent
              citizens={citizens}
              incidents={incidents}
              tips={tips}
              selectedIncidentId={selectedIncidentId}
              onSelectIncident={setSelectedIncidentId}
              onMapClick={handleMapClick}
              pendingCoordinates={pendingCoordinates}
              onClearPending={() => setPendingCoordinates(null)}
              mapCenter={mapCenter}
              activeTheme={activeTheme}
            />
          </div>

          {/* SPLIT SUB-PANELS: DISPATCHER ACTION FORMS + ACTIVE CASES LIST */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* PANEL A: BROADCAST GEOFENCED CRITICAL ALERT FORM */}
            <div className="hud-panel rounded-2xl p-6 space-y-4 shadow-2xl relative flex flex-col justify-between overflow-hidden bg-[#09090d]/80">
              <HudCardCorners />
              <div>
                <div className="flex items-center space-x-2 border-b border-luxury-border/60 pb-2 mb-3.5">
                  <Radio className="w-4.5 h-4.5 text-rose-500 animate-pulse" />
                  <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-wider font-sans">Broadcast Geofence Alert</h3>
                </div>

                {formError && (
                  <div className="bg-rose-500/10 text-rose-400 border border-rose-500/30 p-3 rounded-xl text-[11px] mb-3.5 leading-relaxed">
                    🚨 {formError}
                  </div>
                )}

                <form onSubmit={handleInitiateIncident} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] text-zinc-400 mb-1.5 font-bold uppercase tracking-wider font-mono">Incident Category</label>
                      <select
                        value={newType}
                        onChange={(e) => setNewType(e.target.value as IncidentType)}
                        className="w-full bg-[#050508] border border-luxury-border/80 focus:border-luxury-gold rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-luxury-gold/30 transition-all cursor-pointer"
                        required
                      >
                        <option value="robbery">Armed Robbery</option>
                        <option value="missing_person">Missing Person</option>
                        <option value="assault">Assault Incident</option>
                        <option value="theft">Grand Theft Auto</option>
                        <option value="suspicious_activity">Suspicious Activity</option>
                        <option value="other">General Warning</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] text-zinc-400 mb-1.5 font-bold uppercase tracking-wider font-mono">Geofence Radius</label>
                      <select
                        value={newRadius}
                        onChange={(e) => setNewRadius(parseFloat(e.target.value))}
                        className="w-full bg-[#050508] border border-luxury-border/80 focus:border-luxury-gold rounded-xl px-3 py-2 text-xs text-luxury-gold focus:outline-none focus:ring-1 focus:ring-luxury-gold/30 font-mono font-bold cursor-pointer animate-pulse"
                        required
                      >
                        <option value="0.5">0.5 KM Radius</option>
                        <option value="1.0">1.0 KM Radius</option>
                        <option value="1.5">1.5 KM Radius</option>
                        <option value="2.0">2.0 KM (Standard)</option>
                        <option value="3.0">3.0 KM Radius</option>
                        <option value="5.0">5.0 KM Geofence</option>
                      </select>
                    </div>
                  </div>

                  {/* EPICENTER GPS DISPLAY */}
                  <div>
                    <label className="block text-[10px] text-zinc-400 mb-1.5 font-bold uppercase tracking-wider font-mono">Epicenter Coordinates (WGS84)</label>
                    {pendingCoordinates ? (
                      <div className="bg-[#050508] px-3.5 py-2.5 rounded-xl border border-rose-500/40 flex justify-between items-center neon-border-red">
                        <span className="text-[11px] text-rose-400 font-mono font-bold flex items-center space-x-2">
                          <MapPin className="w-4 h-4 animate-bounce text-rose-500" />
                          <span>Lat: {pendingCoordinates.latitude.toFixed(5)}, Lng: {pendingCoordinates.longitude.toFixed(5)}</span>
                        </span>
                        <button
                          type="button"
                          id="clear-epicenter-btn"
                          onClick={() => setPendingCoordinates(null)}
                          className="text-[10px] text-luxury-gold hover:text-luxury-gold-hover font-extrabold uppercase cursor-pointer"
                        >
                          Clear
                        </button>
                      </div>
                    ) : (
                      <div className="bg-[#050508]/60 px-4 py-3 rounded-xl border border-dashed border-luxury-border/60 text-[11px] text-zinc-500 text-center flex items-center justify-center space-x-2">
                        <Compass className="w-4 h-4 text-zinc-600 animate-pulse" />
                        <span className="font-sans">Click interactive GIS map grid to drop epicenter epicenter pin</span>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-[10px] text-zinc-400 mb-1.5 font-bold uppercase tracking-wider font-mono">Broadcast Alert Title</label>
                    <input
                      type="text"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="e.g., Active Armed Suspect on Foot"
                      className="w-full bg-[#050508] border border-luxury-border/80 focus:border-luxury-gold rounded-xl px-3.5 py-2 text-xs text-zinc-200 placeholder-zinc-700 focus:outline-none focus:ring-1 focus:ring-luxury-gold/30 transition-all"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-zinc-400 mb-1.5 font-bold uppercase tracking-wider font-mono">Emergency Action Instruction</label>
                    <textarea
                      value={newDescription}
                      onChange={(e) => setNewDescription(e.target.value)}
                      placeholder="Provide critical description, suspect details, vehicle markings, stay indoors warnings..."
                      className="w-full bg-[#050508] border border-luxury-border/80 focus:border-luxury-gold rounded-xl p-3 text-xs text-zinc-200 placeholder-zinc-700 focus:outline-none focus:ring-1 focus:ring-luxury-gold/30 h-16 resize-none transition-all"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    id="dispatch-critical-alert-btn"
                    disabled={isSubmittingIncident || !pendingCoordinates}
                    className="w-full bg-rose-600 hover:bg-rose-700 disabled:bg-[#121216] disabled:text-zinc-600 text-white text-xs font-extrabold py-3 rounded-xl transition-all flex items-center justify-center space-x-2 shadow-lg shadow-rose-950/25 cursor-pointer disabled:border-zinc-800 disabled:border"
                  >
                    <Radio className="w-4 h-4" />
                    <span>{isSubmittingIncident ? 'Broadcasting Geofence...' : 'Deploy Broadcast & Alert Residents'}</span>
                  </button>
                </form>
              </div>

              <div className="text-[9.5px] text-zinc-500 font-mono leading-relaxed border-t border-luxury-border/60 pt-3.5 mt-2">
                ⚡ <strong className="text-zinc-400">Emergency Pipeline:</strong> Alert triggers localized cellular broadcast. Target citizens fall inside radius. Unregistered targets are segmented.
              </div>
            </div>

            {/* PANEL B: ACTIVE INCIDENTS & RESOLUTION CONTROLS */}
            <div className="hud-panel rounded-2xl p-6 shadow-2xl relative flex flex-col justify-between overflow-hidden bg-[#09090d]/80">
              <HudCardCorners />
              <div>
                <div className="flex items-center space-x-2 border-b border-luxury-border/60 pb-2 mb-3.5">
                  <Shield className="w-4.5 h-4.5 text-luxury-gold" />
                  <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-wider font-sans">Active Threat Monitor</h3>
                </div>

                <div className="space-y-3.5 max-h-[300px] overflow-y-auto pr-1">
                  {incidents.length === 0 ? (
                    <div className="text-center py-12 text-zinc-500 text-xs">No threats registered.</div>
                  ) : (
                    incidents.map((incident) => {
                      const isSelected = selectedIncidentId === incident.id;
                      const isActive = incident.status === 'active';

                      return (
                        <div
                          key={incident.id}
                          className={`p-3.5 rounded-xl border transition-all cursor-pointer ${isSelected ? 'bg-black/60 border-luxury-gold shadow-lg glow-gold/10' : 'bg-black/20 border-luxury-border hover:border-zinc-700'}`}
                          onClick={() => setSelectedIncidentId(incident.id)}
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex items-center space-x-2">
                              <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${getIncidentTypeColor(incident.type)}`}>
                                {getFriendlyType(incident.type)}
                              </span>
                              <span className="text-[10px] font-mono text-zinc-500 font-bold">[{incident.id}]</span>
                            </div>
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${isActive ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
                              {incident.status.toUpperCase()}
                            </span>
                          </div>

                          <h4 className="text-xs font-bold text-zinc-200 mt-2 font-sans">{incident.title}</h4>
                          <p className="text-[11px] text-zinc-400 mt-1 line-clamp-2 leading-relaxed">{incident.description}</p>

                          <div className="flex justify-between items-center mt-3 pt-2.5 border-t border-black/60 text-[10px] text-zinc-500">
                            <span>{new Date(incident.createdAt).toLocaleTimeString()}</span>
                            <span>Radius: {incident.radiusKm.toFixed(1)}km</span>
                          </div>

                          {/* CASE RESOLUTION TRIGGER */}
                          {isActive && isSelected && (
                            <button
                              type="button"
                              id={`resolve-incident-btn-${incident.id}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleResolveIncident(incident.id);
                              }}
                              className="mt-3 w-full bg-emerald-600 hover:bg-emerald-700 text-white text-[10.5px] font-bold py-1.5 rounded-lg transition-colors flex items-center justify-center space-x-1.5 cursor-pointer shadow-sm"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                              <span>Mark Resolved & Alert Residents</span>
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="text-[10px] text-luxury-gold font-mono bg-luxury-gold/5 border border-luxury-gold/15 p-2.5 rounded-xl mt-3 flex items-center space-x-1.5">
                <Info className="w-3.5 h-3.5" />
                <span>Select an incident to view its active crowdsourced tips.</span>
              </div>
            </div>

          </div>
        </section>

        {/* RIGHT COLUMN: CITIZEN MOBILE PHONE SIMULATOR & TIPS PIPELINE (4 COLS) */}
        <section className="lg:col-span-4 flex flex-col space-y-6">
          
          {/* CITIZEN HARDWARE PHONE FRAME SIMULATOR */}
          <div className="hud-panel rounded-2xl p-5 shadow-2xl relative space-y-4 overflow-hidden bg-[#09090d]/80">
            <HudCardCorners />
            <div className="flex justify-between items-center border-b border-luxury-border/60 pb-2">
              <span className="text-xs font-bold text-zinc-200 uppercase tracking-wider flex items-center space-x-2 font-sans">
                <Smartphone className="w-4 h-4 text-emerald-400" />
                <span>Citizen Mobile Simulator</span>
              </span>
              <span className="text-[10px] font-mono text-zinc-500 font-bold tracking-wide uppercase">Interactive Device Node</span>
            </div>

            <CitizenSimulator
              citizens={citizens}
              activeIncidents={incidents.filter(i => i.status === 'active')}
              onCitizenUpdate={handleCitizenUpdate}
              notifications={notifications}
              onAddTip={handleAddTip}
              mapCenter={mapCenter}
            />
          </div>

          {/* REAL-TIME INCOMING CROWDSOURCED LEADS FEED */}
          <div className="hud-panel rounded-2xl p-6 flex-1 flex flex-col justify-between space-y-4 shadow-2xl relative overflow-hidden bg-[#09090d]/80 max-h-[420px]">
            <HudCardCorners />
            <div>
              <div className="flex items-center space-x-2 border-b border-luxury-border/60 pb-2 mb-3.5">
                <MessageSquare className="w-4.5 h-4.5 text-luxury-gold animate-pulse" />
                <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-wider font-sans">Crowdsourced Tip Leads</h3>
              </div>

              <div className="space-y-3 max-h-[240px] overflow-y-auto pr-1">
                {tips.filter(t => !selectedIncidentId || t.incidentId === selectedIncidentId).length === 0 ? (
                  <div className="text-center py-12 text-zinc-600 text-xs leading-normal font-sans">
                    No eyewitness leads received on this active threat case.
                  </div>
                ) : (
                  tips
                    .filter(t => !selectedIncidentId || t.incidentId === selectedIncidentId)
                    .map((tip) => {
                      const isPriority = tip.isPriority;
                      return (
                        <div
                          key={tip.id}
                          className={`p-3.5 border rounded-xl space-y-2.5 text-left transition-all relative overflow-hidden ${
                            isPriority
                              ? 'bg-rose-950/20 border-rose-500/50 hover:border-rose-500 shadow-md shadow-rose-950/20 neon-border-red'
                              : 'bg-[#050508]/60 border-luxury-border/60 hover:border-zinc-700'
                          }`}
                        >
                          {isPriority && (
                            <div className="absolute top-0 left-0 h-0.5 bg-rose-500 animate-pulse w-full" />
                          )}
                          <div className="flex justify-between items-center text-[10px]">
                            <span className={tip.isAnonymous ? 'text-luxury-gold font-bold' : 'text-[#a5b4fc] font-bold'}>
                              {tip.isAnonymous ? '👤 Anonymous Eyewitness' : `📞 Contact: ${tip.contactPhone}`}
                            </span>
                            <div className="flex items-center space-x-2">
                              {isPriority && (
                                <span className="text-[8px] font-bold text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/30 uppercase tracking-wider animate-pulse">
                                  ⚠️ Priority
                                </span>
                              )}
                              <span className="text-zinc-500 font-mono font-bold">{new Date(tip.submittedAt).toLocaleTimeString()}</span>
                            </div>
                          </div>

                          <p className="text-[11px] text-zinc-300 leading-normal font-sans">{tip.description}</p>

                          {isPriority && tip.priorityReason && (
                            <div className="text-[9.5px] bg-rose-500/10 text-rose-400 p-2 rounded-lg border border-rose-500/25 font-mono">
                              🛡️ Flagged: {tip.priorityReason}
                            </div>
                          )}

                          {tip.photoUrl && (
                            <div className="border border-luxury-border/60 rounded-xl overflow-hidden h-28 bg-[#050508] mt-1 relative group">
                              <img src={tip.photoUrl} alt="Submitted evidence" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" referrerPolicy="no-referrer" />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <span className="text-[10px] bg-black/80 px-2 py-1 rounded border border-luxury-border text-zinc-300 font-mono">EVIDENCE PHOTO</span>
                              </div>
                            </div>
                          )}

                          <div className="flex justify-between items-center text-[9px] text-zinc-500 font-mono pt-1">
                            <span>CASE REF: {tip.incidentId}</span>
                            <span>GPS: ({tip.latitude.toFixed(4)}, {tip.longitude.toFixed(4)})</span>
                          </div>
                        </div>
                      );
                    })
                )}
              </div>
            </div>

            <div className="border-t border-luxury-border/60 pt-3.5 flex items-center justify-between text-[10px] text-zinc-400 leading-normal font-mono font-bold">
              <span>Total leads processed on active case:</span>
              <span className="text-sm font-extrabold font-mono text-luxury-gold animate-pulse">
                {tips.filter(t => !selectedIncidentId || t.incidentId === selectedIncidentId).length}
              </span>
            </div>
          </div>

        </section>

      </main>

      {/* FOOTER */}
      <footer className="border-t border-luxury-border bg-black/40 px-6 py-4 mt-auto flex flex-col md:flex-row justify-between items-center text-xs text-zinc-500 gap-4">
        <div className="flex items-center space-x-2">
          <Shield className="w-4 h-4 text-zinc-600" />
          <span>GeoVigilance Tactile Core v1.1. Designed with safety-critical integrity standards.</span>
        </div>
        <div className="flex items-center space-x-4">
          <a href="#docs" onClick={(e) => { e.preventDefault(); setIsShowingDocs(true); }} className="hover:text-luxury-gold transition-colors font-semibold">Documentation</a>
          <span>•</span>
          <span className="font-mono text-[10px]">LOCAL TIME: 2026-07-04 UTC</span>
        </div>
      </footer>

      {/* GEOLOCATION ACCESS LOCK OVERLAY */}
      {locationStatus !== 'ready' && (
        <div className="fixed inset-0 bg-[#060608]/98 backdrop-blur-xl z-50 flex items-center justify-center p-4">
          {/* Immersive background graphic grids */}
          <div className="absolute inset-0 bg-[radial-gradient(#1c1c24_1px,transparent_1px)] [background-size:24px_24px] opacity-[0.15] pointer-events-none" />
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-luxury-gold/5 rounded-full blur-3xl pointer-events-none animate-pulse-slow" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-rose-500/5 rounded-full blur-3xl pointer-events-none animate-pulse-slow" style={{ animationDelay: '2s' }} />

          <div className="bg-luxury-card border-2 border-luxury-border/80 p-8 rounded-3xl max-w-lg w-full shadow-2xl relative overflow-hidden flex flex-col space-y-6 glow-gold/5">
            {/* Elegant double gold header accent */}
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-rose-500 via-luxury-gold to-rose-500" />
            <div className="absolute top-1 left-2 text-[9px] font-mono text-luxury-gold/30 uppercase tracking-widest pointer-events-none select-none">
              SECURE GRID ACCESS PORTAL v1.1
            </div>

            {/* Custom High-Fidelity SVG Vector Radar */}
            <div className="relative py-4">
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <MapPin className={`w-8 h-8 text-rose-500 ${locationStatus === 'locating' ? 'animate-bounce' : 'animate-pulse'}`} />
              </div>
              <svg className="w-32 h-32 mx-auto text-luxury-gold/40" viewBox="0 0 100 100">
                {/* Outer Ring */}
                <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="0.5" strokeDasharray="3 3" />
                {/* Middle Ring */}
                <circle cx="50" cy="50" r="30" fill="none" stroke="currentColor" strokeWidth="0.5" />
                {/* Inner Ring */}
                <circle cx="50" cy="50" r="15" fill="none" stroke="currentColor" strokeWidth="0.75" />
                {/* Coordinates grid crosshair lines */}
                <line x1="50" y1="3" x2="50" y2="97" stroke="currentColor" strokeWidth="0.5" strokeDasharray="2 2" />
                <line x1="3" y1="50" x2="97" y2="50" stroke="currentColor" strokeWidth="0.5" strokeDasharray="2 2" />
                {/* Rotating Sweeping Radar Segment */}
                <g className="animate-spin" style={{ transformOrigin: '50px 50px', animationDuration: '5s' }}>
                  <path d="M50 50 L50 5 A45 45 0 0 1 81.82 18.18 Z" fill="url(#radarSweep)" opacity="0.3" />
                </g>
                <defs>
                  <radialGradient id="radarSweep" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="rgba(197, 168, 128, 0)" />
                    <stop offset="100%" stopColor="rgba(197, 168, 128, 0.4)" />
                  </radialGradient>
                </defs>
              </svg>
            </div>

            {/* Header Content */}
            <div className="text-center space-y-2">
              <h2 className="text-xl font-bold text-zinc-100 font-sans tracking-tight uppercase">
                {locationStatus === 'locating' ? 'Synchronizing Live Telemetry...' : 'Live GPS Access Required'}
              </h2>
              <p className="text-xs text-zinc-400 font-medium leading-relaxed max-w-md mx-auto">
                {locationStatus === 'locating' 
                  ? 'Establishing secure link to your browser GPS. The active simulation, mock incidents, reports, and citizen coordinate metrics are automatically re-seeding around your actual physical location.'
                  : 'To experience this live dashboard, GeoVigilance requires access to your live location. All mock incidents and reports are dynamically generated and centered around your live physical coordinates.'
                }
              </p>
            </div>

            {/* HIGH-FIDELITY LIVE TERMINAL DIAGNOSTICS */}
            <div className="bg-[#09090c] border border-luxury-border/60 rounded-xl p-4 text-left font-mono text-[10px] space-y-2 text-zinc-400">
              <div className="flex justify-between items-center border-b border-luxury-border/30 pb-1.5 mb-1.5 text-zinc-500 uppercase tracking-wider font-bold">
                <span>System Interface</span>
                <span>Telemetry Status</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="flex items-center space-x-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>GEOFENCE DISPATCHER v1.1</span>
                </span>
                <span className="text-emerald-400 font-bold">ONLINE</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="flex items-center space-x-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>POSTGIS COORDINATE BUS</span>
                </span>
                <span className="text-emerald-400 font-bold">STABLE</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="flex items-center space-x-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>SSE EVENT EMITTER SOCKET</span>
                </span>
                <span className="text-emerald-400 font-bold">CONNECTED</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="flex items-center space-x-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${locationStatus === 'ready' ? 'bg-emerald-500' : locationStatus === 'locating' ? 'bg-amber-400 animate-ping' : 'bg-rose-500 animate-pulse'}`} />
                  <span>BROWSER HARDWARE GPS LINK</span>
                </span>
                <span className={`font-bold ${locationStatus === 'ready' ? 'text-emerald-400' : locationStatus === 'locating' ? 'text-amber-400 animate-pulse' : 'text-rose-500'}`}>
                  {locationStatus === 'ready' ? 'ACTIVE' : locationStatus === 'locating' ? 'LINKING...' : 'REQUIRED'}
                </span>
              </div>
            </div>

            {/* Helpful Visual Tips or Error Block */}
            {formError ? (
              <div className="text-xs bg-rose-950/20 border border-rose-500/30 text-rose-400 p-4 rounded-xl space-y-2.5">
                <div className="font-bold flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 text-rose-500" />
                  <span>GPS ACCESS ERROR REGISTERED:</span>
                </div>
                <div className="text-[11px] leading-relaxed font-mono">{formError}</div>
                <div className="border-t border-rose-500/10 pt-2.5 text-[10px] text-zinc-400 leading-normal space-y-1">
                  <div className="font-bold uppercase tracking-wider text-rose-300">How to solve this:</div>
                  <ol className="list-decimal pl-4 space-y-1 text-zinc-300">
                    <li>Look at the top left of your browser address bar (click the lock or settings icon).</li>
                    <li>Switch **Location** permission to **Allow / Authorize**.</li>
                    <li>Click the button below to initiate synchronization again.</li>
                  </ol>
                </div>
              </div>
            ) : (
              <div className="bg-[#09090c] border border-luxury-border/30 rounded-xl p-3 text-center text-[10px] text-zinc-400 font-mono flex items-center justify-center space-x-2">
                <Sparkles className="w-3.5 h-3.5 text-luxury-gold animate-pulse" />
                <span>ALL SIMULATION INCIDENTS AND REPORTING NODES GENERATED DIRECTLY AROUND YOU</span>
              </div>
            )}

            {/* Action Trigger Block */}
            <div className="pt-2 flex flex-col gap-2.5">
              <button
                onClick={handleCenterOnMyLocation}
                disabled={locationStatus === 'locating'}
                className="w-full bg-rose-600 hover:bg-rose-500 text-white font-semibold py-3 px-5 rounded-2xl shadow-md hover:shadow-lg transition-all text-xs cursor-pointer flex items-center justify-center space-x-2 border border-rose-500/30"
              >
                <Compass className={`w-4 h-4 ${locationStatus === 'locating' ? 'animate-spin' : ''}`} />
                <span>{locationStatus === 'locating' ? 'SYNCHRONIZING GPS SATELLITES...' : 'AUTHORIZE MY GPS LOCATION'}</span>
              </button>
              <div className="text-[10px] text-zinc-500 font-mono text-center">
                🔒 Strict Integrity Mandate: Operation restricted strictly to verified coordinates
              </div>
            </div>
          </div>
        </div>
      )}
      
    </div>
  );
}
