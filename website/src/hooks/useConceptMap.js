// // src/hooks/useConceptMap.js
// import { useState, useEffect } from 'react';
// import apiv2 from '../utils/apiv2';

// export default function useConceptMap(studentId) {
//     const [outlineData, setOutlineData] = useState(null);
//     const [loading, setLoading] = useState(true);

//     useEffect(() => {
//         if (!studentId) return setLoading(false);
//         setLoading(true);

//         apiv2.get(`/students/${encodeURIComponent(studentId)}/conceptmap`)
//         .then(res => {
//             setOutlineData(res.data);
//             setLoading(false);
//         })
//         .catch(err => {
//             console.error("Failed to fetch concept map", err);
//             setLoading(false);
//         });    
//     }, [studentId]);

//     return { outlineData, loading };
// }

// src/hooks/useConceptMap.js
// src/hooks/useConceptMap.js
import { useState, useEffect } from 'react';
import apiv2 from '../utils/apiv2';

export default function useConceptMap(studentId) {
  const [outlineData, setOutlineData] = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);

  useEffect(() => {
    if (!studentId) {
      setLoading(false);
      return;
    }

    let isActive = true;

    const fetchOutline = () => {
      console.log('[useConceptMap] fetching concept map for', studentId, 'at', new Date().toISOString());

      setLoading(true);
      setError(null);

      apiv2.get(`/students/${encodeURIComponent(studentId)}/conceptmap`)
        .then(res => {
          if (isActive)  {
            console.log('[useConceptMap] received new outline:', res.data);
            setOutlineData(res.data);
          }
        })
        .catch(err => {
            console.error('[useConceptMap] fetch error', err);
            if (isActive) setError(err);
        })
        .finally(() => {
          if (isActive) setLoading(false);
        });
    };

    // initial load
    fetchOutline();

    // SSE subscription: on “outline_updated” events, re-fetch
    const es = new EventSource('/api/events');
    es.onmessage = e => {
      console.log('[useConceptMap] SSE event:', e.data);
      let payload;
      try {
        payload = JSON.parse(e.data)
      } catch {
        return;
      }
      if (payload.type === 'outline_updated') {
        fetchOutline();
      }
    };
    es.onerror = err => {
      console.error('SSE error', err);
      es.close();
    };

    return () => {
      isActive = false;
      es.close();
    };
  }, [studentId]);

  return { outlineData, loading, error };
}
