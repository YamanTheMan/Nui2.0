"use client";
import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Icon, { BrandMark } from "@/components/ui-icon";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!response.ok) {
        setError(
          response.status === 401
            ? "That username and password don't match. Please try again."
            : "We couldn't sign you in just now. Please try again.",
        );
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Could not connect. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="login-page">
      <section className="login-story">
        <div className="brand">
          <BrandMark />
          <span>
            Nui 2.0<small>A LITTLE GUIDANCE. A BIG DIFFERENCE.</small>
          </span>
        </div>
        <div className="login-story-body">
          <span className="eyebrow">YOUR DIGITAL TRANSFORMATION JOURNEY</span>
          <h1>
            Big ideas.
            <br />
            <em>A little clarity.</em>
            <br />A lot of possibility.
          </h1>
          <p>
            Your course companion for connecting concepts, asking better
            questions, and finding your own way forward.
          </p>
          <div className="concept-art" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="orbit orbit-three" />
            <span className="art-center">
              n<span>✳</span>
            </span>
            <span className="concept-label concept-people">
              <i />
              People
            </span>
            <span className="concept-label concept-strategy">
              <i />
              Strategy
            </span>
            <span className="concept-label concept-technology">
              <i />
              Technology
            </span>
            <span className="art-star">✳</span>
          </div>
        </div>
        <div className="login-story-footer">
          <span>IS 67-382</span>
          <span>CARNEGIE MELLON UNIVERSITY · QATAR</span>
        </div>
      </section>
      <section className="login-form-wrap">
        <form className="login-form" onSubmit={submit}>
          <span className="eyebrow">WELCOME TO YOUR SPACE</span>
          <h2>Let&apos;s make it click.</h2>
          <p>
            Sign in with your course credentials to start a conversation with
            Nui 2.0.
          </p>
          <label htmlFor="username">
            Username
            <input
              id="username"
              name="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="Your course username"
              required
              maxLength={120}
            />
          </label>
          <label htmlFor="password">
            Password
            <input
              id="password"
              name="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              placeholder="Your course password"
              required
              maxLength={256}
            />
          </label>
          {error && (
            <p className="error-note" role="alert">
              {error}
            </p>
          )}
          <button className="button primary" type="submit" disabled={busy}>
            {busy ? "Signing you in…" : "Step inside"}
            <Icon name="arrow" size={16} />
          </button>
          <p className="login-footnote">
            Created for Digital Transformation, Strategy & Management at CMU-Q.
            Need access?{" "}
            <a href="mailto:savanid@cmu.edu">Contact your professor.</a>
          </p>
        </form>
      </section>
    </main>
  );
}
