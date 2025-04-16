import React, { useContext, useEffect, useState } from 'react';
import Loader from '../components/Loader';
import './css/conceptMap.css';
import { jwtDecode } from 'jwt-decode';
import { StudentSelectionContext } from "../components/StudentSelectionWrapper";
import apiv2 from "../utils/apiv2";
import axios from "axios";

export default function ConceptMap() {
    const [loading, setLoading] = useState(false);
    const [conceptMapHTML, setConceptMapHTML] = useState('');
    const { selectedStudent } = useContext(StudentSelectionContext);

    // Function to fetch and update concept map HTML
    const fetchConceptMapData = async () => {
        try {
            console.log("Polling: fetching concept map data at", new Date());
            setLoading(true);
            let email;
            if (selectedStudent) {
                email = selectedStudent;
            } else if (localStorage.getItem('token')) {
                email = jwtDecode(localStorage.getItem('token')).email;
            }
            const encodedEmail = encodeURIComponent(email);
            // Call the mastery mapping endpoint
            const masteryRes = await apiv2.get(`/students/${encodedEmail}/masterymapping`);
            console.log("Mastery mapping data:", masteryRes.data);
            const conceptMapUrl = `${window.location.origin}/progress`;
            // Post the mastery mapping data to get concept map HTML
            const postRes = await axios.post(conceptMapUrl, masteryRes.data);
            console.log("Received concept map HTML:", postRes.data);
            setConceptMapHTML(postRes.data);
            setLoading(false);
        } catch (error) {
            console.error("Error fetching concept map data:", error);
            setLoading(false);
        }
    };

    // Set up polling: fetch on mount and then every minute
    useEffect(() => {
        fetchConceptMapData();
        const intervalId = setInterval(fetchConceptMapData, 60000);
        return () => clearInterval(intervalId);
    }, [selectedStudent]);

    if (loading) {
        return <Loader />;
    }

    return (
        <div style={{ textAlign: 'center', height: "100%" }}>
            {/*   
                IMPORTANT SECURITY NOTES:
                - When using `dangerouslySetInnerHTML`, the content is inserted into the DOM without 
                  escaping, so any embedded scripts or malicious content in the HTML can execute.
                - Only use this property with trusted, pre-sanitized HTML.
                - If the HTML is coming from an untrusted source, you must sanitize it (for example, 
                  using a library like DOMPurify) to prevent cross-site scripting (XSS) vulnerabilities.
                - In this case, we expect the HTML to be generated securely on the server-side, but always 
                  ensure that the data source is safe.
            */}
            <div
                className="concept_map_container"
                dangerouslySetInnerHTML={{ __html: conceptMapHTML }}
            />
        </div>
    );
}
