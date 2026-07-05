/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express, { Request, Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { Incident, Citizen, Tip, BroadcastNotification, IncidentType, IncidentStatus } from './src/types.js';

// Setup Express App
const app = express();
const PORT = 3000;

// Body Parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =========================================================================
// IN-MEMORY REAL-TIME DATA STORE (Simulating PostgreSQL/PostGIS)
// =========================================================================

// Default GPS coordinate system centered in South Mumbai, India (Fort/Colaba/Nariman Point)
// Latitude: 18.950, Longitude: 72.825
let DEFAULT_CENTER_LAT = 18.950;
let DEFAULT_CENTER_LNG = 72.825;

const state = {
  citizens: [] as Citizen[],
  incidents: [] as Incident[],
  tips: [] as Tip[],
  notifications: [] as BroadcastNotification[],
  nextId: 1
};

/**
 * Simple sentiment analysis helper that scans for safety-critical keywords
 * related to violence or immediate danger, automatically flagging the content.
 */
function analyzeSentimentAndPriority(description: string): { isPriority: boolean; priorityReason?: string } {
  const text = description.toLowerCase();
  
  // High-priority violence indicators
  const violenceKeywords = [
    'gun', 'guns', 'rifle', 'rifles', 'pistol', 'pistols', 'handgun', 'firearm', 'firearms', 'weapon', 'weapons',
    'shoot', 'shot', 'shooting', 'shootout', 'gunfire', 'knife', 'knives', 'blade', 'stab', 'stabbed', 'stabbing',
    'kill', 'killed', 'killing', 'murder', 'murdered', 'assault', 'assaulted', 'assaulting', 'violence', 'violent',
    'blood', 'bloody', 'fight', 'fighting', 'attack', 'attacked', 'attacking', 'hostage', 'hostages', 'armed',
    'robbery', 'robbed', 'robber', 'shooter'
  ];
  
  // High-priority immediate danger indicators
  const dangerKeywords = [
    'danger', 'dangerous', 'bomb', 'bombs', 'explosive', 'explosives', 'explosion', 'fire', 'fires', 'flames',
    'run', 'running', 'flee', 'fleeing', 'threat', 'threaten', 'threatened', 'threatening', 'panic',
    'screaming', 'scream', 'screamed', 'help', 'emergency', 'emergencies', 'die', 'dying', 'hostile',
    'active shooter', 'urgent', 'critical', 'injured', 'trapped'
  ];

  const matchedViolence = violenceKeywords.filter(keyword => {
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    return regex.test(text);
  });

  const matchedDanger = dangerKeywords.filter(keyword => {
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    return regex.test(text);
  });

  if (matchedViolence.length > 0 || matchedDanger.length > 0) {
    const reasons: string[] = [];
    if (matchedViolence.length > 0) {
      reasons.push(`Violence: ${matchedViolence.slice(0, 3).map(k => `'${k}'`).join(', ')}`);
    }
    if (matchedDanger.length > 0) {
      reasons.push(`Immediate Danger: ${matchedDanger.slice(0, 3).map(k => `'${k}'`).join(', ')}`);
    }
    return {
      isPriority: true,
      priorityReason: reasons.join(' | ')
    };
  }

  return { isPriority: false };
}

/**
 * Dynamically re-seeds the simulation relative to the current dispatcher location.
 */
function reseedSimulation(lat: number, lng: number) {
  DEFAULT_CENTER_LAT = lat;
  DEFAULT_CENTER_LNG = lng;

  state.citizens = [];
  state.incidents = [];
  state.tips = [];
  state.notifications = [];

  const initialCitizens = [
    { name: 'Aarav Mehta', phone: '+91 98200 12345', offsetLat: 0.005, offsetLng: -0.003 },
    { name: 'Priya Sharma', phone: '+91 98199 54321', offsetLat: -0.004, offsetLng: 0.006 },
    { name: 'Vikram Singh', phone: '+91 98210 67890', offsetLat: 0.008, offsetLng: 0.009 },
    { name: 'Ananya Patel', phone: '+91 98920 45678', offsetLat: -0.002, offsetLng: -0.007 },
    { name: 'Devansh Iyer', phone: '+91 91670 98765', offsetLat: 0.003, offsetLng: 0.012 },
    { name: 'Rohan Deshmukh', phone: '+91 97690 32109', offsetLat: -0.009, offsetLng: -0.002 },
    { name: 'Kavita Rao', phone: '+91 99200 87654', offsetLat: 0.001, offsetLng: -0.010 }
  ];

  initialCitizens.forEach((c, idx) => {
    state.citizens.push({
      id: `cit-${idx + 1}`,
      name: c.name,
      phone: c.phone,
      latitude: DEFAULT_CENTER_LAT + c.offsetLat,
      longitude: DEFAULT_CENTER_LNG + c.offsetLng,
      lastActive: new Date().toISOString()
    });
  });

  // Seed an initial incident close to the new center
  state.incidents.push({
    id: 'inc-101',
    title: 'Local Security Incident',
    description: 'An emergency alert has been raised in this geofenced area. Please stay indoors, report any suspicious behavior or leads, and keep your coordinate simulator active.',
    type: 'suspicious_activity',
    status: 'active',
    latitude: DEFAULT_CENTER_LAT - 0.002,
    longitude: DEFAULT_CENTER_LNG + 0.003,
    radiusKm: 1.0,
    createdAt: new Date(Date.now() - 45 * 60 * 1000).toISOString()
  });

  const seedTip1 = {
    id: 'tip-501',
    incidentId: 'inc-101',
    description: 'I saw a person in a blue shirt leave a black backpack near the security check barrier about 20 minutes ago. He left hurriedly towards the jetty area.',
    latitude: DEFAULT_CENTER_LAT - 0.0015,
    longitude: DEFAULT_CENTER_LNG + 0.0025,
    isAnonymous: true,
    submittedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString()
  };
  const analysis1 = analyzeSentimentAndPriority(seedTip1.description);
  state.tips.push({
    ...seedTip1,
    isPriority: analysis1.isPriority,
    priorityReason: analysis1.priorityReason
  });

  const seedTip2 = {
    id: 'tip-502',
    incidentId: 'inc-101',
    description: 'The local police are cordoning off the road leading to the promenade. Heavy patrolling spotted.',
    latitude: DEFAULT_CENTER_LAT - 0.0025,
    longitude: DEFAULT_CENTER_LNG + 0.0035,
    isAnonymous: false,
    contactPhone: '+91 98199 54321',
    submittedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString()
  };
  const analysis2 = analyzeSentimentAndPriority(seedTip2.description);
  state.tips.push({
    ...seedTip2,
    isPriority: analysis2.isPriority,
    priorityReason: analysis2.priorityReason
  });
}

// Perform initial seeding
reseedSimulation(18.950, 72.825);

// =========================================================================
// GEOSPATIAL HELPER FUNCTIONS (Haversine Formula)
// =========================================================================

/**
 * Calculates the great-circle distance between two points on the Earth's surface
 * using the Haversine formula. Yields exact physical distance in kilometers.
 */
function calculateHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's mean radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// =========================================================================
// REAL-TIME SERVER-SENT EVENTS (SSE) ENGINE
// =========================================================================

let sseClients: Response[] = [];

/**
 * Express Route for Server-Sent Events
 */
app.get('/api/events', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Keep connection alive with a 15s ping
  const interval = setInterval(() => {
    res.write(': ping\n\n');
  }, 15000);

  sseClients.push(res);

  req.on('close', () => {
    clearInterval(interval);
    sseClients = sseClients.filter(client => client !== res);
  });
});

