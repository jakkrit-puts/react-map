import React, { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { AppData } from "../../context/AppContext";

const MapView = () => {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const { featuresData } = AppData();

  useEffect(() => {
    if (!map.current) {
      map.current = new maplibregl.Map({
        container: mapContainer.current,
        style: "https://demotiles.maplibre.org/style.json",
        center: [100.5018, 13.7563],
      });

      map.current.addControl(new maplibregl.NavigationControl(), "top-right");
    }
  }, []);

  useEffect(() => {
    if (!map.current || !featuresData) return;


    map.current.once("load", () => {
      if (!map.current.getSource("vallaris-points")) {
        map.current.addSource("vallaris-points", {
          type: "geojson",
          data: featuresData,
        });

        map.current.addLayer({
          id: "vallaris-layer",
          type: "circle",
          source: "vallaris-points",
          paint: {
            "circle-radius": 6,
            "circle-color": "#FF5733",
            "circle-stroke-width": 1,
            "circle-stroke-color": "#fff",
          },
        });
      }
    });

    map.current.on("click", "vallaris-layer", (e) => {
      const coordinates = e.features[0].geometry.coordinates.slice();
      const props = e.features[0].properties;

      new maplibregl.Popup()
        .setLngLat(coordinates)
        .setHTML(
          `<strong>Data:</strong><pre>${JSON.stringify(props, null, 2)}</pre>`
        )
        .addTo(map.current);
    });
  }, [featuresData]);

  return <div ref={mapContainer} style={{ width: "100%", height: "100vh" }} />;
};

export default MapView;
