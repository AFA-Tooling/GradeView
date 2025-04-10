import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Loader from '../components/Loader';
import './css/analytics.css';

export default function Analytics() {
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();
    
    const iframeRef = useRef(null);

    const handleLoad = useCallback(() => {
        if (iframeRef.current) {
            try {
                const iframeDocument = iframeRef.current.contentDocument || iframeRef.current.contentWindow.document;
                if (iframeDocument.title.includes("error") || iframeDocument.body.textContent.includes("error occurred")) {
                    console.error("Analytics dashboard failed to load properly");
                } else {
                    const height = iframeDocument.body.scrollHeight;
                    iframeRef.current.style.height = `${height}px`;
                }
                setLoading(false);
            } catch (e) {
                console.error("Could not access iframe content:", e);
                setLoading(false);
            }
        } else {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!localStorage.getItem('token')) {
            navigate('/login');
            return;
        }
        
        const timer = setTimeout(() => {
            setLoading(false);
        }, 500);
        
        return () => {
            clearTimeout(timer);
        };
    }, [navigate]);

    if (loading) {
        return <Loader />;
    }

    return (
        <div style={{ 
            textAlign: 'center', 
            height: "100vh",
            backgroundColor: "#f5f5f5",
            overflow: "hidden" 
        }}>
            <iframe
                ref={iframeRef}
                className="analytics_iframe"
                id="AnalyticsDashboard"
                name="AnalyticsDashboard"
                title="Analytics Dashboard"
                src="/analytics-dashboard"
                onLoad={handleLoad}
                scrolling='no'
                allowFullScreen
                style={{ height: "calc(100vh - 64px)" }}
            />
        </div>
    );
}