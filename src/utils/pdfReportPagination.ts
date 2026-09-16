/**
 * A4 报表分页。
 *
 * 打印页是固定的 210×297mm 盒子（见 print-report.css 的 .pdf-page）。
 * 快照曾经把整张订阅表和「未来 30 天」堆进同一个 min-height: 297mm 的 flex 容器，
 * 内容一高过 A4，盒子就被撑高，打印/截图变成一张自定义长页。
 *
 * 这里按块把内容切进若干页。浏览器里优先用实测高度；没有 DOM（测试、字体未就绪）
 * 时回落到与 print-report.css 对齐的 96dpi 估算。
 */

export const PDF_A4_MM = {
 width: 210,
 height: 297,
 paddingTop: 14,
 paddingBottom: 10,
} as const;

/** CSS `px` 在打印里按 96dpi 换算。样式表混用了 mm 和 px，分页预算必须用同一套。 */
export const PDF_PX_PER_MM = 96 / 25.4;

export const PDF_PAGE_CONTENT_PX =
 (PDF_A4_MM.height - PDF_A4_MM.paddingTop - PDF_A4_MM.paddingBottom) * PDF_PX_PER_MM;

/**
 * 页脚占位：.pdf-spacer min-height 26px + .pdf-foot（上边框 + padding + 一行字）。
 * spacer 是 flex:1，会吃掉页内剩余空间，所以每页都要先扣掉这块。
 */
export const PDF_FOOTER_PX = 52;

/** 与 PdfReportDocument 一致：3 列 × 4 行，多出来的只显示「另有 N 笔」。 */
export const MAX_RENEWAL_ENTRIES = 12;

/**
 * 估算用的块高度。数值来自 print-report.css（padding / line-height / gap），
 * 略偏保守，宁可多一页空白，也不要在 overflow:hidden 的 A4 盒子里裁切。
 */
export const PDF_ESTIMATE_PX = {
 head: 82, // kicker + title + rule（含 rule 的 margin-top）
 kpis: 108,
 sectionHead: 27,
 categoryBarsPad: 36,
 categoryBarRow: 18,
 categoryBarGap: 7,
 tableMargin: 12,
 tableHead: 24,
 tableRow: 32,
 tableTotal: 34,
 groupRow: 34,
 next30Margin: 22,
 renewalsPad: 13,
 renewalRow: 20,
} as const;

export interface PdfSnapshotHeights {
 contentHeight: number;
 footer: number;
 head: number;
 kpis: number;
 categories: number;
 tableSection: number;
 tableHead: number;
 rows: number[];
 total: number;
 renewals: number;
}

export interface PdfSnapshotPage {
 continuation: boolean;
 showKpis: boolean;
 showCategories: boolean;
 showTable: boolean;
 rowStart: number;
 rowEnd: number;
 showTotal: boolean;
 showRenewals: boolean;
}

export interface PdfAnnualDetailHeights {
 contentHeight: number;
 footer: number;
 head: number;
 tableMargin: number;
 tableHead: number;
 /** 每个分类：小标题行高度 + 该分类下订阅行高度 */
 groups: Array<{ header: number; rows: number[] }>;
 total: number;
}

export interface PdfAnnualDetailPage {
 continuation: boolean;
 groups: Array<{
  groupIndex: number;
  showHeader: boolean;
  rowStart: number;
  rowEnd: number;
 }>;
 showTotal: boolean;
}

export const estimateCategoriesPx = (categoryCount: number): number => {
 const bars =
  PDF_ESTIMATE_PX.categoryBarsPad +
  Math.max(0, categoryCount) * PDF_ESTIMATE_PX.categoryBarRow +
  Math.max(0, categoryCount - 1) * PDF_ESTIMATE_PX.categoryBarGap;

 return PDF_ESTIMATE_PX.sectionHead + bars;
};

