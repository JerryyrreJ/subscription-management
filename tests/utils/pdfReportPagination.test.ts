import test from 'node:test';
import assert from 'node:assert/strict';
import {
 estimateAnnualDetailHeights,
 estimateSnapshotHeights,
 packAnnualDetailPages,
 packSnapshotPages,
 PDF_PAGE_CONTENT_PX,
 type PdfSnapshotHeights,
} from '../../src/utils/pdfReportPagination.ts';

const usedHeight = (
 heights: PdfSnapshotHeights,
 page: ReturnType<typeof packSnapshotPages>[number]
): number => {
 let used = heights.footer + heights.head + (page.showKpis ? heights.kpis : 0);
 if (page.showCategories) {
  used += heights.categories;
 }
 if (page.showTable) {
  used += heights.tableSection + heights.tableHead;
  used += heights.rows.slice(page.rowStart, page.rowEnd).reduce((sum, row) => sum + row, 0);
  if (page.showTotal) {
   used += heights.total;
  }
 }
 if (page.showRenewals) {
  used += heights.renewals;
 }
 return used;
};

test('demo-sized snapshot keeps the full table on page 1 and paginates next-30-days', () => {
 const heights = estimateSnapshotHeights({
  categoryCount: 6,
  rowCount: 15,
  renewalCount: 13,
 });
 const pages = packSnapshotPages(heights);

 assert.equal(pages.length, 2);
 assert.equal(pages[0].showKpis, true);
 assert.equal(pages[0].showCategories, true);
 assert.equal(pages[0].rowStart, 0);
 assert.equal(pages[0].rowEnd, 15);
 assert.equal(pages[0].showTotal, true);
 assert.equal(pages[0].showRenewals, false);
 assert.equal(pages[1].continuation, true);
 assert.equal(pages[1].showKpis, false);
 assert.equal(pages[1].showRenewals, true);
 assert.equal(pages[1].showTable, false);

 for (const page of pages) {
  assert.ok(usedHeight(heights, page) <= heights.contentHeight + 0.01);
 }
});

test('a tall subscription table continues onto additional A4 pages instead of growing page 1', () => {
 const heights = estimateSnapshotHeights({
  categoryCount: 6,
  rowCount: 40,
  renewalCount: 12,
 });
 const pages = packSnapshotPages(heights);

 assert.ok(pages.length >= 3);
 assert.equal(pages[0].rowStart, 0);
 assert.ok(pages[0].rowEnd < 40);
 assert.equal(pages[0].showTotal, false);
 assert.equal(pages[0].showRenewals, false);

 const last = pages[pages.length - 1];
 assert.equal(pages.some(page => page.showTotal), true);
 assert.equal(last.showRenewals, true);
 assert.equal(
  pages.reduce((count, page) => count + (page.rowEnd - page.rowStart), 0),
  40
 );

 for (const page of pages) {
  assert.ok(
   usedHeight(heights, page) <= heights.contentHeight + 0.01,
   `page overflowed A4: ${usedHeight(heights, page)} > ${heights.contentHeight}`
  );
 }
});

test('an empty snapshot still produces a single A4 page with totals', () => {
 const pages = packSnapshotPages(
  estimateSnapshotHeights({ categoryCount: 0, rowCount: 0, renewalCount: 0 })
 );

 assert.equal(pages.length, 1);
 assert.equal(pages[0].showKpis, true);
 assert.equal(pages[0].showTable, true);
 assert.equal(pages[0].showTotal, true);
 assert.equal(pages[0].showRenewals, false);
});

test('annual detail with many grouped rows paginates inside A4 instead of one tall page', () => {
 const heights = estimateAnnualDetailHeights(Array.from({ length: 8 }, () => 6));
 const pages = packAnnualDetailPages(heights);

 assert.ok(pages.length >= 2);
 assert.equal(pages[0].continuation, false);
 assert.equal(pages[pages.length - 1].showTotal, true);
 assert.equal(
  pages.slice(0, -1).every(page => page.showTotal === false),
  true
 );

 const placedRows = pages.reduce(
  (count, page) => count + page.groups.reduce((inner, group) => inner + (group.rowEnd - group.rowStart), 0),
  0
 );
 assert.equal(placedRows, 48);

 const lastGroupIndexes = pages.flatMap(page => page.groups.map(group => group.groupIndex));
 assert.deepEqual([...new Set(lastGroupIndexes)].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7]);
});

test('estimated page content budget is the A4 frame minus the 14mm/10mm padding', () => {
 assert.ok(Math.abs(PDF_PAGE_CONTENT_PX - ((297 - 24) * 96) / 25.4) < 0.001);
});
