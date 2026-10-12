import { createContext, useContext } from 'react';
export const AuthCtx = createContext();
export const useAuth = () => useContext(AuthCtx);
