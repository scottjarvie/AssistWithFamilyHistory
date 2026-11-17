import { MarketingNav } from "@/components/layout/MarketingNav";
import { Footer } from "@/components/layout/Footer";
import { HomeLanding } from "@/components/marketing/drawn/HomeLanding";
import {
  HomeTheme,
  ThemeSwitch,
} from "@/components/marketing/drawn/Interactions";
import { MOTTO } from "@/components/marketing/drawn/content";
import { createPageMetadata } from "@/lib/seo";
import "@/components/marketing/drawn/home.css";
export const metadata = createPageMetadata({
  title: "Home",
  description:
    MOTTO +
    " Keep evidence, questions and stories connected across conversations.",
  path: "/",
});
export default function HomePage() {
  return (
    <HomeTheme>
      <MarketingNav />
      <div className="fh-theme-row fh-width">
        <ThemeSwitch />
      </div>
      <HomeLanding />
      <Footer />
    </HomeTheme>
  );
}
