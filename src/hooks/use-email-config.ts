import { useEffect, useState } from "react";
import { getConfig, NO_EMAIL, type AppConfig } from "@/lib/api";

/** Whether this deployment can send email. Off until the server says otherwise. */
export function useEmailConfig(): AppConfig {
  const [config, setConfig] = useState<AppConfig>(NO_EMAIL);
  useEffect(() => {
    let active = true;
    getConfig().then((loaded) => {
      if (active) setConfig(loaded);
    });
    return () => {
      active = false;
    };
  }, []);
  return config;
}
