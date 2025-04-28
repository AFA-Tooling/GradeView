// import React from 'react';
// import { useCallback, useContext, useEffect, useRef, useState } from 'react';
// import Loader from '../components/Loader';
// import './css/conceptMap.css';
// import { jwtDecode } from 'jwt-decode';
// import { StudentSelectionContext } from "../components/StudentSelectionWrapper";
// import apiv2 from "../utils/apiv2";
// import axios from "axios";

// /**
//  * The ConceptMap component renders a concept map based on student progress data from the progressQueryString API.
//  * 1. This fetches data either for either:
//  *    a. A currently logged-in user (student view)
//  *    b. A selected student (instructor view)
//  * and displays the concept map within an iframe.
//  * 2. The concept map iframe src takes in a string of numbers to display a concept map,
//  *    a. This makes an API call to the Python Flask application to create the concept map.
//  *    b. Each number represents a student's mastery level for a particular concept.
//  * 3. The concept nodes are arranged vertically from top to bottom.
//  * 4. The list of numerical strings associated with each node is sorted horizontally from left to right.
//  *    a. This numerical string is calculated through the Google Sheets data in the JavaScript API call.
//  * @component
//  * @returns {JSX.Element} The ConceptMap component.
//  */
// export default function ConceptMap() {
//     const [loading, setLoading] = useState(false);
//     const [conceptMapHTML, setConceptMapHTML] = useState('');

//     /** The iframeRef is initially set to null. Once the HTML webpage is loaded
//      * for the concept map, the iframeRef is dynamically set to the fetched
//      * progress report query string iframe for the selected student.
//      */
//     const iframeRef = useRef(null);

//     const { selectedStudent } = useContext(StudentSelectionContext);

//     /** This adjusts the height of the iframe to fit its content and removes the iframe scrollbar.
//      * This function is called when the iframe starts to load. */
//     const handleLoad = useCallback(() =>{
//         if(iframeRef.current) {
//             const iframeDocument = iframeRef.current.contentDocument || iframeRef.current.contentWindow.document;
//             const height = iframeDocument.body.scrollHeight;
//             iframeRef.current.style.height = `${height}px`;
//         }
//     }, []);

//     /**
//      * Fetch the logged-in student's CM html on component mount (student view).
//      * This effect fetches data based on the JWT token stored
//      * in localStorage and updates the component's state.
//      */
//     useEffect(() => {
//         let mounted = true;
//         setLoading(true);
//         if (mounted && localStorage.getItem('token')) {
//             let email = jwtDecode(localStorage.getItem('token')).email;
//             // Fetch the student masterymapping
//             apiv2.get(`/students/${email}/masterymapping`).then((res) => {
//                 const conceptMapUrl = `${window.location.origin}/progress`;
//                 axios.post(conceptMapUrl, res.data).then((res) => {
//                     setConceptMapHTML(res.data);
//                 });
//                 setLoading(false);
//             });
//         } else {
//             setLoading(false);
//         }
//         return () => mounted = false;
//     }, []);

//     /**
//      * Fetch the selected student's CM html whenever the selected student
//      * changes for the instructor view.
//      * This effect depends on the `selectedStudent` from the context.
//      */
//     useEffect(() => {
//         let mounted = true;
//         if (mounted) {
//             setLoading(true);
//             // Fetch the student masterymapping
//             apiv2.get(`/students/${selectedStudent}/masterymapping`).then((res) => {
//                 const conceptMapUrl = `${window.location.origin}/progress`;
//                 axios.post(conceptMapUrl, res.data).then((res) => {
//                     setConceptMapHTML(res.data);
//                 });
//                 setLoading(false);
//             });
//         }
//         return () => mounted = false;
//     }, [selectedStudent])

//     if (loading) {
//         return <Loader />;
//     }

//     /**
//      * Render the concept map iframe with the fetched mastery data.
//      * This iframe src takes in a string of numbers
//      * (progressQueryString) to display a concept map.
//      */
//     return (
//         <>
//             {/* <PageHeader>Concept Map</PageHeader> */}
//             <div style={{ textAlign: 'center', height:"100%" }} overflow="hidden">
//                 <iframe
//                     ref={iframeRef}
//                     className="concept_map_iframe"
//                     id="ConceptMap"
//                     name="ConceptMap"
//                     title="Concept Map"
//                     srcdoc={conceptMapHTML}
//                     onLoad={handleLoad}
//                     scrolling='no'
//                     allowFullScreen
//                 />
//             </div>
//         </>
//     );
// }
// src/views/ConceptMap.jsx
// src/views/ConceptMap.jsx
import React, { useContext } from 'react';
import { jwtDecode } from 'jwt-decode';

import Loader from '../components/Loader';
import ConceptMapTree from '../components/ConceptMapTree';
import { StudentSelectionContext } from '../components/StudentSelectionWrapper';
import useWindowDimensions    from '../hooks/useWindowDimension';
import useIsAdmin             from '../hooks/useIsAdmin';
import useConceptMap          from '../hooks/useConceptMap';

export default function ConceptMap() {
  // 1) Layout hook
  const { width, height } = useWindowDimensions();

  // 2) Are we an admin?
  const {
    isAdmin,
    loading: adminLoading,
    error:   adminError,
  } = useIsAdmin();

  // 3) If instructor view, which student is selected?
  const { selectedStudent } = useContext(StudentSelectionContext);

  // 4) Who am I? (the logged-in student)
  const token     = localStorage.getItem('token');
  const userEmail = token ? jwtDecode(token).email : null;

  // 5) Decide whose map to fetch
  //    - Admins wait until they pick someone
  //    - Students always see their own
  const studentId = isAdmin
    ? selectedStudent      // might be undefined at first
    : userEmail;

  // 6) Fetch the concept‐map data
  const {
    outlineData,
    loading: mapLoading,
    error:   mapError,
  } = useConceptMap(studentId);

  // --- render logic in order ---

  if (adminLoading) return <Loader />;
  if (adminError)   return <div>Error checking admin status.</div>;

  if (isAdmin && !selectedStudent) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        Please select a student from the dropdown above to view their concept map.
      </div>
    );
  }

  if (mapLoading) return <Loader />;
  if (mapError)   return <div>Error loading concept map.</div>;

  // Finally, render the D3 tree
  return (
    <ConceptMapTree
      outlineData={outlineData}
      dimensions={{ width, height }}
      currWeek={outlineData.nodes.data.week}
    />
  );
}