/**
 * Broadcasts an event to all SSE active clients
 */
function broadcastEvent(eventName: string, data: any) {
  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(client => {
    try {
      client.write(payload);
    } catch (e) {
      // Clean up dead connections
      console.error('Failed to write to client SSE', e);
    }
  });
}

// =========================================================================
// API ENDPOINTS
// =========================================================================

/**
 * GET /api/center
 * Retrieve the current operational map center coordinates
 */
app.get('/api/center', (req: Request, res: Response) => {
  res.json({ latitude: DEFAULT_CENTER_LAT, longitude: DEFAULT_CENTER_LNG });
});

/**
 * POST /api/center
 * Update operational map center and reseed the active simulation relative to it
 */
app.post('/api/center', (req: Request, res: Response) => {
  const { latitude, longitude } = req.body;
  if (!latitude || !longitude) {
    return res.status(400).json({ error: 'Missing latitude or longitude' });
  }

  const latNum = parseFloat(latitude);
  const lngNum = parseFloat(longitude);

  if (isNaN(latNum) || isNaN(lngNum)) {
    return res.status(400).json({ error: 'Invalid coordinate values' });
  }

  reseedSimulation(latNum, lngNum);

  // Broadcast event to all SSE clients to notify them to shift and re-fetch everything
  broadcastEvent('center_updated', { latitude: DEFAULT_CENTER_LAT, longitude: DEFAULT_CENTER_LNG });

  res.json({
    message: 'Operational center successfully updated and simulation reseeded',
    center: { latitude: DEFAULT_CENTER_LAT, longitude: DEFAULT_CENTER_LNG }
  });
});

