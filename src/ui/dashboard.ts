import type { BugStatus, BugSummary } from '../types'

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function statusLabel(status: BugStatus): string {
  if (status === 'OPEN') return '🟢 Open'
  if (status === 'IN_PROGRESS') return '🛠️ In Progress'
  if (status === 'FIXED') return '✅ Fixed'
  if (status === 'DUPLICATE') return '🔁 Duplicate'
  return '⚪ Closed'
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

export function renderDashboardPage(bugs: BugSummary[], currentStatus: string, currentSort: string): string {
  const rows = bugs
    .map(
      (bug) => `
        <tr id="bug-${bug.id}">
          <td><a href="#bug-${bug.id}">🐞 #${bug.id}</a></td>
          <td>${escapeHtml(bug.title)}</td>
          <td>${statusLabel(bug.status)}</td>
          <td>${escapeHtml(renderRelationship(bug))}</td>
          <td>${bug.votes_count}</td>
          <td>${bug.duplicate_flags_count}</td>
          <td>${bug.linked_duplicates_count}</td>
          <td>${bug.regressions_count}</td>
          <td>${escapeHtml(bug.created_at)}</td>
        </tr>`
    )
    .join('')

  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Daggerbrain Feedback Dashboard</title>
      <style>
        body { font-family: sans-serif; margin: 2rem; background: #111827; color: #f9fafb; }
        table { width: 100%; border-collapse: collapse; background: #1f2937; }
        td, th { padding: 0.75rem; border-bottom: 1px solid #374151; text-align: left; vertical-align: top; }
        .controls { margin-bottom: 1rem; display: flex; gap: 1rem; }
        a { color: #93c5fd; }
      </style>
    </head>
    <body>
      <h1>Daggerbrain Feedback Dashboard</h1>
      <form class="controls" method="get" action="/dashboard">
        <label>Status
          <select name="status">
            <option value="open" ${currentStatus === 'open' ? 'selected' : ''}>Open</option>
            <option value="closed" ${currentStatus === 'closed' ? 'selected' : ''}>Closed</option>
            <option value="all" ${currentStatus === 'all' ? 'selected' : ''}>All</option>
          </select>
        </label>
        <label>Sort
          <select name="sort">
            <option value="top" ${currentSort === 'top' ? 'selected' : ''}>Top</option>
            <option value="newest" ${currentSort === 'newest' ? 'selected' : ''}>Newest</option>
          </select>
        </label>
        <button type="submit">Apply</button>
      </form>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Title</th>
            <th>Status</th>
            <th>Relationship</th>
            <th>Votes</th>
            <th>Duplicate Flags</th>
            <th>Linked Dupes</th>
            <th>Regressions</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="9">No bugs found.</td></tr>'}</tbody>
      </table>
      <p>JSON API: <a href="/api/bugs?status=${currentStatus}&sort=${currentSort}">/api/bugs</a></p>
    </body>
  </html>`
}
