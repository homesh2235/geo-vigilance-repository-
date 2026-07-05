-- ==========================================
-- GeoVigilance Database Schema (PostgreSQL + PostGIS)
-- ==========================================

-- Enable PostGIS extension for advanced spatial indexing and queries
CREATE EXTENSION IF NOT EXISTS postgis;

-- 1. Citizens / Users Table
CREATE TABLE citizens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    device_token VARCHAR(255), -- For Push Notification routing (FCM)
    location GEOMETRY(Point, 4326) NOT NULL, -- Point coordinate in WGS 84 (GPS SRID 4326)
    last_active TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- GIST spatial index for ultra-fast geographical radius lookups
CREATE INDEX idx_citizens_location ON citizens USING gist(location);

-- 2. Incidents Table
CREATE TABLE incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(150) NOT NULL,
    description TEXT NOT NULL,
    type VARCHAR(50) NOT NULL, -- e.g., 'robbery', 'missing_person', 'assault', 'theft', 'suspicious_activity', 'other'
    status VARCHAR(20) NOT NULL DEFAULT 'active', -- 'active' or 'resolved'
    location GEOMETRY(Point, 4326) NOT NULL, -- GPS epicenter of the crime scene
    radius_meters DOUBLE PRECISION NOT NULL, -- Geofence threshold in meters (e.g., 2000.0 for 2km)
    dispatcher_id VARCHAR(100), -- References dispatcher credentials
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_incidents_location ON incidents USING gist(location);

-- 3. Tips Table (Feedback Loop / Crowdsourced Leads)
CREATE TABLE tips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID REFERENCES incidents(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    location GEOMETRY(Point, 4326), -- Approximate coordinate where tip was logged
    photo_url VARCHAR(512),
    is_anonymous BOOLEAN DEFAULT TRUE,
    contact_phone VARCHAR(20),
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tips_location ON tips USING gist(location);

-- 4. Broadcast Notifications Log Table
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID REFERENCES incidents(id) ON DELETE CASCADE,
    title VARCHAR(150) NOT NULL,
    body TEXT NOT NULL,
    type VARCHAR(30) NOT NULL, -- 'alert' or 'resolution'
    recipients_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);


-- ==========================================
-- RELEVANT GEOSPATIAL SQL QUERIES (PostGIS)
-- ==========================================

-- A. Query all citizens inside a geofenced radius of an incident
-- Coordinates parameter: IncidentLongitude, IncidentLatitude
-- Radius parameter: RadiusInMeters (e.g. 2000 for 2km)
-- Note: We cast location to geography to calculate exact distances in meters over the Earth ellipsoid.
/*
SELECT 
    id, 
    phone, 
    name, 
    ST_Distance(location::geography, ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)::geography) AS distance_meters
FROM 
    citizens
WHERE 
    ST_DWithin(
        location::geography, 
        ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)::geography, 
        :radius_meters
    )
ORDER BY 
    distance_meters ASC;
*/

-- B. Spatial Query to aggregate tip cluster density around incident locations
/*
SELECT 
    i.id AS incident_id,
    i.title AS incident_title,
    COUNT(t.id) AS total_tips,
    ST_AsText(i.location) as incident_gps
FROM 
    incidents i
LEFT JOIN 
    tips t ON t.incident_id = i.id
WHERE 
    i.status = 'active'
GROUP BY 
    i.id;
*/
