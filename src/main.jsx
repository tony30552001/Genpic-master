import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { GoogleOAuthProvider } from "@react-oauth/google";
import "./index.css";
import App from "./App.jsx";
import { GOOGLE_CLIENT_ID } from "./config";
import { AuthProvider } from "./context/AuthContext";
import MotionProvider from "./components/motion/MotionProvider";

const root = createRoot(document.getElementById("root"));

root.render(
  <StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <MotionProvider>
          <App />
        </MotionProvider>
      </AuthProvider>
    </GoogleOAuthProvider>
  </StrictMode>,
);
