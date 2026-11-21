import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getCurrentUser, fetchAuthSession, signOut } from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { isCognitoConfigured } from '../awsConfig.js';

const AuthContext = createContext(null);

// Roles are read from signed Cognito tokens. Never allow role selection in AWS mode.
function roleFromToken(tokens) {
  const groups = tokens?.accessToken?.payload?.['cognito:groups'] ||
                 tokens?.idToken?.payload?.['cognito:groups'] || [];
  if (groups.includes('manager')) return 'manager';
  if (groups.includes('employee')) return 'employee';
  return null; // No group: deny access until an administrator assigns one.
}

export function AuthProvider({ children }) {
  const [account, setAccount] = useState(null);
  const [ready, setReady] = useState(!isCognitoConfigured);
  const [error, setError] = useState('');

  const refreshAuth = useCallback(async () => {
    if (!isCognitoConfigured) return;
    try {
      const [user, session] = await Promise.all([getCurrentUser(), fetchAuthSession()]);
      setAccount({
        role: roleFromToken(session.tokens),
        userId: user.userId,
        username: user.username,
        displayName: String(session.tokens?.idToken?.payload?.name || user.username),
      });
      setError('');
    } catch (err) {
      setAccount(null);
      if (err?.name !== 'UserUnAuthenticatedException') {
        // The sign-in UI handles normal not-signed-in states.
        setError('');
      }
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!isCognitoConfigured) return;
    void refreshAuth();
    const cancel = Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'signedIn' || payload.event === 'tokenRefresh') {
        void refreshAuth();
      }
      if (payload.event === 'signedOut') setAccount(null);
    });
    return () => cancel();
  }, [refreshAuth]);

  const logout = useCallback(async () => {
    if (!isCognitoConfigured) return;
    try {
      await signOut();
      setAccount(null);
      setError('');
    } catch (err) {
      setError(err?.message || 'Could not sign out.');
      throw err;
    }
  }, []);

  const value = useMemo(() => ({
    mode: isCognitoConfigured ? 'cognito' : 'demo',
    ready, account, role: account?.role || null, error, refreshAuth, logout,
  }), [ready, account, error, refreshAuth, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider is missing');
  return value;
}
