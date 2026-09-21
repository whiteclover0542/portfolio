const css = await (await fetch("http://localhost:3000/style.css")).text();

const checks = {
  heroUsesTraceGrid: css.includes("background-image: radial-gradient(circle, rgba(95, 191, 138, 0.62)"),
  contactIsQuietRect: css.includes("#top-contact") && css.includes("border-radius: 4px"),
  navIsQuietRect: css.includes(".hero-nav a") && css.includes("border-radius: 4px"),
  storyUsesTraceLine: css.includes(".story-list") && css.includes("border-left: 3px solid rgba(44, 122, 85, 0.42)"),
  cardsUseEditorialEdges: css.includes(".project-card") && css.includes("border-radius: 0"),
  strengthsUseTraceRail: css.includes("article.strength") && css.includes("border-left: 3px solid rgba(95, 191, 138, 0.55)"),
  mobileHeadingFits: css.includes("font-size: clamp(2.3rem, 10.3vw, 4.1rem)"),
  heroGlowIsSubtle: css.includes("rgba(95, 191, 138, 0.1)"),
  heroDotsAreSubtle: css.includes("rgba(95, 191, 138, 0.62)"),
  labelsStayMonochrome: css.includes("#disclosure-scope .label") && css.includes("color: var(--black);"),
  strengthRailIsMuted: css.includes("border-left: 3px solid rgba(95, 191, 138, 0.55)"),
  heroBreaksBlankSpace: css.includes("min-height: min(820px, 86vh)"),
  heroHasHardEdge: css.includes("border-bottom: 1px solid rgba(255, 255, 255, 0.2)"),
  sectionTitlesHaveBlackRail: css.includes("border-left: 6px solid var(--black)"),
  statsUseHardContrast: css.includes("#hero-highlights") && css.includes("background: var(--charcoal)"),
  projectsOwnDarkCanvas: css.includes("section#projects") && css.includes("width: 100%;"),
};

const failed = Object.entries(checks).filter(([, passed]) => !passed);
if (failed.length > 0) {
  console.error("Design checks failed:", failed.map(([name]) => name).join(", "));
  process.exitCode = 1;
} else {
  console.log("Design checks passed:", Object.keys(checks).length);
}
