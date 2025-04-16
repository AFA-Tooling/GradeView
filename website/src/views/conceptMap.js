import React, { useContext, useEffect, useState } from 'react';
import Loader from '../components/Loader';
import './css/conceptMap.css';
import { jwtDecode } from 'jwt-decode';
import { StudentSelectionContext } from "../components/StudentSelectionWrapper";
import apiv2 from "../utils/apiv2";
import axios from "axios";

/**
 * The ConceptMap component renders a dynamically generated concept map based on student progress data.
 *
 * It performs the following tasks:
 * 1. Retrieves mastery mapping data for a student, which is determined by:
 *    a. The currently logged-in user (student view), or
 *    b. A selected student (instructor view).
 * 2. Posts the retrieved mastery mapping data to a backend endpoint (a Python Flask application) to obtain HTML representing the concept map.
 * 3. Renders the received HTML directly into the component using `dangerouslySetInnerHTML`.
 *
 * SECURITY NOTICE:
 * This component uses `dangerouslySetInnerHTML` to insert HTML directly into the DOM without escaping.
 * It is critical that the HTML content is trusted and/or properly sanitized (e.g., using DOMPurify) to prevent
 * cross-site scripting (XSS) vulnerabilities.
 *
 * @component
 * @returns {JSX.Element} The rendered ConceptMap component.
 */
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
                - The HTML content is inserted into the DOM via `dangerouslySetInnerHTML` without escaping.
                - This bypasses React's default safety mechanism, so any embedded scripts or malicious content in the HTML can execute.
                - Ensure that the HTML is generated securely on the server-side and/or is properly sanitized before being rendered.
            */}
            <div
                className="concept_map_container"
                dangerouslySetInnerHTML={{ __html: conceptMapHTML }}
            />
        </div>
    );
}