export const estimateRenewalsPx = (renewalCount: number): number => {
 if (renewalCount <= 0) {
  return 0;
 }

 const shown = Math.min(renewalCount, MAX_RENEWAL_ENTRIES);
 const overflowLine = renewalCount > MAX_RENEWAL_ENTRIES ? 1 : 0;
 const gridRows = Math.ceil((shown + overflowLine) / 3);

 return (
  PDF_ESTIMATE_PX.next30Margin +
  PDF_ESTIMATE_PX.sectionHead +
  PDF_ESTIMATE_PX.renewalsPad +
  gridRows * PDF_ESTIMATE_PX.renewalRow
 );
};

export const estimateSnapshotHeights = (input: {
 categoryCount: number;
 rowCount: number;
 renewalCount: number;
}): PdfSnapshotHeights => ({
 contentHeight: PDF_PAGE_CONTENT_PX,
 footer: PDF_FOOTER_PX,
 head: PDF_ESTIMATE_PX.head,
 kpis: PDF_ESTIMATE_PX.kpis,
 categories: estimateCategoriesPx(input.categoryCount),
 tableSection: PDF_ESTIMATE_PX.sectionHead + PDF_ESTIMATE_PX.tableMargin,
 tableHead: PDF_ESTIMATE_PX.tableHead,
 rows: Array.from({ length: input.rowCount }, () => PDF_ESTIMATE_PX.tableRow),
 total: PDF_ESTIMATE_PX.tableTotal,
 renewals: estimateRenewalsPx(input.renewalCount),
});

export const estimateAnnualDetailHeights = (groupRowCounts: number[]): PdfAnnualDetailHeights => ({
 contentHeight: PDF_PAGE_CONTENT_PX,
 footer: PDF_FOOTER_PX,
 head: PDF_ESTIMATE_PX.head,
 tableMargin: PDF_ESTIMATE_PX.tableMargin,
 tableHead: PDF_ESTIMATE_PX.tableHead,
 groups: groupRowCounts.map(count => ({
  header: PDF_ESTIMATE_PX.groupRow,
  rows: Array.from({ length: count }, () => PDF_ESTIMATE_PX.tableRow),
 })),
 total: PDF_ESTIMATE_PX.tableTotal,
});

const fits = (used: number, extra: number, budget: number): boolean => used + extra <= budget + 0.01;

/**
 * 按文档顺序把快照块装进若干 A4 页。
 * 分类构成整块不拆；订阅表按行拆，表头在有行的页上重复；合计和未来 30 天跟在全部行之后。
 */
export const packSnapshotPages = (heights: PdfSnapshotHeights): PdfSnapshotPage[] => {
 const budget = heights.contentHeight;
 const pages: PdfSnapshotPage[] = [];
 let rowIndex = 0;
 let placedCategories = heights.categories <= 0;
 let placedTotal = false;
 let placedRenewals = heights.renewals <= 0;

 while (pages.length < 50) {
  const continuation = pages.length > 0;
  const page: PdfSnapshotPage = {
   continuation,
   showKpis: !continuation,
   showCategories: false,
   showTable: false,
   rowStart: rowIndex,
   rowEnd: rowIndex,
   showTotal: false,
   showRenewals: false,
  };
  let used = heights.footer + heights.head + (continuation ? 0 : heights.kpis);

  if (!placedCategories && fits(used, heights.categories, budget)) {
   page.showCategories = true;
   placedCategories = true;
   used += heights.categories;
  }

  if (placedCategories) {
   const overhead = heights.tableSection + heights.tableHead;
   const hasRowsLeft = rowIndex < heights.rows.length;

   if (hasRowsLeft && fits(used, overhead + heights.rows[rowIndex], budget)) {
    used += overhead;
    page.showTable = true;
    page.rowStart = rowIndex;

    while (rowIndex < heights.rows.length && fits(used, heights.rows[rowIndex], budget)) {
     used += heights.rows[rowIndex];
     rowIndex += 1;
    }

    page.rowEnd = rowIndex;

    if (rowIndex >= heights.rows.length && fits(used, heights.total, budget)) {
     used += heights.total;
     page.showTotal = true;
     placedTotal = true;
    }
   } else if (!hasRowsLeft && !placedTotal && fits(used, overhead + heights.total, budget)) {
    used += overhead + heights.total;
    page.showTable = true;
    page.showTotal = true;
    placedTotal = true;
   }
  }

  if (placedTotal && !placedRenewals && fits(used, heights.renewals, budget)) {
   page.showRenewals = true;
   placedRenewals = true;
  }

  const placedAnything =
   page.showKpis ||
   page.showCategories ||
   page.showTable ||
   page.showTotal ||
   page.showRenewals;

  if (!placedAnything) {
   if (!placedCategories) {
    page.showCategories = true;
    placedCategories = true;
   } else if (rowIndex < heights.rows.length) {
    page.showTable = true;
    page.rowStart = rowIndex;
    page.rowEnd = rowIndex + 1;
    rowIndex += 1;
   } else if (!placedTotal) {
    page.showTable = true;
    page.showTotal = true;
    placedTotal = true;
   } else if (!placedRenewals) {
    page.showRenewals = true;
    placedRenewals = true;
   } else {
    break;
   }
  }

  pages.push(page);

  if (placedCategories && rowIndex >= heights.rows.length && placedTotal && placedRenewals) {
   break;
  }
 }

 return pages.length > 0
  ? pages
  : [
     {
      continuation: false,
      showKpis: true,
      showCategories: heights.categories > 0,
      showTable: true,
      rowStart: 0,
      rowEnd: 0,
      showTotal: true,
      showRenewals: false,
     },
    ];
};

