import { useEffect, useState } from "react";
import { completeAuth } from "../lib/myflightbook";

/** /oauth/callback — finish the PKCE exchange, then return to the app. */
export default function OAuthCallback() {
  const [message, setMessage] = useState("Completing MyFlightBook sign-in…");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    completeAuth(new URLSearchParams(window.location.search))
      .then(() => {
        setMessage("Connected. Returning to Plane States…");
        setTimeout(() => window.location.replace("/"), 800);
      })
      .catch((err: Error) => {
        setFailed(true);
        setMessage(err.message);
      });
  }, []);

  return (
    <div className="app">
      <section className="panel">
        <h2>MyFlightBook</h2>
        <p className={failed ? "notice" : "hint"}>{message}</p>
        {failed && (
          <a className="btn" href="/">
            Back to app
          </a>
        )}
      </section>
    </div>
  );
}
