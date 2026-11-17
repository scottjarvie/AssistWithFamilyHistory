import {
  Compass,
  BookOpen,
  FileText,
  Users,
  MapPin,
  Search,
  HelpCircle,
  Quote,
} from "lucide-react";
import { SafeLink } from "@/components/layout/SafeLink";
import { FeatureShowcase } from "../FeatureShowcase";
import {
  DrawingDefs,
  HeroDrawing,
  AiFigure,
  AiCord,
  ConnectDrawing,
} from "./drawings";
import { KEEPS, MOTTO } from "./content";
import { Parts, ItKeeps, IdeasButton, Faq } from "./Interactions";
const icons = [Users, FileText, Quote, HelpCircle, Search, MapPin, BookOpen];
export function HomeLanding() {
  return (
    <main className="fh-main" id="main-content">
      <DrawingDefs />
      <section className="fh-hero fh-width">
        <div>
          <h1>{MOTTO}</h1>
          <p>
            Your AI is good at helping you research family history. This site
            gives it an extended, detailed memory and additional tools.
          </p>
          <div className="fh-actions">
            <SafeLink className="fh-button" href="/app">
              Get started →
            </SafeLink>
            <SafeLink className="fh-button fh-secondary" href="#connect">
              How to connect
            </SafeLink>
          </div>
        </div>
        <HeroDrawing className="fh-hero-art" />
      </section>
      <div className="fh-width">
        <section className="fh-parts" aria-labelledby="fh-parts-heading">
          <h2 id="fh-parts-heading">
            With the right data, your AI is even more helpful
          </h2>
          <p className="fh-hint">Pick any part of family history.</p>
          <Parts />
          <ItKeeps />
        </section>
        <div className="fh-freedom-faq">
          <section className="fh-freedom" aria-labelledby="fh-freedom-heading">
            <h2 id="fh-freedom-heading">Freedom to change AI tools</h2>
            <p className="fh-pair">AI models change. Your data stays.</p>
            <p className="fh-lede">
              Try another compatible AI. The people, sources, questions and
              stories you save stay in your Assist With Family History account.
            </p>
            <figure
              className="fh-account"
              aria-label="Your AI changes. Your Assist With Family History account stays."
            >
              <div className="fh-ais">
                {(["now", "newer", "other"] as const).map((kind, i) => (
                  <div key={kind}>
                    <AiFigure kind={kind} />
                    <p>
                      {
                        [
                          "The AI you use today",
                          "A newer model",
                          "A different AI app",
                        ][i]
                      }
                    </p>
                    <AiCord kind={kind} />
                  </div>
                ))}
              </div>
              <ul className="fh-card-tabs">
                {KEEPS.map((keep, i) => {
                  const Icon = icons[i];
                  return (
                    <li key={keep.name}>
                      <Icon aria-hidden="true" />
                      {keep.name}
                    </li>
                  );
                })}
              </ul>
              <div className="fh-box">
                <Compass aria-hidden="true" />
                <p>
                  <strong>Assist With Family History</strong>
                  <span>Your account · everything you save</span>
                </p>
              </div>
            </figure>
            <ul className="fh-facts">
              <li>
                <b>Switch whenever you like.</b> Connect another compatible AI
                to the same research trail.
              </li>
              <li>
                <b>Nothing to rebuild.</b> Your records stay here between
                conversations.
              </li>
              <li>
                <b>Yours to take.</b> Download your records as JSON. Original
                media files are separate.
              </li>
            </ul>
            <details>
              <summary>You, your AI, and this site</summary>
              <p>
                <b>You</b> choose the research, accept conclusions and decide
                what to share.
              </p>
              <p>
                <b>Your AI</b> reads, compares, plans and drafts with the
                abilities its own app has.
              </p>
              <p>
                <b>This site</b> keeps what you save connected, attributed and
                available to revisit.
              </p>
            </details>
            <details>
              <summary>One record, a research trail</summary>
              <p className="fh-label">An example</p>
              <p>
                You save a census page. Your AI reads the household and proposes
                links to your people. You review the claims. Later, another AI
                can return to the same source before drafting a story.
              </p>
            </details>
            <details className="fh-status">
              <summary>Honest soft-launch status</summary>
              <FeatureShowcase />
            </details>
            <IdeasButton />
          </section>
          <Faq />
        </div>
        <section
          className="fh-connect"
          id="connect"
          aria-labelledby="fh-connect-heading"
        >
          <div>
            <h2 id="fh-connect-heading">Connect your AI</h2>
            <p>
              Each AI app connects in its own way. The connect page has the
              steps for yours.
            </p>
          </div>
          <ConnectDrawing />
          <div>
            <SafeLink className="fh-button" href="/ai">
              Find your AI’s steps →
            </SafeLink>
            <p className="fh-ai-note">
              AI reading this page? Start with <a href="/ai.txt">/ai.txt</a>.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
