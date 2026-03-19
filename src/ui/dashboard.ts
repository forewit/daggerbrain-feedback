import type { BugStatus, BugSummary, FeatureStatus, FeatureSummary } from '../types'

interface DashboardPageInput {
  bugs: BugSummary[]
  allBugs: BugSummary[]
  features: FeatureSummary[]
  currentStatus: string
  currentSort: string
}

interface StatusMetric {
  label: string
  value: number
  tone: string
}

const COMMAND_CARDS = [
  {
    name: '/bug',
    detail: 'Intake flow with duplicate and regression preflight before a report goes live.',
    accent: 'signal'
  },
  {
    name: '/feedback',
    detail: 'Capture product ideas and route community voting into the feature queue.',
    accent: 'sun'
  },
  {
    name: '/topbugs',
    detail: 'Post the highest-voted active issues directly into Discord for quick pulse checks.',
    accent: 'sky'
  },
  {
    name: '/bug-status',
    detail: 'Moderator-only lifecycle control for open, in progress, fixed, closed, and duplicate states.',
    accent: 'mint'
  },
  {
    name: '/bug-link',
    detail: 'Connect duplicates and regressions so related issues roll up into the same story.',
    accent: 'rose'
  }
] as const

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function normalizeDateInput(value: string): Date | null {
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatDate(value: string): string {
  const date = normalizeDateInput(value)
  if (!date) return value

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date)
}

function statusLabel(status: BugStatus): string {
  if (status === 'OPEN') return 'Open'
  if (status === 'IN_PROGRESS') return 'In progress'
  if (status === 'FIXED') return 'Fixed'
  if (status === 'DUPLICATE') return 'Duplicate'
  return 'Closed'
}

function statusTone(status: BugStatus): string {
  if (status === 'OPEN') return 'danger'
  if (status === 'IN_PROGRESS') return 'warning'
  if (status === 'FIXED') return 'success'
  if (status === 'DUPLICATE') return 'muted'
  return 'neutral'
}

function featureStatusLabel(status: FeatureStatus): string {
  if (status === 'OPEN') return 'Open'
  if (status === 'PLANNED') return 'Planned'
  if (status === 'SHIPPED') return 'Shipped'
  return 'Closed'
}

function featureTone(status: FeatureStatus): string {
  if (status === 'OPEN') return 'sun'
  if (status === 'PLANNED') return 'sky'
  if (status === 'SHIPPED') return 'success'
  return 'muted'
}

function renderRelationship(bug: BugSummary): string {
  if (bug.relationship_type === 'DUPLICATE_OF' && bug.related_bug_id) {
    return `Duplicate of #${bug.related_bug_id}`
  }

  if (bug.relationship_type === 'REGRESSION_OF' && bug.related_bug_id) {
    return `Regression of #${bug.related_bug_id}`
  }

  return 'Standalone'
}

function countByStatus(bugs: BugSummary[], status: BugStatus): number {
  return bugs.filter((bug) => bug.status === status).length
}

function sumVotes(bugs: BugSummary[], features: FeatureSummary[]): number {
  return bugs.reduce((total, bug) => total + bug.votes_count, 0) + features.reduce((total, feature) => total + feature.votes_count, 0)
}

function createStatusMetrics(allBugs: BugSummary[]): StatusMetric[] {
  return [
    { label: 'Open', value: countByStatus(allBugs, 'OPEN'), tone: 'danger' },
    { label: 'In progress', value: countByStatus(allBugs, 'IN_PROGRESS'), tone: 'warning' },
    { label: 'Fixed', value: countByStatus(allBugs, 'FIXED'), tone: 'success' },
    { label: 'Duplicate', value: countByStatus(allBugs, 'DUPLICATE'), tone: 'muted' },
    { label: 'Closed', value: countByStatus(allBugs, 'CLOSED'), tone: 'neutral' }
  ]
}