export const packAnnualDetailPages = (heights: PdfAnnualDetailHeights): PdfAnnualDetailPage[] => {
 const budget = heights.contentHeight;
 const pages: PdfAnnualDetailPage[] = [];
 const groupState = heights.groups.map(() => 0);
 let groupIndex = 0;
 let placedTotal = false;

 while (pages.length < 50) {
  const continuation = pages.length > 0;
  const page: PdfAnnualDetailPage = {
   continuation,
   groups: [],
   showTotal: false,
  };
  let used = heights.footer + heights.head + heights.tableMargin + heights.tableHead;

  while (groupIndex < heights.groups.length) {
   const group = heights.groups[groupIndex];
   const rowCursor = groupState[groupIndex];
   const showHeader = rowCursor === 0;
   const headerPx = showHeader ? group.header : 0;
   const nextRowPx = rowCursor < group.rows.length ? group.rows[rowCursor] : 0;

   if (showHeader && group.rows.length === 0) {
    if (!fits(used, headerPx, budget)) {
     break;
    }
    used += headerPx;
    page.groups.push({
     groupIndex,
     showHeader: true,
     rowStart: 0,
     rowEnd: 0,
    });
    groupIndex += 1;
    continue;
   }

   if (showHeader && !fits(used, headerPx + nextRowPx, budget)) {
    if (page.groups.length === 0 && headerPx + nextRowPx > budget - used) {
     // 空页也放不下「标题+一行」时，先放标题，行去下一页。
     if (fits(used, headerPx, budget)) {
      used += headerPx;
      page.groups.push({
       groupIndex,
       showHeader: true,
       rowStart: 0,
       rowEnd: 0,
      });
      break;
     }
    }
    break;
   }

   if (!showHeader && !fits(used, nextRowPx, budget)) {
    break;
   }

   used += headerPx;
   let rowStart = rowCursor;
   let rowEnd = rowCursor;
   while (rowEnd < group.rows.length && fits(used, group.rows[rowEnd], budget)) {
    used += group.rows[rowEnd];
    rowEnd += 1;
   }

   if (rowEnd === rowStart && !showHeader) {
    break;
   }

   page.groups.push({
    groupIndex,
    showHeader,
    rowStart,
    rowEnd,
   });
   groupState[groupIndex] = rowEnd;
   if (rowEnd >= group.rows.length) {
    groupIndex += 1;
   } else {
    break;
   }
  }

  if (groupIndex >= heights.groups.length && !placedTotal && fits(used, heights.total, budget)) {
   page.showTotal = true;
   placedTotal = true;
  }

  const placedAnything = page.groups.length > 0 || page.showTotal;
  if (!placedAnything) {
   if (groupIndex < heights.groups.length) {
    const group = heights.groups[groupIndex];
    const rowCursor = groupState[groupIndex];
    if (rowCursor === 0) {
     page.groups.push({
      groupIndex,
      showHeader: true,
      rowStart: 0,
      rowEnd: group.rows.length > 0 ? 1 : 0,
     });
     groupState[groupIndex] = group.rows.length > 0 ? 1 : 0;
     if (groupState[groupIndex] >= group.rows.length) {
      groupIndex += 1;
     }
    } else {
     page.groups.push({
      groupIndex,
      showHeader: false,
      rowStart: rowCursor,
      rowEnd: rowCursor + 1,
     });
     groupState[groupIndex] = rowCursor + 1;
     if (groupState[groupIndex] >= group.rows.length) {
      groupIndex += 1;
     }
    }
   } else if (!placedTotal) {
    page.showTotal = true;
    placedTotal = true;
   } else {
    break;
   }
  }

  pages.push(page);

  if (groupIndex >= heights.groups.length && placedTotal) {
   break;
  }
 }

 return pages.length > 0
  ? pages
  : [{ continuation: false, groups: [], showTotal: true }];
};

