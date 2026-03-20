import type { BugStatus, BugSummary, FeatureStatus, FeatureSummary } from '../types'

type DashboardBugFilter = 'all' | 'open' | 'resolved'
type DashboardFeedbackFilter = 'all' | 'open' | 'resolved'

interface DashboardPageInput {
  bugs: BugSummary[]
  features: FeatureSummary[]
  currentBugFilter: DashboardBugFilter
  currentFeedbackFilter: DashboardFeedbackFilter
}

const DASHBOARD_FAVICON_HREF = 'data:image/webp;base64,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'

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function bugStatusLabel(status: BugStatus): string {
  if (status === 'IN_PROGRESS') return 'In Progress'
  if (status === 'FIXED') return 'Resolved'
  if (status === 'DUPLICATE') return 'Duplicate'
  if (status === 'CLOSED') return 'Closed'
  return 'Open'
}

function bugStatusTone(status: BugStatus): string {
  if (status === 'OPEN') return 'open'
  if (status === 'IN_PROGRESS') return 'progress'
  if (status === 'FIXED') return 'resolved'
  return 'muted'
}

function featureStatusLabel(status: FeatureStatus): string {
  if (status === 'PLANNED') return 'Planned'
  if (status === 'SHIPPED') return 'Shipped'
  if (status === 'CLOSED') return 'Resolved'
  return 'Open'
}

function featureStatusTone(status: FeatureStatus): string {
  if (status === 'OPEN') return 'open'
  if (status === 'PLANNED') return 'progress'
  if (status === 'SHIPPED' || status === 'CLOSED') return 'resolved'
  return 'muted'
}

function bugFilterBucket(status: BugStatus): 'open' | 'resolved' {
  return status === 'OPEN' || status === 'IN_PROGRESS' ? 'open' : 'resolved'
}

function featureFilterBucket(status: FeatureStatus): 'open' | 'resolved' {
  return status === 'OPEN' || status === 'PLANNED' ? 'open' : 'resolved'
}

function renderFilterButton(
  label: string,
  table: 'bugs' | 'feedback',
  value: 'all' | 'open' | 'resolved',
  active: boolean
): string {
  return `<button class="filter-chip${active ? ' filter-chip--active' : ''}" type="button" data-filter-button data-table="${table}" data-value="${value}">${escapeHtml(label)}</button>`
}

function renderActionForm(
  kind: 'bug' | 'feedback',
  id: number,
  action: 'open' | 'resolve' | 'delete',
  label: string,
  bugFilter: DashboardBugFilter,
  feedbackFilter: DashboardFeedbackFilter,
  tone: 'primary' | 'danger' = 'primary'
): string {
  return `
    <form method="post" action="/dashboard/actions">
      <input type="hidden" name="kind" value="${kind}" />
      <input type="hidden" name="id" value="${id}" />
      <input type="hidden" name="action" value="${action}" />
      <input type="hidden" name="bugStatus" value="${bugFilter}" />
      <input type="hidden" name="feedbackStatus" value="${feedbackFilter}" />
      <button class="action-button action-button--${tone}" type="submit">${escapeHtml(label)}</button>
    </form>
  `
}

function renderBugRowId(bug: BugSummary): string {
  const label = `Bug #${bug.id}`
  if (!bug.message_url) {
    return `<span class="row-id">${escapeHtml(label)}</span>`
  }

  return `<a class="row-id row-id--link" href="${escapeHtml(bug.message_url)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`
}

