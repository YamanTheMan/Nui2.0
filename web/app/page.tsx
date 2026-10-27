"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import ChatPanel from "@/components/chat-panel";
import CitationsPanel, {
  citationKey,
  type Citation,
} from "@/components/citations-panel";
import CourseLibrary from "@/components/course-library";
import Dialog from "@/components/dialog";
import Icon, { BrandMark } from "@/components/ui-icon";
import LiveAvatarPanel from "@/components/live-avatar-panel";
import ProfilePanel from "@/components/profile-panel";
import { firstName } from "@/lib/student/profile";
import { COURSE_MATERIALS } from "@/lib/course-catalog";
import {
  getServerSnapshot,
  getSnapshot,
  saveProfile,
  subscribe,
} from "@/lib/student/profile-store";

type View = "chat" | "library" | "live";
const MOBILE_VIEWPORT = "(max-width: 720px)";
function subscribeToViewport(onChange: () => void) {
  const media = window.matchMedia(MOBILE_VIEWPORT);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
const mobileSnapshot = () => window.matchMedia(MOBILE_VIEWPORT).matches;
const desktopSnapshot = () => false;

export default function Home() {
  const router = useRouter();
  const profile = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const isMobile = useSyncExternalStore(
    subscribeToViewport,
    mobileSnapshot,
    desktopSnapshot,
  );
  const [view, setView] = useState<View>("chat");
  const [chatCitations, setChatCitations] = useState<Citation[]>([]);
  const [liveCitations, setLiveCitations] = useState<Citation[]>([]);
  const [dialog, setDialog] = useState<"profile" | "sources" | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [chatKey, setChatKey] = useState(0);
  const [input, setInput] = useState("");
  const [logoutError, setLogoutError] = useState("");
  const sidebarRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerOpen = isMobile && mobileNav;
  const citations = view === "live" ? liveCitations : chatCitations;
  const addCitation = useCallback((citation: Citation) => {
    setLiveCitations((current) =>
      current.some((c) => citationKey(c) === citationKey(citation))
        ? current
        : [citation, ...current].slice(0, 20),
    );
  }, []);
  useEffect(() => {
    if (!drawerOpen) return;
    const sidebar = sidebarRef.current;
    const trigger = menuButtonRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sidebar?.querySelector<HTMLButtonElement>(".sidebar-close")?.focus();
    const handleKey = (event: KeyboardEvent) => {
      // A native profile dialog can be opened above the navigation drawer.
      if (document.querySelector("dialog[open]")) return;
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileNav(false);
      } else if (event.key === "Tab" && sidebar) {
        const focusable = [
          ...sidebar.querySelectorAll<HTMLElement>(
            'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ].filter((element) => element.getClientRects().length > 0);
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last ||
            !sidebar.contains(document.activeElement))
        ) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
      if (
        window.matchMedia(MOBILE_VIEWPORT).matches &&
        !document.querySelector("dialog[open]")
      )
        trigger?.focus();
    };
  }, [drawerOpen]);
  const changeView = (next: View) => {
    setView(next);
    setMobileNav(false);
  };
  const resetChat = () => {
    setChatKey((key) => key + 1);
    setInput("");
    setChatCitations([]);
    changeView("chat");
  };
  const ask = (prompt: string) => {
    setInput(prompt);
    changeView("chat");
  };
  const logout = async () => {
    setLogoutError("");
    try {
      const response = await fetch("/api/logout", { method: "POST" });
      if (!response.ok) throw new Error();
      router.replace("/login");
      router.refresh();
    } catch {
      setLogoutError("Could not sign out. Please try again.");
    }
  };
  const name = firstName(profile.name);
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content" inert={drawerOpen}>
        Skip to content
      </a>
      {drawerOpen && (
        <button
          className="sidebar-scrim"
          onClick={() => setMobileNav(false)}
          tabIndex={-1}
          aria-label="Close navigation"
        />
      )}
      <aside
        ref={sidebarRef}
        id="workspace-navigation"
        className={`sidebar ${drawerOpen ? "sidebar-open" : ""}`}
        inert={isMobile && !drawerOpen}
        role={drawerOpen ? "dialog" : undefined}
        aria-modal={drawerOpen || undefined}
        aria-label="Workspace navigation"
      >
        <button
          className="icon-button sidebar-close"
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        >
          <Icon name="close" />
        </button>
        <button
          className="brand"
          onClick={() => changeView("chat")}
          aria-label="Nui 2.0 home"
        >
          <BrandMark />
          <span>
            Nui 2.0
          </span>
        </button>
        <div className="sidebar-course">
          <span className="course-code">IS 67-382</span>
          <p>
            Digital Transformation,
            <br />
            Strategy & Management
          </p>
          <span className="campus-label">
            <span /> CARNEGIE MELLON · QATAR
          </span>
        </div>
        <button className="new-chat-button" onClick={resetChat}>
          <Icon name="plus" size={18} /> New conversation <span>↗</span>
        </button>
        <div className="nav-label">YOUR WORKSPACE</div>
        <nav aria-label="Main navigation">
          <button
            className={`nav-item ${view === "chat" ? "active" : ""}`}
            aria-current={view === "chat" ? "page" : undefined}
            onClick={() => changeView("chat")}
          >
            <Icon name="chat" />
            Ask Nui 2.0
            <span className="nav-dot" />
          </button>
          <button
            className={`nav-item ${view === "library" ? "active" : ""}`}
            aria-current={view === "library" ? "page" : undefined}
            onClick={() => changeView("library")}
          >
            <Icon name="book" />
            Course library<span className="nav-count">{COURSE_MATERIALS.length}</span>
          </button>
          <button
            className={`nav-item ${view === "live" ? "active" : ""}`}
            aria-current={view === "live" ? "page" : undefined}
            onClick={() => changeView("live")}
          >
            <Icon name="voice" />
            Live conversation
          </button>
        </nav>
        <div className="sidebar-bottom">
          <button
            className="profile-trigger"
            onClick={() => setDialog("profile")}
          >
            <span className="user-avatar">
              {name ? name[0].toUpperCase() : <Icon name="user" size={18} />}
            </span>
            <span>
              {name || "Your space"}
              <small>{profile.major || "Make it personal"}</small>
            </span>
            <Icon name="chevron" size={15} />
          </button>
        </div>
      </aside>
      <div className="workspace" inert={drawerOpen}>
        <header className="topbar">
          <div className="topbar-left">
            <button
              ref={menuButtonRef}
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              aria-controls="workspace-navigation"
              aria-expanded={drawerOpen}
              onClick={() => setMobileNav(!mobileNav)}
            >
              <Icon name="menu" />
            </button>
            <span className="breadcrumb">
              Your workspace <span>/</span>{" "}
              <strong>
                {view === "chat"
                  ? "Ask Nui 2.0"
                  : view === "library"
                    ? "Course library"
                    : "Live conversation"}
              </strong>
            </span>
          </div>
          <div className="topbar-actions">
            <button
              className="icon-button logout-button"
              title="Sign out"
              aria-label="Sign out"
              onClick={() => void logout()}
            >
              <Icon name="logout" size={18} />
            </button>
          </div>
        </header>
        {logoutError && (
          <p className="error-note" role="alert">
            {logoutError}
          </p>
        )}
        <main id="main-content" className="main-content">
          <div hidden={view !== "chat"}>
            <ChatPanel
              key={chatKey}
              profile={profile}
              input={input}
              setInput={setInput}
              onReset={resetChat}
              onSources={setChatCitations}
              onShowSources={() => setDialog("sources")}
              onLibrary={() => changeView("library")}
            />
          </div>
          {view === "library" && <CourseLibrary onAsk={ask} />}
          {view === "live" && (
            <section className="live-view view-enter">
              <span className="eyebrow">LET&apos;S TALK IT THROUGH</span>
              <h1>A conversation, naturally.</h1>
              <p className="view-description">
                Bring your questions. Talk to the Prof Nui avatar and explore
                the ideas together.
              </p>
              <LiveAvatarPanel profile={profile} onCitation={addCitation} />
              <button
                className="text-button live-sources-button"
                onClick={() => setDialog("sources")}
              >
                <Icon name="book" size={16} /> View conversation sources{" "}
                {citations.length > 0 && `(${citations.length})`}
              </button>
            </section>
          )}
        </main>
        <footer className="workspace-footer">
          <span>
            AI guidance. Confirm important details with Prof Nui.
          </span>
          <a href="mailto:savanid@cmu.edu">
            Contact your professor <Icon name="external" size={12} />
          </a>
        </footer>
      </div>
      {dialog === "profile" && (
        <Dialog title="Your profile" onClose={() => setDialog(null)}>
          <ProfilePanel profile={profile} onSave={saveProfile} />
        </Dialog>
      )}
      {dialog === "sources" && (
        <Dialog
          title="Course material consulted"
          onClose={() => setDialog(null)}
          wide
        >
          <CitationsPanel citations={citations} />
        </Dialog>
      )}
    </div>
  );
}