const outerHeight = (element: Element | null): number => {
 if (!(element instanceof HTMLElement)) {
  return 0;
 }

 const rect = element.getBoundingClientRect();
 const styles = getComputedStyle(element);
 return (
  rect.height +
  (Number.parseFloat(styles.marginTop) || 0) +
  (Number.parseFloat(styles.marginBottom) || 0)
 );
};

const readContentHeight = (page: Element | null): number => {
 if (!(page instanceof HTMLElement)) {
  return 0;
 }

 const styles = getComputedStyle(page);
 return (
  page.clientHeight -
  (Number.parseFloat(styles.paddingTop) || 0) -
  (Number.parseFloat(styles.paddingBottom) || 0)
 );
};

export const readSnapshotHeights = (root: HTMLElement | null): PdfSnapshotHeights | null => {
 if (!root) {
  return null;
 }

 const contentHeight = readContentHeight(root.querySelector('[data-pdf="metrics"]'));
 if (contentHeight < 200) {
  return null;
 }

 const rows = [...root.querySelectorAll('[data-pdf="row"]')].map(element => outerHeight(element));

 return {
  contentHeight,
  footer: PDF_FOOTER_PX,
  head: outerHeight(root.querySelector('[data-pdf="head"]')),
  kpis: outerHeight(root.querySelector('[data-pdf="kpis"]')),
  categories: outerHeight(root.querySelector('[data-pdf="categories"]')),
 tableSection:
  outerHeight(root.querySelector('[data-pdf="table-section"]')) + PDF_ESTIMATE_PX.tableMargin,
 tableHead: outerHeight(root.querySelector('[data-pdf="table-head"]')),
  rows,
  total: outerHeight(root.querySelector('[data-pdf="total"]')),
  renewals: outerHeight(root.querySelector('[data-pdf="renewals"]')),
 };
};

export const readAnnualDetailHeights = (root: HTMLElement | null): PdfAnnualDetailHeights | null => {
 if (!root) {
  return null;
 }

 const contentHeight = readContentHeight(root.querySelector('[data-pdf="metrics"]'));
 if (contentHeight < 200) {
  return null;
 }

 const groups: Array<{ header: number; rows: number[] }> = [];
 for (const element of root.querySelectorAll('[data-pdf="group-header"], [data-pdf="group-row"]')) {
  if (element.getAttribute('data-pdf') === 'group-header') {
   groups.push({ header: outerHeight(element), rows: [] });
   continue;
  }

  const current = groups[groups.length - 1];
  if (current) {
   current.rows.push(outerHeight(element));
  }
 }

 return {
  contentHeight,
  footer: PDF_FOOTER_PX,
  head: outerHeight(root.querySelector('[data-pdf="head"]')),
  tableMargin: PDF_ESTIMATE_PX.tableMargin,
  tableHead: outerHeight(root.querySelector('[data-pdf="table-head"]')),
  groups,
  total: outerHeight(root.querySelector('[data-pdf="total"]')),
 };
};
