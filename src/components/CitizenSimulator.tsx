/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Smartphone, Bell, Eye, EyeOff, Send, Camera, ShieldAlert, CheckCircle, Navigation, Info, HelpCircle } from 'lucide-react';
import { Citizen, Incident, BroadcastNotification } from '../types.js';

interface CitizenSimulatorProps {
  citizens: Citizen[];
  activeIncidents: Incident[];
  onCitizenUpdate: (citizenData: { phone: string; name: string; latitude: number; longitude: number }) => void;
  notifications: BroadcastNotification[];
  onAddTip: (tipData: {
    incidentId: string;
    description: string;
    latitude: number;
    longitude: number;
    isAnonymous: boolean;
    contactPhone?: string;
    photoUrl?: string;
  }) => Promise<any>;
  mapCenter: { latitude: number; longitude: number };
}

export default function CitizenSimulator({
  citizens,
  activeIncidents,
  onCitizenUpdate,
  notifications,
  onAddTip,
  mapCenter,
}: CitizenSimulatorProps) {
  // Onboarding / Logged-in State
  const [isOnboarded, setIsOnboarded] = useState<boolean>(false);
  const [phone, setPhone] = useState<string>('+91 98920 45678');
  const [name, setName] = useState<string>('Ananya Patel');
  
  // Current Citizen Coordinates (Simulated Mobile GPS) relative to mapCenter
  const [latOffset, setLatOffset] = useState<number>(-0.024); // relative to center
  const [lngOffset, setLngOffset] = useState<number>(0.009);  // relative to center
  const currentLat = mapCenter.latitude + latOffset;
  const currentLng = mapCenter.longitude + lngOffset;

  // Selected Incident to report tip for
  const [selectedIncidentForTip, setSelectedIncidentForTip] = useState<string>('');
  const [tipDescription, setTipDescription] = useState<string>('');
  const [isAnonymous, setIsAnonymous] = useState<boolean>(true);
  const [contactPhone, setContactPhone] = useState<string>('');
  const [selectedPhoto, setSelectedPhoto] = useState<string>('');
  const [isSubmittingTip, setIsSubmittingTip] = useState<boolean>(false);
  const [tipSuccess, setTipSuccess] = useState<boolean>(false);
  const [tipPriorityFlagged, setTipPriorityFlagged] = useState<boolean>(false);
  const [tipPriorityReason, setTipPriorityReason] = useState<string>('');

  // Device Lockscreen / Incoming Notification Banners
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [activeBanner, setActiveBanner] = useState<BroadcastNotification | null>(null);
  const [soundPlaying, setSoundPlaying] = useState<boolean>(false);
  const [localNotificationsLog, setLocalNotificationsLog] = useState<BroadcastNotification[]>([]);

  // Simulation Presets for Photos
  const simulatedPhotos = [
    { name: 'None (Text Only)', value: '' },
    { name: '🚨 Hooded suspect fleeing', value: 'https://images.unsplash.com/photo-1509114397022-ed747cca3f65?w=150&auto=format&fit=crop&q=60' },
    { name: '🚗 Suspicious silver sedan', value: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=150&auto=format&fit=crop&q=60' },
    { name: '🎒 Abandoned black canvas bag', value: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=150&auto=format&fit=crop&q=60' }
  ];

  // Auto-initialize current coordinates when onboarding
  const handleOnboard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || !name) return;
    onCitizenUpdate({
      phone,
      name,
      latitude: currentLat,
      longitude: currentLng
    });
    setIsOnboarded(true);
    setContactPhone(phone);
  };

  // Sync state GPS changes to backend
  useEffect(() => {
    if (isOnboarded) {
      onCitizenUpdate({
        phone,
        name,
        latitude: currentLat,
        longitude: currentLng
      });
    }
  }, [currentLat, currentLng, isOnboarded]);

  // Listen to new notifications and check geofence inclusion
  useEffect(() => {
    if (notifications.length === 0) return;
    const latestNotif = notifications[0]; // assume sorted newest first on parent
    
    // Check if this citizen falls inside the geofence
    const dist = calculateDistance(currentLat, currentLng, latestNotif.latitude, latestNotif.longitude);
    const isInside = dist <= latestNotif.radiusKm;

    if (isInside) {
      // Add to local device notifications log if not already added
      setLocalNotificationsLog(prev => {
        if (prev.some(n => n.id === latestNotif.id)) return prev;
        return [latestNotif, ...prev];
      });

      // Show drop-down push notification banner
      setActiveBanner(latestNotif);
      setSoundPlaying(true);
      
      // Auto-set selected incident in the tip form so they can immediately reply
      setSelectedIncidentForTip(latestNotif.incidentId);

      // Dismiss banner after 7 seconds, turn off alarm beep
      const timer = setTimeout(() => {
        setActiveBanner(null);
        setSoundPlaying(false);
      }, 7000);

      return () => clearTimeout(timer);
    }
  }, [notifications, currentLat, currentLng]);

  // Local distance calculation (Haversine)
  function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // Handle Tip Form Submission
  const handleSubmitTip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIncidentForTip || !tipDescription) return;

    setIsSubmittingTip(true);
    const result = await onAddTip({
      incidentId: selectedIncidentForTip,
      description: tipDescription,
      latitude: currentLat,
      longitude: currentLng,
      isAnonymous,
      contactPhone: isAnonymous ? undefined : contactPhone,
      photoUrl: selectedPhoto || undefined
    });

    setIsSubmittingTip(false);
    if (result) {
      setTipSuccess(true);
      if (result.tip && result.tip.isPriority) {
        setTipPriorityFlagged(true);
        setTipPriorityReason(result.tip.priorityReason || '');
      } else {
        setTipPriorityFlagged(false);
        setTipPriorityReason('');
      }
      setTipDescription('');
      setSelectedPhoto('');
      setTimeout(() => {
        setTipSuccess(false);
        setTipPriorityFlagged(false);
        setTipPriorityReason('');
      }, 5000);
    }
  };

  return (
    <div className="w-full max-w-sm mx-auto bg-[#09090b] border-4 border-[#1e1e24] rounded-[40px] shadow-2xl p-3 relative overflow-hidden flex flex-col h-[650px]">
      
      {/* PHONE TOP NOTCH & STATUS BAR */}
      <div className="absolute top-2 left-1/2 transform -translate-x-1/2 w-32 h-4.5 bg-black/80 rounded-full z-30 flex items-center justify-around px-4 border border-luxury-border/40">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
        <span className="w-10 h-1 bg-zinc-800 rounded-full" />
      </div>

      <div className="flex justify-between items-center px-4 pt-1 pb-2 text-[10px] text-zinc-500 font-mono z-20">
        <span>12:50 PM</span>
        <div className="flex items-center space-x-1.5">
          <Navigation className="w-3 h-3 text-emerald-500 animate-pulse" />
          <span>GPS Connected</span>
        </div>
      </div>

      {/* REAL-TIME AUDIBLE ALARM SOUND WAVE EFFECT */}
      {soundPlaying && (
        <div className="absolute inset-x-0 top-7 z-40 bg-rose-950/95 border-b border-rose-500 text-rose-200 px-4 py-2 flex items-center justify-between text-xs font-bold animate-pulse shadow-lg">
          <div className="flex items-center space-x-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
            </span>
            <span>SIMULATED SMS SIREN ACTIVE</span>
          </div>
          <button onClick={() => setSoundPlaying(false)} className="text-[10px] bg-rose-900/60 hover:bg-rose-900 text-white px-2 py-0.5 rounded uppercase cursor-pointer border border-rose-500/30">
            Mute
          </button>
        </div>
      )}

      {/* PUSH ALERT DROP-DOWN BANNER */}
      {activeBanner && (
        <div className="absolute top-8 inset-x-2 bg-black/95 border border-rose-500/80 rounded-2xl p-3.5 shadow-2xl z-50 text-white glow-rose/10">
          <div className="flex items-start space-x-3">
            <div className="bg-rose-500/10 p-1.5 rounded-lg border border-rose-500/20 text-rose-400">
              <ShieldAlert className="w-5 h-5 animate-bounce" />
            </div>
            <div className="flex-1 text-left">
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-rose-400 font-bold uppercase tracking-wider">GeoVigilance Alert</span>
                <span className="text-[9px] text-zinc-500">Just Now</span>
              </div>
              <h4 className="text-xs font-semibold mt-0.5 text-zinc-100">{activeBanner.title}</h4>
              <p className="text-[10px] text-zinc-300 mt-1 line-clamp-2 leading-relaxed">{activeBanner.body}</p>
              <div className="mt-2 text-[9px] text-luxury-gold font-mono flex items-center space-x-1">
                <Info className="w-3 h-3" />
                <span>TAP TO REPORT SUSPICIOUS ACTIVITY BELOW</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MAIN DEVICE SCREEN */}
      <div className="flex-1 bg-black/80 rounded-[30px] overflow-y-auto p-4 flex flex-col scrollbar-thin">
        
        {/* VIEW 1: ONBOARDING FOR SIMULATION */}
        {!isOnboarded ? (
          <div className="flex-1 flex flex-col justify-center items-center text-center py-6">
            <div className="w-16 h-16 rounded-2xl bg-luxury-gold/5 border border-luxury-border/60 flex items-center justify-center text-luxury-gold mb-4 shadow-inner">
              <Smartphone className="w-8 h-8" />
            </div>
            <h3 className="text-base font-bold text-zinc-100 tracking-tight font-sans">Onboard Citizen Node</h3>
            <p className="text-xs text-zinc-400 max-w-xs mt-2 mb-6 leading-relaxed">
              Register a simulated local citizen phone number. This node will dynamically compute spatial coordinates and listen for geofenced alerts.
            </p>

            <form onSubmit={handleOnboard} className="w-full space-y-4">
              <div>
                <label className="block text-left text-[11px] font-semibold text-zinc-400 mb-1">Simulated User Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Chloe Chen"
                  className="w-full bg-black/40 border border-luxury-border rounded-xl px-3.5 py-2.5 text-xs text-zinc-200 focus:outline-none focus:border-luxury-gold transition-colors"
                  required
                />
              </div>
              <div>
                <label className="block text-left text-[11px] font-semibold text-zinc-400 mb-1">Simulated Phone (SMS Core)</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 (415) 555-0322"
                  className="w-full bg-black/40 border border-luxury-border rounded-xl px-3.5 py-2.5 text-xs text-zinc-200 focus:outline-none focus:border-luxury-gold transition-colors"
                  required
                />
              </div>

              <button
                type="submit"
                id="onboard-citizen-submit-btn"
                className="w-full bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold py-2.5 rounded-xl transition-colors mt-2 cursor-pointer shadow-md"
              >
                Accept Location & Active SMS
              </button>
            </form>

            <div className="text-[10px] text-zinc-500 mt-6 leading-relaxed bg-black/40 p-2.5 rounded-xl border border-luxury-border">
              🔒 <strong>AI Privacy Guard:</strong> GeoVigilance operates secure end-to-end routing. Location coordinates are tracked purely on a local relative vector.
            </div>
          </div>
        ) : (
          /* VIEW 2: ACTIVE CITIZEN INTERFACE */
          <div className="flex-1 flex flex-col text-left space-y-4">
            
            {/* CITIZEN SIMULATION PROFILE HEADER */}
            <div className="bg-black/40 rounded-2xl p-3 border border-luxury-border flex justify-between items-center">
              <div>
                <div className="text-xs font-bold text-zinc-100 font-sans">{name}</div>
                <div className="text-[10px] text-zinc-500 font-mono mt-0.5">{phone}</div>
              </div>
              <div className="bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[9px] text-emerald-400 uppercase font-mono font-bold">ONLINE</span>
              </div>
            </div>

            {/* GPS GEOLOCATION COORDINATE CONTROLLER */}
            <div className="bg-black/40 rounded-2xl p-3.5 border border-luxury-border space-y-2.5">
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-bold text-zinc-300 uppercase tracking-wide font-sans">Simulate GPS Movement</span>
                <span className="text-[9px] font-mono text-emerald-400">({currentLat.toFixed(4)}, {currentLng.toFixed(4)})</span>
              </div>
              <p className="text-[10px] text-zinc-400 leading-normal">
                Drag the sliders to simulate walking through downtown streets. Watch yourself enter or exit geofenced danger zones.
              </p>

              {/* LATITUDE SLIDER */}
              <div className="space-y-1">
                <div className="flex justify-between text-[9px] text-zinc-500">
                  <span>North/South Offset</span>
                  <span className="font-mono text-zinc-300">{(latOffset * 111.12).toFixed(2)} km</span>
                </div>
                <input
                  type="range"
                  min="-0.045"
                  max="0.045"
                  step="0.001"
                  value={latOffset}
                  onChange={(e) => setLatOffset(parseFloat(e.target.value))}
                  className="w-full accent-luxury-gold bg-zinc-800 h-1 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              {/* LONGITUDE SLIDER */}
              <div className="space-y-1">
                <div className="flex justify-between text-[9px] text-zinc-500">
                  <span>East/West Offset</span>
                  <span className="font-mono text-zinc-300">{(lngOffset * 88).toFixed(2)} km</span>
                </div>
                <input
                  type="range"
                  min="-0.045"
                  max="0.045"
                  step="0.001"
                  value={lngOffset}
                  onChange={(e) => setLngOffset(parseFloat(e.target.value))}
                  className="w-full accent-luxury-gold bg-zinc-800 h-1 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            </div>

            {/* SUBMIT ANONYMOUS TIP FEEDBACK LOOP */}
            <div className="bg-black/40 rounded-2xl p-3.5 border border-luxury-border space-y-3">
              <div className="flex items-center space-x-1.5 border-b border-luxury-border pb-2">
                <Send className="w-4 h-4 text-luxury-gold" />
                <span className="text-xs font-bold text-zinc-200 font-sans">Submit Suspicious Tip</span>
              </div>

              {tipSuccess ? (
                <div className={`border p-3 rounded-xl text-center space-y-1 animate-pulse transition-all ${
                  tipPriorityFlagged 
                    ? 'bg-rose-950/40 border-rose-500/50 text-rose-300' 
                    : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                }`}>
                  {tipPriorityFlagged ? (
                    <>
                      <ShieldAlert className="w-8 h-8 mx-auto text-rose-500 mb-1" />
                      <h4 className="text-xs font-bold text-rose-400">URGENT PRIORITY LEAD SENT!</h4>
                      <p className="text-[10px] text-rose-300/80 leading-relaxed">
                        Security filters flagged safety-critical keywords related to <strong>{tipPriorityReason || 'Immediate Danger'}</strong>. Authorized dispatchers have been instantly alerted for rapid dispatch!
                      </p>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-8 h-8 mx-auto text-emerald-500 mb-1" />
                      <h4 className="text-xs font-bold">Secure Tip Submitted!</h4>
                      <p className="text-[10px] text-emerald-300/80 leading-relaxed">
                        Authorized dispatchers received your coordinates and description in real-time.
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <form onSubmit={handleSubmitTip} className="space-y-3">
                  <div>
                    <label className="block text-[10px] text-zinc-400 mb-1 font-semibold uppercase tracking-wider">Linked Incident Alert</label>
                    <select
                      value={selectedIncidentForTip}
                      onChange={(e) => setSelectedIncidentForTip(e.target.value)}
                      className="w-full bg-black border border-luxury-border rounded-lg px-2.5 py-1.5 text-[11px] text-zinc-200 focus:outline-none focus:border-luxury-gold cursor-pointer"
                      required
                    >
                      <option value="">-- Choose Relevant Threat --</option>
                      {activeIncidents.map(inc => (
                        <option key={inc.id} value={inc.id}>
                          [{inc.id}] {inc.title.slice(0, 30)}...
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] text-zinc-400 mb-1 font-semibold uppercase tracking-wider">Eye-Witness Description</label>
                    <textarea
                      value={tipDescription}
                      onChange={(e) => setTipDescription(e.target.value)}
                      placeholder="What did you see? Suspect descriptions, clothing, license plates, escape directions..."
                      className="w-full bg-black border border-luxury-border rounded-lg p-2 text-[11px] text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-luxury-gold h-16 resize-none"
                      required
                    />
                  </div>

                  {/* SIMULATED EVIDENCE CAPTURE */}
                  <div>
                    <label className="block text-[10px] text-zinc-400 mb-1 font-semibold uppercase flex items-center space-x-1 tracking-wider">
                      <Camera className="w-3 h-3 text-zinc-500" />
                      <span>Simulate Photo Capture</span>
                    </label>
                    <select
                      value={selectedPhoto}
                      onChange={(e) => setSelectedPhoto(e.target.value)}
                      className="w-full bg-black border border-luxury-border rounded-lg px-2.5 py-1.5 text-[11px] text-zinc-200 focus:outline-none focus:border-luxury-gold cursor-pointer"
                    >
                      {simulatedPhotos.map((photo, i) => (
                        <option key={i} value={photo.value}>
                          {photo.name}
                        </option>
                      ))}
                    </select>
                    {selectedPhoto && (
                      <div className="mt-2 border border-luxury-border rounded-lg overflow-hidden h-20 w-full bg-black flex items-center justify-center">
                        <img src={selectedPhoto} alt="Evidence preview" className="h-full object-cover w-full" referrerPolicy="no-referrer" />
                      </div>
                    )}
                  </div>

                  {/* ANONYMITY CONTROLS */}
                  <div className="flex justify-between items-center bg-black p-2 rounded-lg border border-luxury-border">
                    <span className="text-[10px] text-zinc-300 font-semibold">Anonymize My Feed</span>
                    <button
                      type="button"
                      id="anonymize-tip-toggle"
                      onClick={() => setIsAnonymous(!isAnonymous)}
                      className={`px-2.5 py-1 rounded text-[10px] font-bold flex items-center space-x-1 transition-all cursor-pointer ${isAnonymous ? 'bg-luxury-gold/10 text-luxury-gold border border-luxury-gold/30' : 'bg-zinc-800 text-zinc-400 border border-zinc-700'}`}
                    >
                      {isAnonymous ? (
                        <>
                          <EyeOff className="w-3 h-3" />
                          <span>Anonymous</span>
                        </>
                      ) : (
                        <>
                          <Eye className="w-3 h-3" />
                          <span>Identified</span>
                        </>
                      )}
                    </button>
                  </div>

                  {!isAnonymous && (
                    <div className="animate-fade-in">
                      <label className="block text-[9px] text-zinc-400 mb-0.5 font-semibold uppercase tracking-wider">Callback Phone Number</label>
                      <input
                        type="text"
                        value={contactPhone}
                        onChange={(e) => setContactPhone(e.target.value)}
                        className="w-full bg-black border border-luxury-border rounded-lg p-1.5 text-[11px] text-zinc-200 font-mono"
                        required={!isAnonymous}
                      />
                    </div>
                  )}

                  <button
                    type="submit"
                    id="submit-tip-btn"
                    disabled={isSubmittingTip || activeIncidents.length === 0}
                    className="w-full bg-luxury-gold hover:bg-luxury-gold-hover disabled:bg-zinc-900 disabled:text-zinc-600 text-black text-xs font-bold py-2 rounded-xl transition-all flex items-center justify-center space-x-1.5 cursor-pointer shadow-md"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{isSubmittingTip ? 'Broadcasting Tip...' : 'Transmit Tip to Authorities'}</span>
                  </button>
                </form>
              )}
            </div>

            {/* LOCAL DEVICE INBOX / NOTIFICATIONS HISTORY */}
            <div className="bg-black/40 rounded-2xl p-3.5 border border-luxury-border space-y-2">
              <span className="text-[11px] font-bold text-zinc-300 uppercase tracking-wide flex items-center space-x-1.5 font-sans">
                <Bell className="w-3.5 h-3.5 text-luxury-gold" />
                <span>Geofenced Notifications Inbox</span>
              </span>

              {localNotificationsLog.length === 0 ? (
                <div className="text-[10px] text-zinc-500 text-center py-4 bg-black/40 rounded-xl border border-luxury-border/40">
                  No alerts within your current geofence.
                </div>
              ) : (
                <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                  {localNotificationsLog.map(notif => (
                    <div
                      key={notif.id}
                      className={`p-2.5 rounded-xl text-[10px] border ${notif.type === 'alert' ? 'bg-rose-500/5 border-rose-500/20 text-zinc-200' : 'bg-emerald-500/5 border-emerald-500/20 text-zinc-200'}`}
                    >
                      <div className="flex justify-between font-bold">
                        <span className={notif.type === 'alert' ? 'text-rose-400' : 'text-emerald-400'}>
                          {notif.type === 'alert' ? '🔴 CRITICAL CRIME' : '🟢 AREA SECURE'}
                        </span>
                        <span className="font-mono text-zinc-500 text-[8px]">{new Date(notif.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div className="font-semibold mt-0.5">{notif.title}</div>
                      <p className="text-[9.5px] text-zinc-400 mt-1 leading-normal">{notif.body}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}
      </div>

      {/* PHONE BOTTOM BUTTON */}
      <div className="pt-2 pb-0.5 flex justify-center z-20">
        <button
          onClick={() => {
            if (isOnboarded) {
              setIsLocked(!isLocked);
              if (isLocked) {
                // remove alarms on relock
                setSoundPlaying(false);
              }
            }
          }}
          className="w-24 h-1.5 bg-zinc-700 rounded-full hover:bg-zinc-500 transition-colors cursor-pointer"
          title="Sleep/Lock Switch"
        />
      </div>
    </div>
  );
}
