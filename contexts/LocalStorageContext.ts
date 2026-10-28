import { LOCAL_PROFILE } from '../services/localFirestore';
/** Data belongs to this device and is independent of Google sign-in. */
export const useStorageUser = () => ({ user: LOCAL_PROFILE, loading: false });
