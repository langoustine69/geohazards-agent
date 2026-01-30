import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { createAgentApp } from '@lucid-agents/hono';
import { payments, paymentsFromEnv } from '@lucid-agents/payments';
import { z } from 'zod';

const agent = await createAgent({
  name: 'geohazards-agent',
  version: '1.0.0',
  description: 'Real-time earthquake and volcano data from USGS. Monitor seismic activity worldwide.',
})
  .use(http())
  .use(payments({ config: paymentsFromEnv() }))
  .build();

const { app, addEntrypoint } = await createAgentApp(agent);

// === HELPER: Fetch JSON from API ===
async function fetchJSON(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return response.json();
}

// === FREE ENDPOINT: Global Overview ===
addEntrypoint({
  key: 'overview',
  description: 'Free overview of recent global seismic activity - try before you buy',
  input: z.object({}),
  price: { amount: 0 },
  handler: async () => {
    // Get latest significant earthquakes (past 24h, M4+)
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const earthquakeUrl = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=${yesterday.toISOString()}&minmagnitude=4&limit=5&orderby=magnitude`;
    
    const earthquakes = await fetchJSON(earthquakeUrl);
    
    return {
      output: {
        summary: `${earthquakes.metadata.count} significant earthquakes (M4+) in last 24 hours`,
        latestQuakes: earthquakes.features.map((f: any) => ({
          magnitude: f.properties.mag,
          location: f.properties.place,
          time: new Date(f.properties.time).toISOString(),
          depth: f.geometry.coordinates[2] + ' km',
        })),
        dataSource: 'USGS Earthquake Hazards Program (live)',
        fetchedAt: now.toISOString(),
        endpoints: {
          lookup: 'Get details for specific earthquake by ID',
          search: 'Search earthquakes by location, magnitude, time range',
          top: 'Top earthquakes by magnitude',
          volcanoSearch: 'Search volcanoes by country/region',
          report: 'Full geohazard report for any location',
        }
      }
    };
  },
});

// === PAID ENDPOINT 1 ($0.001): Earthquake Lookup ===
addEntrypoint({
  key: 'lookup',
  description: 'Get detailed information for a specific earthquake by USGS event ID',
  input: z.object({ 
    eventId: z.string().describe('USGS event ID (e.g., us6000s5e4)') 
  }),
  price: { amount: 1000 },
  handler: async (ctx) => {
    const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?eventid=${ctx.input.eventId}&format=geojson`;
    const data = await fetchJSON(url);
    const props = data.properties;
    const coords = data.geometry.coordinates;
    
    return {
      output: {
        id: data.id,
        magnitude: props.mag,
        magnitudeType: props.magType,
        location: props.place,
        time: new Date(props.time).toISOString(),
        coordinates: {
          latitude: coords[1],
          longitude: coords[0],
          depth: coords[2] + ' km',
        },
        tsunami: props.tsunami === 1,
        alert: props.alert,
        significance: props.sig,
        feltReports: props.felt,
        detailUrl: props.url,
        fetchedAt: new Date().toISOString(),
      }
    };
  },
});

