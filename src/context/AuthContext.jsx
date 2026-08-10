import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check initial Supabase auth session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchTenantProfile(session.user.id, session.user);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchTenantProfile(session.user.id, session.user);
      } else {
        setTenant(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch associated restaurant tenant profile (with fallback auto-create for Google OAuth)
  const fetchTenantProfile = async (userId, userObj = null) => {
    try {
      const { data, error } = await supabase
        .from('tenants')
        .select('*')
        .eq('owner_id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching tenant profile:', error.message);
        return;
      }

      if (data) {
        setTenant(data);
        if (data.id) localStorage.setItem('fb_tenant_id', data.id);
      } else {
        // Fallback safeguard for first-time Google OAuth signups
        const ownerName = userObj?.user_metadata?.full_name || userObj?.email?.split('@')[0] || 'Pemilik';
        const restaurantName = `Restoran ${ownerName}`;
        const slug = restaurantName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

        const { data: newTenant, error: createErr } = await supabase
          .from('tenants')
          .insert({
            name: restaurantName,
            slug: `${slug}-${Math.floor(Math.random() * 1000)}`,
            owner_id: userId,
            subscription_status: 'trialing',
            plan_type: 'starter',
          })
          .select()
          .maybeSingle();

        if (newTenant) {
          setTenant(newTenant);
          if (newTenant.id) localStorage.setItem('fb_tenant_id', newTenant.id);
        }
      }
    } catch (err) {
      console.error('Error fetching tenant profile:', err);
    } finally {
      setLoading(false);
    }
  };

  // Sign up new restaurant owner
  const signup = async (email, password, restaurantName) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) throw error;

    if (data.user) {
      // Create new tenant record
      const slug = restaurantName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const { data: newTenant, error: tenantErr } = await supabase
        .from('tenants')
        .insert({
          name: restaurantName,
          slug: `${slug}-${Math.floor(Math.random() * 1000)}`,
          owner_id: data.user.id,
          subscription_status: 'trialing',
          plan_type: 'starter',
        })
        .select()
        .single();

      if (tenantErr) {
        console.error('Error creating tenant:', tenantErr);
      } else {
        setTenant(newTenant);
        if (newTenant?.id) localStorage.setItem('fb_tenant_id', newTenant.id);
      }
    }

    return data;
  };

  // Sign in existing restaurant owner
  const login = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return data;
  };

  // Sign in with Google OAuth
  const loginWithGoogle = async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/staff`
      }
    });
    if (error) throw error;
    return data;
  };

  // Sign out
  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setTenant(null);
    localStorage.removeItem('fb_tenant_id');
  };

  return (
    <AuthContext.Provider value={{ user, tenant, loading, login, signup, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
