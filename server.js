const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const WEATHER_API_BASE = 'https://api.weather.gov';
const GEOCODING_API_BASE = 'https://nominatim.openstreetmap.org/search';

app.use(express.static(path.join(__dirname, 'public')));

async function fetchWeatherJson(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'weather-app-demo',
      Accept: 'application/geo+json, application/json'
    }
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Weather API request failed (${response.status}): ${errorBody}`);
  }

  return response.json();
}

async function geocodeZip(zip) {
  const url = new URL(GEOCODING_API_BASE);
  url.search = new URLSearchParams({
    postalcode: zip,
    country: 'US',
    format: 'jsonv2',
    limit: '1'
  });

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'weather-app-demo/1.0 (student weather application)',
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`ZIP code lookup failed (${response.status}).`);
  }

  const results = await response.json();
  if (!results.length) {
    return null;
  }

  return {
    latitude: Number(results[0].lat),
    longitude: Number(results[0].lon)
  };
}

function validateCoordinates(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return false;
  }

  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/weather', async (req, res) => {
  const zip = typeof req.query.zip === 'string' ? req.query.zip.trim() : '';
  const hasCoordinates = req.query.lat !== undefined || req.query.lon !== undefined;
  let lat;
  let lon;

  if (zip && hasCoordinates) {
    return res.status(400).json({
      error: 'Search by ZIP code or coordinates, not both.'
    });
  }

  if (zip) {
    if (!/^\d{5}$/.test(zip)) {
      return res.status(400).json({ error: 'Enter a valid 5-digit ZIP code.' });
    }
  } else {
    lat = Number(req.query.lat);
    lon = Number(req.query.lon);
    if (!validateCoordinates(lat, lon)) {
      return res.status(400).json({
        error: 'Please provide valid latitude and longitude values.'
      });
    }
  }

  try {
    if (zip) {
      const coordinates = await geocodeZip(zip);
      if (!coordinates) {
        return res.status(404).json({
          error: 'We could not find that ZIP code. Check it and try again.'
        });
      }
      ({ latitude: lat, longitude: lon } = coordinates);
    }

    const pointsUrl = `${WEATHER_API_BASE}/points/${lat},${lon}`;
    const pointsData = await fetchWeatherJson(pointsUrl);
    const forecastUrl = pointsData?.properties?.forecast;

    if (!forecastUrl) {
      return res.status(404).json({
        error: 'No forecast data was found for that location.'
      });
    }

    const forecastData = await fetchWeatherJson(forecastUrl);
    const locationProperties = pointsData?.properties?.relativeLocation?.properties || {};
    const periods = (forecastData?.properties?.periods || []).slice(0, 5).map((period) => ({
      name: period.name,
      startTime: period.startTime,
      temperature: period.temperature,
      temperatureUnit: period.temperatureUnit,
      shortForecast: period.shortForecast,
      windSpeed: period.windSpeed,
      windDirection: period.windDirection
    }));

    res.json({
      location: {
        city: locationProperties.city || 'Unknown city',
        state: locationProperties.state || 'Unknown state',
        latitude: lat,
        longitude: lon,
        zip: zip || null
      },
      periods
    });
  } catch (error) {
    console.error('Weather fetch failed:', error);
    res.status(500).json({
      error: 'Unable to load weather information from the National Weather Service API.'
    });
  }
});

app.listen(PORT, () => {
  console.log(`Weather app listening on http://localhost:${PORT}`);
});
