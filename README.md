# 🌋 Geohazards Agent

Real-time earthquake and volcano monitoring via x402 micropayments.

## Features

- **Live USGS Data** — Real-time seismic and volcanic data from official sources
- **6 Endpoints** — 1 free + 5 paid via x402 micropayments
- **Global Coverage** — Monitor earthquakes and volcanoes worldwide
- **Risk Reports** — Comprehensive geohazard analysis for any location

## Endpoints

| Endpoint | Price | Description |
|----------|-------|-------------|
| `overview` | FREE | Global seismic summary, recent M4+ quakes |
| `lookup` | $0.001 | Get earthquake details by USGS event ID |
| `search` | $0.002 | Search by location, magnitude, time range |
| `top` | $0.002 | Largest earthquakes by period (day/week/month) |
| `volcanoSearch` | $0.002 | Search volcanoes by country/region/name |
| `report` | $0.005 | Full geohazard report: quakes + nearby volcanoes |

## Data Sources

- [USGS Earthquake Hazards Program](https://earthquake.usgs.gov)
- [USGS Volcano Hazards Program](https://volcanoes.usgs.gov)

## Usage

```bash
# Health check
curl http://localhost:3000/health

# Free overview
curl -X POST http://localhost:3000/entrypoints/overview/invoke \
  -H "Content-Type: application/json" -d '{}'

# Search earthquakes near Tokyo
curl -X POST http://localhost:3000/entrypoints/search/invoke \
  -H "Content-Type: application/json" \
  -d '{"latitude":35.6762,"longitude":139.6503,"radiusKm":500,"minMagnitude":4}'

# Full geohazard report
curl -X POST http://localhost:3000/entrypoints/report/invoke \
  -H "Content-Type: application/json" \
  -d '{"latitude":35.6762,"longitude":139.6503,"radiusKm":300}'
```

## Deployment

Requires environment variables:
- `PAYMENTS_RECEIVABLE_ADDRESS` — Your wallet address for x402 payments
- `FACILITATOR_URL` — x402 facilitator (default: https://facilitator.daydreams.systems)
- `NETWORK` — Network for payments (default: base)

## Built With

- [Lucid Agents SDK](https://github.com/daydreamsai/lucid-agents)
- [x402 Protocol](https://x402.org)
- [Bun](https://bun.sh)

## License

MIT
