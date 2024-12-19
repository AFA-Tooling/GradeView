import React from 'react';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import Loader from '../components/Loader';
import './css/conceptMap.css';
import jwtDecode from 'jwt-decode';
import { StudentSelectionContext } from "../components/StudentSelectionWrapper";
import apiv2 from "../utils/apiv2";

/**
 * The ConceptMap component renders a concept map based on student progress data from the progressQueryString API.
 * 1. This fetches data either for either:
 *    a. A currently logged-in user (student view)
 *    b. A selected student (instructor view)
 * and displays the concept map within an iframe.
 * 2. The concept map iframe src takes in a string of numbers to display a concept map,
 *    a. This makes an API call to the Python Flask application to create the concept map.
 *    b. Each number represents a student's mastery level for a particular concept.
 * 3. The concept nodes are arranged vertically from top to bottom.
 * 4. The list of numerical strings associated with each node is sorted horizontally from left to right.
 *    a. This numerical string is calculated through the Google Sheets data in the JavaScript API call.
 * @component
 * @returns {JSX.Element} The ConceptMap component.
 */
export default function ConceptMap() {
    const [loading, setLoading] = useState(false);
    const [conceptMapHTML, setConceptMapHTML] = useState('');
    const [masteryMapping, setMasteryMapping] = useState({});


    /** The iframeRef is initially set to null. Once the HTML webpage is loaded
     * for the concept map, the iframeRef is dynamically set to the fetched
     * progress report query string iframe for the selected student.
    */
    const iframeRef = useRef(null);

    const { selectedStudent } = useContext(StudentSelectionContext);

    /** This adjusts the height of the iframe to fit its content and removes the iframe scrollbar.
     * This function is called when the iframe starts to load. */
    const handleLoad = useCallback(() =>{
        if(iframeRef.current) {
            const iframeDocument = iframeRef.current.contentDocument || iframeRef.current.contentWindow.document;
            const height = iframeDocument.body.scrollHeight;
            iframeRef.current.style.height = `${height}px`;
        }
    }, []);

    /**
     * Fetch the logged-in student's mastery data on component mount (student view).
     * This effect fetches data based on the JWT token stored
     * in localStorage and updates the component's state.
     */
    useEffect(() => {
        let mounted = true;
        setLoading(true);
        if (mounted && localStorage.getItem('token')) {
            let email = jwtDecode(localStorage.getItem('token')).email;
            // Fetch the student masterymapping
            apiv2.get(`/students/${email}/masterymapping`).then((res) => {
                setMasteryMapping(res.data);
                setLoading(false);
            });
        } else {
            setLoading(false);
        }
        return () => mounted = false;
    }, []);

    /**
     * Fetch the selected student's mastery data whenever the selected student
     * changes for the instructor view.
     * This effect depends on the `selectedStudent` from the context.
     */
    useEffect(() => {
        let mounted = true;
        if (mounted) {
            setLoading(true);
            // Fetch the student masterymapping
            apiv2.get(`/students/${selectedStudent}/masterymapping`).then((res) => {
                setMasteryMapping(res.data);
                setLoading(false);
            });
        }
        return () => mounted = false;
    }, [selectedStudent])

    useEffect(() => {
        async function fetchCMHTML() {
            const url = `${window.location.origin}/progress`;
            try {
                const response = await fetch(url, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(masteryMapping)
                });
                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }
                const result = await response.text();
                return result;
            } catch (error) {
                console.error("Error:", error);
                return null;
            }
        }
        fetchCMHTML().then(result => {
            setConceptMapHTML(result);
        });
    })

    if (loading) {
        return <Loader />;
    }

    /**
     * Render the concept map iframe with the fetched mastery data.
     * This iframe src takes in a string of numbers
     * (progressQueryString) to display a concept map.
     */
    return (
        <>
            {/* <PageHeader>Concept Map</PageHeader> */}
            <div style={{ textAlign: 'center', height:"100%" }} overflow="hidden">
                <iframe
                    ref={iframeRef}
                    className="concept_map_iframe"
                    id="ConceptMap"
                    name="ConceptMap"
                    title="Concept Map"
                    srcdoc={conceptMapHTML}
                    onLoad={handleLoad}
                    scrolling='no'
                    allowFullScreen
                />
            </div>
        </>
    );
}
