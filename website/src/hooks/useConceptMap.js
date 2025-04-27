// src/hooks/useConceptMap.js
import { useState, useEffect } from 'react';
import apiv2 from '../utils/apiv2';

export default function useConceptMap(studentId) {
  const [outlineData, setOutlineData] = useState(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);

  useEffect(() => {
    if (!studentId) return setLoading(false);
    setLoading(true);

    apiv2
      .get(`/students/${encodeURIComponent(studentId)}/conceptmap`)
      .then(res => setOutlineData(res.data))
      .catch(err => setError(err))
      .finally(() => setLoading(false));
  }, [studentId]);

  return { outlineData, loading, error };
}
