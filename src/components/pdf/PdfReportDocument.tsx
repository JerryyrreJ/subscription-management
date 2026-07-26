import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import type {
 PdfCategoryRow,
 PdfKpi,
 PdfReportData,
 PdfReportMeta,
} from '../../utils/pdfReportData';

/** 未来 30 天列表最多铺 4 行 × 3 列，超出的只在汇总行里计数，避免快照页溢出 A4。 */
const MAX_RENEWAL_ENTRIES = 12;

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

function PageFoot({ meta }: { meta: PdfReportMeta }) {
 return (
  <>
   <div className="pdf-spacer" />
   <div className="pdf-foot">
    <span>{meta.generatedBy}</span>
    <span>{meta.fxNote}</span>
   </div>
  </>
 );
}

/**
 * 快照页（设计稿 1a / 1c —— 同一组件，语言与基准货币由 i18n 和 baseCurrency 决定）。
 */
function SnapshotPage({ data }: PdfReportDocumentProps) {
 const { t } = useTranslation(['analytics']);
 const shownRenewals = data.next30Days.slice(0, MAX_RENEWAL_ENTRIES);
 const hiddenRenewals = data.next30Days.length - shownRenewals.length;

 return (
  <section className="pdf-page">
   <PageHead
    kicker={t('analytics:pdfSnapshotKicker')}
    title={t('analytics:pdfSnapshotTitle')}
    meta={[data.meta.asOf, data.meta.baseCurrencyLine, data.meta.scopeLine]}
   />
   <div className="pdf-rule" />

   <KpiRow items={data.snapshotKpis} />

   <SectionHead
    title={t('analytics:pdfSectionCategories')}
    note={data.categoryHeaderNote}
   />
   <CategoryBars rows={data.categoryRows} showPercentage />

   <SectionHead
    title={t('analytics:pdfSectionSubscriptions')}
    note={t('analytics:pdfSubscriptionsSortNote')}
   />
   <table className="pdf-table">
    <thead>
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
     {data.subscriptionRows.map(row => (
      <tr key={`${row.name}-${row.next}-${row.monthly}`}>
       <td className="pdf-name">{row.name}</td>
       <td className="pdf-dim">{row.category}</td>
       <td className="pdf-num">{row.price}</td>
       <td className="pdf-cycle">{row.cycle}</td>
       <td className="pdf-num pdf-strong">{row.monthly}</td>
       <td className="pdf-num pdf-dim">{row.next}</td>
      </tr>
     ))}
     <tr className="pdf-total-row">
      <td>{t('analytics:pdfTotal')}</td>
      <td>{t('analytics:pdfTotalItems', { count: data.subscriptionRows.length })}</td>
      <td />
      <td className="pdf-cycle" />
      <td className="pdf-num">{data.totalMonthly}</td>
      <td />
     </tr>
    </tbody>
   </table>

   {data.next30Days.length > 0 ? (
    <>
     <div style={{ marginTop: '22px' }}>
      <SectionHead title={t('analytics:pdfSectionNext30')} note={data.next30Summary} />
     </div>
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
    </>
   ) : null}

   <PageFoot meta={data.meta} />
  </section>
 );
}

/**
 * 年度报告第 1 页（设计稿 1b）。
 *
 * 与设计稿的差异：原稿的「年内已支出」和「同比」需要历史账单表，本项目只存当前订阅
 * 快照，无法计算，已按决策替换为可由快照算出的指标（见 pdfReportData.annualKpis）。
 */
function AnnualOverviewPage({ data }: PdfReportDocumentProps) {
 const { t } = useTranslation(['analytics']);

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

   <PageFoot meta={data.meta} />
  </section>
 );
}

/** 年度报告第 2 页：按分类分组的明细表。 */
function AnnualDetailPage({ data }: PdfReportDocumentProps) {
 const { t } = useTranslation(['analytics']);

 return (
  <section className="pdf-page">
   <PageHead
    kicker={t('analytics:pdfAnnualKicker')}
    title={t('analytics:pdfAnnualDetailTitle')}
    titleClassName="pdf-title-sm"
    meta={[data.meta.scopeLine, data.meta.baseCurrencyLine]}
   />
   <div className="pdf-rule" />

   <table className="pdf-table">
    <thead>
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
     {data.categoryGroups.map(group => (
      <Fragment key={group.label}>
       <tr className="pdf-group-row">
        <td>{group.label}</td>
        <td />
        <td className="pdf-cycle" />
        <td className="pdf-num">{group.monthly}</td>
        <td className="pdf-num">{group.yearly}</td>
        <td />
       </tr>
       {group.rows.map(row => (
        <tr className="pdf-group-child" key={`${group.label}-${row.name}-${row.monthly}`}>
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
     <tr className="pdf-total-row">
      <td>{t('analytics:pdfTotal')}</td>
      <td />
      <td className="pdf-cycle" />
      <td className="pdf-num">{data.totalMonthly}</td>
      <td className="pdf-num">{data.totalYearly}</td>
      <td />
     </tr>
    </tbody>
   </table>

   <PageFoot meta={data.meta} />
  </section>
 );
}

export type PdfReportVariant = 'snapshot' | 'annual';

/**
 * 打印文档。屏幕上恒为 display:none（见 print-report.css），只在 window.print() 时出现。
 */
export function PdfReportDocument({
 data,
 variant,
}: PdfReportDocumentProps & { variant: PdfReportVariant }) {
 return (
  <div className="pdf-report">
   {variant === 'snapshot' ? (
    <SnapshotPage data={data} />
   ) : (
    <>
     <AnnualOverviewPage data={data} />
     <AnnualDetailPage data={data} />
    </>
   )}
  </div>
 );
}
