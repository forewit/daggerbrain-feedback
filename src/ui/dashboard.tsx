import type { ComponentProps, ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Bug, MessagesSquare } from 'lucide-react'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { cn } from '../lib/utils'
import type { BugStatus, BugSummary, FeatureStatus, FeatureSummary } from '../types'
import { dashboardFaviconHref, dashboardStyles } from './generated-assets'

type DashboardBugFilter = 'all' | 'open' | 'resolved'
type DashboardSuggestionFilter = 'all' | 'open' | 'resolved'
type DashboardTable = 'bugs' | 'suggestions'

interface DashboardPageInput {
  bugs: BugSummary[]
  features: FeatureSummary[]
  currentBugFilter: DashboardBugFilter
  currentSuggestionFilter: DashboardSuggestionFilter
  canManage?: boolean
  authUrl?: string | null
  logoutUrl?: string | null
}

const dashboardClientScript = String.raw`
(() => {
  const SORT_STATES = ['none', 'asc', 'desc'];
  const filterState = {
    bugs: document.querySelector('[data-filter-section="bugs"]')?.getAttribute('data-initial-filter') || 'all',
    suggestions: document.querySelector('[data-filter-section="suggestions"]')?.getAttribute('data-initial-filter') || 'all'
  };
  const tables = Array.from(document.querySelectorAll('[data-sort-table]'));

  const syncActionFormFilters = () => {
    const bugInputs = Array.from(document.querySelectorAll('input[name="bugStatus"]'));
    const suggestionInputs = Array.from(document.querySelectorAll('input[name="suggestionStatus"]'));

    for (const input of bugInputs) {
      input.value = filterState.bugs;
    }

    for (const input of suggestionInputs) {
      input.value = filterState.suggestions;
    }
  };

  const renderFilterState = (tableName) => {
    const buttons = Array.from(document.querySelectorAll('[data-filter-button][data-table="' + tableName + '"]'));
    for (const button of buttons) {
      const active = button.getAttribute('data-value') === filterState[tableName];
      button.dataset.active = active ? 'true' : 'false';
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
        const indicator = header.querySelector('[data-sort-indicator]');
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
        row.hidden = !visible;
        if (visible) visibleCount += 1;
      }

      if (emptyRow) {
        emptyRow.hidden = visibleCount !== 0;
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
`

function bugStatusLabel(status: BugStatus): string {
  if (status === 'ACKNOWLEDGED') return 'Acknowledged'
  if (status === 'IN_PROGRESS') return 'In Progress'
  if (status === 'FIXED') return 'Resolved'
  if (status === 'DUPLICATE') return 'Duplicate'
  if (status === 'CLOSED') return 'Closed'
  return 'Open'
}

function bugStatusTone(status: BugStatus): ComponentProps<typeof Badge>['variant'] {
  if (status === 'OPEN') return 'open'
  if (status === 'ACKNOWLEDGED') return 'progress'
  if (status === 'IN_PROGRESS') return 'progress'
  if (status === 'FIXED') return 'resolved'
  return 'muted'
}

function featureStatusLabel(status: FeatureStatus): string {
  if (status === 'UNDER_REVIEW') return 'Under Review'
  if (status === 'PLANNED') return 'Planned'
  if (status === 'IN_PROGRESS') return 'In Progress'
  if (status === 'SHIPPED') return 'Shipped'
  if (status === 'DECLINED') return 'Declined'
  if (status === 'CLOSED') return 'Resolved'
  return 'Open'
}

function featureStatusTone(status: FeatureStatus): ComponentProps<typeof Badge>['variant'] {
  if (status === 'OPEN') return 'open'
  if (status === 'UNDER_REVIEW' || status === 'PLANNED' || status === 'IN_PROGRESS') return 'progress'
  if (status === 'SHIPPED' || status === 'CLOSED') return 'resolved'
  return 'muted'
}

function bugFilterBucket(status: BugStatus): 'open' | 'resolved' {
  return status === 'OPEN' || status === 'ACKNOWLEDGED' || status === 'IN_PROGRESS' ? 'open' : 'resolved'
}

