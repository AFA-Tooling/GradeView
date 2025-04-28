// src/hooks/useConceptMap.js
import { useState, useEffect } from 'react';
import apiv2 from '../utils/apiv2';

export default function useConceptMap(studentId) {
    const [outlineData, setOutlineData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!studentId) return setLoading(false);
        setLoading(true);

        apiv2.get(`/students/${encodeURIComponent(studentId)}/conceptmap`)
        .then(res => {
            setOutlineData(res.data);
            setLoading(false);
        })
        .catch(err => {
            console.error("Failed to fetch concept map", err);
            setLoading(false);
        });    
    }, [studentId]);

    return { outlineData, loading };
}
