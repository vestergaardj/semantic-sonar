import type { ModelUptimeStats, UptimeWindow } from './types';

// SLA spec — see enhancements/sla_improvements.md
const SLA_TARGET_PERCENT = 99.9;
const CRITICAL_THRESHOLD_PERCENT = 99.4;
const PERIOD_LABEL = 'Last 30 days';
const PERIOD_TOTAL_MINUTES = 30 * 24 * 60; // 43,200

type Severity = 'None' | 'Warning' | 'Critical';
type Status = 'Met' | 'Breached' | 'No data';

interface SlaRow {
  modelName: string;
  tenantName: string;
  uptimePercent: number | null;
  downtimeMinutes: number | null;
  status: Status;
  severity: Severity;
}

function computeRow(s: ModelUptimeStats): SlaRow {
  const w: UptimeWindow = s.last30d;
  if (w.uptimePercent === null || w.totalChecks === 0) {
    return {
      modelName: s.modelName,
      tenantName: s.tenantName,
      uptimePercent: null,
      downtimeMinutes: null,
      status: 'No data',
      severity: 'None',
    };
  }

  const uptime = w.uptimePercent;
  const downtimeMinutes = Math.round(((100 - uptime) / 100) * PERIOD_TOTAL_MINUTES);
  const status: Status = uptime >= SLA_TARGET_PERCENT ? 'Met' : 'Breached';
  let severity: Severity = 'None';
  if (status === 'Breached') {
    severity = uptime < CRITICAL_THRESHOLD_PERCENT ? 'Critical' : 'Warning';
  }

  return {
    modelName: s.modelName,
    tenantName: s.tenantName,
    uptimePercent: uptime,
    downtimeMinutes,
    status,
    severity,
  };
}

function formatPct(v: number | null): string {
  return v === null ? '—' : `${v.toFixed(2)}%`;
}

function buildExecutiveSummary(rows: SlaRow[]): string {
  const evaluated = rows.filter((r) => r.status !== 'No data');
  if (evaluated.length === 0) {
    return 'No availability data was recorded for the selected models in the last 30 days. SLA compliance cannot be evaluated until canary checks have produced results.';
  }
  const met = evaluated.filter((r) => r.status === 'Met').length;
  const breached = evaluated.length - met;
  const compliance = (100 * met) / evaluated.length;
  const critical = evaluated.filter((r) => r.severity === 'Critical').length;
  const warning = evaluated.filter((r) => r.severity === 'Warning').length;
  const totalDowntime = evaluated.reduce((sum, r) => sum + (r.downtimeMinutes ?? 0), 0);

  const headline =
    breached === 0
      ? `All ${evaluated.length} evaluated models met the ${SLA_TARGET_PERCENT}% uptime target over the last 30 days (compliance rate ${compliance.toFixed(1)}%).`
      : `${met} of ${evaluated.length} evaluated models met the ${SLA_TARGET_PERCENT}% uptime target over the last 30 days (compliance rate ${compliance.toFixed(1)}%).`;

  const detail =
    breached === 0
      ? `Total observed downtime across the selection was ${totalDowntime.toLocaleString()} minutes.`
      : `${breached} model${breached === 1 ? '' : 's'} breached SLA — ${critical} critical and ${warning} warning — accounting for ${totalDowntime.toLocaleString()} minutes of downtime.`;

  const recommendation =
    critical > 0
      ? 'Critical breaches should be triaged immediately; review recent canary failures and incident timelines for the affected models.'
      : breached > 0
        ? 'Investigate the warning-level breaches and confirm whether they reflect transient incidents or recurring degradation.'
        : 'Continue monitoring; current trends indicate healthy availability across the selection.';

  return `${headline} ${detail} ${recommendation}`;
}

/**
 * Generate and download an SLA compliance report PDF for the given model uptime stats.
 * Implements the spec in enhancements/sla_improvements.md.
 * Loaded dynamically so jspdf isn't pulled into the initial page bundle.
 */
export async function generateSlaReportPdf(stats: ModelUptimeStats[]): Promise<void> {
  if (stats.length === 0) return;

  const { default: jsPDF } = await import('jspdf');
  const autoTableMod = await import('jspdf-autotable');
  const autoTable = (autoTableMod as { default: (doc: unknown, opts: unknown) => void }).default;

  const rows = stats.map(computeRow);
  const evaluated = rows.filter((r) => r.status !== 'No data');
  const met = evaluated.filter((r) => r.status === 'Met').length;
  const compliance = evaluated.length === 0 ? null : (100 * met) / evaluated.length;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const generatedAt = new Date();

  // ── Header ──────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('SLA Compliance Report', 40, 50);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Generated ${generatedAt.toISOString().replace('T', ' ').slice(0, 19)} UTC`, 40, 68);
  doc.text(`Period: ${PERIOD_LABEL}`, 40, 82);
  doc.text(`SLA target: ${SLA_TARGET_PERCENT}% uptime`, 40, 96);
  doc.text(`Models in report: ${rows.length}`, 40, 110);

  // ── Compliance summary ──────────────────────────────────────────────────
  doc.setTextColor(0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Overall compliance', 40, 138);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  if (compliance === null) {
    doc.text('No evaluable data in the selection.', 40, 154);
  } else {
    doc.text(
      `${met} of ${evaluated.length} models meeting SLA  ·  Compliance rate: ${compliance.toFixed(1)}%`,
      40,
      154,
    );
  }

  // ── Table ───────────────────────────────────────────────────────────────
  const head = [['Model', 'Tenant', 'Uptime %', 'Downtime (mins)', 'Status', 'Severity']];
  const body = rows.map((r) => [
    r.modelName,
    r.tenantName,
    formatPct(r.uptimePercent),
    r.downtimeMinutes === null ? '—' : r.downtimeMinutes.toLocaleString(),
    r.status,
    r.severity === 'None' ? '—' : r.severity,
  ]);

  autoTable(doc, {
    startY: 174,
    head,
    body,
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    columnStyles: {
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'center' },
      5: { halign: 'center' },
    },
    margin: { left: 40, right: 40 },
    didParseCell: (data: {
      section: string;
      column: { index: number };
      row: { index: number };
      cell: { styles: { textColor?: number[]; fontStyle?: string } };
    }) => {
      if (data.section !== 'body') return;
      const row = rows[data.row.index];
      if (!row) return;
      // Status column (index 4)
      if (data.column.index === 4) {
        if (row.status === 'Met') data.cell.styles.textColor = [22, 163, 74];
        else if (row.status === 'Breached') data.cell.styles.textColor = [220, 38, 38];
        data.cell.styles.fontStyle = 'bold';
      }
      // Severity column (index 5)
      if (data.column.index === 5) {
        if (row.severity === 'Critical') {
          data.cell.styles.textColor = [220, 38, 38];
          data.cell.styles.fontStyle = 'bold';
        } else if (row.severity === 'Warning') {
          data.cell.styles.textColor = [202, 138, 4];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
  });

  // ── Executive summary ───────────────────────────────────────────────────
  const finalY =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 200;

  let y = finalY + 28;
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y > pageHeight - 80) {
    doc.addPage();
    y = 50;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(0);
  doc.text('Executive summary', 40, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const summary = buildExecutiveSummary(rows);
  const wrapped = doc.splitTextToSize(summary, doc.internal.pageSize.getWidth() - 80);
  doc.text(wrapped, 40, y + 16);

  const stamp = generatedAt.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  doc.save(`sla-report-${stamp}.pdf`);
}