function featureFilterBucket(status: FeatureStatus): 'open' | 'resolved' {
  return status === 'OPEN' || status === 'UNDER_REVIEW' || status === 'PLANNED' || status === 'IN_PROGRESS' ? 'open' : 'resolved'
}

function SortHeader({ table, column, label }: { table: DashboardTable; column: 'status' | 'upvotes'; label: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-8 gap-2 rounded-[10px] border-border/80 bg-card/90 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground shadow-none hover:bg-accent/70"
      data-sort-header
      data-table={table}
      data-key={column}
    >
      <span>{label}</span>
      <span data-sort-indicator aria-hidden="true" className="inline-flex min-w-3 justify-center text-[11px] text-muted-foreground" />
    </Button>
  )
}

function FilterButton({
  table,
  value,
  label,
  active
}: {
  table: DashboardTable
  value: 'all' | 'open' | 'resolved'
  label: string
  active: boolean
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-8 rounded-full border-border/75 bg-card/70 px-3 text-[12px] font-medium text-muted-foreground shadow-none hover:bg-accent/70 data-[active=true]:border-primary/45 data-[active=true]:bg-primary/18 data-[active=true]:text-foreground"
      data-filter-button
      data-table={table}
      data-value={value}
      data-active={active ? 'true' : 'false'}
    >
      {label}
    </Button>
  )
}

function StatusBadge({ tone, children }: { tone: ComponentProps<typeof Badge>['variant']; children: ReactNode }) {
  return (
    <Badge variant={tone} className="min-w-24 justify-center rounded-full px-3 py-1">
      {children}
    </Badge>
  )
}

function ActionForm({
  kind,
  id,
  action,
  label,
  bugFilter,
  suggestionFilter,
  tone = 'primary'
}: {
  kind: 'bug' | 'suggestion'
  id: number
  action: 'open' | 'resolve' | 'delete'
  label: string
  bugFilter: DashboardBugFilter
  suggestionFilter: DashboardSuggestionFilter
  tone?: 'primary' | 'danger'
}) {
  return (
    <form method="post" action="/dashboard/actions">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={String(id)} />
      <input type="hidden" name="action" value={action} />
      <input type="hidden" name="bugStatus" value={bugFilter} />
      <input type="hidden" name="suggestionStatus" value={suggestionFilter} />
      <Button
        type="submit"
        size="sm"
        variant={tone === 'danger' ? 'destructive' : 'secondary'}
        className={cn(
          'h-8 rounded-[10px] px-3 text-xs font-semibold shadow-none',
          tone === 'danger'
            ? 'bg-destructive/16 text-red-200 hover:bg-destructive/24'
            : 'bg-secondary/90 text-foreground hover:bg-secondary/70'
        )}
      >
        {label}
      </Button>
    </form>
  )
}

function ItemMetaLink({ label, href }: { label: string; href?: string | null }) {
  if (!href) {
    return <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">{label}</span>
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-[11px] font-medium uppercase tracking-[0.16em] text-sky-200 transition-colors hover:text-sky-100 hover:underline"
    >
      {label}
    </a>
  )
}

