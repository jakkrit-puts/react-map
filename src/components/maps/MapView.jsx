
import React, { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import axios from "axios";
import { FixedSizeList as List } from "react-window";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import debounce from "lodash.debounce";
import Supercluster from "supercluster";
import "maplibre-gl/dist/maplibre-gl.css";
import { API_URL, MAP_STYLE } from "../../constant/config";

const fetchAllFeatures = async (url) => {
    const results = [];
    let nextUrl = url;
    const limit = 1000;

    while (nextUrl) {
        try {
            const res = await axios.get(nextUrl, { timeout: 20000 });
            const data = res.data;
            if (!data) break;
            const items = data.items || data.features || data;
            if (Array.isArray(items)) results.push(...items);


            nextUrl = null;
            if (data.links && data.links.next) nextUrl = data.links.next;
            else if (data.next) nextUrl = data.next;
            else if (items && items.length === 0) nextUrl = null;
            else break;
        } catch (err) {
            console.error("fetchAllFeatures error", err);
            throw err;
        }
    }
    return results;
};

function geoToPoint(feature) {
    const coords = feature.geometry?.coordinates || [0, 0];
    const props = feature.properties || feature.properties || {};
    return {
        type: "Feature",
        properties: { ...props, id: feature.id || props.id || Math.random().toString(36).slice(2) },
        geometry: { type: "Point", coordinates: coords },
    };
}

function summarizeByDate(features, dateKey = "date") {
    const map = new Map();
    for (const f of features) {
        const props = f.properties || {};
        const raw = props[dateKey] || props.created_at || props.date || props.timestamp;
        const d = raw ? new Date(raw).toISOString().slice(0, 10) : "unknown";
        map.set(d, (map.get(d) || 0) + 1);
    }
    const arr = Array.from(map.entries()).map(([date, count]) => ({ date, count }));
    arr.sort((a, b) => (a.date === "unknown" ? 1 : b.date === "unknown" ? -1 : a.date.localeCompare(b.date)));
    return arr;
}

const PIE_COLORS = ["#4F46E5", "#06B6D4", "#F59E0B", "#EF4444", "#10B981", "#8B5CF6"];

export default function MapView2() {
    const [features, setFeatures] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [filterText, setFilterText] = useState("");
    const [selected, setSelected] = useState(null);
    const [bounds, setBounds] = useState(null);

    const mapRef = useRef(null);
    const mapContainerRef = useRef(null);
    const clusterRef = useRef(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const items = await fetchAllFeatures(API_URL);
                if (cancelled) return;
                const normalized = items.map((it) => {
                    if (it.type === "Feature") return it;
                    if (it.geometry) return it;
                    if (it.lat && it.lon) {
                        return { type: "Feature", geometry: { type: "Point", coordinates: [it.lon, it.lat] }, properties: it };
                    }
                    return geoToPoint(it);
                });
                setFeatures(normalized);
                setError(null);
            } catch (err) {
                console.error(err);
                setError(err.message || "Failed to fetch");
            } finally {
                setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const clusterIndex = useMemo(() => {
        if (!features || features.length === 0) return null;
        const index = new Supercluster({ radius: 60, maxZoom: 16 });
        index.load(features.map((f) => ({ type: "Feature", properties: f.properties || {}, geometry: f.geometry }))); // ensure valid
        clusterRef.current = index;
        return index;
    }, [features]);


    const filtered = useMemo(() => {
        if (!filterText) return features;
        const t = filterText.toLowerCase();
        return features.filter((f) => JSON.stringify(f.properties || {}).toLowerCase().includes(t));
    }, [features, filterText]);


    const chartByDate = useMemo(() => summarizeByDate(filtered), [filtered]);

    const pieData = useMemo(() => {
        const counter = new Map();
        for (const f of filtered) {
            const props = f.properties || {};

            const keys = Object.keys(props);
            const key = keys.find((k) => typeof props[k] === "string" && props[k].length <= 30) || keys[0];
            const val = props[key] == null ? "(none)" : String(props[key]);
            counter.set(val, (counter.get(val) || 0) + 1);
        }
        const arr = Array.from(counter.entries()).slice(0, 6).map(([name, value]) => ({ name, value }));
        return arr;
    }, [filtered]);

    useEffect(() => {
        if (!mapContainerRef.current) return;

        const map = new maplibregl.Map({
            container: mapContainerRef.current,
            style: MAP_STYLE,
            center: [100.5167, 13.7367],
            zoom: 5,
        });

        mapRef.current = map;

        map.addControl(new maplibregl.NavigationControl(), "top-right");

        map.on("click", (e) => {
            const featuresOnPoint = map.queryRenderedFeatures(e.point);
            if (featuresOnPoint && featuresOnPoint.length) {
                const f = featuresOnPoint[0];
                setSelected(f.properties || f);
            }
        });

        return () => map.remove();
    }, []);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !clusterIndex) return;

        if (map.getSource("vallaris-points")) {
            map.removeLayer("clusters");
            map.removeLayer("cluster-count");
            map.removeLayer("unclustered-point");
            map.removeSource("vallaris-points");
        }

        const bounds = map.getBounds ? map.getBounds().toArray().flat() : [-180, -90, 180, 90];
        const zoom = Math.round(map.getZoom ? map.getZoom() : 5);
        const clusters = clusterIndex.getClusters(bounds, zoom);
        const sourceData = { type: "FeatureCollection", features: clusters };

        map.addSource("vallaris-points", { type: "geojson", data: sourceData, cluster: false });

        map.addLayer({
            id: "clusters",
            type: "circle",
            source: "vallaris-points",
            paint: {
                "circle-radius": ["step", ["get", "point_count"], 8, 10, 12, 50, 20],
                "circle-color": ["case", [">", ["get", "point_count"], 50], "#e11d48", "#06b6d4"],
                "circle-opacity": 0.9,
            },
        });

        map.addLayer({
            id: "cluster-count",
            type: "symbol",
            source: "vallaris-points",
            layout: { "text-field": ["coalesce", ["get", "point_count"], ""], "text-size": 12 },
            paint: { "text-color": "#ffffff" },
        });

        map.addLayer({
            id: "unclustered-point",
            type: "circle",
            source: "vallaris-points",
            filter: ["!", ["has", "point_count"]],
            paint: { "circle-radius": 6, "circle-color": "#2563eb" },
        });


        const onMoveEnd = debounce(() => {
            try {
                const bounds = map.getBounds().toArray().flat();
                const zoom = Math.round(map.getZoom());
                const clusters = clusterIndex.getClusters(bounds, zoom);
                const data = { type: "FeatureCollection", features: clusters };
                const src = map.getSource("vallaris-points");
                if (src) src.setData(data);
            } catch (err) {
                console.error(err);
            }
        }, 300);

        map.on("moveend", onMoveEnd);

        return () => {
            map.off("moveend", onMoveEnd);
        };
    }, [clusterIndex]);

    const onFilterChange = debounce((v) => {
        console.log({ v });
        setFilterText(v)
    }, 300);

    const Row = ({ index, style }) => {
        const f = filtered[index];
        const props = f.properties || {};
        const coords = f.geometry?.coordinates || [];
        return (
            <div
                style={style}
                className={"px-3 py-2 border-b border-gray-100 flex justify-between items-center cursor-pointer hover:bg-gray-50"}
                onClick={() => {
                    setSelected(f);
                    if (mapRef.current && coords && coords.length === 2) mapRef.current.flyTo({ center: coords, zoom: 14 });
                }}
            >
                <div className="w-2/3 truncate text-sm">
                    <div className="font-medium">{props.name || props.title || props.id || `Item ${index + 1}`}</div>
                    <div className="text-xs text-gray-500 truncate">{Object.entries(props || {}).slice(0, 3).map(([k, v]) => `${k}: ${String(v)}`).join(' • ')}</div>
                </div>
                <div className="w-1/3 text-right text-xs text-gray-600">{coords && coords.length ? `${coords[1].toFixed(4)}, ${coords[0].toFixed(4)}` : '—'}</div>
            </div>
        );
    };

    return (
        <div className="min-h-screen flex flex-col md:flex-row bg-white text-gray-900" style={{ fontFamily: 'Inter, system-ui, -apple-system, Roboto, "Helvetica Neue", Arial' }}>
            <div className="md:w-2/3 h-96 md:h-screen p-3">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                        <h1 className="text-xl font-bold">แสดงแผนที่</h1>
                        <div className="text-sm text-gray-500">{loading ? 'Loading...' : `${features.length} features`}</div>
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            className="border px-2 py-1 rounded-md text-sm"
                            placeholder="ค้นหา..."
                            onChange={(e) => onFilterChange(e.target.value)}
                        />
                    </div>
                </div>
                <div ref={mapContainerRef} className="w-full h-full rounded shadow-sm border" />
            </div>

            <div className="md:w-1/3 h-auto md:h-screen overflow-hidden flex flex-col border-l">
                <div className="p-3 border-b">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold">ภาพรวม</h2>
                        <div className="text-xs text-gray-500">Filtered: {filtered.length}</div>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-center text-sm">
                        <div className="bg-gray-50 p-2 rounded">Total<br /><strong>{features.length}</strong></div>
                        <div className="bg-gray-50 p-2 rounded">Filtered<br /><strong>{filtered.length}</strong></div>
                        <div className="bg-gray-50 p-2 rounded">Selected<br /><strong>{selected ? 'Yes' : 'No'}</strong></div>
                    </div>
                </div>

                <div className="p-3 overflow-auto flex-1">
                    <div className="mb-4" style={{ height: 180 }}>
                        <h3 className="text-sm font-medium mb-2">Trends by date</h3>
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartByDate}>
                                <XAxis dataKey="date" hide />
                                <YAxis />
                                <Tooltip />
                                <Line type="monotone" dataKey="count" stroke="#4F46E5" strokeWidth={2} dot={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="mb-4" style={{ height: 180 }}>
                        <h3 className="text-sm font-medium mb-2">Sample distribution</h3>
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={70} label>
                                    {pieData.map((entry, index) => (
                                        <Cell key={`c-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                                    ))}
                                </Pie>
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="mb-4">
                        <h3 className="text-sm font-medium mb-2">Selected / Details</h3>
                        <div className="text-xs text-gray-700 bg-gray-50 p-2 rounded max-h-36 overflow-auto">
                            {selected ? <pre className="whitespace-pre-wrap text-xs">{JSON.stringify(selected, null, 2)}</pre> : <div className="text-gray-500">Click a map point or table row to see details.</div>}
                        </div>
                    </div>

                    <div>
                        <h3 className="text-sm font-medium mb-2">Data Table</h3>
                        <div className="border rounded overflow-hidden">
                            <List height={300} itemCount={filtered.length} itemSize={64} width={'100%'}>
                                {Row}
                            </List>
                        </div>
                    </div>
                </div>
            </div>

        </div>
    );
}