/**
 * GET /api/stats
 * Aggregated live metrics of the system
 */
app.get('/api/stats', (req: Request, res: Response) => {
  const stats = {
    activeIncidents: state.incidents.filter(i => i.status === 'active').length,
    resolvedIncidents: state.incidents.filter(i => i.status === 'resolved').length,
    registeredCitizens: state.citizens.length,
    totalTipsReceived: state.tips.length
  };
  res.json(stats);
});

/**
 * GET /api/citizens
 * Retrieve registered citizens (for simulated tracking map display)
 */
app.get('/api/citizens', (req: Request, res: Response) => {
  res.json(state.citizens);
});

/**
 * POST /api/citizens
 * Onboard/register a citizen or update their current simulated GPS coordinates.
 */
app.post('/api/citizens', (req: Request, res: Response) => {
  const { phone, name, latitude, longitude, id } = req.body;

  if (!phone || !latitude || !longitude) {
    return res.status(400).json({ error: 'Missing phone, latitude, or longitude' });
  }

  const citizenId = id || `cit-${state.nextId++}`;
  let citizen = state.citizens.find(c => c.phone === phone || c.id === citizenId);

  if (citizen) {
    // Update coordinates and name
    citizen.latitude = parseFloat(latitude);
    citizen.longitude = parseFloat(longitude);
    if (name) citizen.name = name;
    citizen.lastActive = new Date().toISOString();
  } else {
    // Register new citizen
    citizen = {
      id: citizenId,
      phone,
      name: name || `Citizen ${phone.slice(-4)}`,
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      lastActive: new Date().toISOString()
    };
    state.citizens.push(citizen);
  }

  // Broadcast citizen updates to dispatcher map
  broadcastEvent('citizen_updated', citizen);
  res.status(200).json(citizen);
});

/**
 * GET /api/incidents
 * Retrieve full or status-filtered list of incidents
 */
app.get('/api/incidents', (req: Request, res: Response) => {
  const { status } = req.query;
  let filtered = state.incidents;

  if (status === 'active' || status === 'resolved') {
    filtered = state.incidents.filter(i => i.status === status);
  }

  // Sort by newest first
  filtered = [...filtered].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json(filtered);
});

/**
 * POST /api/incidents
 * Initiate/Log a public safety incident and broadcast a geofenced SMS/push alert
 */
app.post('/api/incidents', (req: Request, res: Response) => {
  const { title, description, type, latitude, longitude, radiusKm } = req.body;

  if (!title || !description || !type || !latitude || !longitude || !radiusKm) {
    return res.status(400).json({ error: 'Missing required fields for incident initiation' });
  }

  const incidentId = `inc-${state.nextId++}`;
  const newIncident: Incident = {
    id: incidentId,
    title,
    description,
    type: type as IncidentType,
    status: 'active',
    latitude: parseFloat(latitude),
    longitude: parseFloat(longitude),
    radiusKm: parseFloat(radiusKm),
    createdAt: new Date().toISOString()
  };

  state.incidents.push(newIncident);

  // GEOSPATIAL QUERY: Find citizens currently located within the geofenced radius
  const targets = state.citizens.filter(citizen => {
    const distance = calculateHaversineDistance(
      newIncident.latitude,
      newIncident.longitude,
      citizen.latitude,
      citizen.longitude
    );
    return distance <= newIncident.radiusKm;
  });

  // Log Notification Broadcast
  const notificationId = `notif-${state.nextId++}`;
  const alertNotification: BroadcastNotification = {
    id: notificationId,
    incidentId,
    title: `CRITICAL ALERT: ${title}`,
    body: description,
    type: 'alert',
    latitude: newIncident.latitude,
    longitude: newIncident.longitude,
    radiusKm: newIncident.radiusKm,
    timestamp: new Date().toISOString()
  };

  state.notifications.push(alertNotification);

  // Broadcast to Web Client (SSE handles dispatching live alerts matching client location in real-time)
  broadcastEvent('new_incident', {
    incident: newIncident,
    notification: alertNotification,
    targets: targets.map(t => t.id) // Send targeted list of citizen IDs inside boundary
  });

  res.status(201).json({
    message: 'Incident published and geofenced alert triggered successfully',
    incident: newIncident,
    recipientsCount: targets.length,
    notifiedCitizens: targets
  });
});

