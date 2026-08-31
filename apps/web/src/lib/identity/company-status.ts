import { type CompanyStatus } from '@takeover/shared';
import { type BadgeTone } from '@/components/ui/status-badge';

export type DescribedStatus = { label: string; tone: BadgeTone };

/**
 * Human labels for company lifecycle states.
 *
 * Raw enum values are never rendered: `draft` in particular reads as unfinished
 * work rather than what it means, which is a private company that has not been
 * activated. A suspended company stays named and labelled rather than hidden.
 */
const STATUS: Record<CompanyStatus, DescribedStatus> = {
  draft: { label: 'Private draft', tone: 'warning' },
  active: { label: 'Active', tone: 'positive' },
  suspended: { label: 'Suspended', tone: 'danger' },
  archived: { label: 'Archived', tone: 'neutral' },
};

export function describeCompanyStatus(status: CompanyStatus): DescribedStatus {
  return STATUS[status];
}