function renderBugRows(bugs: BugSummary[], bugFilter: DashboardBugFilter, feedbackFilter: DashboardFeedbackFilter): string {
  if (bugs.length === 0) {
    return '<tr><td colspan="4" class="empty-row">No bugs match this filter.</td></tr>'
  }

  return bugs
    .map((bug, index) => {
      const toggleAction = bug.status === 'OPEN' || bug.status === 'IN_PROGRESS' ? 'resolve' : 'open'
      const toggleLabel = toggleAction === 'resolve' ? 'Resolve' : 'Reopen'

      return `
        <tr data-sort-row data-original-index="${index}" data-status="${escapeHtml(bugStatusLabel(bug.status).toLowerCase())}" data-upvotes="${bug.votes_count}" data-filter-bucket="${bugFilterBucket(bug.status)}">
          <td>
            <div class="description-cell">
              ${renderBugRowId(bug)}
              <strong>${escapeHtml(bug.description || bug.title)}</strong>
            </div>
          </td>
          <td><span class="status-pill status-pill--${bugStatusTone(bug.status)}">${escapeHtml(bugStatusLabel(bug.status))}</span></td>
          <td>${bug.votes_count}</td>
          <td>
            <div class="actions">
              ${renderActionForm('bug', bug.id, toggleAction, toggleLabel, bugFilter, feedbackFilter)}
              ${renderActionForm('bug', bug.id, 'delete', 'Delete', bugFilter, feedbackFilter, 'danger')}
            </div>
          </td>
        </tr>
      `
    })
    .join('')
}

function renderFeatureRows(features: FeatureSummary[], bugFilter: DashboardBugFilter, feedbackFilter: DashboardFeedbackFilter): string {
  if (features.length === 0) {
    return '<tr><td colspan="4" class="empty-row">No feedback matches this filter.</td></tr>'
  }

  return features
    .map((feature, index) => {
      const toggleAction = feature.status === 'CLOSED' || feature.status === 'SHIPPED' ? 'open' : 'resolve'
      const toggleLabel = toggleAction === 'resolve' ? 'Resolve' : 'Reopen'

      return `
        <tr data-sort-row data-original-index="${index}" data-status="${escapeHtml(featureStatusLabel(feature.status).toLowerCase())}" data-upvotes="${feature.votes_count}" data-filter-bucket="${featureFilterBucket(feature.status)}">
          <td>
            <div class="description-cell">
              <span class="row-id">Feedback #${feature.id}</span>
              <strong>${escapeHtml(feature.description)}</strong>
            </div>
          </td>
          <td><span class="status-pill status-pill--${featureStatusTone(feature.status)}">${escapeHtml(featureStatusLabel(feature.status))}</span></td>
          <td>${feature.votes_count}</td>
          <td>
            <div class="actions">
              ${renderActionForm('feedback', feature.id, toggleAction, toggleLabel, bugFilter, feedbackFilter)}
              ${renderActionForm('feedback', feature.id, 'delete', 'Delete', bugFilter, feedbackFilter, 'danger')}
            </div>
          </td>
        </tr>
      `
    })
    .join('')
}

