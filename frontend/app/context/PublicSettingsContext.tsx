"use client";
import { createContext, useContext, useEffect, useState } from "react";
import api from "@/lib/api";

interface PublicSettings {
  company_name: string;
  tagline: string;
  logo_url: string;
  email: string;
  phone: string;
  city: string;
  emirate: string;
  trn: string;
  currency_code: string;
  currency_symbol: string;
}

const defaults: PublicSettings = {
  company_name: "", tagline: "", logo_url: "",
  email: "", phone: "", city: "", emirate: "Dubai", trn: "",
  currency_code: "AED", currency_symbol: "AED",
};

const PublicSettingsContext = createContext<PublicSettings>(defaults);

export function PublicSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<PublicSettings>(defaults);

  useEffect(() => {
    api.get("/settings/")
      .then(r => setSettings({ ...defaults, ...r.data }))
      .catch(() => {});
  }, []);

  return (
    <PublicSettingsContext.Provider value={settings}>
      {children}
    </PublicSettingsContext.Provider>
  );
}

export const usePublicSettings = () => useContext(PublicSettingsContext);