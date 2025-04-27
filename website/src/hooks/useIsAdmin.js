// src/hooks/useIsAdmin.js
import { useState, useEffect } from 'react';
import apiv2 from '../utils/apiv2';

export default function useIsAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    apiv2
      .get('/isadmin')
      .then(res => {
        // res.data is { isAdmin: true } or { isAdmin: false }
        setIsAdmin(res.data.isAdmin);
      })
      .catch(err => setError(err))
      .finally(() => setLoading(false));
  }, []);

  return { isAdmin, loading, error };
}