function BugRows({
  bugs,
  bugFilter,
  suggestionFilter,
  canManage
}: {
  bugs: BugSummary[]
  bugFilter: DashboardBugFilter
  suggestionFilter: DashboardSuggestionFilter
  canManage: boolean
}) {
  if (bugs.length === 0) {
    return (
      <TableRow>
        <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
          No bugs match this filter.
        </TableCell>
      </TableRow>
    )
  }

  return (
    <>
      {bugs.map((bug, index) => {
        const toggleAction = bug.status === 'OPEN' || bug.status === 'IN_PROGRESS' ? 'resolve' : 'open'
        const toggleLabel = toggleAction === 'resolve' ? 'Resolve' : 'Reopen'

        return (
          <TableRow
            key={`bug-${bug.id}`}
            data-sort-row
            data-original-index={String(index)}
            data-status={bugStatusLabel(bug.status).toLowerCase()}
            data-upvotes={String(bug.votes_count)}
            data-filter-bucket={bugFilterBucket(bug.status)}
          >
            <TableCell className="w-[54%]">
              <div className="grid max-w-[42rem] gap-2">
                <ItemMetaLink label={`Bug #${bug.id}`} href={bug.message_url} />
                <div className="text-[15px] font-semibold leading-6 text-foreground">{bug.description || bug.title}</div>
              </div>
            </TableCell>
            <TableCell className="w-[16%]">
              <StatusBadge tone={bugStatusTone(bug.status)}>{bugStatusLabel(bug.status)}</StatusBadge>
            </TableCell>
            <TableCell className="w-[10%] text-sm font-semibold text-foreground">{bug.votes_count}</TableCell>
            <TableCell className="w-[20%]">
              {canManage ? (
                <div className="flex flex-wrap justify-end gap-2">
                  <ActionForm kind="bug" id={bug.id} action={toggleAction} label={toggleLabel} bugFilter={bugFilter} suggestionFilter={suggestionFilter} />
                  <ActionForm
                    kind="bug"
                    id={bug.id}
                    action="delete"
                    label="Delete"
                    bugFilter={bugFilter}
                    suggestionFilter={suggestionFilter}
                    tone="danger"
                  />
                </div>
              ) : (
                <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Read Only</span>
              )}
            </TableCell>
          </TableRow>
        )
      })}
      <tr data-filter-empty hidden>
        <td colSpan={4} className="px-4 py-10 text-center text-sm text-muted-foreground">
          No bugs match this filter.
        </td>
      </tr>
    </>
  )
}

function FeatureRows({
  features,
  bugFilter,
  suggestionFilter,
  canManage
}: {
  features: FeatureSummary[]
  bugFilter: DashboardBugFilter
  suggestionFilter: DashboardSuggestionFilter
  canManage: boolean
}) {
  if (features.length === 0) {
    return (
        <TableRow>
        <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
          No suggestions match this filter.
        </TableCell>
      </TableRow>
    )
  }

  return (
    <>
      {features.map((feature, index) => {
        const toggleAction = feature.status === 'CLOSED' || feature.status === 'SHIPPED' || feature.status === 'DECLINED' ? 'open' : 'resolve'
        const toggleLabel = toggleAction === 'resolve' ? 'Resolve' : 'Reopen'

        return (
          <TableRow
            key={`feature-${feature.id}`}
            data-sort-row
            data-original-index={String(index)}
            data-status={featureStatusLabel(feature.status).toLowerCase()}
            data-upvotes={String(feature.votes_count)}
            data-filter-bucket={featureFilterBucket(feature.status)}
          >
            <TableCell className="w-[54%]">
              <div className="grid max-w-[42rem] gap-2">
                <ItemMetaLink label={`Suggestion #${feature.id}`} href={feature.message_url} />
                <div className="text-[15px] font-semibold leading-6 text-foreground">{feature.description}</div>
              </div>
            </TableCell>
            <TableCell className="w-[16%]">
              <StatusBadge tone={featureStatusTone(feature.status)}>{featureStatusLabel(feature.status)}</StatusBadge>
            </TableCell>
            <TableCell className="w-[10%] text-sm font-semibold text-foreground">{feature.votes_count}</TableCell>
            <TableCell className="w-[20%]">
              {canManage ? (
                <div className="flex flex-wrap justify-end gap-2">
                  <ActionForm
                    kind="suggestion"
                    id={feature.id}
                    action={toggleAction}
                    label={toggleLabel}
                    bugFilter={bugFilter}
                    suggestionFilter={suggestionFilter}
                  />
                  <ActionForm
                    kind="suggestion"
                    id={feature.id}
                    action="delete"
                    label="Delete"
                    bugFilter={bugFilter}
                    suggestionFilter={suggestionFilter}
                    tone="danger"
                  />
                </div>
              ) : (
                <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Read Only</span>
              )}
            </TableCell>
          </TableRow>
        )
      })}
      <tr data-filter-empty hidden>
        <td colSpan={4} className="px-4 py-10 text-center text-sm text-muted-foreground">
          No suggestions match this filter.
        </td>
      </tr>
    </>
  )
}