export function renderDashboardPage(input: DashboardPageInput): string {
  const { bugs, features, currentBugFilter, currentFeedbackFilter } = input

  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <link rel="icon" type="image/webp" href="${DASHBOARD_FAVICON_HREF}" />
      <title>Daggerbrain Dashboard</title>
      <style>
        :root {
          color-scheme: dark;
          --bg: #081018;
          --panel: #101c2b;
          --panel-strong: #152335;
          --line: rgba(175, 196, 219, 0.18);
          --text: #eef4fb;
          --muted: #8fa1b8;
          --accent: #58c4ff;
          --accent-strong: #2eaadc;
          --danger: #ff7b7b;
          --danger-soft: rgba(255, 123, 123, 0.14);
          --open: rgba(88, 196, 255, 0.16);
          --progress: rgba(255, 190, 92, 0.16);
          --resolved: rgba(85, 214, 144, 0.16);
          --muted-pill: rgba(160, 172, 190, 0.14);
          --radius: 22px;
          --radius-sm: 14px;
          --shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
          --font: "Aptos", "Segoe UI", sans-serif;
        }

        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          min-height: 100vh;
          font-family: var(--font);
          color: var(--text);
          background:
            radial-gradient(circle at top left, rgba(88, 196, 255, 0.12), transparent 28%),
            linear-gradient(180deg, #09111a 0%, #070d14 100%);
        }

        a {
          color: inherit;
          text-decoration: none;
        }

        code {
          font-family: "Cascadia Code", "Consolas", monospace;
        }

        input {
          display: none;
        }

        .shell {
          width: min(1320px, calc(100% - 28px));
          margin: 24px auto 40px;
        }

        .section {
          margin-top: 22px;
          padding: 22px;
          border: 1px solid var(--line);
          border-radius: var(--radius);
          background: linear-gradient(180deg, rgba(21, 35, 53, 0.96), rgba(14, 24, 37, 0.96));
          box-shadow: var(--shadow);
        }

        .section-header {
          display: flex;
          align-items: center;
          justify-content: flex-start;
          gap: 14px;
          margin-bottom: 16px;
          flex-wrap: wrap;
        }

        .section-header h2 {
          margin: 0;
          font-size: 1.35rem;
          letter-spacing: -0.04em;
        }

        .filter-row {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .filter-chip {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 38px;
          padding: 0 14px;
          border: 1px solid var(--line);
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.05);
          color: var(--muted);
          font: inherit;
          font-size: 14px;
          cursor: pointer;
          transition: border-color 140ms ease, color 140ms ease, background 140ms ease;
        }

        .filter-chip--active {
          border-color: rgba(88, 196, 255, 0.44);
          background: rgba(88, 196, 255, 0.14);
          color: var(--text);
        }

        .table-wrap {
          overflow-x: auto;
          border: 1px solid var(--line);
          border-radius: 18px;
          background: rgba(7, 13, 20, 0.46);
        }

        table {
          width: 100%;
          border-collapse: collapse;
          min-width: 760px;
        }

        th,
        td {
          padding: 15px 16px;
          border-bottom: 1px solid var(--line);
          text-align: left;
          vertical-align: middle;
        }

        th {
          color: var(--muted);
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          background: rgba(255, 255, 255, 0.03);
        }

        tbody tr:hover {
          background: rgba(255, 255, 255, 0.025);
        }

        tbody tr:last-child td {
          border-bottom: 0;
        }

        .description-cell {
          display: grid;
          gap: 6px;
          max-width: 520px;
        }

        .description-cell strong {
          font-size: 15px;
          line-height: 1.45;
          font-weight: 600;
        }

        .row-id {
          color: var(--muted);
          font-size: 12px;
        }

        .row-id--link {
          color: #a8ddff;
        }

        .row-id--link:hover {
          text-decoration: underline;
        }

        .status-pill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 32px;
          padding: 0 12px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 600;
        }

        .status-pill--open {
          background: var(--open);
          color: #8dd7ff;
        }

        .status-pill--progress {
          background: var(--progress);
          color: #ffd58a;
        }

        .status-pill--resolved {
          background: var(--resolved);
          color: #9be7b6;
        }

        .status-pill--muted {
          background: var(--muted-pill);
          color: #d2dbe6;
        }

        .actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          flex-wrap: wrap;
        }

        .action-button {
          appearance: none;
          border: 1px solid rgba(88, 196, 255, 0.28);
          border-radius: 10px;
          background: rgba(88, 196, 255, 0.12);
          color: var(--text);
          padding: 9px 12px;
          font: inherit;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }

        .action-button--danger {
          border-color: rgba(255, 123, 123, 0.3);
          background: var(--danger-soft);
          color: #ffc8c8;
        }

        .empty-row {
          color: var(--muted);
          text-align: center;
          padding: 22px;
        }

        .sort-button {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-height: 34px;
          padding: 0 10px;
          border: 1px solid rgba(255, 255, 255, 0.11);
          border-radius: 10px;
          background: rgba(0, 0, 0, 0.28);
          color: inherit;
          font: inherit;
          font-size: inherit;
          font-weight: inherit;
          letter-spacing: inherit;
          text-transform: inherit;
          cursor: pointer;
          transition: background 140ms ease, border-color 140ms ease;
        }

        .sort-button:hover {
          background: rgba(0, 0, 0, 0.36);
          border-color: rgba(255, 255, 255, 0.18);
        }

        .sort-indicator {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 12px;
          min-width: 12px;
          color: #7f92aa;
          font-size: 11px;
          letter-spacing: 0;
        }

        @media (max-width: 860px) {
          .shell {
            width: min(100% - 16px, 100%);
            margin-top: 16px;
          }

          .section {
            padding: 16px;
          }

          .section-header {
            flex-direction: column;
            align-items: flex-start;
          }
        }
      </style>
    </head>
    <body>
      <main class="shell">
        <section class="section" id="bugs">
          <div class="section-header" data-filter-section="bugs" data-initial-filter="${currentBugFilter}">
            <h2>Bugs</h2>
            <div class="filter-row">
              ${renderFilterButton('All', 'bugs', 'all', currentBugFilter === 'all')}
              ${renderFilterButton('Open', 'bugs', 'open', currentBugFilter === 'open')}
              ${renderFilterButton('Resolved', 'bugs', 'resolved', currentBugFilter === 'resolved')}
            </div>
          </div>
          <div class="table-wrap">
            <table data-sort-table="bugs">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>
                    <button class="sort-button" type="button" data-sort-header data-table="bugs" data-key="status" data-label="Status">
                      <span>Status</span>
                      <span class="sort-indicator" aria-hidden="true"></span>
                    </button>
                  </th>
                  <th>
                    <button class="sort-button" type="button" data-sort-header data-table="bugs" data-key="upvotes" data-label="Upvotes">
                      <span>Upvotes</span>
                      <span class="sort-indicator" aria-hidden="true"></span>
                    </button>
                  </th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${renderBugRows(bugs, currentBugFilter, currentFeedbackFilter)}
                <tr class="empty-row" data-filter-empty hidden><td colspan="4">No bugs match this filter.</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="section" id="feedback">
          <div class="section-header" data-filter-section="feedback" data-initial-filter="${currentFeedbackFilter}">
            <h2>Feedback</h2>
            <div class="filter-row">
              ${renderFilterButton('All', 'feedback', 'all', currentFeedbackFilter === 'all')}
              ${renderFilterButton('Open', 'feedback', 'open', currentFeedbackFilter === 'open')}
              ${renderFilterButton('Resolved', 'feedback', 'resolved', currentFeedbackFilter === 'resolved')}
            </div>
          </div>
          <div class="table-wrap">
            <table data-sort-table="feedback">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>
                    <button class="sort-button" type="button" data-sort-header data-table="feedback" data-key="status" data-label="Status">
                      <span>Status</span>
                      <span class="sort-indicator" aria-hidden="true"></span>
                    </button>
                  </th>
                  <th>
                    <button class="sort-button" type="button" data-sort-header data-table="feedback" data-key="upvotes" data-label="Upvotes">
                      <span>Upvotes</span>
                      <span class="sort-indicator" aria-hidden="true"></span>
                    </button>
                  </th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${renderFeatureRows(features, currentBugFilter, currentFeedbackFilter)}
                <tr class="empty-row" data-filter-empty hidden><td colspan="4">No feedback matches this filter.</td></tr>
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <script>
        (() => {
          const SORT_STATES = ['none', 'asc', 'desc'];
          const filterState = {
            bugs: document.querySelector('[data-filter-section="bugs"]')?.getAttribute('data-initial-filter') || 'all',
            feedback: document.querySelector('[data-filter-section="feedback"]')?.getAttribute('data-initial-filter') || 'all'
          };
          const tables = Array.from(document.querySelectorAll('[data-sort-table]'));

          const syncActionFormFilters = () => {
            const bugInputs = Array.from(document.querySelectorAll('input[name="bugStatus"]'));
            const feedbackInputs = Array.from(document.querySelectorAll('input[name="feedbackStatus"]'));

            for (const input of bugInputs) {
              input.setAttribute('value', filterState.bugs);
            }

            for (const input of feedbackInputs) {
              input.setAttribute('value', filterState.feedback);
            }
          };

          const renderFilterState = (tableName) => {
            const buttons = Array.from(document.querySelectorAll('[data-filter-button][data-table="' + tableName + '"]'));
            for (const button of buttons) {
              const active = button.getAttribute('data-value') === filterState[tableName];
              button.classList.toggle('filter-chip--active', active);
            }
          };

          for (const table of tables) {
            const tableName = table.getAttribute('data-sort-table');
            if (!tableName) continue;

            const tbody = table.querySelector('tbody');
            if (!tbody) continue;

            const rows = Array.from(tbody.querySelectorAll('[data-sort-row]'));
            const emptyRow = tbody.querySelector('[data-filter-empty]');
            const headers = Array.from(document.querySelectorAll('[data-sort-header][data-table="' + tableName + '"]'));
            const state = { key: null, direction: 'none' };

            const renderHeaderState = () => {
              for (const header of headers) {
                const key = header.getAttribute('data-key');
                const indicator = header.querySelector('.sort-indicator');
                if (!indicator) continue;

                const active = state.key === key ? state.direction : 'none';
                indicator.textContent = active === 'asc' ? '\u2191' : active === 'desc' ? '\u2193' : '';
              }
            };

            const applySort = () => {
              const sorted = [...rows];

              if (state.direction === 'none' || !state.key) {
                sorted.sort((left, right) => Number(left.getAttribute('data-original-index')) - Number(right.getAttribute('data-original-index')));
              } else if (state.key === 'status') {
                sorted.sort((left, right) => {
                  const leftValue = left.getAttribute('data-status') || '';
                  const rightValue = right.getAttribute('data-status') || '';
                  return state.direction === 'asc' ? leftValue.localeCompare(rightValue) : rightValue.localeCompare(leftValue);
                });
              } else if (state.key === 'upvotes') {
                sorted.sort((left, right) => {
                  const leftValue = Number(left.getAttribute('data-upvotes') || '0');
                  const rightValue = Number(right.getAttribute('data-upvotes') || '0');
                  return state.direction === 'asc' ? leftValue - rightValue : rightValue - leftValue;
                });
              }

              for (const row of sorted) {
                tbody.appendChild(row);
              }

              renderHeaderState();
            };

            const applyFilter = () => {
              let visibleCount = 0;
              const activeFilter = filterState[tableName];

              for (const row of rows) {
                const bucket = row.getAttribute('data-filter-bucket');
                const visible = activeFilter === 'all' || bucket === activeFilter;
                row.toggleAttribute('hidden', !visible);
                if (visible) visibleCount += 1;
              }

              if (emptyRow) {
                emptyRow.toggleAttribute('hidden', visibleCount !== 0);
              }

              renderFilterState(tableName);
              syncActionFormFilters();
            };

            for (const header of headers) {
              header.addEventListener('click', () => {
                const key = header.getAttribute('data-key');
                if (!key) return;

                if (state.key !== key) {
                  state.key = key;
                  state.direction = 'asc';
                } else {
                  const index = SORT_STATES.indexOf(state.direction);
                  state.direction = SORT_STATES[(index + 1) % SORT_STATES.length];
                  if (state.direction === 'none') {
                    state.key = null;
                  }
                }

                applySort();
              });
            }

            const filterButtons = Array.from(document.querySelectorAll('[data-filter-button][data-table="' + tableName + '"]'));
            for (const button of filterButtons) {
              button.addEventListener('click', () => {
                const value = button.getAttribute('data-value');
                if (!value) return;
                filterState[tableName] = value;
                applyFilter();
              });
            }

            applyFilter();
            renderHeaderState();
          }
        })();
      </script>
    </body>
  </html>`
}
