import { Fragment, useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import type {
 PdfCategoryRow,
 PdfKpi,
 PdfReportData,
 PdfReportMeta,
 PdfSubscriptionRow,
} from '../../utils/pdfReportData';
import {
 estimateAnnualDetailHeights,
 estimateSnapshotHeights,
 MAX_RENEWAL_ENTRIES,
 packAnnualDetailPages,
 packSnapshotPages,
 readAnnualDetailHeights,
 readSnapshotHeights,
 type PdfAnnualDetailPage,
 type PdfSnapshotPage,
} from '../../utils/pdfReportPagination';

interface PdfReportDocumentProps {
 data: PdfReportData;
}

function PageHead({
 kicker,
 title,
 titleClassName,
 meta,
}: {
 kicker: string;
 title: string;
 titleClassName?: string;
 meta: string[];
}) {
 return (
  <div className="pdf-head">
   <div>
    <div className="pdf-kicker">{kicker}</div>
    <h1 className={`pdf-title${titleClassName ? ` ${titleClassName}` : ''}`}>{title}</h1>
   </div>
   <div className="pdf-head-meta">
    {meta.map(line => (
     <div key={line}>{line}</div>
    ))}
   </div>
  </div>
 );
}

function KpiRow({ items, large }: { items: PdfKpi[]; large?: boolean }) {
 // 任一金额过长就整行降级字号：单格降级会造成同行字号不一致
 const compact = items.some(item => /\d/.test(item.value) && item.value.length >= 11);

 return (
  <div className={`pdf-kpis${large ? ' pdf-kpis-lg' : ''}${compact ? ' pdf-kpis-compact' : ''}`}>
   {items.map(item => {
    const isText = !/\d/.test(item.value);

    return (
     <div className="pdf-kpi" key={item.label}>
      <div className="pdf-kpi-label">{item.label}</div>
      <div
       className={[
        'pdf-kpi-value',
        isText ? 'pdf-kpi-value-text' : '',
        item.accent ? 'pdf-kpi-value-accent' : '',
       ]
        .filter(Boolean)
        .join(' ')}
      >
       {item.value}
      </div>
      <div className="pdf-kpi-note">{item.note}</div>
     </div>
    );
   })}
  </div>
 );
}

function SectionHead({ title, note }: { title: string; note?: string }) {
 return (
  <div className="pdf-section">
   <div className="pdf-section-title">{title}</div>
   {note ? <div className="pdf-section-note">{note}</div> : null}
  </div>
 );
}

function CategoryBars({ rows, showPercentage }: { rows: PdfCategoryRow[]; showPercentage: boolean }) {
 return (
  <div className="pdf-bars">
   {rows.map((row, index) => (
    <div className="pdf-bar-row" key={row.label}>
     <div className="pdf-bar-label">{row.label}</div>
     <div className="pdf-bar-track">
      <div
       className={`pdf-bar-fill${index >= 4 ? ' pdf-bar-fill-minor' : ''}`}
       style={{ width: `${row.percentage.toFixed(1)}%` }}
      />
     </div>
     <div className="pdf-bar-amount">{row.amount}</div>
     {showPercentage ? <div className="pdf-bar-percentage">{row.percentageLabel}</div> : null}
    </div>
   ))}
  </div>
 );
}

function PageFoot({ meta, pageLabel }: { meta: PdfReportMeta; pageLabel?: string }) {
 return (
  <>
   <div className="pdf-spacer" />
   <div className="pdf-foot">
    <span>{meta.generatedBy}</span>
    {pageLabel ? <span>{pageLabel}</span> : null}
    <span>{meta.fxNote}</span>
   </div>
  </>
 );
}

function pageMeta(
 data: PdfReportData,
 continuation: boolean,
 continuedLabel: string,
 pageLabel: string | undefined
): string[] {
 if (continuation) {
  return [data.meta.asOf, continuedLabel, ...(pageLabel ? [pageLabel] : [])];
 }

 return [data.meta.asOf, data.meta.baseCurrencyLine, data.meta.scopeLine];
}

function SnapshotTable({
 rows,
 totalMonthly,
 showTotal,
 itemCount,
 t,
}: {
 rows: PdfSubscriptionRow[];
 totalMonthly: string;
 showTotal: boolean;
 itemCount: number;
 t: TFunction;
}) {
 return (
  <table className="pdf-table">
   <thead data-pdf="table-head">
    <tr>
     <th>{t('analytics:pdfColService')}</th>
     <th>{t('analytics:pdfColCategory')}</th>
     <th className="pdf-num">{t('analytics:pdfColCharged')}</th>
     <th className="pdf-cycle">{t('analytics:pdfColCycle')}</th>
     <th className="pdf-num">{t('analytics:pdfColMonthly')}</th>
     <th className="pdf-num">{t('analytics:pdfColRenews')}</th>
    </tr>
   </thead>
   <tbody>
    {rows.map(row => (
     <tr data-pdf="row" key={`${row.name}-${row.next}-${row.monthly}`}>
      <td className="pdf-name">{row.name}</td>
      <td className="pdf-dim">{row.category}</td>
      <td className="pdf-num">{row.price}</td>
      <td className="pdf-cycle">{row.cycle}</td>
      <td className="pdf-num pdf-strong">{row.monthly}</td>
      <td className="pdf-num pdf-dim">{row.next}</td>
     </tr>
    ))}
    {showTotal ? (
     <tr className="pdf-total-row" data-pdf="total">
      <td>{t('analytics:pdfTotal')}</td>
      <td>{t('analytics:pdfTotalItems', { count: itemCount })}</td>
      <td />
      <td className="pdf-cycle" />
      <td className="pdf-num">{totalMonthly}</td>
      <td />
     </tr>
    ) : null}
   </tbody>
  </table>
 );
}

function Next30Days({ data }: { data: PdfReportData }) {
 const { t } = useTranslation(['analytics']);
 const shownRenewals = data.next30Days.slice(0, MAX_RENEWAL_ENTRIES);
 const hiddenRenewals = data.next30Days.length - shownRenewals.length;

 if (data.next30Days.length === 0) {
  return null;
 }

 return (
  <div data-pdf="renewals" className="pdf-next30">
   <SectionHead title={t('analytics:pdfSectionNext30')} note={data.next30Summary} />
   <div className="pdf-renewals">
    {shownRenewals.map(entry => (
     <div
      className={`pdf-renewal${entry.isNext ? ' pdf-renewal-next' : ''}`}
      key={`${entry.date}-${entry.name}`}
     >
      <span className="pdf-renewal-date">{entry.date}</span>
      <span className="pdf-renewal-name">{entry.name}</span>
      <span className="pdf-renewal-amount">{entry.amount}</span>
     </div>
    ))}
    {hiddenRenewals > 0 ? (
     <div className="pdf-renewal">
      <span className="pdf-renewal-name pdf-dim">
       {t('analytics:pdfMoreRenewals', { count: hiddenRenewals })}
      </span>
     </div>
    ) : null}
   </div>
  </div>
 );
}

function SnapshotBody({
 data,
 page,
}: {
 data: PdfReportData;
 page?: PdfSnapshotPage;
}) {
 const { t } = useTranslation(['analytics']);
 const showKpis = page?.showKpis ?? true;
 const showCategories = page?.showCategories ?? true;
 const showTable = page?.showTable ?? true;
 const showTotal = page?.showTotal ?? true;
 const showRenewals = page?.showRenewals ?? true;
 const rows = showTable
  ? data.subscriptionRows.slice(page?.rowStart ?? 0, page?.rowEnd ?? data.subscriptionRows.length)
  : [];

 return (
  <>
   {showKpis ? (
    <div data-pdf="kpis">
     <KpiRow items={data.snapshotKpis} />
    </div>
   ) : null}

   {showCategories ? (
    <div data-pdf="categories">
     <SectionHead title={t('analytics:pdfSectionCategories')} note={data.categoryHeaderNote} />
     <CategoryBars rows={data.categoryRows} showPercentage />
    </div>
   ) : null}

   {showTable ? (
    <>
     <div data-pdf="table-section">
      <SectionHead
       title={t('analytics:pdfSectionSubscriptions')}
       note={t('analytics:pdfSubscriptionsSortNote')}
      />
     </div>
     <SnapshotTable
      rows={rows}
      totalMonthly={data.totalMonthly}
      showTotal={showTotal}
      itemCount={data.subscriptionRows.length}
      t={t}
     />
    </>
   ) : null}

   {showRenewals ? <Next30Days data={data} /> : null}
  </>
 );
}

function SnapshotPageView({
 data,
 page,
 pageNumber,
 pageCount,
}: PdfReportDocumentProps & {
 page: PdfSnapshotPage;
 pageNumber: number;
 pageCount: number;
}) {
 const { t } = useTranslation(['analytics']);
 const pageLabel = pageCount > 1 ? t('analytics:pdfPageOf', { current: pageNumber, total: pageCount }) : undefined;

 return (
  <section className="pdf-page">
   <div data-pdf="head">
    <PageHead
     kicker={t('analytics:pdfSnapshotKicker')}
     title={t('analytics:pdfSnapshotTitle')}
     meta={pageMeta(data, page.continuation, t('analytics:pdfContinued'), pageLabel)}
    />
    <div className="pdf-rule" />
   </div>
   <SnapshotBody data={data} page={page} />
   <PageFoot meta={data.meta} pageLabel={pageLabel} />
  </section>
 );
}

function AnnualOverviewPage({
 data,
 pageNumber,
 pageCount,
}: PdfReportDocumentProps & { pageNumber: number; pageCount: number }) {
 const { t } = useTranslation(['analytics']);
 const pageLabel = pageCount > 1 ? t('analytics:pdfPageOf', { current: pageNumber, total: pageCount }) : undefined;

 return (
  <section className="pdf-page">
   <PageHead
    kicker={t('analytics:pdfAnnualKicker')}
    title={t('analytics:pdfAnnualTitle')}
    titleClassName="pdf-title-lg"
    meta={[data.meta.asOf, data.meta.baseCurrencyLine, data.meta.scopeLine]}
   />
   <div className="pdf-rule" />

   <KpiRow items={data.annualKpis} large />

   <SectionHead title={t('analytics:pdfSectionTrend')} note={data.trendNote} />
   <div className="pdf-trend">
    {data.trend.map(point => (
     <div
      className={`pdf-trend-col${point.isCurrent ? ' pdf-trend-col-current' : ''}`}
      key={point.label}
     >
      <div className="pdf-trend-value">{point.valueLabel}</div>
      <div className="pdf-trend-barwrap">
       <div
        className="pdf-trend-bar"
        style={{ height: `${point.heightPercentage.toFixed(1)}%` }}
       />
      </div>
     </div>
    ))}
   </div>
   <div className="pdf-trend-labels">
    {data.trend.map(point => (
     <div key={point.label}>{point.label}</div>
    ))}
   </div>

   <div className="pdf-split">
    <div>
     <SectionHead title={t('analytics:pdfSectionTop5')} />
     <div style={{ paddingTop: '6px' }}>
      {data.topSubscriptions.map(entry => (
       <div className="pdf-rank-row" key={entry.name}>
        <span className="pdf-rank-index">{entry.rank}</span>
        <span className="pdf-rank-name">{entry.name}</span>
        <span className="pdf-rank-amount">{entry.amount}</span>
        <span className="pdf-rank-percentage">{entry.percentageLabel}</span>
       </div>
      ))}
     </div>
    </div>
    <div>
     <SectionHead title={t('analytics:pdfSectionCategories')} />
     <CategoryBars rows={data.categoryRows} showPercentage={false} />
    </div>
   </div>

   <PageFoot meta={data.meta} pageLabel={pageLabel} />
  </section>
 );
}

function AnnualDetailTable({
 data,
 page,
}: {
 data: PdfReportData;
 page?: PdfAnnualDetailPage;
}) {
 const { t } = useTranslation(['analytics']);
 const groups = page
  ? page.groups.map(slice => {
     const group = data.categoryGroups[slice.groupIndex];
     return {
      ...slice,
      label: group.label,
      monthly: group.monthly,
      yearly: group.yearly,
      rows: group.rows.slice(slice.rowStart, slice.rowEnd),
     };
    })
  : data.categoryGroups.map((group, groupIndex) => ({
     groupIndex,
     showHeader: true,
     rowStart: 0,
     rowEnd: group.rows.length,
     label: group.label,
     monthly: group.monthly,
     yearly: group.yearly,
     rows: group.rows,
    }));
 const showTotal = page?.showTotal ?? true;

 return (
  <table className="pdf-table">
   <thead data-pdf="table-head">
    <tr>
     <th>{t('analytics:pdfColCategoryService')}</th>
     <th className="pdf-num">{t('analytics:pdfColCharged')}</th>
     <th className="pdf-cycle">{t('analytics:pdfColCycle')}</th>
     <th className="pdf-num">{t('analytics:pdfColMonthly')}</th>
     <th className="pdf-num">{t('analytics:pdfColYearly')}</th>
     <th className="pdf-num">{t('analytics:pdfColRenews')}</th>
    </tr>
   </thead>
   <tbody>
    {groups.map(group => (
     <Fragment key={`${group.groupIndex}-${group.rowStart}`}>
      {group.showHeader ? (
       <tr className="pdf-group-row" data-pdf="group-header">
        <td>{group.label}</td>
        <td />
        <td className="pdf-cycle" />
        <td className="pdf-num">{group.monthly}</td>
        <td className="pdf-num">{group.yearly}</td>
        <td />
       </tr>
      ) : null}
      {group.rows.map(row => (
       <tr
        className="pdf-group-child"
        data-pdf="group-row"
        key={`${group.label}-${row.name}-${row.monthly}`}
       >
        <td className="pdf-name">{row.name}</td>
        <td className="pdf-num">{row.price}</td>
        <td className="pdf-cycle">{row.cycle}</td>
        <td className="pdf-num pdf-strong">{row.monthly}</td>
        <td className="pdf-num pdf-dim">{row.yearly}</td>
        <td className="pdf-num pdf-dim">{row.next}</td>
       </tr>
      ))}
     </Fragment>
    ))}
    {showTotal ? (
     <tr className="pdf-total-row" data-pdf="total">
      <td>{t('analytics:pdfTotal')}</td>
      <td />
      <td className="pdf-cycle" />
      <td className="pdf-num">{data.totalMonthly}</td>
      <td className="pdf-num">{data.totalYearly}</td>
      <td />
     </tr>
    ) : null}
   </tbody>
  </table>
 );
}

function AnnualDetailPageView({
 data,
 page,
 pageNumber,
 pageCount,
}: PdfReportDocumentProps & {
 page: PdfAnnualDetailPage;
 pageNumber: number;
 pageCount: number;
}) {
 const { t } = useTranslation(['analytics']);
 const pageLabel = pageCount > 1 ? t('analytics:pdfPageOf', { current: pageNumber, total: pageCount }) : undefined;

 return (
  <section className="pdf-page">
   <div data-pdf="head">
    <PageHead
     kicker={t('analytics:pdfAnnualKicker')}
     title={t('analytics:pdfAnnualDetailTitle')}
     titleClassName="pdf-title-sm"
     meta={pageMeta(data, page.continuation, t('analytics:pdfContinued'), pageLabel)}
    />
    <div className="pdf-rule" />
   </div>
   <div data-pdf="table-margin">
    <AnnualDetailTable data={data} page={page} />
   </div>
   <PageFoot meta={data.meta} pageLabel={pageLabel} />
  </section>
 );
}

function MeasureShell({
 rootRef,
 children,
}: {
 rootRef: Ref<HTMLDivElement>;
 children: ReactNode;
}) {
 return (
  <div className="pdf-report-measure" ref={rootRef}>
   <div className="pdf-page-metrics" data-pdf="metrics" />
   <section className="pdf-page pdf-page-measure">{children}</section>
  </div>
 );
}

function SnapshotMeasure({
 data,
 rootRef,
}: PdfReportDocumentProps & { rootRef: Ref<HTMLDivElement> }) {
 const { t } = useTranslation(['analytics']);

 return (
  <MeasureShell rootRef={rootRef}>
   <div data-pdf="head">
    <PageHead
     kicker={t('analytics:pdfSnapshotKicker')}
     title={t('analytics:pdfSnapshotTitle')}
     meta={[data.meta.asOf, data.meta.baseCurrencyLine, data.meta.scopeLine]}
    />
    <div className="pdf-rule" />
   </div>
   <SnapshotBody data={data} />
   <PageFoot meta={data.meta} />
  </MeasureShell>
 );
}

function AnnualDetailMeasure({
 data,
 rootRef,
}: PdfReportDocumentProps & { rootRef: Ref<HTMLDivElement> }) {
 const { t } = useTranslation(['analytics']);

 return (
  <MeasureShell rootRef={rootRef}>
   <div data-pdf="head">
    <PageHead
     kicker={t('analytics:pdfAnnualKicker')}
     title={t('analytics:pdfAnnualDetailTitle')}
     titleClassName="pdf-title-sm"
     meta={[data.meta.scopeLine, data.meta.baseCurrencyLine]}
    />
    <div className="pdf-rule" />
   </div>
   <div data-pdf="table-margin">
    <AnnualDetailTable data={data} />
   </div>
   <PageFoot meta={data.meta} />
  </MeasureShell>
 );
}

export type PdfReportVariant = 'snapshot' | 'annual';

const estimateSnapshotPlan = (data: PdfReportData) =>
 packSnapshotPages(
  estimateSnapshotHeights({
   categoryCount: data.categoryRows.length,
   rowCount: data.subscriptionRows.length,
   renewalCount: data.next30Days.length,
  })
 );

const estimateAnnualDetailPlan = (data: PdfReportData) =>
 packAnnualDetailPages(estimateAnnualDetailHeights(data.categoryGroups.map(group => group.rows.length)));

/**
 * 打印文档。屏幕上在屏外排版（见 print-report.css），只在 window.print() 时进入纸张。
 * 先按 CSS 预算切成固定 A4 页（SSR/首屏就能用），字体就绪后再按实测高度校正。
 */
export function PdfReportDocument({
 data,
 variant,
 onReady,
}: PdfReportDocumentProps & { variant: PdfReportVariant; onReady?: () => void }) {
 const measureRef = useRef<HTMLDivElement>(null);
 const [snapshotPages, setSnapshotPages] = useState<PdfSnapshotPage[]>(() =>
  variant === 'snapshot' ? estimateSnapshotPlan(data) : []
 );
 const [annualDetailPages, setAnnualDetailPages] = useState<PdfAnnualDetailPage[]>(() =>
  variant === 'annual' ? estimateAnnualDetailPlan(data) : []
 );
 const [layoutReady, setLayoutReady] = useState(false);

 useEffect(() => {
  let cancelled = false;
  let planned = false;
  let timeoutId = 0;
  let frameId = 0;

  const plan = () => {
   if (cancelled || planned) {
    return;
   }
   planned = true;
   window.clearTimeout(timeoutId);

   if (variant === 'snapshot') {
    const measured = readSnapshotHeights(measureRef.current);
    const heights =
     measured ??
     estimateSnapshotHeights({
      categoryCount: data.categoryRows.length,
      rowCount: data.subscriptionRows.length,
      renewalCount: data.next30Days.length,
     });
    setSnapshotPages(packSnapshotPages(heights));
   } else {
    const measured = readAnnualDetailHeights(measureRef.current);
    const heights =
     measured ?? estimateAnnualDetailHeights(data.categoryGroups.map(group => group.rows.length));
    setAnnualDetailPages(packAnnualDetailPages(heights));
   }

   setLayoutReady(true);
  };

  const run = async () => {
   try {
    await document.fonts?.ready;
   } catch {
    // 字体接口不可用时直接按系统字体测量
   }

   if (cancelled) {
    return;
   }

   frameId = requestAnimationFrame(plan);
  };

  timeoutId = window.setTimeout(plan, 2000);
  void run();

  return () => {
   cancelled = true;
   window.clearTimeout(timeoutId);
   cancelAnimationFrame(frameId);
  };
 }, [data, variant]);

 useEffect(() => {
  if (!layoutReady) {
   return;
  }

  const frameId = requestAnimationFrame(() => onReady?.());
  return () => cancelAnimationFrame(frameId);
 }, [layoutReady, onReady]);

 const snapshotPageCount = snapshotPages.length;
 const annualPageCount = 1 + annualDetailPages.length;

 return (
  <div className="pdf-report">
   {variant === 'snapshot' ? (
    <>
     <SnapshotMeasure data={data} rootRef={measureRef} />
     {snapshotPages.map((page, index) => (
      <SnapshotPageView
       data={data}
       page={page}
       pageNumber={index + 1}
       pageCount={snapshotPageCount}
       key={`snapshot-${index}`}
      />
     ))}
    </>
   ) : (
    <>
     <AnnualDetailMeasure data={data} rootRef={measureRef} />
     <AnnualOverviewPage data={data} pageNumber={1} pageCount={annualPageCount} />
     {annualDetailPages.map((page, index) => (
      <AnnualDetailPageView
       data={data}
       page={page}
       pageNumber={index + 2}
       pageCount={annualPageCount}
       key={`annual-detail-${index}`}
      />
     ))}
    </>
   )}
  </div>
 );
}
