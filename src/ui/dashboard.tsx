import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ArrowUp, Bell, Bug, Lightbulb, LogIn, LogOut, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import type { BugStatus, BugSummary, FeatureStatus, FeatureSummary } from '@/types'
import { dashboardFaviconHref, dashboardStyles } from './generated-assets'

type DashboardBugFilter = 'all' | 'open' | 'resolved'
type DashboardSuggestionFilter = 'all' | 'open' | 'resolved'
type DashboardItemKind = 'bug' | 'suggestion'
type DashboardBug = BugSummary & { viewer_is_following?: boolean }
type DashboardFeature = FeatureSummary & { viewer_is_following?: boolean }

interface DashboardPageInput {
  bugs: DashboardBug[]
  features: DashboardFeature[]
  currentBugFilter: DashboardBugFilter
  currentSuggestionFilter: DashboardSuggestionFilter
  isAuthenticated?: boolean
  canManage?: boolean
  authUrl?: string | null
  logoutUrl?: string | null
}

const dashboardClientScript = String.raw`
(() => {
  const getSortDatasetKey = (key) => 'sort' + key.charAt(0).toUpperCase() + key.slice(1);
  const compareRows = (leftRow, rightRow, key, type, direction) => {
    const datasetKey = getSortDatasetKey(key);
    const leftValue = leftRow.dataset[datasetKey] ?? '';
    const rightValue = rightRow.dataset[datasetKey] ?? '';

    let result = 0;

    if (type === 'number') {
      result = Number(leftValue) - Number(rightValue);
    } else {
      result = leftValue.localeCompare(rightValue, undefined, { sensitivity: 'base' });
    }

    if (result === 0 && key !== 'key') {
      result =
        Number(leftRow.dataset.sortKey ?? 0) - Number(rightRow.dataset.sortKey ?? 0);
    }

    return direction === 'asc' ? result : result * -1;
  };

  const tabGroups = Array.from(document.querySelectorAll('[data-dashboard-tabs]'));

  for (const group of tabGroups) {
    const triggers = Array.from(group.querySelectorAll('[data-dashboard-tab]'));
    const panels = Array.from(group.querySelectorAll('[data-dashboard-panel]'));

    const setActiveTab = (value) => {
      for (const trigger of triggers) {
        const active = trigger.getAttribute('data-dashboard-tab') === value;
        trigger.setAttribute('data-state', active ? 'active' : 'inactive');
        trigger.setAttribute('aria-selected', active ? 'true' : 'false');
        trigger.tabIndex = active ? 0 : -1;
      }

      for (const panel of panels) {
        const active = panel.getAttribute('data-dashboard-panel') === value;
        panel.hidden = !active;
        panel.setAttribute('data-state', active ? 'active' : 'inactive');
      }
    };

    for (const trigger of triggers) {
      trigger.addEventListener('click', () => {
        const value = trigger.getAttribute('data-dashboard-tab');
        if (value) {
          setActiveTab(value);
        }
      });
    }

    const initialValue =
      triggers.find((trigger) => trigger.getAttribute('data-state') === 'active')?.getAttribute('data-dashboard-tab') ||
      triggers[0]?.getAttribute('data-dashboard-tab');

    if (initialValue) {
      setActiveTab(initialValue);
    }
  }

  const sortableTables = Array.from(document.querySelectorAll('[data-sortable-table]'));

  for (const table of sortableTables) {
    const body = table.querySelector('tbody');
    const sortButtons = Array.from(table.querySelectorAll('[data-sort-trigger]'));

    if (!body || sortButtons.length === 0) {
      continue;
    }

    let activeKey = null;
    let activeDirection = null;

    const updateIndicators = () => {
      for (const button of sortButtons) {
        const isActive = button.dataset.sortKey === activeKey;
        const header = button.closest('[data-sort-head]');
        const indicator = button.querySelector('[data-sort-indicator]');

        if (header) {
          header.setAttribute(
            'aria-sort',
            isActive ? (activeDirection === 'asc' ? 'ascending' : 'descending') : 'none'
          );
        }

        if (indicator) {
          indicator.textContent = isActive ? (activeDirection === 'asc' ? '↑' : '↓') : '↕';
        }
      }
    };

    const sortRows = (key, type, direction) => {
      const rows = Array.from(body.querySelectorAll('tr[data-sort-row="true"]'));

      rows.sort((leftRow, rightRow) => compareRows(leftRow, rightRow, key, type, direction));

      for (const row of rows) {
        body.appendChild(row);
      }

      activeKey = key;
      activeDirection = direction;
      updateIndicators();
    };

    for (const button of sortButtons) {
      button.addEventListener('click', () => {
        const key = button.dataset.sortKey;
        const type = button.dataset.sortType === 'number' ? 'number' : 'string';
        const defaultDirection = button.dataset.sortDefaultDirection === 'desc' ? 'desc' : 'asc';

        if (!key) {
          return;
        }

        const nextDirection =
          activeKey === key ? (activeDirection === 'asc' ? 'desc' : 'asc') : defaultDirection;

        sortRows(key, type, nextDirection);
      });
    }

    updateIndicators();
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

function bugStatusBadgeClass(status: BugStatus): string {
  if (status === 'ACKNOWLEDGED') return 'border-amber-500/30 bg-amber-500/10 text-amber-100'
  if (status === 'IN_PROGRESS') return 'border-yellow-500/30 bg-yellow-500/10 text-yellow-100'
  if (status === 'FIXED') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
  if (status === 'DUPLICATE') return 'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-100'
  if (status === 'CLOSED') return 'border-slate-400/30 bg-slate-400/10 text-slate-200'
  return 'border-rose-500/30 bg-rose-500/10 text-rose-100'
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

function featureStatusBadgeClass(status: FeatureStatus): string {
  if (status === 'UNDER_REVIEW') return 'border-amber-500/30 bg-amber-500/10 text-amber-100'
  if (status === 'PLANNED') return 'border-blue-500/30 bg-blue-500/10 text-blue-100'
  if (status === 'IN_PROGRESS') return 'border-yellow-500/30 bg-yellow-500/10 text-yellow-100'
  if (status === 'SHIPPED' || status === 'CLOSED') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
  if (status === 'DECLINED') return 'border-slate-400/30 bg-slate-400/10 text-slate-200'
  return 'border-sky-500/30 bg-sky-500/10 text-sky-100'
}

function formatCount(value: number | undefined): string {
  return Number(value ?? 0).toLocaleString()
}

function sortTextValue(value: string | null | undefined): string {
  return (value ?? '').trim().toLocaleLowerCase()
}

function bugStatusOrder(status: BugStatus): number {
  if (status === 'OPEN') return 1
  if (status === 'ACKNOWLEDGED') return 2
  if (status === 'IN_PROGRESS') return 3
  if (status === 'FIXED') return 4
  if (status === 'DUPLICATE') return 5
  return 6
}

function featureStatusOrder(status: FeatureStatus): number {
  if (status === 'OPEN') return 1
  if (status === 'UNDER_REVIEW') return 2
  if (status === 'PLANNED') return 3
  if (status === 'IN_PROGRESS') return 4
  if (status === 'SHIPPED') return 5
  if (status === 'DECLINED') return 6
  return 7
}

function StatusBadge({ label, className }: { label: string; className: string }) {
  return (
    <Badge
      variant="outline"
      className={cn('min-w-[7.5rem] justify-center rounded-full px-3 py-1 text-xs font-medium', className)}
    >
      {label}
    </Badge>
  )
}

function MetricButtonContent({ icon, count, label }: { icon: ReactNode; count: number; label: string }) {
  return (
    <>
      {icon}
      <span>{formatCount(count)}</span>
      <span className="sr-only">{label}</span>
    </>
  )
}

function ActionButton({
  children,
  active = false,
  disabled = false
}: {
  children: ReactNode
  active?: boolean
  disabled?: boolean
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? 'default' : 'outline'}
      disabled={disabled}
      className={cn('min-w-[5.5rem] justify-center', active && 'shadow-sm')}
    >
      {children}
    </Button>
  )
}

function ActionForm({
  kind,
  id,
  action,
  bugFilter,
  suggestionFilter,
  active = false,
  children
}: {
  kind: DashboardItemKind
  id: number
  action: 'upvote' | 'follow'
  bugFilter: DashboardBugFilter
  suggestionFilter: DashboardSuggestionFilter
  active?: boolean
  children: ReactNode
}) {
  return (
    <form method="post" action="/dashboard/actions">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={String(id)} />
      <input type="hidden" name="action" value={action} />
      <input type="hidden" name="bugStatus" value={bugFilter} />
      <input type="hidden" name="suggestionStatus" value={suggestionFilter} />
      <Button type="submit" size="sm" variant={active ? 'default' : 'outline'} className="min-w-[5.5rem] justify-center">
        {children}
      </Button>
    </form>
  )
}

function ActionLink({
  href,
  children,
  active = false
}: {
  href: string
  children: ReactNode
  active?: boolean
}) {
  return (
    <Button asChild type="button" size="sm" variant={active ? 'default' : 'outline'} className="min-w-[5.5rem] justify-center">
      <a href={href}>{children}</a>
    </Button>
  )
}

function DashboardMetricAction({
  kind,
  id,
  action,
  count,
  icon,
  srLabel,
  bugFilter,
  suggestionFilter,
  isAuthenticated = false,
  authUrl,
  active = false
}: {
  kind: DashboardItemKind
  id: number
  action: 'upvote' | 'follow'
  count: number
  icon: ReactNode
  srLabel: string
  bugFilter: DashboardBugFilter
  suggestionFilter: DashboardSuggestionFilter
  isAuthenticated?: boolean
  authUrl?: string | null
  active?: boolean
}) {
  const content = <MetricButtonContent icon={icon} count={count} label={srLabel} />

  if (isAuthenticated) {
    return (
      <ActionForm
        kind={kind}
        id={id}
        action={action}
        bugFilter={bugFilter}
        suggestionFilter={suggestionFilter}
        active={active}
      >
        {content}
      </ActionForm>
    )
  }

  if (authUrl) {
    return (
      <ActionLink href={authUrl} active={active}>
        {content}
      </ActionLink>
    )
  }

  return <ActionButton active={active} disabled>{content}</ActionButton>
}

function ItemTitle({ title, href }: { title: string; href?: string | null }) {
  if (!href) {
    return <span className="font-medium text-foreground">{title}</span>
  }

  return (
    <a href={href} target="_blank" rel="noreferrer" className="font-medium text-foreground hover:underline">
      {title}
    </a>
  )
}

function ManageLink({ href }: { href: string }) {
  return (
    <Button asChild variant="link" size="sm" className="h-auto p-0 text-xs text-muted-foreground">
      <a href={href} target="_blank" rel="noreferrer">
        Manage
      </a>
    </Button>
  )
}

function SortableTableHead({
  label,
  sortKey,
  sortType = 'string',
  defaultDirection = 'asc',
  className,
  centered = false
}: {
  label: string
  sortKey: 'key' | 'status' | 'description' | 'upvotes' | 'follows'
  sortType?: 'string' | 'number'
  defaultDirection?: 'asc' | 'desc'
  className?: string
  centered?: boolean
}) {
  return (
    <TableHead className={className} aria-sort="none" data-sort-head>
      <button
        type="button"
        data-sort-trigger
        data-sort-key={sortKey}
        data-sort-type={sortType}
        data-sort-default-direction={defaultDirection}
        className={cn(
          'inline-flex w-full items-center gap-2 rounded-sm py-1 text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
          centered && 'justify-center'
        )}
      >
        <span>{label}</span>
        <span aria-hidden="true" data-sort-indicator className="text-[10px] leading-none">
          ↕
        </span>
      </button>
    </TableHead>
  )
}

function DashboardAuthControls({
  isAuthenticated = false,
  canManage = false,
  authUrl,
  logoutUrl
}: {
  isAuthenticated?: boolean
  canManage?: boolean
  authUrl?: string | null
  logoutUrl?: string | null
}) {
  return (
    <div className="flex items-center gap-2">
      {isAuthenticated ? (
        <>
          <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs font-medium">
            {canManage ? (
              <>
                <ShieldCheck className="size-3.5" />
                Moderator
              </>
            ) : (
              'Signed In'
            )}
          </Badge>
          {logoutUrl ? (
            <Button asChild variant="outline" size="sm">
              <a href={logoutUrl}>
                <LogOut className="size-4" />
                Sign Out
              </a>
            </Button>
          ) : null}
        </>
      ) : authUrl ? (
        <Button asChild size="sm">
          <a href={authUrl}>
            <LogIn className="size-4" />
            Sign In with Discord
          </a>
        </Button>
      ) : (
        <Badge variant="outline" className="rounded-full px-3 py-1 text-xs font-medium text-muted-foreground">
          Read Only
        </Badge>
      )}
    </div>
  )
}

function BugsTable({
  bugs,
  currentBugFilter,
  currentSuggestionFilter,
  isAuthenticated,
  canManage,
  authUrl
}: {
  bugs: DashboardBug[]
  currentBugFilter: DashboardBugFilter
  currentSuggestionFilter: DashboardSuggestionFilter
  isAuthenticated?: boolean
  canManage?: boolean
  authUrl?: string | null
}) {
  if (bugs.length === 0) {
    return (
      <Table data-sortable-table>
        <TableHeader>
          <TableRow>
            <SortableTableHead label="Key" sortKey="key" sortType="number" className="w-[8rem]" />
            <SortableTableHead label="Status" sortKey="status" sortType="number" className="w-[10rem]" />
            <SortableTableHead label="Description" sortKey="description" className="min-w-[18rem]" />
            <SortableTableHead
              label="Upvotes"
              sortKey="upvotes"
              sortType="number"
              defaultDirection="desc"
              className="w-[8rem]"
              centered
            />
            <SortableTableHead
              label="Follows"
              sortKey="follows"
              sortType="number"
              defaultDirection="desc"
              className="w-[8rem]"
              centered
            />
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
              No bugs yet.
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    )
  }

  return (
    <Table data-sortable-table>
      <TableHeader>
        <TableRow>
          <SortableTableHead label="Key" sortKey="key" sortType="number" className="w-[8rem]" />
          <SortableTableHead label="Status" sortKey="status" sortType="number" className="w-[10rem]" />
          <SortableTableHead label="Description" sortKey="description" className="min-w-[18rem]" />
          <SortableTableHead
            label="Upvotes"
            sortKey="upvotes"
            sortType="number"
            defaultDirection="desc"
            className="w-[8rem]"
            centered
          />
          <SortableTableHead
            label="Follows"
            sortKey="follows"
            sortType="number"
            defaultDirection="desc"
            className="w-[8rem]"
            centered
          />
        </TableRow>
      </TableHeader>
      <TableBody>
        {bugs.map((bug) => (
          <TableRow
            key={`bug-${bug.id}`}
            data-sort-row="true"
            data-sort-key={String(bug.id)}
            data-sort-status={String(bugStatusOrder(bug.status))}
            data-sort-description={sortTextValue(bug.title)}
            data-sort-upvotes={String(bug.votes_count)}
            data-sort-follows={String(bug.follower_count ?? 0)}
          >
            <TableCell className="align-top text-sm font-semibold text-foreground whitespace-nowrap">𖢥 #{bug.id}</TableCell>
            <TableCell className="align-top">
              <StatusBadge label={bugStatusLabel(bug.status)} className={bugStatusBadgeClass(bug.status)} />
            </TableCell>
            <TableCell className="align-top whitespace-normal">
              <div className="space-y-1.5">
                <ItemTitle title={bug.title} href={bug.message_url} />
                {(bug.status_note || (canManage && bug.message_url)) ? (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {bug.status_note ? <span>Note: {bug.status_note}</span> : null}
                    {canManage && bug.message_url ? <ManageLink href={bug.message_url} /> : null}
                  </div>
                ) : null}
              </div>
            </TableCell>
            <TableCell className="text-center align-top">
              <div className="flex justify-center">
                <DashboardMetricAction
                  kind="bug"
                  id={bug.id}
                  action="upvote"
                  count={bug.votes_count}
                  icon={<ArrowUp className="size-3.5" />}
                  srLabel={`Upvote bug ${bug.id}`}
                  bugFilter={currentBugFilter}
                  suggestionFilter={currentSuggestionFilter}
                  isAuthenticated={isAuthenticated}
                  authUrl={authUrl}
                />
              </div>
            </TableCell>
            <TableCell className="text-center align-top">
              <div className="flex justify-center">
                <DashboardMetricAction
                  kind="bug"
                  id={bug.id}
                  action="follow"
                  count={bug.follower_count ?? 0}
                  icon={<Bell className="size-3.5" />}
                  srLabel={`Follow bug ${bug.id}`}
                  bugFilter={currentBugFilter}
                  suggestionFilter={currentSuggestionFilter}
                  isAuthenticated={isAuthenticated}
                  authUrl={authUrl}
                  active={Boolean(bug.viewer_is_following)}
                />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function SuggestionsTable({
  features,
  currentBugFilter,
  currentSuggestionFilter,
  isAuthenticated,
  canManage,
  authUrl
}: {
  features: DashboardFeature[]
  currentBugFilter: DashboardBugFilter
  currentSuggestionFilter: DashboardSuggestionFilter
  isAuthenticated?: boolean
  canManage?: boolean
  authUrl?: string | null
}) {
  if (features.length === 0) {
    return (
      <Table data-sortable-table>
        <TableHeader>
          <TableRow>
            <SortableTableHead label="Key" sortKey="key" sortType="number" className="w-[8rem]" />
            <SortableTableHead label="Status" sortKey="status" sortType="number" className="w-[10rem]" />
            <SortableTableHead label="Description" sortKey="description" className="min-w-[18rem]" />
            <SortableTableHead
              label="Upvotes"
              sortKey="upvotes"
              sortType="number"
              defaultDirection="desc"
              className="w-[8rem]"
              centered
            />
            <SortableTableHead
              label="Follows"
              sortKey="follows"
              sortType="number"
              defaultDirection="desc"
              className="w-[8rem]"
              centered
            />
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
              No suggestions yet.
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    )
  }

  return (
    <Table data-sortable-table>
      <TableHeader>
        <TableRow>
          <SortableTableHead label="Key" sortKey="key" sortType="number" className="w-[8rem]" />
          <SortableTableHead label="Status" sortKey="status" sortType="number" className="w-[10rem]" />
          <SortableTableHead label="Description" sortKey="description" className="min-w-[18rem]" />
          <SortableTableHead
            label="Upvotes"
            sortKey="upvotes"
            sortType="number"
            defaultDirection="desc"
            className="w-[8rem]"
            centered
          />
          <SortableTableHead
            label="Follows"
            sortKey="follows"
            sortType="number"
            defaultDirection="desc"
            className="w-[8rem]"
            centered
          />
        </TableRow>
      </TableHeader>
      <TableBody>
        {features.map((feature) => (
          <TableRow
            key={`feature-${feature.id}`}
            data-sort-row="true"
            data-sort-key={String(feature.id)}
            data-sort-status={String(featureStatusOrder(feature.status))}
            data-sort-description={sortTextValue(feature.title)}
            data-sort-upvotes={String(feature.votes_count)}
            data-sort-follows={String(feature.follower_count ?? 0)}
          >
            <TableCell className="align-top text-sm font-semibold text-foreground whitespace-nowrap">𖢥 #{feature.id}</TableCell>
            <TableCell className="align-top">
              <StatusBadge label={featureStatusLabel(feature.status)} className={featureStatusBadgeClass(feature.status)} />
            </TableCell>
            <TableCell className="align-top whitespace-normal">
              <div className="space-y-1.5">
                <ItemTitle title={feature.title} href={feature.message_url} />
                {(feature.status_note || (canManage && feature.message_url)) ? (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {feature.status_note ? <span>Note: {feature.status_note}</span> : null}
                    {canManage && feature.message_url ? <ManageLink href={feature.message_url} /> : null}
                  </div>
                ) : null}
              </div>
            </TableCell>
            <TableCell className="text-center align-top">
              <div className="flex justify-center">
                <DashboardMetricAction
                  kind="suggestion"
                  id={feature.id}
                  action="upvote"
                  count={feature.votes_count}
                  icon={<ArrowUp className="size-3.5" />}
                  srLabel={`Upvote suggestion ${feature.id}`}
                  bugFilter={currentBugFilter}
                  suggestionFilter={currentSuggestionFilter}
                  isAuthenticated={isAuthenticated}
                  authUrl={authUrl}
                />
              </div>
            </TableCell>
            <TableCell className="text-center align-top">
              <div className="flex justify-center">
                <DashboardMetricAction
                  kind="suggestion"
                  id={feature.id}
                  action="follow"
                  count={feature.follower_count ?? 0}
                  icon={<Bell className="size-3.5" />}
                  srLabel={`Follow suggestion ${feature.id}`}
                  bugFilter={currentBugFilter}
                  suggestionFilter={currentSuggestionFilter}
                  isAuthenticated={isAuthenticated}
                  authUrl={authUrl}
                  active={Boolean(feature.viewer_is_following)}
                />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function DashboardDocument({
  bugs,
  features,
  currentBugFilter,
  currentSuggestionFilter,
  isAuthenticated = false,
  canManage = false,
  authUrl,
  logoutUrl
}: DashboardPageInput) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" type="image/webp" href={dashboardFaviconHref} />
        <title>Daggerbrain Feedback</title>
        <style dangerouslySetInnerHTML={{ __html: dashboardStyles }} />
      </head>
      <body className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(103,232,249,0.14),transparent_28%),linear-gradient(180deg,#081018_0%,#0b1320_100%)] text-foreground">
        <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
          <Tabs defaultValue="bugs" className="gap-4" data-dashboard-tabs>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <TabsList variant="line" className="w-full justify-start sm:w-auto">
                <TabsTrigger value="bugs" data-dashboard-tab="bugs">
                  <Bug className="size-4" />
                  Bugs ({formatCount(bugs.length)})
                </TabsTrigger>
                <TabsTrigger value="suggestions" data-dashboard-tab="suggestions">
                  <Lightbulb className="size-4" />
                  Suggestions ({formatCount(features.length)})
                </TabsTrigger>
              </TabsList>
              <DashboardAuthControls
                isAuthenticated={isAuthenticated}
                canManage={canManage}
                authUrl={authUrl}
                logoutUrl={logoutUrl}
              />
            </div>

            <TabsContent value="bugs" forceMount data-dashboard-panel="bugs">
              <Card className="gap-0 overflow-hidden border-border/70 bg-card/95 py-0 shadow-sm">
                <BugsTable
                  bugs={bugs}
                  currentBugFilter={currentBugFilter}
                  currentSuggestionFilter={currentSuggestionFilter}
                  isAuthenticated={isAuthenticated}
                  canManage={canManage}
                  authUrl={authUrl}
                />
              </Card>
            </TabsContent>

            <TabsContent value="suggestions" forceMount data-dashboard-panel="suggestions">
              <Card className="gap-0 overflow-hidden border-border/70 bg-card/95 py-0 shadow-sm">
                <SuggestionsTable
                  features={features}
                  currentBugFilter={currentBugFilter}
                  currentSuggestionFilter={currentSuggestionFilter}
                  isAuthenticated={isAuthenticated}
                  canManage={canManage}
                  authUrl={authUrl}
                />
              </Card>
            </TabsContent>
          </Tabs>
        </main>
        <script dangerouslySetInnerHTML={{ __html: dashboardClientScript }} />
      </body>
    </html>
  )
}

export function renderDashboardPage(input: DashboardPageInput): string {
  return `<!doctype html>${renderToStaticMarkup(<DashboardDocument {...input} />)}`
}
