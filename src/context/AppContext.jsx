import axios from "axios";
import { createContext, useContext, useEffect, useState } from "react";
import { API_KEY, URL_API } from "../constant/config";

const AppContext = createContext(null)

export const AppProvider = ({ children }) => {
    const [featuresData, setFeaturesData] = useState(null);


    const fetchFeatures = async () => {

        const response = await axios.get(`${URL_API}?api_key=${API_KEY}`);

        if (!response.status === 200) throw new Error("Failed to fetch data");
    
        setFeaturesData(response.data);
    }

    useEffect(() => {
        fetchFeatures()
    }, []);

    return <AppContext.Provider value={{
        fetchFeatures, featuresData
    }}>
        {children}
    </AppContext.Provider>
}

export const AppData = () => {
    const context = useContext(AppContext)

    if (!context) throw new Error("AppData must be used within an AppProvider");

    return context;
}