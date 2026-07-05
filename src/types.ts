/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type IncidentType = 'robbery' | 'missing_person' | 'assault' | 'theft' | 'suspicious_activity' | 'other';
export type IncidentStatus = 'active' | 'resolved';

export interface Citizen {
  id: string;
  phone: string;
  name: string;
  latitude: number;
  longitude: number;
  lastActive: string;
}

export interface Incident {
  id: string;
  title: string;
  description: string;
  type: IncidentType;
  status: IncidentStatus;
  latitude: number;
  longitude: number;
  radiusKm: number;
  createdAt: string;
  resolvedAt?: string;
}

export interface Tip {
  id: string;
  incidentId: string;
  description: string;
  latitude: number;
  longitude: number;
  photoUrl?: string;
  submittedAt: string;
  isAnonymous: boolean;
  contactPhone?: string;
  isPriority?: boolean;
  priorityReason?: string;
}

export interface BroadcastNotification {
  id: string;
  incidentId: string;
  title: string;
  body: string;
  type: 'alert' | 'resolution';
  latitude: number;
  longitude: number;
  radiusKm: number;
  timestamp: string;
}

export interface SystemStats {
  activeIncidents: number;
  resolvedIncidents: number;
  registeredCitizens: number;
  totalTipsReceived: number;
}
