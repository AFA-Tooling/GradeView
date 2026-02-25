// src/views/dashboard.jsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiv2 from '../utils/apiv2';
import Loader from '../components/Loader';

/**
 * Smart Dashboard Component
 * Routes users based on their role:
 * - Admin users -> /admin
 * - Regular users -> /profile (student profile with grades, buckets, concept map)
 */
export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user is admin
    apiv2.get('/isadmin')
      .then(res => {
        const isAdmin = res.data.isAdmin;
        if (isAdmin) {
          navigate('/admin', { replace: true });
        } else {
          navigate('/profile', { replace: true });
        }
      })
      .catch(err => {
        console.error('Failed to check admin status:', err);
        // Default to profile on error
        navigate('/profile', { replace: true });
      })
      .finally(() => {
        setLoading(false);
      });
  }, [navigate]);

  if (loading) {
    return <Loader />;
  }

  return null;
}
