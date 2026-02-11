import { PublicClientApplication } from "@azure/msal-browser";

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
  },
  cache: {
    cacheLocation: "localStorage",
    storeAuthStateInCookie: false,
  },
};

export const loginRequest = {
  scopes: MSAL_SCOPES,
};

export const msalInstance = new PublicClientApplication(msalConfig);