// === PAID ENDPOINT 2 ($0.002): Earthquake Search ===
addEntrypoint({
  key: 'search',
  description: 'Search earthquakes by location, magnitude range, and time period',
  input: z.object({
    latitude: z.number().min(-90).max(90).optional().describe('Center latitude for radius search'),
    longitude: z.number().min(-180).max(180).optional().describe('Center longitude for radius search'),
    radiusKm: z.number().min(1).max(20000).optional().default(500).describe('Search radius in km'),
    minMagnitude: z.number().min(0).max(10).optional().default(4).describe('Minimum magnitude'),
    maxMagnitude: z.number().min(0).max(10).optional().describe('Maximum magnitude'),
    days: z.number().min(1).max(365).optional().default(7).describe('Look back period in days'),
    limit: z.number().min(1).max(100).optional().default(20).describe('Max results'),
  }),
  price: { amount: 2000 },
  handler: async (ctx) => {
    const { latitude, longitude, radiusKm, minMagnitude, maxMagnitude, days, limit } = ctx.input;
    const now = new Date();
    const startTime = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    
    let url = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=${startTime.toISOString()}&minmagnitude=${minMagnitude}&limit=${limit}&orderby=time`;
    
    if (latitude !== undefined && longitude !== undefined) {
      url += `&latitude=${latitude}&longitude=${longitude}&maxradiuskm=${radiusKm}`;
    }
    if (maxMagnitude !== undefined) {
      url += `&maxmagnitude=${maxMagnitude}`;
    }
    
    const data = await fetchJSON(url);
    
    return {
      output: {
        totalFound: data.metadata.count,
        searchParams: { latitude, longitude, radiusKm, minMagnitude, maxMagnitude, days },
        earthquakes: data.features.map((f: any) => ({
          id: f.id,
          magnitude: f.properties.mag,
          location: f.properties.place,
          time: new Date(f.properties.time).toISOString(),
          depth: f.geometry.coordinates[2] + ' km',
          coordinates: {
            lat: f.geometry.coordinates[1],
            lng: f.geometry.coordinates[0],
          },
        })),
        fetchedAt: now.toISOString(),
      }
    };
  },
});

// === PAID ENDPOINT 3 ($0.002): Top Earthquakes ===
addEntrypoint({
  key: 'top',
  description: 'Get the largest earthquakes by magnitude for a time period',
  input: z.object({
    period: z.enum(['day', 'week', 'month']).optional().default('week').describe('Time period'),
    minMagnitude: z.number().min(0).max(10).optional().default(5).describe('Minimum magnitude'),
    limit: z.number().min(1).max(50).optional().default(10).describe('Number of results'),
  }),
  price: { amount: 2000 },
  handler: async (ctx) => {
    const { period, minMagnitude, limit } = ctx.input;
    const now = new Date();
    const daysBack = period === 'day' ? 1 : period === 'week' ? 7 : 30;
    const startTime = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
    
    const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=${startTime.toISOString()}&minmagnitude=${minMagnitude}&limit=${limit}&orderby=magnitude`;
    
    const data = await fetchJSON(url);
    
    return {
      output: {
        period,
        periodStart: startTime.toISOString(),
        periodEnd: now.toISOString(),
        totalSignificant: data.metadata.count,
        topEarthquakes: data.features.map((f: any, i: number) => ({
          rank: i + 1,
          id: f.id,
          magnitude: f.properties.mag,
          magnitudeType: f.properties.magType,
          location: f.properties.place,
          time: new Date(f.properties.time).toISOString(),
          depth: f.geometry.coordinates[2] + ' km',
          tsunami: f.properties.tsunami === 1,
          alert: f.properties.alert,
          detailUrl: f.properties.url,
        })),
        fetchedAt: now.toISOString(),
      }
    };
  },
});

// === PAID ENDPOINT 4 ($0.002): Volcano Search ===
addEntrypoint({
  key: 'volcanoSearch',
  description: 'Search volcanoes by country, region, or name',
  input: z.object({
    country: z.string().optional().describe('Filter by country (e.g., "Japan", "United States")'),
    name: z.string().optional().describe('Search by volcano name'),
    limit: z.number().min(1).max(100).optional().default(20).describe('Max results'),
  }),
  price: { amount: 2000 },
  handler: async (ctx) => {
    const { country, name, limit } = ctx.input;
    
    // Fetch all volcanoes from USGS
    const data = await fetchJSON('https://volcanoes.usgs.gov/vsc/api/volcanoApi/volcanoesGVP');
    
    // Filter results
    let filtered = data;
    if (country) {
      filtered = filtered.filter((v: any) => 
        v.country?.toLowerCase().includes(country.toLowerCase())
      );
    }
    if (name) {
      filtered = filtered.filter((v: any) => 
        v.vName?.toLowerCase().includes(name.toLowerCase())
      );
    }
    
    // Limit results
    const results = filtered.slice(0, limit);
    
    return {
      output: {
        totalMatches: filtered.length,
        returned: results.length,
        searchParams: { country, name },
        volcanoes: results.map((v: any) => ({
          id: v.vnum,
          name: v.vName,
          country: v.country,
          region: v.subregion,
          coordinates: {
            latitude: v.latitude,
            longitude: v.longitude,
          },
          elevation: v.elevation_m + ' m',
          observatory: v.obsAbbr,
          infoUrl: v.webpage,
        })),
        fetchedAt: new Date().toISOString(),
      }
    };
  },
});

