import { useRef } from "react";
import API from "../services/api";
import { createRecordCache } from "../utils/recordPick";

const fetchById = async (kind, id) => (await API.get(`/${kind}/${id}`)).data;

// One record cache per form instance (see utils/recordPick.js): remembers the companies and
// contacts the user picked, so the form can read their addresses / GSTIN without holding a list.
export default function useRecordCache() {
  const ref = useRef(null);
  if (!ref.current) ref.current = createRecordCache(fetchById);
  return ref.current;
}