function DashboardSection({
  icon,
  title,
  tableName,
  currentFilter,
  children
}: {
  icon: ReactNode
  title: string
  tableName: DashboardTable
  currentFilter: DashboardBugFilter | DashboardSuggestionFilter
  children: ReactNode
}) {
  return (
    <section className="rounded-[28px] border border-border/70 bg-card/88 p-5 shadow-[0_24px_70px_rgba(0,0,0,0.32)] backdrop-blur-sm">
      <div
        className="mb-4 flex flex-wrap items-center gap-3"
        data-filter-section={tableName}
        data-initial-filter={currentFilter}
      >
        <div className="mr-1 flex items-center gap-2">
          <span className="inline-flex size-8 items-center justify-center rounded-full border border-border/70 bg-background/70 text-muted-foreground">
            {icon}
          </span>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <FilterButton table={tableName} value="all" label="All" active={currentFilter === 'all'} />
          <FilterButton table={tableName} value="open" label="Open" active={currentFilter === 'open'} />
          <FilterButton table={tableName} value="resolved" label="Resolved" active={currentFilter === 'resolved'} />
        </div>
      </div>
      {children}
    </section>
  )
}

function DashboardDocument({ bugs, features, currentBugFilter, currentSuggestionFilter, canManage = false, authUrl, logoutUrl }: DashboardPageInput) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" type="image/webp" href={dashboardFaviconHref} />
        <title>Daggerbrain Dashboard</title>
        <style dangerouslySetInnerHTML={{ __html: dashboardStyles }} />
      </head>
      <body className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(96,165,250,0.18),transparent_28%),linear-gradient(180deg,#09111a_0%,#070d14_100%)] font-sans text-foreground">
        <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6 xl:px-4">
          <section className="rounded-[28px] border border-border/70 bg-card/88 p-5 shadow-[0_24px_70px_rgba(0,0,0,0.32)] backdrop-blur-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">Daggerbrain Suggestions</h1>
                <p className="text-sm text-muted-foreground">
                  Community bugs and suggestions in one place. Moderator actions require Discord sign-in.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {canManage && logoutUrl ? (
                  <Button asChild variant="secondary" size="sm" className="rounded-full px-4">
                    <a href={logoutUrl}>Moderator Mode</a>
                  </Button>
                ) : authUrl ? (
                  <Button asChild variant="secondary" size="sm" className="rounded-full px-4">
                    <a href={authUrl}>Moderator Sign In</a>
                  </Button>
                ) : (
                  <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Read Only</span>
                )}
              </div>
            </div>
          </section>
          <DashboardSection icon={<Bug className="size-4" />} title="Bugs" tableName="bugs" currentFilter={currentBugFilter}>
            <Table className="min-w-[760px]" data-sort-table="bugs">
              <TableHeader>
                <TableRow className="bg-background/40 hover:bg-background/40">
                  <TableHead>Description</TableHead>
                  <TableHead>
                    <SortHeader table="bugs" column="status" label="Status" />
                  </TableHead>
                  <TableHead>
                    <SortHeader table="bugs" column="upvotes" label="Upvotes" />
                  </TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <BugRows bugs={bugs} bugFilter={currentBugFilter} suggestionFilter={currentSuggestionFilter} canManage={canManage} />
              </TableBody>
            </Table>
          </DashboardSection>

          <DashboardSection
            icon={<MessagesSquare className="size-4" />}
            title="Suggestions"
            tableName="suggestions"
            currentFilter={currentSuggestionFilter}
          >
            <Table className="min-w-[760px]" data-sort-table="suggestions">
              <TableHeader>
                <TableRow className="bg-background/40 hover:bg-background/40">
                  <TableHead>Description</TableHead>
                  <TableHead>
                    <SortHeader table="suggestions" column="status" label="Status" />
                  </TableHead>
                  <TableHead>
                    <SortHeader table="suggestions" column="upvotes" label="Upvotes" />
                  </TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <FeatureRows
                  features={features}
                  bugFilter={currentBugFilter}
                  suggestionFilter={currentSuggestionFilter}
                  canManage={canManage}
                />
              </TableBody>
            </Table>
          </DashboardSection>
        </main>
        <script dangerouslySetInnerHTML={{ __html: dashboardClientScript }} />
      </body>
    </html>
  )
}

export function renderDashboardPage(input: DashboardPageInput): string {
  return `<!doctype html>${renderToStaticMarkup(<DashboardDocument {...input} />)}`
}