// === PAID ENDPOINT 5 ($0.005): Full Geohazard Report ===
addEntrypoint({
  key: 'report',
  description: 'Comprehensive geohazard report for any location: nearby earthquakes + volcanoes within radius',
  input: z.object({
    latitude: z.number().min(-90).max(90).describe('Location latitude'),
    longitude: z.number().min(-180).max(180).describe('Location longitude'),
    radiusKm: z.number().min(50).max(1000).optional().default(300).describe('Search radius in km'),
  }),
  price: { amount: 5000 },
  handler: async (ctx) => {
    const { latitude, longitude, radiusKm } = ctx.input;
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    // Fetch earthquakes near location (past 30 days)
    const earthquakeUrl = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=${thirtyDaysAgo.toISOString()}&latitude=${latitude}&longitude=${longitude}&maxradiuskm=${radiusKm}&minmagnitude=2&limit=50&orderby=magnitude`;
    
    // Fetch all volcanoes
    const volcanoUrl = 'https://volcanoes.usgs.gov/vsc/api/volcanoApi/volcanoesGVP';
    
    const [earthquakeData, volcanoData] = await Promise.all([
      fetchJSON(earthquakeUrl),
      fetchJSON(volcanoUrl),
    ]);
    
    // Filter volcanoes within radius using Haversine formula
    const toRad = (deg: number) => deg * Math.PI / 180;
    const haversine = (lat1: number, lon1: number, lat2: number, lon2: number) => {
      const R = 6371; // Earth's radius in km
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lon2 - lon1);
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    };
    
    const nearbyVolcanoes = volcanoData
      .map((v: any) => ({
        ...v,
        distanceKm: haversine(latitude, longitude, v.latitude, v.longitude),
      }))
      .filter((v: any) => v.distanceKm <= radiusKm)
      .sort((a: any, b: any) => a.distanceKm - b.distanceKm)
      .slice(0, 20);
    
    // Calculate risk summary
    const significantQuakes = earthquakeData.features.filter((f: any) => f.properties.mag >= 4);
    const riskLevel = 
      significantQuakes.length > 10 ? 'HIGH' :
      significantQuakes.length > 3 ? 'MODERATE' :
      significantQuakes.length > 0 ? 'LOW' : 'MINIMAL';
    
    return {
      output: {
        location: { latitude, longitude },
        radiusKm,
        riskAssessment: {
          level: riskLevel,
          earthquakesLast30Days: earthquakeData.metadata.count,
          significantQuakes: significantQuakes.length,
          nearbyVolcanoes: nearbyVolcanoes.length,
        },
        recentEarthquakes: earthquakeData.features.slice(0, 15).map((f: any) => ({
          id: f.id,
          magnitude: f.properties.mag,
          location: f.properties.place,
          time: new Date(f.properties.time).toISOString(),
          depth: f.geometry.coordinates[2] + ' km',
        })),
        nearbyVolcanoes: nearbyVolcanoes.map((v: any) => ({
          name: v.vName,
          country: v.country,
          distanceKm: Math.round(v.distanceKm),
          elevation: v.elevation_m + ' m',
          observatory: v.obsAbbr,
        })),
        dataSources: ['USGS Earthquake Hazards Program', 'USGS Volcano Hazards Program'],
        fetchedAt: now.toISOString(),
      }
    };
  },
});

const port = Number(process.env.PORT ?? 3000);
console.log(`🌋 Geohazards Agent running on port ${port}`);

export default { port, fetch: app.fetch };
