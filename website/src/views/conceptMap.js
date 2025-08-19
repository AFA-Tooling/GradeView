import React from 'react';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import Loader from '../components/Loader';
import './css/conceptMap.css';
import { jwtDecode } from 'jwt-decode';
import { StudentSelectionContext } from "../components/StudentSelectionWrapper";
import apiv2 from "../utils/apiv2";
import axios from "axios";

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
     * Fetch the concept map data for either the logged-in student or selected student.
     * This effect handles both student view (JWT token) and instructor view (selectedStudent).
     */
    useEffect(() => {
        let mounted = true;
        setLoading(true);
        
        let email = null;
        
        console.log('=== CONCEPT MAP DEBUG ===');
        console.log('selectedStudent:', selectedStudent);
        console.log('selectedStudent type:', typeof selectedStudent);
        console.log('selectedStudent length:', selectedStudent ? selectedStudent.length : 'N/A');
        console.log('localStorage token exists:', !!localStorage.getItem('token'));
        
        // Determine which email to use
        if (selectedStudent) {
            // Instructor view - use selected student
            email = selectedStudent;
            console.log('Using selectedStudent email:', email);
        } else if (localStorage.getItem('token')) {
            // Student view - use JWT token
            const token = localStorage.getItem('token');
            console.log('JWT Token:', token);
            const decoded = jwtDecode(token);
            console.log('Decoded JWT:', decoded);
            email = decoded.email;
            console.log('Extracted email from JWT:', email);
        }
        
        console.log('Final email value:', email);
        console.log('=== END DEBUG ===');
        
        if (email && mounted) {
            console.log('Making API call with email:', email);
            // Fetch the student masterymapping
            apiv2.get(`/students/${email}/masterymapping`).then((res) => {
                if (mounted) {
                    const conceptMapUrl = `${window.location.origin}/progress`;
                    axios.post(conceptMapUrl, res.data).then((res) => {
                        if (mounted) {
                            setConceptMapHTML(res.data);
                        }
                    });
                    setLoading(false);
                }
            }).catch((err) => {
                console.error('Error fetching masterymapping:', err);
                if (mounted) {
                    setLoading(false);
                }
            });
        } else {
            console.log('No email available, setting loading to false');
            setLoading(false);
        }
        
        return () => {
            mounted = false;
        };
    }, [selectedStudent]);

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