/**
 * POST /api/incidents/:id/resolve
 * Marks an incident as "Resolved" and automatically fires area secure update
 */
app.post('/api/incidents/:id/resolve', (req: Request, res: Response) => {
  const { id } = req.params;
  const incident = state.incidents.find(i => i.id === id);

  if (!incident) {
    return res.status(404).json({ error: 'Incident not found' });
  }

  incident.status = 'resolved';
  incident.resolvedAt = new Date().toISOString();

  // Find citizens within radius to broadcast RESOLUTION notification
  const targets = state.citizens.filter(citizen => {
    const distance = calculateHaversineDistance(
      incident.latitude,
      incident.longitude,
      citizen.latitude,
      citizen.longitude
    );
    return distance <= incident.radiusKm;
  });

  const notificationId = `notif-${state.nextId++}`;
  const resolutionNotification: BroadcastNotification = {
    id: notificationId,
    incidentId: incident.id,
    title: `AREA SECURE: Resolved - ${incident.title}`,
    body: `Task Completed. The threat has been resolved, and the area is now secure. Thank you for your feedback and vigilance!`,
    type: 'resolution',
    latitude: incident.latitude,
    longitude: incident.longitude,
    radiusKm: incident.radiusKm,
    timestamp: new Date().toISOString()
  };

  state.notifications.push(resolutionNotification);

  // Broadcast resolution live
  broadcastEvent('incident_resolved', {
    incident,
    notification: resolutionNotification,
    targets: targets.map(t => t.id)
  });

  res.json({
    message: 'Incident marked resolved and resolution broadcast completed',
    incident,
    recipientsCount: targets.length
  });
});

/**
 * GET /api/incidents/:id/tips
 * Retrieve tips for a specific incident
 */
app.get('/api/incidents/:id/tips', (req: Request, res: Response) => {
  const { id } = req.params;
  const tipsForIncident = state.tips.filter(t => t.incidentId === id);
  res.json(tipsForIncident);
});

/**
 * GET /api/tips
 * Retrieve all tips in system
 */
app.get('/api/tips', (req: Request, res: Response) => {
  // Sort newest first
  const sortedTips = [...state.tips].sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
  res.json(sortedTips);
});

/**
 * POST /api/tips
 * Citizen submits a crowdsourced public safety tip (anonymous or identified)
 */
app.post('/api/tips', (req: Request, res: Response) => {
  const { incidentId, description, latitude, longitude, isAnonymous, contactPhone, photoUrl } = req.body;

  if (!incidentId || !description) {
    return res.status(400).json({ error: 'Missing incident ID or descriptive content' });
  }

  const incident = state.incidents.find(i => i.id === incidentId);
  if (!incident) {
    return res.status(404).json({ error: 'Active incident reference not found' });
  }

  const tipId = `tip-${state.nextId++}`;
  const analysis = analyzeSentimentAndPriority(description);
  const newTip: Tip = {
    id: tipId,
    incidentId,
    description,
    latitude: latitude ? parseFloat(latitude) : incident.latitude + (Math.random() - 0.5) * 0.005, // fallback around incident
    longitude: longitude ? parseFloat(longitude) : incident.longitude + (Math.random() - 0.5) * 0.005,
    photoUrl: photoUrl || undefined,
    isAnonymous: isAnonymous === true,
    contactPhone: isAnonymous ? undefined : contactPhone,
    submittedAt: new Date().toISOString(),
    isPriority: analysis.isPriority,
    priorityReason: analysis.priorityReason
  };

  state.tips.push(newTip);

  // Broadcast to Police Dispatch Dashboard in real-time
  broadcastEvent('new_tip', {
    tip: newTip,
    incidentId: incidentId,
    incidentTitle: incident.title
  });

  res.status(201).json({
    message: 'Security tip logged successfully',
    tip: newTip
  });
});

// =========================================================================
// DEV SERVER & STATIC MIDDLEWARE INTERFACING
// =========================================================================

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    // Integrate Vite in development mode as a middleware
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve production built assets
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[GeoVigilance] Full-Stack server operational on http://localhost:${PORT}`);
  });
}

startServer();
