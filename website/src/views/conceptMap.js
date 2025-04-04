import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import Loader from '../components/Loader';
import './css/conceptMap.css';
import { jwtDecode } from 'jwt-decode';
import { StudentSelectionContext } from "../components/StudentSelectionWrapper";
import apiv2 from "../utils/apiv2";
import axios from "axios";

export default function ConceptMap() {
  const [loading, setLoading] = useState(false);
  const [conceptMapHTML, setConceptMapHTML] = useState('');
  const iframeRef = useRef(null);
  const { selectedStudent } = useContext(StudentSelectionContext);

  const handleLoad = useCallback(() => {
    if (iframeRef.current) {
      const iframeDocument =
        iframeRef.current.contentDocument ||
        iframeRef.current.contentWindow.document;
      const height = iframeDocument.body.scrollHeight;
      iframeRef.current.style.height = `${height}px`;
    }
  }, []);

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
      const masteryRes = await apiv2.get(`/students/${encodedEmail}/masterymapping`)
      console.log("Mastery mapping data:", masteryRes.data);
      const conceptMapUrl = `${window.location.origin}/progress`;
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
  return (
    <div style={{ textAlign: 'center', height:"100%" }} overflow="hidden">
      <button onClick={fetchConceptMapData}>Manual Refresh</button>
      <iframe
        ref={iframeRef}
        className="concept_map_iframe"
        id="ConceptMap"
        name="ConceptMap"
        title="Concept Map"
        srcdoc={conceptMapHTML}
        onLoad={handleLoad}
        scrolling="no"
        allowFullScreen
      />
      {/* Debug output: 
      <pre style={{ textAlign: 'left', margin: '20px auto', maxWidth: '800px' }}>
        {conceptMapHTML}
      </pre>
    */}
    </div>
  );
  
  
}
