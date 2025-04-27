// website/src/views/conceptMap.js

import React, { useContext, useEffect, useState } from 'react';
import { jwtDecode } from 'jwt-decode';
import Loader from '../components/Loader';
import ConceptMapTree from '../components/conceptMapTree';
import apiv2 from '../utils/apiv2';
import { StudentSelectionContext } from '../components/StudentSelectionWrapper';

export default function ConceptMap() {
  const { selectedStudent } = useContext(StudentSelectionContext);
  const [treeData, setTreeData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // pick instructor’s dropdown or fallback to logged-in user
    let email = selectedStudent;
    if (!email) {
      const token = localStorage.getItem('token');
      if (token) {
        const payload = jwtDecode(token);
        email = payload.email;
      }
    }
    if (!email) return;

    const fetchMap = async () => {
      setLoading(true);
      try {
        const encoded = encodeURIComponent(email);
        // 🔑 use the conceptmap endpoint, not masterymapping
        const res = await apiv2.get(`/students/${encoded}/conceptmap`);
        // the payload includes a `nodes` field that is already in tree form
        setTreeData(res.data.nodes);
      } catch (err) {
        console.error('Failed to load concept map:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchMap();
  }, [selectedStudent]);

  if (loading || !treeData) {
    return <Loader />;
  }

  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <ConceptMapTree outlineData={treeData} />
    </div>
  );
}