function renderMetricCard(label: string, value: string | number, detail: string, tone: string): string {
  return `
    <article class="metric-card">
      <span class="metric-card__tone metric-card__tone--${tone}"></span>
      <span class="metric-card__label">${escapeHtml(label)}</span>
      <strong class="metric-card__value">${escapeHtml(String(value))}</strong>
      <span class="metric-card__detail">${escapeHtml(detail)}</span>
    </article>
  `
}

function renderCommandCard(command: (typeof COMMAND_CARDS)[number]): string {
  return `
    <article class="command-card command-card--${command.accent}">
      <strong>${escapeHtml(command.name)}</strong>
      <p>${escapeHtml(command.detail)}</p>
    </article>
  `
}

function renderBugCard(bug: BugSummary): string {
  const searchText = [
    `#${bug.id}`,
    bug.title,
    bug.status,
    renderRelationship(bug),
    `votes ${bug.votes_count}`,
    `duplicate flags ${bug.duplicate_flags_count}`,
    `linked duplicates ${bug.linked_duplicates_count}`,
    `regressions ${bug.regressions_count}`
  ]
    .join(' ')
    .toLowerCase()

  return `
    <article class="issue-card" id="bug-${bug.id}" data-bug-card data-search="${escapeHtml(searchText)}">
      <div class="issue-card__main">
        <div class="issue-card__heading">
          <a class="issue-card__anchor" href="#bug-${bug.id}">#${bug.id}</a>
          <span class="pill pill--${statusTone(bug.status)}">${escapeHtml(statusLabel(bug.status))}</span>
        </div>
        <h3>${escapeHtml(bug.title)}</h3>
        <p>${escapeHtml(renderRelationship(bug))}</p>
      </div>
      <dl class="issue-card__stats">
        <div>
          <dt>Votes</dt>
          <dd>${bug.votes_count}</dd>
        </div>
        <div>
          <dt>Flags</dt>
          <dd>${bug.duplicate_flags_count}</dd>
        </div>
        <div>
          <dt>Dupes</dt>
          <dd>${bug.linked_duplicates_count}</dd>
        </div>
        <div>
          <dt>Regressions</dt>
          <dd>${bug.regressions_count}</dd>
        </div>
      </dl>
      <div class="issue-card__meta">
        <span>${escapeHtml(formatDate(bug.created_at))}</span>
      </div>
    </article>
  `
}

function renderFeatureCard(feature: FeatureSummary): string {
  const thumbnail = feature.screenshot_url
    ? `<img src="${escapeHtml(feature.screenshot_url)}" alt="Preview for feature ${feature.id}" loading="lazy" />`
    : '<div class="feature-card__placeholder">Idea</div>'

  return `
    <article class="feature-card">
      <div class="feature-card__media">${thumbnail}</div>
      <div class="feature-card__body">
        <div class="feature-card__header">
          <strong>#${feature.id} ${escapeHtml(feature.title)}</strong>
          <span class="pill pill--${featureTone(feature.status)}">${escapeHtml(featureStatusLabel(feature.status))}</span>
        </div>
        <p>${escapeHtml(feature.description)}</p>
        <div class="feature-card__meta">
          <span>${feature.votes_count} votes</span>
          <span>${escapeHtml(formatDate(feature.created_at))}</span>
        </div>
      </div>
    </article>
  `
}

function renderStatusBar(metrics: StatusMetric[]): string {
  const total = metrics.reduce((sum, metric) => sum + metric.value, 0)

  return metrics
    .map((metric) => {
      const width = total === 0 ? 0 : Math.max((metric.value / total) * 100, metric.value > 0 ? 8 : 0)
      return `
        <span
          class="status-bar__segment status-bar__segment--${metric.tone}"
          style="width:${width.toFixed(2)}%"
          title="${escapeHtml(`${metric.label}: ${metric.value}`)}"
        ></span>
      `
    })
    .join('')
}

