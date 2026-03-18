import type { BugSummary } from '../types'

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function renderDashboardPage(bugs: BugSummary[], currentStatus: string, currentSort: string): string {
  const rows = bugs
    .map(
      (bug) => `
        <tr>
          <td>#${bug.id}</td>
          <td>${escapeHtml(bug.title)}</td>
          <td>${bug.status}</td>
          <td>${bug.votes_count}</td>
          <td>${bug.duplicate_flags_count}</td>
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
        td, th { padding: 0.75rem; border-bottom: 1px solid #374151; text-align: left; }
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
            <th>Votes</th>
            <th>Duplicate Flags</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="6">No bugs found.</td></tr>'}</tbody>
      </table>
      <p>JSON API: <a href="/api/bugs?status=${currentStatus}&sort=${currentSort}">/api/bugs</a></p>
    </body>
  </html>`
}
