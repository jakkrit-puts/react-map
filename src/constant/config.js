export const URL_API = import.meta.env.VITE_APP_API_URL;
export const API_KEY = import.meta.env.VITE_APP_API_KEY;

export const API_URL = `${URL_API}?api_key=${API_KEY}`;
export const MAP_STYLE = {
    version: 8,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: {
        "openmaptiles": {
            type: "raster",
            tiles: [
                "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            ],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors"
        }
    },
    layers: [
        {
            id: "background",
            type: "background",
            paint: { "background-color": "#e0e0e0" }
        },
        {
            id: "osm-tiles",
            type: "raster",
            source: "openmaptiles",
        }
    ]
};