export function renderDashboardPage(input: DashboardPageInput): string {
  const { bugs, allBugs, features, currentStatus, currentSort } = input
  const statusMetrics = createStatusMetrics(allBugs)
  const leadBug = bugs[0] ?? null
  const totalOpen = countByStatus(allBugs, 'OPEN') + countByStatus(allBugs, 'IN_PROGRESS')
  const totalResolved = countByStatus(allBugs, 'FIXED') + countByStatus(allBugs, 'CLOSED')
  const totalSignals = sumVotes(allBugs, features)
  const totalRegressions = allBugs.reduce((sum, bug) => sum + bug.regressions_count, 0)
  const activeFeatureCount = features.filter((feature) => feature.status === 'OPEN' || feature.status === 'PLANNED').length
  const bugCards = bugs.map(renderBugCard).join('')
  const featureCards = features.map(renderFeatureCard).join('')
  const bugResultsLabel = `${bugs.length} ${bugs.length === 1 ? 'issue' : 'issues'}`
  const dashboardApiUrl = `/api/bugs?status=${currentStatus}&sort=${currentSort}`

  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Daggerbrain Feedback Dashboard</title>
      <style>
        :root {
          color-scheme: dark;
          --bg: #09111b;
          --bg-elevated: rgba(10, 21, 34, 0.76);
          --bg-soft: rgba(18, 33, 50, 0.88);
          --line: rgba(162, 185, 206, 0.14);
          --text: #f4f7fb;
          --muted: #8ea3b8;
          --signal: #ff7a18;
          --signal-soft: rgba(255, 122, 24, 0.18);
          --sky: #38bdf8;
          --sky-soft: rgba(56, 189, 248, 0.18);
          --mint: #34d399;
          --mint-soft: rgba(52, 211, 153, 0.18);
          --rose: #fb7185;
          --rose-soft: rgba(251, 113, 133, 0.18);
          --sun: #facc15;
          --sun-soft: rgba(250, 204, 21, 0.18);
          --neutral: rgba(143, 155, 179, 0.22);
          --radius: 24px;
          --radius-sm: 16px;
          --shadow: 0 24px 70px rgba(0, 0, 0, 0.34);
          --font: "Space Grotesk", "Aptos", "Segoe UI", sans-serif;
        }

        * {
          box-sizing: border-box;
        }

        html {
          scroll-behavior: smooth;
        }

        body {
          margin: 0;
          min-height: 100vh;
          font-family: var(--font);
          color: var(--text);
          background:
            radial-gradient(circle at top left, rgba(255, 122, 24, 0.24), transparent 28%),
            radial-gradient(circle at top right, rgba(56, 189, 248, 0.18), transparent 24%),
            radial-gradient(circle at bottom, rgba(52, 211, 153, 0.12), transparent 26%),
            linear-gradient(180deg, #08111b 0%, #091520 45%, #060d15 100%);
        }

        body::before {
          content: "";
          position: fixed;
          inset: 0;
          pointer-events: none;
          background-image:
            linear-gradient(rgba(255, 255, 255, 0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.025) 1px, transparent 1px);
          background-size: 28px 28px;
          mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.65), transparent 85%);
        }

        a {
          color: inherit;
          text-decoration: none;
        }

        img {
          display: block;
          max-width: 100%;
        }

        .shell {
          width: min(1380px, calc(100% - 32px));
          margin: 24px auto 40px;
        }

        .hero {
          position: relative;
          overflow: hidden;
          display: grid;
          grid-template-columns: minmax(0, 1.5fr) minmax(320px, 0.9fr);
          gap: 20px;
          padding: 24px;
          border: 1px solid var(--line);
          border-radius: calc(var(--radius) + 8px);
          background: linear-gradient(145deg, rgba(10, 21, 34, 0.92), rgba(9, 18, 29, 0.78));
          box-shadow: var(--shadow);
          backdrop-filter: blur(16px);
        }

        .hero::after {
          content: "";
          position: absolute;
          width: 320px;
          height: 320px;
          right: -120px;
          top: -100px;
          border-radius: 999px;
          background: radial-gradient(circle, rgba(255, 122, 24, 0.28), transparent 65%);
        }

        .hero__copy,
        .hero__spotlight {
          position: relative;
          z-index: 1;
        }

        .eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 7px 12px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.04);
          color: var(--muted);
          font-size: 12px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }

        h1 {
          margin: 16px 0 10px;
          font-size: clamp(2rem, 4vw, 3.45rem);
          line-height: 0.96;
          letter-spacing: -0.06em;
        }

        .hero__copy p {
          margin: 0;
          max-width: 60ch;
          color: var(--muted);
          font-size: 15px;
          line-height: 1.65;
        }

        .hero__links {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 18px;
        }

        .hero__links a {
          padding: 10px 14px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #dce7f3;
          font-size: 13px;
        }

        .spotlight {
          height: 100%;
          display: grid;
          gap: 16px;
          padding: 18px;
          border-radius: var(--radius);
          border: 1px solid rgba(255, 255, 255, 0.07);
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.03));
        }

        .spotlight__label {
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 0.12em;
          font-size: 12px;
        }

        .spotlight__bug {
          display: grid;
          gap: 12px;
        }

        .spotlight__bug strong {
          font-size: 22px;
          line-height: 1.15;
          letter-spacing: -0.03em;
        }

        .spotlight__bug p,
        .spotlight__empty {
          margin: 0;
          color: var(--muted);
          font-size: 14px;
          line-height: 1.6;
        }

        .spotlight__meta {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .spotlight__meta span {
          padding: 8px 12px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.05);
          color: #dce7f3;
          font-size: 13px;
        }

        .metrics {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
          margin-top: 18px;
        }

        .metric-card,
        .panel {
          border: 1px solid var(--line);
          border-radius: var(--radius);
          background: var(--bg-elevated);
          backdrop-filter: blur(14px);
        }

        .metric-card {
          position: relative;
          padding: 18px;
          overflow: hidden;
          min-height: 138px;
        }

        .metric-card__tone {
          position: absolute;
          top: 0;
          right: 0;
          width: 110px;
          height: 110px;
          border-radius: 999px;
          transform: translate(35%, -35%);
          opacity: 0.78;
        }

        .metric-card__tone--danger { background: radial-gradient(circle, rgba(251, 113, 133, 0.32), transparent 70%); }
        .metric-card__tone--warning { background: radial-gradient(circle, rgba(250, 204, 21, 0.3), transparent 70%); }
        .metric-card__tone--success { background: radial-gradient(circle, rgba(52, 211, 153, 0.28), transparent 70%); }
        .metric-card__tone--sky { background: radial-gradient(circle, rgba(56, 189, 248, 0.28), transparent 70%); }

        .metric-card__label,
        .metric-card__detail {
          display: block;
          position: relative;
          z-index: 1;
        }

        .metric-card__label {
          color: var(--muted);
          font-size: 12px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        .metric-card__value {
          position: relative;
          z-index: 1;
          display: block;
          margin-top: 20px;
          font-size: clamp(2rem, 4vw, 2.8rem);
          line-height: 0.95;
          letter-spacing: -0.08em;
        }

        .metric-card__detail {
          margin-top: 16px;
          color: #dce7f3;
          font-size: 13px;
          line-height: 1.55;
          max-width: 28ch;
        }

        .main-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.7fr) minmax(320px, 0.95fr);
          gap: 18px;
          margin-top: 18px;
        }

        .panel {
          padding: 20px;
          box-shadow: var(--shadow);
        }

        .panel__header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 18px;
        }

        .panel__header h2 {
          margin: 6px 0 0;
          font-size: 24px;
          letter-spacing: -0.05em;
        }

        .panel__header p {
          margin: 8px 0 0;
          color: var(--muted);
          font-size: 14px;
          line-height: 1.55;
          max-width: 58ch;
        }

        .pill,
        .chip {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          min-height: 34px;
          padding: 7px 12px;
          border-radius: 999px;
          font-size: 12px;
          letter-spacing: 0.02em;
          border: 1px solid transparent;
          white-space: nowrap;
        }

        .pill--danger { background: rgba(251, 113, 133, 0.14); color: #ffc1cd; }
        .pill--warning { background: rgba(250, 204, 21, 0.16); color: #ffe690; }
        .pill--success { background: rgba(52, 211, 153, 0.16); color: #aef0d6; }
        .pill--muted { background: rgba(148, 163, 184, 0.14); color: #d4dce7; }
        .pill--neutral { background: rgba(125, 211, 252, 0.14); color: #bae6fd; }
        .pill--sun { background: var(--sun-soft); color: #fde68a; }
        .pill--sky { background: var(--sky-soft); color: #bae6fd; }

        .controls {
          display: grid;
          gap: 14px;
          margin-bottom: 18px;
        }

        .controls__bar {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          align-items: center;
        }

        .control-group,
        .search {
          border: 1px solid var(--line);
          border-radius: var(--radius-sm);
          background: var(--bg-soft);
        }

        .control-group {
          display: flex;
          gap: 12px;
          padding: 10px 12px;
          flex-wrap: wrap;
        }

        label {
          display: grid;
          gap: 6px;
          color: var(--muted);
          font-size: 12px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        select,
        .search input {
          min-width: 140px;
          padding: 11px 12px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          background: rgba(6, 13, 21, 0.78);
          color: var(--text);
          font: inherit;
        }

        .search {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 0 14px;
        }

        .search span {
          color: var(--muted);
          font-size: 13px;
          white-space: nowrap;
        }

        .search input {
          width: 100%;
          min-width: 0;
          border: 0;
          background: transparent;
          padding-inline: 0;
        }

        button {
          appearance: none;
          border: 0;
          border-radius: 999px;
          padding: 12px 16px;
          font: inherit;
          font-weight: 600;
          color: #08111b;
          background: linear-gradient(135deg, #facc15, #ff7a18);
          cursor: pointer;
        }

        .issue-grid,
        .stack {
          display: grid;
          gap: 12px;
        }

        .issue-card {
          display: grid;
          grid-template-columns: minmax(0, 1.55fr) minmax(190px, 0.9fr) auto;
          gap: 18px;
          align-items: center;
          padding: 16px 18px;
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 20px;
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.045), rgba(255, 255, 255, 0.02)),
            rgba(7, 15, 24, 0.88);
          transition: transform 180ms ease, border-color 180ms ease, background 180ms ease;
        }

        .issue-card:hover {
          transform: translateY(-2px);
          border-color: rgba(255, 122, 24, 0.35);
          background:
            linear-gradient(180deg, rgba(255, 122, 24, 0.08), rgba(255, 255, 255, 0.02)),
            rgba(7, 15, 24, 0.92);
        }

        .issue-card__heading,
        .feature-card__header,
        .feature-card__meta,
        .legend,
        .panel__links {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          align-items: center;
        }

        .issue-card__anchor {
          color: #ffd59a;
          font-weight: 600;
        }

        .issue-card h3 {
          margin: 8px 0 6px;
          font-size: 18px;
          letter-spacing: -0.04em;
          line-height: 1.2;
        }

        .issue-card p,
        .feature-card p,
        .empty-state p {
          margin: 0;
          color: var(--muted);
          font-size: 14px;
          line-height: 1.55;
        }

        .issue-card__stats {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px 14px;
          margin: 0;
        }

        .issue-card__stats div {
          padding: 10px 12px;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.04);
        }

        .issue-card__stats dt {
          color: var(--muted);
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .issue-card__stats dd {
          margin: 6px 0 0;
          font-size: 18px;
          font-weight: 600;
        }

        .issue-card__meta {
          color: var(--muted);
          font-size: 13px;
          justify-self: end;
          text-align: right;
        }

        .empty-state {
          padding: 24px;
          border: 1px dashed rgba(255, 255, 255, 0.12);
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.03);
        }

        .empty-state strong {
          display: block;
          margin-bottom: 8px;
          font-size: 16px;
        }

        .command-card {
          padding: 16px;
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.04);
        }

        .command-card strong {
          display: inline-flex;
          margin-bottom: 10px;
          font-size: 17px;
          letter-spacing: -0.04em;
        }

        .command-card p {
          margin: 0;
          color: var(--muted);
          font-size: 14px;
          line-height: 1.55;
        }

        .command-card--signal { box-shadow: inset 0 0 0 1px rgba(255, 122, 24, 0.18); }
        .command-card--sun { box-shadow: inset 0 0 0 1px rgba(250, 204, 21, 0.18); }
        .command-card--sky { box-shadow: inset 0 0 0 1px rgba(56, 189, 248, 0.18); }
        .command-card--mint { box-shadow: inset 0 0 0 1px rgba(52, 211, 153, 0.18); }
        .command-card--rose { box-shadow: inset 0 0 0 1px rgba(251, 113, 133, 0.18); }

        .feature-card {
          display: grid;
          grid-template-columns: 84px minmax(0, 1fr);
          gap: 14px;
          padding: 14px;
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.035);
        }

        .feature-card__media {
          width: 84px;
          height: 84px;
          border-radius: 16px;
          overflow: hidden;
          background: linear-gradient(135deg, rgba(56, 189, 248, 0.22), rgba(255, 122, 24, 0.22));
        }

        .feature-card__media img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .feature-card__placeholder {
          display: grid;
          place-items: center;
          width: 100%;
          height: 100%;
          font-size: 13px;
          text-transform: uppercase;
          letter-spacing: 0.14em;
          color: #edf5ff;
        }

        .feature-card__header strong {
          flex: 1;
          min-width: 0;
          font-size: 16px;
          line-height: 1.25;
          letter-spacing: -0.03em;
        }

        .feature-card__meta {
          margin-top: 12px;
          color: var(--muted);
          font-size: 12px;
        }

        .status-bar {
          display: flex;
          height: 16px;
          overflow: hidden;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.06);
          margin-bottom: 14px;
        }

        .status-bar__segment--danger { background: linear-gradient(90deg, #fb7185, #f43f5e); }
        .status-bar__segment--warning { background: linear-gradient(90deg, #facc15, #f59e0b); }
        .status-bar__segment--success { background: linear-gradient(90deg, #34d399, #10b981); }
        .status-bar__segment--muted { background: linear-gradient(90deg, #94a3b8, #64748b); }
        .status-bar__segment--neutral { background: linear-gradient(90deg, #38bdf8, #0ea5e9); }

        .legend {
          row-gap: 8px;
        }

        .legend__item {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: var(--muted);
          font-size: 13px;
        }

        .legend__dot {
          width: 10px;
          height: 10px;
          border-radius: 999px;
        }

        .legend__dot--danger { background: #fb7185; }
        .legend__dot--warning { background: #facc15; }
        .legend__dot--success { background: #34d399; }
        .legend__dot--muted { background: #94a3b8; }
        .legend__dot--neutral { background: #38bdf8; }

        .panel__links {
          margin-top: 16px;
        }

        .chip {
          background: rgba(255, 255, 255, 0.04);
          border-color: rgba(255, 255, 255, 0.08);
          color: #dce7f3;
        }

        [hidden] {
          display: none !important;
        }

        @media (max-width: 1120px) {
          .hero,
          .main-grid {
            grid-template-columns: 1fr;
          }

          .metrics {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 760px) {
          .shell {
            width: min(100% - 20px, 100%);
            margin: 12px auto 28px;
          }

          .hero,
          .panel {
            padding: 18px;
          }

          .metrics {
            grid-template-columns: 1fr;
          }

          .issue-card {
            grid-template-columns: 1fr;
          }

          .issue-card__meta {
            justify-self: start;
            text-align: left;
          }

          .controls__bar,
          .control-group {
            flex-direction: column;
            align-items: stretch;
          }

          .feature-card {
            grid-template-columns: 1fr;
          }

          .feature-card__media {
            width: 100%;
            height: 180px;
          }
        }
      </style>
    </head>
    <body>
      <main class="shell">
        <section class="hero">
          <div class="hero__copy">
            <span class="eyebrow">Discord feedback command center</span>
            <h1>Compact signal for bugs, feedback, and triage momentum.</h1>
            <p>
              A tighter view across slash-command intake, duplicate pressure, regressions, and the feature queue.
              Filter the live bug list, scan what is heating up, and keep the moderation workflow close at hand.
            </p>
            <div class="hero__links">
              <a href="#priority">Priority queue</a>
              <a href="#workflow">Slash command flows</a>
              <a href="#features">Feature radar</a>
              <a href="${dashboardApiUrl}">JSON feed</a>
            </div>
          </div>
          <div class="hero__spotlight">
            <div class="spotlight">
              <span class="spotlight__label">Current hotspot</span>
              ${
                leadBug
                  ? `<div class="spotlight__bug">
                      <strong>#${leadBug.id} ${escapeHtml(leadBug.title)}</strong>
                      <p>${escapeHtml(renderRelationship(leadBug))}</p>
                      <div class="spotlight__meta">
                        <span>${escapeHtml(statusLabel(leadBug.status))}</span>
                        <span>${leadBug.votes_count} votes</span>
                        <span>${leadBug.regressions_count} regressions</span>
                        <span>${escapeHtml(formatDate(leadBug.created_at))}</span>
                      </div>
                    </div>`
                  : '<p class="spotlight__empty">No issues match the current filters yet. Adjust the view to explore the full queue.</p>'
              }
            </div>
          </div>
        </section>

        <section class="metrics" aria-label="Dashboard summary">
          ${renderMetricCard('Active bugs', totalOpen, 'Open plus in-progress issues currently competing for attention.', 'danger')}
          ${renderMetricCard('Resolved', totalResolved, 'Fixed and closed items that have made it out of the active queue.', 'success')}
          ${renderMetricCard('Community signal', totalSignals, 'Combined bug votes and feature votes flowing through Discord.', 'sky')}
          ${renderMetricCard('Regression pressure', totalRegressions, `${activeFeatureCount} feature requests are active or planned alongside bug work.`, 'warning')}
        </section>

        <section class="main-grid">
          <div class="stack">
            <section class="panel" id="priority">
              <div class="panel__header">
                <div>
                  <span class="eyebrow">Priority queue</span>
                  <h2>Live bug board</h2>
                  <p>Dense cards keep title, state, relationship, and signal in one scanline without losing the story behind each issue.</p>
                </div>
                <span class="chip" data-bug-results>${escapeHtml(bugResultsLabel)}</span>
              </div>

              <div class="controls">
                <form class="controls__bar" method="get" action="/dashboard">
                  <div class="control-group">
                    <label>
                      Status
                      <select name="status">
                        <option value="open" ${currentStatus === 'open' ? 'selected' : ''}>Open queue</option>
                        <option value="closed" ${currentStatus === 'closed' ? 'selected' : ''}>Closed queue</option>
                        <option value="all" ${currentStatus === 'all' ? 'selected' : ''}>Everything</option>
                      </select>
                    </label>
                    <label>
                      Sort
                      <select name="sort">
                        <option value="top" ${currentSort === 'top' ? 'selected' : ''}>Top voted</option>
                        <option value="newest" ${currentSort === 'newest' ? 'selected' : ''}>Newest first</option>
                      </select>
                    </label>
                  </div>
                  <button type="submit">Apply view</button>
                </form>

                <label class="search">
                  <span>Search issues</span>
                  <input type="search" placeholder="Title, status, relationship, bug id..." data-dashboard-search />
                </label>
              </div>

              <div class="issue-grid" data-bug-grid>
                ${bugCards || ''}
              </div>

              <div class="empty-state" ${bugs.length === 0 ? '' : 'hidden'} data-server-empty>
                <strong>No bugs match this view.</strong>
                <p>Try switching status or sort to bring more of the queue into focus.</p>
              </div>

              <div class="empty-state" hidden data-search-empty>
                <strong>No issues match your search.</strong>
                <p>Try a broader title fragment, status, or relationship keyword.</p>
              </div>
            </section>
          </div>

          <aside class="stack">
            <section class="panel" id="workflow">
              <div class="panel__header">
                <div>
                  <span class="eyebrow">Workflow map</span>
                  <h2>Slash command flows</h2>
                  <p>The dashboard now reflects the same paths people use in Discord, from first report to moderator triage.</p>
                </div>
              </div>
              <div class="stack">
                ${COMMAND_CARDS.map(renderCommandCard).join('')}
              </div>
            </section>

            <section class="panel">
              <div class="panel__header">
                <div>
                  <span class="eyebrow">Status mix</span>
                  <h2>Queue health</h2>
                  <p>A quick read on how the bug inventory is distributed across the lifecycle.</p>
                </div>
              </div>
              <div class="status-bar" aria-hidden="true">
                ${renderStatusBar(statusMetrics)}
              </div>
              <div class="legend">
                ${statusMetrics
                  .map(
                    (metric) => `
                      <span class="legend__item">
                        <span class="legend__dot legend__dot--${metric.tone}"></span>
                        ${escapeHtml(metric.label)} ${metric.value}
                      </span>
                    `
                  )
                  .join('')}
              </div>
              <div class="panel__links">
                <a class="chip" href="${dashboardApiUrl}">Current bug JSON</a>
                <a class="chip" href="/">Service health</a>
              </div>
            </section>

            <section class="panel" id="features">
              <div class="panel__header">
                <div>
                  <span class="eyebrow">Feature radar</span>
                  <h2>Requests with momentum</h2>
                  <p>Top-voted feedback is visible next to bugs now, so roadmap signal is no longer hidden behind the Discord feed.</p>
                </div>
              </div>
              <div class="stack">
                ${
                  featureCards ||
                  `<div class="empty-state">
                    <strong>No feature requests yet.</strong>
                    <p>New ideas submitted through <code>/feedback</code> will appear here once they land in the queue.</p>
                  </div>`
                }
              </div>
            </section>
          </aside>
        </section>
      </main>

      <script>
        (() => {
          const searchInput = document.querySelector('[data-dashboard-search]');
          const cards = Array.from(document.querySelectorAll('[data-bug-card]'));
          const results = document.querySelector('[data-bug-results]');
          const serverEmpty = document.querySelector('[data-server-empty]');
          const searchEmpty = document.querySelector('[data-search-empty]');

          if (!(searchInput instanceof HTMLInputElement) || !results || !searchEmpty) {
            return;
          }

          const update = () => {
            const query = searchInput.value.trim().toLowerCase();
            let visible = 0;

            for (const card of cards) {
              const haystack = (card.getAttribute('data-search') || '').toLowerCase();
              const match = !query || haystack.includes(query);
              card.toggleAttribute('hidden', !match);
              if (match) visible += 1;
            }

            results.textContent = visible + ' ' + (visible === 1 ? 'issue' : 'issues');
            searchEmpty.toggleAttribute('hidden', visible !== 0 || query.length === 0);

            if (serverEmpty) {
              serverEmpty.toggleAttribute('hidden', cards.length !== 0 || query.length > 0);
            }
          };

          searchInput.addEventListener('input', update);
          update();
        })();
      </script>
    </body>
  </html>`
}
