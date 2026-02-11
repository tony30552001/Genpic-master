import { PublicClientApplication, LogLevel } from "@azure/msal-browser";

import {
  MSAL_CLIENT_ID,
  MSAL_TENANT_ID,
  MSAL_REDIRECT_URI,
  MSAL_SCOPES,
} from "../config";

const authority = MSAL_TENANT_ID
  ? `https://login.microsoftonline.com/${MSAL_TENANT_ID}`
  : "https://login.microsoftonline.com/common";

export const msalConfig = {
  auth: {
    clientId: MSAL_CLIENT_ID,
    authority,
    redirectUri: MSAL_REDIRECT_URI,
    navigateToLoginRequestUrl: false,
  },
  cache: {
    cacheLocation: "localStorage",
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) {
          return;
        }
        switch (level) {
          case LogLevel.Error:
            console.error(message);
            return;
          case LogLevel.Info:
            console.info(message);
            return;
          case LogLevel.Verbose:
            console.debug(message);
            return;
          case LogLevel.Warning:
            console.warn(message);
            return;
        }
      },
    },
  },
};

export const loginRequest = {
  scopes: MSAL_SCOPES,
};

export const msalInstance = new PublicClientApplication(msalConfig);

// Initialize the instance (required for MSAL Browser v3)
// We use a promise to ensure initialization completes before usage in strict mode contexts if needed,
// but MsalProvider typically handles this. However, explicitly initializing helps catch errors early.
msalInstance.initialize().catch(console.error);

