import { useState, useCallback, useRef } from 'react';
import {
  collection, query, orderBy, limit, startAfter,
  getDocs, where, getCountFromServer,
} from 'firebase/firestore';
import { db } from '../firebase';

const PAGE_SIZE = 12;

export const usePagination = (collectionName, constraints = [], pageSize = PAGE_SIZE) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const cursorsRef = useRef([null]); // cursors[0] = null (start), cursors[n] = last doc of page n-1

  const fetchPage = useCallback(async (pageIndex) => {
    setLoading(true);
    setError(null);
    try {
      const col = collection(db, collectionName);

      // Count query
      const countQuery = query(col, ...constraints);
      const countSnap = await getCountFromServer(countQuery);
      setTotalCount(countSnap.data().count);

      // Data query
      const cursor = cursorsRef.current[pageIndex];
      const q = cursor
        ? query(col, ...constraints, limit(pageSize), startAfter(cursor))
        : query(col, ...constraints, limit(pageSize));

      const snap = await getDocs(q);
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // Store cursor for next page
      if (snap.docs.length > 0) {
        cursorsRef.current[pageIndex + 1] = snap.docs[snap.docs.length - 1];
      }

      setItems(docs);
      setPage(pageIndex);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [collectionName, constraints, pageSize]);

  const goToPage = useCallback((pageIndex) => {
    fetchPage(pageIndex);
  }, [fetchPage]);

  const totalPages = Math.ceil(totalCount / pageSize);

  return {
    items,
    loading,
    error,
    page,
    totalPages,
    totalCount,
    goToPage,
    fetchPage,
    refresh: () => {
      cursorsRef.current = [null];
      fetchPage(0);
    },
  };
};

// Hook for simple list with infinite scroll
export const useInfiniteList = (collectionName, constraints = [], pageSize = PAGE_SIZE) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const lastDocRef = useRef(null);

  const loadMore = useCallback(async (reset = false) => {
    if (loading) return;
    setLoading(true);
    try {
      const col = collection(db, collectionName);
      const q = reset || !lastDocRef.current
        ? query(col, ...constraints, limit(pageSize))
        : query(col, ...constraints, limit(pageSize), startAfter(lastDocRef.current));

      const snap = await getDocs(q);
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      if (reset) {
        setItems(docs);
      } else {
        setItems((prev) => [...prev, ...docs]);
      }

      lastDocRef.current = snap.docs[snap.docs.length - 1] || null;
      setHasMore(snap.docs.length === pageSize);
    } catch (err) {
      console.error('Infinite list error:', err);
    } finally {
      setLoading(false);
    }
  }, [collectionName, constraints, pageSize, loading]);

  const refresh = useCallback(() => {
    lastDocRef.current = null;
    loadMore(true);
  }, [loadMore]);

  return { items, loading, hasMore, loadMore, refresh };
};
