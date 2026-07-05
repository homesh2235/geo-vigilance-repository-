/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Shield, Users, Radio, MapPin, Eye, AlertCircle, RefreshCw, ZoomIn, ZoomOut, MousePointer, Globe, Layers } from 'lucide-react';
import { Citizen, Incident, Tip, IncidentType } from '../types.js';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface MapComponentProps {
  citizens: Citizen[];
  incidents: Incident[];
  tips: Tip[];
  selectedIncidentId: string | null;
  onSelectIncident: (id: string) => void;
  onMapClick: (lat: number, lng: number) => void;
  pendingCoordinates: { latitude: number; longitude: number } | null;
  onClearPending: () => void;
  mapCenter: { latitude: number; longitude: number };
  activeTheme: 'onyx' | 'matrix' | 'amber' | 'subzero';
}

export default function MapComponent({
  citizens,
  incidents,
  tips,
  selectedIncidentId,
  onSelectIncident,
  onMapClick,
  pendingCoordinates,
  onClearPending,
  mapCenter,
  activeTheme,
}: MapComponentProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const layersGroupRef = useRef<L.FeatureGroup | null>(null);

  const [hiddenTypes, setHiddenTypes] = useState<Set<IncidentType>>(new Set<IncidentType>());
  const [mapMode, setMapMode] = useState<'tactical' | 'satellite' | 'accessible'>('tactical');

  const getThemeAccentColor = () => {
    switch (activeTheme) {
      case 'matrix': return '#22c55e';
      case 'amber': return '#f59e0b';
      case 'subzero': return '#0ea5e9';
      default: return '#c5a880';
    }
  };
  const themeAccent = getThemeAccentColor();

  const getMapFilterStyle = () => {
    if (mapMode === 'satellite') return 'none';
    if (mapMode === 'accessible') return 'none';
    switch (activeTheme) {
      case 'matrix': return 'hue-rotate(85deg) saturate(140%) contrast(100%) brightness(85%) invert(10%)';
      case 'amber': return 'hue-rotate(18deg) saturate(115%) contrast(100%) brightness(85%) invert(5%)';
      case 'subzero': return 'hue-rotate(190deg) saturate(140%) contrast(100%) brightness(80%)';
      default: return 'none';
    }
  };

  const filteredIncidents = useMemo(() => {
    return incidents.filter(incident => !hiddenTypes.has(incident.type));
  }, [incidents, hiddenTypes]);

  // Compute boundaries dynamically relative to the current center
  const MAP_LAT_MIN = mapCenter.latitude - 0.05;
  const MAP_LAT_MAX = mapCenter.latitude + 0.05;
  const MAP_LNG_MIN = mapCenter.longitude - 0.05;
  const MAP_LNG_MAX = mapCenter.longitude + 0.05;

  const centerLat = mapCenter.latitude;
  const centerLng = mapCenter.longitude;

  // 1. Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Create the map instance
    const map = L.map(mapContainerRef.current, {
      center: [centerLat, centerLng],
      zoom: 13,
      zoomControl: false,
      attributionControl: false,
      maxBounds: [
        [MAP_LAT_MIN - 0.05, MAP_LNG_MIN - 0.05],
        [MAP_LAT_MAX + 0.05, MAP_LNG_MAX + 0.05],
      ],
      minZoom: 11,
      maxZoom: 18,
    });

    leafletMapRef.current = map;

    // Create a feature group to hold all dynamic markers, pins, circles
    const group = L.featureGroup().addTo(map);
    layersGroupRef.current = group;

    // Handle clicks on the map to trigger pending pin placement
    const handleMapClickEvent = (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      if (
        lat >= MAP_LAT_MIN &&
        lat <= MAP_LAT_MAX &&
        lng >= MAP_LNG_MIN &&
        lng <= MAP_LNG_MAX
      ) {
        onMapClick(lat, lng);
      }
    };

    map.on('click', handleMapClickEvent);

    return () => {
      map.off('click', handleMapClickEvent);
      map.remove();
      leafletMapRef.current = null;
      layersGroupRef.current = null;
    };
  }, [onMapClick, centerLat, centerLng]);

  // 2. Manage and Swap Tile Layers based on MapMode
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    let tileUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    let attribution = '&copy; OpenStreetMap contributors &copy; CARTO';

    if (mapMode === 'satellite') {
      tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
      attribution = 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community';
    } else if (mapMode === 'accessible') {
      tileUrl = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
      attribution = '&copy; OpenStreetMap contributors &copy; CARTO';
    }

    const layer = L.tileLayer(tileUrl, { attribution });
    layer.addTo(map);
    tileLayerRef.current = layer;
  }, [mapMode]);

  // 3. Dynamic Layers (Markers, Geofences, Citizens, Crowd-sourced Tips) Sync
  useEffect(() => {
    const map = leafletMapRef.current;
    const group = layersGroupRef.current;
    if (!map || !group) return;

    // Cleanly unbind popups and tooltips on each layer before clearing to avoid Leaflet positioning crashes
    group.eachLayer((layer: any) => {
      try {
        if (layer.unbindPopup) {
          layer.unbindPopup();
        }
      } catch (e) {
        // Safe fallback
      }
      try {
        if (layer.unbindTooltip) {
          layer.unbindTooltip();
        }
      } catch (e) {
        // Safe fallback
      }
    });

    // Clear existing dynamic elements
    group.clearLayers();

    // A. Render GEOFENCES
    filteredIncidents.forEach((incident) => {
      if (incident.status !== 'active') return;
      const isSelected = selectedIncidentId === incident.id;

      const circle = L.circle([incident.latitude, incident.longitude], {
        radius: incident.radiusKm * 1000, // Leaflet uses meters
        color: isSelected ? '#e11d48' : themeAccent,
        weight: mapMode === 'accessible' ? 3 : 1.5,
        dashArray: '6,4',
        fillColor: isSelected ? '#e11d48' : themeAccent,
        fillOpacity: isSelected ? 0.08 : 0.04,
      });

      circle.bindTooltip(`R: ${incident.radiusKm.toFixed(1)}km Geofence`, {
        permanent: true,
        direction: 'top',
        className: 'custom-leaflet-tooltip'
      });

      circle.addTo(group);
    });

    // B. Render INCIDENT PINS
    filteredIncidents.forEach((incident) => {
      const isSelected = selectedIncidentId === incident.id;
      const isActive = incident.status === 'active';
      const isAccessible = mapMode === 'accessible';

      const pinColor = !isActive ? '#3f3f46' : isSelected ? '#e11d48' : '#be123c';
      const pulseRing = isActive ? `<span class="absolute -inset-2 rounded-full bg-red-500 animate-ping opacity-60"></span>` : '';
      const labelBorder = isAccessible ? 'border-2 border-white' : 'border border-black/40';

      const html = `
        <div class="relative flex items-center justify-center" style="transform: translate(0, -50%);">
          ${pulseRing}
          <div class="w-7 h-10 flex flex-col items-center justify-center">
            <svg class="w-7 h-10 drop-shadow-lg" viewBox="0 0 28 40" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M14 0C6.268 0 0 6.268 0 14C0 24.5 14 40 14 40C14 40 28 24.5 28 14C28 6.268 21.732 0 14 0Z" fill="${pinColor}" stroke="${isAccessible ? '#ffffff' : '#000000'}" stroke-width="${isAccessible ? '2.5' : '1.5'}"/>
              <circle cx="14" cy="14" r="5" fill="#ffffff" />
            </svg>
            <div class="absolute -top-6 whitespace-nowrap bg-black text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow ${isSelected ? 'border border-rose-500' : 'border border-zinc-700'}">
              ${incident.id} (${isActive ? 'ACTIVE' : 'RESOLVED'})
            </div>
          </div>
        </div>
      `;

      const icon = L.divIcon({
        html,
        className: 'custom-pin-icon-marker',
        iconSize: [28, 40],
        iconAnchor: [14, 20]
      });

      const marker = L.marker([incident.latitude, incident.longitude], { icon });
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        onSelectIncident(incident.id);
      });
      marker.addTo(group);
    });

    // C. Render CITIZENS
    citizens.forEach((citizen) => {
      // Check if inside any active geofence
      const isInsideActiveGeofence = filteredIncidents.some(inc => {
        if (inc.status !== 'active') return false;
        const dist = L.latLng(citizen.latitude, citizen.longitude).distanceTo(L.latLng(inc.latitude, inc.longitude));
        return dist <= inc.radiusKm * 1000;
      });

      const isAccessible = mapMode === 'accessible';
      const bgClass = isInsideActiveGeofence ? 'bg-rose-500' : 'bg-emerald-500';
      const borderClass = isAccessible ? 'border-2 border-white' : 'border border-black';
      const pulseElement = isInsideActiveGeofence ? `<span class="absolute -inset-1.5 rounded-full bg-red-500 animate-ping opacity-60"></span>` : '';

      const html = `
        <div class="relative group/marker flex items-center justify-center">
          ${pulseElement}
          <div class="w-3.5 h-3.5 rounded-full ${bgClass} ${borderClass} shadow-md transition-all duration-200 hover:scale-125"></div>
          <span class="absolute left-5 bg-black/95 text-white text-[9px] font-bold px-1.5 py-0.5 rounded border border-zinc-700 whitespace-nowrap opacity-0 pointer-events-none group-hover/marker:opacity-100 transition-opacity z-50">
            ${citizen.name}
          </span>
        </div>
      `;

      const icon = L.divIcon({
        html,
        className: 'custom-citizen-icon-marker',
        iconSize: [14, 14],
        iconAnchor: [7, 7]
      });

      const marker = L.marker([citizen.latitude, citizen.longitude], { icon });
      marker.bindPopup(`<strong>Citizen:</strong> ${citizen.name}<br/><strong>Phone:</strong> ${citizen.phone}`);
      marker.addTo(group);
    });

    // D. Render CROWDSOURCED TIPS
    tips.forEach((tip) => {
      const incidentOfTip = incidents.find(inc => inc.id === tip.incidentId);
      if (incidentOfTip && hiddenTypes.has(incidentOfTip.type)) return;

      const isAccessible = mapMode === 'accessible';
      const strokeCol = isAccessible ? '#ffffff' : '#09090b';
      const strokeWidth = isAccessible ? '2' : '1.2';

      const html = `
        <div class="relative flex items-center justify-center">
          <span class="absolute -inset-2 rounded-full bg-amber-500 animate-ping opacity-40"></span>
          <svg class="w-6 h-6 drop-shadow-md" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2 L22 20 L2 20 Z" fill="${themeAccent}" stroke="${strokeCol}" stroke-width="${strokeWidth}" stroke-linejoin="round" />
            <circle cx="12" cy="16" r="1.2" fill="#000" />
            <line x1="12" y1="9" x2="12" y2="13" stroke="#000" stroke-width="2" stroke-linecap="round" />
          </svg>
        </div>
      `;

      const icon = L.divIcon({
        html,
        className: 'custom-tip-icon-marker',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      const marker = L.marker([tip.latitude, tip.longitude], { icon });
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        onSelectIncident(tip.incidentId);
      });
      marker.bindPopup(`<strong>FEEDBACK LEAD:</strong><br/>${tip.description}`);
      marker.addTo(group);
    });

    // E. Render PENDING COORDINATES PREVIEW
    if (pendingCoordinates) {
      const html = `
        <div class="relative flex items-center justify-center" style="transform: translate(0, -50%);">
          <span class="absolute -inset-3 rounded-full border-2 border-dashed border-luxury-gold animate-pulse"></span>
          <svg class="w-7 h-10 drop-shadow-lg animate-bounce" viewBox="0 0 28 40" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M14 0C6.268 0 0 6.268 0 14C0 24.5 14 40 14 40C14 40 28 24.5 28 14C28 6.268 21.732 0 14 0Z" fill="${themeAccent}" stroke="#ffffff" stroke-width="1.5"/>
            <text x="14" y="22" text-anchor="middle" fill="#ffffff" font-size="16" font-weight="black">?</text>
          </svg>
        </div>
      `;

      const icon = L.divIcon({
        html,
        className: 'custom-pending-icon-marker',
        iconSize: [28, 40],
        iconAnchor: [14, 20]
      });

      const marker = L.marker([pendingCoordinates.latitude, pendingCoordinates.longitude], { icon });
      marker.addTo(group);
    }
  }, [filteredIncidents, citizens, tips, selectedIncidentId, pendingCoordinates, mapMode, incidents, activeTheme]);

  // Handle map center panning on selected incident change
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map || !selectedIncidentId) return;

    const targetIncident = incidents.find((inc) => inc.id === selectedIncidentId);
    if (targetIncident) {
      map.setView([targetIncident.latitude, targetIncident.longitude], 14, {
        animate: true,
        duration: 0.8,
      });
    }
  }, [selectedIncidentId, incidents]);

  // Handle navigation helpers
  const handleZoomIn = () => {
    leafletMapRef.current?.zoomIn();
  };

  const handleZoomOut = () => {
    leafletMapRef.current?.zoomOut();
  };

  const handleReset = () => {
    leafletMapRef.current?.setView([centerLat, centerLng], 13);
    onClearPending();
  };

  return (
    <div className="relative w-full bg-black/60 rounded-xl overflow-hidden border border-luxury-border shadow-2xl flex flex-col">
      {/* Filter & View Control Bar above Map */}
      <div className="bg-black/95 border-b border-luxury-border/80 px-4 py-3.5 flex flex-col xl:flex-row xl:items-center justify-between gap-4 text-xs z-20">
        <div className="flex flex-col gap-2">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-luxury-gold uppercase tracking-wider font-mono text-[10px]">Grid Filter Controls</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              key="filter-all-btn"
              id="filter-all-btn"
              onClick={() => setHiddenTypes(new Set())}
              className={`px-2.5 py-1.5 rounded-lg border text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                hiddenTypes.size === 0
                  ? 'bg-luxury-gold text-black border-luxury-gold shadow-md'
                  : 'bg-black/40 border-luxury-border text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
              }`}
            >
              Show All
            </button>
            
            {[
              { type: 'robbery' as const, label: 'Robbery', activeColor: 'border-red-500/60 text-red-400 bg-red-950/20' },
              { type: 'missing_person' as const, label: 'Missing Person', activeColor: 'border-sky-500/60 text-sky-400 bg-sky-950/20' },
              { type: 'assault' as const, label: 'Assault', activeColor: 'border-orange-500/60 text-orange-400 bg-orange-950/20' },
              { type: 'theft' as const, label: 'Theft', activeColor: 'border-purple-500/60 text-purple-400 bg-purple-950/20' },
              { type: 'suspicious_activity' as const, label: 'Suspicious', activeColor: 'border-yellow-500/60 text-yellow-400 bg-yellow-950/20' },
              { type: 'other' as const, label: 'Other', activeColor: 'border-zinc-500/60 text-zinc-400 bg-zinc-950/20' },
            ].map(({ type, label, activeColor }) => {
              const isHidden = hiddenTypes.has(type);
              return (
                <button
                  key={`filter-${type}`}
                  id={`filter-toggle-${type}-btn`}
                  onClick={() => {
                    setHiddenTypes(prev => {
                      const next = new Set(prev);
                      if (next.has(type)) {
                        next.delete(type);
                      } else {
                        next.add(type);
                      }
                      return next;
                    });
                  }}
                  className={`px-2.5 py-1.5 rounded-lg border text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center space-x-1 ${
                    isHidden
                      ? 'bg-black/20 border-luxury-border/40 text-zinc-500 line-through decoration-zinc-700'
                      : activeColor
                  }`}
                >
                  <span>{isHidden ? `Show ${label}` : `Hide ${label}`}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tactical Map Mode Switcher */}
        <div className="flex flex-col gap-2 min-w-[320px]">
          <div className="flex items-center justify-between">
            <span className="font-bold text-luxury-gold uppercase tracking-wider font-mono text-[10px]">Telemetry & View Options</span>
            {mapMode === 'accessible' && (
              <span className="text-[9px] text-sky-400 font-bold uppercase animate-pulse">Vision Aid Active</span>
            )}
          </div>
          <div className="grid grid-cols-3 bg-black/50 border border-luxury-border/60 rounded-xl p-1 gap-1">
            <button
              id="map-mode-tactical-btn"
              onClick={() => setMapMode('tactical')}
              className={`py-1.5 px-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1 cursor-pointer ${
                mapMode === 'tactical'
                  ? 'bg-luxury-gold text-black font-extrabold shadow-md'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>Tactical</span>
            </button>
            <button
              id="map-mode-satellite-btn"
              onClick={() => setMapMode('satellite')}
              className={`py-1.5 px-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1 cursor-pointer ${
                mapMode === 'satellite'
                  ? 'bg-emerald-500 text-black font-extrabold shadow-md'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Satellite</span>
            </button>
            <button
              id="map-mode-accessible-btn"
              onClick={() => setMapMode('accessible')}
              className={`py-1.5 px-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1 cursor-pointer ${
                mapMode === 'accessible'
                  ? 'bg-sky-500 text-black font-extrabold shadow-md'
                  : 'text-zinc-400 hover:text-sky-400 hover:bg-zinc-900/40'
              }`}
              title="High Contrast, Enhanced Visibility"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Accessible</span>
            </button>
          </div>
        </div>
      </div>

      {/* Map Container */}
      <div className="relative w-full h-[520px] overflow-hidden bg-black/40">
        
        {/* Real Leaflet Map mount point */}
        <div ref={mapContainerRef} className="w-full h-full z-0" style={{ filter: getMapFilterStyle() }} />

        {/* Floating Overlays */}

        {/* Map Header with Stats Overlay */}
        <div className={`absolute top-4 left-4 z-10 bg-black/90 backdrop-blur-md border px-4 py-2 rounded-lg flex items-center space-x-6 text-xs text-zinc-300 shadow-md ${
          mapMode === 'accessible' ? 'border-white border-2 text-white font-bold' : 'border-luxury-border/80'
        }`}>
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
            <span className="font-semibold">{incidents.filter(i => i.status === 'active').length} Active Alerts</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span className="font-semibold">{citizens.length} Citizens Online</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-luxury-gold" />
            <span className="font-semibold">{tips.length} Leads Received</span>
          </div>
        </div>

        {/* Map Navigation Controls */}
        <div className={`absolute bottom-4 right-4 z-10 flex flex-col space-y-2 bg-black/90 backdrop-blur-md border p-1.5 rounded-lg shadow-md ${
          mapMode === 'accessible' ? 'border-white border-2' : 'border-luxury-border/80'
        }`}>
          <button
            id="zoom-in-btn"
            onClick={handleZoomIn}
            className={`p-1.5 rounded transition-colors cursor-pointer ${
              mapMode === 'accessible' ? 'text-white hover:bg-white hover:text-black' : 'text-zinc-400 hover:text-luxury-gold hover:bg-black/40'
            }`}
            title="Zoom In"
          >
            <ZoomIn className="w-5 h-5" />
          </button>
          <button
            id="zoom-out-btn"
            onClick={handleZoomOut}
            className={`p-1.5 rounded transition-colors cursor-pointer ${
              mapMode === 'accessible' ? 'text-white hover:bg-white hover:text-black' : 'text-zinc-400 hover:text-luxury-gold hover:bg-black/40'
            }`}
            title="Zoom Out"
          >
            <ZoomOut className="w-5 h-5" />
          </button>
          <button
            id="reset-map-btn"
            onClick={handleReset}
            className={`p-1.5 rounded transition-colors border-t cursor-pointer ${
              mapMode === 'accessible'
                ? 'text-white border-white hover:bg-white hover:text-black'
                : 'text-zinc-400 hover:text-luxury-gold hover:bg-black/40 border-luxury-border/40'
            }`}
            title="Reset View"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Instructional Banner */}
        <div className={`absolute bottom-4 left-4 z-10 bg-black/90 backdrop-blur-md border px-3.5 py-2.5 rounded-lg text-xs pointer-events-none max-w-xs leading-relaxed shadow-lg ${
          mapMode === 'accessible' ? 'border-white border-2 text-white font-semibold' : 'border-luxury-border text-zinc-400'
        }`}>
          <div className="flex items-center space-x-1.5 mb-1 text-zinc-200 font-semibold font-sans">
            <MousePointer className={`w-3.5 h-3.5 ${mapMode === 'accessible' ? 'text-white' : 'text-luxury-gold'}`} />
            <span className={mapMode === 'accessible' ? 'text-white font-bold' : ''}>Dispatcher Coordinates</span>
          </div>
          Click anywhere on the satellite grid to place epicenter pin & coordinate geofenced emergency broadcast.
        </div>
      </div>
    </div>
  );
}
